import { InMemoryStore } from "@support-communication/database";
import { Prisma } from "@prisma/client";
const ROUTING_STATE_SNAPSHOT_ID = "default";
let defaultRepository = null;
export class RoutingRepository {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    static default() {
        if (defaultRepository) {
            return defaultRepository;
        }
        defaultRepository = RoutingRepository.inMemory();
        return defaultRepository;
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static clearDefault() {
        defaultRepository = null;
    }
    static inMemory(seed) {
        const resolved = seed ?? seedRoutingState();
        return new RoutingRepository(createDurableRoutingRepository(new InMemoryStore(normalizeState(resolved))));
    }
    static prisma({ client, fallback }) {
        return new RoutingRepository(new PrismaRoutingRepository(client, fallback));
    }
    applyRescueReturnTransition(input) {
        return this.adapter.applyRescueReturnTransition(input);
    }
    applySlaTimerTransition(input) {
        return this.adapter.applySlaTimerTransition(input);
    }
    claimJob(input) {
        return this.adapter.claimJob(input);
    }
    findOperatorCapacity(capacityId, scope = {}) {
        return this.adapter.findOperatorCapacity(capacityId, scope);
    }
    findOperatorCapacityByOperatorChannel(tenantId, operatorId, channel) {
        return this.adapter.findOperatorCapacityByOperatorChannel(tenantId, operatorId, channel);
    }
    findQueueMembership(membershipId, scope = {}) {
        return this.adapter.findQueueMembership(membershipId, scope);
    }
    findRoutingRule(ruleId, scope = {}) {
        return this.adapter.findRoutingRule(ruleId, scope);
    }
    findRoutingRuleByChannel(tenantId, channel) {
        return this.adapter.findRoutingRuleByChannel(tenantId, channel);
    }
    hydrateStateSnapshot() {
        return this.adapter.hydrateStateSnapshot();
    }
    listJobs() {
        return this.adapter.listJobs();
    }
    listOperatorCapacities(filters = {}) {
        return this.adapter.listOperatorCapacities(filters);
    }
    listQueueMemberships(filters = {}) {
        return this.adapter.listQueueMemberships(filters);
    }
    listRoutingAnalyticsRows(filters = {}) {
        return this.adapter.listRoutingAnalyticsRows(filters);
    }
    listRoutingRules(filters = {}) {
        return this.adapter.listRoutingRules(filters);
    }
    readState() {
        return this.adapter.readState();
    }
    saveJob(job) {
        return this.adapter.saveJob(job);
    }
    saveBatchRoutingTransition(input) {
        return this.adapter.saveBatchRoutingTransition(input);
    }
    saveManualRoutingTransition(input) {
        return this.adapter.saveManualRoutingTransition(input);
    }
    saveOperatorCapacity(capacity) {
        return this.adapter.saveOperatorCapacity(capacity);
    }
    saveQueueMembership(membership) {
        return this.adapter.saveQueueMembership(membership);
    }
    saveRoutingAnalyticsRow(row) {
        return this.adapter.saveRoutingAnalyticsRow(row);
    }
    saveRoutingRule(rule) {
        return this.adapter.saveRoutingRule(rule);
    }
    saveState(state) {
        return this.adapter.saveState(state);
    }
    saveStateWithLifecycleEvents(state, events) {
        return this.adapter.saveStateWithLifecycleEvents(state, events);
    }
}
class PrismaRoutingRepository {
    client;
    stateCache;
    constructor(client, _fallback) {
        this.client = client;
        void _fallback;
        this.stateCache = seedRoutingState();
    }
    async applyRescueReturnTransition(input) {
        const result = await this.withRoutingTransaction(async (client) => {
            const row = await client.routingJob.findUnique({ where: { id: input.jobId } });
            const currentJob = row ? toRoutingJobDescriptor(row) : undefined;
            const conversationId = typeof (currentJob ?? { conversationId: input.fallbackConversationId }).conversationId === "string"
                ? (currentJob ?? { conversationId: input.fallbackConversationId }).conversationId
                : null;
            if (!currentJob) {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "job_not_claimed") };
            }
            if (currentJob.queue !== "rescue-return") {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "unsupported_queue") };
            }
            if (currentJob.action !== "return_to_sla_queue") {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "unsupported_action") };
            }
            if (!conversationId) {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "missing_conversation_id") };
            }
            if (currentJob.status !== "claimed") {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "job_not_claimed") };
            }
            if (currentJob.leaseOwner && currentJob.leaseOwner !== input.leaseOwner) {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "lease_lost") };
            }
            const snapshot = await this.readCurrentStateSnapshot(client);
            const conversation = snapshot.state.conversations.find((item) => item.id === conversationId);
            if (!conversation) {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "conversation_not_found") };
            }
            if (conversation.rescue?.state !== "active") {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "not_active_rescue") };
            }
            const previousOperatorId = conversation.operatorId ?? null;
            const rescue = conversation.rescue;
            const tenantContext = resolveRescueReturnTenantContext(input, conversation);
            if ("reason" in tenantContext) {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, tenantContext.reason) };
            }
            const tenantId = tenantContext.tenantId;
            const completedJob = {
                ...currentJob,
                completedAt: input.completedAt,
                leaseExpiresAt: undefined,
                leaseOwner: undefined,
                status: "completed"
            };
            const analyticsRow = {
                channel: conversation.channel,
                conversationId,
                eventKind: "auto_return",
                fromOperatorId: previousOperatorId,
                id: `analytics_auto_return_${input.jobId}`,
                occurredAt: input.completedAt,
                source: "rescue-return-worker",
                tenantId,
                toOperatorId: null
            };
            const nextState = normalizeState({
                ...snapshot.state,
                conversations: snapshot.state.conversations.map((item) => item.id === conversationId
                    ? {
                        ...item,
                        operatorId: undefined,
                        rescue: {
                            ...item.rescue,
                            state: "returned_to_queue"
                        },
                        slaTone: "hold",
                        status: "queued"
                    }
                    : item),
                operators: snapshot.state.operators.map((operator) => operator.id === previousOperatorId && operator.tenantId === tenantId
                    ? {
                        ...operator,
                        chats: Math.max(0, operator.chats - 1),
                        rescueActive: Math.max(0, operator.rescueActive - 1)
                    }
                    : operator),
                queues: snapshot.state.queues.map((queue) => queue.channel === conversation.channel && queue.tenantId === tenantId
                    ? {
                        ...queue,
                        active: Math.max(0, queue.active - 1),
                        waiting: queue.waiting + 1
                    }
                    : queue),
                rescueReportRows: [
                    ...snapshot.state.rescueReportRows,
                    {
                        channel: conversation.channel,
                        conversationId,
                        digest: "daily_rescue",
                        operatorId: previousOperatorId,
                        outcome: "returned_to_queue",
                        reason: rescue.reason,
                        resolution: "Auto-returned to SLA queue after rescue timer expired",
                        tenantId,
                        timerSeconds: rescue.durationSeconds
                    }
                ]
            });
            const jobCreate = toPrismaRoutingJobCreateInput(completedJob);
            const jobUpdate = await client.routingJob.updateMany({
                data: toPrismaRoutingJobUpdateInput(jobCreate),
                where: { id: input.jobId, leaseOwner: input.leaseOwner ?? null, queue: "rescue-return", status: "claimed" }
            });
            if (jobUpdate.count !== 1) {
                return { outcome: skippedRescueReturn(input.jobId, conversationId, "job_not_claimed") };
            }
            if (client.conversation) {
                const canonicalUpdate = await client.conversation.updateMany({
                    data: {
                        operatorId: null,
                        operatorName: null,
                        rescueState: { ...rescue, state: "returned_to_queue" },
                        slaTone: "hold",
                        status: "queued",
                        updatedAt: new Date(input.completedAt)
                    },
                    where: { id: conversationId, operatorId: previousOperatorId, status: conversation.status, tenantId }
                });
                if (canonicalUpdate.count !== 1)
                    throw new Error(`routing_rescue_canonical_cas_conflict:${conversationId}`);
            }
            const analyticsCreate = toPrismaRoutingAnalyticsCreateInput(analyticsRow);
            const persistedAnalytics = await client.routingAnalyticsRow.upsert({
                create: analyticsCreate,
                update: toPrismaRoutingAnalyticsUpdateInput(analyticsCreate),
                where: { id: analyticsRow.id }
            });
            const nextVersion = await this.saveStateSnapshot(nextState, client, snapshot.version);
            await appendLifecycleEvent(client, routingWorkerLifecycleEvent({
                action: "auto_return",
                completedAt: input.completedAt,
                conversationId,
                data: {
                    fromOperatorId: previousOperatorId,
                    fromStatus: conversation.status,
                    jobId: input.jobId,
                    toStatus: "queued"
                },
                eventType: "rescue.auto_returned",
                jobId: input.jobId,
                tenantId
            }));
            const outcome = appliedRescueReturn(input, conversation, previousOperatorId);
            return {
                analyticsRow: toRoutingAnalyticsRow(persistedAnalytics),
                completedJob,
                nextState,
                nextVersion,
                outcome
            };
        });
        if (result.completedJob && result.nextState && result.nextVersion !== undefined) {
            this.stateCache = normalizeState({
                ...this.stateCache,
                ...result.nextState,
                jobs: upsertById(this.stateCache.jobs, result.completedJob),
                routingAnalyticsRows: result.analyticsRow
                    ? upsertById(this.stateCache.routingAnalyticsRows, result.analyticsRow)
                    : this.stateCache.routingAnalyticsRows
            });
        }
        return clone(result.outcome);
    }
    async applySlaTimerTransition(input) {
        const result = await this.withRoutingTransaction(async (client) => {
            const row = await client.routingJob.findUnique({ where: { id: input.jobId } });
            const currentJob = row ? toRoutingJobDescriptor(row) : undefined;
            if (!currentJob || currentJob.status !== "claimed") {
                return { outcome: skippedSlaTimer(input, "job_not_claimed") };
            }
            if (currentJob.leaseOwner && currentJob.leaseOwner !== input.leaseOwner) {
                return { outcome: skippedSlaTimer(input, "lease_lost") };
            }
            if (currentJob.queue !== "sla-timers") {
                return { outcome: skippedSlaTimer(input, "unsupported_queue") };
            }
            if (currentJob.action !== input.action) {
                return { outcome: skippedSlaTimer(input, "unsupported_action") };
            }
            if (typeof currentJob.conversationId === "string" && currentJob.conversationId !== input.conversationId) {
                return { outcome: skippedSlaTimer(input, "conversation_mismatch") };
            }
            const snapshot = await this.readCurrentStateSnapshot(client);
            const conversationId = typeof currentJob.conversationId === "string" ? currentJob.conversationId : input.conversationId;
            const conversation = snapshot.state.conversations.find((item) => item.id === conversationId);
            if (!conversation) {
                return { outcome: skippedSlaTimer({ ...input, conversationId }, "conversation_not_found") };
            }
            if (input.action === "resume_sla" && conversation.status !== "paused") {
                return { outcome: skippedSlaTimer({ ...input, conversationId }, "not_paused") };
            }
            if (input.action === "mark_sla_overdue" && conversation.status !== "active" && conversation.status !== "assigned") {
                return { outcome: skippedSlaTimer({ ...input, conversationId }, "not_active") };
            }
            const tenantId = input.tenantId ?? conversation.tenantId;
            if (!tenantId || (input.tenantId && conversation.tenantId !== input.tenantId)) {
                return { outcome: skippedSlaTimer({ ...input, conversationId }, "tenant_context_mismatch") };
            }
            const nextState = normalizeState({
                ...snapshot.state,
                conversations: snapshot.state.conversations.map((conversation) => conversation.id === conversationId
                    ? {
                        ...conversation,
                        slaTone: input.action === "resume_sla" ? "ok" : input.toSlaTone ?? "danger",
                        status: input.toStatus
                    }
                    : conversation)
            });
            const completedJob = {
                ...currentJob,
                completedAt: input.completedAt,
                leaseExpiresAt: undefined,
                leaseOwner: undefined,
                status: "completed"
            };
            const jobCreate = toPrismaRoutingJobCreateInput(completedJob);
            const jobUpdate = await client.routingJob.updateMany({
                data: toPrismaRoutingJobUpdateInput(jobCreate),
                where: { id: input.jobId, leaseOwner: input.leaseOwner ?? null, queue: "sla-timers", status: "claimed" }
            });
            if (jobUpdate.count !== 1) {
                return { outcome: skippedSlaTimer(input, "job_not_claimed") };
            }
            if (client.conversation) {
                const canonicalUpdate = await client.conversation.updateMany({
                    data: {
                        operatorId: conversation.operatorId ?? null,
                        slaTone: input.action === "resume_sla" ? "ok" : input.toSlaTone ?? "danger",
                        status: input.toStatus,
                        updatedAt: new Date(input.completedAt)
                    },
                    where: { id: conversationId, operatorId: conversation.operatorId ?? null, status: conversation.status, tenantId }
                });
                if (canonicalUpdate.count !== 1)
                    throw new Error(`routing_sla_canonical_cas_conflict:${conversationId}`);
            }
            const nextVersion = await this.saveStateSnapshot(nextState, client, snapshot.version);
            await appendLifecycleEvent(client, routingWorkerLifecycleEvent({
                action: input.action,
                completedAt: input.completedAt,
                conversationId,
                data: {
                    fromSlaTone: conversation.slaTone,
                    fromStatus: conversation.status,
                    jobId: input.jobId,
                    toSlaTone: input.action === "resume_sla" ? "ok" : input.toSlaTone ?? "danger",
                    toStatus: input.toStatus
                },
                eventType: input.action === "resume_sla" ? "sla.resumed" : "sla.overdue",
                jobId: input.jobId,
                tenantId
            }));
            const appliedInput = { ...input, conversationId };
            return {
                completedJob,
                nextState,
                nextVersion,
                outcome: appliedSlaTimer(appliedInput)
            };
        });
        if (result.completedJob && result.nextState && result.nextVersion !== undefined) {
            this.stateCache = normalizeState({
                ...this.stateCache,
                ...result.nextState,
                jobs: upsertById(this.stateCache.jobs, result.completedJob)
            });
        }
        return clone(result.outcome);
    }
    async claimJob(input) {
        const row = await this.client.routingJob.findUnique({ where: { id: input.jobId } });
        const current = row ? toRoutingJobDescriptor(row) : undefined;
        if (!current
            || current.queue !== input.queue
            || (current.status ?? null) !== input.expectedStatus
            || (current.leaseExpiresAt ?? null) !== (input.expectedLeaseExpiresAt ?? null)
            || (current.leaseOwner ?? null) !== (input.expectedLeaseOwner ?? null)) {
            return undefined;
        }
        const claimedAt = new Date(input.claimedAt);
        const leaseDurationMs = positiveLeaseDuration(input.leaseDurationMs);
        const claimed = {
            ...current,
            claimedAt: input.claimedAt,
            completedAt: undefined,
            leaseExpiresAt: new Date(claimedAt.getTime() + leaseDurationMs).toISOString(),
            leaseOwner: input.workerId?.trim() || `routing-worker:${process.pid}`,
            status: "claimed"
        };
        const create = toPrismaRoutingJobCreateInput(claimed);
        const result = await this.client.routingJob.updateMany({
            data: toPrismaRoutingJobUpdateInput(create),
            where: {
                id: input.jobId,
                leaseExpiresAt: input.expectedLeaseExpiresAt ? new Date(input.expectedLeaseExpiresAt) : null,
                leaseOwner: input.expectedLeaseOwner ?? null,
                queue: input.queue,
                status: input.expectedStatus
            }
        });
        if (result.count !== 1) {
            return undefined;
        }
        this.stateCache = normalizeState({
            ...this.stateCache,
            jobs: upsertById(this.stateCache.jobs, claimed)
        });
        return clone(claimed);
    }
    async findOperatorCapacity(capacityId, scope = {}) {
        const row = await this.client.operatorCapacity.findUnique({ where: { id: capacityId } });
        return row && isRoutingRecordInScope(row.tenantId, scope) ? toOperatorCapacityRecord(row) : undefined;
    }
    async findOperatorCapacityByOperatorChannel(tenantId, operatorId, channel) {
        const row = await this.client.operatorCapacity.findFirst({
            where: { channel, operatorId, tenantId }
        });
        return row ? toOperatorCapacityRecord(row) : undefined;
    }
    async findQueueMembership(membershipId, scope = {}) {
        const row = await this.client.queueMembership.findUnique({ where: { id: membershipId } });
        return row && isRoutingRecordInScope(row.tenantId, scope) ? toQueueMembershipRecord(row) : undefined;
    }
    async findRoutingRule(ruleId, scope = {}) {
        const row = await this.client.routingRule.findUnique({ where: { id: ruleId } });
        return row && isRoutingRecordInScope(row.tenantId, scope) ? toRoutingRuleRecord(row) : undefined;
    }
    async findRoutingRuleByChannel(tenantId, channel) {
        const row = await this.client.routingRule.findFirst({
            where: { channel, enabled: true, tenantId }
        });
        return row ? toRoutingRuleRecord(row) : undefined;
    }
    async hydrateStateSnapshot() {
        let snapshot = await this.client.routingStateSnapshot.findUnique({
            where: { id: ROUTING_STATE_SNAPSHOT_ID }
        });
        if (!snapshot) {
            snapshot = await this.client.routingStateSnapshot.create({
                data: toPrismaRoutingStateSnapshotCreateInput(seedRoutingState())
            });
        }
        const snapshotState = toRoutingStateFromSnapshot(snapshot, seedRoutingState());
        this.stateCache = normalizeState({
            ...snapshotState,
            jobs: await this.listJobs(),
            operatorCapacities: await this.listOperatorCapacities(),
            queueMemberships: await this.listQueueMemberships(),
            routingAnalyticsRows: await this.listRoutingAnalyticsRows(),
            routingRules: await this.listRoutingRules()
        });
        return clone(this.stateCache);
    }
    async listJobs() {
        const rows = await this.client.routingJob.findMany({
            orderBy: { updatedAt: "desc" }
        });
        return rows.map(toRoutingJobDescriptor);
    }
    async listOperatorCapacities(filters = {}) {
        const rows = await this.client.operatorCapacity.findMany({
            orderBy: { updatedAt: "desc" },
            ...(filters.tenantId || filters.channel || filters.operatorId ? { where: operatorCapacityWhere(filters) } : {})
        });
        return rows.map(toOperatorCapacityRecord);
    }
    async listQueueMemberships(filters = {}) {
        const rows = await this.client.queueMembership.findMany({
            orderBy: { updatedAt: "desc" },
            ...(filters.tenantId || filters.queueId || filters.operatorId || filters.active !== undefined ? { where: queueMembershipWhere(filters) } : {})
        });
        return rows.map(toQueueMembershipRecord);
    }
    async listRoutingAnalyticsRows(filters = {}) {
        const rows = await this.client.routingAnalyticsRow.findMany({
            orderBy: { occurredAt: "desc" },
            ...(filters.tenantId || filters.eventKind ? { where: routingAnalyticsWhere(filters) } : {})
        });
        return rows.map(toRoutingAnalyticsRow);
    }
    async listRoutingRules(filters = {}) {
        const rows = await this.client.routingRule.findMany({
            orderBy: { updatedAt: "desc" },
            ...(filters.tenantId || filters.channel || filters.enabled !== undefined ? { where: routingRuleWhere(filters) } : {})
        });
        return rows.map(toRoutingRuleRecord);
    }
    readState() {
        return clone(this.stateCache);
    }
    async saveJob(job) {
        const create = toPrismaRoutingJobCreateInput(job);
        const row = await this.client.routingJob.upsert({
            create,
            update: toPrismaRoutingJobUpdateInput(create),
            where: { id: create.id }
        });
        const persisted = toRoutingJobDescriptor(row);
        this.stateCache = normalizeState({
            ...this.stateCache,
            jobs: upsertById(this.stateCache.jobs, persisted)
        });
        return persisted;
    }
    async saveBatchRoutingTransition(input) {
        if (!this.client.$transaction || !this.client.conversation || !this.client.conversationRealtimeEvent) {
            throw new Error("prisma_batch_routing_delegates_required");
        }
        const normalized = normalizeState(input.state);
        if (!input.transitions.length || input.lifecycleEvents.length !== input.transitions.length || input.realtimeEvents.length !== input.transitions.length) {
            throw new Error("routing_batch_transition_invalid");
        }
        const result = await this.withRoutingTransaction(async (client) => {
            for (const transition of input.transitions) {
                const updated = await client.conversation.updateMany({
                    data: {
                        operatorId: transition.operatorId,
                        ...(transition.operatorName !== undefined ? { operatorName: transition.operatorName } : {}),
                        slaTone: transition.slaTone,
                        status: transition.status,
                        ...(transition.teamId !== undefined ? { teamId: transition.teamId } : {}),
                        updatedAt: new Date(input.realtimeEvents[0].occurredAt)
                    },
                    where: {
                        id: transition.conversationId,
                        operatorId: transition.expectedOperatorId,
                        status: transition.expectedStatus,
                        tenantId: input.tenantId
                    }
                });
                if (updated.count !== 1)
                    throw new Error(`routing_batch_conversation_cas_conflict:${transition.conversationId}`);
            }
            const nextVersion = await this.saveStateSnapshot(normalized, client);
            const persistedState = await this.saveStateSideTables(normalized, client, false);
            for (const event of input.lifecycleEvents)
                await appendLifecycleEvent(client, event);
            for (const event of input.realtimeEvents)
                await appendRealtimeEvent(client, event);
            return { nextVersion, persistedState };
        });
        this.stateCache = result.persistedState;
        return clone(this.stateCache);
    }
    async saveManualRoutingTransition(input) {
        const conversationDelegate = this.client.conversation;
        const realtimeDelegate = this.client.conversationRealtimeEvent;
        if (!this.client.$transaction || !conversationDelegate || !realtimeDelegate) {
            throw new Error("prisma_manual_routing_delegates_required");
        }
        const normalized = normalizeState(input.state);
        const conversation = normalized.conversations.find((item) => item.id === input.conversationId && item.tenantId === input.tenantId);
        if (!conversation) {
            throw new Error("routing_manual_transition_conversation_missing");
        }
        assertManualTransitionEnvelope(input, conversation);
        const result = await this.withRoutingTransaction(async (client) => {
            const updated = await client.conversation.updateMany({
                data: {
                    operatorId: conversation.operatorId ?? null,
                    ...(input.operatorName !== undefined ? { operatorName: input.operatorName } : {}),
                    ...(input.queueId ? { queueId: input.queueId } : input.action === "return_queue" ? { queueId: conversation.channel } : {}),
                    rescueState: conversation.rescue ? conversation.rescue : Prisma.JsonNull,
                    slaTone: conversation.slaTone,
                    status: conversation.status,
                    ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
                    updatedAt: new Date(input.realtimeEvent.occurredAt)
                },
                where: {
                    id: input.conversationId,
                    operatorId: input.expectedOperatorId,
                    status: input.expectedStatus,
                    tenantId: input.tenantId,
                    ...(input.expectedUpdatedAt ? { updatedAt: new Date(input.expectedUpdatedAt) } : {})
                }
            });
            if (updated.count !== 1) {
                const actual = client.conversation?.findUnique
                    ? await client.conversation.findUnique({ where: { id: input.conversationId } })
                    : null;
                throw new Error(`routing_conversation_cas_conflict:${JSON.stringify({
                    actual: actual ? { operatorId: actual.operatorId, status: actual.status, tenantId: actual.tenantId, updatedAt: actual.updatedAt.toISOString() } : null,
                    expected: { operatorId: input.expectedOperatorId, status: input.expectedStatus, tenantId: input.tenantId, updatedAt: input.expectedUpdatedAt ?? null },
                    id: input.conversationId
                })}`);
            }
            const nextVersion = await this.saveStateSnapshot(normalized, client);
            const persistedState = await this.saveStateSideTables(normalized, client, false);
            for (const event of input.lifecycleEvents) {
                await appendLifecycleEvent(client, event);
            }
            await appendRealtimeEvent(client, input.realtimeEvent);
            return { nextVersion, persistedState };
        });
        this.stateCache = result.persistedState;
        return clone(this.stateCache);
    }
    async saveOperatorCapacity(capacity) {
        const normalized = normalizeOperatorCapacityRecord(capacity);
        const existing = await this.findOperatorCapacityByOperatorChannel(normalized.tenantId, normalized.operatorId, normalized.channel);
        assertNaturalKeyAvailable(existing ? [existing] : [], normalized, isSameOperatorCapacityNaturalKey, "operator_capacity_natural_key_conflict");
        const create = toPrismaOperatorCapacityCreateInput(capacity);
        const row = await this.client.operatorCapacity.upsert({
            create,
            update: toPrismaOperatorCapacityUpdateInput(create),
            where: { id: capacity.id }
        });
        const persisted = toOperatorCapacityRecord(row);
        this.stateCache = normalizeState({
            ...this.stateCache,
            operatorCapacities: upsertById(this.stateCache.operatorCapacities, persisted)
        });
        return persisted;
    }
    async saveQueueMembership(membership) {
        const normalized = normalizeQueueMembershipRecord(membership);
        const existing = await this.listQueueMemberships({
            operatorId: normalized.operatorId,
            queueId: normalized.queueId,
            tenantId: normalized.tenantId
        });
        assertNaturalKeyAvailable(existing, normalized, isSameQueueMembershipNaturalKey, "queue_membership_natural_key_conflict");
        const create = toPrismaQueueMembershipCreateInput(membership);
        const row = await this.client.queueMembership.upsert({
            create,
            update: toPrismaQueueMembershipUpdateInput(create),
            where: { id: membership.id }
        });
        const persisted = toQueueMembershipRecord(row);
        this.stateCache = normalizeState({
            ...this.stateCache,
            queueMemberships: upsertById(this.stateCache.queueMemberships, persisted)
        });
        return persisted;
    }
    async saveRoutingAnalyticsRow(row) {
        const create = toPrismaRoutingAnalyticsCreateInput(row);
        const persisted = await this.client.routingAnalyticsRow.upsert({
            create,
            update: toPrismaRoutingAnalyticsUpdateInput(create),
            where: { id: row.id }
        });
        const normalized = toRoutingAnalyticsRow(persisted);
        this.stateCache = normalizeState({
            ...this.stateCache,
            routingAnalyticsRows: upsertById(this.stateCache.routingAnalyticsRows, normalized)
        });
        return normalized;
    }
    async saveRoutingRule(rule) {
        const normalized = normalizeRoutingRuleRecord(rule);
        const existing = await this.client.routingRule.findFirst({
            where: { channel: normalized.channel, tenantId: normalized.tenantId }
        });
        assertNaturalKeyAvailable(existing ? [toRoutingRuleRecord(existing)] : [], normalized, isSameRoutingRuleNaturalKey, "routing_rule_natural_key_conflict");
        const create = toPrismaRoutingRuleCreateInput(rule);
        const row = await this.client.routingRule.upsert({
            create,
            update: toPrismaRoutingRuleUpdateInput(create),
            where: { id: rule.id }
        });
        const persisted = toRoutingRuleRecord(row);
        this.stateCache = normalizeState({
            ...this.stateCache,
            routingRules: upsertById(this.stateCache.routingRules, persisted)
        });
        return persisted;
    }
    async saveState(state) {
        const normalized = normalizeState(state);
        await this.assertStateNaturalKeys(normalized);
        const persistedState = await this.withRoutingTransaction(async (client) => {
            await this.saveStateSnapshot(normalized, client);
            return this.saveStateSideTables(normalized, client, false);
        });
        this.stateCache = persistedState;
        return clone(this.stateCache);
    }
    async saveStateWithLifecycleEvents(state, events) {
        const normalized = normalizeState(state);
        await this.assertStateNaturalKeys(normalized);
        const result = await this.withRoutingTransaction(async (client) => {
            const nextVersion = await this.saveStateSnapshot(normalized, client);
            const persistedState = await this.saveStateSideTables(normalized, client, false);
            for (const event of events) {
                await appendLifecycleEvent(client, event);
            }
            return { nextVersion, persistedState };
        });
        this.stateCache = result.persistedState;
        return clone(this.stateCache);
    }
    async assertStateNaturalKeys(state) {
        for (const capacity of state.operatorCapacities) {
            assertNaturalKeyAvailable(state.operatorCapacities, capacity, isSameOperatorCapacityNaturalKey, "operator_capacity_natural_key_conflict");
            const existing = await this.findOperatorCapacityByOperatorChannel(capacity.tenantId, capacity.operatorId, capacity.channel);
            assertNaturalKeyAvailable(existing ? [existing] : [], capacity, isSameOperatorCapacityNaturalKey, "operator_capacity_natural_key_conflict");
        }
        for (const membership of state.queueMemberships) {
            assertNaturalKeyAvailable(state.queueMemberships, membership, isSameQueueMembershipNaturalKey, "queue_membership_natural_key_conflict");
            const existing = await this.listQueueMemberships({
                operatorId: membership.operatorId,
                queueId: membership.queueId,
                tenantId: membership.tenantId
            });
            assertNaturalKeyAvailable(existing, membership, isSameQueueMembershipNaturalKey, "queue_membership_natural_key_conflict");
        }
        for (const rule of state.routingRules) {
            assertNaturalKeyAvailable(state.routingRules, rule, isSameRoutingRuleNaturalKey, "routing_rule_natural_key_conflict");
            const existing = await this.client.routingRule.findFirst({
                where: { channel: rule.channel, tenantId: rule.tenantId }
            });
            assertNaturalKeyAvailable(existing ? [toRoutingRuleRecord(existing)] : [], rule, isSameRoutingRuleNaturalKey, "routing_rule_natural_key_conflict");
        }
    }
    async saveStateSideTables(state, client = this.client, updateCache = true) {
        const persistedJobs = [];
        const persistedOperatorCapacities = [];
        const persistedQueueMemberships = [];
        const persistedRoutingAnalyticsRows = [];
        const persistedRoutingRules = [];
        for (const job of state.jobs) {
            const create = toPrismaRoutingJobCreateInput(job);
            const row = await client.routingJob.upsert({
                create,
                update: toPrismaRoutingJobUpdateInput(create),
                where: { id: create.id }
            });
            persistedJobs.push(toRoutingJobDescriptor(row));
        }
        for (const capacity of state.operatorCapacities) {
            const create = toPrismaOperatorCapacityCreateInput(capacity);
            const row = await client.operatorCapacity.upsert({
                create,
                update: toPrismaOperatorCapacityUpdateInput(create),
                where: { id: capacity.id }
            });
            persistedOperatorCapacities.push(toOperatorCapacityRecord(row));
        }
        for (const membership of state.queueMemberships) {
            const create = toPrismaQueueMembershipCreateInput(membership);
            const row = await client.queueMembership.upsert({
                create,
                update: toPrismaQueueMembershipUpdateInput(create),
                where: { id: membership.id }
            });
            persistedQueueMemberships.push(toQueueMembershipRecord(row));
        }
        if (state.routingAnalyticsRows.length && client.routingAnalyticsRow.createMany) {
            await client.routingAnalyticsRow.createMany({
                data: state.routingAnalyticsRows.map(toPrismaRoutingAnalyticsCreateInput),
                skipDuplicates: true
            });
            persistedRoutingAnalyticsRows.push(...state.routingAnalyticsRows.map(normalizeRoutingAnalyticsRow));
        }
        else {
            for (const row of state.routingAnalyticsRows) {
                const create = toPrismaRoutingAnalyticsCreateInput(row);
                const persisted = await client.routingAnalyticsRow.upsert({
                    create,
                    update: toPrismaRoutingAnalyticsUpdateInput(create),
                    where: { id: row.id }
                });
                persistedRoutingAnalyticsRows.push(toRoutingAnalyticsRow(persisted));
            }
        }
        for (const rule of state.routingRules) {
            const create = toPrismaRoutingRuleCreateInput(rule);
            const row = await client.routingRule.upsert({
                create,
                update: toPrismaRoutingRuleUpdateInput(create),
                where: { id: rule.id }
            });
            persistedRoutingRules.push(toRoutingRuleRecord(row));
        }
        const persistedState = normalizeState({
            ...state,
            jobs: persistedJobs,
            operatorCapacities: persistedOperatorCapacities,
            queueMemberships: persistedQueueMemberships,
            routingAnalyticsRows: persistedRoutingAnalyticsRows,
            routingRules: persistedRoutingRules
        });
        if (updateCache) {
            this.stateCache = persistedState;
        }
        return persistedState;
    }
    async readCurrentStateSnapshot(client = this.client) {
        let snapshot = await client.routingStateSnapshot.findUnique({
            where: { id: ROUTING_STATE_SNAPSHOT_ID }
        });
        if (!snapshot) {
            snapshot = await client.routingStateSnapshot.create({
                data: toPrismaRoutingStateSnapshotCreateInput(seedRoutingState())
            });
        }
        return {
            state: toRoutingStateFromSnapshot(snapshot, seedRoutingState()),
            version: snapshot.version
        };
    }
    async saveStateSnapshot(state, client = this.client, expectedVersion, retriesRemaining = 1) {
        const resolvedVersion = expectedVersion ?? (await this.readCurrentStateSnapshot(client)).version;
        const create = {
            ...toPrismaRoutingStateSnapshotCreateInput(state),
            version: resolvedVersion > 0 ? resolvedVersion + 1 : 1
        };
        if (resolvedVersion === 0) {
            const snapshot = await client.routingStateSnapshot.create({ data: create });
            return snapshot.version;
        }
        else {
            const result = await client.routingStateSnapshot.updateMany({
                data: toPrismaRoutingStateSnapshotUpdateInput(create),
                where: { id: ROUTING_STATE_SNAPSHOT_ID, version: resolvedVersion }
            });
            if (result.count !== 1) {
                if (expectedVersion === undefined && retriesRemaining > 0) {
                    return this.saveStateSnapshot(state, client, undefined, retriesRemaining - 1);
                }
                throw new Error("routing_state_snapshot_conflict");
            }
            return create.version;
        }
    }
    async withRoutingTransaction(operation) {
        return this.client.$transaction
            ? this.client.$transaction(operation)
            : operation(this.client);
    }
}
async function appendLifecycleEvent(client, event) {
    await client.conversationLifecycleEvent.create({
        data: {
            actorId: event.actorId,
            actorName: event.actorName,
            actorType: event.actorType,
            conversationId: event.conversationId,
            data: event.data,
            eventType: event.eventType,
            id: event.id,
            ingestedAt: new Date(event.ingestedAt),
            occurredAt: new Date(event.occurredAt),
            reason: event.reason,
            schemaVersion: event.schemaVersion,
            source: event.source,
            sourceEventId: event.sourceEventId,
            tenantId: event.tenantId,
            traceId: event.traceId
        }
    });
}
async function appendRealtimeEvent(client, event) {
    if (!client.conversationRealtimeEvent) {
        throw new Error("prisma_manual_routing_delegates_required");
    }
    await client.conversationRealtimeEvent.create({
        data: {
            data: event.data,
            eventId: event.eventId,
            eventName: event.eventName,
            id: event.eventId,
            occurredAt: new Date(event.occurredAt),
            resourceId: event.resourceId,
            resourceType: event.resourceType,
            schemaVersion: event.schemaVersion,
            tenantId: event.tenantId,
            traceId: event.traceId
        }
    });
}
function assertManualTransitionEnvelope(input, conversation) {
    const realtimeMatches = input.realtimeEvent.tenantId === input.tenantId
        && input.realtimeEvent.resourceId === input.conversationId
        && input.realtimeEvent.resourceType === "conversation";
    const lifecycleMatches = input.lifecycleEvents.length > 0 && input.lifecycleEvents.every((event) => event.tenantId === input.tenantId && event.conversationId === input.conversationId);
    const stateMatches = input.action === "return_queue"
        ? conversation.status === "queued" && !conversation.operatorId
        : input.action === "transfer"
            ? conversation.status === "transferred" && Boolean(conversation.operatorId)
            : input.action === "assign"
                ? conversation.status === "assigned" && Boolean(conversation.operatorId)
                : input.action === "pause_sla"
                    ? conversation.status === "paused"
                    : input.action === "start_rescue"
                        ? conversation.rescue?.state === "active"
                        : conversation.rescue?.state !== "active";
    if (!realtimeMatches || !lifecycleMatches || !stateMatches) {
        throw new Error("routing_manual_transition_invalid");
    }
}
function routingWorkerLifecycleEvent(input) {
    const sourceEventId = `${input.jobId}:${input.action}`;
    return {
        actorId: null,
        actorName: null,
        actorType: "worker",
        conversationId: input.conversationId,
        data: input.data,
        eventType: input.eventType,
        id: `lifecycle_routing_${sourceEventId}`,
        ingestedAt: input.completedAt,
        occurredAt: input.completedAt,
        reason: null,
        schemaVersion: "conversation-lifecycle/v1",
        source: "routing-worker",
        sourceEventId,
        tenantId: input.tenantId,
        traceId: `routing-job:${input.jobId}`
    };
}
function createDurableRoutingRepository(store) {
    const lifecycleEventKeys = new Set();
    return {
        applyRescueReturnTransition(input) {
            let outcome = skippedRescueReturn(input.jobId, input.fallbackConversationId ?? null, "job_not_claimed");
            store.update((state) => {
                const current = normalizeState(state);
                const currentJob = current.jobs.find((job) => job.id === input.jobId);
                const conversationId = typeof (currentJob ?? { conversationId: input.fallbackConversationId }).conversationId === "string"
                    ? (currentJob ?? { conversationId: input.fallbackConversationId }).conversationId
                    : null;
                if (!currentJob) {
                    outcome = skippedRescueReturn(input.jobId, conversationId, "job_not_claimed");
                    return current;
                }
                if (currentJob.queue !== "rescue-return") {
                    outcome = skippedRescueReturn(input.jobId, conversationId, "unsupported_queue");
                    return current;
                }
                if (currentJob.action !== "return_to_sla_queue") {
                    outcome = skippedRescueReturn(input.jobId, conversationId, "unsupported_action");
                    return current;
                }
                if (!conversationId) {
                    outcome = skippedRescueReturn(input.jobId, conversationId, "missing_conversation_id");
                    return current;
                }
                if (currentJob.status !== "claimed") {
                    outcome = skippedRescueReturn(input.jobId, conversationId, "job_not_claimed");
                    return current;
                }
                if (currentJob.leaseOwner && currentJob.leaseOwner !== input.leaseOwner) {
                    outcome = skippedRescueReturn(input.jobId, conversationId, "lease_lost");
                    return current;
                }
                const conversation = current.conversations.find((item) => item.id === conversationId);
                if (!conversation) {
                    outcome = skippedRescueReturn(input.jobId, conversationId, "conversation_not_found");
                    return current;
                }
                if (conversation.rescue?.state !== "active") {
                    outcome = skippedRescueReturn(input.jobId, conversationId, "not_active_rescue");
                    return current;
                }
                const previousOperatorId = conversation.operatorId ?? null;
                const rescue = conversation.rescue;
                const tenantContext = resolveRescueReturnTenantContext(input, conversation);
                if ("reason" in tenantContext) {
                    outcome = skippedRescueReturn(input.jobId, conversationId, tenantContext.reason);
                    return current;
                }
                const tenantId = tenantContext.tenantId;
                lifecycleEventKeys.add(`${tenantId}:routing-worker:${input.jobId}:auto_return`);
                outcome = appliedRescueReturn(input, conversation, previousOperatorId);
                return {
                    ...current,
                    conversations: current.conversations.map((item) => item.id === conversationId
                        ? {
                            ...item,
                            operatorId: undefined,
                            rescue: {
                                ...item.rescue,
                                state: "returned_to_queue"
                            },
                            slaTone: "hold",
                            status: "queued"
                        }
                        : item),
                    jobs: current.jobs.map((job) => job.id === input.jobId
                        ? {
                            ...job,
                            completedAt: input.completedAt,
                            leaseExpiresAt: undefined,
                            leaseOwner: undefined,
                            status: "completed"
                        }
                        : job),
                    operators: current.operators.map((operator) => operator.id === previousOperatorId && operator.tenantId === tenantId
                        ? {
                            ...operator,
                            chats: Math.max(0, operator.chats - 1),
                            rescueActive: Math.max(0, operator.rescueActive - 1)
                        }
                        : operator),
                    queues: current.queues.map((queue) => queue.channel === conversation.channel && queue.tenantId === tenantId
                        ? {
                            ...queue,
                            active: Math.max(0, queue.active - 1),
                            waiting: queue.waiting + 1
                        }
                        : queue),
                    rescueReportRows: [
                        ...current.rescueReportRows,
                        {
                            channel: conversation.channel,
                            conversationId,
                            digest: "daily_rescue",
                            operatorId: previousOperatorId,
                            outcome: "returned_to_queue",
                            reason: rescue.reason,
                            resolution: "Auto-returned to SLA queue after rescue timer expired",
                            tenantId,
                            timerSeconds: rescue.durationSeconds
                        }
                    ],
                    routingAnalyticsRows: [
                        ...current.routingAnalyticsRows,
                        {
                            channel: conversation.channel,
                            conversationId,
                            eventKind: "auto_return",
                            fromOperatorId: previousOperatorId,
                            id: `analytics_auto_return_${input.jobId}`,
                            occurredAt: input.completedAt,
                            source: "rescue-return-worker",
                            tenantId,
                            toOperatorId: null
                        }
                    ]
                };
            });
            return clone(outcome);
        },
        applySlaTimerTransition(input) {
            let outcome = skippedSlaTimer(input, "job_not_claimed");
            store.update((state) => {
                const current = normalizeState(state);
                const currentJob = current.jobs.find((job) => job.id === input.jobId);
                if (!currentJob || currentJob.status !== "claimed") {
                    outcome = skippedSlaTimer(input, "job_not_claimed");
                    return current;
                }
                if (currentJob.leaseOwner && currentJob.leaseOwner !== input.leaseOwner) {
                    outcome = skippedSlaTimer(input, "lease_lost");
                    return current;
                }
                if (currentJob.queue !== "sla-timers") {
                    outcome = skippedSlaTimer(input, "unsupported_queue");
                    return current;
                }
                if (currentJob.action !== input.action) {
                    outcome = skippedSlaTimer(input, "unsupported_action");
                    return current;
                }
                if (typeof currentJob.conversationId === "string" && currentJob.conversationId !== input.conversationId) {
                    outcome = skippedSlaTimer(input, "conversation_mismatch");
                    return current;
                }
                const conversationId = typeof currentJob.conversationId === "string" ? currentJob.conversationId : input.conversationId;
                const conversation = current.conversations.find((item) => item.id === conversationId);
                if (!conversation) {
                    outcome = skippedSlaTimer({ ...input, conversationId }, "conversation_not_found");
                    return current;
                }
                if (input.action === "resume_sla" && conversation.status !== "paused") {
                    outcome = skippedSlaTimer({ ...input, conversationId }, "not_paused");
                    return current;
                }
                if (input.action === "mark_sla_overdue" && conversation.status !== "active" && conversation.status !== "assigned") {
                    outcome = skippedSlaTimer({ ...input, conversationId }, "not_active");
                    return current;
                }
                const tenantId = input.tenantId ?? conversation.tenantId;
                if (!tenantId || (input.tenantId && conversation.tenantId !== input.tenantId)) {
                    outcome = skippedSlaTimer({ ...input, conversationId }, "tenant_context_mismatch");
                    return current;
                }
                lifecycleEventKeys.add(`${tenantId}:routing-worker:${input.jobId}:${input.action}`);
                outcome = appliedSlaTimer({ ...input, conversationId });
                return {
                    ...current,
                    conversations: current.conversations.map((conversation) => conversation.id === conversationId
                        ? {
                            ...conversation,
                            slaTone: input.action === "resume_sla" ? "ok" : input.toSlaTone ?? "danger",
                            status: input.toStatus
                        }
                        : conversation),
                    jobs: current.jobs.map((job) => job.id === input.jobId
                        ? {
                            ...job,
                            completedAt: input.completedAt,
                            leaseExpiresAt: undefined,
                            leaseOwner: undefined,
                            status: "completed"
                        }
                        : job)
                };
            });
            return clone(outcome);
        },
        claimJob(input) {
            let persisted;
            store.update((state) => {
                const current = normalizeState(state);
                const job = current.jobs.find((item) => item.id === input.jobId);
                if (!job
                    || job.queue !== input.queue
                    || (job.status ?? null) !== input.expectedStatus
                    || (job.leaseExpiresAt ?? null) !== (input.expectedLeaseExpiresAt ?? null)
                    || (job.leaseOwner ?? null) !== (input.expectedLeaseOwner ?? null)) {
                    return current;
                }
                const claimedAt = new Date(input.claimedAt);
                persisted = {
                    ...job,
                    claimedAt: input.claimedAt,
                    completedAt: undefined,
                    leaseExpiresAt: new Date(claimedAt.getTime() + positiveLeaseDuration(input.leaseDurationMs)).toISOString(),
                    leaseOwner: input.workerId?.trim() || `routing-worker:${process.pid}`,
                    status: "claimed"
                };
                return {
                    ...current,
                    jobs: current.jobs.map((item) => item.id === input.jobId ? persisted : item)
                };
            });
            return persisted ? clone(persisted) : undefined;
        },
        findOperatorCapacity(capacityId, scope = {}) {
            const record = readState(store).operatorCapacities.find((item) => item.id === capacityId);
            return record && isRoutingRecordInScope(record.tenantId, scope) ? clone(record) : undefined;
        },
        findOperatorCapacityByOperatorChannel(tenantId, operatorId, channel) {
            const record = readState(store).operatorCapacities.find((item) => item.tenantId === tenantId && item.operatorId === operatorId && item.channel === channel);
            return record ? clone(record) : undefined;
        },
        findQueueMembership(membershipId, scope = {}) {
            const record = readState(store).queueMemberships.find((item) => item.id === membershipId);
            return record && isRoutingRecordInScope(record.tenantId, scope) ? clone(record) : undefined;
        },
        findRoutingRule(ruleId, scope = {}) {
            const record = readState(store).routingRules.find((item) => item.id === ruleId);
            return record && isRoutingRecordInScope(record.tenantId, scope) ? clone(record) : undefined;
        },
        findRoutingRuleByChannel(tenantId, channel) {
            const record = readState(store).routingRules.find((item) => item.tenantId === tenantId && item.channel === channel && item.enabled);
            return record ? clone(record) : undefined;
        },
        hydrateStateSnapshot() {
            return clone(readState(store));
        },
        listJobs() {
            return clone(readState(store).jobs);
        },
        listOperatorCapacities(filters = {}) {
            return clone(readState(store).operatorCapacities.filter((item) => isOperatorCapacityInScope(item, filters)));
        },
        listQueueMemberships(filters = {}) {
            return clone(readState(store).queueMemberships.filter((item) => isQueueMembershipInScope(item, filters)));
        },
        listRoutingAnalyticsRows(filters = {}) {
            return clone(readState(store).routingAnalyticsRows.filter((item) => isRoutingAnalyticsRowInScope(item, filters)));
        },
        listRoutingRules(filters = {}) {
            return clone(readState(store).routingRules.filter((item) => isRoutingRuleInScope(item, filters)));
        },
        readState() {
            return clone(readState(store));
        },
        saveJob(job) {
            const persisted = clone(job);
            store.update((state) => {
                const current = normalizeState(state);
                const exists = current.jobs.some((item) => item.id === persisted.id);
                return {
                    ...current,
                    jobs: exists
                        ? current.jobs.map((item) => item.id === persisted.id ? persisted : item)
                        : [...current.jobs, persisted]
                };
            });
            return clone(persisted);
        },
        saveOperatorCapacity(capacity) {
            const persisted = normalizeOperatorCapacityRecord(capacity);
            store.update((state) => {
                const current = normalizeState(state);
                assertNaturalKeyAvailable(current.operatorCapacities, persisted, isSameOperatorCapacityNaturalKey, "operator_capacity_natural_key_conflict");
                return upsertRecord(current, "operatorCapacities", persisted);
            });
            return clone(persisted);
        },
        saveQueueMembership(membership) {
            const persisted = normalizeQueueMembershipRecord(membership);
            store.update((state) => {
                const current = normalizeState(state);
                assertNaturalKeyAvailable(current.queueMemberships, persisted, isSameQueueMembershipNaturalKey, "queue_membership_natural_key_conflict");
                return upsertRecord(current, "queueMemberships", persisted);
            });
            return clone(persisted);
        },
        saveRoutingAnalyticsRow(row) {
            const persisted = normalizeRoutingAnalyticsRow(row);
            store.update((state) => {
                const current = normalizeState(state);
                const exists = current.routingAnalyticsRows.some((item) => item.id === persisted.id);
                return {
                    ...current,
                    routingAnalyticsRows: exists
                        ? current.routingAnalyticsRows.map((item) => item.id === persisted.id ? persisted : item)
                        : [...current.routingAnalyticsRows, persisted]
                };
            });
            return clone(persisted);
        },
        saveRoutingRule(rule) {
            const persisted = normalizeRoutingRuleRecord(rule);
            store.update((state) => {
                const current = normalizeState(state);
                assertNaturalKeyAvailable(current.routingRules, persisted, isSameRoutingRuleNaturalKey, "routing_rule_natural_key_conflict");
                return upsertRecord(current, "routingRules", persisted);
            });
            return clone(persisted);
        },
        saveState(state) {
            const normalized = normalizeState(state);
            store.write(normalized);
            return clone(normalized);
        },
        saveBatchRoutingTransition(input) {
            return this.saveStateWithLifecycleEvents(input.state, input.lifecycleEvents);
        },
        saveManualRoutingTransition(input) {
            return this.saveStateWithLifecycleEvents(input.state, input.lifecycleEvents);
        },
        saveStateWithLifecycleEvents(state, events) {
            for (const event of events) {
                const key = `${event.tenantId}:${event.source}:${event.sourceEventId}`;
                if (lifecycleEventKeys.has(key)) {
                    continue;
                }
                lifecycleEventKeys.add(key);
            }
            const normalized = normalizeState(state);
            store.write(normalized);
            return clone(normalized);
        }
    };
}
function seedRoutingState() {
    return {
        conversations: [],
        jobs: [],
        operatorCapacities: [],
        operators: [],
        queueMemberships: [],
        queues: [],
        routingAnalyticsRows: [],
        rescueReportRows: [],
        routingRules: []
    };
}
function normalizeState(state) {
    return {
        conversations: state.conversations ?? [],
        jobs: state.jobs ?? [],
        operatorCapacities: (state.operatorCapacities ?? []).map(normalizeOperatorCapacityRecord),
        operators: state.operators ?? [],
        queueMemberships: (state.queueMemberships ?? []).map(normalizeQueueMembershipRecord),
        queues: state.queues ?? [],
        routingAnalyticsRows: (state.routingAnalyticsRows ?? []).map(normalizeRoutingAnalyticsRow),
        rescueReportRows: state.rescueReportRows ?? [],
        routingRules: (state.routingRules ?? []).map(normalizeRoutingRuleRecord)
    };
}
function readState(store) {
    return normalizeState(store.read());
}
function upsertRecord(state, key, record) {
    const current = state[key];
    const exists = current.some((item) => item.id === record.id);
    return {
        ...state,
        [key]: exists
            ? current.map((item) => item.id === record.id ? record : item)
            : [...current, record]
    };
}
function assertNaturalKeyAvailable(records, record, isSameNaturalKey, code) {
    const conflicting = records.find((item) => item.id !== record.id && isSameNaturalKey(item, record));
    if (conflicting) {
        throw new Error(`${code}:${record.id}:${conflicting.id}`);
    }
}
function isSameRoutingRuleNaturalKey(left, right) {
    return left.tenantId === right.tenantId && left.channel === right.channel;
}
function isSameQueueMembershipNaturalKey(left, right) {
    return left.tenantId === right.tenantId && left.queueId === right.queueId && left.operatorId === right.operatorId;
}
function isSameOperatorCapacityNaturalKey(left, right) {
    return left.tenantId === right.tenantId && left.operatorId === right.operatorId && left.channel === right.channel;
}
function isRoutingRecordInScope(tenantId, scope) {
    return !scope.tenantId || tenantId === scope.tenantId;
}
function isRoutingRuleInScope(rule, filters) {
    return isRoutingRecordInScope(rule.tenantId, filters)
        && (!filters.channel || rule.channel === filters.channel)
        && (filters.enabled === undefined || rule.enabled === filters.enabled);
}
function appliedSlaTimer(input) {
    return {
        conversationId: input.conversationId,
        jobId: input.jobId,
        ...(input.action === "mark_sla_overdue"
            ? {
                overdueDescriptor: {
                    conversationId: input.conversationId,
                    jobId: input.jobId,
                    kind: "sla.timer.overdue",
                    occurredAt: input.completedAt,
                    queue: "sla-timers"
                },
                realtimeEvent: {
                    data: {
                        jobId: input.jobId,
                        state: "overdue"
                    },
                    occurredAt: input.completedAt,
                    resourceId: input.conversationId,
                    resourceType: "conversation",
                    type: "sla.timer.updated"
                }
            }
            : {}),
        status: "applied"
    };
}
function skippedSlaTimer(input, reason) {
    return {
        conversationId: input.conversationId,
        jobId: input.jobId,
        reason,
        status: "skipped"
    };
}
function appliedRescueReturn(input, conversation, previousOperatorId) {
    return {
        analyticsDescriptor: {
            channel: conversation.channel,
            conversationId: conversation.id,
            jobId: input.jobId,
            kind: "routing.rescue.auto_returned",
            occurredAt: input.completedAt,
            operatorId: previousOperatorId
        },
        conversationId: conversation.id,
        jobId: input.jobId,
        realtimeEvent: {
            data: {
                jobId: input.jobId,
                state: "returned_to_queue"
            },
            occurredAt: input.completedAt,
            resourceId: conversation.id,
            resourceType: "conversation",
            type: "rescue.countdown.updated"
        },
        status: "applied"
    };
}
function skippedRescueReturn(jobId, conversationId, reason) {
    return {
        conversationId,
        jobId,
        reason,
        status: "skipped"
    };
}
function resolveRescueReturnTenantContext(input, conversation) {
    const inputTenantId = normalizeTenantId(input.tenantId);
    const conversationTenantId = normalizeTenantId(conversation.tenantId);
    if (inputTenantId && conversationTenantId && inputTenantId !== conversationTenantId) {
        return { reason: "tenant_context_mismatch" };
    }
    const tenantId = inputTenantId ?? conversationTenantId;
    return tenantId ? { tenantId } : { reason: "tenant_context_required" };
}
function normalizeTenantId(value) {
    const tenantId = String(value ?? "").trim();
    return tenantId || null;
}
function isQueueMembershipInScope(membership, filters) {
    return isRoutingRecordInScope(membership.tenantId, filters)
        && (!filters.queueId || membership.queueId === filters.queueId)
        && (!filters.operatorId || membership.operatorId === filters.operatorId)
        && (filters.active === undefined || membership.active === filters.active);
}
function isOperatorCapacityInScope(capacity, filters) {
    return isRoutingRecordInScope(capacity.tenantId, filters)
        && (!filters.channel || capacity.channel === filters.channel)
        && (!filters.operatorId || capacity.operatorId === filters.operatorId);
}
function isRoutingAnalyticsRowInScope(row, filters) {
    return isRoutingRecordInScope(row.tenantId, filters)
        && (!filters.eventKind || row.eventKind === filters.eventKind);
}
function routingRuleWhere(filters) {
    return {
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {})
    };
}
function queueMembershipWhere(filters) {
    return {
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.queueId ? { queueId: filters.queueId } : {}),
        ...(filters.operatorId ? { operatorId: filters.operatorId } : {}),
        ...(filters.active !== undefined ? { active: filters.active } : {})
    };
}
function operatorCapacityWhere(filters) {
    return {
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.channel ? { channel: filters.channel } : {}),
        ...(filters.operatorId ? { operatorId: filters.operatorId } : {})
    };
}
function routingAnalyticsWhere(filters) {
    return {
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        ...(filters.eventKind ? { eventKind: filters.eventKind } : {})
    };
}
function normalizeRoutingRuleRecord(rule) {
    return {
        channel: rule.channel.trim(),
        enabled: Boolean(rule.enabled),
        id: rule.id,
        limitMode: parseRoutingLimitMode(rule.limitMode),
        priorityStrategy: parseRoutingPriorityStrategy(rule.priorityStrategy),
        tenantId: rule.tenantId,
        updatedAt: rule.updatedAt,
        waitThresholdSeconds: parseNonNegativeInteger(rule.waitThresholdSeconds, "waitThresholdSeconds")
    };
}
function normalizeQueueMembershipRecord(membership) {
    return {
        active: Boolean(membership.active),
        id: membership.id,
        operatorId: membership.operatorId,
        queueId: membership.queueId,
        role: parseQueueMembershipRole(membership.role),
        tenantId: membership.tenantId,
        updatedAt: membership.updatedAt
    };
}
function normalizeOperatorCapacityRecord(capacity) {
    return {
        channel: capacity.channel.trim(),
        chatLimit: parseNonNegativeInteger(capacity.chatLimit, "chatLimit"),
        id: capacity.id,
        operatorId: capacity.operatorId,
        overrideAllowed: Boolean(capacity.overrideAllowed),
        tenantId: capacity.tenantId,
        updatedAt: capacity.updatedAt
    };
}
function normalizeRoutingAnalyticsRow(row) {
    return {
        channel: row.channel.trim(),
        conversationId: row.conversationId,
        eventKind: parseRoutingAnalyticsEventKind(row.eventKind),
        fromOperatorId: row.fromOperatorId ?? null,
        id: row.id,
        occurredAt: row.occurredAt,
        source: row.source.trim(),
        tenantId: row.tenantId,
        toOperatorId: row.toOperatorId ?? null
    };
}
function parseRoutingLimitMode(value) {
    if (value === "operator_channel_limit" || value === "queue_round_robin") {
        return value;
    }
    throw new Error(`Unsupported routing limit mode: ${value}`);
}
function parseRoutingPriorityStrategy(value) {
    if (value === "least_loaded" || value === "round_robin" || value === "skill_match") {
        return value;
    }
    throw new Error(`Unsupported routing priority strategy: ${value}`);
}
function parseQueueMembershipRole(value) {
    if (value === "primary" || value === "backup" || value === "member" || value === "observer") {
        return value;
    }
    throw new Error(`Unsupported queue membership role: ${value}`);
}
function parseRoutingAnalyticsEventKind(value) {
    if (value === "assignment" || value === "auto_return" || value === "rescue" || value === "transfer") {
        return value;
    }
    throw new Error(`Unsupported routing analytics event kind: ${value}`);
}
function parseNonNegativeInteger(value, field) {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative integer`);
    }
    return value;
}
function toRoutingRuleRecord(row) {
    return normalizeRoutingRuleRecord({
        channel: row.channel,
        enabled: row.enabled,
        id: row.id,
        limitMode: row.limitMode,
        priorityStrategy: row.priorityStrategy,
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString(),
        waitThresholdSeconds: row.waitThresholdSeconds
    });
}
function toQueueMembershipRecord(row) {
    return normalizeQueueMembershipRecord({
        active: row.active,
        id: row.id,
        operatorId: row.operatorId,
        queueId: row.queueId,
        role: row.role,
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString()
    });
}
function toOperatorCapacityRecord(row) {
    return normalizeOperatorCapacityRecord({
        channel: row.channel,
        chatLimit: row.chatLimit,
        id: row.id,
        operatorId: row.operatorId,
        overrideAllowed: row.overrideAllowed,
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString()
    });
}
function toRoutingAnalyticsRow(row) {
    return normalizeRoutingAnalyticsRow({
        channel: row.channel,
        conversationId: row.conversationId,
        eventKind: row.eventKind,
        fromOperatorId: row.fromOperatorId,
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        source: row.source,
        tenantId: row.tenantId,
        toOperatorId: row.toOperatorId
    });
}
function toRoutingJobDescriptor(row) {
    const payload = clone(row.payload ?? {});
    const result = {
        ...payload,
        ...(row.action !== null ? { action: row.action } : {}),
        ...(row.conversationId !== null ? { conversationId: row.conversationId } : {}),
        id: row.id,
        ...(row.kind !== null ? { kind: row.kind } : {}),
        ...(row.claimedAt !== null ? { claimedAt: row.claimedAt.toISOString() } : {}),
        ...(row.leaseExpiresAt !== null ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}),
        ...(row.leaseOwner !== null ? { leaseOwner: row.leaseOwner } : {}),
        queue: row.queue,
        ...(row.redistributionId !== null ? { redistributionId: row.redistributionId } : {}),
        ...(row.runAt !== null ? { runAt: row.runAt } : {}),
        ...(row.status !== null ? { status: row.status } : {})
    };
    if (row.claimedAt === null)
        delete result.claimedAt;
    if (row.leaseExpiresAt === null)
        delete result.leaseExpiresAt;
    if (row.leaseOwner === null)
        delete result.leaseOwner;
    return result;
}
function toRoutingStateFromSnapshot(row, base) {
    return normalizeState({
        ...base,
        conversations: jsonArray(row.conversations, base.conversations),
        operators: jsonArray(row.operators, base.operators),
        queues: jsonArray(row.queues, base.queues),
        rescueReportRows: jsonArray(row.rescueReportRows, base.rescueReportRows)
    });
}
function toPrismaRoutingRuleCreateInput(rule) {
    const normalized = normalizeRoutingRuleRecord(rule);
    return {
        channel: normalized.channel,
        enabled: normalized.enabled,
        id: normalized.id,
        limitMode: normalized.limitMode,
        priorityStrategy: normalized.priorityStrategy,
        tenantId: normalized.tenantId,
        updatedAt: new Date(normalized.updatedAt),
        waitThresholdSeconds: normalized.waitThresholdSeconds
    };
}
function toPrismaRoutingRuleUpdateInput(create) {
    const { id: _id, ...update } = create;
    return update;
}
function toPrismaQueueMembershipCreateInput(membership) {
    const normalized = normalizeQueueMembershipRecord(membership);
    return {
        active: normalized.active,
        id: normalized.id,
        operatorId: normalized.operatorId,
        queueId: normalized.queueId,
        role: normalized.role,
        tenantId: normalized.tenantId,
        updatedAt: new Date(normalized.updatedAt)
    };
}
function toPrismaQueueMembershipUpdateInput(create) {
    const { id: _id, ...update } = create;
    return update;
}
function toPrismaOperatorCapacityCreateInput(capacity) {
    const normalized = normalizeOperatorCapacityRecord(capacity);
    return {
        channel: normalized.channel,
        chatLimit: normalized.chatLimit,
        id: normalized.id,
        operatorId: normalized.operatorId,
        overrideAllowed: normalized.overrideAllowed,
        tenantId: normalized.tenantId,
        updatedAt: new Date(normalized.updatedAt)
    };
}
function toPrismaOperatorCapacityUpdateInput(create) {
    const { id: _id, ...update } = create;
    return update;
}
function toPrismaRoutingAnalyticsCreateInput(row) {
    const normalized = normalizeRoutingAnalyticsRow(row);
    return {
        channel: normalized.channel,
        conversationId: normalized.conversationId,
        eventKind: normalized.eventKind,
        fromOperatorId: normalized.fromOperatorId ?? null,
        id: normalized.id,
        occurredAt: new Date(normalized.occurredAt),
        source: normalized.source,
        tenantId: normalized.tenantId,
        toOperatorId: normalized.toOperatorId ?? null
    };
}
function toPrismaRoutingAnalyticsUpdateInput(create) {
    const { id: _id, ...update } = create;
    return update;
}
function toPrismaRoutingJobCreateInput(job) {
    return {
        action: typeof job.action === "string" ? job.action : null,
        claimedAt: typeof job.claimedAt === "string" ? new Date(job.claimedAt) : null,
        conversationId: typeof job.conversationId === "string" ? job.conversationId : null,
        id: job.id,
        kind: typeof job.kind === "string" ? job.kind : null,
        leaseExpiresAt: typeof job.leaseExpiresAt === "string" ? new Date(job.leaseExpiresAt) : null,
        leaseOwner: typeof job.leaseOwner === "string" ? job.leaseOwner : null,
        payload: clone(job),
        queue: job.queue,
        redistributionId: typeof job.redistributionId === "string" ? job.redistributionId : null,
        runAt: typeof job.runAt === "number" || typeof job.runAt === "string" ? job.runAt : Prisma.DbNull,
        status: typeof job.status === "string" ? job.status : null
    };
}
function positiveLeaseDuration(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 60_000;
}
function toPrismaRoutingJobUpdateInput(create) {
    const { id: _id, ...update } = create;
    return update;
}
function toPrismaRoutingStateSnapshotCreateInput(state) {
    const normalized = normalizeState(state);
    return {
        conversations: clone(normalized.conversations),
        id: ROUTING_STATE_SNAPSHOT_ID,
        operators: clone(normalized.operators),
        queues: clone(normalized.queues),
        rescueReportRows: clone(normalized.rescueReportRows),
        version: 1
    };
}
function toPrismaRoutingStateSnapshotUpdateInput(create) {
    const { id: _id, ...update } = create;
    return update;
}
function upsertById(records, record) {
    return records.some((item) => item.id === record.id)
        ? records.map((item) => item.id === record.id ? record : item)
        : [...records, record];
}
function jsonArray(value, fallback) {
    return Array.isArray(value) ? clone(value) : clone(fallback);
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=routing.repository.js.map