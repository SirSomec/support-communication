import { InMemoryStore } from "@support-communication/database";
export const BOT_SCENARIO_RETENTION_DAYS = 30;
let defaultRepository = null;
function hasAsyncAutomationPort(port) {
    return typeof port.readStateAsync === "function";
}
export class AutomationRepository {
    store;
    adapter;
    constructor(store, adapter) {
        this.store = store;
        this.adapter = adapter;
    }
    static default() {
        if (defaultRepository) {
            return defaultRepository;
        }
        return AutomationRepository.inMemory();
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static clearDefault() {
        defaultRepository = null;
    }
    static inMemory(seed = createEmptyAutomationState()) {
        return new AutomationRepository(new InMemoryStore(seed));
    }
    static prisma({ client, fallback }) {
        return new AutomationRepository(new InMemoryStore(createEmptyAutomationState()), new PrismaAutomationRepository(client, fallback ?? AutomationRepository.inMemory()));
    }
    async listDueBotRuntimeRetriesAsync(now, limit) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter))
            return this.adapter.listDueBotRuntimeRetriesAsync(now, limit);
        return this.listDueBotRuntimeRetries(now, limit);
    }
    listDueBotRuntimeRetries(now, limit) {
        if (this.adapter)
            return this.adapter.listDueBotRuntimeRetries(now, limit);
        const at = new Date(now).getTime();
        return clone(this.readState().botRuntimeInstances
            .filter((instance) => instance.status === "retry_scheduled" && instance.nextAttemptAt !== null && new Date(instance.nextAttemptAt).getTime() <= at)
            .sort((left, right) => String(left.nextAttemptAt).localeCompare(String(right.nextAttemptAt)) || left.id.localeCompare(right.id))
            .slice(0, Math.max(1, limit)));
    }
    async claimBotRuntimeRetryAsync(id, expectedAttempts, now, leaseUntil) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter))
            return this.adapter.claimBotRuntimeRetryAsync(id, expectedAttempts, now, leaseUntil);
        return this.claimBotRuntimeRetry(id, expectedAttempts, now, leaseUntil);
    }
    claimBotRuntimeRetry(id, expectedAttempts, now, leaseUntil) {
        if (this.adapter)
            return this.adapter.claimBotRuntimeRetry(id, expectedAttempts, now, leaseUntil);
        let claimed;
        this.store.update((raw) => {
            const state = normalizeState(raw);
            const at = new Date(now).getTime();
            const current = state.botRuntimeInstances.find((item) => item.id === id);
            if (!current || current.status !== "retry_scheduled" || current.attempts !== expectedAttempts || !current.nextAttemptAt || new Date(current.nextAttemptAt).getTime() > at)
                return state;
            claimed = { ...current, nextAttemptAt: leaseUntil, updatedAt: now };
            return { ...state, botRuntimeInstances: state.botRuntimeInstances.map((item) => item.id === id ? claimed : item) };
        });
        return clone(claimed);
    }
    async findLatestBotRuntimeStepAsync(runtimeId) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter))
            return this.adapter.findLatestBotRuntimeStepAsync(runtimeId);
        return this.findLatestBotRuntimeStep(runtimeId);
    }
    findLatestBotRuntimeStep(runtimeId) {
        if (this.adapter)
            return this.adapter.findLatestBotRuntimeStep(runtimeId);
        return clone(this.readState().botRuntimeSteps
            .filter((step) => step.runtimeId === runtimeId)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))[0]);
    }
    async listDueBotRuntimeSideEffectsAsync(now, limit) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter))
            return this.adapter.listDueBotRuntimeSideEffectsAsync(now, limit);
        return this.listDueBotRuntimeSideEffects(now, limit);
    }
    listDueBotRuntimeSideEffects(now, limit) {
        if (this.adapter)
            return this.adapter.listDueBotRuntimeSideEffects(now, limit);
        const at = new Date(now).getTime();
        return clone(this.readState().botRuntimeSideEffects.filter((effect) => (effect.status === "pending" || effect.status === "retry_scheduled" || (effect.status === "processing" && effect.leaseUntil !== null && new Date(effect.leaseUntil).getTime() <= at))
            && (!effect.nextAttemptAt || new Date(effect.nextAttemptAt).getTime() <= at)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, Math.max(1, limit)));
    }
    async claimBotRuntimeSideEffectAsync(id, now, leaseUntil) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter))
            return this.adapter.claimBotRuntimeSideEffectAsync(id, now, leaseUntil);
        return this.claimBotRuntimeSideEffect(id, now, leaseUntil);
    }
    claimBotRuntimeSideEffect(id, now, leaseUntil) {
        if (this.adapter)
            return this.adapter.claimBotRuntimeSideEffect(id, now, leaseUntil);
        let claimed;
        this.store.update((raw) => {
            const state = normalizeState(raw);
            const at = new Date(now).getTime();
            const current = state.botRuntimeSideEffects.find((item) => item.id === id);
            if (!current || !(["pending", "retry_scheduled"].includes(current.status) || (current.status === "processing" && current.leaseUntil !== null && new Date(current.leaseUntil).getTime() <= at)) || (current.nextAttemptAt && new Date(current.nextAttemptAt).getTime() > at))
                return state;
            claimed = { ...current, attempts: current.attempts + 1, leaseUntil, status: "processing", updatedAt: now };
            return { ...state, botRuntimeSideEffects: state.botRuntimeSideEffects.map((item) => item.id === id ? claimed : item) };
        });
        return clone(claimed);
    }
    async updateBotRuntimeSideEffectAsync(effect) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter))
            return this.adapter.updateBotRuntimeSideEffectAsync(effect);
        return this.updateBotRuntimeSideEffect(effect);
    }
    updateBotRuntimeSideEffect(effect) {
        if (this.adapter)
            return this.adapter.updateBotRuntimeSideEffect(effect);
        this.store.update((raw) => {
            const state = normalizeState(raw);
            if (!state.botRuntimeSideEffects.some((item) => item.id === effect.id))
                throw new Error("bot_runtime_side_effect_not_found");
            return { ...state, botRuntimeSideEffects: state.botRuntimeSideEffects.map((item) => item.id === effect.id ? clone(effect) : item) };
        });
        return clone(effect);
    }
    async findBotRuntimeInstanceAsync(tenantId, conversationId) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.findBotRuntimeInstanceAsync(tenantId, conversationId);
        }
        return this.findBotRuntimeInstance(tenantId, conversationId);
    }
    findBotRuntimeInstance(tenantId, conversationId) {
        if (this.adapter)
            return this.adapter.findBotRuntimeInstance(tenantId, conversationId);
        return clone(this.readState().botRuntimeInstances.find((item) => item.tenantId === tenantId && item.conversationId === conversationId));
    }
    async listBotRuntimeInstancesAsync(tenantId) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.listBotRuntimeInstancesAsync(tenantId);
        }
        return this.listBotRuntimeInstances(tenantId);
    }
    listBotRuntimeInstances(tenantId) {
        if (this.adapter)
            return this.adapter.listBotRuntimeInstances(tenantId);
        return clone(this.readState().botRuntimeInstances.filter((item) => item.tenantId === tenantId));
    }
    async findBotRuntimeStepAsync(tenantId, conversationId, inputEventId) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.findBotRuntimeStepAsync(tenantId, conversationId, inputEventId);
        }
        return this.findBotRuntimeStep(tenantId, conversationId, inputEventId);
    }
    findBotRuntimeStep(tenantId, conversationId, inputEventId) {
        if (this.adapter)
            return this.adapter.findBotRuntimeStep(tenantId, conversationId, inputEventId);
        return clone(this.readState().botRuntimeSteps.find((item) => item.tenantId === tenantId && item.conversationId === conversationId && item.inputEventId === inputEventId));
    }
    async commitBotRuntimeTransitionAsync(input) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.commitBotRuntimeTransitionAsync(input);
        }
        return this.commitBotRuntimeTransition(input);
    }
    commitBotRuntimeTransition(input) {
        if (this.adapter)
            return this.adapter.commitBotRuntimeTransition(input);
        let result;
        this.store.update((raw) => {
            const state = normalizeState(raw);
            const duplicate = state.botRuntimeSteps.find((item) => item.tenantId === input.step.tenantId && item.conversationId === input.step.conversationId && item.inputEventId === input.step.inputEventId);
            if (duplicate) {
                const existing = state.botRuntimeInstances.find((item) => item.id === duplicate.runtimeId);
                if (!existing)
                    throw new Error("bot_runtime_instance_not_found");
                result = { instance: clone(existing), outcome: "duplicate", step: clone(duplicate) };
                return state;
            }
            const current = state.botRuntimeInstances.find((item) => item.tenantId === input.instance.tenantId && item.conversationId === input.instance.conversationId);
            if (current && current.versionId !== input.instance.versionId)
                throw new Error("bot_runtime_version_is_pinned");
            if (current && input.expectedCurrentNodeId !== undefined && current.currentNodeId !== input.expectedCurrentNodeId)
                throw new Error("bot_runtime_transition_conflict");
            const instance = clone(input.instance);
            const instances = [...state.botRuntimeInstances.filter((item) => item.id !== instance.id), instance];
            const step = clone(input.step);
            result = { instance: clone(instance), outcome: "committed", step: clone(step) };
            return { ...state, botRuntimeInstances: instances, botRuntimeSteps: [...state.botRuntimeSteps, step], botRuntimeSideEffects: [...state.botRuntimeSideEffects, ...runtimeSideEffectsFromStep(step)] };
        });
        return result;
    }
    async commitProactiveDeliveryAsync(input) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.commitProactiveDeliveryAsync(input);
        }
        const idempotencyRecord = normalizeProactiveDeliveryIdempotencyRecord(input.idempotencyRecord);
        const existing = this.findProactiveDeliveryIdempotencyKey(idempotencyRecord.key);
        if (existing) {
            return replayProactiveDeliveryCommit(existing, input);
        }
        const caps = this.listProactiveFrequencyCaps({
            ruleId: input.ruleId,
            tenantId: input.tenantId
        }).filter((cap) => cap.active);
        const capUpdates = prepareProactiveFrequencyCapUpdates(caps, input.evaluatedAt);
        if (!capUpdates) {
            return proactiveDeliveryCommitResult("cap_exhausted", input);
        }
        await Promise.resolve(input.conversationRepository.recordOutboundDescriptor({
            descriptor: input.descriptor,
            outbox: input.outbox
        }));
        this.saveProactiveDeliveryAttempt(input.attempt);
        this.saveProactiveDeliveryAttribution(input.attribution);
        for (const cap of capUpdates) {
            this.saveProactiveFrequencyCap(cap.next);
        }
        this.saveProactiveDeliveryIdempotencyKey(idempotencyRecord);
        return proactiveDeliveryCommitResult("queued", input);
    }
    async readStateAsync() {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.readStateAsync();
        }
        return this.readState();
    }
    readState() {
        if (this.adapter) {
            return this.adapter.readState();
        }
        return normalizeState(this.store.read());
    }
    async findPublishIdempotencyKeyAsync(tenantId, key) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.findPublishIdempotencyKeyAsync(tenantId, key);
        }
        return this.findPublishIdempotencyKey(tenantId, key);
    }
    findPublishIdempotencyKey(tenantId, key) {
        if (this.adapter) {
            return this.adapter.findPublishIdempotencyKey(tenantId, key);
        }
        return clone(this.readState().publishIdempotencyKeys.find((item) => item.tenantId === tenantId && item.key === key));
    }
    async findProactiveDeliveryIdempotencyKeyAsync(key) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.findProactiveDeliveryIdempotencyKeyAsync(key);
        }
        return this.findProactiveDeliveryIdempotencyKey(key);
    }
    findProactiveDeliveryIdempotencyKey(key) {
        if (this.adapter) {
            return this.adapter.findProactiveDeliveryIdempotencyKey(key);
        }
        return clone(this.readState().proactiveDeliveryIdempotencyKeys.find((item) => item.key === key));
    }
    async savePublishIdempotencyKeyAsync(record) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.savePublishIdempotencyKeyAsync(record);
        }
        return this.savePublishIdempotencyKey(record);
    }
    savePublishIdempotencyKey(record) {
        if (this.adapter) {
            return this.adapter.savePublishIdempotencyKey(record);
        }
        const persisted = normalizePublishIdempotencyRecord(record);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.publishIdempotencyKeys.find((item) => item.tenantId === persisted.tenantId && item.key === persisted.key);
            if (existing) {
                saved = clone(existing);
                return current;
            }
            saved = persisted;
            return {
                ...current,
                publishIdempotencyKeys: [...current.publishIdempotencyKeys, persisted]
            };
        });
        return clone(saved);
    }
    async saveProactiveDeliveryIdempotencyKeyAsync(record) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.saveProactiveDeliveryIdempotencyKeyAsync(record);
        }
        return this.saveProactiveDeliveryIdempotencyKey(record);
    }
    saveProactiveDeliveryIdempotencyKey(record) {
        if (this.adapter) {
            return this.adapter.saveProactiveDeliveryIdempotencyKey(record);
        }
        const persisted = normalizeProactiveDeliveryIdempotencyRecord(record);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.proactiveDeliveryIdempotencyKeys.find((item) => item.key === persisted.key);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                proactiveDeliveryIdempotencyKeys: [...current.proactiveDeliveryIdempotencyKeys, persisted]
            };
        });
        return clone(saved);
    }
    listBotScenarios() {
        if (this.adapter) {
            return this.adapter.listBotScenarios();
        }
        return clone(this.readState().botScenarios.map((scenario) => normalizeBotScenarioRecord(scenario)));
    }
    listExpiredArchivedBotScenarios(now, limit) {
        if (this.adapter)
            return this.adapter.listExpiredArchivedBotScenarios(now, limit);
        return clone(this.readState().botScenarios
            .map((scenario) => normalizeBotScenarioRecord(scenario))
            .filter((scenario) => isArchivedRetentionExpired(scenario, now))
            .sort((left, right) => String(left.retentionUntil).localeCompare(String(right.retentionUntil)))
            .slice(0, boundedPurgeLimit(limit)));
    }
    async listExpiredArchivedBotScenariosAsync(now, limit) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.listExpiredArchivedBotScenariosAsync(now, limit);
        }
        return this.listExpiredArchivedBotScenarios(now, limit);
    }
    findBotScenario(scenarioId) {
        if (this.adapter) {
            return this.adapter.findBotScenario(scenarioId);
        }
        const scenario = this.readState().botScenarios.find((item) => item.id === scenarioId);
        return scenario ? clone(normalizeBotScenarioRecord(scenario)) : undefined;
    }
    saveBotScenario(scenario) {
        if (this.adapter) {
            return this.adapter.saveBotScenario(scenario);
        }
        let saved = normalizeBotScenarioRecord(scenario);
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.botScenarios.find((item) => item.id === saved.id);
            saved = normalizeBotScenarioRecord(scenario, existing);
            const exists = Boolean(existing);
            return {
                ...current,
                botScenarios: exists
                    ? current.botScenarios.map((item) => item.id === saved.id ? saved : item)
                    : [saved, ...current.botScenarios]
            };
        });
        return clone(saved);
    }
    findBotScenarioVersion(versionId) {
        if (this.adapter) {
            return this.adapter.findBotScenarioVersion(versionId);
        }
        const version = this.readState().botScenarioVersions.find((item) => item.versionId === versionId);
        return version ? clone(normalizeBotScenarioVersionRecord(version)) : undefined;
    }
    listBotScenarioVersions(scenarioId) {
        if (this.adapter) {
            return this.adapter.listBotScenarioVersions(scenarioId);
        }
        return clone(this.readState().botScenarioVersions
            .filter((version) => version.scenarioId === scenarioId)
            .map((version) => normalizeBotScenarioVersionRecord(version)));
    }
    saveBotScenarioVersion(version) {
        if (this.adapter) {
            return this.adapter.saveBotScenarioVersion(version);
        }
        const persisted = normalizeBotScenarioVersionRecord(version);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.botScenarioVersions.find((item) => item.versionId === persisted.versionId);
            if (existing) {
                saved = normalizeBotScenarioVersionRecord(existing);
                return current;
            }
            return {
                ...current,
                botScenarioVersions: [...current.botScenarioVersions, persisted]
            };
        });
        return clone(saved);
    }
    findBotPublishAuditEvent(auditId) {
        if (this.adapter) {
            return this.adapter.findBotPublishAuditEvent(auditId);
        }
        const event = this.readState().botPublishAuditEvents.find((item) => item.auditId === auditId);
        return event ? clone(normalizeBotPublishAuditEventRecord(event)) : undefined;
    }
    listBotPublishAuditEvents(scenarioId) {
        if (this.adapter) {
            return this.adapter.listBotPublishAuditEvents(scenarioId);
        }
        return clone(this.readState()
            .botPublishAuditEvents.filter((event) => event.scenarioId === scenarioId)
            .map((event) => normalizeBotPublishAuditEventRecord(event)));
    }
    saveBotPublishAuditEvent(event) {
        if (this.adapter) {
            return this.adapter.saveBotPublishAuditEvent(event);
        }
        const persisted = normalizeBotPublishAuditEventRecord(event);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.botPublishAuditEvents.find((item) => item.auditId === persisted.auditId || item.idempotencyKey === persisted.idempotencyKey);
            if (existing) {
                saved = normalizeBotPublishAuditEventRecord(existing);
                return current;
            }
            return {
                ...current,
                botPublishAuditEvents: [...current.botPublishAuditEvents, persisted]
            };
        });
        return clone(saved);
    }
    purgeArchivedBotScenario(tenantId, scenarioId, now) {
        if (this.adapter)
            return this.adapter.purgeArchivedBotScenario(tenantId, scenarioId, now);
        const scopedTenantId = requireAutomationTenantId(tenantId);
        let result = { outcome: "not_eligible", scenarioId, tenantId: scopedTenantId };
        this.store.update((state) => {
            const current = normalizeState(state);
            const scenario = current.botScenarios.find((item) => item.id === scenarioId && item.tenantId === scopedTenantId);
            if (!scenario || !isArchivedRetentionExpired(scenario, now))
                return current;
            if (scenario.legalHold) {
                result = { ...result, outcome: "legal_hold" };
                return current;
            }
            if (scenario.auditHold || current.botPublishAuditEvents.some((event) => event.tenantId === scopedTenantId && event.scenarioId === scenarioId)) {
                result = { ...result, outcome: "audit_hold" };
                return current;
            }
            result = { ...result, outcome: "purged" };
            return {
                ...current,
                botScenarios: current.botScenarios.filter((item) => !(item.id === scenarioId && item.tenantId === scopedTenantId)),
                botScenarioVersions: current.botScenarioVersions.filter((item) => !(item.scenarioId === scenarioId && item.tenantId === scopedTenantId)),
                botTestRuns: current.botTestRuns.filter((item) => !(item.scenarioId === scenarioId && item.tenantId === scopedTenantId))
            };
        });
        return result;
    }
    async purgeArchivedBotScenarioAsync(tenantId, scenarioId, now) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.purgeArchivedBotScenarioAsync(tenantId, scenarioId, now);
        }
        return this.purgeArchivedBotScenario(tenantId, scenarioId, now);
    }
    /** Append-only tenant-scoped projection for scenario lifecycle actions. */
    async saveScenarioAuditEvent(event) {
        if (this.adapter)
            return await this.adapter.saveScenarioAuditEvent(event);
        const persisted = normalizeScenarioAuditEvent(event);
        let saved = persisted;
        this.store.update((raw) => {
            const current = normalizeState(raw);
            const existing = current.scenarioAuditEvents.find((item) => item.auditId === persisted.auditId || (Boolean(persisted.idempotencyKey) && item.tenantId === persisted.tenantId && item.idempotencyKey === persisted.idempotencyKey));
            if (existing) {
                saved = existing;
                return current;
            }
            return { ...current, scenarioAuditEvents: [...current.scenarioAuditEvents, persisted] };
        });
        return clone(saved);
    }
    listScenarioAuditEvents(scenarioId, tenantId) {
        if (this.adapter)
            return this.adapter.listScenarioAuditEvents(scenarioId, tenantId);
        const scopedTenantId = requireAutomationTenantId(tenantId);
        return clone(this.readState().scenarioAuditEvents.filter((event) => event.scenarioId === scenarioId && event.tenantId === scopedTenantId));
    }
    saveWorkspaceAuditEvent(event) {
        if (this.adapter) {
            return this.adapter.saveWorkspaceAuditEvent(event);
        }
        const persisted = normalizeWorkspaceAuditEvent(event);
        let saved = persisted;
        this.store.update((raw) => {
            const current = normalizeState(raw);
            const existing = current.workspaceAuditEvents.find((item) => item.auditId === persisted.auditId || (persisted.idempotencyKey && item.idempotencyKey === persisted.idempotencyKey));
            if (existing) {
                saved = normalizeWorkspaceAuditEvent(existing);
                return current;
            }
            return { ...current, workspaceAuditEvents: [...current.workspaceAuditEvents, persisted] };
        });
        return clone(saved);
    }
    async listProactiveRulesAsync() {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.listProactiveRulesAsync();
        }
        return this.listProactiveRules();
    }
    listProactiveRules() {
        if (this.adapter) {
            return this.adapter.listProactiveRules();
        }
        return clone(this.readState().proactiveRules);
    }
    async listProactiveExecutionWindowsAsync(filter = {}) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.listProactiveExecutionWindowsAsync(filter);
        }
        return this.listProactiveExecutionWindows(filter);
    }
    listProactiveExecutionWindows(filter = {}) {
        if (this.adapter) {
            return this.adapter.listProactiveExecutionWindows(filter);
        }
        return clone(this.readState().proactiveExecutionWindows.filter((window) => (!filter.ruleId || window.ruleId === filter.ruleId) &&
            (!filter.tenantId || window.tenantId === filter.tenantId)));
    }
    async saveProactiveExecutionWindowAsync(window) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.saveProactiveExecutionWindowAsync(window);
        }
        return this.saveProactiveExecutionWindow(window);
    }
    saveProactiveExecutionWindow(window) {
        if (this.adapter) {
            return this.adapter.saveProactiveExecutionWindow(window);
        }
        const persisted = normalizeProactiveExecutionWindow(window);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.proactiveExecutionWindows.some((item) => item.windowId === persisted.windowId);
            return {
                ...current,
                proactiveExecutionWindows: exists
                    ? current.proactiveExecutionWindows.map((item) => item.windowId === persisted.windowId ? persisted : item)
                    : [persisted, ...current.proactiveExecutionWindows]
            };
        });
        return clone(persisted);
    }
    async listProactiveFrequencyCapsAsync(filter = {}) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.listProactiveFrequencyCapsAsync(filter);
        }
        return this.listProactiveFrequencyCaps(filter);
    }
    listProactiveFrequencyCaps(filter = {}) {
        if (this.adapter) {
            return this.adapter.listProactiveFrequencyCaps(filter);
        }
        return clone(this.readState().proactiveFrequencyCaps.filter((cap) => (!filter.ruleId || cap.ruleId === filter.ruleId) &&
            (!filter.tenantId || cap.tenantId === filter.tenantId)));
    }
    async saveProactiveFrequencyCapAsync(cap) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.saveProactiveFrequencyCapAsync(cap);
        }
        return this.saveProactiveFrequencyCap(cap);
    }
    saveProactiveFrequencyCap(cap) {
        if (this.adapter) {
            return this.adapter.saveProactiveFrequencyCap(cap);
        }
        const persisted = normalizeProactiveFrequencyCap(cap);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.proactiveFrequencyCaps.some((item) => item.capId === persisted.capId);
            return {
                ...current,
                proactiveFrequencyCaps: exists
                    ? current.proactiveFrequencyCaps.map((item) => item.capId === persisted.capId ? persisted : item)
                    : [persisted, ...current.proactiveFrequencyCaps]
            };
        });
        return clone(persisted);
    }
    async listProactiveExperimentAssignmentsAsync(filter = {}) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.listProactiveExperimentAssignmentsAsync(filter);
        }
        return this.listProactiveExperimentAssignments(filter);
    }
    listProactiveExperimentAssignments(filter = {}) {
        if (this.adapter) {
            return this.adapter.listProactiveExperimentAssignments(filter);
        }
        return clone(this.readState().proactiveExperimentAssignments.filter((assignment) => (!filter.ruleId || assignment.ruleId === filter.ruleId) &&
            (!filter.subjectId || assignment.subjectId === filter.subjectId) &&
            (!filter.tenantId || assignment.tenantId === filter.tenantId)));
    }
    async saveProactiveExperimentAssignmentAsync(assignment) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.saveProactiveExperimentAssignmentAsync(assignment);
        }
        return this.saveProactiveExperimentAssignment(assignment);
    }
    saveProactiveExperimentAssignment(assignment) {
        if (this.adapter) {
            return this.adapter.saveProactiveExperimentAssignment(assignment);
        }
        const persisted = normalizeProactiveExperimentAssignment(assignment);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.proactiveExperimentAssignments.find((item) => item.assignmentId === persisted.assignmentId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                proactiveExperimentAssignments: [persisted, ...current.proactiveExperimentAssignments]
            };
        });
        return clone(saved);
    }
    async listProactiveDeliveryAttemptsAsync(filter = {}) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.listProactiveDeliveryAttemptsAsync(filter);
        }
        return this.listProactiveDeliveryAttempts(filter);
    }
    listProactiveDeliveryAttempts(filter = {}) {
        if (this.adapter) {
            return this.adapter.listProactiveDeliveryAttempts(filter);
        }
        return clone(this.readState().proactiveDeliveryAttempts.filter((attempt) => (!filter.ruleId || attempt.ruleId === filter.ruleId) &&
            (!filter.subjectId || attempt.subjectId === filter.subjectId) &&
            (!filter.tenantId || attempt.tenantId === filter.tenantId)));
    }
    async saveProactiveDeliveryAttemptAsync(attempt) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.saveProactiveDeliveryAttemptAsync(attempt);
        }
        return this.saveProactiveDeliveryAttempt(attempt);
    }
    saveProactiveDeliveryAttempt(attempt) {
        if (this.adapter) {
            return this.adapter.saveProactiveDeliveryAttempt(attempt);
        }
        const persisted = normalizeProactiveDeliveryAttempt(attempt);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.proactiveDeliveryAttempts.find((item) => item.attemptId === persisted.attemptId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                proactiveDeliveryAttempts: [persisted, ...current.proactiveDeliveryAttempts]
            };
        });
        return clone(saved);
    }
    async listProactiveDeliveryAttributionsAsync(filter = {}) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.listProactiveDeliveryAttributionsAsync(filter);
        }
        return this.listProactiveDeliveryAttributions(filter);
    }
    listProactiveDeliveryAttributions(filter = {}) {
        if (this.adapter) {
            return this.adapter.listProactiveDeliveryAttributions(filter);
        }
        return clone(this.readState().proactiveDeliveryAttributions.filter((attribution) => (!filter.ruleId || attribution.ruleId === filter.ruleId) &&
            (!filter.subjectId || attribution.subjectId === filter.subjectId) &&
            (!filter.tenantId || attribution.tenantId === filter.tenantId)));
    }
    async saveProactiveDeliveryAttributionAsync(attribution) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.saveProactiveDeliveryAttributionAsync(attribution);
        }
        return this.saveProactiveDeliveryAttribution(attribution);
    }
    saveProactiveDeliveryAttribution(attribution) {
        if (this.adapter) {
            return this.adapter.saveProactiveDeliveryAttribution(attribution);
        }
        const persisted = normalizeProactiveDeliveryAttribution(attribution);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.proactiveDeliveryAttributions.find((item) => item.attributionId === persisted.attributionId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                proactiveDeliveryAttributions: [persisted, ...current.proactiveDeliveryAttributions]
            };
        });
        return clone(saved);
    }
    async saveProactiveRuleAsync(rule) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.saveProactiveRuleAsync(rule);
        }
        return this.saveProactiveRule(rule);
    }
    saveProactiveRule(rule) {
        if (this.adapter) {
            return this.adapter.saveProactiveRule(rule);
        }
        const persisted = normalizeProactiveRuleRecord(rule);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.proactiveRules.some((item) => item.id === persisted.id);
            return {
                ...current,
                proactiveRules: exists
                    ? current.proactiveRules.map((item) => item.id === persisted.id ? persisted : item)
                    : [persisted, ...current.proactiveRules]
            };
        });
        return clone(persisted);
    }
    async saveBotTestRunAsync(run) {
        if (this.adapter && hasAsyncAutomationPort(this.adapter)) {
            return this.adapter.saveBotTestRunAsync(run);
        }
        return this.saveBotTestRun(run);
    }
    saveBotTestRun(run) {
        if (this.adapter) {
            return this.adapter.saveBotTestRun(run);
        }
        const persisted = normalizeBotTestRunRecord(run);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.botTestRuns.some((item) => item.testRunId === persisted.testRunId);
            return {
                ...current,
                botTestRuns: exists
                    ? current.botTestRuns.map((item) => item.testRunId === persisted.testRunId ? persisted : item)
                    : [persisted, ...current.botTestRuns]
            };
        });
        return clone(persisted);
    }
}
class PrismaAutomationRepository {
    client;
    fallback;
    constructor(client, fallback) {
        this.client = client;
        this.fallback = fallback;
    }
    listDueBotRuntimeRetries(_now, _limit) { throw new Error("prisma_automation_async_required"); }
    async listDueBotRuntimeRetriesAsync(now, limit) {
        const delegate = this.client.botRuntimeInstance;
        if (!delegate)
            return this.fallback.listDueBotRuntimeRetriesAsync(now, limit);
        const rows = await delegate.findMany({
            orderBy: { nextAttemptAt: "asc" },
            take: Math.max(1, limit),
            where: { nextAttemptAt: { lte: new Date(now) }, status: "retry_scheduled" }
        });
        return rows.map(toBotRuntimeInstance);
    }
    claimBotRuntimeRetry(_id, _expectedAttempts, _now, _leaseUntil) { throw new Error("prisma_automation_async_required"); }
    async claimBotRuntimeRetryAsync(id, expectedAttempts, now, leaseUntil) {
        const delegate = this.client.botRuntimeInstance;
        if (!delegate)
            return this.fallback.claimBotRuntimeRetryAsync(id, expectedAttempts, now, leaseUntil);
        const claimed = await delegate.updateMany({
            data: { nextAttemptAt: new Date(leaseUntil), updatedAt: new Date(now) },
            where: { attempts: expectedAttempts, id, nextAttemptAt: { lte: new Date(now) }, status: "retry_scheduled" }
        });
        if (claimed.count !== 1)
            return undefined;
        const row = await delegate.findUnique({ where: { id } });
        return row ? toBotRuntimeInstance(row) : undefined;
    }
    findLatestBotRuntimeStep(_runtimeId) { throw new Error("prisma_automation_async_required"); }
    async findLatestBotRuntimeStepAsync(runtimeId) {
        const delegate = this.client.botRuntimeStepJournal;
        if (!delegate)
            return this.fallback.findLatestBotRuntimeStepAsync(runtimeId);
        const rows = await delegate.findMany({ orderBy: { createdAt: "desc" }, take: 1, where: { runtimeId } });
        return rows[0] ? toBotRuntimeStep(rows[0]) : undefined;
    }
    listDueBotRuntimeSideEffects(_now, _limit) { throw new Error("prisma_automation_async_required"); }
    async listDueBotRuntimeSideEffectsAsync(now, limit) {
        const delegate = this.client.botRuntimeSideEffect;
        if (!delegate)
            return this.fallback.listDueBotRuntimeSideEffectsAsync(now, limit);
        const rows = await delegate.findMany({
            orderBy: { createdAt: "asc" }, take: Math.max(1, limit),
            where: { nextAttemptAt: { lte: new Date(now) }, OR: [{ status: "pending" }, { status: "retry_scheduled" }, { status: "processing", leaseUntil: { lte: new Date(now) } }] }
        });
        return rows.map(toBotRuntimeSideEffect);
    }
    claimBotRuntimeSideEffect(_id, _now, _leaseUntil) { throw new Error("prisma_automation_async_required"); }
    async claimBotRuntimeSideEffectAsync(id, now, leaseUntil) {
        const delegate = this.client.botRuntimeSideEffect;
        if (!delegate)
            return this.fallback.claimBotRuntimeSideEffectAsync(id, now, leaseUntil);
        const current = await delegate.findUnique({ where: { id } });
        if (!current)
            return undefined;
        const effect = toBotRuntimeSideEffect(current);
        const at = new Date(now).getTime();
        const due = (effect.status === "pending" || effect.status === "retry_scheduled" || (effect.status === "processing" && effect.leaseUntil !== null && new Date(effect.leaseUntil).getTime() <= at)) && (!effect.nextAttemptAt || new Date(effect.nextAttemptAt).getTime() <= at);
        if (!due)
            return undefined;
        const updated = await delegate.updateMany({ data: { attempts: effect.attempts + 1, leaseUntil: new Date(leaseUntil), status: "processing", updatedAt: new Date(now) }, where: { id, status: effect.status, attempts: effect.attempts } });
        if (updated.count !== 1)
            return undefined;
        return { ...effect, attempts: effect.attempts + 1, leaseUntil, status: "processing", updatedAt: now };
    }
    updateBotRuntimeSideEffect(_effect) { throw new Error("prisma_automation_async_required"); }
    async updateBotRuntimeSideEffectAsync(effect) {
        const delegate = this.client.botRuntimeSideEffect;
        if (!delegate)
            return this.fallback.updateBotRuntimeSideEffectAsync(effect);
        const row = await delegate.update({ data: toBotRuntimeSideEffectData(effect, false), where: { id: effect.id } });
        return toBotRuntimeSideEffect(row);
    }
    findBotRuntimeInstance(_tenantId, _conversationId) {
        throw new Error("prisma_automation_async_required");
    }
    async findBotRuntimeInstanceAsync(tenantId, conversationId) {
        const delegate = this.client.botRuntimeInstance;
        if (!delegate)
            return this.fallback.findBotRuntimeInstanceAsync(tenantId, conversationId);
        const row = await delegate.findUnique({ where: { tenantId_conversationId: { tenantId, conversationId } } });
        return row ? toBotRuntimeInstance(row) : undefined;
    }
    listBotRuntimeInstances(_tenantId) {
        throw new Error("prisma_automation_async_required");
    }
    async listBotRuntimeInstancesAsync(tenantId) {
        const delegate = this.client.botRuntimeInstance;
        if (!delegate)
            return this.fallback.listBotRuntimeInstancesAsync(tenantId);
        const rows = await delegate.findMany({ where: { tenantId } });
        return rows.map(toBotRuntimeInstance);
    }
    findBotRuntimeStep(_tenantId, _conversationId, _inputEventId) {
        throw new Error("prisma_automation_async_required");
    }
    async findBotRuntimeStepAsync(tenantId, conversationId, inputEventId) {
        const delegate = this.client.botRuntimeStepJournal;
        if (!delegate)
            return this.fallback.findBotRuntimeStepAsync(tenantId, conversationId, inputEventId);
        const row = await delegate.findUnique({ where: { tenantId_conversationId_inputEventId: { tenantId, conversationId, inputEventId } } });
        return row ? toBotRuntimeStep(row) : undefined;
    }
    commitBotRuntimeTransition(_input) {
        throw new Error("prisma_automation_async_required");
    }
    async commitBotRuntimeTransitionAsync(input) {
        if (!this.client.$transaction || !this.client.botRuntimeInstance || !this.client.botRuntimeStepJournal) {
            return this.fallback.commitBotRuntimeTransitionAsync(input);
        }
        const existing = await this.findBotRuntimeStepAsync(input.step.tenantId, input.step.conversationId, input.step.inputEventId);
        if (existing) {
            const instance = await this.findBotRuntimeInstanceAsync(input.instance.tenantId, input.instance.conversationId);
            if (!instance)
                throw new Error("bot_runtime_instance_not_found");
            return { instance, outcome: "duplicate", step: existing };
        }
        try {
            return await this.client.$transaction(async (transaction) => {
                const instances = transaction.botRuntimeInstance;
                const steps = transaction.botRuntimeStepJournal;
                if (!instances || !steps)
                    throw new Error("bot_runtime_prisma_delegates_required");
                const currentRow = await instances.findUnique({ where: { tenantId_conversationId: { tenantId: input.instance.tenantId, conversationId: input.instance.conversationId } } });
                if (currentRow && String(currentRow.versionId) !== input.instance.versionId)
                    throw new Error("bot_runtime_version_is_pinned");
                if (currentRow) {
                    const where = { id: input.instance.id };
                    if (input.expectedCurrentNodeId !== undefined)
                        where.currentNodeId = input.expectedCurrentNodeId;
                    const updated = await instances.updateMany({ data: toBotRuntimeInstanceData(input.instance, false), where });
                    if (updated.count !== 1)
                        throw new Error("bot_runtime_transition_conflict");
                }
                else {
                    await instances.create({ data: toBotRuntimeInstanceData(input.instance, true) });
                }
                await steps.create({ data: toBotRuntimeStepData(input.step) });
                if (transaction.botRuntimeSideEffect) {
                    for (const effect of runtimeSideEffectsFromStep(input.step))
                        await transaction.botRuntimeSideEffect.create({ data: toBotRuntimeSideEffectData(effect, true) });
                }
                return { instance: clone(input.instance), outcome: "committed", step: clone(input.step) };
            }, { isolationLevel: "Serializable" });
        }
        catch (error) {
            if (!isPrismaUniqueConstraintError(error))
                throw error;
            const replay = await this.findBotRuntimeStepAsync(input.step.tenantId, input.step.conversationId, input.step.inputEventId);
            const instance = await this.findBotRuntimeInstanceAsync(input.instance.tenantId, input.instance.conversationId);
            if (!replay || !instance)
                throw error;
            return { instance, outcome: "duplicate", step: replay };
        }
    }
    async commitProactiveDeliveryAsync(input) {
        validateProactiveDeliveryCommitInput(input);
        if (!this.client.$transaction) {
            throw new Error("prisma_proactive_delivery_transaction_required");
        }
        for (let attempt = 0; attempt < PROACTIVE_DELIVERY_TRANSACTION_ATTEMPTS; attempt += 1) {
            try {
                return await this.client.$transaction(async (transaction) => {
                    const idempotencyRecord = normalizeProactiveDeliveryIdempotencyRecord(input.idempotencyRecord);
                    const existing = await transaction.proactiveDeliveryIdempotencyKey.findUnique({
                        where: { key: idempotencyRecord.key }
                    });
                    if (existing) {
                        return replayProactiveDeliveryCommit(toProactiveDeliveryIdempotencyRecord(existing), input);
                    }
                    const capRows = await transaction.proactiveFrequencyCap.findMany({
                        where: {
                            active: true,
                            ruleId: input.ruleId,
                            tenantId: input.tenantId
                        }
                    });
                    const caps = capRows.map(toProactiveFrequencyCap);
                    const capUpdates = prepareProactiveFrequencyCapUpdates(caps, input.evaluatedAt);
                    if (!capUpdates) {
                        throw new ProactiveFrequencyCapExhaustedError();
                    }
                    await transaction.proactiveDeliveryIdempotencyKey.create({
                        data: toPrismaProactiveDeliveryIdempotencyRecord(idempotencyRecord)
                    });
                    for (const capUpdate of capUpdates) {
                        const updated = await transaction.proactiveFrequencyCap.updateMany({
                            data: {
                                resetAt: new Date(capUpdate.next.resetAt),
                                used: capUpdate.next.used
                            },
                            where: {
                                active: true,
                                capId: capUpdate.previous.capId,
                                resetAt: new Date(capUpdate.previous.resetAt),
                                ruleId: input.ruleId,
                                tenantId: input.tenantId,
                                used: capUpdate.previous.used
                            }
                        });
                        if (updated.count !== 1) {
                            throw new ProactiveFrequencyCapConflictError();
                        }
                    }
                    await transaction.outboxEvent.create({
                        data: toPrismaAtomicOutboxEvent(input.outbox)
                    });
                    await transaction.conversationOutboundDescriptor.create({
                        data: toPrismaAtomicConversationOutboundDescriptor(input.descriptor)
                    });
                    await transaction.proactiveDeliveryAttempt.create({
                        data: toPrismaProactiveDeliveryAttempt(normalizeProactiveDeliveryAttempt(input.attempt))
                    });
                    await transaction.proactiveDeliveryAttribution.create({
                        data: toPrismaProactiveDeliveryAttribution(normalizeProactiveDeliveryAttribution(input.attribution))
                    });
                    return proactiveDeliveryCommitResult("queued", input);
                }, { isolationLevel: "Serializable" });
            }
            catch (error) {
                if ((error instanceof ProactiveFrequencyCapConflictError || isPrismaTransactionConflictError(error))
                    && attempt + 1 < PROACTIVE_DELIVERY_TRANSACTION_ATTEMPTS) {
                    continue;
                }
                if (error instanceof ProactiveFrequencyCapExhaustedError) {
                    return proactiveDeliveryCommitResult("cap_exhausted", input);
                }
                if (error instanceof ProactiveFrequencyCapConflictError) {
                    return proactiveDeliveryCommitResult("conflicted", input);
                }
                if (isPrismaUniqueConstraintError(error)) {
                    const existing = await this.findProactiveDeliveryIdempotencyKeyAsync(input.idempotencyRecord.key);
                    if (existing) {
                        return replayProactiveDeliveryCommit(existing, input);
                    }
                }
                throw error;
            }
        }
        throw new Error("proactive_delivery_transaction_attempts_exhausted");
    }
    async findBotPublishAuditEvent(auditId) {
        const row = await this.client.botPublishAuditEvent.findUnique({ where: { auditId } });
        return row ? toBotPublishAuditEvent(row) : undefined;
    }
    async findBotScenario(scenarioId) {
        const row = await this.client.botScenario.findUnique({ where: { id: scenarioId } });
        return row ? toBotScenario(row) : undefined;
    }
    async findBotScenarioVersion(versionId) {
        const row = await this.client.botScenarioVersion.findUnique({ where: { versionId } });
        return row ? toBotScenarioVersion(row) : undefined;
    }
    findPublishIdempotencyKey(_tenantId, _key) {
        throw new Error("prisma_automation_async_required");
    }
    async findPublishIdempotencyKeyAsync(tenantId, key) {
        const row = await this.client.automationPublishIdempotencyKey.findUnique({
            where: automationPublishIdempotencyWhere(tenantId, key)
        });
        return row ? toAutomationPublishIdempotencyRecord(row) : undefined;
    }
    findProactiveDeliveryIdempotencyKey(key) {
        throw new Error("prisma_automation_async_required");
    }
    async findProactiveDeliveryIdempotencyKeyAsync(key) {
        const row = await this.client.proactiveDeliveryIdempotencyKey.findUnique({ where: { key } });
        return row ? toProactiveDeliveryIdempotencyRecord(row) : undefined;
    }
    async listBotPublishAuditEvents(scenarioId) {
        const rows = await this.client.botPublishAuditEvent.findMany({
            orderBy: { createdAt: "asc" },
            where: { scenarioId }
        });
        return rows.map(toBotPublishAuditEvent);
    }
    async listBotScenarios() {
        const rows = await this.client.botScenario.findMany({ orderBy: { updatedAt: "desc" } });
        return rows.map(toBotScenario);
    }
    async listScenarioAuditEvents(scenarioId, tenantId) {
        const rows = await this.client.automationScenarioAuditEvent.findMany({ orderBy: { createdAt: "asc" }, where: { scenarioId, tenantId } });
        return rows.map(normalizeScenarioAuditEvent);
    }
    async listExpiredArchivedBotScenarios(now, limit) {
        const rows = await this.client.botScenario.findMany({
            orderBy: { updatedAt: "desc" },
            take: boundedPurgeLimit(limit),
            where: { retentionUntil: { lte: new Date(now) }, status: "archived" }
        });
        return rows.map(toBotScenario).filter((scenario) => isArchivedRetentionExpired(scenario, now));
    }
    async listExpiredArchivedBotScenariosAsync(now, limit) {
        return this.listExpiredArchivedBotScenarios(now, limit);
    }
    async listBotScenarioVersions(scenarioId) {
        const rows = await this.client.botScenarioVersion.findMany({
            orderBy: { createdAt: "asc" },
            where: { scenarioId }
        });
        return rows.map(toBotScenarioVersion);
    }
    listProactiveRules() {
        throw new Error("prisma_automation_async_required");
    }
    async listProactiveRulesAsync() {
        const rows = await this.client.proactiveRule.findMany({ orderBy: { id: "asc" } });
        return rows.map(toProactiveRule);
    }
    listProactiveExecutionWindows(filter = {}) {
        throw new Error("prisma_automation_async_required");
    }
    async listProactiveExecutionWindowsAsync(filter = {}) {
        const rows = await this.client.proactiveExecutionWindow.findMany({ where: pruneUndefined(filter), orderBy: { windowId: "asc" } });
        return rows.map(toProactiveExecutionWindow);
    }
    listProactiveFrequencyCaps(filter = {}) {
        throw new Error("prisma_automation_async_required");
    }
    async listProactiveFrequencyCapsAsync(filter = {}) {
        const rows = await this.client.proactiveFrequencyCap.findMany({ where: pruneUndefined(filter), orderBy: { capId: "asc" } });
        return rows.map(toProactiveFrequencyCap);
    }
    listProactiveExperimentAssignments(filter = {}) {
        throw new Error("prisma_automation_async_required");
    }
    async listProactiveExperimentAssignmentsAsync(filter = {}) {
        const rows = await this.client.proactiveExperimentAssignment.findMany({
            where: pruneUndefined(filter),
            orderBy: { assignedAt: "asc" }
        });
        return rows.map(toProactiveExperimentAssignment);
    }
    listProactiveDeliveryAttempts(filter = {}) {
        throw new Error("prisma_automation_async_required");
    }
    async listProactiveDeliveryAttemptsAsync(filter = {}) {
        const rows = await this.client.proactiveDeliveryAttempt.findMany({
            where: pruneUndefined(filter),
            orderBy: { attemptedAt: "asc" }
        });
        return rows.map(toProactiveDeliveryAttempt);
    }
    listProactiveDeliveryAttributions(filter = {}) {
        throw new Error("prisma_automation_async_required");
    }
    async listProactiveDeliveryAttributionsAsync(filter = {}) {
        const rows = await this.client.proactiveDeliveryAttribution.findMany({
            where: pruneUndefined(filter),
            orderBy: { assignedAt: "asc" }
        });
        return rows.map(toProactiveDeliveryAttribution);
    }
    readState() {
        throw new Error("prisma_automation_async_required");
    }
    async readStateAsync() {
        const [botPublishAuditEvents, botScenarios, botScenarioVersions, botTestRuns, botRuntimeInstances, botRuntimeSteps, proactiveDeliveryAttributions, proactiveDeliveryAttempts, proactiveDeliveryIdempotencyKeys, proactiveExecutionWindows, proactiveExperimentAssignments, proactiveFrequencyCaps, proactiveRules, publishIdempotencyKeys, workspaceAuditEvents] = await Promise.all([
            this.client.botPublishAuditEvent.findMany({ orderBy: { createdAt: "asc" }, where: {} }),
            this.client.botScenario.findMany({ orderBy: { updatedAt: "desc" } }),
            this.client.botScenarioVersion.findMany({ orderBy: { createdAt: "asc" }, where: {} }),
            this.client.automationBotTestRun.findMany({ orderBy: { testRunId: "asc" } }),
            this.client.botRuntimeInstance?.findMany({ orderBy: { createdAt: "asc" }, where: {} }) ?? Promise.resolve([]),
            this.client.botRuntimeStepJournal?.findMany({ orderBy: { createdAt: "asc" }, where: {} }) ?? Promise.resolve([]),
            this.client.proactiveDeliveryAttribution.findMany({ orderBy: { assignedAt: "asc" } }),
            this.client.proactiveDeliveryAttempt.findMany({ orderBy: { attemptedAt: "asc" } }),
            this.client.proactiveDeliveryIdempotencyKey.findMany({ orderBy: { key: "asc" } }),
            this.client.proactiveExecutionWindow.findMany({ orderBy: { windowId: "asc" } }),
            this.client.proactiveExperimentAssignment.findMany({ orderBy: { assignedAt: "asc" } }),
            this.client.proactiveFrequencyCap.findMany({ orderBy: { capId: "asc" } }),
            this.client.proactiveRule.findMany({ orderBy: { id: "asc" } }),
            this.client.automationPublishIdempotencyKey.findMany({ orderBy: { key: "asc" } }),
            this.client.automationWorkspaceAuditEvent?.findMany({ orderBy: { createdAt: "asc" }, where: {} }) ?? Promise.resolve([])
        ]);
        return {
            ...createEmptyAutomationState(),
            botPublishAuditEvents: botPublishAuditEvents.map(toBotPublishAuditEvent),
            botScenarios: botScenarios.map(toBotScenario),
            botScenarioVersions: botScenarioVersions.map(toBotScenarioVersion),
            botTestRuns: botTestRuns.map(toAutomationBotTestRun),
            botRuntimeInstances: botRuntimeInstances.map(toBotRuntimeInstance),
            botRuntimeSteps: botRuntimeSteps.map(toBotRuntimeStep),
            proactiveDeliveryAttributions: proactiveDeliveryAttributions.map(toProactiveDeliveryAttribution),
            proactiveDeliveryAttempts: proactiveDeliveryAttempts.map(toProactiveDeliveryAttempt),
            proactiveDeliveryIdempotencyKeys: proactiveDeliveryIdempotencyKeys.map(toProactiveDeliveryIdempotencyRecord),
            proactiveExecutionWindows: proactiveExecutionWindows.map(toProactiveExecutionWindow),
            proactiveExperimentAssignments: proactiveExperimentAssignments.map(toProactiveExperimentAssignment),
            proactiveFrequencyCaps: proactiveFrequencyCaps.map(toProactiveFrequencyCap),
            proactiveRules: proactiveRules.map(toProactiveRule),
            publishIdempotencyKeys: publishIdempotencyKeys.map(toAutomationPublishIdempotencyRecord),
            workspaceAuditEvents: workspaceAuditEvents
                .map((row) => recordFromUnknown(row.payload))
                .filter(hasAutomationTenantId)
                .map(normalizeWorkspaceAuditEvent)
        };
    }
    async saveWorkspaceAuditEvent(event) {
        const persisted = normalizeWorkspaceAuditEvent(event);
        const delegate = this.client.automationWorkspaceAuditEvent;
        if (!delegate) {
            throw new Error("prisma_automation_workspace_audit_delegate_required");
        }
        try {
            const row = await delegate.create({
                data: {
                    auditId: String(persisted.auditId),
                    createdAt: new Date(String(persisted.createdAt ?? new Date().toISOString())),
                    idempotencyKey: persisted.idempotencyKey ? String(persisted.idempotencyKey) : null,
                    payload: clone(persisted),
                    tenantId: String(persisted.tenantId)
                }
            });
            return normalizeWorkspaceAuditEvent(recordFromUnknown(row.payload));
        }
        catch (error) {
            if (isPrismaUniqueConstraintError(error)) {
                const existing = await delegate.findUnique({ where: { auditId: String(persisted.auditId) } });
                if (existing)
                    return normalizeWorkspaceAuditEvent(recordFromUnknown(existing.payload));
            }
            throw error;
        }
    }
    async saveBotPublishAuditEvent(event) {
        const persisted = normalizeBotPublishAuditEventRecord(event);
        const existingByAuditId = await this.client.botPublishAuditEvent.findUnique({
            where: { auditId: persisted.auditId }
        });
        if (existingByAuditId) {
            const existing = toBotPublishAuditEvent(existingByAuditId);
            return existing;
        }
        const existingByIdempotencyKey = await this.client.botPublishAuditEvent.findUnique({
            where: { idempotencyKey: persisted.idempotencyKey }
        });
        if (existingByIdempotencyKey) {
            const existing = toBotPublishAuditEvent(existingByIdempotencyKey);
            return existing;
        }
        const row = await this.client.botPublishAuditEvent.create({
            data: toPrismaBotPublishAuditEventCreateInput(persisted)
        });
        const saved = toBotPublishAuditEvent(row);
        return saved;
    }
    async saveBotScenario(scenario) {
        const existingRow = await this.client.botScenario.findUnique({ where: { id: scenario.id } });
        const existing = existingRow ? toBotScenario(existingRow) : undefined;
        const persisted = normalizeBotScenarioRecord(scenario, existing);
        const row = await this.client.botScenario.upsert({
            create: toPrismaBotScenarioCreateInput(persisted),
            update: toPrismaBotScenarioUpdateInput(persisted),
            where: { id: persisted.id }
        });
        const saved = toBotScenario(row);
        return saved;
    }
    async saveScenarioAuditEvent(event) {
        const persisted = normalizeScenarioAuditEvent(event);
        const existing = persisted.idempotencyKey
            ? await this.client.automationScenarioAuditEvent.findUnique({ where: { tenantId_idempotencyKey: { idempotencyKey: persisted.idempotencyKey, tenantId: persisted.tenantId } } })
            : await this.client.automationScenarioAuditEvent.findUnique({ where: { auditId: persisted.auditId } });
        if (existing)
            return normalizeScenarioAuditEvent(existing);
        return normalizeScenarioAuditEvent(await this.client.automationScenarioAuditEvent.create({ data: persisted }));
    }
    async purgeArchivedBotScenario(tenantId, scenarioId, now) {
        const scopedTenantId = requireAutomationTenantId(tenantId);
        const scenario = await this.findBotScenario(scenarioId);
        const result = { outcome: "not_eligible", scenarioId, tenantId: scopedTenantId };
        if (!scenario || scenario.tenantId !== scopedTenantId || !isArchivedRetentionExpired(scenario, now))
            return result;
        if (scenario.legalHold)
            return { ...result, outcome: "legal_hold" };
        // Do not delete immutable evidence. The foreign key is RESTRICT as a race-safe backstop.
        const auditEvents = await this.listBotPublishAuditEvents(scenarioId);
        if (scenario.auditHold || auditEvents.some((event) => event.tenantId === scopedTenantId && event.immutable)) {
            return { ...result, outcome: "audit_hold" };
        }
        const deleted = await this.client.botScenario.deleteMany({
            where: { auditHold: false, id: scenarioId, legalHold: false, retentionUntil: { lte: new Date(now) }, status: "archived", tenantId: scopedTenantId }
        });
        return { ...result, outcome: deleted.count === 1 ? "purged" : "not_eligible" };
    }
    async purgeArchivedBotScenarioAsync(tenantId, scenarioId, now) {
        return this.purgeArchivedBotScenario(tenantId, scenarioId, now);
    }
    async saveBotScenarioVersion(version) {
        const persisted = normalizeBotScenarioVersionRecord(version);
        const existing = await this.findBotScenarioVersion(persisted.versionId);
        if (existing) {
            return existing;
        }
        const row = await this.client.botScenarioVersion.create({
            data: toPrismaBotScenarioVersionCreateInput(persisted)
        });
        const saved = toBotScenarioVersion(row);
        return saved;
    }
    saveBotTestRun(run) {
        throw new Error("prisma_automation_async_required");
    }
    async saveBotTestRunAsync(run) {
        const persisted = normalizeBotTestRunRecord(run);
        const row = await this.client.automationBotTestRun.upsert({
            create: toPrismaAutomationBotTestRun(persisted),
            update: toPrismaAutomationBotTestRun(persisted),
            where: { testRunId: persisted.testRunId }
        });
        return toAutomationBotTestRun(row);
    }
    saveProactiveRule(rule) {
        throw new Error("prisma_automation_async_required");
    }
    async saveProactiveRuleAsync(rule) {
        const persisted = clone(rule);
        const row = await this.client.proactiveRule.upsert({
            create: toPrismaProactiveRule(persisted),
            update: toPrismaProactiveRule(persisted),
            where: { id: persisted.id }
        });
        return toProactiveRule(row);
    }
    saveProactiveExecutionWindow(window) {
        throw new Error("prisma_automation_async_required");
    }
    async saveProactiveExecutionWindowAsync(window) {
        const persisted = normalizeProactiveExecutionWindow(window);
        const row = await this.client.proactiveExecutionWindow.upsert({
            create: toPrismaProactiveExecutionWindow(persisted),
            update: toPrismaProactiveExecutionWindow(persisted),
            where: { windowId: persisted.windowId }
        });
        return toProactiveExecutionWindow(row);
    }
    saveProactiveFrequencyCap(cap) {
        throw new Error("prisma_automation_async_required");
    }
    async saveProactiveFrequencyCapAsync(cap) {
        const persisted = normalizeProactiveFrequencyCap(cap);
        const row = await this.client.proactiveFrequencyCap.upsert({
            create: toPrismaProactiveFrequencyCap(persisted),
            update: toPrismaProactiveFrequencyCap(persisted),
            where: { capId: persisted.capId }
        });
        return toProactiveFrequencyCap(row);
    }
    saveProactiveExperimentAssignment(assignment) {
        throw new Error("prisma_automation_async_required");
    }
    async saveProactiveExperimentAssignmentAsync(assignment) {
        const persisted = normalizeProactiveExperimentAssignment(assignment);
        const existing = await this.client.proactiveExperimentAssignment.findUnique({
            where: { assignmentId: persisted.assignmentId }
        });
        if (existing) {
            return toProactiveExperimentAssignment(existing);
        }
        try {
            const row = await this.client.proactiveExperimentAssignment.create({
                data: toPrismaProactiveExperimentAssignment(persisted)
            });
            return toProactiveExperimentAssignment(row);
        }
        catch (error) {
            if (!isPrismaUniqueConstraintError(error)) {
                throw error;
            }
            const replay = await this.client.proactiveExperimentAssignment.findUnique({
                where: { assignmentId: persisted.assignmentId }
            });
            if (!replay) {
                throw error;
            }
            return toProactiveExperimentAssignment(replay);
        }
    }
    saveProactiveDeliveryAttempt(attempt) {
        throw new Error("prisma_automation_async_required");
    }
    async saveProactiveDeliveryAttemptAsync(attempt) {
        const persisted = normalizeProactiveDeliveryAttempt(attempt);
        const existing = await this.client.proactiveDeliveryAttempt.findUnique({ where: { attemptId: persisted.attemptId } });
        if (existing) {
            return toProactiveDeliveryAttempt(existing);
        }
        const row = await this.client.proactiveDeliveryAttempt.create({ data: toPrismaProactiveDeliveryAttempt(persisted) });
        return toProactiveDeliveryAttempt(row);
    }
    saveProactiveDeliveryAttribution(attribution) {
        throw new Error("prisma_automation_async_required");
    }
    async saveProactiveDeliveryAttributionAsync(attribution) {
        const persisted = normalizeProactiveDeliveryAttribution(attribution);
        const existing = await this.client.proactiveDeliveryAttribution.findUnique({
            where: { attributionId: persisted.attributionId }
        });
        if (existing) {
            return toProactiveDeliveryAttribution(existing);
        }
        const row = await this.client.proactiveDeliveryAttribution.create({
            data: toPrismaProactiveDeliveryAttribution(persisted)
        });
        return toProactiveDeliveryAttribution(row);
    }
    saveProactiveDeliveryIdempotencyKey(record) {
        throw new Error("prisma_automation_async_required");
    }
    async saveProactiveDeliveryIdempotencyKeyAsync(record) {
        const persisted = normalizeProactiveDeliveryIdempotencyRecord(record);
        const existing = await this.client.proactiveDeliveryIdempotencyKey.findUnique({ where: { key: persisted.key } });
        if (existing) {
            return toProactiveDeliveryIdempotencyRecord(existing);
        }
        const row = await this.client.proactiveDeliveryIdempotencyKey.create({
            data: toPrismaProactiveDeliveryIdempotencyRecord(persisted)
        });
        return toProactiveDeliveryIdempotencyRecord(row);
    }
    savePublishIdempotencyKey(record) {
        throw new Error("prisma_automation_async_required");
    }
    async savePublishIdempotencyKeyAsync(record) {
        const persisted = normalizePublishIdempotencyRecord(record);
        const existing = await this.client.automationPublishIdempotencyKey.findUnique({
            where: automationPublishIdempotencyWhere(persisted.tenantId, persisted.key)
        });
        if (existing) {
            return toAutomationPublishIdempotencyRecord(existing);
        }
        const row = await this.client.automationPublishIdempotencyKey.create({
            data: toPrismaAutomationPublishIdempotencyRecord(persisted)
        });
        return toAutomationPublishIdempotencyRecord(row);
    }
}
export function createEmptyAutomationState() {
    return {
        botPublishAuditEvents: [],
        botRuntimeInstances: [],
        botRuntimeSideEffects: [],
        botRuntimeSteps: [],
        botScenarios: [],
        botScenarioVersions: [],
        botTestRuns: [],
        proactiveDeliveryAttributions: [],
        proactiveDeliveryAttempts: [],
        proactiveDeliveryIdempotencyKeys: [],
        proactiveExecutionWindows: [],
        proactiveExperimentAssignments: [],
        proactiveFrequencyCaps: [],
        proactiveRules: [],
        publishIdempotencyKeys: [],
        activeVisitors: [],
        rescueChats: [],
        scenarioAuditEvents: [],
        workspaceAuditEvents: [],
        workspaceRuntimeMetrics: []
    };
}
function normalizeState(state) {
    return {
        botPublishAuditEvents: (state.botPublishAuditEvents ?? []).map((event) => normalizeBotPublishAuditEventRecord(event)),
        botRuntimeInstances: (state.botRuntimeInstances ?? []).map(clone),
        botRuntimeSideEffects: (state.botRuntimeSideEffects ?? []).map(clone),
        botRuntimeSteps: (state.botRuntimeSteps ?? []).map(clone),
        scenarioAuditEvents: (state.scenarioAuditEvents ?? []).map(normalizeScenarioAuditEvent),
        botScenarios: (state.botScenarios ?? []).map((scenario) => normalizeBotScenarioRecord(scenario)),
        botScenarioVersions: (state.botScenarioVersions ?? []).map((version) => normalizeBotScenarioVersionRecord(version)),
        botTestRuns: (state.botTestRuns ?? []).map((run) => normalizeBotTestRunRecord(run)),
        proactiveDeliveryAttributions: (state.proactiveDeliveryAttributions ?? []).map((attribution) => normalizeProactiveDeliveryAttribution(attribution)),
        proactiveDeliveryAttempts: (state.proactiveDeliveryAttempts ?? []).map((attempt) => normalizeProactiveDeliveryAttempt(attempt)),
        proactiveDeliveryIdempotencyKeys: (state.proactiveDeliveryIdempotencyKeys ?? []).map((record) => normalizeProactiveDeliveryIdempotencyRecord(record)),
        proactiveExecutionWindows: (state.proactiveExecutionWindows ?? []).map((window) => normalizeProactiveExecutionWindow(window)),
        proactiveExperimentAssignments: (state.proactiveExperimentAssignments ?? []).map((assignment) => normalizeProactiveExperimentAssignment(assignment)),
        proactiveFrequencyCaps: (state.proactiveFrequencyCaps ?? []).map((cap) => normalizeProactiveFrequencyCap(cap)),
        // Old local JSON demos could contain proactive records created before tenant
        // scoping. They must never enter a tenant-aware worker or block bot runtime.
        proactiveRules: (state.proactiveRules ?? []).filter(hasAutomationTenantId).map(normalizeProactiveRuleRecord),
        publishIdempotencyKeys: (state.publishIdempotencyKeys ?? []).map(normalizePublishIdempotencyRecord),
        activeVisitors: state.activeVisitors ?? [],
        rescueChats: state.rescueChats ?? [],
        workspaceAuditEvents: (state.workspaceAuditEvents ?? []).filter(hasAutomationTenantId).map(normalizeWorkspaceAuditEvent),
        workspaceRuntimeMetrics: state.workspaceRuntimeMetrics ?? []
    };
}
function normalizeProactiveRuleRecord(rule) {
    return {
        ...clone(rule),
        channels: clone(rule.channels),
        tenantId: requireAutomationTenantId(rule.tenantId)
    };
}
function normalizeBotScenarioRecord(scenario, existing) {
    const now = new Date().toISOString();
    const createdAt = existing?.createdAt ?? scenario.createdAt ?? now;
    const archived = scenario.status === "archived";
    const enabled = archived ? false : scenario.enabled ?? existing?.enabled ?? true;
    const disabled = !enabled;
    return {
        ...scenario,
        ...(archived
            ? {
                archiveReason: scenario.archiveReason ?? existing?.archiveReason,
                archivedAt: scenario.archivedAt ?? existing?.archivedAt ?? now,
                archivedBy: scenario.archivedBy ?? existing?.archivedBy,
                retentionUntil: normalizeRetentionUntil(scenario.retentionUntil ?? existing?.retentionUntil, now)
            }
            : { retentionUntil: undefined }),
        auditHold: Boolean(scenario.auditHold ?? existing?.auditHold),
        ...(scenario.auditHold ?? existing?.auditHold
            ? {
                auditHoldAt: scenario.auditHoldAt ?? existing?.auditHoldAt ?? now,
                auditHoldBy: scenario.auditHoldBy ?? existing?.auditHoldBy,
                auditHoldReason: scenario.auditHoldReason ?? existing?.auditHoldReason
            }
            : {}),
        createdAt,
        ...(disabled
            ? {
                disabledAt: scenario.disabledAt ?? existing?.disabledAt ?? now,
                disabledBy: scenario.disabledBy ?? existing?.disabledBy,
                disableReason: scenario.disableReason ?? existing?.disableReason
            }
            : {}),
        enabled,
        legalHold: Boolean(scenario.legalHold ?? existing?.legalHold),
        ...(scenario.legalHold ?? existing?.legalHold
            ? {
                legalHoldAt: scenario.legalHoldAt ?? existing?.legalHoldAt ?? now,
                legalHoldBy: scenario.legalHoldBy ?? existing?.legalHoldBy,
                legalHoldReason: scenario.legalHoldReason ?? existing?.legalHoldReason
            }
            : {}),
        priority: normalizeBotScenarioPriority(scenario.priority ?? existing?.priority),
        basePrompt: normalizeBasePrompt(scenario.basePrompt ?? existing?.basePrompt),
        draft: normalizeScenarioDraftOverlay(scenario.draft),
        sourceBindings: normalizeSourceBindings(scenario.sourceBindings ?? existing?.sourceBindings ?? []),
        tenantId: existing
            ? requireMatchingAutomationTenantId(existing.tenantId, scenario.tenantId)
            : requireAutomationTenantId(scenario.tenantId),
        triggerRules: normalizeBotTriggerRules(scenario.triggerRules ?? existing?.triggerRules ?? []),
        updatedAt: existing ? now : scenario.updatedAt ?? now
    };
}
function normalizeBasePrompt(value) {
    const text = String(value ?? "").trim();
    if (!text)
        return undefined;
    return text.slice(0, 4_000);
}
function normalizeRetentionUntil(value, now) {
    if (value && !Number.isNaN(Date.parse(value)))
        return new Date(value).toISOString();
    return new Date(new Date(now).getTime() + BOT_SCENARIO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
function isArchivedRetentionExpired(scenario, now) {
    return scenario.status === "archived"
        && Boolean(scenario.retentionUntil)
        && !Number.isNaN(Date.parse(String(scenario.retentionUntil)))
        && Date.parse(String(scenario.retentionUntil)) <= Date.parse(now);
}
function boundedPurgeLimit(limit) {
    return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : 50;
}
function normalizeBotScenarioPriority(value) {
    const parsed = Number(value ?? 0);
    return Number.isInteger(parsed) ? Math.max(-10_000, Math.min(10_000, parsed)) : 0;
}
function normalizeBotTriggerRules(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((item, index) => {
        if (!item || typeof item !== "object")
            return [];
        const record = item;
        const type = String(record.type ?? "");
        if (type !== "manual" && type !== "new_conversation" && type !== "phrase" && type !== "always_except")
            return [];
        const phrases = Array.isArray(record.phrases)
            ? record.phrases.map((phrase) => String(phrase).trim()).filter(Boolean).slice(0, 32)
            : [];
        const matchMode = ["exact", "contains", "tokens"].includes(String(record.matchMode))
            ? String(record.matchMode)
            : "contains";
        return [{
                id: String(record.id ?? `trigger-${index + 1}`).trim() || `trigger-${index + 1}`,
                ...(record.locale ? { locale: String(record.locale).trim() } : {}),
                ...((type === "phrase" || type === "always_except") ? { matchMode, phrases } : {}),
                priority: normalizeBotScenarioPriority(record.priority),
                type: type
            }];
    });
}
/** Draft overlay of a published scenario. Absent/invalid values stay undefined so no phantom draft appears. */
function normalizeScenarioDraftOverlay(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const record = value;
    const overlay = {
        updatedAt: typeof record.updatedAt === "string" && !Number.isNaN(Date.parse(record.updatedAt))
            ? new Date(record.updatedAt).toISOString()
            : new Date().toISOString()
    };
    if (typeof record.updatedBy === "string" && record.updatedBy.trim())
        overlay.updatedBy = record.updatedBy.trim();
    if (typeof record.name === "string" && record.name.trim())
        overlay.name = record.name.trim();
    if (Array.isArray(record.channels))
        overlay.channels = record.channels.map((item) => String(item)).filter(Boolean);
    if (record.basePrompt !== undefined) {
        const basePrompt = normalizeBasePrompt(record.basePrompt);
        if (basePrompt)
            overlay.basePrompt = basePrompt;
    }
    if (record.priority !== undefined)
        overlay.priority = normalizeBotScenarioPriority(record.priority);
    if (Array.isArray(record.flowNodes))
        overlay.flowNodes = clone(record.flowNodes);
    if (Array.isArray(record.flowEdges))
        overlay.flowEdges = clone(record.flowEdges);
    if (record.sourceBindings !== undefined)
        overlay.sourceBindings = normalizeSourceBindings(record.sourceBindings);
    if (record.triggerRules !== undefined)
        overlay.triggerRules = normalizeBotTriggerRules(record.triggerRules);
    const meaningful = Object.keys(overlay).some((key) => key !== "updatedAt" && key !== "updatedBy");
    return meaningful ? overlay : undefined;
}
function normalizeSourceBindings(value) {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    return value.flatMap((item) => {
        if (!item || typeof item !== "object")
            return [];
        const sourceId = String(item.sourceId ?? "").trim();
        if (!sourceId || seen.has(sourceId))
            return [];
        seen.add(sourceId);
        const sourceVersion = String(item.sourceVersion ?? "").trim();
        return [{ sourceId, ...(sourceVersion ? { sourceVersion } : {}) }];
    });
}
function normalizeBotScenarioVersionRecord(version) {
    return {
        ...version,
        basePrompt: normalizeBasePrompt(version.basePrompt),
        priority: normalizeBotScenarioPriority(version.priority),
        tenantId: requireAutomationTenantId(version.tenantId),
        triggerRules: normalizeVersionTriggerRules(version.triggerRules)
    };
}
/**
 * A version without snapshotted rules must stay `undefined` so the runtime
 * falls back to the scenario's rules (`version.triggerRules ?? scenario.…`).
 * Publish validation never produces an intentionally empty snapshot, so an
 * empty array is treated as "not snapshotted" too; coercing it to [] silently
 * erased phrase triggers of versions published before rules were snapshotted.
 */
function normalizeVersionTriggerRules(value) {
    if (value === undefined || value === null)
        return undefined;
    const rules = normalizeBotTriggerRules(value);
    return rules.length ? rules : undefined;
}
function normalizeBotPublishAuditEventRecord(event) {
    return {
        ...event,
        immutable: true,
        tenantId: requireAutomationTenantId(event.tenantId)
    };
}
function normalizeBotTestRunRecord(run) {
    return {
        ...run,
        tenantId: requireAutomationTenantId(run.tenantId)
    };
}
function normalizeProactiveExecutionWindow(window) {
    return {
        ...window,
        daysOfWeek: [...window.daysOfWeek],
        tenantId: requireAutomationTenantId(window.tenantId)
    };
}
function normalizeProactiveFrequencyCap(cap) {
    return {
        ...cap,
        tenantId: requireAutomationTenantId(cap.tenantId)
    };
}
function normalizeProactiveExperimentAssignment(assignment) {
    return {
        ...assignment,
        tenantId: requireAutomationTenantId(assignment.tenantId)
    };
}
function normalizeProactiveDeliveryAttempt(attempt) {
    return {
        ...attempt,
        tenantId: requireAutomationTenantId(attempt.tenantId)
    };
}
function normalizeProactiveDeliveryIdempotencyRecord(record) {
    return {
        ...record,
        result: clone(record.result),
        tenantId: requireAutomationTenantId(record.tenantId)
    };
}
function normalizeProactiveDeliveryAttribution(attribution) {
    return {
        ...attribution,
        tenantId: requireAutomationTenantId(attribution.tenantId)
    };
}
function normalizePublishIdempotencyRecord(record) {
    return {
        ...record,
        result: clone(record.result),
        tenantId: requireAutomationTenantId(record.tenantId)
    };
}
function normalizeWorkspaceAuditEvent(event) {
    return {
        ...clone(event),
        tenantId: requireAutomationTenantId(event.tenantId)
    };
}
function recordFromUnknown(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? clone(value)
        : {};
}
function toBotScenario(row) {
    return {
        ...(row.activeVersionId ? { activeVersionId: row.activeVersionId } : {}),
        auditHold: row.auditHold ?? false,
        ...(row.auditHoldAt ? { auditHoldAt: toIsoString(row.auditHoldAt) } : {}),
        ...(row.auditHoldBy ? { auditHoldBy: row.auditHoldBy } : {}),
        ...(row.auditHoldReason ? { auditHoldReason: row.auditHoldReason } : {}),
        ...(row.archiveReason ? { archiveReason: row.archiveReason } : {}),
        ...(row.archivedAt ? { archivedAt: toIsoString(row.archivedAt) } : {}),
        ...(row.archivedBy ? { archivedBy: row.archivedBy } : {}),
        ...(normalizeBasePrompt(row.basePrompt) ? { basePrompt: normalizeBasePrompt(row.basePrompt) } : {}),
        channels: clone(row.channels),
        createdAt: toIsoString(row.createdAt),
        ...(row.disabledAt ? { disabledAt: toIsoString(row.disabledAt) } : {}),
        ...(row.disabledBy ? { disabledBy: row.disabledBy } : {}),
        ...(row.disableReason ? { disableReason: row.disableReason } : {}),
        ...(normalizeScenarioDraftOverlay(row.draft) ? { draft: normalizeScenarioDraftOverlay(row.draft) } : {}),
        enabled: row.enabled ?? true,
        flowEdges: clone(row.flowEdges),
        flowNodes: clone(row.flowNodes),
        id: row.id,
        legalHold: row.legalHold ?? false,
        ...(row.legalHoldAt ? { legalHoldAt: toIsoString(row.legalHoldAt) } : {}),
        ...(row.legalHoldBy ? { legalHoldBy: row.legalHoldBy } : {}),
        ...(row.legalHoldReason ? { legalHoldReason: row.legalHoldReason } : {}),
        name: row.name,
        priority: normalizeBotScenarioPriority(row.priority),
        ...(row.retentionUntil ? { retentionUntil: toIsoString(row.retentionUntil) } : {}),
        schemaVersion: row.schemaVersion,
        status: row.status,
        tenantId: requireAutomationTenantId(row.tenantId),
        sourceBindings: normalizeSourceBindings(row.sourceBindings ?? []),
        triggerRules: normalizeBotTriggerRules(row.triggerRules ?? []),
        updatedAt: toIsoString(row.updatedAt)
    };
}
function toPrismaBotScenarioCreateInput(scenario) {
    return {
        activeVersionId: scenario.activeVersionId ?? null,
        auditHold: Boolean(scenario.auditHold),
        auditHoldAt: scenario.auditHoldAt ? new Date(scenario.auditHoldAt) : null,
        auditHoldBy: scenario.auditHoldBy ?? null,
        auditHoldReason: scenario.auditHoldReason ?? null,
        archiveReason: scenario.archiveReason ?? null,
        archivedAt: scenario.archivedAt ? new Date(scenario.archivedAt) : null,
        archivedBy: scenario.archivedBy ?? null,
        basePrompt: normalizeBasePrompt(scenario.basePrompt) ?? null,
        channels: clone(scenario.channels),
        createdAt: new Date(scenario.createdAt ?? new Date().toISOString()),
        disabledAt: scenario.disabledAt ? new Date(scenario.disabledAt) : null,
        disabledBy: scenario.disabledBy ?? null,
        disableReason: scenario.disableReason ?? null,
        draft: normalizeScenarioDraftOverlay(scenario.draft) ?? null,
        enabled: scenario.enabled ?? true,
        flowEdges: clone(scenario.flowEdges),
        flowNodes: clone(scenario.flowNodes),
        id: scenario.id,
        legalHold: Boolean(scenario.legalHold),
        legalHoldAt: scenario.legalHoldAt ? new Date(scenario.legalHoldAt) : null,
        legalHoldBy: scenario.legalHoldBy ?? null,
        legalHoldReason: scenario.legalHoldReason ?? null,
        name: scenario.name,
        priority: normalizeBotScenarioPriority(scenario.priority),
        retentionUntil: scenario.retentionUntil ? new Date(scenario.retentionUntil) : null,
        schemaVersion: scenario.schemaVersion,
        status: scenario.status,
        tenantId: requireAutomationTenantId(scenario.tenantId),
        sourceBindings: normalizeSourceBindings(scenario.sourceBindings ?? []),
        triggerRules: normalizeBotTriggerRules(scenario.triggerRules ?? []),
        updatedAt: new Date(scenario.updatedAt ?? new Date().toISOString())
    };
}
function toPrismaBotScenarioUpdateInput(scenario) {
    return {
        activeVersionId: scenario.activeVersionId ?? null,
        auditHold: Boolean(scenario.auditHold),
        auditHoldAt: scenario.auditHoldAt ? new Date(scenario.auditHoldAt) : null,
        auditHoldBy: scenario.auditHoldBy ?? null,
        auditHoldReason: scenario.auditHoldReason ?? null,
        archiveReason: scenario.archiveReason ?? null,
        archivedAt: scenario.archivedAt ? new Date(scenario.archivedAt) : null,
        archivedBy: scenario.archivedBy ?? null,
        basePrompt: normalizeBasePrompt(scenario.basePrompt) ?? null,
        channels: clone(scenario.channels),
        disabledAt: scenario.disabledAt ? new Date(scenario.disabledAt) : null,
        disabledBy: scenario.disabledBy ?? null,
        disableReason: scenario.disableReason ?? null,
        draft: normalizeScenarioDraftOverlay(scenario.draft) ?? null,
        enabled: scenario.enabled ?? true,
        flowEdges: clone(scenario.flowEdges),
        flowNodes: clone(scenario.flowNodes),
        name: scenario.name,
        legalHold: Boolean(scenario.legalHold),
        legalHoldAt: scenario.legalHoldAt ? new Date(scenario.legalHoldAt) : null,
        legalHoldBy: scenario.legalHoldBy ?? null,
        legalHoldReason: scenario.legalHoldReason ?? null,
        priority: normalizeBotScenarioPriority(scenario.priority),
        retentionUntil: scenario.retentionUntil ? new Date(scenario.retentionUntil) : null,
        schemaVersion: scenario.schemaVersion,
        status: scenario.status,
        tenantId: requireAutomationTenantId(scenario.tenantId),
        sourceBindings: normalizeSourceBindings(scenario.sourceBindings ?? []),
        triggerRules: normalizeBotTriggerRules(scenario.triggerRules ?? [])
    };
}
function toBotScenarioVersion(row) {
    return {
        ...(normalizeBasePrompt(row.basePrompt) ? { basePrompt: normalizeBasePrompt(row.basePrompt) } : {}),
        createdAt: toIsoString(row.createdAt),
        flowEdges: clone(row.flowEdges),
        flowNodes: clone(row.flowNodes),
        priority: normalizeBotScenarioPriority(row.priority),
        scenarioId: row.scenarioId,
        sourceBindings: normalizeSourceBindings(row.sourceBindings ?? []),
        status: row.status,
        tenantId: requireAutomationTenantId(row.tenantId),
        ...(normalizeVersionTriggerRules(row.triggerRules) ? { triggerRules: normalizeVersionTriggerRules(row.triggerRules) } : {}),
        versionId: row.versionId
    };
}
function toPrismaBotScenarioVersionCreateInput(version) {
    return {
        basePrompt: normalizeBasePrompt(version.basePrompt) ?? null,
        createdAt: new Date(version.createdAt),
        flowEdges: clone(version.flowEdges),
        flowNodes: clone(version.flowNodes),
        priority: normalizeBotScenarioPriority(version.priority),
        scenarioId: version.scenarioId,
        sourceBindings: normalizeSourceBindings(version.sourceBindings ?? []),
        status: version.status,
        tenantId: requireAutomationTenantId(version.tenantId),
        triggerRules: normalizeBotTriggerRules(version.triggerRules ?? []),
        versionId: version.versionId
    };
}
function toBotPublishAuditEvent(row) {
    return normalizeBotPublishAuditEventRecord({
        action: row.action,
        actor: row.actor,
        auditId: row.auditId,
        createdAt: toIsoString(row.createdAt),
        idempotencyKey: row.idempotencyKey,
        immutable: true,
        runtimeVersion: row.runtimeVersion,
        scenarioId: row.scenarioId,
        tenantId: row.tenantId,
        versionId: row.versionId
    });
}
function toPrismaBotPublishAuditEventCreateInput(event) {
    return {
        action: event.action,
        actor: event.actor,
        auditId: event.auditId,
        createdAt: new Date(event.createdAt),
        idempotencyKey: event.idempotencyKey,
        immutable: true,
        runtimeVersion: event.runtimeVersion,
        scenarioId: event.scenarioId,
        tenantId: requireAutomationTenantId(event.tenantId),
        versionId: event.versionId
    };
}
function toAutomationPublishIdempotencyRecord(row) {
    const result = clone(row.result);
    return {
        fingerprint: row.fingerprint,
        key: row.key,
        result,
        tenantId: requireAutomationTenantId(row.tenantId)
    };
}
function toPrismaAutomationPublishIdempotencyRecord(record) {
    const persisted = normalizePublishIdempotencyRecord(record);
    return {
        fingerprint: persisted.fingerprint,
        key: persisted.key,
        result: {
            ...clone(persisted.result),
            tenantId: persisted.tenantId
        },
        tenantId: persisted.tenantId
    };
}
function automationPublishIdempotencyWhere(tenantId, key) {
    return {
        tenantId_key: {
            key,
            tenantId: requireAutomationTenantId(tenantId)
        }
    };
}
function toAutomationBotTestRun(row) {
    return normalizeBotTestRunRecord({
        auditId: row.auditId,
        cases: clone(row.cases),
        queue: row.queue,
        scenarioId: row.scenarioId,
        status: row.status,
        tenantId: requireAutomationTenantId(row.tenantId),
        testRunId: row.testRunId
    });
}
function toPrismaAutomationBotTestRun(run) {
    return {
        auditId: run.auditId,
        cases: clone(run.cases),
        queue: run.queue,
        scenarioId: run.scenarioId,
        status: run.status,
        tenantId: requireAutomationTenantId(run.tenantId),
        testRunId: run.testRunId
    };
}
function toProactiveRule(row) {
    return {
        activeVariant: row.activeVariant ?? undefined,
        channels: clone(row.channels),
        cooldown: row.cooldown ?? undefined,
        id: row.id,
        segment: row.segment ?? undefined,
        status: row.status ?? undefined,
        tenantId: requireAutomationTenantId(row.tenantId)
    };
}
function toPrismaProactiveRule(rule) {
    return {
        activeVariant: rule.activeVariant ?? null,
        channels: clone(rule.channels),
        cooldown: rule.cooldown ?? null,
        id: rule.id,
        segment: rule.segment ?? null,
        status: rule.status ?? null,
        tenantId: requireAutomationTenantId(rule.tenantId)
    };
}
function toProactiveExecutionWindow(row) {
    return normalizeProactiveExecutionWindow({
        active: row.active,
        daysOfWeek: clone(row.daysOfWeek),
        endsAt: row.endsAt,
        ruleId: row.ruleId,
        startsAt: row.startsAt,
        tenantId: row.tenantId,
        timezone: row.timezone,
        windowId: row.windowId
    });
}
function toPrismaProactiveExecutionWindow(window) {
    return {
        active: window.active,
        daysOfWeek: clone(window.daysOfWeek),
        endsAt: window.endsAt,
        ruleId: window.ruleId,
        startsAt: window.startsAt,
        tenantId: window.tenantId,
        timezone: window.timezone,
        windowId: window.windowId
    };
}
function toProactiveFrequencyCap(row) {
    return normalizeProactiveFrequencyCap({
        active: row.active,
        capId: row.capId,
        limit: row.limit,
        period: row.period,
        resetAt: toIsoString(row.resetAt),
        ruleId: row.ruleId,
        tenantId: row.tenantId,
        used: row.used
    });
}
function toPrismaProactiveFrequencyCap(cap) {
    return {
        active: cap.active,
        capId: cap.capId,
        limit: cap.limit,
        period: cap.period,
        resetAt: new Date(cap.resetAt),
        ruleId: cap.ruleId,
        tenantId: cap.tenantId,
        used: cap.used
    };
}
function toProactiveExperimentAssignment(row) {
    return normalizeProactiveExperimentAssignment({
        assignedAt: toIsoString(row.assignedAt),
        assignmentId: row.assignmentId,
        experimentId: row.experimentId,
        ruleId: row.ruleId,
        subjectId: row.subjectId,
        tenantId: row.tenantId,
        variant: row.variant
    });
}
function toPrismaProactiveExperimentAssignment(assignment) {
    return {
        assignedAt: new Date(assignment.assignedAt),
        assignmentId: assignment.assignmentId,
        experimentId: assignment.experimentId,
        ruleId: assignment.ruleId,
        subjectId: assignment.subjectId,
        tenantId: assignment.tenantId,
        variant: assignment.variant
    };
}
function toProactiveDeliveryAttempt(row) {
    return normalizeProactiveDeliveryAttempt({
        attemptedAt: toIsoString(row.attemptedAt),
        attemptId: row.attemptId,
        channel: row.channel,
        descriptorId: row.descriptorId,
        ruleId: row.ruleId,
        status: row.status,
        subjectId: row.subjectId,
        tenantId: row.tenantId,
        traceId: row.traceId
    });
}
function toPrismaProactiveDeliveryAttempt(attempt) {
    return {
        attemptedAt: new Date(attempt.attemptedAt),
        attemptId: attempt.attemptId,
        channel: attempt.channel,
        descriptorId: attempt.descriptorId,
        ruleId: attempt.ruleId,
        status: attempt.status,
        subjectId: attempt.subjectId,
        tenantId: attempt.tenantId,
        traceId: attempt.traceId
    };
}
function toProactiveDeliveryIdempotencyRecord(row) {
    return normalizeProactiveDeliveryIdempotencyRecord({
        fingerprint: row.fingerprint,
        key: row.key,
        result: clone(row.result),
        ruleId: row.ruleId,
        subjectId: row.subjectId,
        tenantId: row.tenantId
    });
}
function toPrismaProactiveDeliveryIdempotencyRecord(record) {
    return {
        fingerprint: record.fingerprint,
        key: record.key,
        result: clone(record.result),
        ruleId: record.ruleId,
        subjectId: record.subjectId,
        tenantId: record.tenantId
    };
}
function toProactiveDeliveryAttribution(row) {
    return normalizeProactiveDeliveryAttribution({
        assignedAt: toIsoString(row.assignedAt),
        attributionId: row.attributionId,
        descriptorId: row.descriptorId,
        experimentId: row.experimentId,
        ruleId: row.ruleId,
        subjectId: row.subjectId,
        tenantId: row.tenantId,
        variant: row.variant
    });
}
function toPrismaProactiveDeliveryAttribution(attribution) {
    return {
        assignedAt: new Date(attribution.assignedAt),
        attributionId: attribution.attributionId,
        descriptorId: attribution.descriptorId,
        experimentId: attribution.experimentId,
        ruleId: attribution.ruleId,
        subjectId: attribution.subjectId,
        tenantId: attribution.tenantId,
        variant: attribution.variant
    };
}
class ProactiveFrequencyCapExhaustedError extends Error {
    constructor() {
        super("proactive_frequency_cap_exhausted");
    }
}
const PROACTIVE_DELIVERY_TRANSACTION_ATTEMPTS = 3;
class ProactiveFrequencyCapConflictError extends Error {
    constructor() {
        super("proactive_frequency_cap_conflict");
    }
}
function prepareProactiveFrequencyCapUpdates(caps, evaluatedAt) {
    const evaluationTime = Date.parse(evaluatedAt);
    if (!Number.isFinite(evaluationTime)) {
        throw new Error("proactive_delivery_evaluated_at_invalid");
    }
    const updates = [];
    for (const cap of caps) {
        const resetTime = Date.parse(cap.resetAt);
        if (!Number.isFinite(resetTime)) {
            throw new Error("proactive_frequency_cap_reset_invalid");
        }
        if (resetTime > evaluationTime && cap.used >= cap.limit) {
            return null;
        }
        const resetReached = resetTime <= evaluationTime;
        updates.push({
            previous: clone(cap),
            next: {
                ...clone(cap),
                resetAt: resetReached
                    ? rollProactiveFrequencyCapResetForward(cap.resetAt, cap.period, evaluationTime)
                    : cap.resetAt,
                used: (resetReached ? 0 : cap.used) + 1
            }
        });
    }
    return updates;
}
function rollProactiveFrequencyCapResetForward(resetAt, period, evaluationTime) {
    const nextReset = new Date(resetAt);
    while (nextReset.getTime() <= evaluationTime) {
        if (period === "hour") {
            nextReset.setUTCHours(nextReset.getUTCHours() + 1);
        }
        else if (period === "week") {
            nextReset.setUTCDate(nextReset.getUTCDate() + 7);
        }
        else {
            nextReset.setUTCDate(nextReset.getUTCDate() + 1);
        }
    }
    return nextReset.toISOString();
}
function replayProactiveDeliveryCommit(existing, input) {
    return {
        descriptorId: String(existing.result.descriptorId ?? input.descriptor.id),
        outcome: existing.fingerprint === input.idempotencyRecord.fingerprint ? "duplicate" : "conflicted",
        outboxEventId: String(existing.result.outboxEventId ?? input.outbox.id)
    };
}
function proactiveDeliveryCommitResult(outcome, input) {
    return {
        descriptorId: input.descriptor.id,
        outcome,
        outboxEventId: input.outbox.id
    };
}
function validateProactiveDeliveryCommitInput(input) {
    const tenantId = requireAutomationTenantId(input.tenantId);
    requireAutomationTenantId(input.descriptor.tenantId);
    requireAutomationTenantId(input.idempotencyRecord.tenantId);
    const descriptorKey = input.descriptor.idempotencyKey;
    if (!descriptorKey || descriptorKey !== input.idempotencyRecord.key) {
        throw new Error("proactive_delivery_idempotency_key_mismatch");
    }
    if (input.descriptor.requestFingerprint !== input.idempotencyRecord.fingerprint) {
        throw new Error("proactive_delivery_fingerprint_mismatch");
    }
    if (input.descriptor.tenantId !== tenantId || input.idempotencyRecord.tenantId !== tenantId) {
        throw new Error("proactive_delivery_tenant_mismatch");
    }
    if (input.idempotencyRecord.ruleId !== input.ruleId) {
        throw new Error("proactive_delivery_rule_mismatch");
    }
}
function toPrismaAtomicConversationOutboundDescriptor(descriptor) {
    return {
        auditId: descriptor.auditId,
        channel: descriptor.channel,
        conversationId: descriptor.conversationId,
        createdAt: new Date(descriptor.createdAt),
        deliveryState: descriptor.deliveryState,
        id: descriptor.id,
        idempotencyKey: descriptor.idempotencyKey,
        kind: descriptor.kind,
        messageId: descriptor.messageId,
        outboxEventId: descriptor.outboxEventId,
        payload: clone(descriptor.payload),
        requestFingerprint: descriptor.requestFingerprint,
        retryable: descriptor.retryable,
        status: descriptor.status,
        tenantId: descriptor.tenantId,
        traceId: descriptor.traceId
    };
}
function toPrismaAtomicOutboxEvent(outbox) {
    return {
        aggregateId: outbox.aggregateId,
        aggregateType: outbox.aggregateType,
        id: outbox.id,
        occurredAt: new Date(outbox.occurredAt),
        payload: clone(outbox.payload),
        queue: outbox.queue,
        status: outbox.status,
        traceId: outbox.traceId,
        type: outbox.type
    };
}
function toBotRuntimeInstance(row) {
    return {
        attempts: Number(row.attempts ?? 0),
        context: clone((row.context ?? {})),
        conversationId: String(row.conversationId),
        createdAt: toIsoString(row.createdAt),
        currentNodeId: String(row.currentNodeId),
        id: String(row.id),
        lastError: row.lastError == null ? null : String(row.lastError),
        nextAttemptAt: row.nextAttemptAt == null ? null : toIsoString(row.nextAttemptAt),
        scenarioId: String(row.scenarioId),
        status: String(row.status),
        tenantId: String(row.tenantId),
        updatedAt: toIsoString(row.updatedAt),
        versionId: String(row.versionId)
    };
}
function toBotRuntimeStep(row) {
    return {
        conversationId: String(row.conversationId),
        createdAt: toIsoString(row.createdAt),
        error: row.error == null ? null : String(row.error),
        handoffSummary: row.handoffSummary == null ? null : clone(row.handoffSummary),
        id: String(row.id),
        inputEvent: clone(row.inputEvent),
        inputEventId: String(row.inputEventId),
        lifecycleEvent: row.lifecycleEvent == null ? null : clone(row.lifecycleEvent),
        nodeId: String(row.nodeId),
        nodeType: String(row.nodeType),
        outcome: String(row.outcome),
        runtimeId: String(row.runtimeId),
        sideEffects: clone((row.sideEffects ?? [])),
        tenantId: String(row.tenantId),
        webhookResponse: row.webhookResponse == null ? null : clone(row.webhookResponse)
    };
}
function toBotRuntimeInstanceData(instance, includeIdentity) {
    return {
        ...(includeIdentity ? {
            id: instance.id,
            tenantId: instance.tenantId,
            conversationId: instance.conversationId,
            scenarioId: instance.scenarioId,
            versionId: instance.versionId,
            createdAt: new Date(instance.createdAt)
        } : {}),
        attempts: instance.attempts,
        context: clone(instance.context),
        currentNodeId: instance.currentNodeId,
        lastError: instance.lastError,
        nextAttemptAt: instance.nextAttemptAt ? new Date(instance.nextAttemptAt) : null,
        status: instance.status,
        updatedAt: new Date(instance.updatedAt)
    };
}
function toBotRuntimeStepData(step) {
    return {
        ...clone(step),
        createdAt: new Date(step.createdAt)
    };
}
function runtimeSideEffectsFromStep(step) {
    return step.sideEffects.map((sideEffect, index) => ({
        attempts: 0,
        conversationId: step.conversationId,
        createdAt: step.createdAt,
        deadLetteredAt: null,
        deliveredAt: null,
        id: `bot_effect_${step.id}_${index}`,
        kind: String(sideEffect.kind),
        lastError: null,
        leaseUntil: null,
        // Закрытие обращения откладывается на пару секунд: прощальное сообщение
        // бота должно среконсилиться раньше, чем диалог станет закрытым.
        nextAttemptAt: String(sideEffect.kind) === "conversation_close"
            ? new Date(Date.parse(step.createdAt) + 3_000).toISOString()
            : step.createdAt,
        payload: clone(sideEffect),
        status: "pending",
        stepId: step.id,
        tenantId: step.tenantId,
        updatedAt: step.createdAt
    }));
}
function toBotRuntimeSideEffect(row) {
    return {
        attempts: Number(row.attempts ?? 0), conversationId: String(row.conversationId), createdAt: toIsoString(row.createdAt),
        deadLetteredAt: row.deadLetteredAt == null ? null : toIsoString(row.deadLetteredAt),
        deliveredAt: row.deliveredAt == null ? null : toIsoString(row.deliveredAt), id: String(row.id),
        kind: String(row.kind), lastError: row.lastError == null ? null : String(row.lastError),
        leaseUntil: row.leaseUntil == null ? null : toIsoString(row.leaseUntil),
        nextAttemptAt: row.nextAttemptAt == null ? null : toIsoString(row.nextAttemptAt), payload: clone(row.payload),
        status: String(row.status), stepId: String(row.stepId), tenantId: String(row.tenantId), updatedAt: toIsoString(row.updatedAt)
    };
}
function toBotRuntimeSideEffectData(effect, includeIdentity) {
    return {
        ...(includeIdentity ? { id: effect.id, stepId: effect.stepId, tenantId: effect.tenantId, conversationId: effect.conversationId, kind: effect.kind, createdAt: new Date(effect.createdAt) } : {}),
        attempts: effect.attempts, deadLetteredAt: effect.deadLetteredAt ? new Date(effect.deadLetteredAt) : null,
        deliveredAt: effect.deliveredAt ? new Date(effect.deliveredAt) : null, lastError: effect.lastError,
        leaseUntil: effect.leaseUntil ? new Date(effect.leaseUntil) : null, nextAttemptAt: effect.nextAttemptAt ? new Date(effect.nextAttemptAt) : null,
        payload: clone(effect.payload), status: effect.status, updatedAt: new Date(effect.updatedAt)
    };
}
function isPrismaUniqueConstraintError(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
function isPrismaTransactionConflictError(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2034");
}
function pruneUndefined(input) {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
function toIsoString(value) {
    return value instanceof Date ? value.toISOString() : value;
}
function requireAutomationTenantId(value) {
    const tenantId = String(value ?? "").trim();
    if (!tenantId) {
        throw new Error("automation_tenant_required");
    }
    return tenantId;
}
function normalizeScenarioAuditEvent(event) {
    return { ...clone(event), actor: String(event.actor).trim() || "automation-admin", actorType: event.actorType === "system" ? "system" : "user",
        immutable: true, payload: clone(event.payload ?? {}), reason: String(event.reason).trim() || "unspecified",
        scenarioId: String(event.scenarioId).trim(), tenantId: requireAutomationTenantId(event.tenantId), traceId: String(event.traceId).trim() || "automation-audit" };
}
function hasAutomationTenantId(value) {
    return Boolean(String(value.tenantId ?? "").trim());
}
function requireMatchingAutomationTenantId(existing, incoming) {
    const existingTenantId = requireAutomationTenantId(existing);
    const incomingTenantId = requireAutomationTenantId(incoming);
    if (existingTenantId !== incomingTenantId) {
        throw new Error("automation_tenant_mismatch");
    }
    return existingTenantId;
}
function clone(value) {
    if (value === undefined) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=automation.repository.js.map