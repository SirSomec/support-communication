import { writeStructuredLog } from "@support-communication/observability";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type { ChannelConnectionStoredRecord, TelegramConnectionStoredRecord } from "./integration.repository.js";
import type { TelegramHttpFetch } from "./telegram-channel-connection.js";
import { resolveOrCreateTelegramConversation, telegramRoutingQueueId, telegramTenantEventId } from "./telegram-webhook.route.js";

export interface TelegramPollingInput {
  apiBaseUrl?: string;
  autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<unknown>;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent">;
  fetcher?: TelegramHttpFetch;
  integrationRepository: TelegramConnectionReader;
  limit?: number;
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
  endpoint.searchParams.set("allowed_updates", JSON.stringify(["message", "edited_message"]));
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
