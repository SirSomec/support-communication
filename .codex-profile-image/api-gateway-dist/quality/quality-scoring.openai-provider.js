import { createHash } from "node:crypto";
import { QUALITY_SCORING_PROVIDER_PORT_VERSION } from "./quality-scoring.provider.js";
export const OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID = "openai-compatible-quality-scoring";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 30;
const MAX_RETRIES_LIMIT = 3;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\w)(?:\+?\d[\d\s().-]{7,}\d)(?!\w)/g;
export function configureOpenAiCompatibleQualityProvider(source = process.env, options = {}) {
    if (!isEnabled(source.QUALITY_AI_ENABLED)) {
        return { configured: false, model: null, provider: null, providerId: null, reason: "disabled" };
    }
    const apiKey = source.QUALITY_AI_API_KEY?.trim();
    const baseUrl = source.QUALITY_AI_BASE_URL?.trim();
    const model = source.QUALITY_AI_MODEL?.trim();
    if (!apiKey)
        return { configured: false, model: model ?? null, provider: null, providerId: null, reason: "missing_api_key" };
    if (!baseUrl)
        return { configured: false, model: model ?? null, provider: null, providerId: null, reason: "missing_base_url" };
    if (!model)
        return { configured: false, model: null, provider: null, providerId: null, reason: "missing_model" };
    return {
        configured: true,
        model,
        provider: createOpenAiCompatibleQualityScoringProvider({
            apiKey,
            baseUrl,
            maxRetries: boundedInteger(source.QUALITY_AI_MAX_RETRIES, 1, 0, MAX_RETRIES_LIMIT),
            model,
            rateLimitPerMinute: boundedInteger(source.QUALITY_AI_RATE_LIMIT_PER_MINUTE, DEFAULT_RATE_LIMIT_PER_MINUTE, 1, 10_000),
            timeoutMs: boundedInteger(source.QUALITY_AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 100, 120_000)
        }, options),
        providerId: OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID,
        reason: null
    };
}
export function createOpenAiCompatibleQualityScoringProvider(config, options = {}) {
    const fetchImpl = options.fetch ?? fetch;
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    const timeoutMs = clamp(config.timeoutMs ?? DEFAULT_TIMEOUT_MS, 100, 120_000);
    const maxRetries = clamp(config.maxRetries ?? 1, 0, MAX_RETRIES_LIMIT);
    const rateLimiter = createFixedWindowRateLimiter(clamp(config.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE, 1, 10_000), now);
    const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    return {
        model: config.model,
        providerId: OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID,
        async score(request) {
            const startedAt = now();
            const requestFingerprint = fingerprintRequest(request);
            if (!rateLimiter.take()) {
                return failure("provider_rate_limited", "Quality AI rate limit reached.", true, requestFingerprint, config.model, now() - startedAt);
            }
            const body = createRequestBody(request, config.model);
            for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const response = await fetchImpl(endpoint, {
                        body: JSON.stringify(body),
                        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
                        method: "POST",
                        signal: controller.signal
                    });
                    const retryable = response.status === 429 || response.status >= 500;
                    if (!response.ok) {
                        if (retryable && attempt < maxRetries) {
                            await sleep(retryDelay(attempt));
                            continue;
                        }
                        return failure(response.status === 429 ? "provider_rate_limited" : retryable ? "provider_unavailable" : "provider_error", `Quality AI provider returned HTTP ${response.status}.`, retryable, requestFingerprint, config.model, now() - startedAt);
                    }
                    const payload = await response.json();
                    return parseProviderResponse(payload, requestFingerprint, config.model, now() - startedAt);
                }
                catch (error) {
                    const timedOut = error instanceof Error && error.name === "AbortError";
                    if (attempt < maxRetries) {
                        await sleep(retryDelay(attempt));
                        continue;
                    }
                    return failure(timedOut ? "provider_timeout" : "provider_unavailable", timedOut ? "Quality AI provider timed out." : "Quality AI provider is unavailable.", true, requestFingerprint, config.model, now() - startedAt);
                }
                finally {
                    clearTimeout(timer);
                }
            }
            return failure("provider_unavailable", "Quality AI provider is unavailable.", true, requestFingerprint, config.model, now() - startedAt);
        }
    };
}
export function redactQualityDraftText(text) {
    return text.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]").replace(PHONE_PATTERN, "[REDACTED_PHONE]");
}
function createRequestBody(request, model) {
    return {
        messages: [
            {
                role: "system",
                content: "Score a support draft from 0 to 100. Return JSON only with score, checks, reasons and repairActions. checks: [{id,label,detail,tone}] where tone is ok, warn or danger. repairActions: [{id,label,severity}] where severity is warn or danger. Do not reproduce personal data."
            },
            {
                role: "user",
                content: JSON.stringify({
                    attachmentStatuses: (request.draft.attachments ?? []).map((item) => item.status).filter(Boolean),
                    channel: request.channel,
                    locale: request.context?.locale ?? null,
                    mode: request.mode,
                    text: redactQualityDraftText(request.draft.text)
                })
            }
        ],
        model,
        response_format: { type: "json_object" },
        temperature: 0
    };
}
function parseProviderResponse(payload, requestFingerprint, configuredModel, latencyMs) {
    try {
        const choices = Array.isArray(payload.choices) ? payload.choices : [];
        const message = asRecord(asRecord(choices[0]).message);
        const content = typeof message.content === "string" ? message.content : "";
        const parsed = JSON.parse(content);
        const score = Number(parsed.score);
        if (!Number.isFinite(score) || score < 0 || score > 100)
            throw new Error("invalid_score");
        const checks = parseChecks(parsed.checks);
        const repairActions = parseRepairActions(parsed.repairActions);
        const reasons = Array.isArray(parsed.reasons) ? parsed.reasons.filter((item) => typeof item === "string").slice(0, 20) : [];
        const model = typeof payload.model === "string" && payload.model.trim() ? payload.model : configuredModel;
        const usage = asRecord(payload.usage);
        return {
            checks,
            explainability: { modelVersion: model, reasons },
            portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
            providerId: OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID,
            providerResultId: typeof payload.id === "string" && payload.id.trim() ? payload.id : `quality_openai_${requestFingerprint.slice(0, 24)}`,
            repairActions,
            score: Math.round(score),
            status: "ok",
            telemetry: {
                latencyMs,
                model,
                providerId: OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID,
                requestFingerprint,
                usage: {
                    inputTokens: nonNegativeInteger(usage.prompt_tokens),
                    outputTokens: nonNegativeInteger(usage.completion_tokens)
                }
            }
        };
    }
    catch {
        return failure("invalid_response", "Quality AI provider returned an invalid response.", false, requestFingerprint, configuredModel, latencyMs);
    }
}
function parseChecks(value) {
    if (!Array.isArray(value))
        throw new Error("invalid_checks");
    return value.slice(0, 20).map((item, index) => {
        const row = asRecord(item);
        const tone = row.tone === "danger" || row.tone === "warn" || row.tone === "ok" ? row.tone : null;
        if (!tone)
            throw new Error("invalid_check_tone");
        return { detail: limitedString(row.detail, 500), id: limitedString(row.id, 80, `check-${index + 1}`), label: limitedString(row.label, 200), tone };
    });
}
function parseRepairActions(value) {
    if (value === undefined)
        return [];
    if (!Array.isArray(value))
        throw new Error("invalid_repairs");
    return value.slice(0, 20).map((item, index) => {
        const row = asRecord(item);
        const severity = row.severity === "danger" ? "danger" : "warn";
        return { id: limitedString(row.id, 80, `repair-${index + 1}`), label: limitedString(row.label, 200), severity };
    });
}
function failure(code, message, retryable, requestFingerprint, model, latencyMs) {
    return {
        checks: [], error: { code, message, retryable }, explainability: { modelVersion: model, reasons: [code] },
        portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION, providerId: OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID,
        providerResultId: `quality_openai_failed_${requestFingerprint.slice(0, 24)}`, repairActions: [], score: null, status: "failed",
        telemetry: { latencyMs, model, providerId: OPENAI_COMPATIBLE_QUALITY_PROVIDER_ID, requestFingerprint }
    };
}
function createFixedWindowRateLimiter(limit, now) {
    let windowStartedAt = now();
    let count = 0;
    return { take() {
            const current = now();
            if (current - windowStartedAt >= 60_000) {
                windowStartedAt = current;
                count = 0;
            }
            if (count >= limit)
                return false;
            count += 1;
            return true;
        } };
}
function fingerprintRequest(request) {
    return createHash("sha256").update(JSON.stringify({ channel: request.channel, draft: request.draft, mode: request.mode, tenantId: request.tenantId })).digest("hex");
}
function retryDelay(attempt) { return Math.min(1_000, 100 * (2 ** attempt)); }
function asRecord(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function limitedString(value, max, fallback = "") { return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback; }
function nonNegativeInteger(value) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Math.trunc(value))); }
function boundedInteger(value, fallback, min, max) { const parsed = Number(value); return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback; }
function isEnabled(value) { return /^(1|true|yes|on)$/i.test(value?.trim() ?? ""); }
//# sourceMappingURL=quality-scoring.openai-provider.js.map