import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type { IntegrationRepository } from "./integration.repository.js";
import type { ProviderMessageBindingRepository } from "./provider-message-binding.repository.js";
import type { VkUserProfileResolver } from "./vk-user-profile.js";
export interface ProviderWebhookRouteInput {
    body: Record<string, unknown>;
    channel: "MAX" | "VK";
    channelConnectionId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    conversationService: Pick<ConversationService, "appendMessage" | "normalizeInboundEvent" | "recordDeliveryReceipt">;
    headers?: Record<string, string | undefined>;
    integrationRepository: Pick<IntegrationRepository, "findChannelConnectionAsync" | "findProviderConnectionCredentialByConnectionIdAsync">;
    providerMessageBindings?: Pick<ProviderMessageBindingRepository, "advance" | "find">;
    phoneCollectionEnabled?: boolean;
    answerMaxCallback?: (input: {
        accessToken: string;
        callbackId: string;
        message: Record<string, unknown>;
    }) => Promise<boolean>;
    answerVkMessageEvent?: (input: {
        accessToken: string;
        apiVersion: string | null;
        eventId: string;
        peerId: string;
        text: string;
        userId: string;
    }) => Promise<boolean>;
    sendVkMessage?: (input: {
        accessToken: string;
        apiVersion: string | null;
        keyboard?: Record<string, unknown>;
        peerId: string;
        text: string;
    }) => Promise<boolean>;
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
        data?: Record<string, unknown>;
        error?: unknown;
    }>;
    resolveVkUserProfile?: VkUserProfileResolver;
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
export declare function handleProviderWebhookFromRoute(input: ProviderWebhookRouteInput): Promise<unknown>;
