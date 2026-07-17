import { createHash, randomUUID } from "node:crypto";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import {
  resolveOrForkAppealConversation,
  type AppealConversationMutation
} from "../conversation/appeal-lifecycle.js";
import type {
  ConversationLifecycleEvent,
  ConversationRepository,
  RealtimeEvent
} from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";

const SERVICE = "integrationService";

export interface ProviderConversationInput {
  channel: "MAX" | "VK";
  channelConnectionId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
  displayName: string;
  providerConversationId: string;
  providerUserId?: string;
  queueId?: string;
  tenantId: string;
}

export async function resolveOrCreateProviderConversation(input: ProviderConversationInput): Promise<ConversationRecord | null> {
  const tenantId = required(input.tenantId);
  const connectionId = required(input.channelConnectionId);
  const providerConversationId = required(input.providerConversationId);
  if (!tenantId || !connectionId || !providerConversationId) return null;

  const anchorId = providerConversationKey(tenantId, connectionId, providerConversationId);
  const displayName = required(input.displayName) || `${input.channel} ${providerConversationId}`;

  const resolved = await resolveOrForkAppealConversation({
    anchorId,
    conversationRepository: input.conversationRepository,
    createInitial: () => ({
      channel: input.channel,
      channelConnectionId: connectionId,
      clientSince: new Date().toISOString().slice(0, 10),
      device: input.channel,
      entry: input.channel,
      id: anchorId,
      initials: initials(displayName),
      language: "Unknown",
      messages: [],
      name: displayName,
      // MAX/VK не передают телефон: поле остается пустым для ручного заполнения
      // оператором, маршрутизация ответов идет по providerConversationId.
      phone: "",
      preview: "",
      previous: [],
      providerConversationId,
      ...(required(input.providerUserId) ? { providerUserId: required(input.providerUserId) } : {}),
      ...(required(input.queueId) ? { queueId: required(input.queueId) } : {}),
      sla: "Active",
      slaTone: "ok",
      status: "active",
      tags: [input.channel.toLowerCase(), `connection:${connectionId}`],
      tenantId,
      time: "now",
      topic: `${input.channel} / Bot`
    }),
    createMutation: (conversation, eventType = "conversation.created") =>
      providerConversationMutation(conversation, input.channel, eventType),
    providerConversationId,
    tenantId
  });

  return resolved?.conversation ?? null;
}

export function providerConversationKey(tenantId: string, connectionId: string, providerConversationId: string): string {
  const digest = createHash("sha256").update(`${tenantId}\0${connectionId}\0${providerConversationId}`).digest("base64url").slice(0, 32);
  return `provider_${digest}`;
}

function providerConversationMutation(
  conversation: ConversationRecord,
  channel: "MAX" | "VK",
  eventType: AppealConversationMutation["lifecycleEvent"]["eventType"] = "conversation.created"
): AppealConversationMutation {
  const occurredAt = new Date().toISOString();
  const traceId = getCurrentTraceId() ?? createRequestTraceId(SERVICE, eventType);
  const realtimeEvent: RealtimeEvent = {
    data: {
      channel: channel.toLowerCase(),
      channelConnectionId: conversation.channelConnectionId,
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

function required(value: unknown): string {
  return String(value ?? "").trim();
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}
