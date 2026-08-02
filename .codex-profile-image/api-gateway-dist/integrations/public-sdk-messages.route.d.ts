import { type BackendEnvelope } from "@support-communication/envelope";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import { type PublicApiEnvironment, type PublicApiKeyLookup } from "./public-api-auth.js";
import type { ProactiveExposureRepository } from "../automation/proactive-exposure.repository.js";
interface PublicSdkConversationIdentityInput {
    conversationId?: string;
    externalId?: string;
    pageUrl?: string;
    queueId?: string;
    tenantId: string;
}
export interface PublicSdkMessageRouteInput {
    autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<BackendEnvelope<Record<string, unknown>>>;
    authorization?: string;
    body: {
        attachments?: Array<Record<string, unknown>>;
        conversationId?: string;
        externalId?: string;
        pageUrl?: string;
        text?: string;
    };
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    conversationService: Pick<ConversationService, "normalizeInboundEvent">;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    resolveQueueId?: (tenantId: string, channelConnectionId?: string | null) => Promise<string | undefined>;
    recordProactiveConversion?: Pick<ProactiveExposureRepository, "recordMessageConversion">;
    runBotRuntime?: BotRuntimeRunner;
}
type BotRuntimeRunner = (event: {
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
export interface PublicSdkPollRouteInput {
    authorization?: string;
    conversationId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation">;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    resolveDeliveryAttachments?: (attachments: Array<Record<string, unknown>>, tenantId: string) => Promise<Array<Record<string, unknown>>>;
    since?: string;
    visitorSessionToken?: string;
}
export interface PublicSdkRatingRouteInput {
    authorization?: string;
    body: {
        idempotencyKey?: string;
        scale?: "CSAT" | "CSI";
        score?: number;
        visitorSessionToken?: string;
    };
    conversationId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "saveConversationMutation">;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    recordQualityRating: (payload: {
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
}
export interface PublicSdkCsatFeedbackDeclineRouteInput {
    authorization?: string;
    body: {
        visitorSessionToken?: string;
    };
    conversationId: string;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "saveConversationMutation">;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
}
export interface PublicSdkInboundConversationResolution {
    conversation: ConversationRecord | null;
    csatFeedbackAwaiting: boolean;
}
export declare function resolveOrCreatePublicSdkConversation(input: PublicSdkConversationIdentityInput & {
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
}): Promise<ConversationRecord | null>;
export declare function resolvePublicSdkInboundConversation(input: PublicSdkConversationIdentityInput & {
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
}): Promise<PublicSdkInboundConversationResolution>;
export declare function handlePublicSdkMessageIngressFromRoute(input: PublicSdkMessageRouteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
export declare function handlePublicSdkMessagesPollFromRoute(input: PublicSdkPollRouteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
export declare function handlePublicSdkQualityRatingFromRoute(input: PublicSdkRatingRouteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
export declare function handlePublicSdkCsatFeedbackDeclineFromRoute(input: PublicSdkCsatFeedbackDeclineRouteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
export declare function createVisitorSessionToken(payload: {
    conversationId: string;
    tenantId: string;
}): string;
export declare function validateVisitorSessionToken(token: string | undefined, expected: {
    conversationId: string;
    tenantId: string;
}): {
    valid: true;
} | {
    valid: false;
    code: string;
};
export {};
