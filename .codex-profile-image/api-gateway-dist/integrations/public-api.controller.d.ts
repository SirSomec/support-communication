import { AutomationService } from "../automation/automation.service.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { RoutingService } from "../routing/routing.service.js";
import { QualityService } from "../quality/quality.service.js";
import { WorkspaceService } from "../workspace/workspace.service.js";
import { type PublicApiEnvironment, type PublicApiKeyLookup } from "./public-api-auth.js";
import { type PublicSdkPresenceBody } from "./public-sdk-presence.route.js";
import { type WidgetClientInfoBody } from "./open-channel/client-info.route.js";
export declare class PublicApiController {
    private readonly conversationService;
    private readonly routingService;
    private readonly qualityService;
    private readonly automationService;
    private readonly workspaceService;
    private readonly conversationRepository;
    private readonly integrationRepository;
    private readonly proactiveExposureRepository;
    protected readonly lookup: PublicApiKeyLookup;
    constructor(conversationService?: ConversationService, routingService?: RoutingService, qualityService?: QualityService, automationService?: AutomationService, workspaceService?: WorkspaceService);
    createPublicSdkUpload(authorization: string | undefined, environment?: PublicApiEnvironment, payload?: {
        fileName?: string;
        mimeType?: string;
        sizeBytes?: number;
    }): Promise<unknown>;
    finalizePublicSdkUpload(authorization: string | undefined, fileId: string, environment?: PublicApiEnvironment, payload?: {
        checksum?: string;
    }): Promise<unknown>;
    heartbeatPublicSdkPresence(authorization: string | undefined, environment?: PublicApiEnvironment, payload?: PublicSdkPresenceBody): Promise<import("@support-communication/envelope").BackendEnvelope<{}>>;
    disconnectPublicSdkPresence(authorization: string | undefined, environment?: PublicApiEnvironment, payload?: PublicSdkPresenceBody): Promise<import("@support-communication/envelope").BackendEnvelope<{}>>;
    pollPublicSdkInvitations(authorization: string | undefined, sessionId: string | undefined, environment?: PublicApiEnvironment): Promise<import("@support-communication/envelope").BackendEnvelope<{}>>;
    acknowledgePublicSdkInvitation(authorization: string | undefined, exposureId: string, action: "shown" | "dismissed" | "accepted" | "failed", environment?: PublicApiEnvironment, payload?: {
        conversationId?: string;
        failureCode?: string;
        sessionId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<{}>> | {
        status: string;
        data: {};
        error: {
            code: string;
            message: string;
        };
    };
    identifyPublicClient(authorization: string | undefined, environment?: PublicApiEnvironment, payload?: {
        externalId?: string;
        traits?: Record<string, unknown>;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    sendPublicSdkMessage(authorization: string | undefined, environment?: PublicApiEnvironment, payload?: {
        conversationId?: string;
        externalId?: string;
        pageUrl?: string;
        text?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    /**
     * An external bot connected through the External Bot API takes priority over
     * the built-in scenario runtime; when it owns the dialog the message is
     * forwarded to the provider and operator auto-assignment is suppressed.
     */
    private runBotRuntimeWithExternalBridge;
    updatePublicSdkClientInfo(authorization: string | undefined, environment?: PublicApiEnvironment, payload?: WidgetClientInfoBody): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchPublicSdkAgentsStatus(authorization: string | undefined, environment?: PublicApiEnvironment): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    recordPublicSdkQualityRating(authorization: string | undefined, conversationId: string, environment?: PublicApiEnvironment, payload?: {
        idempotencyKey?: string;
        scale?: "CSAT" | "CSI";
        score?: number;
        visitorSessionToken?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    declinePublicSdkCsatFeedback(authorization: string | undefined, conversationId: string, environment?: PublicApiEnvironment, payload?: {
        visitorSessionToken?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    private resolveSdkQueueId;
    private withPublicSdkWriteAccess;
    pollPublicSdkConversationMessages(authorization: string | undefined, conversationId: string, visitorSessionToken: string | undefined, since: string | undefined, environment?: PublicApiEnvironment): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
