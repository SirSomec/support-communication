import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";

const INTEGRATION_SERVICE = "integrationService";

export interface TelegramConnectionRecord {
  channelConnectionId: string;
  botId: string | null;
  botToken: string;
  botUsername: string | null;
  pollingOffset?: number;
  createdAt: string;
  status: "active" | "disabled";
  tenantId: string;
  tokenPreview: string;
  updatedAt: string;
  webhookSecret: string;
}

export interface TelegramConnectionPublicView {
  botId: string | null;
  botUsername: string | null;
  createdAt: string;
  status: "active" | "disabled" | "not_configured";
  tenantId: string;
  tokenConfigured: boolean;
  tokenPreview: string | null;
  updatedAt: string | null;
  webhookSecret: string | null;
  webhookUrl: string;
}

export interface TelegramGetMeResponse {
  ok: boolean;
  result?: {
    id?: number;
    username?: string;
  };
}

export interface SaveTelegramConnectionInput {
  botToken: string;
  channelConnectionId: string;
  fetcher?: TelegramHttpFetch;
  now?: Date;
  publicWebhookBaseUrl: string;
  tenantId: string;
}

export interface TelegramHttpFetch {
  (input: string, init?: { signal?: AbortSignal }): Promise<{ json(): Promise<unknown>; ok: boolean; status: number }>;
}

export function maskTelegramBotToken(rawToken: string): string {
  const token = String(rawToken ?? "").trim();
  const separatorIndex = token.indexOf(":");
  if (separatorIndex <= 0) {
    return "****";
  }

  return `${token.slice(0, separatorIndex)}:****`;
}

export function createTelegramWebhookSecret(): string {
  return `tg_wh_${randomUUID().replace(/-/g, "")}`;
}

export function buildTelegramWebhookUrl(publicWebhookBaseUrl: string): string {
  const base = String(publicWebhookBaseUrl ?? "").trim().replace(/\/+$/, "");
  return `${base}/api/v1/webhooks/telegram`;
}

export function toTelegramConnectionPublicView(
  record: TelegramConnectionRecord | undefined,
  publicWebhookBaseUrl: string
): TelegramConnectionPublicView {
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

export function verifyTelegramWebhookSecretToken(provided: string | undefined, expected: string): boolean {
  const actual = String(provided ?? "");
  if (!expected || actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function resolveTelegramTenantByWebhookSecret(
  connections: TelegramConnectionRecord[],
  providedSecret: string | undefined
): TelegramConnectionRecord | undefined {
  const secret = String(providedSecret ?? "").trim();
  if (!secret) {
    return undefined;
  }

  return connections.find((connection) =>
    connection.status === "active" && verifyTelegramWebhookSecretToken(secret, connection.webhookSecret)
  );
}

export async function validateTelegramBotToken(
  botToken: string,
  fetcher: TelegramHttpFetch,
  apiBaseUrl = "https://api.telegram.org",
  timeoutMs = 10_000
): Promise<{ botId: string; botUsername: string | null }> {
  const token = String(botToken ?? "").trim();
  if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("telegram_bot_token_invalid");
  }

  const endpoint = `${apiBaseUrl.replace(/\/+$/, "")}/bot${token}/getMe`;
  const signal = AbortSignal.timeout(Math.max(1, timeoutMs));
  let response: Awaited<ReturnType<TelegramHttpFetch>>;
  let payload: TelegramGetMeResponse;
  try {
    response = await fetcher(endpoint, { signal });
    payload = await response.json() as TelegramGetMeResponse;
  } catch {
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

export async function saveTelegramConnectionRecord(
  input: SaveTelegramConnectionInput,
  existing?: TelegramConnectionRecord
): Promise<TelegramConnectionRecord> {
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

export function disableTelegramConnectionRecord(
  existing: TelegramConnectionRecord,
  now: Date = new Date()
): TelegramConnectionRecord {
  return {
    ...existing,
    botToken: "",
    status: "disabled",
    tokenPreview: existing.tokenPreview,
    updatedAt: now.toISOString()
  };
}

export function findActiveTelegramBotToken(
  connections: TelegramConnectionRecord[],
  tenantId: string,
  channelConnectionId?: string
): string | undefined {
  const normalizedTenantId = String(tenantId ?? "").trim();
  const normalizedConnectionId = String(channelConnectionId ?? "").trim();
  const candidates = connections.filter((item) => item.tenantId === normalizedTenantId && item.status === "active");
  const connection = normalizedConnectionId
    ? candidates.find((item) => item.channelConnectionId === normalizedConnectionId)
    : candidates.length === 1 ? candidates[0] : undefined;
  const token = String(connection?.botToken ?? "").trim();
  return token || undefined;
}

export function telegramConnectionFingerprint(tenantId: string, botId: string | null): string {
  return createHash("sha256").update(`${tenantId}:${botId ?? "unknown"}`).digest("hex").slice(0, 16);
}

export function telegramConnectionEnvelope(
  operation: string,
  data: Record<string, unknown>,
  status: BackendEnvelope<Record<string, unknown>>["status"] = "ok"
): BackendEnvelope<Record<string, unknown>> {
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

async function defaultTelegramHttpFetch(input: string, init?: { signal?: AbortSignal }) {
  return fetch(input, init);
}
