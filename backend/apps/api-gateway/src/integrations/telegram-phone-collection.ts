import { randomUUID } from "node:crypto";
import { createRequestTraceId, getCurrentTraceId, writeStructuredLog } from "@support-communication/observability";
import type { ConversationRepository, ConversationLifecycleEvent, RealtimeEvent } from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { TelegramHttpFetch } from "./telegram-channel-connection.js";

const SERVICE = "integrationService";
const PHONE_REQUEST_TAG = "phone-requested";
const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export interface TelegramPhoneCollectionApi {
  apiBaseUrl?: string;
  botToken?: string;
  fetcher?: TelegramHttpFetch;
}

type ConversationStore = Pick<ConversationRepository, "saveConversationMutation">;

export async function requestTelegramPhoneIfMissing(input: {
  api: TelegramPhoneCollectionApi;
  chatId: string;
  conversation: ConversationRecord;
  conversationRepository: ConversationStore;
}): Promise<{ conversation: ConversationRecord; requested: boolean }> {
  if (input.conversation.phone.trim() || input.conversation.tags.includes(PHONE_REQUEST_TAG)) {
    return { conversation: input.conversation, requested: false };
  }

  if (!String(input.api.botToken ?? "").trim() || !input.api.fetcher) {
    return { conversation: input.conversation, requested: false };
  }

  const conversation: ConversationRecord = {
    ...input.conversation,
    tags: [...new Set([...input.conversation.tags, PHONE_REQUEST_TAG])]
  };
  const requested = await callTelegramApi(input.api, "sendMessage", {
    chat_id: input.chatId,
    reply_markup: JSON.stringify({
      keyboard: [[{ request_contact: true, text: "Поделиться номером" }]],
      one_time_keyboard: true,
      resize_keyboard: true
    }),
    text: "Чтобы мы могли найти обращения в других каналах, поделитесь, пожалуйста, номером телефона."
  }, conversation.id);

  if (!requested) return { conversation: input.conversation, requested: false };
  await input.conversationRepository.saveConversationMutation(phoneCollectionMutation(conversation));
  return { conversation, requested: true };
}

export async function acknowledgeTelegramPhoneShare(input: {
  api: TelegramPhoneCollectionApi;
  chatId: string;
  conversationId: string;
}): Promise<void> {
  await callTelegramApi(input.api, "sendMessage", {
    chat_id: input.chatId,
    reply_markup: JSON.stringify({ remove_keyboard: true }),
    text: "Спасибо, номер сохранён."
  }, input.conversationId);
}

function phoneCollectionMutation(conversation: ConversationRecord) {
  const occurredAt = new Date().toISOString();
  const traceId = getCurrentTraceId() ?? createRequestTraceId(SERVICE, "telegram.phone_collection.requested");
  const data = { channel: "telegram", phoneCollection: "requested" };
  const realtimeEvent: RealtimeEvent = {
    data,
    eventId: `rt_${randomUUID()}`,
    eventName: "conversation.updated",
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
    actorType: "system",
    conversationId: conversation.id,
    data,
    eventType: "conversation.updated",
    id: `lifecycle_${randomUUID()}`,
    ingestedAt: occurredAt,
    occurredAt,
    reason: "phone_collection_requested",
    schemaVersion: "conversation-lifecycle/v1",
    source: "integration-service",
    sourceEventId: realtimeEvent.eventId,
    tenantId: conversation.tenantId,
    traceId
  };
  return { conversation, lifecycleEvent, realtimeEvent };
}

async function callTelegramApi(
  api: TelegramPhoneCollectionApi,
  method: string,
  params: Record<string, string>,
  conversationId: string
): Promise<boolean> {
  const token = String(api.botToken ?? "").trim();
  const fetcher = api.fetcher;
  if (!token || !fetcher) return false;

  const endpoint = new URL(`${String(api.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, "")}/bot${token}/${method}`);
  for (const [key, value] of Object.entries(params)) endpoint.searchParams.set(key, value);

  try {
    const response = await fetcher(endpoint.toString(), {});
    if (!response.ok) throw new Error(`telegram_phone_collection_api_failed:${response.status}`);
    return true;
  } catch (error) {
    writeStructuredLog("warn", "Telegram phone collection side call failed", {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
      method,
      operation: "telegram.phone_collection.api",
      service: SERVICE
    });
    return false;
  }
}
