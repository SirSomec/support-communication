import { createHash, randomUUID } from "node:crypto";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
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
  conversationRepository: Pick<ConversationRepository, "findConversation" | "saveConversationMutation">;
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

  const id = providerConversationKey(tenantId, connectionId, providerConversationId);
  const existing = await input.conversationRepository.findConversation(id);
  if (existing) {
    return existing.tenantId === tenantId && existing.channelConnectionId === connectionId ? existing : null;
  }

  const displayName = required(input.displayName) || `${input.channel} ${providerConversationId}`;
  const conversation: ConversationRecord = {
    channel: input.channel,
    channelConnectionId: connectionId,
    clientSince: new Date().toISOString().slice(0, 10),
    device: input.channel,
    entry: input.channel,
    id,
    initials: initials(displayName),
    language: "Unknown",
    messages: [],
    name: displayName,
    phone: providerConversationId,
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
  };
  const occurredAt = new Date().toISOString();
  const traceId = getCurrentTraceId() ?? createRequestTraceId(SERVICE, "provider.conversation.created");
  const realtimeEvent: RealtimeEvent = {
    data: { channel: input.channel.toLowerCase(), channelConnectionId: connectionId, direction: "inbound" },
    eventId: `rt_${randomUUID()}`,
    eventName: "conversation.created",
    occurredAt,
    resourceId: id,
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId,
    traceId
  };
  const lifecycleEvent: ConversationLifecycleEvent = {
    actorId: null,
    actorName: null,
    actorType: "client",
    conversationId: id,
    data: realtimeEvent.data,
    eventType: "conversation.created",
    id: `lifecycle_${randomUUID()}`,
    ingestedAt: occurredAt,
    occurredAt,
    reason: null,
    schemaVersion: "conversation-lifecycle/v1",
    source: "integration-service",
    sourceEventId: realtimeEvent.eventId,
    tenantId,
    traceId
  };
  return (await input.conversationRepository.saveConversationMutation({ conversation, lifecycleEvent, realtimeEvent })).conversation;
}

export function providerConversationKey(tenantId: string, connectionId: string, providerConversationId: string): string {
  const digest = createHash("sha256").update(`${tenantId}\0${connectionId}\0${providerConversationId}`).digest("base64url").slice(0, 32);
  return `provider_${digest}`;
}

function required(value: unknown): string {
  return String(value ?? "").trim();
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}
