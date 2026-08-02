import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import type { ConversationService } from "../../conversation/conversation.service.js";
import type { ConversationRecord } from "../../conversation/conversation.types.js";
import { OpenChannelRepository, type OpenChatChannelRecord } from "./open-channel.repository.js";
import type { ExternalBotBridge } from "./external-bot.route.js";
/**
 * Open Channel chat — the symmetric {sender, recipient, message} event
 * protocol for custom channels, wire-compatible with the format used by
 * popular live-chat platforms. We accept POST events on
 * `/open-channel/:token` and answer 2xx/4xx by the same convention, so
 * customer servers keep their retry logic unchanged.
 */
export declare const OPEN_CHAT_CHANNEL = "CHATAPI";
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
    channelToken: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    conversationService: Pick<ConversationService, "normalizeInboundEvent" | "transitionConversationStatus">;
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
    }) => Promise<{
        status: string;
    }>;
    repository?: OpenChannelRepository;
}
export declare function handleOpenChatInbound(input: OpenChatInboundInput): Promise<OpenChatRouteResult>;
export declare function handleOpenChatStatus(input: {
    channelToken: string;
    conversationRepository: Pick<ConversationRepository, "listConversations">;
    repository?: OpenChannelRepository;
}): Promise<OpenChatRouteResult>;
export declare function resolveOrCreateOpenChatConversation(input: {
    channel: OpenChatChannelRecord;
    clientId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    sender: OpenChatUser;
}): Promise<ConversationRecord | null>;
export declare function openChatConversationKey(tenantId: string, channelId: string, clientId: string): string;
/** Renders any inbound Chat API message into the plain-text dialog transcript. */
export declare function openChatMessageText(type: string, message: OpenChatMessage): string;
export declare function openChatMessageAttachments(type: string, message: OpenChatMessage): Array<Record<string, unknown>>;
/** 0 → declined (null), positive → 5, negative → 1 (CSAT scale 1..5). */
export declare function normalizeOpenChatRate(value: unknown): number | null;
/** Builds an outbound Chat API event ({sender: agent, recipient: client, message}). */
export declare function buildOpenChatOutboundEvent(input: {
    clientId: string;
    messageId: string;
    operatorName?: string;
    text: string;
    timestamp?: number;
}): Record<string, unknown>;
