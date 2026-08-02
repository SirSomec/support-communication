import { type BackendEnvelope } from "@support-communication/envelope";
import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import { type PublicApiEnvironment, type PublicApiKeyLookup } from "../public-api-auth.js";
import { OpenChannelRepository } from "./open-channel.repository.js";
import type { OpenChannelDeliveryService } from "./open-channel-delivery.service.js";
/**
 * Widget-facing endpoint behind sw_api.setContactInfo / setCustomData /
 * setUserToken / setClientAttributes. Stores the client card, mirrors the
 * data to the agent as a dialog event and emits the
 * `chat_updated` / `client_attribute_updated` event webhooks.
 */
export interface WidgetClientInfoBody {
    attributes?: Record<string, unknown>;
    contactInfo?: {
        description?: string;
        email?: string;
        name?: string;
        phone?: string;
    };
    conversationId?: string;
    customData?: Array<{
        content?: string;
        key?: string;
        link?: string;
        title?: string;
    }>;
    externalId?: string;
    pageTitle?: string;
    pageUrl?: string;
    userToken?: string;
}
export interface WidgetClientInfoRouteInput {
    authorization?: string;
    body: WidgetClientInfoBody;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "saveConversationMutation">;
    delivery?: Pick<OpenChannelDeliveryService, "enqueue">;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    repository?: OpenChannelRepository;
}
export declare function handleWidgetClientInfoFromRoute(input: WidgetClientInfoRouteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
export declare function handleAgentsOnlineStatus(input: {
    authorization?: string;
    environment: PublicApiEnvironment;
    lookup: PublicApiKeyLookup;
    resolveAgentsOnline: (tenantId: string) => Promise<boolean> | boolean;
}): Promise<BackendEnvelope<Record<string, unknown>>>;
