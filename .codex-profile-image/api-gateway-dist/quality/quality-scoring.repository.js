import { createHash } from "node:crypto";
import { InMemoryStore } from "@support-communication/database";
import { bucketQualityScoringAttachmentStatus, bucketQualityScoringTelemetryChannel, bucketQualityScoringTelemetryFingerprint, bucketQualityScoringTelemetryIdentifier } from "./quality-scoring.adapter.js";
import { QUALITY_SCORING_PROVIDER_PORT_VERSION } from "./quality-scoring.provider.js";
const allowedProviderErrorCodes = new Set([
    "invalid_response",
    "provider_error",
    "provider_rate_limited",
    "provider_timeout",
    "provider_unavailable"
]);
let defaultQualityScoringRepository = null;
export class QualityScoringRepository {
    store;
    constructor(store) {
        this.store = store;
    }
    static default() {
        return defaultQualityScoringRepository ?? QualityScoringRepository.inMemory();
    }
    static useDefault(repository) {
        defaultQualityScoringRepository = repository;
    }
    static clearDefault() {
        defaultQualityScoringRepository = null;
    }
    static inMemory(seed = seedQualityScoringState()) {
        return new QualityScoringRepository(new InMemoryStore(seed));
    }
    static prisma({ client }) {
        return new PrismaQualityScoringRepository(client);
    }
    readState() {
        return normalizeState(this.store.read());
    }
    listRequestTelemetry(filter = {}) {
        return clone(this.readState().requestTelemetry.filter((record) => !filter.tenantId || record.telemetry.tenantId === filter.tenantId));
    }
    listResponseTelemetry(filter = {}) {
        return clone(this.readState().responseTelemetry.filter((record) => (filter.status === undefined || record.telemetry.status === filter.status)
            && (!filter.tenantId || record.tenantId === filter.tenantId)
            && (filter.conversationId === undefined || record.telemetry.conversationId === filter.conversationId)));
    }
    listFailureEnvelopes(filter = {}) {
        return clone(this.readState().failureEnvelopes.filter((record) => (!filter.tenantId || record.tenantId === filter.tenantId)
            && (!filter.errorCode || record.envelope.error.code === filter.errorCode)));
    }
    saveRequestTelemetry(record) {
        const persisted = normalizeRequestTelemetryRecord(record);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.requestTelemetry.find((item) => item.telemetry.tenantId === persisted.telemetry.tenantId && item.telemetryId === persisted.telemetryId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                requestTelemetry: [...current.requestTelemetry, persisted]
            };
        });
        return clone(saved);
    }
    saveResponseTelemetry(record) {
        const persisted = normalizeResponseTelemetryRecord(record);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.responseTelemetry.find((item) => item.tenantId === persisted.tenantId && item.telemetryId === persisted.telemetryId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                responseTelemetry: [...current.responseTelemetry, persisted]
            };
        });
        return clone(saved);
    }
    saveFailureEnvelope(record) {
        const persisted = normalizeFailureEnvelopeRecord(record);
        let saved = persisted;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.failureEnvelopes.find((item) => item.tenantId === persisted.tenantId && item.failureId === persisted.failureId);
            if (existing) {
                saved = existing;
                return current;
            }
            return {
                ...current,
                failureEnvelopes: [...current.failureEnvelopes, persisted]
            };
        });
        return clone(saved);
    }
}
/**
 * Postgres-backed telemetry sink. Reuses the exact same redaction/normalization pipeline as the
 * in-memory store, then persists the sanitized record. Identity keys are first-write-wins.
 */
export class PrismaQualityScoringRepository {
    client;
    constructor(client) {
        this.client = client;
    }
    async listRequestTelemetry(filter = {}) {
        const rows = await this.client.qualityScoringRequestTelemetry.findMany({
            orderBy: [{ recordedAt: "asc" }],
            where: filter.tenantId ? { tenantId: filter.tenantId } : {}
        });
        return rows.map(toRequestTelemetryRecord);
    }
    async listResponseTelemetry(filter = {}) {
        const rows = await this.client.qualityScoringResponseTelemetry.findMany({
            orderBy: [{ recordedAt: "asc" }],
            where: {
                ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
                ...(filter.status === undefined ? {} : { status: filter.status }),
                ...(filter.conversationId === undefined ? {} : { conversationId: filter.conversationId })
            }
        });
        return rows.map(toResponseTelemetryRecord);
    }
    async listFailureEnvelopes(filter = {}) {
        const rows = await this.client.qualityScoringFailureEnvelope.findMany({
            orderBy: [{ recordedAt: "asc" }],
            where: {
                ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
                ...(filter.errorCode ? { errorCode: filter.errorCode } : {})
            }
        });
        return rows.map(toFailureEnvelopeRecord);
    }
    async saveRequestTelemetry(record) {
        const persisted = normalizeRequestTelemetryRecord(record);
        const where = {
            tenantId_telemetryId: { telemetryId: persisted.telemetryId, tenantId: persisted.telemetry.tenantId }
        };
        const existing = await this.client.qualityScoringRequestTelemetry.findUnique({ where });
        if (existing) {
            return toRequestTelemetryRecord(existing);
        }
        let row;
        try {
            row = await this.client.qualityScoringRequestTelemetry.create({
                data: {
                    recordedAt: new Date(persisted.recordedAt),
                    telemetry: clone(persisted.telemetry),
                    telemetryId: persisted.telemetryId,
                    tenantId: persisted.telemetry.tenantId
                }
            });
        }
        catch (error) {
            const concurrent = await this.client.qualityScoringRequestTelemetry.findUnique({ where });
            if (!concurrent)
                throw error;
            row = concurrent;
        }
        return toRequestTelemetryRecord(row);
    }
    async saveResponseTelemetry(record) {
        const persisted = normalizeResponseTelemetryRecord(record);
        const where = {
            tenantId_telemetryId: { telemetryId: persisted.telemetryId, tenantId: persisted.tenantId }
        };
        const existing = await this.client.qualityScoringResponseTelemetry.findUnique({ where });
        if (existing) {
            return toResponseTelemetryRecord(existing);
        }
        let row;
        try {
            row = await this.client.qualityScoringResponseTelemetry.create({
                data: {
                    conversationId: persisted.telemetry.conversationId,
                    recordedAt: new Date(persisted.recordedAt),
                    status: persisted.telemetry.status,
                    telemetry: clone(persisted.telemetry),
                    telemetryId: persisted.telemetryId,
                    tenantId: persisted.tenantId
                }
            });
        }
        catch (error) {
            const concurrent = await this.client.qualityScoringResponseTelemetry.findUnique({ where });
            if (!concurrent)
                throw error;
            row = concurrent;
        }
        return toResponseTelemetryRecord(row);
    }
    async saveFailureEnvelope(record) {
        const persisted = normalizeFailureEnvelopeRecord(record);
        const where = {
            tenantId_failureId: { failureId: persisted.failureId, tenantId: persisted.tenantId }
        };
        const existing = await this.client.qualityScoringFailureEnvelope.findUnique({ where });
        if (existing) {
            return toFailureEnvelopeRecord(existing);
        }
        let row;
        try {
            row = await this.client.qualityScoringFailureEnvelope.create({
                data: {
                    envelope: clone(persisted.envelope),
                    errorCode: persisted.envelope.error.code,
                    failureId: persisted.failureId,
                    recordedAt: new Date(persisted.recordedAt),
                    tenantId: persisted.tenantId
                }
            });
        }
        catch (error) {
            const concurrent = await this.client.qualityScoringFailureEnvelope.findUnique({ where });
            if (!concurrent)
                throw error;
            row = concurrent;
        }
        return toFailureEnvelopeRecord(row);
    }
}
function toRequestTelemetryRecord(row) {
    return normalizeRequestTelemetryRecord({
        recordedAt: toIsoString(row.recordedAt),
        telemetry: row.telemetry,
        telemetryId: row.telemetryId
    }, { preserveInternalKeys: true });
}
function toResponseTelemetryRecord(row) {
    return normalizeResponseTelemetryRecord({
        recordedAt: toIsoString(row.recordedAt),
        telemetry: row.telemetry,
        telemetryId: row.telemetryId,
        tenantId: row.tenantId
    }, { preserveInternalKeys: true });
}
function toFailureEnvelopeRecord(row) {
    return normalizeFailureEnvelopeRecord({
        envelope: row.envelope,
        failureId: row.failureId,
        recordedAt: toIsoString(row.recordedAt),
        tenantId: row.tenantId
    }, { preserveInternalKeys: true });
}
function toIsoString(value) {
    return value instanceof Date ? value.toISOString() : String(value);
}
function seedQualityScoringState() {
    return {
        failureEnvelopes: [],
        requestTelemetry: [],
        responseTelemetry: []
    };
}
function normalizeState(state) {
    return {
        failureEnvelopes: (state.failureEnvelopes ?? []).map((record) => normalizeFailureEnvelopeRecord(record, { preserveInternalKeys: true })),
        requestTelemetry: (state.requestTelemetry ?? []).map((record) => normalizeRequestTelemetryRecord(record, { preserveInternalKeys: true })),
        responseTelemetry: (state.responseTelemetry ?? []).map((record) => normalizeResponseTelemetryRecord(record, { preserveInternalKeys: true }))
    };
}
function normalizeRequestTelemetryRecord(record, options = {}) {
    return {
        recordedAt: record.recordedAt,
        telemetry: normalizeRequestTelemetry(record.telemetry, options),
        telemetryId: bucketRequestTelemetryId(record.telemetryId, options)
    };
}
function normalizeResponseTelemetryRecord(record, options = {}) {
    return {
        recordedAt: record.recordedAt,
        tenantId: bucketTenantId(requireTenantId(record.tenantId), options),
        telemetry: normalizeResponseTelemetry(record.telemetry),
        telemetryId: bucketResponseTelemetryId(record.telemetryId, options)
    };
}
function normalizeFailureEnvelopeRecord(record, options = {}) {
    return {
        envelope: normalizeFailureEnvelope(record.envelope),
        failureId: bucketFailureEnvelopeId(record.failureId, options),
        recordedAt: record.recordedAt,
        tenantId: bucketTenantId(record.tenantId, options)
    };
}
function bucketRequestTelemetryId(telemetryId, options = {}) {
    if (options.preserveInternalKeys && /^quality-request-telemetry-redacted:[a-f0-9]{16}$/.test(telemetryId)) {
        return telemetryId;
    }
    if (containsSensitiveMarker(telemetryId)) {
        return `quality-request-telemetry-redacted:${hashUnsafeIdentifier(telemetryId)}`;
    }
    return /^quality-request-telemetry-(?!redacted-)[a-z0-9-]+$/.test(telemetryId)
        ? telemetryId
        : `quality-request-telemetry-redacted:${hashUnsafeIdentifier(telemetryId)}`;
}
function bucketResponseTelemetryId(telemetryId, options = {}) {
    if (options.preserveInternalKeys && /^quality-response-telemetry-redacted:[a-f0-9]{16}$/.test(telemetryId)) {
        return telemetryId;
    }
    if (/bearer|token|secret|password|credential|api[_-]?key|sk-/i.test(telemetryId)) {
        return `quality-response-telemetry-redacted:${hashUnsafeIdentifier(telemetryId)}`;
    }
    return /^quality-response-telemetry-(?!redacted-)[a-z0-9-]+$/.test(telemetryId)
        ? telemetryId
        : `quality-response-telemetry-redacted:${hashUnsafeIdentifier(telemetryId)}`;
}
function bucketFailureEnvelopeId(failureId, options = {}) {
    if (options.preserveInternalKeys && /^quality-failure-envelope-redacted:[a-f0-9]{16}$/.test(failureId)) {
        return failureId;
    }
    if (containsSensitiveMarker(failureId)) {
        return `quality-failure-envelope-redacted:${hashUnsafeIdentifier(failureId)}`;
    }
    return /^quality-failure-envelope-(?!redacted-)[a-z0-9-]+$/.test(failureId)
        ? failureId
        : `quality-failure-envelope-redacted:${hashUnsafeIdentifier(failureId)}`;
}
function bucketTenantId(tenantId, options = {}) {
    if (options.preserveInternalKeys && /^tenant-redacted:[a-f0-9]{16}$/.test(tenantId)) {
        return tenantId;
    }
    if (/^tenant-(?!redacted(?:[:-]|$))[a-zA-Z0-9_.:-]+$/.test(tenantId) && !containsSensitiveMarker(tenantId)) {
        return tenantId;
    }
    return `tenant-redacted:${hashUnsafeIdentifier(tenantId)}`;
}
function requireTenantId(tenantId) {
    const normalized = tenantId?.trim();
    if (!normalized) {
        throw new Error("quality_scoring_tenant_required");
    }
    return normalized;
}
function normalizeRequestTelemetry(telemetry, options = {}) {
    return {
        channel: bucketQualityScoringTelemetryChannel(telemetry.channel),
        context: {
            hasLocale: Boolean(telemetry.context.hasLocale),
            hasOperatorId: Boolean(telemetry.context.hasOperatorId),
            suggestionCount: telemetry.context.suggestionCount
        },
        conversationId: bucketQualityScoringTelemetryIdentifier(telemetry.conversationId),
        direction: "request",
        draft: {
            attachmentCount: telemetry.draft.attachmentCount,
            attachmentStatuses: telemetry.draft.attachmentStatuses.map(bucketQualityScoringAttachmentStatus),
            textLength: telemetry.draft.textLength
        },
        mode: telemetry.mode,
        providerPortVersion: telemetry.providerPortVersion,
        requestFingerprint: bucketQualityScoringTelemetryFingerprint(telemetry.requestFingerprint),
        requestedAt: telemetry.requestedAt,
        tenantId: bucketTenantId(telemetry.tenantId, options),
        traceId: bucketQualityScoringTelemetryIdentifier(telemetry.traceId)
    };
}
function normalizeResponseTelemetry(telemetry) {
    const normalized = {
        checks: {
            danger: safeCount(telemetry.checks.danger),
            ok: safeCount(telemetry.checks.ok),
            total: safeCount(telemetry.checks.total),
            warn: safeCount(telemetry.checks.warn)
        },
        conversationId: telemetry.conversationId === null
            ? null
            : bucketQualityScoringTelemetryIdentifier(telemetry.conversationId),
        direction: "response",
        provider: {
            model: bucketProviderModel(telemetry.provider.model),
            providerId: bucketProviderId(telemetry.provider.providerId),
            providerResultStored: Boolean(telemetry.provider.providerResultStored)
        },
        providerPortVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
        repairActionCount: safeCount(telemetry.repairActionCount),
        responseFingerprint: bucketQualityScoringTelemetryFingerprint(telemetry.responseFingerprint),
        score: typeof telemetry.score === "number" && Number.isFinite(telemetry.score) ? telemetry.score : null,
        status: telemetry.status === "failed" ? "failed" : "ok",
        usage: normalizeResponseUsage(telemetry.usage)
    };
    if (telemetry.error) {
        normalized.error = {
            code: bucketProviderErrorCode(telemetry.error.code),
            retryable: Boolean(telemetry.error.retryable)
        };
    }
    return normalized;
}
function normalizeFailureEnvelope(envelope) {
    return {
        conversationId: envelope.conversationId === null
            ? null
            : bucketQualityScoringTelemetryIdentifier(envelope.conversationId),
        error: {
            code: bucketProviderErrorCode(envelope.error.code),
            retryable: Boolean(envelope.error.retryable)
        },
        provider: {
            model: bucketProviderModel(envelope.provider.model),
            providerId: bucketProviderId(envelope.provider.providerId),
            providerResultStored: Boolean(envelope.provider.providerResultStored)
        },
        providerPortVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
        responseFingerprint: bucketQualityScoringTelemetryFingerprint(envelope.responseFingerprint),
        status: "failed"
    };
}
function normalizeResponseUsage(usage) {
    if (!usage) {
        return undefined;
    }
    const normalized = {};
    if (typeof usage.inputTokens === "number" && Number.isFinite(usage.inputTokens)) {
        normalized.inputTokens = usage.inputTokens;
    }
    if (typeof usage.outputTokens === "number" && Number.isFinite(usage.outputTokens)) {
        normalized.outputTokens = usage.outputTokens;
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
}
function bucketProviderId(providerId) {
    if (containsSensitiveMarker(providerId)) {
        return "redacted";
    }
    return /^[a-z0-9-]+$/.test(providerId) ? providerId : "redacted";
}
function bucketProviderModel(model) {
    if (containsSensitiveMarker(model)) {
        return "redacted";
    }
    return /^[a-z0-9-]+\/v\d+$/.test(model) ? model : "redacted";
}
function bucketProviderErrorCode(code) {
    if (containsSensitiveMarker(code)) {
        return "redacted";
    }
    return allowedProviderErrorCodes.has(code) ? code : "redacted";
}
function containsSensitiveMarker(value) {
    return /bearer|token|secret|password|credential|api[_-]?key|sk-/i.test(value);
}
function safeCount(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}
function hashUnsafeIdentifier(value) {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
function clone(value) {
    if (value === undefined) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=quality-scoring.repository.js.map