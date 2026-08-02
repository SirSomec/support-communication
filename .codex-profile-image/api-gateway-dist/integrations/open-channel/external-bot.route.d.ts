import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import type { ConversationRecord } from "../../conversation/conversation.types.js";
import { OpenChannelRepository, type ExternalBotConnectionRecord } from "./open-channel.repository.js";
import type { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
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
export declare class ExternalBotBridge {
    private readonly agentsOnlineResolver?;
    private readonly delivery;
    private readonly repository;
    constructor(options: ExternalBotBridgeOptions);
    /**
     * Routes an inbound client message to the external bot provider when a bot
     * connection covers the conversation channel. Returns true when the bot now
     * owns the dialog (the caller should skip operator auto-assignment).
     */
    forwardClientMessage(input: {
        channel: string;
        clientId: string;
        conversation: Pick<ConversationRecord, "id" | "name" | "operatorId" | "status">;
        pageUrl?: string;
        senderName?: string;
        tenantId: string;
        text: string;
    }): Promise<boolean>;
    /** CHAT_CLOSED — the dialog was accepted by an agent or closed; the bot must stop. */
    notifyChatClosed(input: {
        conversationId: string;
        tenantId: string;
    }): Promise<void>;
    notifyAgentUnavailable(input: {
        clientId: string;
        connection: ExternalBotConnectionRecord;
        conversationId: string;
        tenantId: string;
    }): Promise<void>;
    private resolveAgentsOnline;
}
export declare function externalBotProviderUrl(connection: ExternalBotConnectionRecord): string;
export interface ExternalBotProviderEventInput {
    autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<{
        status: string;
    }>;
    body: Record<string, unknown>;
    bridge?: Pick<ExternalBotBridge, "notifyAgentUnavailable">;
    connectionId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "queueOutboundMessageReply">;
    repository?: OpenChannelRepository;
    token: string;
}
export declare function handleExternalBotProviderEvent(input: ExternalBotProviderEventInput): Promise<ExternalBotRouteResult>;
export declare function resolveExternalBotConversationId(repository: OpenChannelRepository, tenantId: string, body: Record<string, unknown>): Promise<{
    clientId: string;
    conversationId: string;
} | null>;
export declare function externalBotMessageText(message: Record<string, unknown> | undefined): string;
export declare function externalBotError(statusCode: number, code: string, message: string): ExternalBotRouteResult;
