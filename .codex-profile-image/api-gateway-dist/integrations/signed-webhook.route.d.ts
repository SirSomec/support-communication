import type { ConversationService } from "../conversation/conversation.service.js";
import { type SignedWebhookNonceStore } from "./signed-webhook-verifier.js";
export interface SignedInboundWebhookRouteInput {
    body: string;
    channel: string;
    conversationService: Pick<ConversationService, "normalizeInboundEvent">;
    endpointId: string;
    headers?: Record<string, string | undefined>;
    nonceStore: SignedWebhookNonceStore;
    now: string;
    secret: string;
}
export declare function normalizeSignedInboundWebhookFromRoute(input: SignedInboundWebhookRouteInput): Promise<import("@support-communication/envelope").BackendEnvelope<{
    normalizationDescriptor: null;
    endpointId?: string | undefined;
    firstSeenAt?: string | undefined;
    nonce?: string | undefined;
    replay?: boolean | undefined;
}> | import("@support-communication/envelope").BackendEnvelope<{
    duplicate: boolean;
    eventId: string;
    normalizationDescriptor: import("./signed-webhook-verifier.js").VerifiedInboundWebhookNormalizationDescriptor;
}> | {
    data: {
        normalizationDescriptor: import("./signed-webhook-verifier.js").VerifiedInboundWebhookNormalizationDescriptor;
    };
    service: string;
    operation: string;
    status: import("@support-communication/envelope").EnvelopeStatus;
    partial: boolean;
    traceId: string;
    updatedAt: string;
    states: import("@support-communication/envelope").EnvelopeStates;
    meta: Record<string, unknown>;
    error: null | {
        code: string;
        message: string;
        details?: unknown;
    };
}>;
