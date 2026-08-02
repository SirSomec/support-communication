import { InMemoryStore, createPrismaClient } from "@support-communication/database";
let defaultRepository = null;
export class AiConnectionRepository {
    store;
    prismaClient;
    constructor(store, prismaClient) {
        this.store = store;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (!defaultRepository) {
            // Prisma-only рантайм (план 2026-07-15): дефолтный репозиторий всегда
            // персистится в Postgres; json-ветка выпилена, файловых сторов больше нет.
            defaultRepository = AiConnectionRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) });
        }
        return defaultRepository;
    }
    static clearDefault() { defaultRepository = null; }
    static inMemory(seed = { connections: [] }) {
        return new AiConnectionRepository(new InMemoryStore(normalizeState(seed)));
    }
    static prisma({ client }) {
        return new AiConnectionRepository(new InMemoryStore({ connections: [] }), client);
    }
    static useDefault(repository) { defaultRepository = repository; }
    list(tenantId) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.aiConnection.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId } }))
                .then((rows) => rows.map(toRecord));
        }
        return clone(this.store.read().connections.filter((connection) => connection.tenantId === tenantId));
    }
    find(tenantId, id) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.aiConnection.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId } }))
                .then((rows) => {
                const row = rows.find((item) => item.id === id);
                return row ? toRecord(row) : undefined;
            });
        }
        const connection = this.store.read().connections.find((item) => item.tenantId === tenantId && item.id === id);
        return connection ? clone(connection) : undefined;
    }
    save(record) {
        const normalized = normalizeRecord(record);
        if (this.prismaClient) {
            const create = toCreateInput(normalized);
            const { createdAt: _createdAt, id: _id, tenantId: _tenantId, ...update } = create;
            return Promise.resolve(this.prismaClient.aiConnection.upsert({
                create,
                update,
                where: { tenantId_id: { id: normalized.id, tenantId: normalized.tenantId } }
            })).then(toRecord);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.connections.some((item) => item.tenantId === normalized.tenantId && item.id === normalized.id);
            return {
                connections: exists
                    ? current.connections.map((item) => item.tenantId === normalized.tenantId && item.id === normalized.id ? normalized : item)
                    : [...current.connections, normalized]
            };
        });
        return clone(normalized);
    }
    remove(tenantId, id) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.aiConnection.delete({ where: { tenantId_id: { id, tenantId } } }))
                .then(() => true)
                .catch((error) => {
                if (isPrismaRecordNotFoundError(error))
                    return false;
                throw error;
            });
        }
        let removed = false;
        this.store.update((state) => {
            const current = normalizeState(state);
            const connections = current.connections.filter((item) => {
                const matches = item.tenantId === tenantId && item.id === id;
                removed ||= matches;
                return !matches;
            });
            return { connections };
        });
        return removed;
    }
}
function isPrismaRecordNotFoundError(error) {
    return error !== null && typeof error === "object" && "code" in error && error.code === "P2025";
}
function toCreateInput(record) {
    return {
        baseUrl: record.baseUrl,
        capabilities: record.capabilities,
        chatModel: record.chatModel,
        createdAt: new Date(record.createdAt),
        disabledAt: record.disabledAt ? new Date(record.disabledAt) : null,
        embeddingModel: record.embeddingModel,
        id: record.id,
        keyVersion: record.keyVersion,
        lastTestMessage: record.lastTestMessage,
        lastTestStatus: record.lastTestStatus,
        lastTestedAt: record.lastTestedAt ? new Date(record.lastTestedAt) : null,
        limits: record.limits,
        providerType: record.providerType,
        retrievalModel: record.retrievalModel,
        secretAlgorithm: record.secret.algorithm,
        secretAuthTag: record.secret.authTag,
        secretCiphertext: record.secret.ciphertext,
        secretEnvelopeVersion: record.secret.envelopeVersion,
        secretIv: record.secret.iv,
        status: record.status,
        tenantId: record.tenantId,
        updatedAt: new Date(record.updatedAt)
    };
}
function toRecord(row) {
    if (!row.secretCiphertext || !row.secretIv || !row.secretAuthTag)
        throw new Error("ai_connection_secret_required");
    return normalizeRecord({
        baseUrl: row.baseUrl,
        capabilities: toCapabilities(row.capabilities),
        chatModel: row.chatModel,
        createdAt: row.createdAt.toISOString(),
        disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
        embeddingModel: row.embeddingModel,
        id: row.id,
        keyVersion: String(row.keyVersion ?? ""),
        lastTestMessage: row.lastTestMessage,
        lastTestStatus: row.lastTestStatus === "passed" || row.lastTestStatus === "failed" ? row.lastTestStatus : null,
        lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
        limits: toLimits(row.limits),
        providerType: "openai_compatible",
        retrievalModel: row.retrievalModel,
        secret: {
            algorithm: (row.secretAlgorithm ?? "aes-256-gcm"),
            authTag: row.secretAuthTag,
            ciphertext: row.secretCiphertext,
            envelopeVersion: (row.secretEnvelopeVersion ?? 1),
            iv: row.secretIv,
            keyVersion: String(row.keyVersion ?? "")
        },
        status: toStatus(row.status),
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString()
    });
}
function toCapabilities(value) {
    return Array.isArray(value)
        ? value.filter((item) => ["chat_completion", "embeddings", "retrieval"].includes(String(item)))
        : [];
}
function toLimits(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}
function toStatus(value) {
    return value === "ready" || value === "limited" || value === "error" || value === "disabled" ? value : "disabled";
}
function normalizeState(input) {
    return { connections: (input.connections ?? []).map(normalizeRecord) };
}
function normalizeRecord(record) {
    if (!String(record.tenantId ?? "").trim() || !String(record.id ?? "").trim())
        throw new Error("ai_connection_identity_required");
    if (!record.secret?.ciphertext || !record.secret?.iv || !record.secret?.authTag)
        throw new Error("ai_connection_secret_required");
    return {
        ...clone(record),
        baseUrl: String(record.baseUrl).replace(/\/+$/, ""),
        capabilities: Array.from(new Set(record.capabilities)).filter((item) => ["chat_completion", "embeddings", "retrieval"].includes(item)),
        chatModel: String(record.chatModel).trim(),
        keyVersion: String(record.keyVersion).trim(),
        limits: { ...record.limits },
        retrievalModel: String(record.retrievalModel ?? "").trim() || null,
        tenantId: String(record.tenantId).trim()
    };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
//# sourceMappingURL=ai-connection.repository.js.map