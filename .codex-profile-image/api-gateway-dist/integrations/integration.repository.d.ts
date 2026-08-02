import type { ApiEnvironmentKey, ChannelDetail, SecuritySession, WebhookDelivery } from "./integration.types.js";
import { type PublicApiEnvironment, type PublicApiKeyRecord } from "./public-api-auth.js";
export interface ApiKeyRotationJob {
    auditId: string;
    environment: string;
    keyId: string;
    rawKeyShownOnce: false;
    requires2fa: true;
    rotationId: string;
    status: string;
}
export interface ApiKeyRotationAuditEvent {
    action: "public_api_key.created" | "public_api_key.revoked" | "public_api_key.rotation_queued";
    at: string;
    auditId: string;
    environment: string;
    immutable: true;
    keyId: string;
    keyPreview: string;
    rotationId: string;
    status: string;
}
export interface WebhookReplayJournalEntry {
    auditId: string;
    deliveryId: string;
    idempotencyKey: string;
    originalTraceId: string;
    replayId: string;
    signatureVerified: boolean;
    status: string;
}
export interface WebhookReplayAuditEvent {
    action: "webhook.replay.queued" | "webhook.replay.duplicate";
    at: string;
    attempts: number;
    auditId: string;
    deliveryId: string;
    deliveryStatus: string;
    id: string;
    idempotencyKey: string | null;
    immutable: true;
    originalTraceId: string;
    replayId: string;
    transition: "dead_letter" | "duplicate" | "replay" | "retry";
}
export interface WebhookDeliveryJournalEntry {
    attempts: number;
    createdAt: string;
    deadLetteredAt?: string;
    deliveryId: string;
    endpointId: string;
    eventType: string;
    idempotencyKey: string;
    lastAttemptAt?: string;
    lastError?: WebhookDeliveryJournalError;
    lockedAt?: string;
    nextAttemptAt?: string;
    payloadRef: string;
    queue: "webhook-delivery";
    status: string;
    targetUrl: string;
    tenantId: string;
    traceId: string;
}
export interface WebhookDeliveryJournalError {
    code: string;
    message: string;
    statusCode?: number;
}
export interface WebhookDeliveryJournalFilters {
    status?: string;
}
export interface ClaimWebhookDeliveryJournalEntriesInput {
    leaseTimeoutMs?: number;
    limit?: number;
    now: string;
    queue?: string;
}
export interface RecordWebhookDeliveryRetryStateInput {
    attempts: number;
    deliveryId: string;
    lastAttemptAt: string;
    lastError: WebhookDeliveryJournalError;
    nextAttemptAt: string;
}
export interface RecordWebhookDeliveryAttemptSuccessInput {
    attemptedAt: string;
    deliveryId: string;
}
export interface RecordWebhookDeliveryDeadLetterStateInput {
    attempts: number;
    deadLetteredAt: string;
    deliveryId: string;
    lastAttemptAt: string;
    lastError: WebhookDeliveryJournalError;
}
export interface PublicApiKeyStoredRecord extends PublicApiKeyRecord {
    createdAt: string;
    keyPreview: string;
    name: string;
    owner: string;
}
export interface PublicApiKeyRevealStateRecord {
    consumedAt: string | null;
    createdAt: string;
    keyId: string;
    keyPreview: string;
    status: "available" | "consumed";
}
export interface ConsumePublicApiKeyRevealInput {
    consumedAt: string;
    keyId: string;
}
export interface PublicApiKeyRevealResult {
    consumedAt: string;
    keyId: string;
    keyPreview?: string;
    rawSecret?: string;
    status: "consumed" | "not_found" | "revealed";
}
export interface UpdatePublicApiKeyStatusInput {
    keyId: string;
    status: PublicApiKeyRecord["status"];
}
export interface WebhookEndpointStoredRecord {
    channel: string;
    createdAt: string;
    custom: boolean;
    deleted: boolean;
    failureRate: string;
    id: string;
    lastDelivery: string;
    name: string;
    retries: string;
    signature: string;
    status: string;
    updatedAt: string;
    url: string;
}
export interface PrismaWebhookEndpointRow {
    channel: string;
    createdAt: Date;
    custom: boolean;
    deleted: boolean;
    failureRate: string;
    id: string;
    lastDelivery: string;
    name: string;
    retries: string;
    signature: string;
    status: string;
    updatedAt: Date;
    url: string;
}
export interface PublicDemoRequestRecord {
    company: string;
    consent: true;
    createdAt: string;
    email: string;
    id: string;
    idempotencyKey: string | null;
    ipHash: string | null;
    message: string;
    name: string;
    planInterest: string | null;
    requestFingerprint: string;
    source: string;
    status: "queued";
    updatedAt: string;
    userAgentHash: string | null;
}
export interface PublicDemoRequestAuditEvent {
    action: "public_demo_request.created" | "public_demo_request.duplicate" | "public_demo_request.rate_limited";
    at: string;
    id: string;
    immutable: true;
    leadId: string | null;
    requestFingerprint: string;
    result: "ok" | "duplicate" | "rate_limited";
    source: string;
}
export interface PublicDemoRequestNotificationDescriptor {
    createdAt: string;
    id: string;
    leadId: string;
    payload: {
        company: string;
        delivery?: PublicDemoRequestNotificationDeliveryState;
        email: string;
        messagePreview: string;
        name: string;
        planInterest: string | null;
        source: string;
    };
    queue: "lead-notification";
    status: PublicDemoRequestNotificationStatus;
    type: "public.demo_request.notification.requested";
}
export type PublicDemoRequestNotificationStatus = "queued" | "delivered" | "failed";
export interface PublicDemoRequestNotificationDeliveryState {
    attempts: number;
    deliveredAt?: string;
    failedAt?: string;
    lastError?: PublicDemoRequestNotificationDeliveryError;
    providerMessageId?: string;
}
export interface PublicDemoRequestNotificationDeliveryError {
    code: "public_demo_request_notification_delivery_failed";
    message: string;
}
export interface PublicDemoRequestNotificationDescriptorFilters {
    limit?: number;
    queue?: "lead-notification";
    status?: PublicDemoRequestNotificationStatus;
}
export interface PublicDemoRequestNotificationDescriptorSummary {
    deadLetterCount: number;
    latestDescriptor: PublicDemoRequestNotificationDescriptor | null;
    queue: "lead-notification";
    queueDepth: number;
}
export interface SavePublicApiKeyInput {
    channelConnectionId?: string | null;
    createdAt: string;
    environment: PublicApiEnvironment;
    keyId: string;
    name: string;
    owner: string;
    rawSecret: string;
    scopes: string[];
    status: PublicApiKeyRecord["status"];
    tenantId: string;
}
export interface EnsurePublicApiKeyReferenceInput {
    channelConnectionId?: string | null;
    createdAt: string;
    environment: PublicApiEnvironment;
    keyId: string;
    keyPreview: string;
    name: string;
    owner: string;
    scopes: string[];
    status: PublicApiKeyRecord["status"];
    tenantId: string;
}
export interface IntegrationWorkspaceCatalog {
    apiChangelog: Array<Record<string, unknown>>;
    apiEnvironmentKeys: ApiEnvironmentKey[];
    channelDetails: ChannelDetail[];
    securityAlerts: Array<Record<string, unknown>>;
    securityControls: Array<Record<string, unknown>>;
    webhookDeliveryLog: WebhookDelivery[];
    webhookEndpoints: Array<Record<string, unknown>>;
}
export interface IntegrationState {
    apiKeyRotationAuditEvents: ApiKeyRotationAuditEvent[];
    apiKeyRotationJobs: ApiKeyRotationJob[];
    channelConnectionAuditEvents: ChannelConnectionAuditEventRecord[];
    channelConnectionEvents: ChannelConnectionEventRecord[];
    channelConnections: ChannelConnectionStoredRecord[];
    providerConnectionCredentials?: ProviderConnectionCredentialRecord[];
    publicApiKeys: PublicApiKeyStoredRecord[];
    publicApiKeyRevealStates: PublicApiKeyRevealStateRecord[];
    publicDemoRequestAuditEvents: PublicDemoRequestAuditEvent[];
    publicDemoRequestNotificationDescriptors: PublicDemoRequestNotificationDescriptor[];
    publicDemoRequests: PublicDemoRequestRecord[];
    securitySessions: SecuritySession[];
    sdkVisitorPresenceSessions: SdkVisitorPresenceSessionRecord[];
    telegramConnections: TelegramConnectionStoredRecord[];
    webhookDeliveryJournal: WebhookDeliveryJournalEntry[];
    webhookEndpointRecords: WebhookEndpointStoredRecord[];
    webhookReplayAuditEvents: WebhookReplayAuditEvent[];
    webhookReplayJournal: WebhookReplayJournalEntry[];
    workspace: IntegrationWorkspaceCatalog;
}
export interface SdkVisitorPresenceSessionRecord {
    channelConnectionId: string;
    connected: boolean;
    createdAt: string;
    disconnectedAt: string | null;
    expiresAt: string;
    firstSeenAt: string;
    id: string;
    lastSeenAt: string;
    pagePath: string | null;
    pageUrl: string | null;
    referrer: string | null;
    sessionKeyHash: string;
    subjectId: string;
    tenantId: string;
    updatedAt: string;
}
export interface UpsertSdkVisitorPresenceInput {
    channelConnectionId: string;
    expiresAt: string;
    lastSeenAt: string;
    pagePath: string | null;
    pageUrl: string | null;
    referrer: string | null;
    sessionKeyHash: string;
    subjectId: string;
    tenantId: string;
}
export interface TelegramConnectionStoredRecord {
    channelConnectionId: string;
    botId: string | null;
    botToken: string;
    botUsername: string | null;
    pollingOffset?: number;
    createdAt: string;
    status: "active" | "disabled";
    tenantId: string;
    tokenPreview: string;
    updatedAt: string;
    webhookSecret: string;
}
export interface ProviderConnectionCredentialRecord {
    accessTokenEncrypted: string;
    apiVersion: string | null;
    channelConnectionId: string;
    confirmationCodeEncrypted: string | null;
    createdAt: string;
    externalAccountId: string;
    keyVersion: string;
    lastError: string | null;
    lastWebhookAt: string | null;
    provider: string;
    status: string;
    tenantId: string;
    updatedAt: string;
    webhookSecretEncrypted: string;
}
export interface ChannelConnectionStoredRecord {
    chatLimit: number;
    credentialsMasked: boolean;
    createdAt: string;
    environment: string;
    health: number;
    id: string;
    lastSyncAt: string;
    name: string;
    rawExternalId: string;
    routingQueueId: string;
    status: string;
    tenantId: string;
    traffic: string;
    type: string;
    updatedAt: string;
    webhookUrl: string;
}
export interface ChannelConnectionEventRecord {
    action: string;
    at: string;
    connectionId: string;
    id: string;
    message: string;
    severity: string;
    tenantId: string;
}
export interface ChannelConnectionAuditEventRecord {
    action: string;
    at: string;
    connectionId: string;
    id: string;
    immutable: true;
    reason: string;
    result: string;
    tenantId: string;
    type: string;
}
export interface PrismaIntegrationRepositoryOptions {
    client: PrismaIntegrationClient;
    seed?: IntegrationState;
}
type MaybePromise<T> = T | Promise<T>;
export interface PrismaIntegrationClient {
    $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): MaybePromise<T>;
    channelConnection: {
        delete(input: {
            where: {
                id: string;
            };
        }): MaybePromise<PrismaChannelConnectionRow>;
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
            where?: PrismaChannelConnectionWhereInput;
        }): MaybePromise<PrismaChannelConnectionRow[]>;
        findUnique(input: {
            where: {
                id: string;
            };
        }): MaybePromise<PrismaChannelConnectionRow | null>;
        upsert(input: {
            create: PrismaChannelConnectionCreateInput;
            update: PrismaChannelConnectionUpdateInput;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaChannelConnectionRow>;
    };
    channelConnectionAuditEvent: {
        create(input: {
            data: PrismaChannelConnectionAuditEventCreateInput;
        }): MaybePromise<PrismaChannelConnectionAuditEventRow>;
        findMany(input: {
            orderBy?: {
                at: "asc" | "desc";
            };
            where?: PrismaChannelConnectionAuditEventWhereInput;
        }): MaybePromise<PrismaChannelConnectionAuditEventRow[]>;
    };
    channelConnectionEvent: {
        create(input: {
            data: PrismaChannelConnectionEventCreateInput;
        }): MaybePromise<PrismaChannelConnectionEventRow>;
        findMany(input: {
            orderBy?: {
                at: "asc" | "desc";
            };
            where?: PrismaChannelConnectionEventWhereInput;
        }): MaybePromise<PrismaChannelConnectionEventRow[]>;
    };
    integrationApiKeyRotationJob: {
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
        }): MaybePromise<PrismaApiKeyRotationJobRow[]>;
        upsert(input: {
            create: PrismaApiKeyRotationJobCreateInput;
            update: PrismaApiKeyRotationJobUpdateInput;
            where: {
                rotationId: string;
            };
        }): MaybePromise<PrismaApiKeyRotationJobRow>;
    };
    publicApiKey: {
        create(input: {
            data: PrismaPublicApiKeyCreateInput;
        }): MaybePromise<PrismaPublicApiKeyRow>;
        deleteMany(input: {
            where: {
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
        updateMany(input: {
            data: {
                channelConnectionId: null;
                updatedAt: Date;
            };
            where: {
                channelConnectionId: string;
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
            where?: PrismaPublicApiKeyWhereInput;
        }): MaybePromise<PrismaPublicApiKeyRow[]>;
        findUnique(input: {
            where: {
                keyId: string;
            };
        }): MaybePromise<PrismaPublicApiKeyRow | null>;
        upsert(input: {
            create: PrismaPublicApiKeyCreateInput;
            update: PrismaPublicApiKeyReferenceUpdateInput | PrismaPublicApiKeyUpdateInput;
            where: {
                keyId: string;
            };
        }): MaybePromise<PrismaPublicApiKeyRow>;
    };
    conversation: {
        updateMany(input: {
            data: {
                channelConnectionId: null;
                updatedAt: Date;
            };
            where: {
                channelConnectionId: string;
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
    };
    publicApiKeyRevealState: {
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
        }): MaybePromise<PrismaPublicApiKeyRevealStateRow[]>;
        findUnique(input: {
            where: {
                keyId: string;
            };
        }): MaybePromise<PrismaPublicApiKeyRevealStateRow | null>;
        update(input: {
            data: PrismaPublicApiKeyRevealStateUpdateInput;
            where: {
                keyId: string;
            };
        }): MaybePromise<PrismaPublicApiKeyRevealStateRow>;
        updateMany(input: {
            data: PrismaPublicApiKeyRevealStateUpdateInput;
            where: PrismaPublicApiKeyRevealStateWhereInput;
        }): MaybePromise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaPublicApiKeyRevealStateCreateInput;
            update: PrismaPublicApiKeyRevealStateUpdateInput;
            where: {
                keyId: string;
            };
        }): MaybePromise<PrismaPublicApiKeyRevealStateRow>;
    };
    publicApiKeyRotationAuditEvent: {
        create(input: {
            data: PrismaApiKeyRotationAuditEventCreateInput;
        }): MaybePromise<PrismaApiKeyRotationAuditEventRow>;
        findMany(input: {
            orderBy?: {
                at: "asc" | "desc";
            };
        }): MaybePromise<PrismaApiKeyRotationAuditEventRow[]>;
    };
    publicDemoRequest: {
        findFirst(input: {
            where: PrismaPublicDemoRequestWhereInput;
        }): MaybePromise<PrismaPublicDemoRequestRow | null>;
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
        }): MaybePromise<PrismaPublicDemoRequestRow[]>;
        upsert(input: {
            create: PrismaPublicDemoRequestCreateInput;
            update: PrismaPublicDemoRequestUpdateInput;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaPublicDemoRequestRow>;
    };
    publicDemoRequestAuditEvent: {
        create(input: {
            data: PrismaPublicDemoRequestAuditEventCreateInput;
        }): MaybePromise<PrismaPublicDemoRequestAuditEventRow>;
        findMany(input: {
            orderBy?: {
                at: "asc" | "desc";
            };
        }): MaybePromise<PrismaPublicDemoRequestAuditEventRow[]>;
    };
    publicDemoRequestNotificationDescriptor: {
        count(input: {
            where?: PrismaPublicDemoRequestNotificationDescriptorWhereInput;
        }): MaybePromise<number>;
        findMany(input: PrismaPublicDemoRequestNotificationDescriptorFindManyInput): MaybePromise<PrismaPublicDemoRequestNotificationDescriptorRow[]>;
        upsert(input: {
            create: PrismaPublicDemoRequestNotificationDescriptorCreateInput;
            update: PrismaPublicDemoRequestNotificationDescriptorUpdateInput;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaPublicDemoRequestNotificationDescriptorRow>;
    };
    securitySession: {
        findMany(input: {
            orderBy?: {
                lastSeen: "asc" | "desc";
            };
        }): MaybePromise<PrismaSecuritySessionRow[]>;
        upsert(input: {
            create: PrismaSecuritySessionCreateInput;
            update: PrismaSecuritySessionUpdateInput;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaSecuritySessionRow>;
    };
    sdkVisitorPresenceSession?: {
        findMany(input: {
            orderBy?: {
                lastSeenAt: "asc" | "desc";
            };
            take?: number;
            where?: Record<string, unknown>;
        }): MaybePromise<PrismaSdkVisitorPresenceRow[]>;
        findUnique(input: {
            where: {
                tenantId_channelConnectionId_sessionKeyHash: {
                    channelConnectionId: string;
                    sessionKeyHash: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaSdkVisitorPresenceRow | null>;
        upsert(input: {
            create: PrismaSdkVisitorPresenceCreateInput;
            update: Partial<PrismaSdkVisitorPresenceCreateInput>;
            where: {
                tenantId_channelConnectionId_sessionKeyHash: {
                    channelConnectionId: string;
                    sessionKeyHash: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaSdkVisitorPresenceRow>;
    };
    providerConnectionCredential: {
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
            where?: PrismaProviderConnectionCredentialWhereInput;
        }): MaybePromise<PrismaProviderConnectionCredentialRow[]>;
        findUnique(input: {
            where: {
                channelConnectionId: string;
            };
        }): MaybePromise<PrismaProviderConnectionCredentialRow | null>;
        upsert(input: {
            create: PrismaProviderConnectionCredentialCreateInput;
            update: PrismaProviderConnectionCredentialUpdateInput;
            where: {
                channelConnectionId: string;
            };
        }): MaybePromise<PrismaProviderConnectionCredentialRow>;
    };
    telegramConnection: {
        findFirst(input: {
            where: PrismaTelegramConnectionWhereInput;
        }): MaybePromise<PrismaTelegramConnectionRow | null>;
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
        }): MaybePromise<PrismaTelegramConnectionRow[]>;
        findUnique(input: {
            where: {
                channelConnectionId: string;
            };
        }): MaybePromise<PrismaTelegramConnectionRow | null>;
        upsert(input: {
            create: PrismaTelegramConnectionCreateInput;
            update: PrismaTelegramConnectionUpdateInput;
            where: {
                channelConnectionId: string;
            };
        }): MaybePromise<PrismaTelegramConnectionRow>;
    };
    webhookEndpoint?: {
        findMany(input: {
            orderBy?: {
                createdAt: "asc";
            };
        }): MaybePromise<PrismaWebhookEndpointRow[]>;
        upsert(input: {
            create: PrismaWebhookEndpointRow;
            update: Omit<PrismaWebhookEndpointRow, "createdAt" | "id">;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaWebhookEndpointRow>;
    };
    webhookDeliveryJournalEntry: {
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
            take?: number;
            where?: PrismaWebhookDeliveryJournalWhereInput;
        }): MaybePromise<PrismaWebhookDeliveryJournalRow[]>;
        findUnique(input: {
            where: {
                deliveryId: string;
            };
        }): MaybePromise<PrismaWebhookDeliveryJournalRow | null>;
        update(input: {
            data: PrismaWebhookDeliveryJournalUpdateInput;
            where: {
                deliveryId: string;
            };
        }): MaybePromise<PrismaWebhookDeliveryJournalRow>;
        updateMany(input: {
            data: PrismaWebhookDeliveryJournalUpdateInput;
            where: PrismaWebhookDeliveryJournalWhereInput;
        }): MaybePromise<{
            count: number;
        }>;
        upsert(input: {
            create: PrismaWebhookDeliveryJournalCreateInput;
            update: PrismaWebhookDeliveryJournalUpdateInput;
            where: {
                deliveryId: string;
            };
        }): MaybePromise<PrismaWebhookDeliveryJournalRow>;
    };
    webhookReplayAuditEvent: {
        create(input: {
            data: PrismaWebhookReplayAuditEventCreateInput;
        }): MaybePromise<PrismaWebhookReplayAuditEventRow>;
        findMany(input: {
            orderBy?: {
                at: "asc" | "desc";
            };
        }): MaybePromise<PrismaWebhookReplayAuditEventRow[]>;
    };
    webhookReplayJournalEntry: {
        findMany(input: {
            orderBy?: {
                createdAt: "asc" | "desc";
            };
        }): MaybePromise<PrismaWebhookReplayJournalRow[]>;
        findUnique(input: {
            where: {
                idempotencyKey: string;
            };
        }): MaybePromise<PrismaWebhookReplayJournalRow | null>;
        upsert(input: {
            create: PrismaWebhookReplayJournalCreateInput;
            update: PrismaWebhookReplayJournalUpdateInput;
            where: {
                idempotencyKey: string;
            };
        }): MaybePromise<PrismaWebhookReplayJournalRow>;
    };
}
interface PrismaSdkVisitorPresenceCreateInput {
    channelConnectionId: string;
    connected: boolean;
    createdAt: Date;
    disconnectedAt: Date | null;
    expiresAt: Date;
    firstSeenAt: Date;
    id: string;
    lastSeenAt: Date;
    pagePath: string | null;
    pageUrl: string | null;
    referrer: string | null;
    sessionKeyHash: string;
    subjectId: string;
    tenantId: string;
    updatedAt: Date;
}
interface PrismaSdkVisitorPresenceRow extends PrismaSdkVisitorPresenceCreateInput {
}
interface PrismaPublicApiKeyWhereInput {
    status?: PublicApiKeyRecord["status"];
    tenantId?: string;
}
interface PrismaPublicApiKeyCreateInput {
    channelConnectionId?: string | null;
    createdAt: Date;
    environment: PublicApiEnvironment;
    keyId: string;
    keyPreview: string;
    name: string;
    owner: string;
    scopes: string[];
    secretHash: string;
    status: PublicApiKeyRecord["status"];
    tenantId: string;
    updatedAt: Date;
}
type PrismaPublicApiKeyUpdateInput = Omit<PrismaPublicApiKeyCreateInput, "createdAt" | "keyId">;
interface PrismaPublicApiKeyRow extends PrismaPublicApiKeyCreateInput {
}
type PrismaPublicApiKeyReferenceUpdateInput = Partial<Omit<PrismaPublicApiKeyUpdateInput, "secretHash">>;
interface PrismaPublicApiKeyRevealStateCreateInput {
    consumedAt: Date | null;
    createdAt: Date;
    keyId: string;
    keyPreview: string;
    status: PublicApiKeyRevealStateRecord["status"];
}
type PrismaPublicApiKeyRevealStateUpdateInput = Partial<Omit<PrismaPublicApiKeyRevealStateCreateInput, "createdAt" | "keyId">>;
interface PrismaPublicApiKeyRevealStateRow extends PrismaPublicApiKeyRevealStateCreateInput {
}
interface PrismaPublicApiKeyRevealStateWhereInput {
    keyId: string;
    status?: PublicApiKeyRevealStateRecord["status"];
}
interface PrismaApiKeyRotationAuditEventCreateInput {
    action: ApiKeyRotationAuditEvent["action"];
    at: Date;
    auditId: string;
    environment: string;
    immutable: true;
    keyId: string;
    keyPreview: string;
    rotationId: string;
    status: string;
}
interface PrismaApiKeyRotationAuditEventRow extends PrismaApiKeyRotationAuditEventCreateInput {
    createdAt: Date;
}
interface PrismaApiKeyRotationJobCreateInput {
    auditId: string;
    environment: string;
    keyId: string;
    rawKeyShownOnce: false;
    requires2fa: true;
    rotationId: string;
    status: string;
    createdAt?: Date;
    updatedAt?: Date;
}
type PrismaApiKeyRotationJobUpdateInput = Partial<Omit<PrismaApiKeyRotationJobCreateInput, "createdAt" | "rotationId">>;
interface PrismaApiKeyRotationJobRow extends PrismaApiKeyRotationJobCreateInput {
    createdAt: Date;
    updatedAt: Date;
}
interface PrismaPublicDemoRequestWhereInput {
    idempotencyKey?: string;
    requestFingerprint?: string;
}
interface PrismaPublicDemoRequestCreateInput {
    company: string;
    consent: true;
    createdAt: Date;
    email: string;
    id: string;
    idempotencyKey: string | null;
    ipHash: string | null;
    message: string;
    name: string;
    planInterest: string | null;
    requestFingerprint: string;
    source: string;
    status: "queued";
    updatedAt: Date;
    userAgentHash: string | null;
}
type PrismaPublicDemoRequestUpdateInput = Omit<PrismaPublicDemoRequestCreateInput, "createdAt" | "id">;
interface PrismaPublicDemoRequestRow extends PrismaPublicDemoRequestCreateInput {
}
interface PrismaPublicDemoRequestAuditEventCreateInput {
    action: PublicDemoRequestAuditEvent["action"];
    at: Date;
    id: string;
    immutable: true;
    leadId: string | null;
    requestFingerprint: string;
    result: PublicDemoRequestAuditEvent["result"];
    source: string;
}
interface PrismaPublicDemoRequestAuditEventRow extends PrismaPublicDemoRequestAuditEventCreateInput {
}
interface PrismaPublicDemoRequestNotificationDescriptorCreateInput {
    createdAt: Date;
    id: string;
    leadId: string;
    payload: PublicDemoRequestNotificationDescriptor["payload"];
    queue: "lead-notification";
    status: PublicDemoRequestNotificationStatus;
    type: "public.demo_request.notification.requested";
    updatedAt?: Date;
}
interface PrismaPublicDemoRequestNotificationDescriptorFindManyInput {
    orderBy?: {
        createdAt?: "asc" | "desc";
        updatedAt?: "asc" | "desc";
    };
    take?: number;
    where?: PrismaPublicDemoRequestNotificationDescriptorWhereInput;
}
interface PrismaPublicDemoRequestNotificationDescriptorWhereInput {
    queue?: "lead-notification";
    status?: PublicDemoRequestNotificationStatus;
}
type PrismaPublicDemoRequestNotificationDescriptorUpdateInput = Omit<PrismaPublicDemoRequestNotificationDescriptorCreateInput, "createdAt" | "id">;
interface PrismaPublicDemoRequestNotificationDescriptorRow extends PrismaPublicDemoRequestNotificationDescriptorCreateInput {
    updatedAt: Date;
}
interface PrismaWebhookReplayJournalCreateInput {
    auditId: string;
    deliveryId: string;
    idempotencyKey: string;
    originalTraceId: string;
    replayId: string;
    signatureVerified: boolean;
    status: string;
    createdAt?: Date;
    updatedAt?: Date;
}
type PrismaWebhookReplayJournalUpdateInput = Partial<Omit<PrismaWebhookReplayJournalCreateInput, "createdAt" | "idempotencyKey">>;
interface PrismaWebhookReplayJournalRow extends PrismaWebhookReplayJournalCreateInput {
    createdAt: Date;
    updatedAt: Date;
}
interface PrismaWebhookReplayAuditEventCreateInput {
    action: WebhookReplayAuditEvent["action"];
    at: Date;
    attempts: number;
    auditId: string;
    deliveryId: string;
    deliveryStatus: string;
    id: string;
    idempotencyKey: string | null;
    immutable: true;
    originalTraceId: string;
    replayId: string;
    transition: WebhookReplayAuditEvent["transition"];
}
interface PrismaWebhookReplayAuditEventRow extends PrismaWebhookReplayAuditEventCreateInput {
}
interface PrismaWebhookDeliveryJournalWhereInput {
    deliveryId?: string;
    lockedAt?: Date | null;
    nextAttemptAt?: Date | null;
    queue?: string;
    status?: string | {
        in?: string[];
    };
}
interface PrismaWebhookDeliveryJournalCreateInput {
    attempts: number;
    createdAt: Date;
    deadLetteredAt?: Date | null;
    deliveryId: string;
    endpointId: string;
    eventType: string;
    idempotencyKey: string;
    lastAttemptAt?: Date | null;
    lastError?: WebhookDeliveryJournalError | null;
    lockedAt?: Date | null;
    nextAttemptAt?: Date | null;
    payloadRef: string;
    queue: "webhook-delivery";
    status: string;
    targetUrl: string;
    tenantId: string;
    traceId: string;
    updatedAt?: Date;
}
type PrismaWebhookDeliveryJournalUpdateInput = Partial<Omit<PrismaWebhookDeliveryJournalCreateInput, "createdAt" | "deliveryId">>;
interface PrismaWebhookDeliveryJournalRow extends PrismaWebhookDeliveryJournalCreateInput {
    updatedAt: Date;
}
interface PrismaSecuritySessionCreateInput {
    device: string;
    id: string;
    ip: string;
    lastSeen: string;
    role: string;
    status: string;
    user: string;
    updatedAt?: Date;
}
type PrismaSecuritySessionUpdateInput = Partial<Omit<PrismaSecuritySessionCreateInput, "id">>;
interface PrismaSecuritySessionRow extends PrismaSecuritySessionCreateInput {
    updatedAt: Date;
}
interface PrismaChannelConnectionWhereInput {
    id?: string;
    tenantId?: string;
    type?: string;
}
interface PrismaChannelConnectionCreateInput {
    chatLimit: number;
    createdAt: Date;
    credentialsMasked: boolean;
    environment: string;
    health: number;
    id: string;
    lastSyncAt: Date;
    name: string;
    rawExternalId: string;
    routingQueueId: string;
    status: string;
    tenantId: string;
    traffic: string;
    type: string;
    updatedAt: Date;
    webhookUrl: string;
}
type PrismaChannelConnectionUpdateInput = Omit<PrismaChannelConnectionCreateInput, "createdAt" | "id">;
interface PrismaChannelConnectionRow extends PrismaChannelConnectionCreateInput {
}
interface PrismaChannelConnectionEventWhereInput {
    connectionId?: string;
    tenantId?: string;
}
interface PrismaChannelConnectionEventCreateInput {
    action: string;
    at: Date;
    connectionId: string;
    id: string;
    message: string;
    severity: string;
    tenantId: string;
}
interface PrismaChannelConnectionEventRow extends PrismaChannelConnectionEventCreateInput {
}
interface PrismaChannelConnectionAuditEventWhereInput {
    connectionId?: string;
    tenantId?: string;
}
interface PrismaChannelConnectionAuditEventCreateInput {
    action: string;
    at: Date;
    connectionId: string;
    id: string;
    immutable: true;
    reason: string;
    result: string;
    tenantId: string;
    type: string;
}
interface PrismaChannelConnectionAuditEventRow extends PrismaChannelConnectionAuditEventCreateInput {
}
interface PrismaTelegramConnectionWhereInput {
    tenantId?: string;
    webhookSecret?: string;
}
interface PrismaProviderConnectionCredentialWhereInput {
    provider?: string;
    status?: string;
    tenantId?: string;
}
interface PrismaProviderConnectionCredentialCreateInput {
    accessTokenEncrypted: string;
    apiVersion: string | null;
    channelConnectionId: string;
    confirmationCodeEncrypted: string | null;
    createdAt: Date;
    externalAccountId: string;
    keyVersion: string;
    lastError: string | null;
    lastWebhookAt: Date | null;
    provider: string;
    status: string;
    tenantId: string;
    updatedAt: Date;
    webhookSecretEncrypted: string;
}
type PrismaProviderConnectionCredentialUpdateInput = Omit<PrismaProviderConnectionCredentialCreateInput, "channelConnectionId" | "createdAt">;
interface PrismaProviderConnectionCredentialRow extends PrismaProviderConnectionCredentialCreateInput {
}
interface PrismaTelegramConnectionCreateInput {
    channelConnectionId: string;
    botId: string | null;
    botToken: string;
    botUsername: string | null;
    pollingOffset: number;
    createdAt: Date;
    status: "active" | "disabled";
    tenantId: string;
    tokenPreview: string;
    updatedAt: Date;
    webhookSecret: string;
}
type PrismaTelegramConnectionUpdateInput = Omit<PrismaTelegramConnectionCreateInput, "channelConnectionId" | "createdAt" | "tenantId">;
interface PrismaTelegramConnectionRow extends PrismaTelegramConnectionCreateInput {
}
export declare class IntegrationRepository {
    private readonly store;
    private readonly publicApiRevealSecrets;
    private readonly prismaClient?;
    private constructor();
    static default(): IntegrationRepository;
    static useDefault(repository: IntegrationRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: IntegrationState): IntegrationRepository;
    static prisma({ client, seed }: PrismaIntegrationRepositoryOptions): IntegrationRepository;
    readState(): IntegrationState;
    readInitialState(): IntegrationState;
    readStateAsync(): Promise<IntegrationState>;
    readWorkspaceCatalog(): IntegrationWorkspaceCatalog;
    saveApiKeyRotationJob(job: ApiKeyRotationJob): ApiKeyRotationJob;
    saveApiKeyRotationAuditEvent(event: ApiKeyRotationAuditEvent): MaybePromise<ApiKeyRotationAuditEvent>;
    ensurePublicApiKeyReference(input: EnsurePublicApiKeyReferenceInput): MaybePromise<PublicApiKeyStoredRecord>;
    savePublicApiKey(input: SavePublicApiKeyInput): MaybePromise<PublicApiKeyStoredRecord>;
    removeProvisionedTenant(tenantId: string): Promise<void>;
    listActiveKeys(): MaybePromise<PublicApiKeyRecord[]>;
    findActiveKeyBySecretHash(secretHash: string): MaybePromise<PublicApiKeyRecord | undefined>;
    consumePublicApiKeyReveal(input: ConsumePublicApiKeyRevealInput): MaybePromise<PublicApiKeyRevealResult>;
    listPublicApiKeyRecords(): MaybePromise<PublicApiKeyStoredRecord[]>;
    updatePublicApiKeyStatus(input: UpdatePublicApiKeyStatusInput): MaybePromise<PublicApiKeyStoredRecord | undefined>;
    listWebhookEndpointRecords(): MaybePromise<WebhookEndpointStoredRecord[]>;
    saveWebhookEndpointRecord(record: WebhookEndpointStoredRecord): MaybePromise<WebhookEndpointStoredRecord>;
    findPublicDemoRequestByFingerprint(requestFingerprint: string): PublicDemoRequestRecord | undefined;
    findPublicDemoRequestByFingerprintAsync(requestFingerprint: string): Promise<PublicDemoRequestRecord | undefined>;
    findPublicDemoRequestByIdempotencyKey(idempotencyKey: string): PublicDemoRequestRecord | undefined;
    findPublicDemoRequestByIdempotencyKeyAsync(idempotencyKey: string): Promise<PublicDemoRequestRecord | undefined>;
    savePublicDemoRequest(request: PublicDemoRequestRecord): PublicDemoRequestRecord;
    savePublicDemoRequestAsync(request: PublicDemoRequestRecord): Promise<PublicDemoRequestRecord>;
    saveApiKeyRotationJobAsync(job: ApiKeyRotationJob): Promise<ApiKeyRotationJob>;
    savePublicDemoRequestAuditEvent(event: PublicDemoRequestAuditEvent): PublicDemoRequestAuditEvent;
    savePublicDemoRequestAuditEventAsync(event: PublicDemoRequestAuditEvent): Promise<PublicDemoRequestAuditEvent>;
    savePublicDemoRequestNotificationDescriptor(descriptor: PublicDemoRequestNotificationDescriptor): PublicDemoRequestNotificationDescriptor;
    listPublicDemoRequestNotificationDescriptorsAsync(filters?: PublicDemoRequestNotificationDescriptorFilters): Promise<PublicDemoRequestNotificationDescriptor[]>;
    summarizePublicDemoRequestNotificationDescriptorsAsync(filters?: Pick<PublicDemoRequestNotificationDescriptorFilters, "queue">): Promise<PublicDemoRequestNotificationDescriptorSummary>;
    savePublicDemoRequestNotificationDescriptorAsync(descriptor: PublicDemoRequestNotificationDescriptor): Promise<PublicDemoRequestNotificationDescriptor>;
    private markPublicApiKeyRevealConsumed;
    private savePrismaPublicApiKey;
    private savePrismaPublicApiKeyReference;
    private updatePrismaPublicApiKeyStatus;
    private consumePrismaPublicApiKeyReveal;
    private savePrismaApiKeyRotationAuditEvent;
    findWebhookReplay(idempotencyKey: string): WebhookReplayJournalEntry | undefined;
    findWebhookReplayAsync(idempotencyKey: string): Promise<WebhookReplayJournalEntry | undefined>;
    saveWebhookReplay(entry: WebhookReplayJournalEntry): WebhookReplayJournalEntry;
    saveWebhookReplayAsync(entry: WebhookReplayJournalEntry): Promise<WebhookReplayJournalEntry>;
    saveWebhookReplayAuditEvent(event: WebhookReplayAuditEvent): WebhookReplayAuditEvent;
    saveWebhookReplayAuditEventAsync(event: WebhookReplayAuditEvent): Promise<WebhookReplayAuditEvent>;
    findWebhookDeliveryJournalEntry(deliveryId: string): WebhookDeliveryJournalEntry | undefined;
    findWebhookDeliveryJournalEntryAsync(deliveryId: string): Promise<WebhookDeliveryJournalEntry | undefined>;
    listWebhookDeliveryJournal(filters?: WebhookDeliveryJournalFilters): WebhookDeliveryJournalEntry[];
    listWebhookDeliveryJournalAsync(filters?: WebhookDeliveryJournalFilters): Promise<WebhookDeliveryJournalEntry[]>;
    saveWebhookDeliveryJournalEntry(entry: WebhookDeliveryJournalEntry): WebhookDeliveryJournalEntry;
    saveWebhookDeliveryJournalEntryAsync(entry: WebhookDeliveryJournalEntry): Promise<WebhookDeliveryJournalEntry>;
    recordWebhookDeliveryRetryState(input: RecordWebhookDeliveryRetryStateInput): WebhookDeliveryJournalEntry | undefined;
    recordWebhookDeliveryRetryStateAsync(input: RecordWebhookDeliveryRetryStateInput): Promise<WebhookDeliveryJournalEntry | undefined>;
    recordWebhookDeliveryDeadLetterState(input: RecordWebhookDeliveryDeadLetterStateInput): WebhookDeliveryJournalEntry | undefined;
    recordWebhookDeliveryDeadLetterStateAsync(input: RecordWebhookDeliveryDeadLetterStateInput): Promise<WebhookDeliveryJournalEntry | undefined>;
    recordWebhookDeliveryAttemptSuccess(input: RecordWebhookDeliveryAttemptSuccessInput): WebhookDeliveryJournalEntry | undefined;
    recordWebhookDeliveryAttemptSuccessAsync(input: RecordWebhookDeliveryAttemptSuccessInput): Promise<WebhookDeliveryJournalEntry | undefined>;
    claimWebhookDeliveryJournalEntries(input: ClaimWebhookDeliveryJournalEntriesInput): WebhookDeliveryJournalEntry[];
    claimWebhookDeliveryJournalEntriesAsync(input: ClaimWebhookDeliveryJournalEntriesInput): Promise<WebhookDeliveryJournalEntry[]>;
    listSecuritySessions(): SecuritySession[];
    listSecuritySessionsAsync(): Promise<SecuritySession[]>;
    saveSecuritySession(session: SecuritySession): SecuritySession;
    saveSecuritySessionAsync(session: SecuritySession): Promise<SecuritySession>;
    listChannelConnections(filters: {
        tenantId: string;
        type?: string;
    }): ChannelConnectionStoredRecord[];
    listChannelConnectionsAsync(filters: {
        tenantId: string;
        type?: string;
    }): Promise<ChannelConnectionStoredRecord[]>;
    upsertSdkVisitorPresence(input: UpsertSdkVisitorPresenceInput): Promise<SdkVisitorPresenceSessionRecord>;
    disconnectSdkVisitorPresence(input: {
        channelConnectionId: string;
        disconnectedAt: string;
        sessionKeyHash: string;
        tenantId: string;
    }): Promise<SdkVisitorPresenceSessionRecord | null>;
    listLiveSdkVisitorPresence(input: {
        at: string;
        limit?: number;
        tenantId?: string;
    }): Promise<SdkVisitorPresenceSessionRecord[]>;
    findChannelConnection(tenantId: string, connectionId: string): ChannelConnectionStoredRecord | undefined;
    findChannelConnectionAsync(tenantId: string, connectionId: string): Promise<ChannelConnectionStoredRecord | undefined>;
    saveChannelConnection(connection: ChannelConnectionStoredRecord): ChannelConnectionStoredRecord;
    saveChannelConnectionAsync(connection: ChannelConnectionStoredRecord): Promise<ChannelConnectionStoredRecord>;
    /**
     * Removes the connection configuration and all configuration records that
     * cascade from it (credentials, Telegram state, provider bindings). Historic
     * conversations and reusable API keys are deliberately retained, but no
     * longer point at the removed connection.
     */
    deleteChannelConnectionAsync(tenantId: string, connectionId: string): Promise<boolean>;
    listChannelConnectionEvents(tenantId: string, connectionId: string): ChannelConnectionEventRecord[];
    listChannelConnectionEventsAsync(tenantId: string, connectionId: string): Promise<ChannelConnectionEventRecord[]>;
    saveChannelConnectionEvent(event: ChannelConnectionEventRecord): ChannelConnectionEventRecord;
    saveChannelConnectionEventAsync(event: ChannelConnectionEventRecord): Promise<ChannelConnectionEventRecord>;
    listChannelConnectionAuditEvents(): ChannelConnectionAuditEventRecord[];
    listChannelConnectionAuditEventsAsync(): Promise<ChannelConnectionAuditEventRecord[]>;
    saveChannelConnectionAuditEvent(event: ChannelConnectionAuditEventRecord): ChannelConnectionAuditEventRecord;
    saveChannelConnectionAuditEventAsync(event: ChannelConnectionAuditEventRecord): Promise<ChannelConnectionAuditEventRecord>;
    findProviderConnectionCredential(tenantId: string, channelConnectionId: string): ProviderConnectionCredentialRecord | undefined;
    findProviderConnectionCredentialAsync(tenantId: string, channelConnectionId: string): Promise<ProviderConnectionCredentialRecord | undefined>;
    findProviderConnectionCredentialByConnectionIdAsync(channelConnectionId: string): Promise<ProviderConnectionCredentialRecord | undefined>;
    listActiveProviderConnectionCredentials(tenantId: string, provider: string): ProviderConnectionCredentialRecord[];
    listActiveProviderConnectionCredentialsAsync(tenantId: string, provider: string): Promise<ProviderConnectionCredentialRecord[]>;
    saveProviderConnectionCredential(credential: ProviderConnectionCredentialRecord): ProviderConnectionCredentialRecord;
    saveProviderConnectionCredentialAsync(credential: ProviderConnectionCredentialRecord): Promise<ProviderConnectionCredentialRecord>;
    findTelegramConnectionByTenantId(tenantId: string): TelegramConnectionStoredRecord | undefined;
    findTelegramConnectionByTenantIdAsync(tenantId: string): Promise<TelegramConnectionStoredRecord | undefined>;
    findTelegramConnectionByWebhookSecret(webhookSecret: string): TelegramConnectionStoredRecord | undefined;
    findTelegramConnectionByWebhookSecretAsync(webhookSecret: string): Promise<TelegramConnectionStoredRecord | undefined>;
    listTelegramConnections(): TelegramConnectionStoredRecord[];
    listTelegramConnectionsAsync(): Promise<TelegramConnectionStoredRecord[]>;
    saveTelegramConnection(connection: TelegramConnectionStoredRecord): TelegramConnectionStoredRecord;
    saveTelegramConnectionAsync(connection: TelegramConnectionStoredRecord): Promise<TelegramConnectionStoredRecord>;
    private assertSyncRuntimeAvailable;
}
export declare function createEmptyIntegrationState(): IntegrationState;
export {};
