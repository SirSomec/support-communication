import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type {
  ConversationLifecycleEvent,
  ConversationRepository,
  RealtimeEvent
} from "../conversation/conversation.repository.js";
import {
  appealAnchorTag,
  resolveOrForkAppealConversation,
  type AppealConversationMutation
} from "../conversation/appeal-lifecycle.js";
import { CSAT_FEEDBACK_NEW_APPEAL_CALLBACK } from "../quality/csat-feedback.js";
import { AI_CLOSED_CONVERSATION_OPERATOR } from "../quality/quality.types.js";
import type { ChannelConnectionStoredRecord, TelegramConnectionStoredRecord } from "./integration.repository.js";
import { resolveConnectionRoutingQueue } from "./routing-queue.js";
import { resolveTelegramTenantByWebhookSecret, type TelegramHttpFetch } from "./telegram-channel-connection.js";
import {
  acknowledgeTelegramCsatFeedback,
  declineTelegramCsatFeedback,
  offerTelegramCsatFeedbackAfterRating
} from "./telegram-csat-feedback.js";

const INTEGRATION_SERVICE = "integrationService";

export interface TelegramWebhookConfig {
  enabled: boolean;
  legacySecret?: string;
  legacyTenantId?: string;
}

export interface TelegramWebhookRouteInput {
  autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<BackendEnvelope<Record<string, unknown>>>;
  body: Record<string, unknown>;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "listLifecycleEvents" | "saveConversationMutation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent">;
  headers: Record<string, string | undefined>;
  integrationRepository: TelegramConnectionReader;
  now?: Date;
  // Прямые сервисные вызовы Bot API (скрыть опрос, промпт отзыва); без
  // fetcher используется globalThis.fetch, без токена подключения — пропуск.
  telegramApi?: { apiBaseUrl?: string; fetcher?: TelegramHttpFetch };
  recordQualityRating?: (payload: {
    channel?: string; clientId?: string; conversationId?: string; idempotencyKey?: string;
    operator?: string; scale?: "CSAT" | "CSI" | "QA"; score?: number; topic?: string;
  }, context: { actorId?: string; actorType?: "client"; tenantId?: string }) => Promise<BackendEnvelope<Record<string, unknown>>>;
  runBotRuntime?: (event: { channel: string; conversationId: string; eventId: string; payload?: Record<string, unknown>; tenantId: string; traceId: string }) => Promise<{ instance?: { status?: string }; outcome?: string }>;
}

export interface TelegramConnectionReader {
  listChannelConnectionsAsync?(filters: { tenantId: string; type?: string }): Promise<ChannelConnectionStoredRecord[]>;
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
    // PILOT_TELEGRAM_TENANT_ID — устаревшее имя, поддерживается один релиз.
    legacyTenantId: String(env.TELEGRAM_LEGACY_TENANT_ID ?? env.PILOT_TELEGRAM_TENANT_ID ?? env.TELEGRAM_WEBHOOK_TENANT_ID ?? "").trim() || undefined
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

  const telegramApi = {
    apiBaseUrl: input.telegramApi?.apiBaseUrl,
    botToken: tenantConnection?.botToken,
    fetcher: input.telegramApi?.fetcher
  };

  const rating = parseTelegramQualityRating(input.body);
  if (rating) {
    if (!input.recordQualityRating) {
      return deniedEnvelope("telegram_quality_not_configured", "Telegram quality rating ingestion is not configured.");
    }
    const target = await resolveTelegramRatedTarget(input.conversationRepository, {
      botId: tenantConnection?.botId ?? undefined,
      chatId: rating.chatId,
      tenantId
    });
    if (!target?.operator) {
      return deniedEnvelope("telegram_quality_conversation_unresolved", "Rated conversation or its operator could not be resolved.");
    }
    const recorded = await input.recordQualityRating({
      channel: "Telegram",
      clientId: rating.chatId,
      conversationId: target.conversation.id,
      idempotencyKey: `telegram:${tenantConnection?.botId ?? "default"}:${rating.callbackQueryId}`,
      operator: target.operator,
      scale: rating.scale,
      score: rating.score,
      topic: target.conversation.topic
    }, { actorId: rating.chatId, actorType: "client", tenantId });
    // Оценка принята: опрос скрывается, клиенту предлагается комментарий.
    const feedback = recorded.status === "ok"
      ? await offerTelegramCsatFeedbackAfterRating({
          api: telegramApi,
          chatId: rating.chatId,
          conversation: target.conversation,
          conversationRepository: input.conversationRepository,
          ratingId: String(recorded.data?.ratingId ?? "") || `telegram:${rating.callbackQueryId}`,
          surveyMessageId: rating.messageId
        })
      : { offered: false };
    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "receiveTelegramQualityRating",
      status: recorded.status,
      meta: { channel: "telegram", source: "telegram-bot-api", tenantId },
      data: { accepted: recorded.status === "ok", callbackQueryId: rating.callbackQueryId, conversationId: target.conversation.id, feedbackPromptOffered: feedback.offered, ratingId: recorded.data?.ratingId ?? null },
      error: recorded.error ?? null
    });
  }

  const feedbackDecline = parseTelegramCsatFeedbackDecline(input.body);
  if (feedbackDecline) {
    const target = await resolveTelegramRatedTarget(input.conversationRepository, {
      botId: tenantConnection?.botId ?? undefined,
      chatId: feedbackDecline.chatId,
      tenantId
    });
    if (!target) {
      return deniedEnvelope("telegram_quality_conversation_unresolved", "Conversation awaiting CSAT feedback could not be resolved.");
    }
    const declined = await declineTelegramCsatFeedback({
      api: telegramApi,
      callbackQueryId: feedbackDecline.callbackQueryId,
      chatId: feedbackDecline.chatId,
      conversation: target.conversation,
      conversationRepository: input.conversationRepository,
      promptMessageId: feedbackDecline.messageId
    });
    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "receiveTelegramCsatFeedbackDecline",
      meta: { channel: "telegram", source: "telegram-bot-api", tenantId },
      data: {
        accepted: true,
        callbackQueryId: feedbackDecline.callbackQueryId,
        conversationId: target.conversation.id,
        declined: declined.declined
      }
    });
  }

  const parsed = parseTelegramUpdate(input.body);
  if (!parsed) {
    return deniedEnvelope("telegram_update_unsupported", "Telegram update does not contain a supported text message.");
  }

  const resolved = await resolveTelegramInboundConversation({
    botId: tenantConnection?.botId ?? undefined,
    chatId: parsed.chatId,
    conversationRepository: input.conversationRepository,
    displayName: parsed.displayName,
    queueId: await telegramRoutingQueueId(input.integrationRepository, tenantId, tenantConnection),
    tenantId,
    username: parsed.username
  });
  const conversation = resolved.conversation;

  if (!conversation) {
    return deniedEnvelope("telegram_conversation_create_failed", "Telegram conversation could not be created.");
  }
  const isNewConversation = conversation.messages.length === 0;

  const normalized = await input.conversationService.normalizeInboundEvent("telegram", {
    conversationId: conversation.id,
    csatFeedback: resolved.csatFeedbackAwaiting,
    eventId: telegramTenantEventId(tenantId, tenantConnection?.botId ?? undefined, parsed.eventId),
    text: parsed.text
  });

  // Отзыв к оценке: сообщение сохранено в закрытом обращении, бот и
  // автоназначение не запускаются — новое обращение не открывается.
  if (resolved.csatFeedbackAwaiting) {
    if (normalized.status === "ok" && !normalized.data?.duplicate) {
      await acknowledgeTelegramCsatFeedback({ api: telegramApi, chatId: parsed.chatId, conversationId: conversation.id });
    }
    return createEnvelope({
      service: INTEGRATION_SERVICE,
      operation: "receiveTelegramWebhook",
      status: normalized.status === "ok" ? "ok" : normalized.status,
      meta: { channel: "telegram", source: "telegram-bot-api", tenantId },
      data: {
        accepted: normalized.status === "ok",
        chatId: parsed.chatId,
        conversationId: conversation.id,
        duplicate: Boolean(normalized.data?.duplicate),
        messageId: normalized.data?.messageId ?? parsed.messageId,
        recordedAsFeedback: normalized.status === "ok",
        tenantId,
        updateId: parsed.updateId
      },
      error: normalized.error ?? null
    });
  }

  const runtimeEventId = telegramTenantEventId(tenantId, tenantConnection?.botId ?? undefined, parsed.eventId);
  const botRuntime = normalized.status === "ok" && input.runBotRuntime
    ? await tryBotRuntime(input.runBotRuntime, { channel: "Telegram", conversationId: conversation.id, eventId: runtimeEventId, payload: { isNewConversation, text: parsed.text }, tenantId, traceId: normalized.traceId })
    : null;
  const needsOperator = !botRuntime || ["handoff", "dead_lettered"].includes(String(botRuntime.instance?.status ?? ""));
  const autoAssignment = normalized.status === "ok" && needsOperator && input.autoAssignConversation
    ? await tryAutoAssignment(input.autoAssignConversation, conversation.id, tenantId)
    : null;

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
      autoAssignment: autoAssignment?.data ?? null,
      botRuntime: botRuntime ? { outcome: botRuntime.outcome ?? null, status: botRuntime.instance?.status ?? null } : null,
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

export interface TelegramInboundConversationResolution {
  conversation: ConversationRecord | null;
  // Последнее обращение закрыто и ждет комментарий к CSAT-оценке: входящее
  // сообщение — отзыв, новое обращение не открывается.
  csatFeedbackAwaiting: boolean;
}

export async function resolveOrCreateTelegramConversation(input: {
  botId?: string;
  chatId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  displayName: string;
  queueId?: string;
  tenantId: string;
  username?: string;
}): Promise<ConversationRecord | null> {
  return (await resolveTelegramInboundConversation(input)).conversation;
}

export async function resolveTelegramInboundConversation(input: {
  botId?: string;
  chatId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  displayName: string;
  queueId?: string;
  tenantId: string;
  username?: string;
}): Promise<TelegramInboundConversationResolution> {
  const chatId = String(input.chatId ?? "").trim();
  const tenantId = String(input.tenantId ?? "").trim();

  if (!chatId || !tenantId) {
    return { conversation: null, csatFeedbackAwaiting: false };
  }

  const anchorId = telegramConversationId(tenantId, input.botId, chatId);
  const legacy = await input.conversationRepository.findConversation(chatId);
  if (legacy && resolveConversationTenantId(legacy) === tenantId && legacy.status !== "closed") {
    return { conversation: legacy, csatFeedbackAwaiting: false };
  }

  const displayName = input.displayName.trim() || `Telegram ${chatId}`;
  const resolved = await resolveOrForkAppealConversation({
    anchorId,
    conversationRepository: input.conversationRepository,
    interceptCsatFeedback: true,
    createInitial: () => ({
      channel: "Telegram",
      clientSince: new Date().toISOString().slice(0, 10),
      device: "Telegram",
      entry: "Telegram",
      id: anchorId,
      initials: initialsFromName(displayName),
      language: "Unknown",
      messages: [],
      name: displayName,
      // Телефон клиента Telegram не сообщает: поле остается пустым, пока его
      // не заполнит оператор. Адрес доставки живет в providerConversationId и теге chat:*.
      phone: "",
      preview: "",
      previous: [],
      providerConversationId: chatId,
      ...(input.queueId?.trim() ? { queueId: input.queueId.trim() } : {}),
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
    }),
    createMutation: (conversation, eventType = "conversation.created") =>
      conversationCreatedMutation(conversation, eventType),
    providerConversationId: chatId,
    tenantId
  });

  return {
    conversation: resolved?.conversation ?? null,
    csatFeedbackAwaiting: Boolean(resolved?.csatFeedbackAwaiting)
  };
}

async function tryBotRuntime(run: NonNullable<TelegramWebhookRouteInput["runBotRuntime"]>, event: Parameters<NonNullable<TelegramWebhookRouteInput["runBotRuntime"]>>[0]) {
  try { return await run(event); } catch { return null; }
}

async function tryAutoAssignment(
  assign: NonNullable<TelegramWebhookRouteInput["autoAssignConversation"]>,
  conversationId: string,
  tenantId: string
): Promise<BackendEnvelope<Record<string, unknown>> | null> {
  try {
    return await assign(conversationId, tenantId);
  } catch {
    return null;
  }
}

function conversationCreatedMutation(
  conversation: ConversationRecord,
  eventType: AppealConversationMutation["lifecycleEvent"]["eventType"] = "conversation.created"
): AppealConversationMutation {
  const occurredAt = new Date().toISOString();
  const traceId = getCurrentTraceId() ?? createRequestTraceId(INTEGRATION_SERVICE, eventType);
  const realtimeEvent: RealtimeEvent = {
    data: {
      channel: "telegram",
      direction: "inbound",
      ...(conversation.metadata?.isRepeatAppeal ? { isRepeatAppeal: true } : {}),
      ...(conversation.metadata?.parentConversationId ? { parentConversationId: conversation.metadata.parentConversationId } : {}),
      ...(conversation.queueId ? { queueId: conversation.queueId } : {})
    },
    eventId: `rt_${randomUUID()}`,
    eventName: eventType === "conversation.updated" ? "conversation.updated" : "conversation.created",
    occurredAt,
    resourceId: conversation.id,
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId: conversation.tenantId,
    traceId
  };
  const lifecycleEvent: ConversationLifecycleEvent = {
    actorId: null,
    actorName: null,
    actorType: "client",
    conversationId: conversation.id,
    data: realtimeEvent.data,
    eventType,
    id: `lifecycle_${randomUUID()}`,
    ingestedAt: occurredAt,
    occurredAt,
    reason: eventType === "conversation.created" && conversation.metadata?.isRepeatAppeal ? "repeat_appeal" : null,
    schemaVersion: "conversation-lifecycle/v1",
    source: "integration-service",
    sourceEventId: realtimeEvent.eventId,
    tenantId: conversation.tenantId,
    traceId
  };

  return { conversation, lifecycleEvent, realtimeEvent };
}

export async function telegramRoutingQueueId(
  repository: TelegramConnectionReader,
  tenantId: string,
  connection: TelegramConnectionStoredRecord | undefined
): Promise<string | undefined> {
  const connections = repository.listChannelConnectionsAsync
    ? await repository.listChannelConnectionsAsync({ tenantId, type: "telegram" })
    : [];
  const rawExternalId = connection
    ? `telegram:${connection.botUsername ?? connection.botId ?? "bot"}`
    : undefined;
  return resolveConnectionRoutingQueue(connections, {
    connectionId: connection?.channelConnectionId,
    rawExternalId,
    tenantId,
    type: "telegram"
  });
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

export interface TelegramRatedTarget {
  conversation: ConversationRecord;
  operator: string | null;
}

export async function resolveTelegramRatedTarget(
  repository: Pick<ConversationRepository, "findConversation" | "listConversations" | "listLifecycleEvents">,
  input: { botId?: string; chatId: string; tenantId: string }
): Promise<TelegramRatedTarget | null> {
  const anchorId = telegramConversationId(input.tenantId, input.botId, input.chatId);
  const anchorTag = appealAnchorTag(anchorId);
  const appeals = (await repository.listConversations({ tenantId: input.tenantId, take: 100, messageTake: 1 }))
    .filter((conversation) => resolveConversationTenantId(conversation) === input.tenantId)
    .filter((conversation) => conversation.id === anchorId || conversation.tags.includes(anchorTag))
    .sort((left, right) => conversationSortTimestamp(right) - conversationSortTimestamp(left));
  // The survey goes out when an appeal is closed, so the rating belongs to the
  // most recently closed appeal — a follow-up appeal may already be open on top.
  const conversation = appeals.find((candidate) => candidate.status === "closed")
    ?? appeals[0]
    ?? await repository.findConversation(input.chatId);
  if (!conversation || resolveConversationTenantId(conversation) !== input.tenantId) {
    return null;
  }
  return { conversation, operator: await resolveRatedOperator(repository, conversation) };
}

async function resolveRatedOperator(
  repository: Pick<ConversationRepository, "listLifecycleEvents">,
  conversation: ConversationRecord
): Promise<string | null> {
  if (conversation.operatorId) {
    return conversation.operatorId;
  }

  // Operators can reply and close a dialog without formally taking it, leaving
  // operatorId empty — fall back to the latest operator actor in its history.
  const events = await repository.listLifecycleEvents({
    conversationId: conversation.id,
    tenantId: resolveConversationTenantId(conversation)
  });
  const latestOperatorEvent = [...events]
    .sort((left, right) => Date.parse(String(right.occurredAt ?? "")) - Date.parse(String(left.occurredAt ?? "")))
    .find((event) => event.actorType === "operator" && event.actorId?.trim());
  if (latestOperatorEvent?.actorId?.trim()) {
    return latestOperatorEvent.actorId.trim();
  }

  // Обращение закрыто без операторного следа — его решил и закрыл бот
  // ([[RESOLVED]] AI-агента идет через штатный transition с actorType system).
  // Оценка и CSAT-комментарий должны работать и здесь: балл засчитывается
  // автоматике, а не отбрасывается как «неразрешимый».
  if (conversation.status === "closed") {
    return AI_CLOSED_CONVERSATION_OPERATOR;
  }

  return null;
}

function conversationSortTimestamp(conversation: ConversationRecord): number {
  const updatedAt = Date.parse(String(conversation.updatedAt ?? ""));
  return Number.isFinite(updatedAt) ? updatedAt : 0;
}

export function parseTelegramQualityRating(body: Record<string, unknown>): {
  callbackQueryId: string; chatId: string; messageId?: string; scale: "CSAT" | "CSI"; score: number;
} | null {
  const callback = body.callback_query as Record<string, unknown> | undefined;
  if (!callback || typeof callback !== "object") return null;
  const match = /^quality:(csat|csi):([1-5])$/i.exec(String(callback.data ?? "").trim());
  const message = callback.message as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  const chatId = String(chat?.id ?? "").trim();
  const callbackQueryId = String(callback.id ?? "").trim();
  if (!match || !chatId || !callbackQueryId) return null;
  // message_id опроса нужен, чтобы скрыть сообщение с кнопками после оценки.
  const messageId = String(message?.message_id ?? "").trim();
  return {
    callbackQueryId,
    chatId,
    ...(messageId ? { messageId } : {}),
    scale: match[1].toUpperCase() as "CSAT" | "CSI",
    score: Number(match[2])
  };
}

// Кнопка «Новое обращение» под промптом отзыва.
export function parseTelegramCsatFeedbackDecline(body: Record<string, unknown>): {
  callbackQueryId: string; chatId: string; messageId?: string;
} | null {
  const callback = body.callback_query as Record<string, unknown> | undefined;
  if (!callback || typeof callback !== "object") return null;
  if (String(callback.data ?? "").trim() !== CSAT_FEEDBACK_NEW_APPEAL_CALLBACK) return null;
  const message = callback.message as Record<string, unknown> | undefined;
  const chat = message?.chat as Record<string, unknown> | undefined;
  const chatId = String(chat?.id ?? "").trim();
  const callbackQueryId = String(callback.id ?? "").trim();
  if (!chatId || !callbackQueryId) return null;
  const messageId = String(message?.message_id ?? "").trim();
  return { callbackQueryId, chatId, ...(messageId ? { messageId } : {}) };
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
