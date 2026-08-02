import { InMemoryStore, createPrismaClient } from "@support-communication/database";
import { deriveKnowledgeSourceReadiness, knowledgeSourceApprovalStatuses, knowledgeSourceKinds, knowledgeSourceStatuses } from "./knowledge-source.types.js";
import { KnowledgeRetrievalCache } from "./knowledge-retrieval-cache.js";
const KNOWLEDGE_INGESTION_LEASE_MS = 5 * 60 * 1000;
const KNOWLEDGE_INGESTION_MAX_ATTEMPTS = 5;
let defaultRepository = null;
/**
 * Tenant-scoped persistence for the source catalogue.  Transport, ingestion
 * and retrieval deliberately remain outside this repository.
 */
export class KnowledgeSourceRepository {
    store;
    prismaClient;
    constructor(store, prismaClient) {
        this.store = store;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (!defaultRepository) {
            // Prisma-only рантайм (план 2026-07-15): каталог источников всегда
            // персистится в Postgres; json-ветки выпилены.
            defaultRepository = KnowledgeSourceRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) });
        }
        return defaultRepository;
    }
    static clearDefault() { defaultRepository = null; }
    static bindRetrievalCache(cache) {
        KnowledgeRetrievalCache.useDefault(cache);
    }
    static inMemory(seed = { ingestionJobs: [], sources: [] }) {
        return new KnowledgeSourceRepository(new InMemoryStore(normalizeState(seed)));
    }
    static prisma({ client }) {
        return new KnowledgeSourceRepository(new InMemoryStore({ ingestionJobs: [], sources: [] }), client);
    }
    static useDefault(repository) { defaultRepository = repository; }
    list(tenantId) {
        const tenant = requiredIdentifier(tenantId, "knowledge_source_tenant_required");
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.knowledgeSource.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId: tenant } }))
                .then((rows) => rows.map(toSourceRecord));
        }
        return clone(this.store.read().sources.filter((source) => source.tenantId === tenant));
    }
    /** Internal worker read model. Callers must keep each subsequent mutation tenant-scoped. */
    listAll() {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.knowledgeSource.findMany({ orderBy: { createdAt: "asc" } }))
                .then((rows) => rows.map(toSourceRecord));
        }
        return clone(this.store.read().sources);
    }
    find(tenantId, id) {
        const tenant = requiredIdentifier(tenantId, "knowledge_source_tenant_required");
        const sourceId = requiredIdentifier(id, "knowledge_source_identity_required");
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.knowledgeSource.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId: tenant } }))
                .then((rows) => {
                const row = rows.find((item) => item.id === sourceId);
                return row ? toSourceRecord(row) : undefined;
            });
        }
        const source = this.store.read().sources.find((item) => item.tenantId === tenant && item.id === sourceId);
        return source ? clone(source) : undefined;
    }
    save(record) {
        const normalized = normalizeRecord(record);
        if (this.prismaClient) {
            const create = toSourceCreateInput(normalized);
            const { createdAt: _createdAt, id: _id, tenantId: _tenantId, ...update } = create;
            return Promise.resolve(this.prismaClient.knowledgeSource.upsert({
                create,
                update,
                where: { tenantId_id: { id: normalized.id, tenantId: normalized.tenantId } }
            })).then((row) => {
                KnowledgeRetrievalCache.default().purgeSource(normalized.tenantId, normalized.id);
                return toSourceRecord(row);
            });
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            const exists = current.sources.some((item) => item.tenantId === normalized.tenantId && item.id === normalized.id);
            return { ...current,
                sources: exists
                    ? current.sources.map((item) => item.tenantId === normalized.tenantId && item.id === normalized.id ? normalized : item)
                    : [...current.sources, normalized]
            };
        });
        KnowledgeRetrievalCache.default().purgeSource(normalized.tenantId, normalized.id);
        return clone(normalized);
    }
    /** Hard delete of an archived source; ingestion jobs of the source are dropped with it. */
    delete(tenantId, id) {
        const tenant = requiredIdentifier(tenantId, "knowledge_source_tenant_required");
        const sourceId = requiredIdentifier(id, "knowledge_source_identity_required");
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.knowledgeIngestionJob.deleteMany({ where: { sourceId, tenantId: tenant } }))
                .then(() => this.prismaClient.knowledgeSource.deleteMany({ where: { id: sourceId, tenantId: tenant } }))
                .then(() => {
                KnowledgeRetrievalCache.default().purgeSource(tenant, sourceId);
            });
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ingestionJobs: current.ingestionJobs.filter((item) => !(item.tenantId === tenant && item.sourceId === sourceId)),
                sources: current.sources.filter((item) => !(item.tenantId === tenant && item.id === sourceId))
            };
        });
        KnowledgeRetrievalCache.default().purgeSource(tenant, sourceId);
    }
    /** BAI-827: пометить document-источники статьи, что вышла новая версия статьи. */
    markArticleUpdated(tenantId, articleId, articleVersion) {
        const tenant = requiredIdentifier(tenantId, "knowledge_source_tenant_required");
        const article = requiredIdentifier(articleId, "knowledge_source_identity_required");
        if (this.prismaClient) {
            return Promise.resolve(this.list(tenant)).then(async (sources) => {
                let marked = 0;
                for (const item of sources) {
                    if (item.kind !== "document")
                        continue;
                    const boundArticle = String(item.sourceConfig.articleId ?? item.sourceRef ?? "");
                    if (boundArticle !== article)
                        continue;
                    if (String(item.metadata.articleVersion ?? "") === articleVersion)
                        continue;
                    marked += 1;
                    await this.save({ ...item, metadata: { ...item.metadata, articleUpdatedAt: new Date().toISOString(), pendingArticleVersion: articleVersion } });
                }
                return marked;
            });
        }
        let marked = 0;
        this.store.update((state) => {
            const current = normalizeState(state);
            return {
                ...current,
                sources: current.sources.map((item) => {
                    if (item.tenantId !== tenant || item.kind !== "document")
                        return item;
                    const boundArticle = String(item.sourceConfig.articleId ?? item.sourceRef ?? "");
                    if (boundArticle !== article)
                        return item;
                    if (String(item.metadata.articleVersion ?? "") === articleVersion)
                        return item;
                    marked += 1;
                    return { ...item, metadata: { ...item.metadata, articleUpdatedAt: new Date().toISOString(), pendingArticleVersion: articleVersion } };
                })
            };
        });
        return marked;
    }
    findIngestionJob(tenantId, idempotencyKey) {
        const tenant = requiredIdentifier(tenantId, "knowledge_source_tenant_required");
        const key = requiredIdentifier(idempotencyKey, "knowledge_ingestion_key_required");
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.knowledgeIngestionJob.findFirst({ where: { idempotencyKey: key, tenantId: tenant } }))
                .then((row) => row ? toJobRecord(row) : undefined);
        }
        const job = this.store.read().ingestionJobs.find((item) => item.tenantId === tenant && item.idempotencyKey === key);
        return job ? clone(job) : undefined;
    }
    claimNextIngestionJob() {
        if (this.prismaClient) {
            return this.claimNextPrismaIngestionJob();
        }
        let claimed;
        this.store.update((state) => {
            const current = normalizeState(state);
            const now = new Date();
            const staleBefore = now.getTime() - KNOWLEDGE_INGESTION_LEASE_MS;
            const isClaimable = (item) => item.status === "pending"
                || (item.status === "processing" && Date.parse(item.updatedAt) < staleBefore);
            const job = current.ingestionJobs.find((item) => isClaimable(item) && item.attempts < KNOWLEDGE_INGESTION_MAX_ATTEMPTS);
            const updatedAt = now.toISOString();
            if (job) {
                claimed = { ...job, attempts: job.attempts + 1, errorCode: null, status: "processing", updatedAt };
            }
            return {
                ...current,
                ingestionJobs: current.ingestionJobs.map((item) => {
                    if (item.jobId === job?.jobId)
                        return claimed;
                    if (isClaimable(item) && item.attempts >= KNOWLEDGE_INGESTION_MAX_ATTEMPTS) {
                        return { ...item, errorCode: "knowledge_ingestion_attempts_exhausted", status: "failed", updatedAt };
                    }
                    return item;
                })
            };
        });
        return claimed ? clone(claimed) : undefined;
    }
    saveIngestionJob(job) {
        const normalized = normalizeJob(job);
        if (this.prismaClient) {
            return this.savePrismaIngestionJob(normalized);
        }
        let saved = normalized;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.ingestionJobs.find((item) => item.tenantId === normalized.tenantId && item.idempotencyKey === normalized.idempotencyKey);
            if (existing) {
                saved = existing;
                return current;
            }
            return { ...current, ingestionJobs: [...current.ingestionJobs, normalized] };
        });
        return clone(saved);
    }
    completeIngestionJob(jobId, status, errorCode = null) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.knowledgeIngestionJob.updateMany({
                data: { errorCode, status, updatedAt: new Date() },
                where: { jobId }
            })).then(async (result) => {
                if (!result.count)
                    return undefined;
                const row = await this.prismaClient.knowledgeIngestionJob.findUnique({ where: { jobId } });
                return row ? toJobRecord(row) : undefined;
            });
        }
        let saved;
        this.store.update((state) => {
            const current = normalizeState(state);
            return { ...current, ingestionJobs: current.ingestionJobs.map((item) => {
                    if (item.jobId !== jobId)
                        return item;
                    saved = { ...item, errorCode, status, updatedAt: new Date().toISOString() };
                    return saved;
                }) };
        });
        return saved ? clone(saved) : undefined;
    }
    async claimNextPrismaIngestionJob() {
        // Оптимистичный claim: updateMany с where по прежнему статусу — второй
        // конкурирующий воркер получит count=0 и возьмёт следующую задачу.
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const staleBefore = new Date(Date.now() - KNOWLEDGE_INGESTION_LEASE_MS);
            const pending = await this.prismaClient.knowledgeIngestionJob.findFirst({
                orderBy: { createdAt: "asc" },
                where: { status: "pending" }
            });
            const candidate = pending ?? await this.prismaClient.knowledgeIngestionJob.findFirst({
                orderBy: { createdAt: "asc" },
                where: { status: "processing", updatedAt: { lt: staleBefore } }
            });
            if (!candidate)
                return undefined;
            const claimWhere = { jobId: candidate.jobId, status: candidate.status, updatedAt: candidate.updatedAt };
            if (candidate.attempts >= KNOWLEDGE_INGESTION_MAX_ATTEMPTS) {
                await this.prismaClient.knowledgeIngestionJob.updateMany({
                    data: { errorCode: "knowledge_ingestion_attempts_exhausted", status: "failed", updatedAt: new Date() },
                    where: claimWhere
                });
                continue;
            }
            const result = await this.prismaClient.knowledgeIngestionJob.updateMany({
                data: { attempts: candidate.attempts + 1, errorCode: null, status: "processing", updatedAt: new Date() },
                where: claimWhere
            });
            if (result.count) {
                const row = await this.prismaClient.knowledgeIngestionJob.findUnique({ where: { jobId: candidate.jobId } });
                return row ? toJobRecord(row) : undefined;
            }
        }
        return undefined;
    }
    async savePrismaIngestionJob(job) {
        const existing = await this.prismaClient.knowledgeIngestionJob.findFirst({
            where: { idempotencyKey: job.idempotencyKey, tenantId: job.tenantId }
        });
        if (existing)
            return toJobRecord(existing);
        try {
            const row = await this.prismaClient.knowledgeIngestionJob.create({ data: toJobRow(job) });
            return toJobRecord(row);
        }
        catch (error) {
            if (!isPrismaUniqueConstraintError(error))
                throw error;
            const raced = await this.prismaClient.knowledgeIngestionJob.findFirst({
                where: { idempotencyKey: job.idempotencyKey, tenantId: job.tenantId }
            });
            if (!raced)
                throw error;
            return toJobRecord(raced);
        }
    }
}
function isPrismaUniqueConstraintError(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
function toSourceCreateInput(record) {
    return {
        approvalStatus: record.approvalStatus,
        approvedAt: record.approvedAt ? new Date(record.approvedAt) : null,
        approvedBy: record.approvedBy,
        archivedAt: record.archivedAt ? new Date(record.archivedAt) : null,
        contentChecksum: record.contentChecksum,
        createdAt: new Date(record.createdAt),
        disabledAt: record.disabledAt ? new Date(record.disabledAt) : null,
        failedAt: record.failedAt ? new Date(record.failedAt) : null,
        failureCode: record.failureCode,
        id: record.id,
        kind: record.kind,
        lastIndexedAt: record.lastIndexedAt ? new Date(record.lastIndexedAt) : null,
        lastIngestedAt: record.lastIngestedAt ? new Date(record.lastIngestedAt) : null,
        metadata: record.metadata,
        owner: record.owner,
        readiness: record.readiness,
        retentionUntil: record.retentionUntil ? new Date(record.retentionUntil) : null,
        sourceConfig: record.sourceConfig,
        sourceRef: record.sourceRef,
        status: record.status,
        tenantId: record.tenantId,
        title: record.title,
        updatedAt: new Date(record.updatedAt),
        version: record.version
    };
}
function toSourceRecord(row) {
    return normalizeRecord({
        approvalStatus: row.approvalStatus,
        approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
        approvedBy: row.approvedBy,
        archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
        contentChecksum: row.contentChecksum,
        createdAt: row.createdAt.toISOString(),
        disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
        failedAt: row.failedAt ? row.failedAt.toISOString() : null,
        failureCode: row.failureCode,
        id: row.id,
        kind: row.kind,
        lastIndexedAt: row.lastIndexedAt ? row.lastIndexedAt.toISOString() : null,
        lastIngestedAt: row.lastIngestedAt ? row.lastIngestedAt.toISOString() : null,
        metadata: toRecord(row.metadata),
        owner: row.owner,
        readiness: row.readiness,
        retentionUntil: row.retentionUntil ? row.retentionUntil.toISOString() : null,
        sourceConfig: toRecord(row.sourceConfig),
        sourceRef: row.sourceRef,
        status: row.status,
        tenantId: row.tenantId,
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version
    });
}
function toJobRow(job) {
    return {
        attempts: job.attempts,
        createdAt: new Date(job.createdAt),
        errorCode: job.errorCode,
        fileId: job.fileId,
        fingerprint: job.fingerprint,
        idempotencyKey: job.idempotencyKey,
        jobId: job.jobId,
        sourceId: job.sourceId,
        status: job.status,
        tenantId: job.tenantId,
        updatedAt: new Date(job.updatedAt)
    };
}
function toJobRecord(row) {
    return normalizeJob({
        attempts: row.attempts,
        createdAt: row.createdAt.toISOString(),
        errorCode: row.errorCode,
        fileId: row.fileId,
        fingerprint: row.fingerprint,
        idempotencyKey: row.idempotencyKey,
        jobId: row.jobId,
        sourceId: row.sourceId,
        status: row.status,
        tenantId: row.tenantId,
        updatedAt: row.updatedAt.toISOString()
    });
}
function normalizeState(input) {
    return { ingestionJobs: (input.ingestionJobs ?? []).map(normalizeJob), sources: (input.sources ?? []).map(normalizeRecord) };
}
function normalizeJob(job) {
    const status = ["completed", "failed", "pending", "processing"].includes(job.status) ? job.status : "failed";
    return { ...clone(job), attempts: Math.max(0, Number(job.attempts) || 0), errorCode: nullableTrim(job.errorCode), fileId: requiredIdentifier(job.fileId, "knowledge_ingestion_file_required"), fingerprint: requiredIdentifier(job.fingerprint, "knowledge_ingestion_fingerprint_required"), idempotencyKey: requiredIdentifier(job.idempotencyKey, "knowledge_ingestion_key_required"), jobId: requiredIdentifier(job.jobId, "knowledge_ingestion_job_required"), sourceId: requiredIdentifier(job.sourceId, "knowledge_source_identity_required"), status, tenantId: requiredIdentifier(job.tenantId, "knowledge_source_tenant_required") };
}
function normalizeRecord(record) {
    const tenantId = requiredIdentifier(record.tenantId, "knowledge_source_tenant_required");
    const id = requiredIdentifier(record.id, "knowledge_source_identity_required");
    const kind = validValue(record.kind, knowledgeSourceKinds, "knowledge_source_kind_invalid");
    const status = validValue(record.status, knowledgeSourceStatuses, "knowledge_source_status_invalid");
    const approvalStatus = validValue(record.approvalStatus, knowledgeSourceApprovalStatuses, "knowledge_source_approval_status_invalid");
    return {
        ...clone(record),
        approvalStatus,
        id,
        kind,
        metadata: toRecord(record.metadata),
        owner: String(record.owner ?? "").trim(),
        readiness: deriveKnowledgeSourceReadiness(status, approvalStatus),
        sourceConfig: toRecord(record.sourceConfig),
        sourceRef: nullableTrim(record.sourceRef),
        status,
        tenantId,
        title: String(record.title ?? "").trim(),
        version: positiveInteger(record.version)
    };
}
function requiredIdentifier(value, message) {
    const normalized = String(value ?? "").trim();
    if (!normalized)
        throw new Error(message);
    return normalized;
}
function validValue(value, allowed, message) {
    if (typeof value === "string" && allowed.includes(value))
        return value;
    throw new Error(message);
}
function nullableTrim(value) {
    const normalized = String(value ?? "").trim();
    return normalized || null;
}
function toRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? clone(value) : {};
}
function positiveInteger(value) {
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : 1;
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=knowledge-source.repository.js.map