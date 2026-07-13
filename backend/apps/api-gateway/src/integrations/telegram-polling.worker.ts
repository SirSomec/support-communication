import { writeStructuredLog } from "@support-communication/observability";
import type { BackendEnvelope } from "@support-communication/envelope";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type { ChannelConnectionStoredRecord, TelegramConnectionStoredRecord } from "./integration.repository.js";
import type { TelegramHttpFetch } from "./telegram-channel-connection.js";
import {
  parseTelegramQualityRating,
  resolveOrCreateTelegramConversation,
  resolveTelegramRatedConversation,
  telegramRoutingQueueId,
  telegramTenantEventId
} from "./telegram-webhook.route.js";

export interface TelegramPollingInput {
  apiBaseUrl?: string;
  autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<unknown>;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent">;
  fetcher?: TelegramHttpFetch;
  integrationRepository: TelegramConnectionReader;
  limit?: number;
  recordQualityRating?: (payload: {
    channel?: string; clientId?: string; conversationId?: string; idempotencyKey?: string;
    operator?: string; scale?: "CSAT" | "CSI" | "QA"; score?: number; topic?: string;
  }, context: { actorId?: string; actorType?: "client"; tenantId?: string }) => Promise<BackendEnvelope<Record<string, unknown>>>;
  runBotRuntime?: (event: { channel: string; conversationId: string; eventId: string; payload?: Record<string, unknown>; tenantId: string; traceId: string }) => Promise<{ instance?: { status?: string }; outcome?: string }>;
  offsets?: Map<string, number>;
  timeoutMs?: number;
}

export interface TelegramConnectionReader {
  listChannelConnectionsAsync?(filters: { tenantId: string; type?: string }): Promise<ChannelConnectionStoredRecord[]>;
  listTelegramConnections(): TelegramConnectionStoredRecord[];
  listTelegramConnectionsAsync?(): Promise<TelegramConnectionStoredRecord[]>;
  saveTelegramConnectionAsync?(connection: TelegramConnectionStoredRecord): Promise<TelegramConnectionStoredRecord>;
}

export interface TelegramPollingResult {
  accepted: number;
  duplicates: number;
  failed: number;
  polled: number;
}

export interface TelegramPollingWorkerHandle {
  stop(): void;
}

export interface TelegramPollingWorkerInput {
  intervalMs?: number;
  onError?: (error: unknown) => void;
  pollOnce: () => Promise<TelegramPollingResult>;
}

interface TelegramGetUpdatesResponse {
  ok: boolean;
  result?: TelegramUpdatePayload[];
}

interface TelegramUpdatePayload {
  callback_query?: {
    data?: string;
    id?: number | string;
    message?: TelegramMessagePayload;
  };
  edited_message?: TelegramMessagePayload;
  message?: TelegramMessagePayload;
  update_id?: number;
}

interface TelegramMessagePayload {
  chat?: {
    id?: number | string;
    type?: string;
  };
  from?: {
    first_name?: string;
    id?: number | string;
    last_name?: string;
    username?: string;
  };
  message_id?: number | string;
  text?: string;
}

const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export function startTelegramPollingWorker(input: TelegramPollingWorkerInput): TelegramPollingWorkerHandle {
  const intervalMs = Math.max(1, Number(input.intervalMs ?? 10_000));
  let stopped = false;
  let running = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  async function tick() {
    if (stopped) {
      return;
    }

    if (!running) {
      running = true;
      try {
        await input.pollOnce();
      } catch (error) {
        input.onError?.(error);
      } finally {
        running = false;
      }
    }

    if (!stopped) {
      timeout = setTimeout(tick, intervalMs);
    }
  }

  timeout = setTimeout(tick, 0);

  return {
    stop() {
      stopped = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };
}

export async function pollTelegramUpdatesOnce(input: TelegramPollingInput): Promise<TelegramPollingResult> {
  const fetcher = input.fetcher ?? globalThis.fetch;
  const offsets = input.offsets ?? new Map<string, number>();
  const allConnections = input.integrationRepository.listTelegramConnectionsAsync
    ? await input.integrationRepository.listTelegramConnectionsAsync()
    : input.integrationRepository.listTelegramConnections();
  const connections = allConnections
    .filter((connection) => connection.status === "active" && String(connection.botToken ?? "").trim());
  const result: TelegramPollingResult = {
    accepted: 0,
    duplicates: 0,
    failed: 0,
    polled: connections.length
  };

  for (const connection of connections) {
    const cursorKey = telegramCursorKey(connection);
    const updates = await fetchTelegramUpdates({
      apiBaseUrl: input.apiBaseUrl,
      connection,
      fetcher,
      limit: input.limit ?? 20,
      offset: offsets.get(cursorKey) ?? connection.pollingOffset,
      timeoutMs: input.timeoutMs ?? 10_000
    });

    for (const update of updates) {
      const rating = parseTelegramQualityRating(update as unknown as Record<string, unknown>);
      if (rating) {
        // Survey button taps must never fork a follow-up appeal: record the rating
        // and advance the cursor without touching conversation creation.
        const recorded = await recordPolledQualityRating({
          apiBaseUrl: input.apiBaseUrl,
          connection,
          conversationRepository: input.conversationRepository,
          fetcher,
          rating,
          recordQualityRating: input.recordQualityRating
        });
        if (recorded) {
          result.accepted += 1;
        } else {
          result.failed += 1;
        }
        const ratingUpdateId = Number(update.update_id);
        if (Number.isFinite(ratingUpdateId)) {
          await persistTelegramOffset(input.integrationRepository, connection, offsets, cursorKey, ratingUpdateId + 1);
        }
        continue;
      }

      const parsed = parseTelegramPollingUpdate(update);
      if (!parsed) {
        const ignoredUpdateId = Number(update.update_id);
        if (Number.isFinite(ignoredUpdateId)) {
          await persistTelegramOffset(input.integrationRepository, connection, offsets, cursorKey, ignoredUpdateId + 1);
        }
        continue;
      }

      const conversation = await resolveOrCreateTelegramConversation({
        botId: connection.botId ?? undefined,
        chatId: parsed.chatId,
        conversationRepository: input.conversationRepository,
        displayName: parsed.displayName,
        queueId: await telegramRoutingQueueId(input.integrationRepository, connection.tenantId, connection),
        tenantId: connection.tenantId,
        username: parsed.username
      });

      if (!conversation) {
        result.failed += 1;
        continue;
      }

      const normalized = await input.conversationService.normalizeInboundEvent("telegram", {
        conversationId: conversation.id,
        eventId: telegramTenantEventId(connection.tenantId, connection.botId ?? undefined, parsed.eventId),
        text: parsed.text
      });

      if (normalized.status === "ok" && normalized.data?.duplicate) {
        result.duplicates += 1;
      } else if (normalized.status === "ok") {
        result.accepted += 1;
      } else {
        result.failed += 1;
        continue;
      }

      const runtimeEventId = telegramTenantEventId(connection.tenantId, connection.botId ?? undefined, parsed.eventId);
      let botRuntime: { instance?: { status?: string }; outcome?: string } | null = null;
      if (input.runBotRuntime) {
        try {
          botRuntime = await input.runBotRuntime({ channel: "Telegram", conversationId: conversation.id, eventId: runtimeEventId, payload: { text: parsed.text }, tenantId: connection.tenantId, traceId: normalized.traceId });
        } catch (error) {
          writeStructuredLog("warn", "Telegram inbound bot runtime failed", {
            conversationId: conversation.id,
            error: error instanceof Error ? error.message : String(error),
            operation: "telegram.polling.bot_runtime",
            service: "telegram-polling-worker",
            tenantId: connection.tenantId
          });
          botRuntime = null;
        }
      }
      const needsOperator = !botRuntime || ["handoff", "dead_lettered"].includes(String(botRuntime.instance?.status ?? ""));
      if (needsOperator && input.autoAssignConversation) {
        try {
          await input.autoAssignConversation(conversation.id, connection.tenantId);
        } catch {
          // Inbound delivery remains accepted; an unassigned dialog stays visible in its queue.
        }
      }

      await persistTelegramOffset(input.integrationRepository, connection, offsets, cursorKey, parsed.updateId + 1);
    }
  }

  return result;
}

async function recordPolledQualityRating(input: {
  apiBaseUrl?: string;
  connection: TelegramConnectionStoredRecord;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations">;
  fetcher: TelegramHttpFetch;
  rating: NonNullable<ReturnType<typeof parseTelegramQualityRating>>;
  recordQualityRating?: TelegramPollingInput["recordQualityRating"];
}): Promise<boolean> {
  const { connection, rating } = input;
  let recorded = false;
  try {
    if (!input.recordQualityRating) {
      throw new Error("telegram_quality_not_configured");
    }
    const conversation = await resolveTelegramRatedConversation(input.conversationRepository, {
      botId: connection.botId ?? undefined,
      chatId: rating.chatId,
      tenantId: connection.tenantId
    });
    if (!conversation?.operatorId) {
      throw new Error("telegram_quality_conversation_unresolved");
    }
    const response = await input.recordQualityRating({
      channel: "Telegram",
      clientId: rating.chatId,
      conversationId: conversation.id,
      idempotencyKey: `telegram:${connection.botId ?? "default"}:${rating.callbackQueryId}`,
      operator: conversation.operatorId,
      scale: rating.scale,
      score: rating.score,
      topic: conversation.topic
    }, { actorId: rating.chatId, actorType: "client", tenantId: connection.tenantId });
    recorded = response.status === "ok";
    if (!recorded) {
      throw new Error(String(response.error?.code ?? "telegram_quality_rating_rejected"));
    }
  } catch (error) {
    writeStructuredLog("warn", "Telegram quality rating ingestion failed", {
      callbackQueryId: rating.callbackQueryId,
      error: error instanceof Error ? error.message : String(error),
      operation: "telegram.polling.quality_rating",
      service: "telegram-polling-worker",
      tenantId: connection.tenantId
    });
  }

  await answerTelegramCallbackQuery({
    apiBaseUrl: input.apiBaseUrl,
    connection,
    fetcher: input.fetcher,
    callbackQueryId: rating.callbackQueryId,
    text: recorded ? "Спасибо за оценку!" : undefined
  });

  return recorded;
}

async function answerTelegramCallbackQuery(input: {
  apiBaseUrl?: string;
  callbackQueryId: string;
  connection: TelegramConnectionStoredRecord;
  fetcher: TelegramHttpFetch;
  text?: string;
}): Promise<void> {
  const token = String(input.connection.botToken ?? "").trim();
  if (!token) {
    return;
  }

  const endpoint = new URL(`${String(input.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, "")}/bot${token}/answerCallbackQuery`);
  endpoint.searchParams.set("callback_query_id", input.callbackQueryId);
  if (input.text) {
    endpoint.searchParams.set("text", input.text);
  }

  try {
    await input.fetcher(endpoint.toString(), {});
  } catch {
    // Answering only stops the client-side spinner; a failure must not block ingestion.
  }
}

function telegramCursorKey(connection: TelegramConnectionStoredRecord): string {
  return `${connection.tenantId}:${connection.botId ?? "default"}`;
}

async function persistTelegramOffset(
  repository: TelegramConnectionReader,
  connection: TelegramConnectionStoredRecord,
  offsets: Map<string, number>,
  cursorKey: string,
  pollingOffset: number
): Promise<void> {
  if (repository.saveTelegramConnectionAsync) {
    await repository.saveTelegramConnectionAsync({
      ...connection,
      pollingOffset,
      updatedAt: new Date().toISOString()
    });
  }
  connection.pollingOffset = pollingOffset;
  offsets.set(cursorKey, pollingOffset);
}

async function fetchTelegramUpdates(input: {
  apiBaseUrl?: string;
  connection: TelegramConnectionStoredRecord;
  fetcher: TelegramHttpFetch;
  limit: number;
  offset?: number;
  timeoutMs: number;
}): Promise<TelegramUpdatePayload[]> {
  const token = String(input.connection.botToken ?? "").trim();
  const endpoint = new URL(`${String(input.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, "")}/bot${token}/getUpdates`);
  endpoint.searchParams.set("timeout", "0");
  endpoint.searchParams.set("limit", String(input.limit));
  endpoint.searchParams.set("allowed_updates", JSON.stringify(["message", "edited_message", "callback_query"]));
  if (Number.isFinite(input.offset)) {
    endpoint.searchParams.set("offset", String(input.offset));
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  let response;
  try {
    response = await input.fetcher(endpoint.toString(), { signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`telegram_polling_timeout:${input.timeoutMs}`);
    }
    throw new Error("telegram_polling_provider_failed");
  } finally {
    clearTimeout(timeout);
  }
  const payload = await response.json() as TelegramGetUpdatesResponse;

  if (!response.ok || !payload.ok || !Array.isArray(payload.result)) {
    throw new Error(response.status === 409 && isWebhookConflict(payload)
      ? "telegram_polling_webhook_conflict"
      : `telegram_polling_provider_failed:${response.status}`);
  }

  return payload.result;
}

function isWebhookConflict(payload: TelegramGetUpdatesResponse): boolean {
  const description = "description" in payload ? String((payload as { description?: unknown }).description ?? "") : "";
  return /webhook/i.test(description) && /getUpdates/i.test(description);
}

function parseTelegramPollingUpdate(update: TelegramUpdatePayload) {
  const updateId = Number(update.update_id);
  const message = update.message ?? update.edited_message;
  if (!Number.isFinite(updateId) || !message) {
    return null;
  }

  const text = String(message.text ?? "").trim();
  const chatId = String(message.chat?.id ?? "").trim();
  if (!text || !chatId) {
    return null;
  }

  const firstName = String(message.from?.first_name ?? "").trim();
  const lastName = String(message.from?.last_name ?? "").trim();
  const username = String(message.from?.username ?? "").trim();
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
