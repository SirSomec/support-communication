import { createHash } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { TelegramConnectionStoredRecord } from "./integration.repository.js";
import { resolveTelegramTenantByWebhookSecret } from "./telegram-channel-connection.js";

const INTEGRATION_SERVICE = "integrationService";

export interface TelegramWebhookConfig {
  enabled: boolean;
  legacySecret?: string;
  legacyTenantId?: string;
}

export interface TelegramWebhookRouteInput {
  body: Record<string, unknown>;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "saveConversation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent">;
  headers: Record<string, string | undefined>;
  integrationRepository: TelegramConnectionReader;
  now?: Date;
}

export interface TelegramConnectionReader {
  listTelegramConnections(): TelegramConnectionStoredRecord[];
  listTelegramConnectionsAsync?(): Promise<TelegramConnectionStoredRecord[]>;
}

export function loadTelegramWebhookConfig(
  env: Record<string, string | undefined> = process.env
): TelegramWebhookConfig {
  const ingressMode = String(env.TELEGRAM_INGRESS_MODE ?? "").trim().toLowerCase();
  return {
    enabled: ingressMode ? ingressMode === "webhook" : env.TELEGRAM_WEBHOOK_ENABLED === "true",
    legacySecret: String(env.TELEGRAM_WEBHOOK_SECRET ?? "").trim() || undefined,
    legacyTenantId: String(env.PILOT_TELEGRAM_TENANT_ID ?? env.TELEGRAM_WEBHOOK_TENANT_ID ?? "").trim() || undefined
  };
}

export async function handleTelegramWebhookFromRoute(
  input: TelegramWebhookRouteInput,
  config: TelegramWebhookConfig = loadTelegramWebhookConfig()
): Promise<BackendEnvelope<Record<string, unknown>>> {
  if (!config.enabled) {
    return deniedEnvelope("telegram_webhook_disabled", "Telegram webhook ingress is disabled.");
  }

  const providedSecret = input.headers["x-telegram-bot-api-secret-token"];
  const telegramConnections = input.integrationRepository.listTelegramConnectionsAsync
    ? await input.integrationRepository.listTelegramConnectionsAsync()
    : input.integrationRepository.listTelegramConnections();
  const tenantConnection = resolveTelegramTenantByWebhookSecret(
    telegramConnections,
    providedSecret
  );
  const tenantId = tenantConnection?.tenantId
    ?? resolveLegacyTenantId(config, providedSecret);

  if (!tenantId) {
    return deniedEnvelope("telegram_webhook_secret_invalid", "Telegram webhook secret token is invalid.");
  }

  const parsed = parseTelegramUpdate(input.body);
  if (!parsed) {
    return deniedEnvelope("telegram_update_unsupported", "Telegram update does not contain a supported text message.");
  }

  const conversation = await resolveOrCreateTelegramConversation({
    botId: tenantConnection?.botId ?? undefined,
    chatId: parsed.chatId,
    conversationRepository: input.conversationRepository,
    displayName: parsed.displayName,
    tenantId,
    username: parsed.username
  });

  if (!conversation) {
    return deniedEnvelope("telegram_conversation_create_failed", "Telegram conversation could not be created.");
  }

  const normalized = await input.conversationService.normalizeInboundEvent("telegram", {
    conversationId: conversation.id,
    eventId: telegramTenantEventId(tenantId, tenantConnection?.botId ?? undefined, parsed.eventId),
    text: parsed.text
  });

  return createEnvelope({
    service: INTEGRATION_SERVICE,
    operation: "receiveTelegramWebhook",
    status: normalized.status === "ok" ? "ok" : normalized.status,
    meta: {
      channel: "telegram",
      source: "telegram-bot-api",
      tenantId
    },
    data: {
      accepted: normalized.status === "ok",
      chatId: parsed.chatId,
      conversationId: conversation.id,
      duplicate: Boolean(normalized.data?.duplicate),
      messageId: normalized.data?.messageId ?? parsed.messageId,
      tenantId,
      updateId: parsed.updateId
    },
    error: normalized.error ?? null
  });
}

function resolveLegacyTenantId(config: TelegramWebhookConfig, providedSecret: string | undefined): string | undefined {
  if (!config.legacySecret || !config.legacyTenantId) {
    return undefined;
  }

  const secret = String(providedSecret ?? "");
  if (!secret || secret.length !== config.legacySecret.length) {
    return undefined;
  }

  const matches = timingSafeEqualStrings(secret, config.legacySecret);
  return matches ? config.legacyTenantId : undefined;
}

function timingSafeEqualStrings(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

export async function resolveOrCreateTelegramConversation(input: {
  botId?: string;
  chatId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "saveConversation">;
  displayName: string;
  tenantId: string;
  username?: string;
}): Promise<ConversationRecord | null> {
  const chatId = String(input.chatId ?? "").trim();
  const tenantId = String(input.tenantId ?? "").trim();

  if (!chatId || !tenantId) {
    return null;
  }

  const conversationId = telegramConversationId(tenantId, input.botId, chatId);
  const existing = await input.conversationRepository.findConversation(conversationId);

  if (existing) {
    if (resolveConversationTenantId(existing) !== tenantId) {
      return null;
    }

    return existing;
  }

  const legacy = await input.conversationRepository.findConversation(chatId);
  if (legacy && resolveConversationTenantId(legacy) === tenantId) {
    return legacy;
  }

  const displayName = input.displayName.trim() || `Telegram ${chatId}`;
  const conversation: ConversationRecord = {
    channel: "Telegram",
    clientSince: new Date().toISOString().slice(0, 10),
    device: "Telegram",
    entry: "Telegram",
    id: conversationId,
    initials: initialsFromName(displayName),
    language: "Unknown",
    messages: [],
    name: displayName,
    phone: chatId,
    preview: "",
    previous: [],
    sla: "Active",
    slaTone: "ok",
    status: "active",
    tags: compactTags([
      "telegram",
      `chat:${chatId}`,
      input.botId ? `bot:${input.botId}` : "",
      input.username ? `username:${input.username}` : ""
    ]),
    tenantId,
    time: "now",
    topic: "Telegram / Bot"
  };

  return input.conversationRepository.saveConversation(conversation);
}

export function telegramConversationId(tenantId: string, botId: string | undefined, chatId: string): string {
  const scope = `${String(tenantId).trim()}:${String(botId ?? "default").trim() || "default"}`;
  return `tg_${createHash("sha256").update(`${scope}:${String(chatId).trim()}`).digest("hex").slice(0, 24)}`;
}

export function telegramTenantEventId(tenantId: string, botId: string | undefined, providerEventId: string): string {
  const scope = createHash("sha256")
    .update(`${String(tenantId).trim()}:${String(botId ?? "default").trim() || "default"}`)
    .digest("hex")
    .slice(0, 16);
  return `telegram:${scope}:${String(providerEventId).replace(/^telegram:/, "")}`;
}

function parseTelegramUpdate(body: Record<string, unknown>) {
  const updateId = Number(body.update_id);
  const message = (body.message ?? body.edited_message) as Record<string, unknown> | undefined;

  if (!Number.isFinite(updateId) || !message || typeof message !== "object") {
    return null;
  }

  const text = String(message.text ?? "").trim();
  if (!text) {
    return null;
  }

  const chat = message.chat as Record<string, unknown> | undefined;
  const from = message.from as Record<string, unknown> | undefined;
  const chatId = String(chat?.id ?? "").trim();

  if (!chatId) {
    return null;
  }

  const firstName = String(from?.first_name ?? "").trim();
  const lastName = String(from?.last_name ?? "").trim();
  const username = String(from?.username ?? "").trim();
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || (username ? `@${username}` : `Chat ${chatId}`);
  const messageId = String(message.message_id ?? "").trim();

  return {
    chatId,
    displayName,
    eventId: `telegram:${updateId}:${messageId || "message"}`,
    messageId,
    text,
    updateId,
    username: username || undefined
  };
}

function deniedEnvelope(code: string, message: string): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: INTEGRATION_SERVICE,
    operation: "receiveTelegramWebhook",
    status: "denied",
    meta: {
      channel: "telegram",
      source: "telegram-bot-api"
    },
    data: {
      accepted: false
    },
    error: { code, message }
  });
}

function resolveConversationTenantId(conversation: ConversationRecord): string {
  return String(conversation.tenantId ?? "").trim();
}

function initialsFromName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "TG";
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .padEnd(2, "G")
    .slice(0, 2);
}

function compactTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

export function telegramWebhookPathFingerprint(tenantId: string, chatId: string): string {
  return createHash("sha256").update(`${tenantId}:${chatId}`).digest("hex").slice(0, 16);
}
