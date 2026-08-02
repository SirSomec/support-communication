import { ConversationService } from "./conversation.service.js";
export declare class ChannelController {
    private readonly conversationService;
    constructor(conversationService: ConversationService);
    fetchChannels(): Promise<import("@support-communication/envelope").BackendEnvelope<{
        items: Array<Record<string, unknown>>;
    }>>;
    normalizeInboundEvent(channel: string, payload: {
        attachments?: Array<Record<string, unknown>>;
        conversationId?: string;
        eventId?: string;
        text?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    recordDeliveryReceipt(channel: string, payload: {
        conversationId?: string;
        idempotencyKey?: string;
        messageId?: string;
        payload?: Record<string, unknown>;
        provider?: string;
        providerEventId?: string;
        receivedAt?: string;
        status?: string;
        tenantId?: string;
        traceId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
