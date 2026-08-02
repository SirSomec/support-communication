import { type BackendEnvelope } from "@support-communication/envelope";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ChannelConnectionStoredRecord, TelegramConnectionStoredRecord } from "./integration.repository.js";
import { type TelegramHttpFetch } from "./telegram-channel-connection.js";
export interface TelegramWebhookConfig {
    enabled: boolean;
    legacySecret?: string;
    legacyTenantId?: string;
}
export interface TelegramWebhookRouteInput {
    autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<BackendEnvelope<Record<string, unknown>>>;
    body: Record<string, unknown>;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "listLifecycleEvents" | "saveConversationMutation">;
    conversationService: Pick<ConversationService, "normalizeInboundEvent">;
    headers: Record<string, string | undefined>;
    integrationRepository: TelegramConnectionReader;
    now?: Date;
    phoneCollectionEnabled?: boolean;
    telegramApi?: {
        apiBaseUrl?: string;
        fetcher?: TelegramHttpFetch;
    };
    recordQualityRating?: (payload: {
        channel?: string;
        clientId?: string;
        conversationId?: string;
        idempotencyKey?: string;
        operator?: string;
        scale?: "CSAT" | "CSI" | "QA";
        score?: number;
        topic?: string;
    }, context: {
        actorId?: string;
        actorType?: "client";
        tenantId?: string;
    }) => Promise<BackendEnvelope<Record<string, unknown>>>;
    runBotRuntime?: (event: {
        channel: string;
        conversationId: string;
        eventId: string;
        payload?: Record<string, unknown>;
        tenantId: string;
        traceId: string;
    }) => Promise<{
        instance?: {
            status?: string;
        };
        outcome?: string;
    }>;
}
export interface TelegramConnectionReader {
    listChannelConnectionsAsync?(filters: {
        tenantId: string;
        type?: string;
    }): Promise<ChannelConnectionStoredRecord[]>;
    listTelegramConnections(): TelegramConnectionStoredRecord[];
    listTelegramConnectionsAsync?(): Promise<TelegramConnectionStoredRecord[]>;
}
export declare function loadTelegramWebhookConfig(env?: Record<string, string | undefined>): TelegramWebhookConfig;
export declare function handleTelegramWebhookFromRoute(input: TelegramWebhookRouteInput, config?: TelegramWebhookConfig): Promise<BackendEnvelope<Record<string, unknown>>>;
export interface TelegramInboundConversationResolution {
    conversation: ConversationRecord | null;
    csatFeedbackAwaiting: boolean;
}
export declare function resolveOrCreateTelegramConversation(input: {
    botId?: string;
    chatId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    displayName: string;
    phone?: string;
    queueId?: string;
    tenantId: string;
    username?: string;
}): Promise<ConversationRecord | null>;
export declare function resolveTelegramInboundConversation(input: {
    botId?: string;
    chatId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    displayName: string;
    phone?: string;
    queueId?: string;
    tenantId: string;
    username?: string;
}): Promise<TelegramInboundConversationResolution>;
export declare function telegramRoutingQueueId(repository: TelegramConnectionReader, tenantId: string, connection: TelegramConnectionStoredRecord | undefined): Promise<string | undefined>;
export declare function telegramConversationId(tenantId: string, botId: string | undefined, chatId: string): string;
export declare function telegramTenantEventId(tenantId: string, botId: string | undefined, providerEventId: string): string;
/** Maps Telegram media to safe metadata. File identifiers remain server-side. */
export declare function telegramMessageAttachments(message: Record<string, unknown>): Array<Record<string, unknown>>;
export interface TelegramRatedTarget {
    conversation: ConversationRecord;
    operator: string | null;
}
export declare function resolveTelegramRatedTarget(repository: Pick<ConversationRepository, "findConversation" | "listConversations" | "listLifecycleEvents">, input: {
    botId?: string;
    chatId: string;
    tenantId: string;
}): Promise<TelegramRatedTarget | null>;
export declare function parseTelegramQualityRating(body: Record<string, unknown>): {
    callbackQueryId: string;
    chatId: string;
    messageId?: string;
    scale: "CSAT" | "CSI";
    score: number;
} | null;
export declare function parseTelegramCsatFeedbackDecline(body: Record<string, unknown>): {
    callbackQueryId: string;
    chatId: string;
    messageId?: string;
} | null;
export declare function telegramWebhookPathFingerprint(tenantId: string, chatId: string): string;
