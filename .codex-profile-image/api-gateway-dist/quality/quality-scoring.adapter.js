import { createHash } from "node:crypto";
import { QUALITY_SCORING_PROVIDER_PORT_VERSION, normalizeQualityScoringProviderResult } from "./quality-scoring.provider.js";
const DEFAULT_CHANNEL = "SDK";
const DEFAULT_CONVERSATION_ID = "draft";
const allowedTelemetryChannels = new Set(["Email", "MAX", "SDK", "Telegram", "VK"]);
export function createQualityScoringProviderRequest(payload, context) {
    return {
        channel: stringOrDefault(payload.channel, DEFAULT_CHANNEL),
        context: createProviderContext(payload),
        conversationId: stringOrDefault(payload.conversationId, DEFAULT_CONVERSATION_ID),
        draft: {
            attachments: mapAttachments(payload.attachments),
            text: stringOrDefault(payload.text, "")
        },
        mode: stringOrUndefined(payload.mode) === "internal" ? "internal" : "reply",
        portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
        requestedAt: context.requestedAt,
        tenantId: requiredString(payload.tenantId, "quality_scoring_tenant_required"),
        traceId: context.traceId
    };
}
export function createQualityScoringResponseData(result, context) {
    const normalized = normalizeQualityScoringProviderResult(result);
    const response = {
        checks: clone(normalized.checks),
        conversationId: context.conversationId,
        explainability: clone(normalized.explainability),
        provider: {
            providerId: normalized.providerId,
            providerResultId: normalized.providerResultId
        },
        repairActions: clone(normalized.repairActions),
        score: normalized.score,
        status: normalized.status,
        telemetry: clone(normalized.telemetry)
    };
    if (normalized.status === "failed") {
        response.error = clone(normalized.error);
    }
    return response;
}
export function createQualityScoringRequestTelemetry(request) {
    const telemetry = {
        channel: bucketQualityScoringTelemetryChannel(request.channel),
        context: {
            hasLocale: Boolean(request.context?.locale),
            hasOperatorId: Boolean(request.context?.operatorId),
            suggestionCount: request.context?.suggestions?.length ?? 0
        },
        conversationId: bucketQualityScoringTelemetryIdentifier(request.conversationId),
        direction: "request",
        draft: {
            attachmentCount: request.draft.attachments?.length ?? 0,
            attachmentStatuses: (request.draft.attachments ?? [])
                .map((attachment) => attachment.status)
                .filter((status) => Boolean(status)),
            textLength: request.draft.text.length
        },
        mode: request.mode,
        providerPortVersion: request.portVersion,
        requestedAt: request.requestedAt,
        tenantId: bucketQualityScoringTelemetryIdentifier(request.tenantId),
        traceId: bucketQualityScoringTelemetryIdentifier(request.traceId)
    };
    telemetry.draft.attachmentStatuses = telemetry.draft.attachmentStatuses.map(bucketQualityScoringAttachmentStatus);
    return {
        ...telemetry,
        requestFingerprint: fingerprintQualityScoringRequestTelemetry(telemetry)
    };
}
export function createQualityScoringResponseTelemetry(result, context) {
    const normalized = normalizeQualityScoringProviderResult(result);
    const telemetry = {
        checks: countChecks(normalized.checks),
        conversationId: context.conversationId ? bucketQualityScoringTelemetryIdentifier(context.conversationId) : null,
        direction: "response",
        provider: {
            model: normalized.telemetry.model,
            providerId: normalized.providerId,
            providerResultStored: Boolean(normalized.providerResultId)
        },
        providerPortVersion: normalized.portVersion,
        repairActionCount: normalized.repairActions.length,
        score: normalized.score,
        status: normalized.status,
        usage: normalized.telemetry.usage ? clone(normalized.telemetry.usage) : undefined
    };
    if (normalized.status === "failed") {
        telemetry.error = {
            code: normalized.error.code,
            retryable: normalized.error.retryable
        };
    }
    return {
        ...telemetry,
        responseFingerprint: fingerprintQualityScoringResponseTelemetry(telemetry)
    };
}
function createProviderContext(payload) {
    const context = {};
    const locale = stringOrUndefined(payload.locale);
    const operatorId = stringOrUndefined(payload.operatorId);
    const suggestions = mapSuggestions(payload.suggestions);
    if (locale) {
        context.locale = locale;
    }
    if (operatorId) {
        context.operatorId = operatorId;
    }
    if (suggestions.length) {
        context.suggestions = suggestions;
    }
    return context;
}
function mapAttachments(attachments) {
    return (attachments ?? [])
        .filter((attachment) => attachment && typeof attachment === "object" && !Array.isArray(attachment))
        .map((attachment) => {
        const mapped = {};
        const id = stringOrUndefined(attachment.id);
        const status = stringOrUndefined(attachment.status);
        if (id) {
            mapped.id = id;
        }
        if (status) {
            mapped.status = status;
        }
        return mapped;
    })
        .filter((attachment) => Object.keys(attachment).length > 0);
}
function mapSuggestions(suggestions) {
    if (!Array.isArray(suggestions)) {
        return [];
    }
    return suggestions
        .filter((suggestion) => suggestion && typeof suggestion === "object" && !Array.isArray(suggestion))
        .map((suggestion) => {
        const source = suggestion;
        const mapped = {};
        const id = stringOrUndefined(source.id);
        const label = stringOrUndefined(source.label);
        if (id) {
            mapped.id = id;
        }
        if (label) {
            mapped.label = label;
        }
        return mapped;
    })
        .filter((suggestion) => Object.keys(suggestion).length > 0);
}
function stringOrDefault(value, fallback) {
    return stringOrUndefined(value) ?? fallback;
}
function requiredString(value, code) {
    const normalized = stringOrUndefined(value);
    if (!normalized) {
        throw new Error(code);
    }
    return normalized;
}
function stringOrUndefined(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}
export function bucketQualityScoringAttachmentStatus(status) {
    return ["blocked", "failed", "pending", "ready", "uploading"].includes(status) ? status : "other";
}
export function bucketQualityScoringTelemetryChannel(channel) {
    return allowedTelemetryChannels.has(channel) ? channel : "other";
}
export function bucketQualityScoringTelemetryIdentifier(value) {
    if (/bearer|token|secret|password|credential|api[_-]?key|sk-/i.test(value)) {
        return "redacted";
    }
    if ((value.match(/\./g) ?? []).length >= 2) {
        return "redacted";
    }
    if (/[a-zA-Z0-9_-]{24,}/.test(value)) {
        return "redacted";
    }
    return /^(conv-|draft$|req_|tenant-|test-|trc_)[a-zA-Z0-9_.:-]*$/.test(value) ? value : "redacted";
}
export function bucketQualityScoringTelemetryFingerprint(value) {
    return /^[a-f0-9]{64}$/.test(value) ? value : "redacted";
}
function countChecks(checks) {
    return checks.reduce((counts, check) => ({
        ...counts,
        [check.tone]: counts[check.tone] + 1,
        total: counts.total + 1
    }), { danger: 0, ok: 0, total: 0, warn: 0 });
}
function fingerprintQualityScoringRequestTelemetry(telemetry) {
    return createHash("sha256")
        .update(stableStringify({
        channel: telemetry.channel,
        context: telemetry.context,
        direction: telemetry.direction,
        draft: telemetry.draft,
        mode: telemetry.mode,
        providerPortVersion: telemetry.providerPortVersion
    }))
        .digest("hex");
}
function fingerprintQualityScoringResponseTelemetry(telemetry) {
    return createHash("sha256")
        .update(stableStringify({
        checks: telemetry.checks,
        direction: telemetry.direction,
        error: telemetry.error ?? null,
        provider: {
            model: telemetry.provider.model,
            providerId: telemetry.provider.providerId
        },
        providerPortVersion: telemetry.providerPortVersion,
        repairActionCount: telemetry.repairActionCount,
        score: telemetry.score,
        status: telemetry.status,
        usage: telemetry.usage ?? null
    }))
        .digest("hex");
}
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=quality-scoring.adapter.js.map