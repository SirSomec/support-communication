import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { IntegrationService } from "./integration.service.js";
export declare class IntegrationController {
    private readonly integrationService;
    constructor(integrationService: IntegrationService);
    fetchIntegrationWorkspace(): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchIntegrationCapabilities(): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchChannelConnections(request: TenantOperatorRequest, query: {
        type?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createChannelConnection(request: TenantOperatorRequest, payload: {
        chatLimit?: number;
        credentials?: Record<string, unknown>;
        environment?: string;
        name?: string;
        routingQueueId?: string;
        status?: string;
        type?: string;
        webhookUrl?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateChannelTypeStatus(request: TenantOperatorRequest, type: string, payload: {
        enabled?: boolean;
        reason?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateChannelConnection(request: TenantOperatorRequest, connectionId: string, payload: Record<string, unknown>): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    deleteChannelConnection(request: TenantOperatorRequest, connectionId: string, payload?: {
        reason?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    testChannelConnectionInstance(request: TenantOperatorRequest, connectionId: string, payload: {
        environment?: string;
        message?: string;
        mode?: "receive" | "send";
        recipient?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchChannelConnectionEvents(request: TenantOperatorRequest, connectionId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    testChannelConnection(payload: {
        channelId?: string;
        connectionId?: string;
        environment?: string;
        message?: string;
        mode?: "receive" | "send";
        recipient?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createPublicApiKey(payload?: {
        environment?: string;
        name?: string;
        scopes?: string[];
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    rotateApiKey(keyId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    revokePublicApiKey(keyId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createWebhookEndpoint(payload?: {
        channel?: string;
        name?: string;
        url?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateWebhookEndpoint(endpointId: string, payload?: {
        name?: string;
        status?: string;
        url?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    deleteWebhookEndpoint(endpointId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    replayWebhookDelivery(deliveryId: string, payload?: {
        idempotencyKey?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    revokeSecuritySession(sessionId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchTelegramConnection(request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    saveTelegramConnection(request: TenantOperatorRequest, payload: {
        botToken?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    disconnectTelegramConnection(request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
