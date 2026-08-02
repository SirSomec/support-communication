import { randomUUID } from "node:crypto";
import { InMemoryStore } from "@support-communication/database";
import { redactSensitiveText } from "@support-communication/redaction";
import { hashPublicApiKeySecret } from "./public-api-auth.js";
let defaultRepository = null;
export class IntegrationRepository {
    store;
    publicApiRevealSecrets;
    prismaClient;
    constructor(store, publicApiRevealSecrets = new Map(), prismaClient) {
        this.store = store;
        this.publicApiRevealSecrets = publicApiRevealSecrets;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (defaultRepository) {
            return defaultRepository;
        }
        return IntegrationRepository.inMemory();
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static clearDefault() {
        defaultRepository = null;
    }
    static inMemory(seed) {
        return new IntegrationRepository(new InMemoryStore(seed ?? createEmptyIntegrationState()));
    }
    static prisma({ client, seed }) {
        assertCompletePrismaIntegrationClient(client);
        return new IntegrationRepository(new InMemoryStore(seed ?? createEmptyIntegrationState()), new Map(), client);
    }
    readState() {
        this.assertSyncRuntimeAvailable();
        return normalizeState(this.store.read());
    }
    readInitialState() {
        return this.prismaClient ? normalizeState(this.store.read()) : this.readState();
    }
    async readStateAsync() {
        if (!this.prismaClient) {
            return this.readState();
        }
        const [apiKeyRotationAuditEvents, apiKeyRotationJobs, channelConnectionAuditEvents, channelConnectionEvents, channelConnections, providerConnectionCredentials, publicApiKeys, publicApiKeyRevealStates, publicDemoRequestAuditEvents, publicDemoRequestNotificationDescriptors, publicDemoRequests, securitySessions, telegramConnections, webhookDeliveryJournal, webhookReplayAuditEvents, webhookReplayJournal] = await Promise.all([
            Promise.resolve(this.prismaClient.publicApiKeyRotationAuditEvent.findMany({ orderBy: { at: "asc" } }))
                .then((rows) => rows.map(toApiKeyRotationAuditEvent)),
            Promise.resolve(this.prismaClient.integrationApiKeyRotationJob.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toApiKeyRotationJob)),
            Promise.resolve(this.prismaClient.channelConnectionAuditEvent.findMany({ orderBy: { at: "asc" } }))
                .then((rows) => rows.map(toChannelConnectionAuditEvent)),
            Promise.resolve(this.prismaClient.channelConnectionEvent.findMany({ orderBy: { at: "asc" } }))
                .then((rows) => rows.map(toChannelConnectionEvent)),
            Promise.resolve(this.prismaClient.channelConnection.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toChannelConnection)),
            Promise.resolve(this.prismaClient.providerConnectionCredential.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toProviderConnectionCredential)),
            Promise.resolve(this.prismaClient.publicApiKey.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toPublicApiKeyStoredRecord)),
            Promise.resolve(this.prismaClient.publicApiKeyRevealState.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toPublicApiKeyRevealState)),
            Promise.resolve(this.prismaClient.publicDemoRequestAuditEvent.findMany({ orderBy: { at: "asc" } }))
                .then((rows) => rows.map(toPublicDemoRequestAuditEvent)),
            Promise.resolve(this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toPublicDemoRequestNotificationDescriptor)),
            Promise.resolve(this.prismaClient.publicDemoRequest.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toPublicDemoRequest)),
            Promise.resolve(this.prismaClient.securitySession.findMany({ orderBy: { lastSeen: "asc" } }))
                .then((rows) => rows.map(toSecuritySession)),
            Promise.resolve(this.prismaClient.telegramConnection.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toTelegramConnection)),
            Promise.resolve(this.prismaClient.webhookDeliveryJournalEntry.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toWebhookDeliveryJournalEntry)),
            Promise.resolve(this.prismaClient.webhookReplayAuditEvent.findMany({ orderBy: { at: "asc" } }))
                .then((rows) => rows.map(toWebhookReplayAuditEvent)),
            Promise.resolve(this.prismaClient.webhookReplayJournalEntry.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toWebhookReplayJournalEntry))
        ]);
        const webhookEndpointRecords = await this.listWebhookEndpointRecords();
        return normalizeState({
            ...createEmptyIntegrationState(),
            apiKeyRotationAuditEvents,
            apiKeyRotationJobs,
            channelConnectionAuditEvents,
            channelConnectionEvents,
            channelConnections,
            providerConnectionCredentials,
            publicApiKeys,
            publicApiKeyRevealStates,
            publicDemoRequestAuditEvents,
            publicDemoRequestNotificationDescriptors,
            publicDemoRequests,
            securitySessions,
            telegramConnections,
            webhookDeliveryJournal,
            webhookEndpointRecords,
            webhookReplayAuditEvents,
            webhookReplayJournal,
            workspace: this.readWorkspaceCatalog()
        });
    }
    readWorkspaceCatalog() {
        return clone(normalizeState(this.store.read()).workspace);
    }
    saveApiKeyRotationJob(job) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(job);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.apiKeyRotationJobs.some((item) => item.rotationId === persisted.rotationId);
            return {
                ...current,
                apiKeyRotationJobs: exists
                    ? current.apiKeyRotationJobs.map((item) => item.rotationId === persisted.rotationId ? persisted : item)
                    : [persisted, ...current.apiKeyRotationJobs]
            };
        });
        return clone(persisted);
    }
    saveApiKeyRotationAuditEvent(event) {
        const persisted = clone(event);
        if (this.prismaClient) {
            return this.savePrismaApiKeyRotationAuditEvent(persisted);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                apiKeyRotationAuditEvents: [...current.apiKeyRotationAuditEvents, persisted]
            };
        });
        return clone(persisted);
    }
    ensurePublicApiKeyReference(input) {
        const persisted = {
            channelConnectionId: input.channelConnectionId ?? null,
            createdAt: input.createdAt,
            environment: input.environment,
            keyId: input.keyId,
            keyPreview: input.keyPreview,
            name: input.name,
            owner: input.owner,
            scopes: [...input.scopes],
            secretHash: hashPublicApiKeySecret(randomUUID()),
            status: input.status,
            tenantId: input.tenantId
        };
        if (this.prismaClient) {
            return this.savePrismaPublicApiKeyReference(persisted);
        }
        const existing = this.readState().publicApiKeys.find((key) => key.keyId === input.keyId);
        if (existing) {
            return clone(existing);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                publicApiKeys: [...current.publicApiKeys, persisted]
            };
        });
        return clone(persisted);
    }
    savePublicApiKey(input) {
        const normalizedSecret = input.rawSecret.trim();
        const persisted = {
            channelConnectionId: input.channelConnectionId ?? null,
            createdAt: input.createdAt,
            environment: input.environment,
            keyId: input.keyId,
            keyPreview: maskPublicApiKeySecret(normalizedSecret),
            name: input.name,
            owner: input.owner,
            scopes: [...input.scopes],
            secretHash: hashPublicApiKeySecret(normalizedSecret),
            status: input.status,
            tenantId: input.tenantId
        };
        if (this.prismaClient) {
            return this.savePrismaPublicApiKey(persisted, {
                consumedAt: null,
                createdAt: input.createdAt,
                keyId: input.keyId,
                keyPreview: persisted.keyPreview,
                status: "available"
            }, normalizedSecret);
        }
        const revealState = {
            consumedAt: null,
            createdAt: input.createdAt,
            keyId: input.keyId,
            keyPreview: persisted.keyPreview,
            status: "available"
        };
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.publicApiKeys.some((item) => item.keyId === persisted.keyId);
            const existingRevealState = current.publicApiKeyRevealStates.find((item) => item.keyId === revealState.keyId);
            const nextRevealState = existingRevealState ?? revealState;
            return {
                ...current,
                publicApiKeys: exists
                    ? current.publicApiKeys.map((item) => item.keyId === persisted.keyId ? persisted : item)
                    : [...current.publicApiKeys, persisted],
                publicApiKeyRevealStates: existingRevealState
                    ? current.publicApiKeyRevealStates.map((item) => item.keyId === revealState.keyId ? nextRevealState : item)
                    : [...current.publicApiKeyRevealStates, nextRevealState]
            };
        });
        const nextRevealState = this.readState().publicApiKeyRevealStates.find((item) => item.keyId === revealState.keyId);
        if (nextRevealState?.status === "available") {
            this.publicApiRevealSecrets.set(persisted.keyId, normalizedSecret);
        }
        else {
            this.publicApiRevealSecrets.delete(persisted.keyId);
        }
        return clone(persisted);
    }
    async removeProvisionedTenant(tenantId) {
        if (this.prismaClient) {
            const keys = await this.prismaClient.publicApiKey.findMany({ where: { tenantId } });
            await this.prismaClient.publicApiKey.deleteMany({ where: { tenantId } });
            for (const key of keys) {
                this.publicApiRevealSecrets.delete(key.keyId);
            }
            const remaining = await this.prismaClient.publicApiKey.findMany({ where: { tenantId } });
            if (remaining.length > 0) {
                throw new Error(`Integration compensation did not remove tenant ${tenantId} API keys.`);
            }
            return;
        }
        const current = this.readState();
        const keyIds = new Set(current.publicApiKeys
            .filter((key) => key.tenantId === tenantId)
            .map((key) => key.keyId));
        this.store.update((state) => {
            const normalized = normalizeState(state);
            return {
                ...normalized,
                publicApiKeys: normalized.publicApiKeys.filter((key) => key.tenantId !== tenantId),
                publicApiKeyRevealStates: normalized.publicApiKeyRevealStates.filter((reveal) => !keyIds.has(reveal.keyId))
            };
        });
        for (const keyId of keyIds) {
            this.publicApiRevealSecrets.delete(keyId);
        }
        if (this.readState().publicApiKeys.some((key) => key.tenantId === tenantId)) {
            throw new Error(`Integration compensation did not remove tenant ${tenantId} API keys.`);
        }
    }
    listActiveKeys() {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.publicApiKey.findMany({
                orderBy: { createdAt: "asc" },
                where: { status: "active" }
            })).then((rows) => rows.map(toPublicApiKeyRecord));
        }
        return clone(this.readState().publicApiKeys.filter((key) => key.status === "active"));
    }
    findActiveKeyBySecretHash(secretHash) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.publicApiKey.findMany({
                orderBy: { createdAt: "asc" },
                where: { status: "active" }
            })).then((rows) => rows.map(toPublicApiKeyRecord).find((row) => row.secretHash === secretHash));
        }
        const matched = this.readState().publicApiKeys.find((key) => key.status === "active" && key.secretHash === secretHash);
        return matched ? clone(matched) : undefined;
    }
    consumePublicApiKeyReveal(input) {
        if (this.prismaClient) {
            return this.consumePrismaPublicApiKeyReveal(input);
        }
        const revealState = this.readState().publicApiKeyRevealStates.find((item) => item.keyId === input.keyId);
        if (!revealState) {
            return {
                consumedAt: input.consumedAt,
                keyId: input.keyId,
                status: "not_found"
            };
        }
        if (revealState.status !== "available") {
            return {
                consumedAt: revealState.consumedAt ?? input.consumedAt,
                keyId: input.keyId,
                keyPreview: revealState.keyPreview,
                status: "consumed"
            };
        }
        const rawSecret = this.publicApiRevealSecrets.get(input.keyId);
        if (!rawSecret) {
            this.markPublicApiKeyRevealConsumed(input.keyId, input.consumedAt);
            return {
                consumedAt: input.consumedAt,
                keyId: input.keyId,
                keyPreview: revealState.keyPreview,
                status: "consumed"
            };
        }
        this.markPublicApiKeyRevealConsumed(input.keyId, input.consumedAt);
        this.publicApiRevealSecrets.delete(input.keyId);
        return {
            consumedAt: input.consumedAt,
            keyId: input.keyId,
            keyPreview: revealState.keyPreview,
            rawSecret,
            status: "revealed"
        };
    }
    listPublicApiKeyRecords() {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.publicApiKey.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toPublicApiKeyStoredRecord));
        }
        return clone(this.readState().publicApiKeys);
    }
    updatePublicApiKeyStatus(input) {
        if (this.prismaClient) {
            return this.updatePrismaPublicApiKeyStatus(input);
        }
        const existing = this.readState().publicApiKeys.find((key) => key.keyId === input.keyId);
        if (!existing) {
            return undefined;
        }
        const persisted = { ...clone(existing), status: input.status };
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                publicApiKeys: current.publicApiKeys.map((item) => item.keyId === input.keyId ? persisted : item)
            };
        });
        return clone(persisted);
    }
    listWebhookEndpointRecords() {
        if (this.prismaClient?.webhookEndpoint) {
            return Promise.resolve(this.prismaClient.webhookEndpoint.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toWebhookEndpointRecord));
        }
        return clone(normalizeState(this.store.read()).webhookEndpointRecords);
    }
    saveWebhookEndpointRecord(record) {
        const persisted = normalizeWebhookEndpointRecords([record])[0];
        if (this.prismaClient?.webhookEndpoint) {
            const row = toWebhookEndpointRow(persisted);
            const { createdAt: _c, id: _id, ...update } = row;
            return Promise.resolve(this.prismaClient.webhookEndpoint.upsert({ create: row, update, where: { id: persisted.id } }))
                .then(toWebhookEndpointRecord);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.webhookEndpointRecords.some((item) => item.id === persisted.id);
            return {
                ...current,
                webhookEndpointRecords: exists
                    ? current.webhookEndpointRecords.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.webhookEndpointRecords, persisted]
            };
        });
        return clone(persisted);
    }
    findPublicDemoRequestByFingerprint(requestFingerprint) {
        this.assertSyncRuntimeAvailable();
        const normalized = String(requestFingerprint ?? "").trim();
        if (!normalized) {
            return undefined;
        }
        return clone(this.readState().publicDemoRequests.find((request) => request.requestFingerprint === normalized));
    }
    async findPublicDemoRequestByFingerprintAsync(requestFingerprint) {
        const normalized = String(requestFingerprint ?? "").trim();
        if (!normalized) {
            return undefined;
        }
        if (!this.prismaClient) {
            return this.findPublicDemoRequestByFingerprint(normalized);
        }
        const row = await this.prismaClient.publicDemoRequest.findFirst({ where: { requestFingerprint: normalized } });
        return row ? toPublicDemoRequest(row) : undefined;
    }
    findPublicDemoRequestByIdempotencyKey(idempotencyKey) {
        this.assertSyncRuntimeAvailable();
        const normalized = String(idempotencyKey ?? "").trim();
        if (!normalized) {
            return undefined;
        }
        return clone(this.readState().publicDemoRequests.find((request) => request.idempotencyKey === normalized));
    }
    async findPublicDemoRequestByIdempotencyKeyAsync(idempotencyKey) {
        const normalized = String(idempotencyKey ?? "").trim();
        if (!normalized) {
            return undefined;
        }
        if (!this.prismaClient) {
            return this.findPublicDemoRequestByIdempotencyKey(normalized);
        }
        const row = await this.prismaClient.publicDemoRequest.findFirst({ where: { idempotencyKey: normalized } });
        return row ? toPublicDemoRequest(row) : undefined;
    }
    savePublicDemoRequest(request) {
        this.assertSyncRuntimeAvailable();
        const persisted = normalizePublicDemoRequest(request);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.publicDemoRequests.some((item) => item.id === persisted.id);
            return {
                ...current,
                publicDemoRequests: exists
                    ? current.publicDemoRequests.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.publicDemoRequests, persisted]
            };
        });
        return clone(persisted);
    }
    async savePublicDemoRequestAsync(request) {
        const persisted = normalizePublicDemoRequest(request);
        if (!this.prismaClient) {
            return this.savePublicDemoRequest(persisted);
        }
        const row = await this.prismaClient.publicDemoRequest.upsert({
            create: toPrismaPublicDemoRequestCreateInput(persisted),
            update: toPrismaPublicDemoRequestUpdateInput(persisted),
            where: { id: persisted.id }
        });
        return toPublicDemoRequest(row);
    }
    async saveApiKeyRotationJobAsync(job) {
        const persisted = clone(job);
        if (!this.prismaClient) {
            return this.saveApiKeyRotationJob(persisted);
        }
        const row = await this.prismaClient.integrationApiKeyRotationJob.upsert({
            create: toPrismaApiKeyRotationJobCreateInput(persisted),
            update: toPrismaApiKeyRotationJobUpdateInput(persisted),
            where: { rotationId: persisted.rotationId }
        });
        return toApiKeyRotationJob(row);
    }
    savePublicDemoRequestAuditEvent(event) {
        this.assertSyncRuntimeAvailable();
        const persisted = normalizePublicDemoRequestAuditEvent(event);
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                publicDemoRequestAuditEvents: [...current.publicDemoRequestAuditEvents, persisted]
            };
        });
        return clone(persisted);
    }
    async savePublicDemoRequestAuditEventAsync(event) {
        const persisted = normalizePublicDemoRequestAuditEvent(event);
        if (!this.prismaClient) {
            return this.savePublicDemoRequestAuditEvent(persisted);
        }
        const row = await this.prismaClient.publicDemoRequestAuditEvent.create({
            data: toPrismaPublicDemoRequestAuditEventCreateInput(persisted)
        });
        return toPublicDemoRequestAuditEvent(row);
    }
    savePublicDemoRequestNotificationDescriptor(descriptor) {
        this.assertSyncRuntimeAvailable();
        const persisted = normalizePublicDemoRequestNotificationDescriptor(descriptor);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.publicDemoRequestNotificationDescriptors.some((item) => item.id === persisted.id);
            return {
                ...current,
                publicDemoRequestNotificationDescriptors: exists
                    ? current.publicDemoRequestNotificationDescriptors.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.publicDemoRequestNotificationDescriptors, persisted]
            };
        });
        return clone(persisted);
    }
    async listPublicDemoRequestNotificationDescriptorsAsync(filters = {}) {
        const normalizedQueue = filters.queue ?? "lead-notification";
        const normalizedStatus = normalizePublicDemoRequestNotificationStatus(filters.status ?? "queued");
        const limit = Number.isInteger(filters.limit) && Number(filters.limit) > 0 ? Number(filters.limit) : undefined;
        if (!this.prismaClient) {
            const descriptors = normalizeState(await this.readStateAsync())
                .publicDemoRequestNotificationDescriptors
                .filter((descriptor) => descriptor.queue === normalizedQueue && descriptor.status === normalizedStatus)
                .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
            return clone(typeof limit === "number" ? descriptors.slice(0, limit) : descriptors);
        }
        const rows = await this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({
            orderBy: { createdAt: "asc" },
            take: limit,
            where: {
                queue: normalizedQueue,
                status: normalizedStatus
            }
        });
        return rows.map(toPublicDemoRequestNotificationDescriptor);
    }
    async summarizePublicDemoRequestNotificationDescriptorsAsync(filters = {}) {
        const queue = filters.queue ?? "lead-notification";
        if (!this.prismaClient) {
            const descriptors = normalizeState(await this.readStateAsync())
                .publicDemoRequestNotificationDescriptors
                .filter((descriptor) => descriptor.queue === queue);
            const queued = descriptors.filter((descriptor) => descriptor.status === "queued");
            const failed = descriptors.filter((descriptor) => descriptor.status === "failed");
            const evidenceDescriptors = failed.length ? failed : descriptors;
            return {
                deadLetterCount: failed.length,
                latestDescriptor: latestPublicDemoRequestNotificationDescriptor(evidenceDescriptors),
                queue,
                queueDepth: queued.length
            };
        }
        const [queueDepth, deadLetterCount, queuedRows, failedRows, deliveredRows] = await Promise.all([
            this.prismaClient.publicDemoRequestNotificationDescriptor.count({ where: { queue, status: "queued" } }),
            this.prismaClient.publicDemoRequestNotificationDescriptor.count({ where: { queue, status: "failed" } }),
            this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({
                orderBy: { updatedAt: "desc" },
                take: 25,
                where: { queue, status: "queued" }
            }),
            this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({
                orderBy: { updatedAt: "desc" },
                take: 25,
                where: { queue, status: "failed" }
            }),
            this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({
                orderBy: { updatedAt: "desc" },
                take: 25,
                where: { queue, status: "delivered" }
            })
        ]);
        const queuedDescriptors = queuedRows.map(toPublicDemoRequestNotificationDescriptor);
        const failedDescriptors = failedRows.map(toPublicDemoRequestNotificationDescriptor);
        const deliveredDescriptors = deliveredRows.map(toPublicDemoRequestNotificationDescriptor);
        const evidenceDescriptors = deadLetterCount > 0
            ? failedDescriptors
            : [...queuedDescriptors, ...deliveredDescriptors];
        return {
            deadLetterCount,
            latestDescriptor: latestPublicDemoRequestNotificationDescriptor(evidenceDescriptors),
            queue,
            queueDepth
        };
    }
    async savePublicDemoRequestNotificationDescriptorAsync(descriptor) {
        const persisted = normalizePublicDemoRequestNotificationDescriptor(descriptor);
        if (!this.prismaClient) {
            return this.savePublicDemoRequestNotificationDescriptor(persisted);
        }
        const row = await this.prismaClient.publicDemoRequestNotificationDescriptor.upsert({
            create: toPrismaPublicDemoRequestNotificationDescriptorCreateInput(persisted),
            update: toPrismaPublicDemoRequestNotificationDescriptorUpdateInput(persisted),
            where: { id: persisted.id }
        });
        return toPublicDemoRequestNotificationDescriptor(row);
    }
    markPublicApiKeyRevealConsumed(keyId, consumedAt) {
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                publicApiKeyRevealStates: current.publicApiKeyRevealStates.map((item) => item.keyId === keyId
                    ? { ...item, consumedAt, status: "consumed" }
                    : item)
            };
        });
    }
    async savePrismaPublicApiKey(key, revealState, normalizedSecret) {
        if (!this.prismaClient) {
            return key;
        }
        const create = toPrismaPublicApiKeyCreateInput(key);
        const row = await this.prismaClient.publicApiKey.upsert({
            create,
            update: toPrismaPublicApiKeyUpdateInput(create),
            where: { keyId: key.keyId }
        });
        if (this.prismaClient.publicApiKeyRevealState) {
            const revealCreate = toPrismaPublicApiKeyRevealStateCreateInput(revealState);
            const persistedRevealState = await this.prismaClient.publicApiKeyRevealState.upsert({
                create: revealCreate,
                update: toPrismaPublicApiKeyRevealStateUpdateInput(revealCreate),
                where: { keyId: revealState.keyId }
            });
            if (persistedRevealState.status === "available") {
                this.publicApiRevealSecrets.set(key.keyId, normalizedSecret);
            }
            else {
                this.publicApiRevealSecrets.delete(key.keyId);
            }
        }
        return toPublicApiKeyStoredRecord(row);
    }
    async savePrismaPublicApiKeyReference(key) {
        if (!this.prismaClient) {
            return key;
        }
        const create = toPrismaPublicApiKeyCreateInput(key);
        const row = await this.prismaClient.publicApiKey.upsert({
            create,
            update: toPrismaPublicApiKeyReferenceUpdateInput(create),
            where: { keyId: key.keyId }
        });
        return toPublicApiKeyStoredRecord(row);
    }
    async updatePrismaPublicApiKeyStatus(input) {
        if (!this.prismaClient) {
            return undefined;
        }
        const row = await this.prismaClient.publicApiKey.findUnique({ where: { keyId: input.keyId } });
        if (!row) {
            return undefined;
        }
        const updated = await this.prismaClient.publicApiKey.upsert({
            create: row,
            update: { status: input.status },
            where: { keyId: input.keyId }
        });
        return toPublicApiKeyStoredRecord(updated);
    }
    async consumePrismaPublicApiKeyReveal(input) {
        const revealDelegate = this.prismaClient?.publicApiKeyRevealState;
        if (!revealDelegate) {
            return {
                consumedAt: input.consumedAt,
                keyId: input.keyId,
                status: "not_found"
            };
        }
        const revealState = await revealDelegate.findUnique({ where: { keyId: input.keyId } });
        if (!revealState) {
            return {
                consumedAt: input.consumedAt,
                keyId: input.keyId,
                status: "not_found"
            };
        }
        if (revealState.status !== "available") {
            return {
                consumedAt: revealState.consumedAt?.toISOString() ?? input.consumedAt,
                keyId: input.keyId,
                keyPreview: revealState.keyPreview,
                status: "consumed"
            };
        }
        const transition = await revealDelegate.updateMany({
            data: {
                consumedAt: new Date(input.consumedAt),
                keyPreview: revealState.keyPreview,
                status: "consumed"
            },
            where: { keyId: input.keyId, status: "available" }
        });
        if (transition.count !== 1) {
            const consumedState = await revealDelegate.findUnique({ where: { keyId: input.keyId } });
            return {
                consumedAt: consumedState?.consumedAt?.toISOString() ?? input.consumedAt,
                keyId: input.keyId,
                keyPreview: consumedState?.keyPreview ?? revealState.keyPreview,
                status: "consumed"
            };
        }
        const rawSecret = this.publicApiRevealSecrets.get(input.keyId);
        this.publicApiRevealSecrets.delete(input.keyId);
        if (!rawSecret) {
            return {
                consumedAt: input.consumedAt,
                keyId: input.keyId,
                keyPreview: revealState.keyPreview,
                status: "consumed"
            };
        }
        return {
            consumedAt: input.consumedAt,
            keyId: input.keyId,
            keyPreview: revealState.keyPreview,
            rawSecret,
            status: "revealed"
        };
    }
    async savePrismaApiKeyRotationAuditEvent(event) {
        if (!this.prismaClient) {
            return event;
        }
        const row = await this.prismaClient.publicApiKeyRotationAuditEvent.create({
            data: toPrismaApiKeyRotationAuditEventCreateInput(event)
        });
        return toApiKeyRotationAuditEvent(row);
    }
    findWebhookReplay(idempotencyKey) {
        this.assertSyncRuntimeAvailable();
        return clone(this.readState().webhookReplayJournal.find((item) => item.idempotencyKey === idempotencyKey));
    }
    async findWebhookReplayAsync(idempotencyKey) {
        const normalized = String(idempotencyKey ?? "").trim();
        if (!normalized) {
            return undefined;
        }
        if (!this.prismaClient) {
            return this.findWebhookReplay(normalized);
        }
        const row = await this.prismaClient.webhookReplayJournalEntry.findUnique({
            where: { idempotencyKey: normalized }
        });
        return row ? toWebhookReplayJournalEntry(row) : undefined;
    }
    saveWebhookReplay(entry) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(entry);
        const existing = this.findWebhookReplay(persisted.idempotencyKey);
        if (existing) {
            return existing;
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                webhookReplayJournal: [...current.webhookReplayJournal, persisted]
            };
        });
        return clone(persisted);
    }
    async saveWebhookReplayAsync(entry) {
        const persisted = clone(entry);
        if (!this.prismaClient) {
            return this.saveWebhookReplay(persisted);
        }
        const existing = await this.findWebhookReplayAsync(persisted.idempotencyKey);
        if (existing) {
            return existing;
        }
        const row = await this.prismaClient.webhookReplayJournalEntry.upsert({
            create: toPrismaWebhookReplayJournalCreateInput(persisted),
            update: {},
            where: { idempotencyKey: persisted.idempotencyKey }
        });
        return toWebhookReplayJournalEntry(row);
    }
    saveWebhookReplayAuditEvent(event) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(event);
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                webhookReplayAuditEvents: [...current.webhookReplayAuditEvents, persisted]
            };
        });
        return clone(persisted);
    }
    async saveWebhookReplayAuditEventAsync(event) {
        const persisted = clone(event);
        if (!this.prismaClient) {
            return this.saveWebhookReplayAuditEvent(persisted);
        }
        const row = await this.prismaClient.webhookReplayAuditEvent.create({
            data: toPrismaWebhookReplayAuditEventCreateInput(persisted)
        });
        return toWebhookReplayAuditEvent(row);
    }
    findWebhookDeliveryJournalEntry(deliveryId) {
        this.assertSyncRuntimeAvailable();
        return clone(this.readState().webhookDeliveryJournal.find((item) => item.deliveryId === deliveryId));
    }
    async findWebhookDeliveryJournalEntryAsync(deliveryId) {
        const normalized = String(deliveryId ?? "").trim();
        if (!normalized) {
            return undefined;
        }
        if (!this.prismaClient) {
            return this.findWebhookDeliveryJournalEntry(normalized);
        }
        const row = await this.prismaClient.webhookDeliveryJournalEntry.findUnique({
            where: { deliveryId: normalized }
        });
        return row ? toWebhookDeliveryJournalEntry(row) : undefined;
    }
    listWebhookDeliveryJournal(filters = {}) {
        this.assertSyncRuntimeAvailable();
        const status = String(filters.status ?? "").trim();
        const rows = this.readState().webhookDeliveryJournal;
        return clone(status ? rows.filter((item) => item.status === status) : rows);
    }
    async listWebhookDeliveryJournalAsync(filters = {}) {
        if (!this.prismaClient) {
            return this.listWebhookDeliveryJournal(filters);
        }
        const status = String(filters.status ?? "").trim();
        const rows = await this.prismaClient.webhookDeliveryJournalEntry.findMany({
            orderBy: { createdAt: "asc" },
            where: {
                ...(status ? { status } : {})
            }
        });
        return rows.map(toWebhookDeliveryJournalEntry);
    }
    saveWebhookDeliveryJournalEntry(entry) {
        this.assertSyncRuntimeAvailable();
        const persisted = normalizeWebhookDeliveryJournalEntry(entry);
        const existing = this.findWebhookDeliveryJournalEntry(persisted.deliveryId);
        if (existing) {
            return existing;
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                webhookDeliveryJournal: [...current.webhookDeliveryJournal, persisted]
            };
        });
        return clone(persisted);
    }
    async saveWebhookDeliveryJournalEntryAsync(entry) {
        const persisted = normalizeWebhookDeliveryJournalEntry(entry);
        if (!this.prismaClient) {
            return this.saveWebhookDeliveryJournalEntry(persisted);
        }
        const existing = await this.findWebhookDeliveryJournalEntryAsync(persisted.deliveryId);
        if (existing) {
            return existing;
        }
        const row = await this.prismaClient.webhookDeliveryJournalEntry.upsert({
            create: toPrismaWebhookDeliveryJournalCreateInput(persisted),
            update: {},
            where: { deliveryId: persisted.deliveryId }
        });
        return toWebhookDeliveryJournalEntry(row);
    }
    recordWebhookDeliveryRetryState(input) {
        this.assertSyncRuntimeAvailable();
        const existing = this.findWebhookDeliveryJournalEntry(input.deliveryId);
        if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
            return undefined;
        }
        const next = normalizeWebhookDeliveryJournalEntry({
            ...existing,
            attempts: input.attempts,
            lastAttemptAt: input.lastAttemptAt,
            lastError: normalizeWebhookDeliveryJournalError(input.lastError),
            lockedAt: undefined,
            nextAttemptAt: input.nextAttemptAt,
            status: "retry_scheduled"
        });
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                webhookDeliveryJournal: current.webhookDeliveryJournal.map((item) => item.deliveryId === input.deliveryId ? next : item)
            };
        });
        return clone(next);
    }
    async recordWebhookDeliveryRetryStateAsync(input) {
        if (!this.prismaClient) {
            return this.recordWebhookDeliveryRetryState(input);
        }
        const existing = await this.findWebhookDeliveryJournalEntryAsync(input.deliveryId);
        if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
            return undefined;
        }
        const row = await this.prismaClient.webhookDeliveryJournalEntry.update({
            data: {
                attempts: input.attempts,
                lastAttemptAt: new Date(input.lastAttemptAt),
                lastError: normalizeWebhookDeliveryJournalError(input.lastError),
                lockedAt: null,
                nextAttemptAt: new Date(input.nextAttemptAt),
                status: "retry_scheduled",
                updatedAt: new Date(input.lastAttemptAt)
            },
            where: { deliveryId: input.deliveryId }
        });
        return toWebhookDeliveryJournalEntry(row);
    }
    recordWebhookDeliveryDeadLetterState(input) {
        this.assertSyncRuntimeAvailable();
        const existing = this.findWebhookDeliveryJournalEntry(input.deliveryId);
        if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
            return undefined;
        }
        const next = normalizeWebhookDeliveryJournalEntry({
            ...existing,
            attempts: input.attempts,
            deadLetteredAt: input.deadLetteredAt,
            lastAttemptAt: input.lastAttemptAt,
            lastError: normalizeWebhookDeliveryJournalError(input.lastError),
            lockedAt: undefined,
            nextAttemptAt: undefined,
            status: "dead_lettered"
        });
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                webhookDeliveryJournal: current.webhookDeliveryJournal.map((item) => item.deliveryId === input.deliveryId ? next : item)
            };
        });
        return clone(next);
    }
    async recordWebhookDeliveryDeadLetterStateAsync(input) {
        if (!this.prismaClient) {
            return this.recordWebhookDeliveryDeadLetterState(input);
        }
        const existing = await this.findWebhookDeliveryJournalEntryAsync(input.deliveryId);
        if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
            return undefined;
        }
        const row = await this.prismaClient.webhookDeliveryJournalEntry.update({
            data: {
                attempts: input.attempts,
                deadLetteredAt: new Date(input.deadLetteredAt),
                lastAttemptAt: new Date(input.lastAttemptAt),
                lastError: normalizeWebhookDeliveryJournalError(input.lastError),
                lockedAt: null,
                nextAttemptAt: null,
                status: "dead_lettered",
                updatedAt: new Date(input.lastAttemptAt)
            },
            where: { deliveryId: input.deliveryId }
        });
        return toWebhookDeliveryJournalEntry(row);
    }
    recordWebhookDeliveryAttemptSuccess(input) {
        this.assertSyncRuntimeAvailable();
        const existing = this.findWebhookDeliveryJournalEntry(input.deliveryId);
        if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
            return undefined;
        }
        const next = normalizeWebhookDeliveryJournalEntry({
            ...existing,
            attempts: existing.attempts + 1,
            lastAttemptAt: input.attemptedAt,
            lastError: undefined,
            lockedAt: undefined,
            nextAttemptAt: undefined,
            status: "delivered"
        });
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                webhookDeliveryJournal: current.webhookDeliveryJournal.map((item) => item.deliveryId === input.deliveryId ? next : item)
            };
        });
        return clone(next);
    }
    async recordWebhookDeliveryAttemptSuccessAsync(input) {
        if (!this.prismaClient) {
            return this.recordWebhookDeliveryAttemptSuccess(input);
        }
        const existing = await this.findWebhookDeliveryJournalEntryAsync(input.deliveryId);
        if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
            return undefined;
        }
        const row = await this.prismaClient.webhookDeliveryJournalEntry.update({
            data: {
                attempts: existing.attempts + 1,
                lastAttemptAt: new Date(input.attemptedAt),
                lastError: null,
                lockedAt: null,
                nextAttemptAt: null,
                status: "delivered",
                updatedAt: new Date(input.attemptedAt)
            },
            where: { deliveryId: input.deliveryId }
        });
        return toWebhookDeliveryJournalEntry(row);
    }
    claimWebhookDeliveryJournalEntries(input) {
        this.assertSyncRuntimeAvailable();
        const nowMs = Date.parse(input.now);
        const limit = input.limit ?? 100;
        const leaseTimeoutMs = input.leaseTimeoutMs ?? 300_000;
        const staleBeforeMs = nowMs - leaseTimeoutMs;
        const claimedIds = [];
        const candidates = this.readState().webhookDeliveryJournal
            .filter((entry) => !input.queue || entry.queue === input.queue)
            .filter((entry) => isClaimableWebhookDeliveryJournalEntry(entry, nowMs, staleBeforeMs))
            .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
            .slice(0, limit);
        if (!candidates.length) {
            return [];
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const candidateIds = new Set(candidates.map((entry) => entry.deliveryId));
            return {
                ...current,
                webhookDeliveryJournal: current.webhookDeliveryJournal.map((entry) => {
                    if (!candidateIds.has(entry.deliveryId) || claimedIds.includes(entry.deliveryId)) {
                        return entry;
                    }
                    const claimed = normalizeWebhookDeliveryJournalEntry({
                        ...entry,
                        lockedAt: input.now,
                        status: "publishing"
                    });
                    claimedIds.push(entry.deliveryId);
                    return claimed;
                })
            };
        });
        return this.readState().webhookDeliveryJournal
            .filter((entry) => claimedIds.includes(entry.deliveryId))
            .sort((left, right) => claimedIds.indexOf(left.deliveryId) - claimedIds.indexOf(right.deliveryId));
    }
    async claimWebhookDeliveryJournalEntriesAsync(input) {
        if (!this.prismaClient) {
            return this.claimWebhookDeliveryJournalEntries(input);
        }
        const nowMs = Date.parse(input.now);
        const limit = input.limit ?? 100;
        const leaseTimeoutMs = input.leaseTimeoutMs ?? 300_000;
        const staleBeforeMs = nowMs - leaseTimeoutMs;
        const rows = await this.prismaClient.webhookDeliveryJournalEntry.findMany({
            orderBy: { createdAt: "asc" },
            take: limit,
            where: {
                ...(input.queue ? { queue: input.queue } : {}),
                status: { in: ["queued", "retry_scheduled", "publishing"] }
            }
        });
        const candidates = rows
            .map(toWebhookDeliveryJournalEntry)
            .filter((entry) => isClaimableWebhookDeliveryJournalEntry(entry, nowMs, staleBeforeMs))
            .slice(0, limit);
        const claimed = [];
        for (const candidate of candidates) {
            const updated = await this.prismaClient.webhookDeliveryJournalEntry.updateMany({
                data: {
                    lockedAt: new Date(input.now),
                    status: "publishing",
                    updatedAt: new Date(input.now)
                },
                where: {
                    deliveryId: candidate.deliveryId,
                    lockedAt: candidate.lockedAt ? new Date(candidate.lockedAt) : null,
                    status: candidate.status
                }
            });
            if (updated.count === 1) {
                claimed.push(normalizeWebhookDeliveryJournalEntry({
                    ...candidate,
                    lockedAt: input.now,
                    status: "publishing"
                }));
            }
        }
        return claimed;
    }
    listSecuritySessions() {
        this.assertSyncRuntimeAvailable();
        return clone(this.readState().securitySessions);
    }
    async listSecuritySessionsAsync() {
        if (!this.prismaClient) {
            return this.listSecuritySessions();
        }
        const rows = await this.prismaClient.securitySession.findMany({ orderBy: { lastSeen: "asc" } });
        return rows.map(toSecuritySession);
    }
    saveSecuritySession(session) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(session);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.securitySessions.some((item) => item.id === persisted.id);
            return {
                ...current,
                securitySessions: exists
                    ? current.securitySessions.map((item) => item.id === persisted.id ? persisted : item)
                    : [...current.securitySessions, persisted]
            };
        });
        return clone(persisted);
    }
    async saveSecuritySessionAsync(session) {
        const persisted = clone(session);
        if (!this.prismaClient) {
            return this.saveSecuritySession(persisted);
        }
        const row = await this.prismaClient.securitySession.upsert({
            create: toPrismaSecuritySessionCreateInput(persisted),
            update: toPrismaSecuritySessionUpdateInput(persisted),
            where: { id: persisted.id }
        });
        return toSecuritySession(row);
    }
    listChannelConnections(filters) {
        this.assertSyncRuntimeAvailable();
        const tenantId = String(filters.tenantId ?? "").trim();
        const type = String(filters.type ?? "").trim().toLowerCase();
        return clone(this.readState().channelConnections.filter((connection) => connection.tenantId === tenantId && (!type || connection.type === type)));
    }
    async listChannelConnectionsAsync(filters) {
        if (!this.prismaClient) {
            return this.listChannelConnections(filters);
        }
        const tenantId = String(filters.tenantId ?? "").trim();
        const type = String(filters.type ?? "").trim().toLowerCase();
        const rows = await this.prismaClient.channelConnection.findMany({
            orderBy: { createdAt: "asc" },
            where: {
                tenantId,
                ...(type ? { type } : {})
            }
        });
        return rows.map(toChannelConnection);
    }
    async upsertSdkVisitorPresence(input) {
        const now = input.lastSeenAt;
        if (!this.prismaClient) {
            let saved;
            this.store.update((state) => {
                const current = normalizeState(state);
                const existing = current.sdkVisitorPresenceSessions.find((item) => item.tenantId === input.tenantId
                    && item.channelConnectionId === input.channelConnectionId && item.sessionKeyHash === input.sessionKeyHash);
                saved = normalizeSdkVisitorPresence({
                    ...(existing ?? { createdAt: now, firstSeenAt: now, id: `sdk_presence_${randomUUID()}` }),
                    ...input, connected: true, disconnectedAt: null, updatedAt: now
                });
                return { ...current, sdkVisitorPresenceSessions: existing
                        ? current.sdkVisitorPresenceSessions.map((item) => item.id === existing.id ? saved : item)
                        : [...current.sdkVisitorPresenceSessions, saved] };
            });
            return clone(saved);
        }
        const delegate = this.prismaClient.sdkVisitorPresenceSession;
        if (!delegate)
            throw new Error("prisma_sdk_visitor_presence_delegate_required");
        const key = { channelConnectionId: input.channelConnectionId, sessionKeyHash: input.sessionKeyHash, tenantId: input.tenantId };
        const row = await delegate.upsert({
            create: toPrismaSdkVisitorPresence({ ...input, connected: true, createdAt: now, disconnectedAt: null,
                firstSeenAt: now, id: `sdk_presence_${randomUUID()}`, updatedAt: now }),
            update: { connected: true, disconnectedAt: null, expiresAt: new Date(input.expiresAt), lastSeenAt: new Date(now),
                pagePath: input.pagePath, pageUrl: input.pageUrl, referrer: input.referrer, subjectId: input.subjectId, updatedAt: new Date(now) },
            where: { tenantId_channelConnectionId_sessionKeyHash: key }
        });
        return fromPrismaSdkVisitorPresence(row);
    }
    async disconnectSdkVisitorPresence(input) {
        if (!this.prismaClient) {
            const existing = this.readState().sdkVisitorPresenceSessions.find((item) => item.tenantId === input.tenantId
                && item.channelConnectionId === input.channelConnectionId && item.sessionKeyHash === input.sessionKeyHash);
            if (!existing)
                return null;
            const saved = normalizeSdkVisitorPresence({ ...existing, connected: false, disconnectedAt: input.disconnectedAt,
                expiresAt: input.disconnectedAt, lastSeenAt: input.disconnectedAt, updatedAt: input.disconnectedAt });
            this.store.update((state) => ({ ...normalizeState(state), sdkVisitorPresenceSessions: normalizeState(state).sdkVisitorPresenceSessions.map((item) => item.id === saved.id ? saved : item) }));
            return clone(saved);
        }
        const delegate = this.prismaClient.sdkVisitorPresenceSession;
        if (!delegate)
            throw new Error("prisma_sdk_visitor_presence_delegate_required");
        const where = { tenantId_channelConnectionId_sessionKeyHash: { channelConnectionId: input.channelConnectionId,
                sessionKeyHash: input.sessionKeyHash, tenantId: input.tenantId } };
        const existing = await delegate.findUnique({ where });
        if (!existing)
            return null;
        const row = await delegate.upsert({ create: existing, update: { connected: false, disconnectedAt: new Date(input.disconnectedAt),
                expiresAt: new Date(input.disconnectedAt), lastSeenAt: new Date(input.disconnectedAt), updatedAt: new Date(input.disconnectedAt) }, where });
        return fromPrismaSdkVisitorPresence(row);
    }
    async listLiveSdkVisitorPresence(input) {
        const limit = Number.isInteger(input.limit) && Number(input.limit) > 0 ? Number(input.limit) : 50;
        if (!this.prismaClient)
            return this.readState().sdkVisitorPresenceSessions
                .filter((item) => item.connected && item.expiresAt > input.at && (!input.tenantId || item.tenantId === input.tenantId))
                .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, limit).map(clone);
        const delegate = this.prismaClient.sdkVisitorPresenceSession;
        if (!delegate)
            throw new Error("prisma_sdk_visitor_presence_delegate_required");
        const rows = await delegate.findMany({ orderBy: { lastSeenAt: "desc" }, take: limit,
            where: { connected: true, expiresAt: { gt: new Date(input.at) }, ...(input.tenantId ? { tenantId: input.tenantId } : {}) } });
        return rows.map(fromPrismaSdkVisitorPresence);
    }
    findChannelConnection(tenantId, connectionId) {
        this.assertSyncRuntimeAvailable();
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedConnectionId = String(connectionId ?? "").trim();
        return clone(this.readState().channelConnections.find((connection) => connection.tenantId === normalizedTenantId && connection.id === normalizedConnectionId));
    }
    async findChannelConnectionAsync(tenantId, connectionId) {
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedConnectionId = String(connectionId ?? "").trim();
        if (!normalizedTenantId || !normalizedConnectionId) {
            return undefined;
        }
        if (!this.prismaClient) {
            return this.findChannelConnection(normalizedTenantId, normalizedConnectionId);
        }
        const row = await this.prismaClient.channelConnection.findUnique({
            where: { id: normalizedConnectionId }
        });
        if (!row || row.tenantId !== normalizedTenantId) {
            return undefined;
        }
        return toChannelConnection(row);
    }
    saveChannelConnection(connection) {
        this.assertSyncRuntimeAvailable();
        const persisted = normalizeChannelConnection(connection);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.channelConnections.some((item) => item.tenantId === persisted.tenantId && item.id === persisted.id);
            return {
                ...current,
                channelConnections: exists
                    ? current.channelConnections.map((item) => item.tenantId === persisted.tenantId && item.id === persisted.id ? persisted : item)
                    : [...current.channelConnections, persisted]
            };
        });
        return clone(persisted);
    }
    async saveChannelConnectionAsync(connection) {
        const persisted = normalizeChannelConnection(connection);
        if (!this.prismaClient) {
            return this.saveChannelConnection(persisted);
        }
        const row = await this.prismaClient.channelConnection.upsert({
            create: toPrismaChannelConnectionCreateInput(persisted),
            update: toPrismaChannelConnectionUpdateInput(persisted),
            where: { id: persisted.id }
        });
        return toChannelConnection(row);
    }
    /**
     * Removes the connection configuration and all configuration records that
     * cascade from it (credentials, Telegram state, provider bindings). Historic
     * conversations and reusable API keys are deliberately retained, but no
     * longer point at the removed connection.
     */
    async deleteChannelConnectionAsync(tenantId, connectionId) {
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedConnectionId = String(connectionId ?? "").trim();
        if (!normalizedTenantId || !normalizedConnectionId)
            return false;
        if (!this.prismaClient) {
            let removed = false;
            this.store.update((state) => {
                const current = normalizeState(state);
                const exists = current.channelConnections.some((connection) => connection.tenantId === normalizedTenantId && connection.id === normalizedConnectionId);
                if (!exists)
                    return current;
                removed = true;
                return {
                    ...current,
                    channelConnectionEvents: current.channelConnectionEvents.filter((event) => event.tenantId !== normalizedTenantId || event.connectionId !== normalizedConnectionId),
                    channelConnections: current.channelConnections.filter((connection) => connection.tenantId !== normalizedTenantId || connection.id !== normalizedConnectionId),
                    providerConnectionCredentials: (current.providerConnectionCredentials ?? []).filter((credential) => credential.tenantId !== normalizedTenantId || credential.channelConnectionId !== normalizedConnectionId),
                    publicApiKeys: current.publicApiKeys.map((key) => key.tenantId === normalizedTenantId && key.channelConnectionId === normalizedConnectionId
                        ? { ...key, channelConnectionId: null }
                        : key),
                    sdkVisitorPresenceSessions: current.sdkVisitorPresenceSessions.filter((session) => session.tenantId !== normalizedTenantId || session.channelConnectionId !== normalizedConnectionId),
                    telegramConnections: current.telegramConnections.filter((connection) => connection.tenantId !== normalizedTenantId || connection.channelConnectionId !== normalizedConnectionId)
                };
            });
            return removed;
        }
        const existing = await this.prismaClient.channelConnection.findUnique({ where: { id: normalizedConnectionId } });
        if (!existing || existing.tenantId !== normalizedTenantId)
            return false;
        const now = new Date();
        await this.prismaClient.publicApiKey.updateMany({
            data: { channelConnectionId: null, updatedAt: now },
            where: { channelConnectionId: normalizedConnectionId, tenantId: normalizedTenantId }
        });
        await this.prismaClient.conversation.updateMany({
            data: { channelConnectionId: null, updatedAt: now },
            where: { channelConnectionId: normalizedConnectionId, tenantId: normalizedTenantId }
        });
        await this.prismaClient.channelConnection.delete({ where: { id: normalizedConnectionId } });
        return true;
    }
    listChannelConnectionEvents(tenantId, connectionId) {
        this.assertSyncRuntimeAvailable();
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedConnectionId = String(connectionId ?? "").trim();
        return clone(this.readState().channelConnectionEvents.filter((event) => event.tenantId === normalizedTenantId && event.connectionId === normalizedConnectionId));
    }
    async listChannelConnectionEventsAsync(tenantId, connectionId) {
        if (!this.prismaClient) {
            return this.listChannelConnectionEvents(tenantId, connectionId);
        }
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedConnectionId = String(connectionId ?? "").trim();
        const rows = await this.prismaClient.channelConnectionEvent.findMany({
            orderBy: { at: "asc" },
            where: {
                connectionId: normalizedConnectionId,
                tenantId: normalizedTenantId
            }
        });
        return rows.map(toChannelConnectionEvent);
    }
    saveChannelConnectionEvent(event) {
        this.assertSyncRuntimeAvailable();
        const persisted = normalizeChannelConnectionEvent(event);
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                channelConnectionEvents: [...current.channelConnectionEvents, persisted]
            };
        });
        return clone(persisted);
    }
    async saveChannelConnectionEventAsync(event) {
        const persisted = normalizeChannelConnectionEvent(event);
        if (!this.prismaClient) {
            return this.saveChannelConnectionEvent(persisted);
        }
        const row = await this.prismaClient.channelConnectionEvent.create({
            data: toPrismaChannelConnectionEventCreateInput(persisted)
        });
        return toChannelConnectionEvent(row);
    }
    listChannelConnectionAuditEvents() {
        this.assertSyncRuntimeAvailable();
        return clone(this.readState().channelConnectionAuditEvents);
    }
    async listChannelConnectionAuditEventsAsync() {
        if (!this.prismaClient) {
            return this.listChannelConnectionAuditEvents();
        }
        const rows = await this.prismaClient.channelConnectionAuditEvent.findMany({ orderBy: { at: "asc" } });
        return rows.map(toChannelConnectionAuditEvent);
    }
    saveChannelConnectionAuditEvent(event) {
        this.assertSyncRuntimeAvailable();
        const persisted = normalizeChannelConnectionAuditEvent(event);
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                channelConnectionAuditEvents: [...current.channelConnectionAuditEvents, persisted]
            };
        });
        return clone(persisted);
    }
    async saveChannelConnectionAuditEventAsync(event) {
        const persisted = normalizeChannelConnectionAuditEvent(event);
        if (!this.prismaClient) {
            return this.saveChannelConnectionAuditEvent(persisted);
        }
        const row = await this.prismaClient.channelConnectionAuditEvent.create({
            data: toPrismaChannelConnectionAuditEventCreateInput(persisted)
        });
        return toChannelConnectionAuditEvent(row);
    }
    findProviderConnectionCredential(tenantId, channelConnectionId) {
        this.assertSyncRuntimeAvailable();
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedConnectionId = String(channelConnectionId ?? "").trim();
        return clone((this.readState().providerConnectionCredentials ?? []).find((item) => item.tenantId === normalizedTenantId && item.channelConnectionId === normalizedConnectionId));
    }
    async findProviderConnectionCredentialAsync(tenantId, channelConnectionId) {
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedConnectionId = String(channelConnectionId ?? "").trim();
        if (!normalizedTenantId || !normalizedConnectionId)
            return undefined;
        if (!this.prismaClient)
            return this.findProviderConnectionCredential(normalizedTenantId, normalizedConnectionId);
        const row = await this.prismaClient.providerConnectionCredential.findUnique({ where: { channelConnectionId: normalizedConnectionId } });
        return row?.tenantId === normalizedTenantId ? toProviderConnectionCredential(row) : undefined;
    }
    async findProviderConnectionCredentialByConnectionIdAsync(channelConnectionId) {
        const normalizedConnectionId = String(channelConnectionId ?? "").trim();
        if (!normalizedConnectionId)
            return undefined;
        if (!this.prismaClient) {
            this.assertSyncRuntimeAvailable();
            return clone((this.readState().providerConnectionCredentials ?? []).find((item) => item.channelConnectionId === normalizedConnectionId));
        }
        const row = await this.prismaClient.providerConnectionCredential.findUnique({ where: { channelConnectionId: normalizedConnectionId } });
        return row ? toProviderConnectionCredential(row) : undefined;
    }
    listActiveProviderConnectionCredentials(tenantId, provider) {
        this.assertSyncRuntimeAvailable();
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedProvider = String(provider ?? "").trim().toLowerCase();
        return clone((this.readState().providerConnectionCredentials ?? []).filter((item) => item.tenantId === normalizedTenantId && item.provider === normalizedProvider && item.status === "active"));
    }
    async listActiveProviderConnectionCredentialsAsync(tenantId, provider) {
        const normalizedTenantId = String(tenantId ?? "").trim();
        const normalizedProvider = String(provider ?? "").trim().toLowerCase();
        if (!normalizedTenantId || !normalizedProvider)
            return [];
        if (!this.prismaClient)
            return this.listActiveProviderConnectionCredentials(normalizedTenantId, normalizedProvider);
        const rows = await this.prismaClient.providerConnectionCredential.findMany({
            orderBy: { createdAt: "asc" },
            where: { provider: normalizedProvider, status: "active", tenantId: normalizedTenantId }
        });
        return rows.map(toProviderConnectionCredential);
    }
    saveProviderConnectionCredential(credential) {
        this.assertSyncRuntimeAvailable();
        const persisted = normalizeProviderConnectionCredential(credential);
        this.store.update((state) => {
            const current = normalizeState(state);
            const credentials = current.providerConnectionCredentials ?? [];
            const exists = credentials.some((item) => item.channelConnectionId === persisted.channelConnectionId);
            return { ...current, providerConnectionCredentials: exists
                    ? credentials.map((item) => item.channelConnectionId === persisted.channelConnectionId ? persisted : item)
                    : [...credentials, persisted] };
        });
        return clone(persisted);
    }
    async saveProviderConnectionCredentialAsync(credential) {
        const persisted = normalizeProviderConnectionCredential(credential);
        if (!this.prismaClient)
            return this.saveProviderConnectionCredential(persisted);
        const row = await this.prismaClient.providerConnectionCredential.upsert({
            create: toPrismaProviderConnectionCredentialCreateInput(persisted),
            update: toPrismaProviderConnectionCredentialUpdateInput(persisted),
            where: { channelConnectionId: persisted.channelConnectionId }
        });
        return toProviderConnectionCredential(row);
    }
    findTelegramConnectionByTenantId(tenantId) {
        this.assertSyncRuntimeAvailable();
        const normalizedTenantId = String(tenantId ?? "").trim();
        return clone(this.readState().telegramConnections.find((item) => item.tenantId === normalizedTenantId));
    }
    async findTelegramConnectionByTenantIdAsync(tenantId) {
        const normalizedTenantId = String(tenantId ?? "").trim();
        if (!normalizedTenantId) {
            return undefined;
        }
        if (!this.prismaClient) {
            return this.findTelegramConnectionByTenantId(normalizedTenantId);
        }
        const row = await this.prismaClient.telegramConnection.findFirst({
            where: { tenantId: normalizedTenantId }
        });
        return row ? toTelegramConnection(row) : undefined;
    }
    findTelegramConnectionByWebhookSecret(webhookSecret) {
        this.assertSyncRuntimeAvailable();
        const normalizedSecret = String(webhookSecret ?? "").trim();
        return clone(this.readState().telegramConnections.find((item) => item.status === "active" && item.webhookSecret === normalizedSecret));
    }
    async findTelegramConnectionByWebhookSecretAsync(webhookSecret) {
        const normalizedSecret = String(webhookSecret ?? "").trim();
        if (!normalizedSecret) {
            return undefined;
        }
        if (!this.prismaClient) {
            return this.findTelegramConnectionByWebhookSecret(normalizedSecret);
        }
        const row = await this.prismaClient.telegramConnection.findFirst({
            where: { webhookSecret: normalizedSecret }
        });
        if (!row || row.status !== "active") {
            return undefined;
        }
        return toTelegramConnection(row);
    }
    listTelegramConnections() {
        this.assertSyncRuntimeAvailable();
        return clone(this.readState().telegramConnections);
    }
    async listTelegramConnectionsAsync() {
        if (!this.prismaClient) {
            return this.listTelegramConnections();
        }
        const rows = await this.prismaClient.telegramConnection.findMany({ orderBy: { createdAt: "asc" } });
        return rows.map(toTelegramConnection);
    }
    saveTelegramConnection(connection) {
        this.assertSyncRuntimeAvailable();
        const persisted = clone(connection);
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.telegramConnections.some((item) => item.channelConnectionId === persisted.channelConnectionId);
            return {
                ...current,
                telegramConnections: exists
                    ? current.telegramConnections.map((item) => item.channelConnectionId === persisted.channelConnectionId ? persisted : item)
                    : [...current.telegramConnections, persisted]
            };
        });
        return clone(persisted);
    }
    async saveTelegramConnectionAsync(connection) {
        const persisted = normalizeTelegramConnections([connection])[0];
        if (!this.prismaClient) {
            return this.saveTelegramConnection(persisted);
        }
        const row = await this.prismaClient.telegramConnection.upsert({
            create: toPrismaTelegramConnectionCreateInput(persisted),
            update: toPrismaTelegramConnectionUpdateInput(persisted),
            where: { channelConnectionId: persisted.channelConnectionId }
        });
        return toTelegramConnection(row);
    }
    assertSyncRuntimeAvailable() {
        if (this.prismaClient) {
            throw new Error("prisma_integration_async_required");
        }
    }
}
function emptyIntegrationWorkspace() {
    return {
        apiChangelog: [],
        apiEnvironmentKeys: [],
        channelDetails: [],
        securityAlerts: [],
        securityControls: [],
        webhookDeliveryLog: [],
        webhookEndpoints: []
    };
}
export function createEmptyIntegrationState() {
    return {
        apiKeyRotationAuditEvents: [],
        apiKeyRotationJobs: [],
        channelConnectionAuditEvents: [],
        channelConnectionEvents: [],
        channelConnections: [],
        providerConnectionCredentials: [],
        publicApiKeys: [],
        publicApiKeyRevealStates: [],
        publicDemoRequestAuditEvents: [],
        publicDemoRequestNotificationDescriptors: [],
        publicDemoRequests: [],
        securitySessions: [],
        sdkVisitorPresenceSessions: [],
        telegramConnections: [],
        webhookDeliveryJournal: [],
        webhookEndpointRecords: [],
        webhookReplayAuditEvents: [],
        webhookReplayJournal: [],
        workspace: emptyIntegrationWorkspace()
    };
}
function normalizeState(state) {
    return {
        apiKeyRotationAuditEvents: state.apiKeyRotationAuditEvents ?? [],
        apiKeyRotationJobs: state.apiKeyRotationJobs ?? [],
        channelConnectionAuditEvents: normalizeChannelConnectionAuditEvents(state.channelConnectionAuditEvents),
        channelConnectionEvents: normalizeChannelConnectionEvents(state.channelConnectionEvents),
        channelConnections: normalizeChannelConnections(state.channelConnections),
        providerConnectionCredentials: normalizeProviderConnectionCredentials(state.providerConnectionCredentials),
        publicApiKeys: normalizePublicApiKeys(state.publicApiKeys),
        publicApiKeyRevealStates: normalizePublicApiKeyRevealStates(state.publicApiKeyRevealStates),
        publicDemoRequestAuditEvents: normalizePublicDemoRequestAuditEvents(state.publicDemoRequestAuditEvents),
        publicDemoRequestNotificationDescriptors: normalizePublicDemoRequestNotificationDescriptors(state.publicDemoRequestNotificationDescriptors),
        publicDemoRequests: normalizePublicDemoRequests(state.publicDemoRequests),
        securitySessions: state.securitySessions ?? [],
        sdkVisitorPresenceSessions: (state.sdkVisitorPresenceSessions ?? []).map(normalizeSdkVisitorPresence),
        telegramConnections: normalizeTelegramConnections(state.telegramConnections),
        webhookDeliveryJournal: normalizeWebhookDeliveryJournal(state.webhookDeliveryJournal),
        webhookEndpointRecords: normalizeWebhookEndpointRecords(state.webhookEndpointRecords),
        webhookReplayAuditEvents: state.webhookReplayAuditEvents ?? [],
        webhookReplayJournal: state.webhookReplayJournal ?? [],
        workspace: state.workspace ?? emptyIntegrationWorkspace()
    };
}
function normalizeSdkVisitorPresence(value) {
    return {
        ...value,
        channelConnectionId: String(value.channelConnectionId ?? "").trim(),
        connected: Boolean(value.connected),
        pagePath: value.pagePath || null,
        pageUrl: value.pageUrl || null,
        referrer: value.referrer || null,
        sessionKeyHash: String(value.sessionKeyHash ?? "").trim(),
        subjectId: String(value.subjectId ?? "").trim(),
        tenantId: String(value.tenantId ?? "").trim()
    };
}
function toPrismaSdkVisitorPresence(value) {
    return { ...value, createdAt: new Date(value.createdAt), disconnectedAt: value.disconnectedAt ? new Date(value.disconnectedAt) : null,
        expiresAt: new Date(value.expiresAt), firstSeenAt: new Date(value.firstSeenAt), lastSeenAt: new Date(value.lastSeenAt),
        updatedAt: new Date(value.updatedAt) };
}
function fromPrismaSdkVisitorPresence(value) {
    return normalizeSdkVisitorPresence({ ...value, createdAt: value.createdAt.toISOString(),
        disconnectedAt: value.disconnectedAt?.toISOString() ?? null, expiresAt: value.expiresAt.toISOString(),
        firstSeenAt: value.firstSeenAt.toISOString(), lastSeenAt: value.lastSeenAt.toISOString(), updatedAt: value.updatedAt.toISOString() });
}
function normalizeWebhookEndpointRecords(records) {
    return (records ?? []).map((record) => ({
        channel: String(record.channel ?? "").trim() || "SDK",
        createdAt: record.createdAt,
        custom: Boolean(record.custom),
        deleted: Boolean(record.deleted),
        failureRate: String(record.failureRate ?? "0%"),
        id: String(record.id ?? "").trim(),
        lastDelivery: String(record.lastDelivery ?? "—"),
        name: String(record.name ?? "").trim(),
        retries: String(record.retries ?? "3 попытки / 30 сек"),
        signature: String(record.signature ?? "HMAC SHA-256"),
        status: String(record.status ?? "Активен"),
        updatedAt: record.updatedAt,
        url: String(record.url ?? "").trim()
    }));
}
function toWebhookEndpointRow(record) {
    return {
        channel: record.channel,
        createdAt: new Date(record.createdAt),
        custom: record.custom,
        deleted: record.deleted,
        failureRate: record.failureRate,
        id: record.id,
        lastDelivery: record.lastDelivery,
        name: record.name,
        retries: record.retries,
        signature: record.signature,
        status: record.status,
        updatedAt: new Date(record.updatedAt),
        url: record.url
    };
}
function toWebhookEndpointRecord(row) {
    return normalizeWebhookEndpointRecords([{
            channel: row.channel,
            createdAt: row.createdAt.toISOString(),
            custom: row.custom,
            deleted: row.deleted,
            failureRate: row.failureRate,
            id: row.id,
            lastDelivery: row.lastDelivery,
            name: row.name,
            retries: row.retries,
            signature: row.signature,
            status: row.status,
            updatedAt: row.updatedAt.toISOString(),
            url: row.url
        }])[0];
}
function normalizeTelegramConnections(connections) {
    return (connections ?? []).map((connection) => ({
        channelConnectionId: String(connection.channelConnectionId ?? "").trim(),
        botId: connection.botId ?? null,
        botToken: String(connection.botToken ?? ""),
        botUsername: connection.botUsername ?? null,
        pollingOffset: Number.isInteger(connection.pollingOffset) && Number(connection.pollingOffset) >= 0 ? Number(connection.pollingOffset) : 0,
        createdAt: connection.createdAt,
        status: connection.status === "disabled" ? "disabled" : "active",
        tenantId: connection.tenantId,
        tokenPreview: connection.tokenPreview,
        updatedAt: connection.updatedAt,
        webhookSecret: connection.webhookSecret
    }));
}
function normalizeChannelConnections(connections) {
    return (connections ?? []).map(normalizeChannelConnection);
}
function normalizeProviderConnectionCredentials(credentials) {
    return (credentials ?? []).map(normalizeProviderConnectionCredential);
}
function normalizeProviderConnectionCredential(credential) {
    const now = new Date().toISOString();
    const nullable = (value) => {
        const normalized = String(value ?? "").trim();
        return normalized || null;
    };
    return {
        accessTokenEncrypted: String(credential.accessTokenEncrypted ?? "").trim(),
        apiVersion: nullable(credential.apiVersion),
        channelConnectionId: String(credential.channelConnectionId ?? "").trim(),
        confirmationCodeEncrypted: nullable(credential.confirmationCodeEncrypted),
        createdAt: credential.createdAt ?? now,
        externalAccountId: String(credential.externalAccountId ?? "").trim(),
        keyVersion: String(credential.keyVersion ?? "").trim(),
        lastError: nullable(credential.lastError),
        lastWebhookAt: credential.lastWebhookAt ?? null,
        provider: String(credential.provider ?? "").trim().toLowerCase(),
        status: normalizeChannelStatus(credential.status),
        tenantId: String(credential.tenantId ?? "").trim(),
        updatedAt: credential.updatedAt ?? credential.createdAt ?? now,
        webhookSecretEncrypted: String(credential.webhookSecretEncrypted ?? "").trim()
    };
}
function normalizeChannelConnection(connection) {
    const now = new Date().toISOString();
    return {
        chatLimit: normalizePositiveInteger(connection.chatLimit, 8),
        credentialsMasked: Boolean(connection.credentialsMasked),
        createdAt: connection.createdAt ?? connection.lastSyncAt ?? now,
        environment: normalizeChannelEnvironment(connection.environment),
        health: normalizePositiveInteger(connection.health, 100),
        id: String(connection.id ?? "").trim(),
        lastSyncAt: connection.lastSyncAt ?? connection.updatedAt ?? now,
        name: String(connection.name ?? "").trim(),
        rawExternalId: String(connection.rawExternalId ?? "").trim(),
        routingQueueId: String(connection.routingQueueId ?? "").trim(),
        status: normalizeChannelStatus(connection.status),
        tenantId: String(connection.tenantId ?? "").trim(),
        traffic: String(connection.traffic ?? "0 events"),
        type: String(connection.type ?? "").trim().toLowerCase(),
        updatedAt: connection.updatedAt ?? connection.lastSyncAt ?? now,
        webhookUrl: String(connection.webhookUrl ?? "").trim()
    };
}
function normalizeChannelConnectionEvents(events) {
    return (events ?? []).map(normalizeChannelConnectionEvent);
}
function normalizeChannelConnectionEvent(event) {
    return {
        action: String(event.action ?? "").trim(),
        at: event.at ?? new Date().toISOString(),
        connectionId: String(event.connectionId ?? "").trim(),
        id: String(event.id ?? "").trim(),
        message: String(event.message ?? "").trim(),
        severity: normalizeEventSeverity(event.severity),
        tenantId: String(event.tenantId ?? "").trim()
    };
}
function normalizeChannelConnectionAuditEvents(events) {
    return (events ?? []).map(normalizeChannelConnectionAuditEvent);
}
function normalizeChannelConnectionAuditEvent(event) {
    return {
        action: String(event.action ?? "").trim(),
        at: event.at ?? new Date().toISOString(),
        connectionId: String(event.connectionId ?? "").trim(),
        id: String(event.id ?? "").trim(),
        immutable: true,
        reason: String(event.reason ?? "").trim(),
        result: String(event.result ?? "ok").trim() || "ok",
        tenantId: String(event.tenantId ?? "").trim(),
        type: String(event.type ?? "").trim().toLowerCase()
    };
}
function normalizeChannelEnvironment(environment) {
    const value = String(environment ?? "").trim().toLowerCase();
    return ["production", "sandbox", "stage"].includes(value) ? value : "production";
}
function normalizeChannelStatus(status) {
    const value = String(status ?? "").trim().toLowerCase();
    return ["active", "disabled", "error", "paused"].includes(value) ? value : "active";
}
function normalizeEventSeverity(severity) {
    const value = String(severity ?? "").trim().toLowerCase();
    return ["error", "info", "warn"].includes(value) ? value : "info";
}
function normalizePositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
function normalizeWebhookDeliveryJournal(entries) {
    return (entries ?? []).map(normalizeWebhookDeliveryJournalEntry);
}
function normalizeWebhookDeliveryJournalEntry(entry) {
    return {
        attempts: entry.attempts,
        createdAt: entry.createdAt,
        ...(entry.deadLetteredAt ? { deadLetteredAt: entry.deadLetteredAt } : {}),
        deliveryId: entry.deliveryId,
        endpointId: entry.endpointId,
        eventType: entry.eventType,
        idempotencyKey: entry.idempotencyKey,
        ...(entry.lastAttemptAt ? { lastAttemptAt: entry.lastAttemptAt } : {}),
        ...(entry.lastError ? { lastError: normalizeWebhookDeliveryJournalError(entry.lastError) } : {}),
        ...(entry.lockedAt ? { lockedAt: entry.lockedAt } : {}),
        ...(entry.nextAttemptAt ? { nextAttemptAt: entry.nextAttemptAt } : {}),
        payloadRef: entry.payloadRef,
        queue: "webhook-delivery",
        status: entry.status,
        targetUrl: entry.targetUrl,
        tenantId: entry.tenantId,
        traceId: entry.traceId
    };
}
function isClaimableWebhookDeliveryJournalEntry(entry, nowMs, staleBeforeMs) {
    if (entry.status === "queued") {
        return true;
    }
    if (entry.status === "retry_scheduled") {
        return !entry.nextAttemptAt || Date.parse(entry.nextAttemptAt) <= nowMs;
    }
    if (entry.status === "publishing" && entry.lockedAt) {
        return Date.parse(entry.lockedAt) <= staleBeforeMs;
    }
    return false;
}
function normalizeWebhookDeliveryJournalError(error) {
    return {
        code: error.code,
        message: redactWebhookDeliveryErrorMessage(error.message),
        ...(typeof error.statusCode === "number" ? { statusCode: error.statusCode } : {})
    };
}
function redactWebhookDeliveryErrorMessage(message) {
    return redactSensitiveText(message)
        .replace(/\bAuthorization:\s*Bearer\s+\[REDACTED:api_key\]/gi, "[REDACTED:api_key]")
        .replace(/"authorization"\s*:\s*"Bearer \[REDACTED:api_key\]"/gi, "[REDACTED:api_key]")
        .replace(/"providerToken"\s*:\s*"\[REDACTED:provider_token\]"/gi, "[REDACTED:provider_token]")
        .replace(/"x-provider-signature"\s*:\s*"\[REDACTED:webhook_signature\]"/gi, "[REDACTED:webhook_signature]")
        .replace(/"webhookSecret"\s*:\s*"[^"]*"/gi, "[REDACTED:secret]")
        .replace(/\bsignatureSecret=(?!\[)[^"',.}\]\s]+/gi, "[REDACTED:secret]")
        .replace(/\bwebhookSecret=(?!\[)[^"',.}\]\s]+/gi, "[REDACTED:secret]")
        .replace(/\[REDACTED:([a-z_]+)\]\]/g, "[REDACTED:$1]");
}
function normalizePublicApiKeys(keys) {
    return (keys ?? []).map((key) => ({
        ...(key.channelConnectionId ? { channelConnectionId: key.channelConnectionId } : {}),
        createdAt: key.createdAt,
        environment: key.environment,
        keyId: key.keyId,
        keyPreview: key.keyPreview,
        name: key.name,
        owner: key.owner,
        scopes: [...key.scopes],
        secretHash: key.secretHash,
        status: key.status,
        tenantId: key.tenantId
    }));
}
function normalizePublicApiKeyRevealStates(states) {
    return (states ?? []).map((state) => ({
        consumedAt: state.consumedAt ?? null,
        createdAt: state.createdAt,
        keyId: state.keyId,
        keyPreview: state.keyPreview,
        status: state.status === "consumed" ? "consumed" : "available"
    }));
}
function normalizePublicDemoRequests(requests) {
    return (requests ?? []).map(normalizePublicDemoRequest);
}
function normalizePublicDemoRequest(request) {
    const now = new Date().toISOString();
    return {
        company: normalizeLimitedString(request.company, 160),
        consent: true,
        createdAt: request.createdAt ?? now,
        email: normalizeLimitedString(request.email, 254).toLowerCase(),
        id: normalizeLimitedString(request.id, 96),
        idempotencyKey: nullableLimitedString(request.idempotencyKey, 160),
        ipHash: nullableLimitedString(request.ipHash, 96),
        message: normalizeLimitedString(redactSensitiveText(request.message ?? ""), 1200),
        name: normalizeLimitedString(request.name, 120),
        planInterest: nullableLimitedString(request.planInterest, 80),
        requestFingerprint: normalizeLimitedString(request.requestFingerprint, 96),
        source: normalizeLimitedString(request.source, 80) || "landing",
        status: "queued",
        updatedAt: request.updatedAt ?? request.createdAt ?? now,
        userAgentHash: nullableLimitedString(request.userAgentHash, 96)
    };
}
function normalizePublicDemoRequestAuditEvents(events) {
    return (events ?? []).map(normalizePublicDemoRequestAuditEvent);
}
function normalizePublicDemoRequestAuditEvent(event) {
    const action = [
        "public_demo_request.created",
        "public_demo_request.duplicate",
        "public_demo_request.rate_limited"
    ].includes(event.action) ? event.action : "public_demo_request.created";
    const result = ["ok", "duplicate", "rate_limited"].includes(event.result) ? event.result : "ok";
    return {
        action,
        at: event.at ?? new Date().toISOString(),
        id: normalizeLimitedString(event.id, 96),
        immutable: true,
        leadId: nullableLimitedString(event.leadId, 96),
        requestFingerprint: normalizeLimitedString(event.requestFingerprint, 96),
        result,
        source: normalizeLimitedString(event.source, 80) || "landing"
    };
}
function normalizePublicDemoRequestNotificationDescriptors(descriptors) {
    return (descriptors ?? []).map(normalizePublicDemoRequestNotificationDescriptor);
}
function normalizePublicDemoRequestNotificationDescriptor(descriptor) {
    return {
        createdAt: descriptor.createdAt ?? new Date().toISOString(),
        id: normalizeLimitedString(descriptor.id, 96),
        leadId: normalizeLimitedString(descriptor.leadId, 96),
        payload: {
            company: normalizeLimitedString(descriptor.payload?.company, 160),
            ...(descriptor.payload?.delivery
                ? { delivery: normalizePublicDemoRequestNotificationDeliveryState(descriptor.payload.delivery) }
                : {}),
            email: normalizeLimitedString(descriptor.payload?.email, 254).toLowerCase(),
            messagePreview: normalizeLimitedString(redactSensitiveText(descriptor.payload?.messagePreview ?? ""), 240),
            name: normalizeLimitedString(descriptor.payload?.name, 120),
            planInterest: nullableLimitedString(descriptor.payload?.planInterest, 80),
            source: normalizeLimitedString(descriptor.payload?.source, 80) || "landing"
        },
        queue: "lead-notification",
        status: normalizePublicDemoRequestNotificationStatus(descriptor.status),
        type: "public.demo_request.notification.requested"
    };
}
function normalizePublicDemoRequestNotificationStatus(value) {
    return value === "delivered" || value === "failed" || value === "queued" ? value : "queued";
}
function normalizePublicDemoRequestNotificationDeliveryState(delivery) {
    const attempts = Number.isInteger(delivery.attempts) && delivery.attempts > 0 ? delivery.attempts : 1;
    const normalized = { attempts };
    if (delivery.deliveredAt) {
        normalized.deliveredAt = normalizeLimitedString(delivery.deliveredAt, 40);
    }
    if (delivery.failedAt) {
        normalized.failedAt = normalizeLimitedString(delivery.failedAt, 40);
    }
    if (delivery.providerMessageId) {
        normalized.providerMessageId = normalizeLimitedString(delivery.providerMessageId, 160);
    }
    if (delivery.lastError) {
        normalized.lastError = {
            code: "public_demo_request_notification_delivery_failed",
            message: redactPublicDemoNotificationDeliveryMessage(delivery.lastError.message)
        };
    }
    return normalized;
}
function redactPublicDemoNotificationDeliveryMessage(value) {
    return normalizeLimitedString(redactSensitiveText(String(value ?? ""))
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED:email]")
        .replace(/\b[A-Za-z0-9._-]*(?:secret|token)[A-Za-z0-9._-]*\b/gi, "[REDACTED:secret]"), 300);
}
function latestPublicDemoRequestNotificationDescriptor(descriptors) {
    const [latest] = [...descriptors]
        .sort((left, right) => compareTimestampStrings(publicDemoRequestNotificationTimestamp(right), publicDemoRequestNotificationTimestamp(left)));
    return latest ? clone(latest) : null;
}
function publicDemoRequestNotificationTimestamp(descriptor) {
    return descriptor.payload.delivery?.failedAt
        ?? descriptor.payload.delivery?.deliveredAt
        ?? descriptor.createdAt;
}
function compareTimestampStrings(leftTimestamp, rightTimestamp) {
    const leftTime = Date.parse(leftTimestamp);
    const rightTime = Date.parse(rightTimestamp);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
    }
    return leftTimestamp.localeCompare(rightTimestamp);
}
function normalizeLimitedString(value, maxLength) {
    return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}
function nullableLimitedString(value, maxLength) {
    const normalized = normalizeLimitedString(value, maxLength);
    return normalized || null;
}
function assertCompletePrismaIntegrationClient(client) {
    if (!client.integrationApiKeyRotationJob?.findMany || !client.integrationApiKeyRotationJob.upsert) {
        throw new Error("prisma_integration_api_key_rotation_job_delegate_required");
    }
    if (!client.publicApiKey?.create || !client.publicApiKey.findMany || !client.publicApiKey.findUnique || !client.publicApiKey.updateMany || !client.publicApiKey.upsert) {
        throw new Error("prisma_integration_public_api_key_delegate_required");
    }
    if (!client.channelConnection?.delete || !client.conversation?.updateMany) {
        throw new Error("prisma_integration_channel_connection_delete_delegate_required");
    }
    if (!client.publicApiKeyRevealState?.findMany
        || !client.publicApiKeyRevealState.findUnique
        || !client.publicApiKeyRevealState.update
        || !client.publicApiKeyRevealState.updateMany
        || !client.publicApiKeyRevealState.upsert) {
        throw new Error("prisma_integration_public_api_key_reveal_state_delegate_required");
    }
    if (!client.publicApiKeyRotationAuditEvent?.create || !client.publicApiKeyRotationAuditEvent.findMany) {
        throw new Error("prisma_integration_public_api_key_rotation_audit_delegate_required");
    }
    if (!client.publicDemoRequest?.findFirst || !client.publicDemoRequest.findMany || !client.publicDemoRequest.upsert) {
        throw new Error("prisma_integration_public_demo_request_delegate_required");
    }
    if (!client.publicDemoRequestAuditEvent?.create || !client.publicDemoRequestAuditEvent.findMany) {
        throw new Error("prisma_integration_public_demo_request_audit_delegate_required");
    }
    if (!client.publicDemoRequestNotificationDescriptor?.count
        || !client.publicDemoRequestNotificationDescriptor.findMany
        || !client.publicDemoRequestNotificationDescriptor.upsert) {
        throw new Error("prisma_integration_public_demo_request_notification_delegate_required");
    }
    if (!client.webhookDeliveryJournalEntry?.findMany
        || !client.webhookDeliveryJournalEntry.findUnique
        || !client.webhookDeliveryJournalEntry.update
        || !client.webhookDeliveryJournalEntry.updateMany
        || !client.webhookDeliveryJournalEntry.upsert) {
        throw new Error("prisma_integration_webhook_delivery_journal_delegate_required");
    }
    if (!client.webhookReplayJournalEntry?.findMany || !client.webhookReplayJournalEntry.findUnique || !client.webhookReplayJournalEntry.upsert) {
        throw new Error("prisma_integration_webhook_replay_journal_delegate_required");
    }
    if (!client.webhookReplayAuditEvent?.create || !client.webhookReplayAuditEvent.findMany) {
        throw new Error("prisma_integration_webhook_replay_audit_delegate_required");
    }
    if (!client.securitySession?.findMany || !client.securitySession.upsert) {
        throw new Error("prisma_integration_security_session_delegate_required");
    }
    if (!client.channelConnection?.findMany || !client.channelConnection.findUnique || !client.channelConnection.upsert) {
        throw new Error("prisma_integration_channel_connection_delegate_required");
    }
    if (!client.channelConnectionEvent?.create || !client.channelConnectionEvent.findMany) {
        throw new Error("prisma_integration_channel_connection_event_delegate_required");
    }
    if (!client.channelConnectionAuditEvent?.create || !client.channelConnectionAuditEvent.findMany) {
        throw new Error("prisma_integration_channel_connection_audit_delegate_required");
    }
    if (!client.providerConnectionCredential?.findMany
        || !client.providerConnectionCredential.findUnique
        || !client.providerConnectionCredential.upsert) {
        throw new Error("prisma_integration_provider_connection_credential_delegate_required");
    }
    if (!client.telegramConnection?.findFirst
        || !client.telegramConnection.findMany
        || !client.telegramConnection.findUnique
        || !client.telegramConnection.upsert) {
        throw new Error("prisma_integration_telegram_connection_delegate_required");
    }
}
function toPrismaPublicApiKeyCreateInput(key) {
    return {
        ...(key.channelConnectionId ? { channelConnectionId: key.channelConnectionId } : {}),
        createdAt: new Date(key.createdAt),
        environment: key.environment,
        keyId: key.keyId,
        keyPreview: key.keyPreview,
        name: key.name,
        owner: key.owner,
        scopes: [...key.scopes],
        secretHash: key.secretHash,
        status: key.status,
        tenantId: key.tenantId,
        updatedAt: new Date(key.createdAt)
    };
}
function toPrismaPublicApiKeyUpdateInput(key) {
    return {
        ...(key.channelConnectionId ? { channelConnectionId: key.channelConnectionId } : {}),
        environment: key.environment,
        keyPreview: key.keyPreview,
        name: key.name,
        owner: key.owner,
        scopes: [...key.scopes],
        secretHash: key.secretHash,
        status: key.status,
        tenantId: key.tenantId,
        updatedAt: key.updatedAt
    };
}
function toPrismaPublicApiKeyReferenceUpdateInput(_key) {
    return {};
}
function toPublicApiKeyStoredRecord(row) {
    return {
        ...(row.channelConnectionId ? { channelConnectionId: row.channelConnectionId } : {}),
        createdAt: row.createdAt.toISOString(),
        environment: row.environment,
        keyId: row.keyId,
        keyPreview: row.keyPreview,
        name: row.name,
        owner: row.owner,
        scopes: [...row.scopes],
        secretHash: row.secretHash,
        status: row.status,
        tenantId: row.tenantId
    };
}
function toPublicApiKeyRecord(row) {
    return {
        ...(row.channelConnectionId ? { channelConnectionId: row.channelConnectionId } : {}),
        environment: row.environment,
        keyId: row.keyId,
        scopes: [...row.scopes],
        secretHash: row.secretHash,
        status: row.status,
        tenantId: row.tenantId
    };
}
function toPrismaPublicApiKeyRevealStateCreateInput(state) {
    return {
        consumedAt: state.consumedAt ? new Date(state.consumedAt) : null,
        createdAt: new Date(state.createdAt),
        keyId: state.keyId,
        keyPreview: state.keyPreview,
        status: state.status
    };
}
function toPrismaPublicApiKeyRevealStateUpdateInput(_state) {
    return {};
}
function toPrismaApiKeyRotationAuditEventCreateInput(event) {
    return {
        action: event.action,
        at: new Date(event.at),
        auditId: event.auditId,
        environment: event.environment,
        immutable: true,
        keyId: event.keyId,
        keyPreview: event.keyPreview,
        rotationId: event.rotationId,
        status: event.status
    };
}
function toApiKeyRotationAuditEvent(row) {
    return {
        action: row.action,
        at: row.at.toISOString(),
        auditId: row.auditId,
        environment: row.environment,
        immutable: true,
        keyId: row.keyId,
        keyPreview: row.keyPreview,
        rotationId: row.rotationId,
        status: row.status
    };
}
function toPublicApiKeyRevealState(row) {
    return {
        consumedAt: row.consumedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        keyId: row.keyId,
        keyPreview: row.keyPreview,
        status: row.status
    };
}
function toPrismaApiKeyRotationJobCreateInput(job) {
    return {
        auditId: job.auditId,
        environment: job.environment,
        keyId: job.keyId,
        rawKeyShownOnce: false,
        requires2fa: true,
        rotationId: job.rotationId,
        status: job.status
    };
}
function toPrismaApiKeyRotationJobUpdateInput(job) {
    return {
        auditId: job.auditId,
        environment: job.environment,
        keyId: job.keyId,
        rawKeyShownOnce: false,
        requires2fa: true,
        status: job.status,
        updatedAt: new Date()
    };
}
function toApiKeyRotationJob(row) {
    return {
        auditId: row.auditId,
        environment: row.environment,
        keyId: row.keyId,
        rawKeyShownOnce: false,
        requires2fa: true,
        rotationId: row.rotationId,
        status: row.status
    };
}
function toPrismaPublicDemoRequestCreateInput(request) {
    return {
        company: request.company,
        consent: true,
        createdAt: new Date(request.createdAt),
        email: request.email,
        id: request.id,
        idempotencyKey: request.idempotencyKey,
        ipHash: request.ipHash,
        message: request.message,
        name: request.name,
        planInterest: request.planInterest,
        requestFingerprint: request.requestFingerprint,
        source: request.source,
        status: "queued",
        updatedAt: new Date(request.updatedAt),
        userAgentHash: request.userAgentHash
    };
}
function toPrismaPublicDemoRequestUpdateInput(request) {
    const create = toPrismaPublicDemoRequestCreateInput(request);
    return {
        company: create.company,
        consent: true,
        email: create.email,
        idempotencyKey: create.idempotencyKey,
        ipHash: create.ipHash,
        message: create.message,
        name: create.name,
        planInterest: create.planInterest,
        requestFingerprint: create.requestFingerprint,
        source: create.source,
        status: "queued",
        updatedAt: create.updatedAt,
        userAgentHash: create.userAgentHash
    };
}
function toPublicDemoRequest(row) {
    return normalizePublicDemoRequest({
        company: row.company,
        consent: true,
        createdAt: row.createdAt.toISOString(),
        email: row.email,
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        ipHash: row.ipHash,
        message: row.message,
        name: row.name,
        planInterest: row.planInterest,
        requestFingerprint: row.requestFingerprint,
        source: row.source,
        status: "queued",
        updatedAt: row.updatedAt.toISOString(),
        userAgentHash: row.userAgentHash
    });
}
function toPrismaPublicDemoRequestAuditEventCreateInput(event) {
    return {
        action: event.action,
        at: new Date(event.at),
        id: event.id,
        immutable: true,
        leadId: event.leadId,
        requestFingerprint: event.requestFingerprint,
        result: event.result,
        source: event.source
    };
}
function toPublicDemoRequestAuditEvent(row) {
    return {
        action: row.action,
        at: row.at.toISOString(),
        id: row.id,
        immutable: true,
        leadId: row.leadId,
        requestFingerprint: row.requestFingerprint,
        result: row.result,
        source: row.source
    };
}
function toPrismaPublicDemoRequestNotificationDescriptorCreateInput(descriptor) {
    return {
        createdAt: new Date(descriptor.createdAt),
        id: descriptor.id,
        leadId: descriptor.leadId,
        payload: clone(descriptor.payload),
        queue: "lead-notification",
        status: descriptor.status,
        type: "public.demo_request.notification.requested",
        updatedAt: new Date(descriptor.createdAt)
    };
}
function toPrismaPublicDemoRequestNotificationDescriptorUpdateInput(descriptor) {
    return {
        leadId: descriptor.leadId,
        payload: clone(descriptor.payload),
        queue: "lead-notification",
        status: descriptor.status,
        type: "public.demo_request.notification.requested",
        updatedAt: new Date()
    };
}
function toPublicDemoRequestNotificationDescriptor(row) {
    return normalizePublicDemoRequestNotificationDescriptor({
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        leadId: row.leadId,
        payload: clone(row.payload),
        queue: "lead-notification",
        status: row.status,
        type: "public.demo_request.notification.requested"
    });
}
function toPrismaWebhookReplayJournalCreateInput(entry) {
    return {
        auditId: entry.auditId,
        deliveryId: entry.deliveryId,
        idempotencyKey: entry.idempotencyKey,
        originalTraceId: entry.originalTraceId,
        replayId: entry.replayId,
        signatureVerified: entry.signatureVerified,
        status: entry.status,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}
function toWebhookReplayJournalEntry(row) {
    return {
        auditId: row.auditId,
        deliveryId: row.deliveryId,
        idempotencyKey: row.idempotencyKey,
        originalTraceId: row.originalTraceId,
        replayId: row.replayId,
        signatureVerified: row.signatureVerified,
        status: row.status
    };
}
function toPrismaWebhookReplayAuditEventCreateInput(event) {
    return {
        action: event.action,
        at: new Date(event.at),
        attempts: event.attempts,
        auditId: event.auditId,
        deliveryId: event.deliveryId,
        deliveryStatus: event.deliveryStatus,
        id: event.id,
        idempotencyKey: event.idempotencyKey,
        immutable: true,
        originalTraceId: event.originalTraceId,
        replayId: event.replayId,
        transition: event.transition
    };
}
function toWebhookReplayAuditEvent(row) {
    return {
        action: row.action,
        at: row.at.toISOString(),
        attempts: row.attempts,
        auditId: row.auditId,
        deliveryId: row.deliveryId,
        deliveryStatus: row.deliveryStatus,
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        immutable: true,
        originalTraceId: row.originalTraceId,
        replayId: row.replayId,
        transition: row.transition
    };
}
function toPrismaWebhookDeliveryJournalCreateInput(entry) {
    return {
        attempts: entry.attempts,
        createdAt: new Date(entry.createdAt),
        deadLetteredAt: entry.deadLetteredAt ? new Date(entry.deadLetteredAt) : null,
        deliveryId: entry.deliveryId,
        endpointId: entry.endpointId,
        eventType: entry.eventType,
        idempotencyKey: entry.idempotencyKey,
        lastAttemptAt: entry.lastAttemptAt ? new Date(entry.lastAttemptAt) : null,
        lastError: entry.lastError ? normalizeWebhookDeliveryJournalError(entry.lastError) : null,
        lockedAt: entry.lockedAt ? new Date(entry.lockedAt) : null,
        nextAttemptAt: entry.nextAttemptAt ? new Date(entry.nextAttemptAt) : null,
        payloadRef: entry.payloadRef,
        queue: "webhook-delivery",
        status: entry.status,
        targetUrl: entry.targetUrl,
        tenantId: entry.tenantId,
        traceId: entry.traceId,
        updatedAt: new Date(entry.createdAt)
    };
}
function toWebhookDeliveryJournalEntry(row) {
    return normalizeWebhookDeliveryJournalEntry({
        attempts: row.attempts,
        createdAt: row.createdAt.toISOString(),
        deadLetteredAt: row.deadLetteredAt?.toISOString(),
        deliveryId: row.deliveryId,
        endpointId: row.endpointId,
        eventType: row.eventType,
        idempotencyKey: row.idempotencyKey,
        lastAttemptAt: row.lastAttemptAt?.toISOString(),
        lastError: row.lastError ? normalizeWebhookDeliveryJournalError(row.lastError) : undefined,
        lockedAt: row.lockedAt?.toISOString(),
        nextAttemptAt: row.nextAttemptAt?.toISOString(),
        payloadRef: row.payloadRef,
        queue: "webhook-delivery",
        status: row.status,
        targetUrl: row.targetUrl,
        tenantId: row.tenantId,
        traceId: row.traceId
    });
}
function toPrismaSecuritySessionCreateInput(session) {
    return {
        device: session.device,
        id: session.id,
        ip: session.ip,
        lastSeen: session.lastSeen,
        role: session.role,
        status: session.status,
        user: session.user,
        updatedAt: new Date()
    };
}
function toPrismaSecuritySessionUpdateInput(session) {
    return {
        device: session.device,
        ip: session.ip,
        lastSeen: session.lastSeen,
        role: session.role,
        status: session.status,
        user: session.user,
        updatedAt: new Date()
    };
}
function toSecuritySession(row) {
    return {
        device: row.device,
        id: row.id,
        ip: row.ip,
        lastSeen: row.lastSeen,
        role: row.role,
        status: row.status,
        user: row.user
    };
}
function toPrismaChannelConnectionCreateInput(connection) {
    return {
        chatLimit: connection.chatLimit,
        createdAt: new Date(connection.createdAt),
        credentialsMasked: connection.credentialsMasked,
        environment: connection.environment,
        health: connection.health,
        id: connection.id,
        lastSyncAt: new Date(connection.lastSyncAt),
        name: connection.name,
        rawExternalId: connection.rawExternalId,
        routingQueueId: connection.routingQueueId,
        status: connection.status,
        tenantId: connection.tenantId,
        traffic: connection.traffic,
        type: connection.type,
        updatedAt: new Date(connection.updatedAt),
        webhookUrl: connection.webhookUrl
    };
}
function toPrismaProviderConnectionCredentialCreateInput(credential) {
    return {
        accessTokenEncrypted: credential.accessTokenEncrypted,
        apiVersion: credential.apiVersion,
        channelConnectionId: credential.channelConnectionId,
        confirmationCodeEncrypted: credential.confirmationCodeEncrypted,
        createdAt: new Date(credential.createdAt),
        externalAccountId: credential.externalAccountId,
        keyVersion: credential.keyVersion,
        lastError: credential.lastError,
        lastWebhookAt: credential.lastWebhookAt ? new Date(credential.lastWebhookAt) : null,
        provider: credential.provider,
        status: credential.status,
        tenantId: credential.tenantId,
        updatedAt: new Date(credential.updatedAt),
        webhookSecretEncrypted: credential.webhookSecretEncrypted
    };
}
function toPrismaProviderConnectionCredentialUpdateInput(credential) {
    const { channelConnectionId: _channelConnectionId, createdAt: _createdAt, ...update } = toPrismaProviderConnectionCredentialCreateInput(credential);
    return update;
}
function toProviderConnectionCredential(row) {
    return normalizeProviderConnectionCredential({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastWebhookAt: row.lastWebhookAt?.toISOString() ?? null,
        updatedAt: row.updatedAt.toISOString()
    });
}
function toPrismaChannelConnectionUpdateInput(connection) {
    const create = toPrismaChannelConnectionCreateInput(connection);
    return {
        chatLimit: create.chatLimit,
        credentialsMasked: create.credentialsMasked,
        environment: create.environment,
        health: create.health,
        lastSyncAt: create.lastSyncAt,
        name: create.name,
        rawExternalId: create.rawExternalId,
        routingQueueId: create.routingQueueId,
        status: create.status,
        tenantId: create.tenantId,
        traffic: create.traffic,
        type: create.type,
        updatedAt: create.updatedAt,
        webhookUrl: create.webhookUrl
    };
}
function toChannelConnection(row) {
    return normalizeChannelConnection({
        chatLimit: row.chatLimit,
        createdAt: row.createdAt.toISOString(),
        credentialsMasked: row.credentialsMasked,
        environment: row.environment,
        health: row.health,
        id: row.id,
        lastSyncAt: row.lastSyncAt.toISOString(),
        name: row.name,
        rawExternalId: row.rawExternalId,
        routingQueueId: row.routingQueueId,
        status: row.status,
        tenantId: row.tenantId,
        traffic: row.traffic,
        type: row.type,
        updatedAt: row.updatedAt.toISOString(),
        webhookUrl: row.webhookUrl
    });
}
function toPrismaChannelConnectionEventCreateInput(event) {
    return {
        action: event.action,
        at: new Date(event.at),
        connectionId: event.connectionId,
        id: event.id,
        message: event.message,
        severity: event.severity,
        tenantId: event.tenantId
    };
}
function toChannelConnectionEvent(row) {
    return normalizeChannelConnectionEvent({
        action: row.action,
        at: row.at.toISOString(),
        connectionId: row.connectionId,
        id: row.id,
        message: row.message,
        severity: row.severity,
        tenantId: row.tenantId
    });
}
function toPrismaChannelConnectionAuditEventCreateInput(event) {
    return {
        action: event.action,
        at: new Date(event.at),
        connectionId: event.connectionId,
        id: event.id,
        immutable: true,
        reason: event.reason,
        result: event.result,
        tenantId: event.tenantId,
        type: event.type
    };
}
function toChannelConnectionAuditEvent(row) {
    return normalizeChannelConnectionAuditEvent({
        action: row.action,
        at: row.at.toISOString(),
        connectionId: row.connectionId,
        id: row.id,
        immutable: true,
        reason: row.reason,
        result: row.result,
        tenantId: row.tenantId,
        type: row.type
    });
}
function toPrismaTelegramConnectionCreateInput(connection) {
    return {
        channelConnectionId: connection.channelConnectionId,
        botId: connection.botId,
        botToken: connection.botToken,
        botUsername: connection.botUsername,
        pollingOffset: connection.pollingOffset ?? 0,
        createdAt: new Date(connection.createdAt),
        status: connection.status,
        tenantId: connection.tenantId,
        tokenPreview: connection.tokenPreview,
        updatedAt: new Date(connection.updatedAt),
        webhookSecret: connection.webhookSecret
    };
}
function toPrismaTelegramConnectionUpdateInput(connection) {
    return {
        botId: connection.botId,
        botToken: connection.botToken,
        botUsername: connection.botUsername,
        pollingOffset: connection.pollingOffset ?? 0,
        status: connection.status,
        tokenPreview: connection.tokenPreview,
        updatedAt: new Date(connection.updatedAt),
        webhookSecret: connection.webhookSecret
    };
}
function toTelegramConnection(row) {
    return normalizeTelegramConnections([{
            channelConnectionId: row.channelConnectionId,
            botId: row.botId,
            botToken: row.botToken,
            botUsername: row.botUsername,
            pollingOffset: row.pollingOffset,
            createdAt: row.createdAt.toISOString(),
            status: row.status,
            tenantId: row.tenantId,
            tokenPreview: row.tokenPreview,
            updatedAt: row.updatedAt.toISOString(),
            webhookSecret: row.webhookSecret
        }])[0];
}
function maskPublicApiKeySecret(rawSecret) {
    const trimmed = rawSecret.trim();
    const prefix = trimmed.startsWith("sk_test_") ? "sk_test" : trimmed.startsWith("sk_live_") ? "sk_live" : "key";
    const suffix = trimmed.length > 4 ? trimmed.slice(-4) : "****";
    return `${prefix}_****_${suffix}`;
}
function clone(value) {
    if (value === undefined) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=integration.repository.js.map