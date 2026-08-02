import { createPrismaClient } from "@support-communication/database";
const OUTCOMES = new Set(["helped", "not_helped", "wrong_source"]);
export function isBotAiFeedbackOutcome(value) {
    return typeof value === "string" && OUTCOMES.has(value);
}
export class BotFeedbackRepository {
    records;
    prismaClient;
    static defaultInstance = null;
    constructor(records, prismaClient) {
        this.records = records;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (!BotFeedbackRepository.defaultInstance) {
            // Prisma-only рантайм (план 2026-07-15): дефолтный репозиторий всегда
            // персистится в Postgres; json-ветка выпилена вместе с JsonFileStore.
            BotFeedbackRepository.defaultInstance = BotFeedbackRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) });
        }
        return BotFeedbackRepository.defaultInstance;
    }
    static useDefault(repository) {
        BotFeedbackRepository.defaultInstance = repository;
    }
    static clearDefault() {
        BotFeedbackRepository.defaultInstance = null;
    }
    static inMemory(seed = []) {
        return new BotFeedbackRepository(seed.map(normalizeFeedback));
    }
    static prisma({ client }) {
        return new BotFeedbackRepository([], client);
    }
    listFeedback(filter = {}) {
        const tenantId = filter.tenantId?.trim();
        const conversationId = filter.conversationId?.trim();
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.botAiFeedback.findMany({
                orderBy: { createdAt: "desc" },
                where: { ...(tenantId ? { tenantId } : {}), ...(conversationId ? { conversationId } : {}) }
            })).then((rows) => rows.map(fromRow));
        }
        return this.records
            .filter((item) => (!tenantId || item.tenantId === tenantId) && (!conversationId || item.conversationId === conversationId))
            .map(clone);
    }
    saveFeedback(record) {
        const persisted = normalizeFeedback(record);
        if (this.prismaClient) {
            return this.savePrismaFeedback(persisted);
        }
        const existing = this.records.find((item) => item.tenantId === persisted.tenantId && item.idempotencyKey === persisted.idempotencyKey);
        if (existing) {
            return clone(existing);
        }
        this.records = [persisted, ...this.records];
        return clone(persisted);
    }
    resolveFeedback(tenantId, feedbackId, action) {
        const tenant = String(tenantId ?? "").trim();
        const id = String(feedbackId ?? "").trim();
        if (this.prismaClient) {
            return this.resolvePrismaFeedback(tenant, id, action);
        }
        let resolved;
        this.records = this.records.map((item) => {
            if (item.tenantId !== tenant || item.feedbackId !== id)
                return item;
            resolved = { ...item, resolvedAction: String(action ?? "reviewed").trim().slice(0, 80) || "reviewed", resolvedAt: new Date().toISOString(), reviewRequired: false };
            return resolved;
        });
        return resolved ? clone(resolved) : undefined;
    }
    async savePrismaFeedback(persisted) {
        const existing = await this.prismaClient.botAiFeedback.findFirst({
            where: { idempotencyKey: persisted.idempotencyKey, tenantId: persisted.tenantId }
        });
        if (existing)
            return fromRow(existing);
        const row = await this.prismaClient.botAiFeedback.create({ data: toCreateInput(persisted) });
        return fromRow(row);
    }
    async resolvePrismaFeedback(tenant, id, action) {
        const result = await this.prismaClient.botAiFeedback.updateMany({
            data: { resolvedAction: String(action ?? "reviewed").trim().slice(0, 80) || "reviewed", resolvedAt: new Date(), reviewRequired: false },
            where: { feedbackId: id, tenantId: tenant }
        });
        if (!result.count)
            return undefined;
        const row = await this.prismaClient.botAiFeedback.findUnique({ where: { feedbackId: id } });
        return row ? fromRow(row) : undefined;
    }
}
function toCreateInput(record) {
    return {
        actorId: record.actorId,
        citationSourceIds: record.citationSourceIds,
        comment: record.comment,
        conversationId: record.conversationId,
        createdAt: new Date(record.createdAt),
        feedbackId: record.feedbackId,
        idempotencyKey: record.idempotencyKey,
        outcome: record.outcome,
        resolvedAction: record.resolvedAction ?? null,
        resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : null,
        reviewRequired: record.reviewRequired,
        scenarioId: record.scenarioId,
        tenantId: record.tenantId
    };
}
function fromRow(row) {
    return normalizeFeedback({
        actorId: row.actorId,
        citationSourceIds: Array.isArray(row.citationSourceIds) ? row.citationSourceIds : [],
        comment: row.comment,
        conversationId: row.conversationId,
        createdAt: row.createdAt.toISOString(),
        feedbackId: row.feedbackId,
        idempotencyKey: row.idempotencyKey,
        knowledgeMutated: false,
        outcome: row.outcome,
        resolvedAction: row.resolvedAction,
        resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
        reviewRequired: row.reviewRequired,
        scenarioId: row.scenarioId,
        tenantId: row.tenantId
    });
}
function normalizeFeedback(record) {
    return {
        actorId: String(record.actorId ?? "").trim(),
        citationSourceIds: Array.isArray(record.citationSourceIds)
            ? record.citationSourceIds.map((id) => String(id ?? "").trim()).filter(Boolean)
            : [],
        comment: record.comment == null ? null : String(record.comment).trim() || null,
        conversationId: String(record.conversationId ?? "").trim(),
        createdAt: String(record.createdAt ?? new Date().toISOString()),
        feedbackId: String(record.feedbackId ?? "").trim(),
        idempotencyKey: String(record.idempotencyKey ?? "").trim(),
        knowledgeMutated: false,
        outcome: isBotAiFeedbackOutcome(record.outcome) ? record.outcome : "not_helped",
        resolvedAction: record.resolvedAction == null ? null : String(record.resolvedAction).trim() || null,
        resolvedAt: record.resolvedAt == null ? null : String(record.resolvedAt).trim() || null,
        reviewRequired: record.resolvedAt ? false : (Boolean(record.reviewRequired) || record.outcome === "wrong_source" || record.outcome === "not_helped"),
        scenarioId: record.scenarioId == null ? null : String(record.scenarioId).trim() || null,
        tenantId: String(record.tenantId ?? "").trim()
    };
}
function clone(value) {
    return structuredClone(value);
}
//# sourceMappingURL=bot-feedback.repository.js.map