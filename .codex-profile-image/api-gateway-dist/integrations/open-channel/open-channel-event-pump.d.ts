import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import { OpenChannelRepository } from "./open-channel.repository.js";
import type { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
import type { ExternalBotBridge } from "./external-bot.route.js";
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
export declare class OpenChannelEventPump {
    private activeRun;
    private readonly botBridge?;
    private readonly conversationRepository;
    private readonly delivery;
    private readonly repository;
    private timer;
    constructor(options: OpenChannelEventPumpOptions);
    start(intervalMs?: number): void;
    stop(): void;
    runOnce(): Promise<OpenChannelEventPumpRunResult>;
    private executeRunOnce;
    private handleEvent;
    private notifyBotClosed;
    private emitWebhook;
    private buildChatAcceptedPayload;
    private buildChatFinishedPayload;
    private deliverAgentMessageToChatChannel;
}
