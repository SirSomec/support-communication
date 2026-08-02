import { type BackendEnvelope } from "@support-communication/envelope";
import { IntegrationRepository, type ChannelConnectionAuditEventRecord } from "./integration.repository.js";
import { type TelegramHttpFetch } from "./telegram-channel-connection.js";
import { QueueDirectoryRepository } from "../routing/queue-directory.repository.js";
import { ProviderConnectionCrypto } from "./provider-connection-crypto.js";
import { type MaxHttpFetch } from "./max-subscription.js";
import { type VkHttpFetch } from "./vk-callback.js";
interface ChannelTestPayload {
    channelId?: string;
    connectionId?: string;
    environment?: string;
    message?: string;
    mode?: "receive" | "send";
    recipient?: string;
}
interface ChannelConnectionMutationPayload {
    chatLimit?: number;
    credentials?: Record<string, unknown>;
    environment?: string;
    name?: string;
    reason?: string;
    routingQueueId?: string;
    status?: string;
    type?: string;
    webhookUrl?: string;
}
interface ChannelTypeStatusMutationPayload {
    enabled?: boolean;
    reason?: string;
}
interface ReplayPayload {
    deliveryId?: string;
    idempotencyKey?: string;
}
interface PublicApiKeyCreatePayload {
    environment?: string;
    name?: string;
    scopes?: string[];
}
interface WebhookEndpointMutationPayload {
    channel?: string;
    name?: string;
    status?: string;
    url?: string;
}
interface IntegrationServiceOptions {
    maxApiBaseUrl?: string;
    maxFetch?: MaxHttpFetch;
    providerCredentialCrypto?: ProviderConnectionCrypto;
    queueDirectoryRepository?: Pick<QueueDirectoryRepository, "findQueue">;
    telegramFetch?: TelegramHttpFetch;
    vkFetch?: VkHttpFetch;
}
export declare class IntegrationService {
    private readonly integrationRepository;
    private readonly options;
    private readonly workspace;
    private readonly channels;
    private readonly apiKeys;
    private readonly deliveries;
    private readonly sessions;
    private readonly replayIdempotency;
    private readonly queueDirectoryRepository?;
    constructor(integrationRepository?: IntegrationRepository, options?: IntegrationServiceOptions);
    fetchIntegrationWorkspace(): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchIntegrationCapabilities(): Promise<BackendEnvelope<Record<string, unknown>>>;
    listChannelConnectionAuditEvents(): ChannelConnectionAuditEventRecord[];
    fetchChannelConnections(tenantId: string, filters?: {
        type?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    createChannelConnection(tenantId: string, payload: ChannelConnectionMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateChannelConnection(tenantId: string, connectionId: string, payload: ChannelConnectionMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateChannelTypeStatus(tenantId: string, type: string, payload: ChannelTypeStatusMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteChannelConnection(tenantId: string, connectionId: string, payload?: {
        reason?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    testChannelConnectionInstance(tenantId: string, connectionId: string, payload: Omit<ChannelTestPayload, "channelId" | "connectionId">): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchChannelConnectionEvents(tenantId: string, connectionId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    testChannelConnection(payload: ChannelTestPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    rotateApiKey(keyId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    createPublicApiKey(payload?: PublicApiKeyCreatePayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    revokePublicApiKey(keyId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    createWebhookEndpoint(payload?: WebhookEndpointMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateWebhookEndpoint(endpointId: string, payload?: WebhookEndpointMutationPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteWebhookEndpoint(endpointId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    private resolveWebhookEndpointView;
    replayWebhookDelivery(payload: ReplayPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchTelegramConnection(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    saveTelegramConnection(tenantId: string, payload: {
        botToken?: string;
    }, options?: {
        fetcher?: TelegramHttpFetch;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    disconnectTelegramConnection(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    revokeSecuritySession(sessionId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    private findApiKey;
    private findChannelConnection;
    private validateRoutingQueue;
    private findChannel;
    private findDelivery;
    private findReplay;
    private recordChannelConnectionEvent;
    private persistChannelConnectionAuditEvent;
}
export {};
