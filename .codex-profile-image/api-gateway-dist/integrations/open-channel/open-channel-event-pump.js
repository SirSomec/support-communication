import { writeStructuredLog } from "@support-communication/observability";
import { OpenChannelRepository } from "./open-channel.repository.js";
import { OPEN_CHAT_CHANNEL, buildOpenChatOutboundEvent } from "./open-chat.route.js";
import { chatMessagesFromConversation, externalClientId, plainMessagesFromConversation, compatWebhookEventBase } from "./open-channel-payload.js";
export class OpenChannelEventPump {
    activeRun = null;
    botBridge;
    conversationRepository;
    delivery;
    repository;
    timer = null;
    constructor(options) {
        this.botBridge = options.botBridge;
        this.conversationRepository = options.conversationRepository;
        this.delivery = options.delivery;
        this.repository = options.repository ?? OpenChannelRepository.default();
    }
    start(intervalMs = 2_000) {
        if (this.timer)
            return;
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
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
    runOnce() {
        if (this.activeRun)
            return this.activeRun;
        const run = this.executeRunOnce();
        this.activeRun = run;
        void run.then(() => { if (this.activeRun === run)
            this.activeRun = null; }, () => { if (this.activeRun === run)
            this.activeRun = null; });
        return run;
    }
    async executeRunOnce() {
        const cursor = await this.repository.readPumpCursor();
        const events = (await this.conversationRepository.listRealtimeEvents({
            allTenants: true,
            since: cursor.seenEventIds.at(-1) ?? "1970-01-01T00:00:00.000Z",
            take: 500
        }))
            .filter((event) => !cursor.lastOccurredAt || event.occurredAt >= cursor.lastOccurredAt)
            .filter((event) => !cursor.seenEventIds.includes(event.eventId))
            .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.eventId.localeCompare(right.eventId));
        const result = { botClosures: 0, chatDeliveries: 0, scanned: events.length, webhooks: 0 };
        if (!events.length)
            return result;
        const processedEventIds = [];
        let lastOccurredAt = cursor.lastOccurredAt;
        for (const event of events) {
            try {
                await this.handleEvent(event, result);
                processedEventIds.push(event.eventId);
                lastOccurredAt = event.occurredAt;
            }
            catch (error) {
                writeStructuredLog("warn", "Open channel event pump handler failed", {
                    errorMessage: error instanceof Error ? error.message : String(error),
                    eventId: event.eventId,
                    eventName: event.eventName,
                    operation: "openChannelEventPumpHandle",
                    service: "api-gateway"
                });
                break;
            }
        }
        if (processedEventIds.length > 0) {
            await this.repository.savePumpCursor({
                lastOccurredAt,
                seenEventIds: [
                    ...cursor.seenEventIds,
                    ...processedEventIds
                ].slice(-500)
            });
        }
        return result;
    }
    async handleEvent(event, result) {
        if (event.resourceType !== "conversation")
            return;
        if (event.eventName === "conversation.updated") {
            const action = String(event.data.action ?? "");
            const toStatus = String(event.data.toStatus ?? "");
            if (action === "assignment" || action === "transfer") {
                await this.emitWebhook("chat_accepted", event, result);
                await this.notifyBotClosed(event, result);
            }
            else if (toStatus === "closed") {
                await this.emitWebhook("chat_finished", event, result);
                await this.notifyBotClosed(event, result);
            }
            return;
        }
        if (event.eventName === "message.created") {
            await this.deliverAgentMessageToChatChannel(event, result);
        }
    }
    async notifyBotClosed(event, result) {
        if (!this.botBridge)
            return;
        const state = await this.repository.findConversationState(event.resourceId);
        if (state?.botState === "active") {
            await this.botBridge.notifyChatClosed({ conversationId: event.resourceId, tenantId: event.tenantId });
            result.botClosures += 1;
        }
    }
    async emitWebhook(eventName, event, result) {
        const subscriptions = await this.repository.listActiveWebhookSubscriptionsForEvent(event.tenantId, eventName);
        if (!subscriptions.length)
            return;
        const conversation = await this.conversationRepository.findConversation(event.resourceId);
        if (!conversation || conversation.tenantId !== event.tenantId)
            return;
        const body = eventName === "chat_accepted"
            ? await this.buildChatAcceptedPayload(conversation)
            : await this.buildChatFinishedPayload(conversation);
        for (const subscription of subscriptions) {
            await this.delivery.enqueue({
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
    async buildChatAcceptedPayload(conversation) {
        const state = await this.repository.findConversationState(conversation.id);
        return {
            ...compatWebhookEventBase("chat_accepted", conversation, state, compatWidgetId(conversation, state?.chatChannelId)),
            analytics: {}
        };
    }
    async buildChatFinishedPayload(conversation) {
        const state = await this.repository.findConversationState(conversation.id);
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
    async deliverAgentMessageToChatChannel(event, result) {
        const conversation = await this.conversationRepository.findConversation(event.resourceId);
        if (!conversation || conversation.channel !== OPEN_CHAT_CHANNEL)
            return;
        const state = await this.repository.findConversationState(conversation.id);
        const channelId = state?.chatChannelId ?? taggedConnectionId(conversation);
        if (!channelId)
            return;
        const channel = await this.repository.findChatChannel(conversation.tenantId, channelId);
        if (!channel || channel.status !== "active" || !channel.outboundUrl)
            return;
        const messageId = String(event.data.messageId ?? "");
        const message = conversation.messages.find((item) => String(item.id) === messageId);
        if (!message || message.side !== "agent" || message.type === "internal")
            return;
        await this.delivery.enqueue({
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
function compatWidgetId(conversation, chatChannelId) {
    return chatChannelId
        ?? taggedConnectionId(conversation)
        ?? conversation.channelConnectionId
        ?? conversation.channel.toLowerCase();
}
function taggedConnectionId(conversation) {
    const tag = conversation.tags.find((item) => item.startsWith("connection:"));
    return tag ? tag.slice("connection:".length) : undefined;
}
//# sourceMappingURL=open-channel-event-pump.js.map