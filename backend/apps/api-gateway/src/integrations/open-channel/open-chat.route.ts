import { createHash } from "node:crypto";
import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import type { ConversationService } from "../../conversation/conversation.service.js";
import type { ConversationRecord } from "../../conversation/conversation.types.js";
import {
  resolveOrForkAppealConversation,
  type AppealConversationMutation
} from "../../conversation/appeal-lifecycle.js";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { randomUUID } from "node:crypto";
import type {
  ConversationLifecycleEvent,
  RealtimeEvent
} from "../../conversation/conversation.repository.js";
import { OpenChannelRepository, type OpenChatChannelRecord } from "./open-channel.repository.js";
import type { ExternalBotBridge } from "./external-bot.route.js";

/**
 * Open Channel chat — the symmetric {sender, recipient, message} event
 * protocol for custom channels, wire-compatible with the format used by
 * popular live-chat platforms. We accept POST events on
 * `/open-channel/:token` and answer 2xx/4xx by the same convention, so
 * customer servers keep their retry logic unchanged.
 */

export const OPEN_CHAT_CHANNEL = "CHATAPI";

export interface OpenChatUser {
  crm_link?: string;
  custom_data?: string;
  email?: string;
  group?: string;
  id?: string;
  intent?: string;
  invite?: string;
  name?: string;
  phone?: string;
  photo?: string;
  title?: string;
  url?: string;
}

export interface OpenChatMessage {
  date?: number;
  file?: string;
  file_name?: string;
  file_size?: number;
  height?: number;
  id?: string;
  keyboard?: Array<Record<string, unknown>>;
  latitude?: number;
  longitude?: number;
  mime_type?: string;
  multiple?: boolean;
  text?: string;
  thumb?: string;
  title?: string;
  type?: string;
  value?: number;
  width?: number;
}

export interface OpenChatEvent {
  message?: OpenChatMessage;
  recipient?: OpenChatUser;
  sender?: OpenChatUser;
}

export interface OpenChatRouteResult {
  body: string | Record<string, unknown>;
  contentType: "application/json; charset=utf-8" | "text/plain; charset=utf-8";
  statusCode: number;
}

export interface OpenChatInboundInput {
  body: OpenChatEvent;
  botBridge?: Pick<ExternalBotBridge, "forwardClientMessage">;
  channelToken: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  conversationService: Pick<ConversationService, "normalizeInboundEvent" | "transitionConversationStatus">;
  recordQualityRating?: (payload: {
    channel?: string; clientId?: string; conversationId?: string; idempotencyKey?: string;
    operator?: string; scale?: "CSAT" | "CSI" | "QA"; score?: number; topic?: string;
  }, context: { actorId?: string; actorType?: "client"; tenantId?: string }) => Promise<{ status: string }>;
  repository?: OpenChannelRepository;
}

const MEDIA_MESSAGE_TYPES = new Set(["audio", "document", "photo", "sticker", "video"]);
const ACK_MESSAGE_TYPES = new Set(["seen", "typein"]);

export async function handleOpenChatInbound(input: OpenChatInboundInput): Promise<OpenChatRouteResult> {
  const repository = input.repository ?? OpenChannelRepository.default();
  const channel = await repository.findChatChannelByToken(input.channelToken);
  if (!channel || channel.status !== "active") {
    return plain(404, "channel_not_found");
  }

  const message = input.body?.message;
  const type = String(message?.type ?? "").trim().toLowerCase();
  if (!message || !type) {
    return plain(400, "message_type_required");
  }

  const clientId = String(input.body?.sender?.id ?? "").trim();
  if (!clientId) {
    return plain(400, "sender_id_required");
  }

  const conversation = await resolveOrCreateOpenChatConversation({
    channel,
    clientId,
    conversationRepository: input.conversationRepository,
    sender: input.body.sender ?? {}
  });
  if (!conversation) {
    return plain(400, "conversation_create_failed");
  }

  await repository.mergeConversationState({
    chatChannelId: channel.id,
    clientId,
    conversationId: conversation.id,
    tenantId: channel.tenantId
  });

  if (ACK_MESSAGE_TYPES.has(type) || type === "start") {
    // start resumes a stopped dialog (the conversation is already re-created
    // above); seen/typein are acknowledged without persisting a message.
    return okJson();
  }

  if (type === "stop") {
    if (conversation.status !== "closed") {
      await input.conversationService.transitionConversationStatus({
        conversationId: conversation.id,
        nextStatus: "closed",
        reason: "chat_api_stop",
        resolutionOutcome: "resolved",
        topic: conversation.topic || "Chat API"
      }, { actorType: "client", tenantId: channel.tenantId });
    }
    return okJson();
  }

  if (type === "rate") {
    const score = normalizeOpenChatRate(message.value);
    if (score !== null && conversation.operatorId && input.recordQualityRating) {
      await input.recordQualityRating({
        channel: conversation.channel,
        clientId,
        conversationId: conversation.id,
        idempotencyKey: `open-chat:${conversation.id}:${String(message.id ?? message.value)}`,
        operator: conversation.operatorId,
        scale: "CSAT",
        score,
        topic: conversation.topic
      }, { actorId: clientId, actorType: "client", tenantId: channel.tenantId });
    }
    return okJson();
  }

  const text = openChatMessageText(type, message);
  if (!text) {
    return plain(400, `message_payload_invalid:${type}`);
  }

  const eventId = String(message.id ?? "").trim() || contentEventId(channel.id, clientId, type, message);
  const normalized = await input.conversationService.normalizeInboundEvent("chat-api", {
    attachments: openChatMessageAttachments(type, message),
    conversationId: conversation.id,
    eventId: `${channel.tenantId}:${channel.id}:${eventId}`,
    text
  });
  if (normalized.status !== "ok") {
    return plain(400, String(normalized.error?.code ?? "message_rejected"));
  }

  if (input.botBridge) {
    await input.botBridge.forwardClientMessage({
      channel: OPEN_CHAT_CHANNEL,
      clientId,
      conversation,
      pageUrl: input.body.sender?.url,
      senderName: input.body.sender?.name,
      tenantId: channel.tenantId,
      text
    }).catch(() => undefined);
  }

  return okJson({ duplicate: normalized.data?.duplicate === true });
}

export async function handleOpenChatStatus(input: {
  channelToken: string;
  conversationRepository: Pick<ConversationRepository, "listConversations">;
  repository?: OpenChannelRepository;
}): Promise<OpenChatRouteResult> {
  const repository = input.repository ?? OpenChannelRepository.default();
  const channel = await repository.findChatChannelByToken(input.channelToken);
  if (!channel || channel.status !== "active") {
    return plain(404, "channel_not_found");
  }

  const conversations = await input.conversationRepository.listConversations({
    tenantId: channel.tenantId,
    take: 100,
    messageTake: 1
  });
  const active = conversations.some((conversation) => conversation.tenantId === channel.tenantId
    && conversation.channel === OPEN_CHAT_CHANNEL
    && conversation.tags.includes(`connection:${channel.id}`)
    && conversation.status !== "closed");
  return plain(200, active ? "1" : "0");
}

export async function resolveOrCreateOpenChatConversation(input: {
  channel: OpenChatChannelRecord;
  clientId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  sender: OpenChatUser;
}): Promise<ConversationRecord | null> {
  const displayName = String(input.sender.name ?? "").trim() || `Client ${input.clientId}`;
  const anchorId = openChatConversationKey(input.channel.tenantId, input.channel.id, input.clientId);
  const resolved = await resolveOrForkAppealConversation({
    anchorId,
    conversationRepository: input.conversationRepository,
    // The compat channel id intentionally stays out of channelConnectionId:
    // that column is FK-bound to the platform channel_connections table in the
    // Prisma profile. The link lives in the connection:<id> tag and the
    // open-channel conversation state instead.
    createInitial: () => ({
      channel: OPEN_CHAT_CHANNEL,
      clientSince: new Date().toISOString().slice(0, 10),
      device: "Chat API",
      entry: "Chat API",
      id: anchorId,
      initials: initials(displayName),
      language: "Unknown",
      messages: [],
      name: displayName,
      // Без телефона в профиле отправителя поле остается пустым: clientId —
      // не телефон, адресация ответов держится на providerConversationId и теге external:*.
      phone: String(input.sender.phone ?? "").trim(),
      preview: "",
      previous: [],
      providerConversationId: input.clientId,
      providerUserId: input.clientId,
      ...(input.channel.routingQueueId ? { queueId: input.channel.routingQueueId } : {}),
      sla: "Active",
      slaTone: "ok",
      status: "active",
      tags: compact([
        "chat-api",
        `connection:${input.channel.id}`,
        `external:${input.clientId}`,
        input.sender.email ? `email:${String(input.sender.email).trim()}` : "",
        input.sender.url ? `page:${String(input.sender.url).trim()}` : ""
      ]),
      tenantId: input.channel.tenantId,
      time: "now",
      topic: String(input.sender.intent ?? "").trim() || "Chat API"
    }),
    createMutation: (conversation, eventType = "conversation.created") => openChatConversationMutation(conversation, eventType),
    tenantId: input.channel.tenantId
  });

  return resolved?.conversation ?? null;
}

export function openChatConversationKey(tenantId: string, channelId: string, clientId: string): string {
  const digest = createHash("sha256").update(`${tenantId}\0${channelId}\0${clientId}`).digest("base64url").slice(0, 32);
  return `openchat_${digest}`;
}

/** Renders any inbound Chat API message into the plain-text dialog transcript. */
export function openChatMessageText(type: string, message: OpenChatMessage): string {
  if (type === "text") {
    return String(message.text ?? "").trim();
  }
  if (MEDIA_MESSAGE_TYPES.has(type)) {
    const file = String(message.file ?? "").trim();
    if (!file) return "";
    return [String(message.text ?? "").trim(), file].filter(Boolean).join("\n");
  }
  if (type === "location") {
    const latitude = Number(message.latitude);
    const longitude = Number(message.longitude);
    if (!isFiniteInRange(latitude, -90, 90) || !isFiniteInRange(longitude, -180, 180)) return "";
    return [String(message.text ?? "").trim(), `Location: ${latitude},${longitude}`].filter(Boolean).join("\n");
  }
  if (type === "keyboard") {
    // A keyboard event from the client carries the selected key(s).
    const selected = (message.keyboard ?? [])
      .map((key) => String((key as Record<string, unknown>).text ?? (key as Record<string, unknown>).id ?? "").trim())
      .filter(Boolean);
    return selected.join(", ");
  }
  return "";
}

export function openChatMessageAttachments(type: string, message: OpenChatMessage): Array<Record<string, unknown>> {
  if (!MEDIA_MESSAGE_TYPES.has(type)) return [];
  return [{
    ...(message.file ? { file: message.file } : {}),
    ...(message.file_name ? { fileName: message.file_name } : {}),
    ...(message.file_size !== undefined ? { sizeBytes: message.file_size } : {}),
    ...(message.mime_type ? { mimeType: message.mime_type } : {}),
    ...(message.thumb ? { thumb: message.thumb } : {}),
    type
  }];
}

/** 0 → declined (null), positive → 5, negative → 1 (CSAT scale 1..5). */
export function normalizeOpenChatRate(value: unknown): number | null {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate === 0) return null;
  return rate > 0 ? 5 : 1;
}

/** Builds an outbound Chat API event ({sender: agent, recipient: client, message}). */
export function buildOpenChatOutboundEvent(input: {
  clientId: string;
  messageId: string;
  operatorName?: string;
  text: string;
  timestamp?: number;
}): Record<string, unknown> {
  return {
    ...(input.operatorName ? { sender: { id: "agent", name: input.operatorName } } : {}),
    recipient: { id: input.clientId },
    message: {
      date: input.timestamp ?? Math.floor(Date.now() / 1000),
      id: input.messageId,
      text: input.text,
      type: "text"
    }
  };
}

function openChatConversationMutation(
  conversation: ConversationRecord,
  eventType: AppealConversationMutation["lifecycleEvent"]["eventType"] = "conversation.created"
): AppealConversationMutation {
  const occurredAt = new Date().toISOString();
  const traceId = getCurrentTraceId() ?? createRequestTraceId("integrationService", eventType);
  const realtimeEvent: RealtimeEvent = {
    data: {
      channel: "chat-api",
      channelConnectionId: conversation.channelConnectionId,
      direction: "inbound",
      ...(conversation.metadata?.isRepeatAppeal ? { isRepeatAppeal: true } : {}),
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
    source: "open-channel",
    sourceEventId: realtimeEvent.eventId,
    tenantId: conversation.tenantId,
    traceId
  };

  return { conversation, lifecycleEvent, realtimeEvent };
}

function contentEventId(channelId: string, clientId: string, type: string, message: OpenChatMessage): string {
  const digest = createHash("sha256")
    .update(`${channelId}\0${clientId}\0${type}\0${JSON.stringify(message)}\0${Date.now()}`)
    .digest("hex")
    .slice(0, 24);
  return `content_${digest}`;
}

function isFiniteInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function compact(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function okJson(extra: Record<string, unknown> = {}): OpenChatRouteResult {
  return { body: { result: "ok", ...extra }, contentType: "application/json; charset=utf-8", statusCode: 200 };
}

function plain(statusCode: number, body: string): OpenChatRouteResult {
  return { body, contentType: "text/plain; charset=utf-8", statusCode };
}
