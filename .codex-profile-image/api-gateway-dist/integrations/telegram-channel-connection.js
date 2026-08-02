import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createEnvelope } from "@support-communication/envelope";
const INTEGRATION_SERVICE = "integrationService";
export function maskTelegramBotToken(rawToken) {
    const token = String(rawToken ?? "").trim();
    const separatorIndex = token.indexOf(":");
    if (separatorIndex <= 0) {
        return "****";
    }
    return `${token.slice(0, separatorIndex)}:****`;
}
export function createTelegramWebhookSecret() {
    return `tg_wh_${randomUUID().replace(/-/g, "")}`;
}
export function buildTelegramWebhookUrl(publicWebhookBaseUrl) {
    const base = String(publicWebhookBaseUrl ?? "").trim().replace(/\/+$/, "");
    return `${base}/api/v1/webhooks/telegram`;
}
export function toTelegramConnectionPublicView(record, publicWebhookBaseUrl) {
    const webhookUrl = buildTelegramWebhookUrl(publicWebhookBaseUrl);
    if (!record || record.status === "disabled") {
        return {
            botId: null,
            botUsername: null,
            createdAt: record?.createdAt ?? "",
            status: record?.status === "disabled" ? "disabled" : "not_configured",
            tenantId: record?.tenantId ?? "",
            tokenConfigured: false,
            tokenPreview: record?.tokenPreview ?? null,
            updatedAt: record?.updatedAt ?? null,
            webhookSecret: record?.status === "disabled" ? null : record?.webhookSecret ?? null,
            webhookUrl
        };
    }
    return {
        botId: record.botId,
        botUsername: record.botUsername,
        createdAt: record.createdAt,
        status: "active",
        tenantId: record.tenantId,
        tokenConfigured: true,
        tokenPreview: record.tokenPreview,
        updatedAt: record.updatedAt,
        webhookSecret: record.webhookSecret,
        webhookUrl
    };
}
export function verifyTelegramWebhookSecretToken(provided, expected) {
    const actual = String(provided ?? "");
    if (!expected || actual.length !== expected.length) {
        return false;
    }
    return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
export function resolveTelegramTenantByWebhookSecret(connections, providedSecret) {
    const secret = String(providedSecret ?? "").trim();
    if (!secret) {
        return undefined;
    }
    return connections.find((connection) => connection.status === "active" && verifyTelegramWebhookSecretToken(secret, connection.webhookSecret));
}
export async function validateTelegramBotToken(botToken, fetcher, apiBaseUrl = "https://api.telegram.org", timeoutMs = 10_000) {
    const token = String(botToken ?? "").trim();
    if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
        throw new Error("telegram_bot_token_invalid");
    }
    const endpoint = `${apiBaseUrl.replace(/\/+$/, "")}/bot${token}/getMe`;
    const signal = AbortSignal.timeout(Math.max(1, timeoutMs));
    let response;
    let payload;
    try {
        response = await fetcher(endpoint, { signal });
        payload = await response.json();
    }
    catch {
        throw new Error(signal.aborted
            ? "telegram_bot_token_validation_timeout"
            : "telegram_bot_token_validation_failed");
    }
    if (!response.ok || !payload.ok || !payload.result?.id) {
        throw new Error("telegram_bot_token_rejected");
    }
    return {
        botId: String(payload.result.id),
        botUsername: payload.result.username ? String(payload.result.username) : null
    };
}
export async function saveTelegramConnectionRecord(input, existing) {
    const tenantId = String(input.tenantId ?? "").trim();
    const channelConnectionId = String(input.channelConnectionId ?? "").trim();
    const botToken = String(input.botToken ?? "").trim();
    if (!tenantId || !channelConnectionId || !botToken) {
        throw new Error("telegram_connection_fields_required");
    }
    const fetcher = input.fetcher ?? defaultTelegramHttpFetch;
    const validated = await validateTelegramBotToken(botToken, fetcher);
    const now = (input.now ?? new Date()).toISOString();
    return {
        channelConnectionId,
        botId: validated.botId,
        botToken,
        botUsername: validated.botUsername,
        pollingOffset: existing?.pollingOffset ?? 0,
        createdAt: existing?.createdAt ?? now,
        status: "active",
        tenantId,
        tokenPreview: maskTelegramBotToken(botToken),
        updatedAt: now,
        webhookSecret: existing?.webhookSecret ?? createTelegramWebhookSecret()
    };
}
export function disableTelegramConnectionRecord(existing, now = new Date()) {
    return {
        ...existing,
        botToken: "",
        status: "disabled",
        tokenPreview: existing.tokenPreview,
        updatedAt: now.toISOString()
    };
}
export function findActiveTelegramBotToken(connections, tenantId, channelConnectionId) {
    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedConnectionId = String(channelConnectionId ?? "").trim();
    const candidates = connections.filter((item) => item.tenantId === normalizedTenantId && item.status === "active");
    const connection = normalizedConnectionId
        ? candidates.find((item) => item.channelConnectionId === normalizedConnectionId)
        : candidates.length === 1 ? candidates[0] : undefined;
    const token = String(connection?.botToken ?? "").trim();
    return token || undefined;
}
export function telegramConnectionFingerprint(tenantId, botId) {
    return createHash("sha256").update(`${tenantId}:${botId ?? "unknown"}`).digest("hex").slice(0, 16);
}
export function telegramConnectionEnvelope(operation, data, status = "ok") {
    return createEnvelope({
        service: INTEGRATION_SERVICE,
        operation,
        status,
        meta: {
            channel: "telegram",
            source: "tenant-settings"
        },
        data
    });
}
async function defaultTelegramHttpFetch(input, init) {
    return fetch(input, init);
}
//# sourceMappingURL=telegram-channel-connection.js.map