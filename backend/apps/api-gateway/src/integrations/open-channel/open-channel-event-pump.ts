import { writeStructuredLog } from "@support-communication/observability";
import type { ConversationRepository, RealtimeEvent } from "../../conversation/conversation.repository.js";
import type { ConversationRecord } from "../../conversation/conversation.types.js";
import { OpenChannelRepository } from "./open-channel.repository.js";
import type { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
import type { ExternalBotBridge } from "./external-bot.route.js";
import { OPEN_CHAT_CHANNEL, buildOpenChatOutboundEvent } from "./open-chat.route.js";
import {
  chatMessagesFromConversation,
  externalClientId,
  plainMessagesFromConversation,
  compatWebhookEventBase
} from "./open-channel-payload.js";

/**
 * Polls the persisted realtime event journal and fans matching events out to
 * the external integration surfaces:
 *  - webhook subscriptions (chat_accepted / chat_finished),
 *  - Chat API channels (agent replies delivered to the customer server),
 *  - external bot connections (CHAT_CLOSED when an agent takes over or the
 *    dialog closes).
 * Polling the journal keeps the layer independent from the live fan-out path
 * and works with both JSON and Prisma conversation repositories.
 */

export interface OpenChannelEventPumpOptions {
  botBridge?: Pick<ExternalBotBridge, "notifyChatClosed">;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "listRealtimeEvents">;
  delivery: Pick<OpenChannelDeliveryService, "enqueue">;
  repository?: OpenChannelRepository;
}

export interface OpenChannelEventPumpRunResult {
  botClosures: number;
  chatDeliveries: number;
  scanned: number;
  webhooks: number;
}

export class OpenChannelEventPump {
  private readonly botBridge?: Pick<ExternalBotBridge, "notifyChatClosed">;
  private readonly conversationRepository: OpenChannelEventPumpOptions["conversationRepository"];
  private readonly delivery: Pick<OpenChannelDeliveryService, "enqueue">;
  private readonly repository: OpenChannelRepository;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: OpenChannelEventPumpOptions) {
    this.botBridge = options.botBridge;
    this.conversationRepository = options.conversationRepository;
    this.delivery = options.delivery;
    this.repository = options.repository ?? OpenChannelRepository.default();
  }

  start(intervalMs = 2_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch((error) => {
        writeStructuredLog("warn", "Open channel event pump pass failed", {
          errorMessage: error instanceof Error ? error.message : String(error),
          operation: "openChannelEventPumpRun",
          service: "api-gateway"
        });
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async runOnce(): Promise<OpenChannelEventPumpRunResult> {
    const cursor = this.repository.readPumpCursor();
    const events = (await this.conversationRepository.listRealtimeEvents({}))
      .filter((event) => !cursor.lastOccurredAt || event.occurredAt >= cursor.lastOccurredAt)
      .filter((event) => !cursor.seenEventIds.includes(event.eventId))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

    const result: OpenChannelEventPumpRunResult = { botClosures: 0, chatDeliveries: 0, scanned: events.length, webhooks: 0 };
    if (!events.length) return result;

    for (const event of events) {
      try {
        await this.handleEvent(event, result);
      } catch (error) {
        writeStructuredLog("warn", "Open channel event pump handler failed", {
          errorMessage: error instanceof Error ? error.message : String(error),
          eventId: event.eventId,
          eventName: event.eventName,
          operation: "openChannelEventPumpHandle",
          service: "api-gateway"
        });
      }
    }

    const lastOccurredAt = events[events.length - 1]!.occurredAt;
    this.repository.savePumpCursor({
      lastOccurredAt,
      seenEventIds: [
        ...cursor.seenEventIds,
        ...events.map((event) => event.eventId)
      ].slice(-500)
    });
    return result;
  }

  private async handleEvent(event: RealtimeEvent, result: OpenChannelEventPumpRunResult): Promise<void> {
    if (event.resourceType !== "conversation") return;

    if (event.eventName === "conversation.updated") {
      const action = String(event.data.action ?? "");
      const toStatus = String(event.data.toStatus ?? "");
      if (action === "assignment" || action === "transfer") {
        await this.emitWebhook("chat_accepted", event, result);
        this.notifyBotClosed(event, result);
      } else if (toStatus === "closed") {
        await this.emitWebhook("chat_finished", event, result);
        this.notifyBotClosed(event, result);
      }
      return;
    }

    if (event.eventName === "message.created") {
      await this.deliverAgentMessageToChatChannel(event, result);
    }
  }

  private notifyBotClosed(event: RealtimeEvent, result: OpenChannelEventPumpRunResult): void {
    if (!this.botBridge) return;
    const state = this.repository.findConversationState(event.resourceId);
    if (state?.botState === "active") {
      this.botBridge.notifyChatClosed({ conversationId: event.resourceId, tenantId: event.tenantId });
      result.botClosures += 1;
    }
  }

  private async emitWebhook(eventName: "chat_accepted" | "chat_finished", event: RealtimeEvent, result: OpenChannelEventPumpRunResult): Promise<void> {
    const subscriptions = this.repository.listActiveWebhookSubscriptionsForEvent(event.tenantId, eventName);
    if (!subscriptions.length) return;

    const conversation = await this.conversationRepository.findConversation(event.resourceId);
    if (!conversation || conversation.tenantId !== event.tenantId) return;

    const body = eventName === "chat_accepted"
      ? this.buildChatAcceptedPayload(conversation)
      : this.buildChatFinishedPayload(conversation);
    for (const subscription of subscriptions) {
      this.delivery.enqueue({
        body,
        conversationId: conversation.id,
        eventName,
        kind: "webhook",
        tenantId: event.tenantId,
        url: subscription.url
      });
      result.webhooks += 1;
    }
  }

  private buildChatAcceptedPayload(conversation: ConversationRecord): Record<string, unknown> {
    const state = this.repository.findConversationState(conversation.id);
    return {
      ...compatWebhookEventBase("chat_accepted", conversation, state, compatWidgetId(conversation, state?.chatChannelId)),
      analytics: {}
    };
  }

  private buildChatFinishedPayload(conversation: ConversationRecord): Record<string, unknown> {
    const state = this.repository.findConversationState(conversation.id);
    const base = compatWebhookEventBase("chat_finished", conversation, state, compatWidgetId(conversation, state?.chatChannelId));
    const agent = base.agent;
    return {
      ...base,
      agent: undefined,
      agents: agent ? [agent] : [],
      analytics: null,
      chat: {
        blacklisted: false,
        messages: chatMessagesFromConversation(conversation),
        rate: null
      },
      html_messages: "",
      plain_messages: plainMessagesFromConversation(conversation)
    };
  }

  private async deliverAgentMessageToChatChannel(event: RealtimeEvent, result: OpenChannelEventPumpRunResult): Promise<void> {
    const conversation = await this.conversationRepository.findConversation(event.resourceId);
    if (!conversation || conversation.channel !== OPEN_CHAT_CHANNEL) return;

    const state = this.repository.findConversationState(conversation.id);
    const channelId = state?.chatChannelId ?? taggedConnectionId(conversation);
    if (!channelId) return;
    const channel = this.repository.findChatChannel(conversation.tenantId, channelId);
    if (!channel || channel.status !== "active" || !channel.outboundUrl) return;

    const messageId = String(event.data.messageId ?? "");
    const message = conversation.messages.find((item) => String(item.id) === messageId);
    if (!message || message.side !== "agent" || message.type === "internal") return;

    this.delivery.enqueue({
      body: buildOpenChatOutboundEvent({
        clientId: externalClientId(conversation, state),
        messageId,
        operatorName: message.author ?? conversation.operatorName,
        text: message.text,
        timestamp: message.createdAt ? Math.floor(Date.parse(message.createdAt) / 1000) : undefined
      }),
      conversationId: conversation.id,
      eventName: "chat_message",
      kind: "chat_event",
      tenantId: conversation.tenantId,
      url: channel.outboundUrl
    });
    result.chatDeliveries += 1;
  }
}

function compatWidgetId(conversation: ConversationRecord, chatChannelId?: string): string {
  return chatChannelId
    ?? taggedConnectionId(conversation)
    ?? conversation.channelConnectionId
    ?? conversation.channel.toLowerCase();
}

function taggedConnectionId(conversation: ConversationRecord): string | undefined {
  const tag = conversation.tags.find((item) => item.startsWith("connection:"));
  return tag ? tag.slice("connection:".length) : undefined;
}
