import { InMemoryStore } from "@support-communication/database";
let defaultQualityRepository = null;
export class QualityRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    static default() {
        if (defaultQualityRepository) {
            return defaultQualityRepository;
        }
        return QualityRepository.inMemory();
    }
    static useDefault(repository) {
        defaultQualityRepository = repository;
    }
    static clearDefault() {
        defaultQualityRepository = null;
    }
    static inMemory(seed = seedQualityState()) {
        return new QualityRepository(new InMemoryStore(normalizeState(seed)));
    }
    static prisma({ client, fallback }) {
        return new PrismaQualityRepository(client, fallback ?? QualityRepository.inMemory());
    }
    readState() {
        return clone(normalizeState(this.store.read()));
    }
    readWorkspace(filter = {}) {
        const workspace = this.readState().workspace;
        if (filter.tenantId && workspace.tenantId !== filter.tenantId) {
            return emptyQualityWorkspace();
        }
        return clone(workspace);
    }
    listQualityRatings(filter = {}) {
        if (!hasTenantScope(filter)) {
            return [];
        }
        return clone(this.readState().ratings.filter((rating) => rating.tenantId === filter.tenantId
            && (!filter.conversationId || rating.conversationId === filter.conversationId)));
    }
    listManualQaReviews(filter = {}) {
        if (!hasTenantScope(filter)) {
            return [];
        }
        return clone(this.readState().manualQaReviews.filter((review) => review.tenantId === filter.tenantId
            && (!filter.conversationId || review.conversationId === filter.conversationId)));
    }
    listAiScoringAudits(filter = {}) {
        if (!hasTenantScope(filter)) {
            return [];
        }
        return clone(this.readState().aiScoringAudits.filter((audit) => audit.tenantId === filter.tenantId
            && (!filter.conversationId || audit.conversationId === filter.conversationId)));
    }
    listAiSuggestionDecisions(filter = {}) {
        if (!hasTenantScope(filter))
            return [];
        return clone(this.readState().aiSuggestionDecisions.filter((decision) => decision.tenantId === filter.tenantId && (!filter.conversationId || decision.conversationId === filter.conversationId)));
    }
    saveQualityRating(record, lifecycleEvent) {
        const persisted = normalizeQualityRating(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.ratings.find((rating) => rating.tenantId === persisted.tenantId && rating.ratingId === persisted.ratingId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                lifecycleEvents: appendLifecycleEvent(current.lifecycleEvents ?? [], event),
                ratings: [...current.ratings, persisted]
            };
        });
        return clone(saved);
    }
    saveManualQaReview(record, lifecycleEvent) {
        const persisted = normalizeManualQaReview(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.manualQaReviews.find((review) => review.tenantId === persisted.tenantId && review.reviewId === persisted.reviewId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                lifecycleEvents: appendLifecycleEvent(current.lifecycleEvents ?? [], event),
                manualQaReviews: [...current.manualQaReviews, persisted]
            };
        });
        return clone(saved);
    }
    claimAiScoringAudit(record) {
        const persisted = normalizeAiScoringAudit({ ...record, status: "pending" });
        let claimed = false;
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.aiScoringAudits.find((audit) => audit.tenantId === persisted.tenantId && audit.auditId === persisted.auditId);
            if (existing) {
                saved = existing;
                return current;
            }
            claimed = true;
            return { ...current, aiScoringAudits: [...current.aiScoringAudits, persisted] };
        });
        return { claimed, record: clone(saved) };
    }
    completeAiScoringAudit(record, lifecycleEvent) {
        const persisted = normalizeAiScoringAudit(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const index = current.aiScoringAudits.findIndex((audit) => audit.tenantId === persisted.tenantId && audit.auditId === persisted.auditId);
            if (index >= 0) {
                const existing = current.aiScoringAudits[index];
                if (existing.requestFingerprint !== persisted.requestFingerprint || existing.resultSnapshot) {
                    saved = existing;
                    return current;
                }
                const aiScoringAudits = [...current.aiScoringAudits];
                aiScoringAudits[index] = persisted;
                return {
                    ...current,
                    aiScoringAudits,
                    lifecycleEvents: appendLifecycleEvent(current.lifecycleEvents ?? [], event)
                };
            }
            return {
                ...current,
                aiScoringAudits: [...current.aiScoringAudits, persisted],
                lifecycleEvents: appendLifecycleEvent(current.lifecycleEvents ?? [], event)
            };
        });
        return clone(saved);
    }
    saveAiScoringAudit(record, lifecycleEvent) {
        const persisted = normalizeAiScoringAudit(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.aiScoringAudits.find((audit) => audit.tenantId === persisted.tenantId && audit.auditId === persisted.auditId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                aiScoringAudits: [...current.aiScoringAudits, persisted],
                lifecycleEvents: appendLifecycleEvent(current.lifecycleEvents ?? [], event)
            };
        });
        return clone(saved);
    }
    saveAiSuggestionDecision(record, lifecycleEvent) {
        const persisted = normalizeAiSuggestionDecision(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.aiSuggestionDecisions.find((item) => item.tenantId === persisted.tenantId && item.suggestionId === persisted.suggestionId);
            if (existing) {
                saved = existing;
                return current;
            }
            return { ...current, aiSuggestionDecisions: [...current.aiSuggestionDecisions, persisted], lifecycleEvents: appendLifecycleEvent(current.lifecycleEvents ?? [], event) };
        });
        return clone(saved);
    }
}
export class PrismaQualityRepository {
    client;
    fallback;
    constructor(client, fallback) {
        this.client = client;
        this.fallback = fallback;
    }
    readState() {
        return this.fallback.readState();
    }
    readWorkspace(filter = {}) {
        return this.fallback.readWorkspace(filter);
    }
    async listQualityRatings(filter = {}) {
        if (!hasTenantScope(filter)) {
            return [];
        }
        const rows = await this.client.qualityRating.findMany({
            orderBy: { createdAt: "desc" },
            where: {
                ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
                tenantId: filter.tenantId
            }
        });
        return rows.map(toQualityRatingRecord);
    }
    async listManualQaReviews(filter = {}) {
        if (!hasTenantScope(filter)) {
            return [];
        }
        const rows = await this.client.manualQaReview.findMany({
            orderBy: { createdAt: "desc" },
            where: {
                ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
                tenantId: filter.tenantId
            }
        });
        return rows.map(toManualQaReviewRecord);
    }
    async listAiScoringAudits(filter = {}) {
        if (!hasTenantScope(filter)) {
            return [];
        }
        const rows = await this.client.aiScoringAudit.findMany({
            orderBy: { createdAt: "desc" },
            where: {
                ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
                tenantId: filter.tenantId
            }
        });
        return rows.map(toAiScoringAuditRecord);
    }
    async listAiSuggestionDecisions(filter = {}) {
        if (!hasTenantScope(filter))
            return [];
        const rows = await this.client.aiSuggestionDecision.findMany({
            orderBy: { createdAt: "desc" },
            where: { ...(filter.conversationId ? { conversationId: filter.conversationId } : {}), tenantId: filter.tenantId }
        });
        return rows.map(toAiSuggestionDecisionRecord);
    }
    async saveQualityRating(record, lifecycleEvent) {
        const persisted = normalizeQualityRating(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        const existing = await this.client.qualityRating.findUnique({
            where: {
                tenantId_ratingId: {
                    ratingId: persisted.ratingId,
                    tenantId: persisted.tenantId
                }
            }
        });
        if (existing) {
            const saved = toQualityRatingRecord(existing);
            this.fallback.saveQualityRating(saved);
            return clone(saved);
        }
        let row;
        try {
            row = await createPrismaQualityRecord(this.client, (transaction) => transaction.qualityRating.create({ data: toPrismaQualityRatingCreateInput(persisted) }), event);
        }
        catch (error) {
            const concurrent = await this.client.qualityRating.findUnique({
                where: { tenantId_ratingId: { ratingId: persisted.ratingId, tenantId: persisted.tenantId } }
            });
            if (!concurrent)
                throw error;
            row = concurrent;
        }
        const saved = toQualityRatingRecord(row);
        this.fallback.saveQualityRating(saved, event);
        return clone(saved);
    }
    async saveManualQaReview(record, lifecycleEvent) {
        const persisted = normalizeManualQaReview(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        const existing = await this.client.manualQaReview.findUnique({
            where: {
                tenantId_reviewId: {
                    reviewId: persisted.reviewId,
                    tenantId: persisted.tenantId
                }
            }
        });
        if (existing) {
            const saved = toManualQaReviewRecord(existing);
            this.fallback.saveManualQaReview(saved);
            return clone(saved);
        }
        let row;
        try {
            row = await createPrismaQualityRecord(this.client, (transaction) => transaction.manualQaReview.create({ data: toPrismaManualQaReviewCreateInput(persisted) }), event);
        }
        catch (error) {
            const concurrent = await this.client.manualQaReview.findUnique({
                where: { tenantId_reviewId: { reviewId: persisted.reviewId, tenantId: persisted.tenantId } }
            });
            if (!concurrent)
                throw error;
            row = concurrent;
        }
        const saved = toManualQaReviewRecord(row);
        this.fallback.saveManualQaReview(saved, event);
        return clone(saved);
    }
    async claimAiScoringAudit(record) {
        const persisted = normalizeAiScoringAudit({ ...record, status: "pending" });
        const where = { tenantId_auditId: { auditId: persisted.auditId, tenantId: persisted.tenantId } };
        const existing = await this.client.aiScoringAudit.findUnique({ where });
        if (existing) {
            return { claimed: false, record: toAiScoringAuditRecord(existing) };
        }
        try {
            const row = await this.client.aiScoringAudit.create({ data: toPrismaAiScoringAuditCreateInput(persisted) });
            const saved = toAiScoringAuditRecord(row);
            this.fallback.claimAiScoringAudit(saved);
            return { claimed: true, record: clone(saved) };
        }
        catch (error) {
            const concurrent = await this.client.aiScoringAudit.findUnique({ where });
            if (!concurrent)
                throw error;
            return { claimed: false, record: toAiScoringAuditRecord(concurrent) };
        }
    }
    async completeAiScoringAudit(record, lifecycleEvent) {
        const persisted = normalizeAiScoringAudit(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        const where = { tenantId_auditId: { auditId: persisted.auditId, tenantId: persisted.tenantId } };
        const existingRow = await this.client.aiScoringAudit.findUnique({ where });
        if (existingRow) {
            const existing = toAiScoringAuditRecord(existingRow);
            if (existing.requestFingerprint !== persisted.requestFingerprint || existing.resultSnapshot) {
                return clone(existing);
            }
        }
        const row = await updatePrismaQualityRecord(this.client, (transaction) => transaction.aiScoringAudit.update({
            data: toPrismaAiScoringAuditCreateInput(persisted),
            where
        }), event);
        const saved = toAiScoringAuditRecord(row);
        this.fallback.completeAiScoringAudit(saved, event);
        return clone(saved);
    }
    async saveAiScoringAudit(record, lifecycleEvent) {
        const persisted = normalizeAiScoringAudit(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        const existing = await this.client.aiScoringAudit.findUnique({
            where: {
                tenantId_auditId: {
                    auditId: persisted.auditId,
                    tenantId: persisted.tenantId
                }
            }
        });
        if (existing) {
            const saved = toAiScoringAuditRecord(existing);
            this.fallback.saveAiScoringAudit(saved);
            return clone(saved);
        }
        let row;
        try {
            row = await createPrismaQualityRecord(this.client, (transaction) => transaction.aiScoringAudit.create({ data: toPrismaAiScoringAuditCreateInput(persisted) }), event);
        }
        catch (error) {
            const concurrent = await this.client.aiScoringAudit.findUnique({
                where: { tenantId_auditId: { auditId: persisted.auditId, tenantId: persisted.tenantId } }
            });
            if (!concurrent)
                throw error;
            row = concurrent;
        }
        const saved = toAiScoringAuditRecord(row);
        this.fallback.saveAiScoringAudit(saved, event);
        return clone(saved);
    }
    async saveAiSuggestionDecision(record, lifecycleEvent) {
        const persisted = normalizeAiSuggestionDecision(record);
        const event = normalizeLifecycleEvent(lifecycleEvent, persisted);
        const where = { tenantId_suggestionId: { suggestionId: persisted.suggestionId, tenantId: persisted.tenantId } };
        const existing = await this.client.aiSuggestionDecision.findUnique({ where });
        if (existing)
            return toAiSuggestionDecisionRecord(existing);
        let row;
        try {
            row = await createPrismaQualityRecord(this.client, (transaction) => transaction.aiSuggestionDecision.create({ data: toPrismaAiSuggestionDecisionCreateInput(persisted) }), event);
        }
        catch (error) {
            const concurrent = await this.client.aiSuggestionDecision.findUnique({ where });
            if (!concurrent)
                throw error;
            row = concurrent;
        }
        const saved = toAiSuggestionDecisionRecord(row);
        this.fallback.saveAiSuggestionDecision(saved, event);
        return clone(saved);
    }
}
async function createPrismaQualityRecord(client, create, lifecycleEvent) {
    if (!lifecycleEvent) {
        return create(client);
    }
    return client.$transaction(async (transaction) => {
        const row = await create(transaction);
        await transaction.conversationLifecycleEvent.create({
            data: toPrismaLifecycleEventCreateInput(lifecycleEvent)
        });
        return row;
    });
}
async function updatePrismaQualityRecord(client, update, lifecycleEvent) {
    if (!lifecycleEvent)
        return update(client);
    return client.$transaction(async (transaction) => {
        const row = await update(transaction);
        await transaction.conversationLifecycleEvent.create({
            data: toPrismaLifecycleEventCreateInput(lifecycleEvent)
        });
        return row;
    });
}
function normalizeLifecycleEvent(event, record) {
    if (!event)
        return undefined;
    if (event.tenantId !== record.tenantId || event.conversationId !== record.conversationId) {
        throw new Error("quality_lifecycle_scope_mismatch");
    }
    return clone(event);
}
function appendLifecycleEvent(events, event) {
    if (!event || events.some((item) => item.tenantId === event.tenantId
        && item.source === event.source
        && item.sourceEventId === event.sourceEventId)) {
        return events;
    }
    return [...events, clone(event)];
}
function toPrismaLifecycleEventCreateInput(event) {
    return {
        actorId: event.actorId,
        actorName: event.actorName,
        actorType: event.actorType,
        conversationId: event.conversationId,
        data: clone(event.data),
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
    };
}
function emptyQualityWorkspace() {
    return {
        aiCoachingQueue: [],
        aiEffectivenessMetrics: [],
        aiRealtimeChecks: [],
        aiSuggestions: [],
        knowledgeArticles: [],
        qualityMetrics: [],
        tenantId: null
    };
}
function seedQualityState() {
    return {
        aiSuggestionDecisions: [],
        aiScoringAudits: [],
        lifecycleEvents: [],
        manualQaReviews: [],
        ratings: [],
        workspace: emptyQualityWorkspace()
    };
}
function normalizeState(state) {
    return {
        aiSuggestionDecisions: (state.aiSuggestionDecisions ?? []).map(normalizeAiSuggestionDecision),
        aiScoringAudits: (state.aiScoringAudits ?? []).map(normalizeAiScoringAudit),
        lifecycleEvents: clone(state.lifecycleEvents ?? []),
        manualQaReviews: (state.manualQaReviews ?? []).map(normalizeManualQaReview),
        ratings: (state.ratings ?? []).map(normalizeQualityRating),
        workspace: state.workspace ?? emptyQualityWorkspace()
    };
}
function toPrismaQualityRatingCreateInput(record) {
    const persisted = normalizeQualityRating(record);
    return {
        auditId: persisted.auditId,
        channel: persisted.channel,
        clientId: persisted.clientId,
        conversationId: persisted.conversationId,
        createdAt: new Date(persisted.createdAt),
        operator: persisted.operator,
        ratingId: persisted.ratingId,
        realtimeEventId: persisted.realtimeEventId,
        scale: persisted.scale,
        score: persisted.score,
        tenantId: persisted.tenantId,
        topic: persisted.topic
    };
}
function toPrismaManualQaReviewCreateInput(record) {
    const persisted = normalizeManualQaReview(record);
    return {
        auditId: persisted.auditId,
        conversationId: persisted.conversationId,
        createdAt: new Date(persisted.createdAt),
        criteria: clone(persisted.criteria),
        overrideReason: persisted.overrideReason,
        reviewId: persisted.reviewId,
        reviewer: persisted.reviewer,
        score: persisted.score,
        tenantId: persisted.tenantId
    };
}
function toPrismaAiScoringAuditCreateInput(record) {
    const persisted = normalizeAiScoringAudit(record);
    return {
        auditId: persisted.auditId,
        conversationId: persisted.conversationId,
        createdAt: new Date(persisted.createdAt),
        providerId: persisted.providerId,
        providerResultId: persisted.providerResultId,
        queue: persisted.queue,
        requestFingerprint: persisted.requestFingerprint ?? null,
        resultSnapshot: persisted.resultSnapshot ? clone(persisted.resultSnapshot) : null,
        score: persisted.score,
        status: persisted.status,
        tenantId: persisted.tenantId,
        traceId: persisted.traceId,
        updatedAt: new Date(persisted.updatedAt ?? persisted.createdAt)
    };
}
function toQualityRatingRecord(row) {
    return normalizeQualityRating({
        auditId: row.auditId,
        channel: row.channel,
        clientId: row.clientId,
        conversationId: row.conversationId,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        operator: row.operator,
        ratingId: row.ratingId,
        realtimeEventId: row.realtimeEventId,
        scale: row.scale,
        score: row.score,
        tenantId: row.tenantId,
        topic: row.topic
    });
}
function toAiScoringAuditRecord(row) {
    return normalizeAiScoringAudit({
        auditId: row.auditId,
        conversationId: row.conversationId,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        providerId: row.providerId,
        providerResultId: row.providerResultId,
        queue: row.queue,
        requestFingerprint: row.requestFingerprint,
        resultSnapshot: row.resultSnapshot,
        score: row.score,
        status: row.status,
        tenantId: row.tenantId,
        traceId: row.traceId,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt)
    });
}
function toManualQaReviewRecord(row) {
    return normalizeManualQaReview({
        auditId: row.auditId,
        conversationId: row.conversationId,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        criteria: row.criteria,
        overrideReason: row.overrideReason,
        reviewId: row.reviewId,
        reviewer: row.reviewer,
        score: row.score,
        tenantId: row.tenantId
    });
}
function normalizeQualityRating(record) {
    return {
        auditId: requireString(record.auditId),
        channel: requireString(record.channel),
        clientId: nullableString(record.clientId),
        conversationId: requireString(record.conversationId),
        createdAt: requireString(record.createdAt),
        operator: requireString(record.operator),
        ratingId: requireString(record.ratingId),
        realtimeEventId: requireString(record.realtimeEventId),
        scale: normalizeRatingScale(record.scale),
        score: normalizeNullableScore(record.score),
        tenantId: requireString(record.tenantId),
        topic: nullableString(record.topic)
    };
}
function normalizeManualQaReview(record) {
    return {
        auditId: requireString(record.auditId),
        conversationId: requireString(record.conversationId),
        createdAt: requireString(record.createdAt),
        criteria: normalizeCriteria(record.criteria),
        overrideReason: nullableString(record.overrideReason),
        reviewId: requireString(record.reviewId),
        reviewer: requireString(record.reviewer),
        score: normalizeNullableScore(record.score),
        tenantId: requireString(record.tenantId)
    };
}
function toPrismaAiSuggestionDecisionCreateInput(record) {
    const normalized = normalizeAiSuggestionDecision(record);
    return { ...normalized, createdAt: new Date(normalized.createdAt) };
}
function toAiSuggestionDecisionRecord(row) {
    return normalizeAiSuggestionDecision({ ...row, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt) });
}
function normalizeAiSuggestionDecision(record) {
    if (!["accept", "edit", "reject"].includes(record.action))
        throw new Error("quality_suggestion_action_invalid");
    const rejected = record.action === "reject";
    return {
        action: record.action,
        conversationId: requireString(record.conversationId),
        createdAt: requireString(record.createdAt),
        decisionId: requireString(record.decisionId),
        finalText: rejected ? null : requireString(record.finalText ?? ""),
        finalTextHash: rejected ? null : requireString(record.finalTextHash ?? ""),
        operatorId: requireString(record.operatorId),
        operatorName: nullableString(record.operatorName),
        originalText: requireString(record.originalText),
        originalTextHash: requireString(record.originalTextHash),
        providerId: nullableString(record.providerId),
        providerResultId: nullableString(record.providerResultId),
        scoringAuditId: nullableString(record.scoringAuditId),
        suggestionId: requireString(record.suggestionId),
        tenantId: requireString(record.tenantId)
    };
}
function normalizeAiScoringAudit(record) {
    return {
        auditId: requireString(record.auditId),
        conversationId: requireString(record.conversationId),
        createdAt: requireString(record.createdAt),
        providerId: requireString(record.providerId),
        providerResultId: nullableString(record.providerResultId),
        queue: requireString(record.queue),
        requestFingerprint: nullableString(record.requestFingerprint ?? null),
        resultSnapshot: record.resultSnapshot && typeof record.resultSnapshot === "object" && !Array.isArray(record.resultSnapshot)
            ? clone(record.resultSnapshot)
            : null,
        score: normalizeNullableScore(record.score),
        status: record.status === "failed" || record.status === "pending" ? record.status : "ok",
        tenantId: requireString(record.tenantId),
        traceId: requireString(record.traceId),
        updatedAt: requireString(record.updatedAt ?? record.createdAt)
    };
}
function hasTenantScope(filter) {
    return typeof filter.tenantId === "string" && filter.tenantId.trim().length > 0;
}
function normalizeCriteria(criteria) {
    return Object.fromEntries(Object.entries(criteria)
        .filter(([key, value]) => key.trim() && typeof value === "number" && Number.isFinite(value))
        .map(([key, value]) => [key.trim(), value]));
}
function normalizeRatingScale(scale) {
    return scale === "CSI" || scale === "QA" ? scale : "CSAT";
}
function normalizeNullableScore(score) {
    return typeof score === "number" && Number.isFinite(score) ? score : null;
}
function requireString(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error("quality_rating_required_string");
    }
    return trimmed;
}
function nullableString(value) {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=quality.repository.js.map