import { randomUUID } from "node:crypto";
import { createOutboxEvent } from "@support-communication/events";
import type {
  ConversationLifecycleEvent,
  ConversationOutboundDescriptor,
  ConversationRepository,
  RealtimeEvent
} from "../../conversation/conversation.repository.js";
import type { ConversationMessage, ConversationRecord } from "../../conversation/conversation.types.js";
import { OpenChannelRepository, type ExternalBotConnectionRecord } from "./open-channel.repository.js";
import type { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
import { stableNumericId } from "./open-channel-payload.js";

/**
 * External Bot API — connects an external bot platform over the webhook
 * event exchange common to popular live-chat products, so a provider only
 * swaps endpoint URLs and tokens. We send CLIENT_MESSAGE / AGENT_UNAVAILABLE
 * / CHAT_CLOSED to the provider endpoint (`POST {providerUrl}/{token}`), the
 * provider answers on `POST /external-bot/webhooks/:connectionId/:token`
 * with BOT_MESSAGE / INVITE_AGENT / INIT_RATE. Error bodies use the shape
 * `{"error": {"code", "message"}}`.
 */

export interface ExternalBotRouteResult {
  body: Record<string, unknown>;
  statusCode: number;
}

export interface ExternalBotBridgeOptions {
  agentsOnline?: (tenantId: string) => Promise<boolean> | boolean;
  delivery: Pick<OpenChannelDeliveryService, "enqueue">;
  repository?: OpenChannelRepository;
}

export class ExternalBotBridge {
  private readonly agentsOnlineResolver?: ExternalBotBridgeOptions["agentsOnline"];
  private readonly delivery: Pick<OpenChannelDeliveryService, "enqueue">;
  private readonly repository: OpenChannelRepository;

  constructor(options: ExternalBotBridgeOptions) {
    this.agentsOnlineResolver = options.agentsOnline;
    this.delivery = options.delivery;
    this.repository = options.repository ?? OpenChannelRepository.default();
  }

  /**
   * Routes an inbound client message to the external bot provider when a bot
   * connection covers the conversation channel. Returns true when the bot now
   * owns the dialog (the caller should skip operator auto-assignment).
   */
  async forwardClientMessage(input: {
    channel: string;
    clientId: string;
    conversation: Pick<ConversationRecord, "id" | "name" | "operatorId" | "status">;
    pageUrl?: string;
    senderName?: string;
    tenantId: string;
    text: string;
  }): Promise<boolean> {
    if (input.conversation.operatorId || input.conversation.status === "closed") return false;
    const connection = this.repository.findActiveBotConnectionForChannel(input.tenantId, input.channel);
    if (!connection) return false;
    const state = this.repository.findConversationState(input.conversation.id);
    if (state?.botState === "closed") return false;

    this.repository.mergeConversationState({
      botState: "active",
      clientId: input.clientId,
      conversationId: input.conversation.id,
      tenantId: input.tenantId
    });
    this.delivery.enqueue({
      body: {
        agents_online: await this.resolveAgentsOnline(input.tenantId),
        channel: { id: connection.id, type: input.channel.toLowerCase() },
        chat_id: String(stableNumericId(input.conversation.id)),
        client_id: input.clientId,
        event: "CLIENT_MESSAGE",
        id: randomUUID(),
        message: {
          text: input.text,
          timestamp: Math.floor(Date.now() / 1000),
          type: "TEXT"
        },
        sender: {
          has_contacts: false,
          id: stableNumericId(input.clientId),
          name: input.senderName ?? input.conversation.name,
          ...(input.pageUrl ? { url: input.pageUrl } : {})
        },
        site_id: input.tenantId
      },
      conversationId: input.conversation.id,
      eventName: "CLIENT_MESSAGE",
      kind: "bot_event",
      tenantId: input.tenantId,
      url: externalBotProviderUrl(connection)
    });
    return true;
  }

  /** CHAT_CLOSED — the dialog was accepted by an agent or closed; the bot must stop. */
  notifyChatClosed(input: { conversationId: string; tenantId: string }): void {
    const state = this.repository.findConversationState(input.conversationId);
    if (!state || state.botState !== "active") return;
    const connection = this.repository.listBotConnections(input.tenantId).find((item) => item.status === "active");
    if (!connection) return;
    this.repository.mergeConversationState({
      botState: "closed",
      conversationId: input.conversationId,
      tenantId: input.tenantId
    });
    this.delivery.enqueue({
      body: {
        chat_id: String(stableNumericId(input.conversationId)),
        client_id: state.clientId ?? "",
        event: "CHAT_CLOSED",
        id: randomUUID()
      },
      conversationId: input.conversationId,
      eventName: "CHAT_CLOSED",
      kind: "bot_event",
      tenantId: input.tenantId,
      url: externalBotProviderUrl(connection)
    });
  }

  notifyAgentUnavailable(input: { clientId: string; connection: ExternalBotConnectionRecord; conversationId: string; tenantId: string }): void {
    this.delivery.enqueue({
      body: {
        chat_id: String(stableNumericId(input.conversationId)),
        client_id: input.clientId,
        event: "AGENT_UNAVAILABLE",
        id: randomUUID()
      },
      conversationId: input.conversationId,
      eventName: "AGENT_UNAVAILABLE",
      kind: "bot_event",
      tenantId: input.tenantId,
      url: externalBotProviderUrl(input.connection)
    });
  }

  private async resolveAgentsOnline(tenantId: string): Promise<boolean> {
    try {
      return Boolean(await this.agentsOnlineResolver?.(tenantId));
    } catch {
      return false;
    }
  }
}

export function externalBotProviderUrl(connection: ExternalBotConnectionRecord): string {
  return `${connection.providerUrl.replace(/\/+$/, "")}/${connection.token}`;
}

export interface ExternalBotProviderEventInput {
  autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<{ status: string }>;
  body: Record<string, unknown>;
  bridge?: Pick<ExternalBotBridge, "notifyAgentUnavailable">;
  connectionId: string;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "queueOutboundMessageReply">;
  repository?: OpenChannelRepository;
  token: string;
}

const BOT_MESSAGE_TEXT_TYPES = new Set(["markdown", "text"]);
const BOT_MESSAGE_MEDIA_TYPES = new Set(["audio", "document", "photo", "video", "voice"]);

export async function handleExternalBotProviderEvent(input: ExternalBotProviderEventInput): Promise<ExternalBotRouteResult> {
  const repository = input.repository ?? OpenChannelRepository.default();
  const connection = repository.findBotConnectionByIdAndToken(String(input.connectionId ?? "").trim(), String(input.token ?? "").trim());
  if (!connection || connection.status !== "active") {
    return externalBotError(401, "invalid_client", "Bot connection token is invalid.");
  }

  const event = String(input.body?.event ?? "").trim().toUpperCase();
  if (!event) {
    return externalBotError(400, "invalid_request", "The event field is required.");
  }

  const resolved = resolveExternalBotConversationId(repository, connection.tenantId, input.body);
  if (!resolved) {
    return externalBotError(400, "invalid_request", "chat_id or client_id does not match an active dialog.");
  }

  const conversation = await input.conversationRepository.findConversation(resolved.conversationId);
  if (!conversation || conversation.tenantId !== connection.tenantId) {
    return externalBotError(404, "invalid_request", "The dialog was not found.");
  }

  if (event === "BOT_MESSAGE") {
    const state = repository.findConversationState(conversation.id);
    if (state?.botState === "closed" || conversation.status === "closed") {
      return externalBotError(400, "invalid_request", "The chat is closed for bot messages.");
    }
    const text = externalBotMessageText(input.body?.message as Record<string, unknown> | undefined);
    if (!text) {
      return externalBotError(400, "invalid_request", "Unsupported or empty bot message payload.");
    }
    await appendExternalBotMessage({
      botName: connection.name,
      conversation,
      conversationRepository: input.conversationRepository,
      eventId: String(input.body?.id ?? randomUUID()),
      text
    });
    return { body: {}, statusCode: 200 };
  }

  if (event === "INVITE_AGENT") {
    repository.mergeConversationState({
      botState: "closed",
      conversationId: conversation.id,
      tenantId: connection.tenantId
    });
    const assigned = input.autoAssignConversation
      ? await input.autoAssignConversation(conversation.id, connection.tenantId).catch(() => ({ status: "failed" }))
      : { status: "skipped" };
    if (assigned.status !== "ok") {
      // No agent is available: the bot is told so and may continue the dialog.
      repository.mergeConversationState({
        botState: "active",
        conversationId: conversation.id,
        tenantId: connection.tenantId
      });
      input.bridge?.notifyAgentUnavailable({
        clientId: resolved.clientId,
        connection,
        conversationId: conversation.id,
        tenantId: connection.tenantId
      });
    }
    return { body: {}, statusCode: 200 };
  }

  if (event === "INIT_RATE") {
    repository.mergeConversationState({
      conversationId: conversation.id,
      rateRequested: true,
      tenantId: connection.tenantId
    });
    return { body: {}, statusCode: 200 };
  }

  return externalBotError(405, "invalid_request", `Event ${event} is not supported.`);
}

export function resolveExternalBotConversationId(
  repository: OpenChannelRepository,
  tenantId: string,
  body: Record<string, unknown>
): { clientId: string; conversationId: string } | null {
  const chatId = String(body?.chat_id ?? "").trim();
  const clientId = String(body?.client_id ?? "").trim();
  // CLIENT_MESSAGE carries chat_id/client_id derived from the conversation;
  // the provider echoes them back, so match against the stored state.
  const state = repository.listConversationStatesForTenant(tenantId)
    .find((record) => (chatId && String(stableNumericId(record.conversationId)) === chatId)
      || (clientId && record.clientId === clientId));
  return state ? { clientId: state.clientId ?? clientId, conversationId: state.conversationId } : null;
}

export function externalBotMessageText(message: Record<string, unknown> | undefined): string {
  const type = String(message?.type ?? "").trim().toLowerCase();
  if (!type) return "";
  if (BOT_MESSAGE_TEXT_TYPES.has(type)) {
    // MARKDOWN carries `content` (rich) + `text` (fallback); prefer the fallback text.
    return String(message?.text ?? message?.content ?? "").trim();
  }
  if (type === "buttons") {
    const title = String(message?.title ?? "").trim();
    const text = String(message?.text ?? "").trim();
    const buttons = Array.isArray(message?.buttons)
      ? (message?.buttons as Array<Record<string, unknown>>).map((button, index) => `${index + 1}) ${String(button.text ?? "").trim()}`).filter((line) => line.length > 3)
      : [];
    return [title, text || undefined, ...buttons].filter(Boolean).join("\n");
  }
  if (BOT_MESSAGE_MEDIA_TYPES.has(type)) {
    const file = String(message?.file ?? "").trim();
    if (!file) return "";
    return [String(message?.text ?? "").trim(), file].filter(Boolean).join("\n");
  }
  if (type === "location") {
    const latitude = Number(message?.latitude);
    const longitude = Number(message?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
    return `Location: ${latitude},${longitude}`;
  }
  return "";
}

async function appendExternalBotMessage(input: {
  botName: string;
  conversation: ConversationRecord;
  conversationRepository: Pick<ConversationRepository, "queueOutboundMessageReply">;
  eventId: string;
  text: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const messageId = `xb_msg_${input.eventId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}`;
  const traceId = `xb-${messageId}`;
  const message: ConversationMessage = {
    author: `Бот «${input.botName}»`,
    createdAt: now,
    id: messageId,
    side: "agent",
    text: input.text,
    time: "now"
  };
  if (input.conversation.messages.some((item) => String(item.id) === messageId)) return;

  const conversation: ConversationRecord = {
    ...input.conversation,
    messages: [...input.conversation.messages, message],
    preview: input.text,
    time: "now",
    updatedAt: now
  };
  const descriptor: ConversationOutboundDescriptor = {
    auditId: null,
    channel: conversation.channel,
    conversationId: conversation.id,
    createdAt: now,
    deliveryState: "queued",
    id: `xb_dlv_${input.eventId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}`,
    idempotencyKey: `external-bot:${conversation.id}:${messageId}`,
    kind: "message_delivery",
    messageId,
    outboxEventId: null,
    payload: {
      conversationId: conversation.id,
      createdAt: now,
      messageId,
      providerConversationId: conversation.providerConversationId ?? (conversation.phone || conversation.id),
      queue: "message-delivery",
      source: "external-bot",
      text: input.text
    },
    requestFingerprint: null,
    retryable: true,
    status: "queued",
    tenantId: conversation.tenantId,
    traceId
  };
  const outbox = createOutboxEvent({
    aggregateId: conversation.id,
    aggregateType: "conversation",
    payload: {
      channel: conversation.channel,
      conversationId: conversation.id,
      descriptorId: descriptor.id,
      idempotencyKey: descriptor.idempotencyKey,
      messageId,
      retryable: true
    },
    queue: "message-delivery",
    traceId,
    type: "message.delivery.requested"
  });
  const realtimeEvent: RealtimeEvent = {
    data: { messageId, mode: "bot_reply", source: "external-bot" },
    eventId: `evt_${messageId}`,
    eventName: "message.created",
    occurredAt: now,
    resourceId: conversation.id,
    resourceType: "conversation",
    schemaVersion: "conversation-message/v1",
    tenantId: conversation.tenantId,
    traceId
  };
  const lifecycleEvent: ConversationLifecycleEvent = {
    actorId: null,
    actorName: `Бот «${input.botName}»`,
    actorType: "worker",
    conversationId: conversation.id,
    data: { messageId, source: "external-bot" },
    eventType: "message.sent",
    id: `lifecycle_${messageId}`,
    ingestedAt: now,
    occurredAt: now,
    reason: "external_bot_message",
    schemaVersion: "conversation-lifecycle/v1",
    source: "open-channel",
    sourceEventId: `external-bot:${input.eventId}`,
    tenantId: conversation.tenantId,
    traceId
  };

  await input.conversationRepository.queueOutboundMessageReply({
    conversation,
    descriptor,
    lifecycleEvent,
    outbox,
    realtimeEvent
  });
}

export function externalBotError(statusCode: number, code: string, message: string): ExternalBotRouteResult {
  return {
    body: { error: { code, message } },
    statusCode
  };
}
