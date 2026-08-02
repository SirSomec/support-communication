import { type BackendEnvelope } from "@support-communication/envelope";
import { type TenantOperatorRequest } from "../../identity/tenant-operator-auth.js";
export declare class OpenChannelAdminController {
    private readonly repository;
    listChatChannels(request: TenantOperatorRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
    createChatChannel(request: TenantOperatorRequest, payload?: {
        name?: string;
        outboundUrl?: string;
        routingQueueId?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateChatChannel(request: TenantOperatorRequest, id: string, payload?: {
        name?: string;
        outboundUrl?: string;
        routingQueueId?: string;
        rotateToken?: boolean;
        status?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteChatChannel(request: TenantOperatorRequest, id: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    listBotConnections(request: TenantOperatorRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
    createBotConnection(request: TenantOperatorRequest, payload?: {
        channels?: string[];
        name?: string;
        providerUrl?: string;
        token?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateBotConnection(request: TenantOperatorRequest, id: string, payload?: {
        channels?: string[];
        name?: string;
        providerUrl?: string;
        status?: string;
        token?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteBotConnection(request: TenantOperatorRequest, id: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    listWebhookSubscriptions(request: TenantOperatorRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
    createWebhookSubscription(request: TenantOperatorRequest, payload?: {
        events?: string[];
        url?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateWebhookSubscription(request: TenantOperatorRequest, id: string, payload?: {
        events?: string[];
        status?: string;
        url?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteWebhookSubscription(request: TenantOperatorRequest, id: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    listDeliveries(request: TenantOperatorRequest, query?: {
        kind?: string;
        status?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
}
