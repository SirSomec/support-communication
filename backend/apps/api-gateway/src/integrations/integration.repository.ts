import { randomUUID } from "node:crypto";
import { type DurableStore, InMemoryStore } from "@support-communication/database";
import { redactSensitiveText } from "@support-communication/redaction";
import type { ApiEnvironmentKey, ChannelDetail, SecuritySession, WebhookDelivery } from "./integration.types.js";
import { hashPublicApiKeySecret, type PublicApiEnvironment, type PublicApiKeyRecord } from "./public-api-auth.js";

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

// Пользовательские webhook-эндпоинты и правки/удаления сидовых.
// custom=false означает override сидового эндпоинта из workspace-каталога;
// deleted=true — tombstone, скрывающий эндпоинт из выдачи workspace.
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
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" }; where?: PrismaChannelConnectionWhereInput }): MaybePromise<PrismaChannelConnectionRow[]>;
    findUnique(input: { where: { id: string } }): MaybePromise<PrismaChannelConnectionRow | null>;
    upsert(input: {
      create: PrismaChannelConnectionCreateInput;
      update: PrismaChannelConnectionUpdateInput;
      where: { id: string };
    }): MaybePromise<PrismaChannelConnectionRow>;
  };
  channelConnectionAuditEvent: {
    create(input: { data: PrismaChannelConnectionAuditEventCreateInput }): MaybePromise<PrismaChannelConnectionAuditEventRow>;
    findMany(input: { orderBy?: { at: "asc" | "desc" }; where?: PrismaChannelConnectionAuditEventWhereInput }): MaybePromise<PrismaChannelConnectionAuditEventRow[]>;
  };
  channelConnectionEvent: {
    create(input: { data: PrismaChannelConnectionEventCreateInput }): MaybePromise<PrismaChannelConnectionEventRow>;
    findMany(input: { orderBy?: { at: "asc" | "desc" }; where?: PrismaChannelConnectionEventWhereInput }): MaybePromise<PrismaChannelConnectionEventRow[]>;
  };
  integrationApiKeyRotationJob: {
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" } }): MaybePromise<PrismaApiKeyRotationJobRow[]>;
    upsert(input: {
      create: PrismaApiKeyRotationJobCreateInput;
      update: PrismaApiKeyRotationJobUpdateInput;
      where: { rotationId: string };
    }): MaybePromise<PrismaApiKeyRotationJobRow>;
  };
  publicApiKey: {
    create(input: { data: PrismaPublicApiKeyCreateInput }): MaybePromise<PrismaPublicApiKeyRow>;
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" }; where?: PrismaPublicApiKeyWhereInput }): MaybePromise<PrismaPublicApiKeyRow[]>;
    findUnique(input: { where: { keyId: string } }): MaybePromise<PrismaPublicApiKeyRow | null>;
    upsert(input: {
      create: PrismaPublicApiKeyCreateInput;
      update: PrismaPublicApiKeyReferenceUpdateInput | PrismaPublicApiKeyUpdateInput;
      where: { keyId: string };
    }): MaybePromise<PrismaPublicApiKeyRow>;
  };
  publicApiKeyRevealState: {
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" } }): MaybePromise<PrismaPublicApiKeyRevealStateRow[]>;
    findUnique(input: { where: { keyId: string } }): MaybePromise<PrismaPublicApiKeyRevealStateRow | null>;
    update(input: {
      data: PrismaPublicApiKeyRevealStateUpdateInput;
      where: { keyId: string };
    }): MaybePromise<PrismaPublicApiKeyRevealStateRow>;
    updateMany(input: {
      data: PrismaPublicApiKeyRevealStateUpdateInput;
      where: PrismaPublicApiKeyRevealStateWhereInput;
    }): MaybePromise<{ count: number }>;
    upsert(input: {
      create: PrismaPublicApiKeyRevealStateCreateInput;
      update: PrismaPublicApiKeyRevealStateUpdateInput;
      where: { keyId: string };
    }): MaybePromise<PrismaPublicApiKeyRevealStateRow>;
  };
  publicApiKeyRotationAuditEvent: {
    create(input: { data: PrismaApiKeyRotationAuditEventCreateInput }): MaybePromise<PrismaApiKeyRotationAuditEventRow>;
    findMany(input: { orderBy?: { at: "asc" | "desc" } }): MaybePromise<PrismaApiKeyRotationAuditEventRow[]>;
  };
  publicDemoRequest: {
    findFirst(input: { where: PrismaPublicDemoRequestWhereInput }): MaybePromise<PrismaPublicDemoRequestRow | null>;
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" } }): MaybePromise<PrismaPublicDemoRequestRow[]>;
    upsert(input: {
      create: PrismaPublicDemoRequestCreateInput;
      update: PrismaPublicDemoRequestUpdateInput;
      where: { id: string };
    }): MaybePromise<PrismaPublicDemoRequestRow>;
  };
  publicDemoRequestAuditEvent: {
    create(input: { data: PrismaPublicDemoRequestAuditEventCreateInput }): MaybePromise<PrismaPublicDemoRequestAuditEventRow>;
    findMany(input: { orderBy?: { at: "asc" | "desc" } }): MaybePromise<PrismaPublicDemoRequestAuditEventRow[]>;
  };
  publicDemoRequestNotificationDescriptor: {
    count(input: { where?: PrismaPublicDemoRequestNotificationDescriptorWhereInput }): MaybePromise<number>;
    findMany(input: PrismaPublicDemoRequestNotificationDescriptorFindManyInput): MaybePromise<PrismaPublicDemoRequestNotificationDescriptorRow[]>;
    upsert(input: {
      create: PrismaPublicDemoRequestNotificationDescriptorCreateInput;
      update: PrismaPublicDemoRequestNotificationDescriptorUpdateInput;
      where: { id: string };
    }): MaybePromise<PrismaPublicDemoRequestNotificationDescriptorRow>;
  };
  securitySession: {
    findMany(input: { orderBy?: { lastSeen: "asc" | "desc" } }): MaybePromise<PrismaSecuritySessionRow[]>;
    upsert(input: {
      create: PrismaSecuritySessionCreateInput;
      update: PrismaSecuritySessionUpdateInput;
      where: { id: string };
    }): MaybePromise<PrismaSecuritySessionRow>;
  };
  sdkVisitorPresenceSession?: {
    findMany(input: { orderBy?: { lastSeenAt: "asc" | "desc" }; take?: number; where?: Record<string, unknown> }): MaybePromise<PrismaSdkVisitorPresenceRow[]>;
    findUnique(input: { where: { tenantId_channelConnectionId_sessionKeyHash: { channelConnectionId: string; sessionKeyHash: string; tenantId: string } } }): MaybePromise<PrismaSdkVisitorPresenceRow | null>;
    upsert(input: { create: PrismaSdkVisitorPresenceCreateInput; update: Partial<PrismaSdkVisitorPresenceCreateInput>; where: { tenantId_channelConnectionId_sessionKeyHash: { channelConnectionId: string; sessionKeyHash: string; tenantId: string } } }): MaybePromise<PrismaSdkVisitorPresenceRow>;
  };
  providerConnectionCredential: {
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" }; where?: PrismaProviderConnectionCredentialWhereInput }): MaybePromise<PrismaProviderConnectionCredentialRow[]>;
    findUnique(input: { where: { channelConnectionId: string } }): MaybePromise<PrismaProviderConnectionCredentialRow | null>;
    upsert(input: {
      create: PrismaProviderConnectionCredentialCreateInput;
      update: PrismaProviderConnectionCredentialUpdateInput;
      where: { channelConnectionId: string };
    }): MaybePromise<PrismaProviderConnectionCredentialRow>;
  };
  telegramConnection: {
    findFirst(input: { where: PrismaTelegramConnectionWhereInput }): MaybePromise<PrismaTelegramConnectionRow | null>;
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" } }): MaybePromise<PrismaTelegramConnectionRow[]>;
    findUnique(input: { where: { channelConnectionId: string } }): MaybePromise<PrismaTelegramConnectionRow | null>;
    upsert(input: {
      create: PrismaTelegramConnectionCreateInput;
      update: PrismaTelegramConnectionUpdateInput;
      where: { channelConnectionId: string };
    }): MaybePromise<PrismaTelegramConnectionRow>;
  };
  // Optional: real generated PrismaClient always has it; partial fake clients in
  // tests omit it and fall back to the store, so it stays out of the required
  // completeness assertion.
  webhookEndpoint?: {
    findMany(input: { orderBy?: { createdAt: "asc" } }): MaybePromise<PrismaWebhookEndpointRow[]>;
    upsert(input: {
      create: PrismaWebhookEndpointRow;
      update: Omit<PrismaWebhookEndpointRow, "createdAt" | "id">;
      where: { id: string };
    }): MaybePromise<PrismaWebhookEndpointRow>;
  };
  webhookDeliveryJournalEntry: {
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" }; take?: number; where?: PrismaWebhookDeliveryJournalWhereInput }): MaybePromise<PrismaWebhookDeliveryJournalRow[]>;
    findUnique(input: { where: { deliveryId: string } }): MaybePromise<PrismaWebhookDeliveryJournalRow | null>;
    update(input: {
      data: PrismaWebhookDeliveryJournalUpdateInput;
      where: { deliveryId: string };
    }): MaybePromise<PrismaWebhookDeliveryJournalRow>;
    upsert(input: {
      create: PrismaWebhookDeliveryJournalCreateInput;
      update: PrismaWebhookDeliveryJournalUpdateInput;
      where: { deliveryId: string };
    }): MaybePromise<PrismaWebhookDeliveryJournalRow>;
  };
  webhookReplayAuditEvent: {
    create(input: { data: PrismaWebhookReplayAuditEventCreateInput }): MaybePromise<PrismaWebhookReplayAuditEventRow>;
    findMany(input: { orderBy?: { at: "asc" | "desc" } }): MaybePromise<PrismaWebhookReplayAuditEventRow[]>;
  };
  webhookReplayJournalEntry: {
    findMany(input: { orderBy?: { createdAt: "asc" | "desc" } }): MaybePromise<PrismaWebhookReplayJournalRow[]>;
    findUnique(input: { where: { idempotencyKey: string } }): MaybePromise<PrismaWebhookReplayJournalRow | null>;
    upsert(input: {
      create: PrismaWebhookReplayJournalCreateInput;
      update: PrismaWebhookReplayJournalUpdateInput;
      where: { idempotencyKey: string };
    }): MaybePromise<PrismaWebhookReplayJournalRow>;
  };
}

interface PrismaSdkVisitorPresenceCreateInput {
  channelConnectionId: string; connected: boolean; createdAt: Date; disconnectedAt: Date | null;
  expiresAt: Date; firstSeenAt: Date; id: string; lastSeenAt: Date; pagePath: string | null;
  pageUrl: string | null; referrer: string | null; sessionKeyHash: string; subjectId: string;
  tenantId: string; updatedAt: Date;
}
interface PrismaSdkVisitorPresenceRow extends PrismaSdkVisitorPresenceCreateInput {}

interface PrismaPublicApiKeyWhereInput {
  status?: PublicApiKeyRecord["status"];
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

interface PrismaPublicApiKeyRow extends PrismaPublicApiKeyCreateInput {}

type PrismaPublicApiKeyReferenceUpdateInput = Partial<Omit<PrismaPublicApiKeyUpdateInput, "secretHash">>;

interface PrismaPublicApiKeyRevealStateCreateInput {
  consumedAt: Date | null;
  createdAt: Date;
  keyId: string;
  keyPreview: string;
  status: PublicApiKeyRevealStateRecord["status"];
}

type PrismaPublicApiKeyRevealStateUpdateInput = Partial<Omit<PrismaPublicApiKeyRevealStateCreateInput, "createdAt" | "keyId">>;

interface PrismaPublicApiKeyRevealStateRow extends PrismaPublicApiKeyRevealStateCreateInput {}

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
interface PrismaPublicDemoRequestRow extends PrismaPublicDemoRequestCreateInput {}

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

interface PrismaPublicDemoRequestAuditEventRow extends PrismaPublicDemoRequestAuditEventCreateInput {}

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
  orderBy?: { createdAt?: "asc" | "desc"; updatedAt?: "asc" | "desc" };
  take?: number;
  where?: PrismaPublicDemoRequestNotificationDescriptorWhereInput;
}

interface PrismaPublicDemoRequestNotificationDescriptorWhereInput {
  queue?: "lead-notification";
  status?: PublicDemoRequestNotificationStatus;
}

type PrismaPublicDemoRequestNotificationDescriptorUpdateInput =
  Omit<PrismaPublicDemoRequestNotificationDescriptorCreateInput, "createdAt" | "id">;
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

interface PrismaWebhookReplayAuditEventRow extends PrismaWebhookReplayAuditEventCreateInput {}

interface PrismaWebhookDeliveryJournalWhereInput {
  deliveryId?: string;
  queue?: string;
  status?: string | { in?: string[] };
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
interface PrismaChannelConnectionRow extends PrismaChannelConnectionCreateInput {}

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

interface PrismaChannelConnectionEventRow extends PrismaChannelConnectionEventCreateInput {}

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

interface PrismaChannelConnectionAuditEventRow extends PrismaChannelConnectionAuditEventCreateInput {}

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
interface PrismaProviderConnectionCredentialRow extends PrismaProviderConnectionCredentialCreateInput {}

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
interface PrismaTelegramConnectionRow extends PrismaTelegramConnectionCreateInput {}

let defaultRepository: IntegrationRepository | null = null;

export class IntegrationRepository {
  private constructor(
    private readonly store: DurableStore<IntegrationState>,
    private readonly publicApiRevealSecrets = new Map<string, string>(),
    private readonly prismaClient?: PrismaIntegrationClient
  ) {}

  static default(): IntegrationRepository {
    if (defaultRepository) {
      return defaultRepository;
    }

    return IntegrationRepository.inMemory();
  }

  static useDefault(repository: IntegrationRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed?: IntegrationState): IntegrationRepository {
    return new IntegrationRepository(new InMemoryStore(seed ?? createEmptyIntegrationState()));
  }

  static prisma({ client, seed }: PrismaIntegrationRepositoryOptions): IntegrationRepository {
    assertCompletePrismaIntegrationClient(client);

    return new IntegrationRepository(new InMemoryStore(seed ?? createEmptyIntegrationState()), new Map(), client);
  }

  readState(): IntegrationState {
    this.assertSyncRuntimeAvailable();
    return normalizeState(this.store.read());
  }

  readInitialState(): IntegrationState {
    return this.prismaClient ? normalizeState(this.store.read()) : this.readState();
  }

  async readStateAsync(): Promise<IntegrationState> {
    if (!this.prismaClient) {
      return this.readState();
    }

    const [
      apiKeyRotationAuditEvents,
      apiKeyRotationJobs,
      channelConnectionAuditEvents,
      channelConnectionEvents,
      channelConnections,
      providerConnectionCredentials,
      publicApiKeys,
      publicApiKeyRevealStates,
      publicDemoRequestAuditEvents,
      publicDemoRequestNotificationDescriptors,
      publicDemoRequests,
      securitySessions,
      telegramConnections,
      webhookDeliveryJournal,
      webhookReplayAuditEvents,
      webhookReplayJournal
    ] = await Promise.all([
      Promise.resolve(this.prismaClient.publicApiKeyRotationAuditEvent.findMany({ orderBy: { at: "asc" } }))
        .then((rows) => rows.map(toApiKeyRotationAuditEvent)),
      Promise.resolve(this.prismaClient.integrationApiKeyRotationJob.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toApiKeyRotationJob)),
      Promise.resolve(this.prismaClient.channelConnectionAuditEvent.findMany({ orderBy: { at: "asc" } }))
        .then((rows) => rows.map(toChannelConnectionAuditEvent)),
      Promise.resolve(this.prismaClient.channelConnectionEvent.findMany({ orderBy: { at: "asc" } }))
        .then((rows) => rows.map(toChannelConnectionEvent)),
      Promise.resolve(this.prismaClient.channelConnection.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toChannelConnection)),
      Promise.resolve(this.prismaClient.providerConnectionCredential.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toProviderConnectionCredential)),
      Promise.resolve(this.prismaClient.publicApiKey.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toPublicApiKeyStoredRecord)),
      Promise.resolve(this.prismaClient.publicApiKeyRevealState.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toPublicApiKeyRevealState)),
      Promise.resolve(this.prismaClient.publicDemoRequestAuditEvent.findMany({ orderBy: { at: "asc" } }))
        .then((rows) => rows.map(toPublicDemoRequestAuditEvent)),
      Promise.resolve(this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toPublicDemoRequestNotificationDescriptor)),
      Promise.resolve(this.prismaClient.publicDemoRequest.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toPublicDemoRequest)),
      Promise.resolve(this.prismaClient.securitySession.findMany({ orderBy: { lastSeen: "asc" } }))
        .then((rows) => rows.map(toSecuritySession)),
      Promise.resolve(this.prismaClient.telegramConnection.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toTelegramConnection)),
      Promise.resolve(this.prismaClient.webhookDeliveryJournalEntry.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toWebhookDeliveryJournalEntry)),
      Promise.resolve(this.prismaClient.webhookReplayAuditEvent.findMany({ orderBy: { at: "asc" } }))
        .then((rows) => rows.map(toWebhookReplayAuditEvent)),
      Promise.resolve(this.prismaClient.webhookReplayJournalEntry.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toWebhookReplayJournalEntry))
    ]);
    const webhookEndpointRecords = await this.listWebhookEndpointRecords();

    return normalizeState({
      ...createEmptyIntegrationState(),
      apiKeyRotationAuditEvents,
      apiKeyRotationJobs,
      channelConnectionAuditEvents,
      channelConnectionEvents,
      channelConnections,
      providerConnectionCredentials,
      publicApiKeys,
      publicApiKeyRevealStates,
      publicDemoRequestAuditEvents,
      publicDemoRequestNotificationDescriptors,
      publicDemoRequests,
      securitySessions,
      telegramConnections,
      webhookDeliveryJournal,
      webhookEndpointRecords,
      webhookReplayAuditEvents,
      webhookReplayJournal,
      workspace: this.readWorkspaceCatalog()
    });
  }

  readWorkspaceCatalog(): IntegrationWorkspaceCatalog {
    return clone(normalizeState(this.store.read()).workspace);
  }

  saveApiKeyRotationJob(job: ApiKeyRotationJob): ApiKeyRotationJob {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(job);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.apiKeyRotationJobs.some((item) => item.rotationId === persisted.rotationId);

      return {
        ...current,
        apiKeyRotationJobs: exists
          ? current.apiKeyRotationJobs.map((item) => item.rotationId === persisted.rotationId ? persisted : item)
          : [persisted, ...current.apiKeyRotationJobs]
      };
    });

    return clone(persisted);
  }

  saveApiKeyRotationAuditEvent(event: ApiKeyRotationAuditEvent): MaybePromise<ApiKeyRotationAuditEvent> {
    const persisted = clone(event);
    if (this.prismaClient) {
      return this.savePrismaApiKeyRotationAuditEvent(persisted);
    }

    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        apiKeyRotationAuditEvents: [...current.apiKeyRotationAuditEvents, persisted]
      };
    });

    return clone(persisted);
  }

  ensurePublicApiKeyReference(input: EnsurePublicApiKeyReferenceInput): MaybePromise<PublicApiKeyStoredRecord> {
    const persisted: PublicApiKeyStoredRecord = {
      channelConnectionId: input.channelConnectionId ?? null,
      createdAt: input.createdAt,
      environment: input.environment,
      keyId: input.keyId,
      keyPreview: input.keyPreview,
      name: input.name,
      owner: input.owner,
      scopes: [...input.scopes],
      secretHash: hashPublicApiKeySecret(randomUUID()),
      status: input.status,
      tenantId: input.tenantId
    };

    if (this.prismaClient) {
      return this.savePrismaPublicApiKeyReference(persisted);
    }

    const existing = this.readState().publicApiKeys.find((key) => key.keyId === input.keyId);
    if (existing) {
      return clone(existing);
    }

    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        publicApiKeys: [...current.publicApiKeys, persisted]
      };
    });

    return clone(persisted);
  }

  savePublicApiKey(input: SavePublicApiKeyInput): MaybePromise<PublicApiKeyStoredRecord> {
    const normalizedSecret = input.rawSecret.trim();
    const persisted: PublicApiKeyStoredRecord = {
      channelConnectionId: input.channelConnectionId ?? null,
      createdAt: input.createdAt,
      environment: input.environment,
      keyId: input.keyId,
      keyPreview: maskPublicApiKeySecret(normalizedSecret),
      name: input.name,
      owner: input.owner,
      scopes: [...input.scopes],
      secretHash: hashPublicApiKeySecret(normalizedSecret),
      status: input.status,
      tenantId: input.tenantId
    };

    if (this.prismaClient) {
      return this.savePrismaPublicApiKey(persisted, {
        consumedAt: null,
        createdAt: input.createdAt,
        keyId: input.keyId,
        keyPreview: persisted.keyPreview,
        status: "available"
      }, normalizedSecret);
    }

    const revealState: PublicApiKeyRevealStateRecord = {
      consumedAt: null,
      createdAt: input.createdAt,
      keyId: input.keyId,
      keyPreview: persisted.keyPreview,
      status: "available"
    };

    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.publicApiKeys.some((item) => item.keyId === persisted.keyId);
      const existingRevealState = current.publicApiKeyRevealStates.find((item) => item.keyId === revealState.keyId);
      const nextRevealState = existingRevealState ?? revealState;

      return {
        ...current,
        publicApiKeys: exists
          ? current.publicApiKeys.map((item) => item.keyId === persisted.keyId ? persisted : item)
          : [...current.publicApiKeys, persisted],
        publicApiKeyRevealStates: existingRevealState
          ? current.publicApiKeyRevealStates.map((item) => item.keyId === revealState.keyId ? nextRevealState : item)
          : [...current.publicApiKeyRevealStates, nextRevealState]
      };
    });
    const nextRevealState = this.readState().publicApiKeyRevealStates.find((item) => item.keyId === revealState.keyId);
    if (nextRevealState?.status === "available") {
      this.publicApiRevealSecrets.set(persisted.keyId, normalizedSecret);
    } else {
      this.publicApiRevealSecrets.delete(persisted.keyId);
    }

    return clone(persisted);
  }

  listActiveKeys(): MaybePromise<PublicApiKeyRecord[]> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.publicApiKey.findMany({
        orderBy: { createdAt: "asc" },
        where: { status: "active" }
      })).then((rows) => rows.map(toPublicApiKeyRecord));
    }

    return clone(this.readState().publicApiKeys.filter((key) => key.status === "active"));
  }

  findActiveKeyBySecretHash(secretHash: string): MaybePromise<PublicApiKeyRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.publicApiKey.findMany({
        orderBy: { createdAt: "asc" },
        where: { status: "active" }
      })).then((rows) => rows.map(toPublicApiKeyRecord).find((row) => row.secretHash === secretHash));
    }

    const matched = this.readState().publicApiKeys.find((key) => key.status === "active" && key.secretHash === secretHash);
    return matched ? clone(matched) : undefined;
  }

  consumePublicApiKeyReveal(input: ConsumePublicApiKeyRevealInput): MaybePromise<PublicApiKeyRevealResult> {
    if (this.prismaClient) {
      return this.consumePrismaPublicApiKeyReveal(input);
    }

    const revealState = this.readState().publicApiKeyRevealStates.find((item) => item.keyId === input.keyId);
    if (!revealState) {
      return {
        consumedAt: input.consumedAt,
        keyId: input.keyId,
        status: "not_found"
      };
    }

    if (revealState.status !== "available") {
      return {
        consumedAt: revealState.consumedAt ?? input.consumedAt,
        keyId: input.keyId,
        keyPreview: revealState.keyPreview,
        status: "consumed"
      };
    }

    const rawSecret = this.publicApiRevealSecrets.get(input.keyId);
    if (!rawSecret) {
      this.markPublicApiKeyRevealConsumed(input.keyId, input.consumedAt);

      return {
        consumedAt: input.consumedAt,
        keyId: input.keyId,
        keyPreview: revealState.keyPreview,
        status: "consumed"
      };
    }

    this.markPublicApiKeyRevealConsumed(input.keyId, input.consumedAt);
    this.publicApiRevealSecrets.delete(input.keyId);

    return {
      consumedAt: input.consumedAt,
      keyId: input.keyId,
      keyPreview: revealState.keyPreview,
      rawSecret,
      status: "revealed"
    };
  }

  listPublicApiKeyRecords(): MaybePromise<PublicApiKeyStoredRecord[]> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.publicApiKey.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toPublicApiKeyStoredRecord));
    }

    return clone(this.readState().publicApiKeys);
  }

  updatePublicApiKeyStatus(input: UpdatePublicApiKeyStatusInput): MaybePromise<PublicApiKeyStoredRecord | undefined> {
    if (this.prismaClient) {
      return this.updatePrismaPublicApiKeyStatus(input);
    }

    const existing = this.readState().publicApiKeys.find((key) => key.keyId === input.keyId);
    if (!existing) {
      return undefined;
    }

    const persisted: PublicApiKeyStoredRecord = { ...clone(existing), status: input.status };
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        publicApiKeys: current.publicApiKeys.map((item) => item.keyId === input.keyId ? persisted : item)
      };
    });

    return clone(persisted);
  }

  listWebhookEndpointRecords(): MaybePromise<WebhookEndpointStoredRecord[]> {
    if (this.prismaClient?.webhookEndpoint) {
      return Promise.resolve(this.prismaClient.webhookEndpoint.findMany({ orderBy: { createdAt: "asc" } }))
        .then((rows) => rows.map(toWebhookEndpointRecord));
    }
    return clone(normalizeState(this.store.read()).webhookEndpointRecords);
  }

  saveWebhookEndpointRecord(record: WebhookEndpointStoredRecord): MaybePromise<WebhookEndpointStoredRecord> {
    const persisted = normalizeWebhookEndpointRecords([record])[0]!;
    if (this.prismaClient?.webhookEndpoint) {
      const row = toWebhookEndpointRow(persisted);
      const { createdAt: _c, id: _id, ...update } = row;
      return Promise.resolve(this.prismaClient.webhookEndpoint.upsert({ create: row, update, where: { id: persisted.id } }))
        .then(toWebhookEndpointRecord);
    }
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.webhookEndpointRecords.some((item) => item.id === persisted.id);

      return {
        ...current,
        webhookEndpointRecords: exists
          ? current.webhookEndpointRecords.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.webhookEndpointRecords, persisted]
      };
    });

    return clone(persisted);
  }

  findPublicDemoRequestByFingerprint(requestFingerprint: string): PublicDemoRequestRecord | undefined {
    this.assertSyncRuntimeAvailable();
    const normalized = String(requestFingerprint ?? "").trim();
    if (!normalized) {
      return undefined;
    }

    return clone(this.readState().publicDemoRequests.find((request) => request.requestFingerprint === normalized));
  }

  async findPublicDemoRequestByFingerprintAsync(requestFingerprint: string): Promise<PublicDemoRequestRecord | undefined> {
    const normalized = String(requestFingerprint ?? "").trim();
    if (!normalized) {
      return undefined;
    }

    if (!this.prismaClient) {
      return this.findPublicDemoRequestByFingerprint(normalized);
    }

    const row = await this.prismaClient.publicDemoRequest.findFirst({ where: { requestFingerprint: normalized } });
    return row ? toPublicDemoRequest(row) : undefined;
  }

  findPublicDemoRequestByIdempotencyKey(idempotencyKey: string): PublicDemoRequestRecord | undefined {
    this.assertSyncRuntimeAvailable();
    const normalized = String(idempotencyKey ?? "").trim();
    if (!normalized) {
      return undefined;
    }

    return clone(this.readState().publicDemoRequests.find((request) => request.idempotencyKey === normalized));
  }

  async findPublicDemoRequestByIdempotencyKeyAsync(idempotencyKey: string): Promise<PublicDemoRequestRecord | undefined> {
    const normalized = String(idempotencyKey ?? "").trim();
    if (!normalized) {
      return undefined;
    }

    if (!this.prismaClient) {
      return this.findPublicDemoRequestByIdempotencyKey(normalized);
    }

    const row = await this.prismaClient.publicDemoRequest.findFirst({ where: { idempotencyKey: normalized } });
    return row ? toPublicDemoRequest(row) : undefined;
  }

  savePublicDemoRequest(request: PublicDemoRequestRecord): PublicDemoRequestRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = normalizePublicDemoRequest(request);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.publicDemoRequests.some((item) => item.id === persisted.id);

      return {
        ...current,
        publicDemoRequests: exists
          ? current.publicDemoRequests.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.publicDemoRequests, persisted]
      };
    });

    return clone(persisted);
  }

  async savePublicDemoRequestAsync(request: PublicDemoRequestRecord): Promise<PublicDemoRequestRecord> {
    const persisted = normalizePublicDemoRequest(request);
    if (!this.prismaClient) {
      return this.savePublicDemoRequest(persisted);
    }

    const row = await this.prismaClient.publicDemoRequest.upsert({
      create: toPrismaPublicDemoRequestCreateInput(persisted),
      update: toPrismaPublicDemoRequestUpdateInput(persisted),
      where: { id: persisted.id }
    });

    return toPublicDemoRequest(row);
  }

  async saveApiKeyRotationJobAsync(job: ApiKeyRotationJob): Promise<ApiKeyRotationJob> {
    const persisted = clone(job);
    if (!this.prismaClient) {
      return this.saveApiKeyRotationJob(persisted);
    }

    const row = await this.prismaClient.integrationApiKeyRotationJob.upsert({
      create: toPrismaApiKeyRotationJobCreateInput(persisted),
      update: toPrismaApiKeyRotationJobUpdateInput(persisted),
      where: { rotationId: persisted.rotationId }
    });

    return toApiKeyRotationJob(row);
  }

  savePublicDemoRequestAuditEvent(event: PublicDemoRequestAuditEvent): PublicDemoRequestAuditEvent {
    this.assertSyncRuntimeAvailable();
    const persisted = normalizePublicDemoRequestAuditEvent(event);
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        publicDemoRequestAuditEvents: [...current.publicDemoRequestAuditEvents, persisted]
      };
    });

    return clone(persisted);
  }

  async savePublicDemoRequestAuditEventAsync(event: PublicDemoRequestAuditEvent): Promise<PublicDemoRequestAuditEvent> {
    const persisted = normalizePublicDemoRequestAuditEvent(event);
    if (!this.prismaClient) {
      return this.savePublicDemoRequestAuditEvent(persisted);
    }

    const row = await this.prismaClient.publicDemoRequestAuditEvent.create({
      data: toPrismaPublicDemoRequestAuditEventCreateInput(persisted)
    });

    return toPublicDemoRequestAuditEvent(row);
  }

  savePublicDemoRequestNotificationDescriptor(
    descriptor: PublicDemoRequestNotificationDescriptor
  ): PublicDemoRequestNotificationDescriptor {
    this.assertSyncRuntimeAvailable();
    const persisted = normalizePublicDemoRequestNotificationDescriptor(descriptor);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.publicDemoRequestNotificationDescriptors.some((item) => item.id === persisted.id);

      return {
        ...current,
        publicDemoRequestNotificationDescriptors: exists
          ? current.publicDemoRequestNotificationDescriptors.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.publicDemoRequestNotificationDescriptors, persisted]
      };
    });

    return clone(persisted);
  }

  async listPublicDemoRequestNotificationDescriptorsAsync(
    filters: PublicDemoRequestNotificationDescriptorFilters = {}
  ): Promise<PublicDemoRequestNotificationDescriptor[]> {
    const normalizedQueue = filters.queue ?? "lead-notification";
    const normalizedStatus = normalizePublicDemoRequestNotificationStatus(filters.status ?? "queued");
    const limit = Number.isInteger(filters.limit) && Number(filters.limit) > 0 ? Number(filters.limit) : undefined;

    if (!this.prismaClient) {
      const descriptors = normalizeState(await this.readStateAsync())
        .publicDemoRequestNotificationDescriptors
        .filter((descriptor) => descriptor.queue === normalizedQueue && descriptor.status === normalizedStatus)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      return clone(typeof limit === "number" ? descriptors.slice(0, limit) : descriptors);
    }

    const rows = await this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({
      orderBy: { createdAt: "asc" },
      take: limit,
      where: {
        queue: normalizedQueue,
        status: normalizedStatus
      }
    });

    return rows.map(toPublicDemoRequestNotificationDescriptor);
  }

  async summarizePublicDemoRequestNotificationDescriptorsAsync(
    filters: Pick<PublicDemoRequestNotificationDescriptorFilters, "queue"> = {}
  ): Promise<PublicDemoRequestNotificationDescriptorSummary> {
    const queue = filters.queue ?? "lead-notification";

    if (!this.prismaClient) {
      const descriptors = normalizeState(await this.readStateAsync())
        .publicDemoRequestNotificationDescriptors
        .filter((descriptor) => descriptor.queue === queue);
      const queued = descriptors.filter((descriptor) => descriptor.status === "queued");
      const failed = descriptors.filter((descriptor) => descriptor.status === "failed");
      const evidenceDescriptors = failed.length ? failed : descriptors;

      return {
        deadLetterCount: failed.length,
        latestDescriptor: latestPublicDemoRequestNotificationDescriptor(evidenceDescriptors),
        queue,
        queueDepth: queued.length
      };
    }

    const [
      queueDepth,
      deadLetterCount,
      queuedRows,
      failedRows,
      deliveredRows
    ] = await Promise.all([
      this.prismaClient.publicDemoRequestNotificationDescriptor.count({ where: { queue, status: "queued" } }),
      this.prismaClient.publicDemoRequestNotificationDescriptor.count({ where: { queue, status: "failed" } }),
      this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({
        orderBy: { updatedAt: "desc" },
        take: 25,
        where: { queue, status: "queued" }
      }),
      this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({
        orderBy: { updatedAt: "desc" },
        take: 25,
        where: { queue, status: "failed" }
      }),
      this.prismaClient.publicDemoRequestNotificationDescriptor.findMany({
        orderBy: { updatedAt: "desc" },
        take: 25,
        where: { queue, status: "delivered" }
      })
    ]);
    const queuedDescriptors = queuedRows.map(toPublicDemoRequestNotificationDescriptor);
    const failedDescriptors = failedRows.map(toPublicDemoRequestNotificationDescriptor);
    const deliveredDescriptors = deliveredRows.map(toPublicDemoRequestNotificationDescriptor);
    const evidenceDescriptors = deadLetterCount > 0
      ? failedDescriptors
      : [...queuedDescriptors, ...deliveredDescriptors];

    return {
      deadLetterCount,
      latestDescriptor: latestPublicDemoRequestNotificationDescriptor(evidenceDescriptors),
      queue,
      queueDepth
    };
  }

  async savePublicDemoRequestNotificationDescriptorAsync(
    descriptor: PublicDemoRequestNotificationDescriptor
  ): Promise<PublicDemoRequestNotificationDescriptor> {
    const persisted = normalizePublicDemoRequestNotificationDescriptor(descriptor);
    if (!this.prismaClient) {
      return this.savePublicDemoRequestNotificationDescriptor(persisted);
    }

    const row = await this.prismaClient.publicDemoRequestNotificationDescriptor.upsert({
      create: toPrismaPublicDemoRequestNotificationDescriptorCreateInput(persisted),
      update: toPrismaPublicDemoRequestNotificationDescriptorUpdateInput(persisted),
      where: { id: persisted.id }
    });

    return toPublicDemoRequestNotificationDescriptor(row);
  }

  private markPublicApiKeyRevealConsumed(keyId: string, consumedAt: string): void {
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        publicApiKeyRevealStates: current.publicApiKeyRevealStates.map((item) => item.keyId === keyId
          ? { ...item, consumedAt, status: "consumed" }
          : item)
      };
    });
  }

  private async savePrismaPublicApiKey(
    key: PublicApiKeyStoredRecord,
    revealState: PublicApiKeyRevealStateRecord,
    normalizedSecret: string
  ): Promise<PublicApiKeyStoredRecord> {
    if (!this.prismaClient) {
      return key;
    }

    const create = toPrismaPublicApiKeyCreateInput(key);
    const row = await this.prismaClient.publicApiKey.upsert({
      create,
      update: toPrismaPublicApiKeyUpdateInput(create),
      where: { keyId: key.keyId }
    });
    if (this.prismaClient.publicApiKeyRevealState) {
      const revealCreate = toPrismaPublicApiKeyRevealStateCreateInput(revealState);
      const persistedRevealState = await this.prismaClient.publicApiKeyRevealState.upsert({
        create: revealCreate,
        update: toPrismaPublicApiKeyRevealStateUpdateInput(revealCreate),
        where: { keyId: revealState.keyId }
      });
      if (persistedRevealState.status === "available") {
        this.publicApiRevealSecrets.set(key.keyId, normalizedSecret);
      } else {
        this.publicApiRevealSecrets.delete(key.keyId);
      }
    }

    return toPublicApiKeyStoredRecord(row);
  }

  private async savePrismaPublicApiKeyReference(key: PublicApiKeyStoredRecord): Promise<PublicApiKeyStoredRecord> {
    if (!this.prismaClient) {
      return key;
    }

    const create = toPrismaPublicApiKeyCreateInput(key);
    const row = await this.prismaClient.publicApiKey.upsert({
      create,
      update: toPrismaPublicApiKeyReferenceUpdateInput(create),
      where: { keyId: key.keyId }
    });

    return toPublicApiKeyStoredRecord(row);
  }

  private async updatePrismaPublicApiKeyStatus(input: UpdatePublicApiKeyStatusInput): Promise<PublicApiKeyStoredRecord | undefined> {
    if (!this.prismaClient) {
      return undefined;
    }

    const row = await this.prismaClient.publicApiKey.findUnique({ where: { keyId: input.keyId } });
    if (!row) {
      return undefined;
    }

    const updated = await this.prismaClient.publicApiKey.upsert({
      create: row,
      update: { status: input.status },
      where: { keyId: input.keyId }
    });

    return toPublicApiKeyStoredRecord(updated);
  }

  private async consumePrismaPublicApiKeyReveal(input: ConsumePublicApiKeyRevealInput): Promise<PublicApiKeyRevealResult> {
    const revealDelegate = this.prismaClient?.publicApiKeyRevealState;
    if (!revealDelegate) {
      return {
        consumedAt: input.consumedAt,
        keyId: input.keyId,
        status: "not_found"
      };
    }

    const revealState = await revealDelegate.findUnique({ where: { keyId: input.keyId } });
    if (!revealState) {
      return {
        consumedAt: input.consumedAt,
        keyId: input.keyId,
        status: "not_found"
      };
    }

    if (revealState.status !== "available") {
      return {
        consumedAt: revealState.consumedAt?.toISOString() ?? input.consumedAt,
        keyId: input.keyId,
        keyPreview: revealState.keyPreview,
        status: "consumed"
      };
    }

    const transition = await revealDelegate.updateMany({
      data: {
        consumedAt: new Date(input.consumedAt),
        keyPreview: revealState.keyPreview,
        status: "consumed"
      },
      where: { keyId: input.keyId, status: "available" }
    });

    if (transition.count !== 1) {
      const consumedState = await revealDelegate.findUnique({ where: { keyId: input.keyId } });

      return {
        consumedAt: consumedState?.consumedAt?.toISOString() ?? input.consumedAt,
        keyId: input.keyId,
        keyPreview: consumedState?.keyPreview ?? revealState.keyPreview,
        status: "consumed"
      };
    }

    const rawSecret = this.publicApiRevealSecrets.get(input.keyId);
    this.publicApiRevealSecrets.delete(input.keyId);

    if (!rawSecret) {
      return {
        consumedAt: input.consumedAt,
        keyId: input.keyId,
        keyPreview: revealState.keyPreview,
        status: "consumed"
      };
    }

    return {
      consumedAt: input.consumedAt,
      keyId: input.keyId,
      keyPreview: revealState.keyPreview,
      rawSecret,
      status: "revealed"
    };
  }

  private async savePrismaApiKeyRotationAuditEvent(event: ApiKeyRotationAuditEvent): Promise<ApiKeyRotationAuditEvent> {
    if (!this.prismaClient) {
      return event;
    }

    const row = await this.prismaClient.publicApiKeyRotationAuditEvent.create({
      data: toPrismaApiKeyRotationAuditEventCreateInput(event)
    });

    return toApiKeyRotationAuditEvent(row);
  }

  findWebhookReplay(idempotencyKey: string): WebhookReplayJournalEntry | undefined {
    this.assertSyncRuntimeAvailable();
    return clone(this.readState().webhookReplayJournal.find((item) => item.idempotencyKey === idempotencyKey));
  }

  async findWebhookReplayAsync(idempotencyKey: string): Promise<WebhookReplayJournalEntry | undefined> {
    const normalized = String(idempotencyKey ?? "").trim();
    if (!normalized) {
      return undefined;
    }

    if (!this.prismaClient) {
      return this.findWebhookReplay(normalized);
    }

    const row = await this.prismaClient.webhookReplayJournalEntry.findUnique({
      where: { idempotencyKey: normalized }
    });

    return row ? toWebhookReplayJournalEntry(row) : undefined;
  }

  saveWebhookReplay(entry: WebhookReplayJournalEntry): WebhookReplayJournalEntry {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(entry);
    const existing = this.findWebhookReplay(persisted.idempotencyKey);
    if (existing) {
      return existing;
    }

    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        webhookReplayJournal: [...current.webhookReplayJournal, persisted]
      };
    });

    return clone(persisted);
  }

  async saveWebhookReplayAsync(entry: WebhookReplayJournalEntry): Promise<WebhookReplayJournalEntry> {
    const persisted = clone(entry);
    if (!this.prismaClient) {
      return this.saveWebhookReplay(persisted);
    }

    const existing = await this.findWebhookReplayAsync(persisted.idempotencyKey);
    if (existing) {
      return existing;
    }

    const row = await this.prismaClient.webhookReplayJournalEntry.upsert({
      create: toPrismaWebhookReplayJournalCreateInput(persisted),
      update: {},
      where: { idempotencyKey: persisted.idempotencyKey }
    });

    return toWebhookReplayJournalEntry(row);
  }

  saveWebhookReplayAuditEvent(event: WebhookReplayAuditEvent): WebhookReplayAuditEvent {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(event);
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        webhookReplayAuditEvents: [...current.webhookReplayAuditEvents, persisted]
      };
    });

    return clone(persisted);
  }

  async saveWebhookReplayAuditEventAsync(event: WebhookReplayAuditEvent): Promise<WebhookReplayAuditEvent> {
    const persisted = clone(event);
    if (!this.prismaClient) {
      return this.saveWebhookReplayAuditEvent(persisted);
    }

    const row = await this.prismaClient.webhookReplayAuditEvent.create({
      data: toPrismaWebhookReplayAuditEventCreateInput(persisted)
    });

    return toWebhookReplayAuditEvent(row);
  }

  findWebhookDeliveryJournalEntry(deliveryId: string): WebhookDeliveryJournalEntry | undefined {
    this.assertSyncRuntimeAvailable();
    return clone(this.readState().webhookDeliveryJournal.find((item) => item.deliveryId === deliveryId));
  }

  async findWebhookDeliveryJournalEntryAsync(deliveryId: string): Promise<WebhookDeliveryJournalEntry | undefined> {
    const normalized = String(deliveryId ?? "").trim();
    if (!normalized) {
      return undefined;
    }

    if (!this.prismaClient) {
      return this.findWebhookDeliveryJournalEntry(normalized);
    }

    const row = await this.prismaClient.webhookDeliveryJournalEntry.findUnique({
      where: { deliveryId: normalized }
    });

    return row ? toWebhookDeliveryJournalEntry(row) : undefined;
  }

  listWebhookDeliveryJournal(filters: WebhookDeliveryJournalFilters = {}): WebhookDeliveryJournalEntry[] {
    this.assertSyncRuntimeAvailable();
    const status = String(filters.status ?? "").trim();
    const rows = this.readState().webhookDeliveryJournal;

    return clone(status ? rows.filter((item) => item.status === status) : rows);
  }

  async listWebhookDeliveryJournalAsync(filters: WebhookDeliveryJournalFilters = {}): Promise<WebhookDeliveryJournalEntry[]> {
    if (!this.prismaClient) {
      return this.listWebhookDeliveryJournal(filters);
    }

    const status = String(filters.status ?? "").trim();
    const rows = await this.prismaClient.webhookDeliveryJournalEntry.findMany({
      orderBy: { createdAt: "asc" },
      where: {
        ...(status ? { status } : {})
      }
    });

    return rows.map(toWebhookDeliveryJournalEntry);
  }

  saveWebhookDeliveryJournalEntry(entry: WebhookDeliveryJournalEntry): WebhookDeliveryJournalEntry {
    this.assertSyncRuntimeAvailable();
    const persisted = normalizeWebhookDeliveryJournalEntry(entry);
    const existing = this.findWebhookDeliveryJournalEntry(persisted.deliveryId);
    if (existing) {
      return existing;
    }

    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        webhookDeliveryJournal: [...current.webhookDeliveryJournal, persisted]
      };
    });

    return clone(persisted);
  }

  async saveWebhookDeliveryJournalEntryAsync(entry: WebhookDeliveryJournalEntry): Promise<WebhookDeliveryJournalEntry> {
    const persisted = normalizeWebhookDeliveryJournalEntry(entry);
    if (!this.prismaClient) {
      return this.saveWebhookDeliveryJournalEntry(persisted);
    }

    const existing = await this.findWebhookDeliveryJournalEntryAsync(persisted.deliveryId);
    if (existing) {
      return existing;
    }

    const row = await this.prismaClient.webhookDeliveryJournalEntry.upsert({
      create: toPrismaWebhookDeliveryJournalCreateInput(persisted),
      update: {},
      where: { deliveryId: persisted.deliveryId }
    });

    return toWebhookDeliveryJournalEntry(row);
  }

  recordWebhookDeliveryRetryState(input: RecordWebhookDeliveryRetryStateInput): WebhookDeliveryJournalEntry | undefined {
    this.assertSyncRuntimeAvailable();
    const existing = this.findWebhookDeliveryJournalEntry(input.deliveryId);
    if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
      return undefined;
    }

    const next = normalizeWebhookDeliveryJournalEntry({
      ...existing,
      attempts: input.attempts,
      lastAttemptAt: input.lastAttemptAt,
      lastError: normalizeWebhookDeliveryJournalError(input.lastError),
      lockedAt: undefined,
      nextAttemptAt: input.nextAttemptAt,
      status: "retry_scheduled"
    });
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        webhookDeliveryJournal: current.webhookDeliveryJournal.map((item) => item.deliveryId === input.deliveryId ? next : item)
      };
    });

    return clone(next);
  }

  async recordWebhookDeliveryRetryStateAsync(input: RecordWebhookDeliveryRetryStateInput): Promise<WebhookDeliveryJournalEntry | undefined> {
    if (!this.prismaClient) {
      return this.recordWebhookDeliveryRetryState(input);
    }

    const existing = await this.findWebhookDeliveryJournalEntryAsync(input.deliveryId);
    if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
      return undefined;
    }

    const row = await this.prismaClient.webhookDeliveryJournalEntry.update({
      data: {
        attempts: input.attempts,
        lastAttemptAt: new Date(input.lastAttemptAt),
        lastError: normalizeWebhookDeliveryJournalError(input.lastError),
        lockedAt: null,
        nextAttemptAt: new Date(input.nextAttemptAt),
        status: "retry_scheduled",
        updatedAt: new Date(input.lastAttemptAt)
      },
      where: { deliveryId: input.deliveryId }
    });

    return toWebhookDeliveryJournalEntry(row);
  }

  recordWebhookDeliveryDeadLetterState(input: RecordWebhookDeliveryDeadLetterStateInput): WebhookDeliveryJournalEntry | undefined {
    this.assertSyncRuntimeAvailable();
    const existing = this.findWebhookDeliveryJournalEntry(input.deliveryId);
    if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
      return undefined;
    }

    const next = normalizeWebhookDeliveryJournalEntry({
      ...existing,
      attempts: input.attempts,
      deadLetteredAt: input.deadLetteredAt,
      lastAttemptAt: input.lastAttemptAt,
      lastError: normalizeWebhookDeliveryJournalError(input.lastError),
      lockedAt: undefined,
      nextAttemptAt: undefined,
      status: "dead_lettered"
    });
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        webhookDeliveryJournal: current.webhookDeliveryJournal.map((item) => item.deliveryId === input.deliveryId ? next : item)
      };
    });

    return clone(next);
  }

  async recordWebhookDeliveryDeadLetterStateAsync(input: RecordWebhookDeliveryDeadLetterStateInput): Promise<WebhookDeliveryJournalEntry | undefined> {
    if (!this.prismaClient) {
      return this.recordWebhookDeliveryDeadLetterState(input);
    }

    const existing = await this.findWebhookDeliveryJournalEntryAsync(input.deliveryId);
    if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
      return undefined;
    }

    const row = await this.prismaClient.webhookDeliveryJournalEntry.update({
      data: {
        attempts: input.attempts,
        deadLetteredAt: new Date(input.deadLetteredAt),
        lastAttemptAt: new Date(input.lastAttemptAt),
        lastError: normalizeWebhookDeliveryJournalError(input.lastError),
        lockedAt: null,
        nextAttemptAt: null,
        status: "dead_lettered",
        updatedAt: new Date(input.lastAttemptAt)
      },
      where: { deliveryId: input.deliveryId }
    });

    return toWebhookDeliveryJournalEntry(row);
  }

  recordWebhookDeliveryAttemptSuccess(input: RecordWebhookDeliveryAttemptSuccessInput): WebhookDeliveryJournalEntry | undefined {
    this.assertSyncRuntimeAvailable();
    const existing = this.findWebhookDeliveryJournalEntry(input.deliveryId);
    if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
      return undefined;
    }

    const next = normalizeWebhookDeliveryJournalEntry({
      ...existing,
      attempts: existing.attempts + 1,
      lastAttemptAt: input.attemptedAt,
      lastError: undefined,
      lockedAt: undefined,
      nextAttemptAt: undefined,
      status: "delivered"
    });
    this.store.update((state) => {
      const current = normalizeState(state);

      return {
        ...current,
        webhookDeliveryJournal: current.webhookDeliveryJournal.map((item) => item.deliveryId === input.deliveryId ? next : item)
      };
    });

    return clone(next);
  }

  async recordWebhookDeliveryAttemptSuccessAsync(input: RecordWebhookDeliveryAttemptSuccessInput): Promise<WebhookDeliveryJournalEntry | undefined> {
    if (!this.prismaClient) {
      return this.recordWebhookDeliveryAttemptSuccess(input);
    }

    const existing = await this.findWebhookDeliveryJournalEntryAsync(input.deliveryId);
    if (!existing || existing.status !== "publishing" || !existing.lockedAt) {
      return undefined;
    }

    const row = await this.prismaClient.webhookDeliveryJournalEntry.update({
      data: {
        attempts: existing.attempts + 1,
        lastAttemptAt: new Date(input.attemptedAt),
        lastError: null,
        lockedAt: null,
        nextAttemptAt: null,
        status: "delivered",
        updatedAt: new Date(input.attemptedAt)
      },
      where: { deliveryId: input.deliveryId }
    });

    return toWebhookDeliveryJournalEntry(row);
  }

  claimWebhookDeliveryJournalEntries(input: ClaimWebhookDeliveryJournalEntriesInput): WebhookDeliveryJournalEntry[] {
    this.assertSyncRuntimeAvailable();
    const nowMs = Date.parse(input.now);
    const limit = input.limit ?? 100;
    const leaseTimeoutMs = input.leaseTimeoutMs ?? 300_000;
    const staleBeforeMs = nowMs - leaseTimeoutMs;
    const claimedIds: string[] = [];

    const candidates = this.readState().webhookDeliveryJournal
      .filter((entry) => !input.queue || entry.queue === input.queue)
      .filter((entry) => isClaimableWebhookDeliveryJournalEntry(entry, nowMs, staleBeforeMs))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(0, limit);

    if (!candidates.length) {
      return [];
    }

    this.store.update((state) => {
      const current = normalizeState(state);
      const candidateIds = new Set(candidates.map((entry) => entry.deliveryId));

      return {
        ...current,
        webhookDeliveryJournal: current.webhookDeliveryJournal.map((entry) => {
          if (!candidateIds.has(entry.deliveryId) || claimedIds.includes(entry.deliveryId)) {
            return entry;
          }

          const claimed = normalizeWebhookDeliveryJournalEntry({
            ...entry,
            lockedAt: input.now,
            status: "publishing"
          });
          claimedIds.push(entry.deliveryId);

          return claimed;
        })
      };
    });

    return this.readState().webhookDeliveryJournal
      .filter((entry) => claimedIds.includes(entry.deliveryId))
      .sort((left, right) => claimedIds.indexOf(left.deliveryId) - claimedIds.indexOf(right.deliveryId));
  }

  async claimWebhookDeliveryJournalEntriesAsync(input: ClaimWebhookDeliveryJournalEntriesInput): Promise<WebhookDeliveryJournalEntry[]> {
    if (!this.prismaClient) {
      return this.claimWebhookDeliveryJournalEntries(input);
    }

    const nowMs = Date.parse(input.now);
    const limit = input.limit ?? 100;
    const leaseTimeoutMs = input.leaseTimeoutMs ?? 300_000;
    const staleBeforeMs = nowMs - leaseTimeoutMs;
    const rows = await this.prismaClient.webhookDeliveryJournalEntry.findMany({
      orderBy: { createdAt: "asc" },
      take: limit,
      where: {
        ...(input.queue ? { queue: input.queue } : {}),
        status: { in: ["queued", "retry_scheduled", "publishing"] }
      }
    });
    const candidates = rows
      .map(toWebhookDeliveryJournalEntry)
      .filter((entry) => isClaimableWebhookDeliveryJournalEntry(entry, nowMs, staleBeforeMs))
      .slice(0, limit);

    const claimed: WebhookDeliveryJournalEntry[] = [];
    for (const candidate of candidates) {
      const row = await this.prismaClient.webhookDeliveryJournalEntry.update({
        data: {
          lockedAt: new Date(input.now),
          status: "publishing",
          updatedAt: new Date(input.now)
        },
        where: { deliveryId: candidate.deliveryId }
      });
      claimed.push(toWebhookDeliveryJournalEntry(row));
    }

    return claimed;
  }

  listSecuritySessions(): SecuritySession[] {
    this.assertSyncRuntimeAvailable();
    return clone(this.readState().securitySessions);
  }

  async listSecuritySessionsAsync(): Promise<SecuritySession[]> {
    if (!this.prismaClient) {
      return this.listSecuritySessions();
    }

    const rows = await this.prismaClient.securitySession.findMany({ orderBy: { lastSeen: "asc" } });
    return rows.map(toSecuritySession);
  }

  saveSecuritySession(session: SecuritySession): SecuritySession {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(session);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.securitySessions.some((item) => item.id === persisted.id);

      return {
        ...current,
        securitySessions: exists
          ? current.securitySessions.map((item) => item.id === persisted.id ? persisted : item)
          : [...current.securitySessions, persisted]
      };
    });

    return clone(persisted);
  }

  async saveSecuritySessionAsync(session: SecuritySession): Promise<SecuritySession> {
    const persisted = clone(session);
    if (!this.prismaClient) {
      return this.saveSecuritySession(persisted);
    }

    const row = await this.prismaClient.securitySession.upsert({
      create: toPrismaSecuritySessionCreateInput(persisted),
      update: toPrismaSecuritySessionUpdateInput(persisted),
      where: { id: persisted.id }
    });

    return toSecuritySession(row);
  }

  listChannelConnections(filters: { tenantId: string; type?: string }): ChannelConnectionStoredRecord[] {
    this.assertSyncRuntimeAvailable();
    const tenantId = String(filters.tenantId ?? "").trim();
    const type = String(filters.type ?? "").trim().toLowerCase();
    return clone(this.readState().channelConnections.filter((connection) =>
      connection.tenantId === tenantId && (!type || connection.type === type)
    ));
  }

  async listChannelConnectionsAsync(filters: { tenantId: string; type?: string }): Promise<ChannelConnectionStoredRecord[]> {
    if (!this.prismaClient) {
      return this.listChannelConnections(filters);
    }

    const tenantId = String(filters.tenantId ?? "").trim();
    const type = String(filters.type ?? "").trim().toLowerCase();
    const rows = await this.prismaClient.channelConnection.findMany({
      orderBy: { createdAt: "asc" },
      where: {
        tenantId,
        ...(type ? { type } : {})
      }
    });

    return rows.map(toChannelConnection);
  }

  async upsertSdkVisitorPresence(input: UpsertSdkVisitorPresenceInput): Promise<SdkVisitorPresenceSessionRecord> {
    const now = input.lastSeenAt;
    if (!this.prismaClient) {
      let saved!: SdkVisitorPresenceSessionRecord;
      this.store.update((state) => {
        const current = normalizeState(state);
        const existing = current.sdkVisitorPresenceSessions.find((item) => item.tenantId === input.tenantId
          && item.channelConnectionId === input.channelConnectionId && item.sessionKeyHash === input.sessionKeyHash);
        saved = normalizeSdkVisitorPresence({
          ...(existing ?? { createdAt: now, firstSeenAt: now, id: `sdk_presence_${randomUUID()}` }),
          ...input, connected: true, disconnectedAt: null, updatedAt: now
        });
        return { ...current, sdkVisitorPresenceSessions: existing
          ? current.sdkVisitorPresenceSessions.map((item) => item.id === existing.id ? saved : item)
          : [...current.sdkVisitorPresenceSessions, saved] };
      });
      return clone(saved);
    }
    const delegate = this.prismaClient.sdkVisitorPresenceSession;
    if (!delegate) throw new Error("prisma_sdk_visitor_presence_delegate_required");
    const key = { channelConnectionId: input.channelConnectionId, sessionKeyHash: input.sessionKeyHash, tenantId: input.tenantId };
    const row = await delegate.upsert({
      create: toPrismaSdkVisitorPresence({ ...input, connected: true, createdAt: now, disconnectedAt: null,
        firstSeenAt: now, id: `sdk_presence_${randomUUID()}`, updatedAt: now }),
      update: { connected: true, disconnectedAt: null, expiresAt: new Date(input.expiresAt), lastSeenAt: new Date(now),
        pagePath: input.pagePath, pageUrl: input.pageUrl, referrer: input.referrer, subjectId: input.subjectId, updatedAt: new Date(now) },
      where: { tenantId_channelConnectionId_sessionKeyHash: key }
    });
    return fromPrismaSdkVisitorPresence(row);
  }

  async disconnectSdkVisitorPresence(input: { channelConnectionId: string; disconnectedAt: string; sessionKeyHash: string; tenantId: string }): Promise<SdkVisitorPresenceSessionRecord | null> {
    if (!this.prismaClient) {
      const existing = this.readState().sdkVisitorPresenceSessions.find((item) => item.tenantId === input.tenantId
        && item.channelConnectionId === input.channelConnectionId && item.sessionKeyHash === input.sessionKeyHash);
      if (!existing) return null;
      const saved = normalizeSdkVisitorPresence({ ...existing, connected: false, disconnectedAt: input.disconnectedAt,
        expiresAt: input.disconnectedAt, lastSeenAt: input.disconnectedAt, updatedAt: input.disconnectedAt });
      this.store.update((state) => ({ ...normalizeState(state), sdkVisitorPresenceSessions:
        normalizeState(state).sdkVisitorPresenceSessions.map((item) => item.id === saved.id ? saved : item) }));
      return clone(saved);
    }
    const delegate = this.prismaClient.sdkVisitorPresenceSession;
    if (!delegate) throw new Error("prisma_sdk_visitor_presence_delegate_required");
    const where = { tenantId_channelConnectionId_sessionKeyHash: { channelConnectionId: input.channelConnectionId,
      sessionKeyHash: input.sessionKeyHash, tenantId: input.tenantId } };
    const existing = await delegate.findUnique({ where });
    if (!existing) return null;
    const row = await delegate.upsert({ create: existing, update: { connected: false, disconnectedAt: new Date(input.disconnectedAt),
      expiresAt: new Date(input.disconnectedAt), lastSeenAt: new Date(input.disconnectedAt), updatedAt: new Date(input.disconnectedAt) }, where });
    return fromPrismaSdkVisitorPresence(row);
  }

  async listLiveSdkVisitorPresence(input: { at: string; limit?: number; tenantId?: string } ): Promise<SdkVisitorPresenceSessionRecord[]> {
    const limit = Number.isInteger(input.limit) && Number(input.limit) > 0 ? Number(input.limit) : 50;
    if (!this.prismaClient) return this.readState().sdkVisitorPresenceSessions
      .filter((item) => item.connected && item.expiresAt > input.at && (!input.tenantId || item.tenantId === input.tenantId))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, limit).map(clone);
    const delegate = this.prismaClient.sdkVisitorPresenceSession;
    if (!delegate) throw new Error("prisma_sdk_visitor_presence_delegate_required");
    const rows = await delegate.findMany({ orderBy: { lastSeenAt: "desc" }, take: limit,
      where: { connected: true, expiresAt: { gt: new Date(input.at) }, ...(input.tenantId ? { tenantId: input.tenantId } : {}) } });
    return rows.map(fromPrismaSdkVisitorPresence);
  }

  findChannelConnection(tenantId: string, connectionId: string): ChannelConnectionStoredRecord | undefined {
    this.assertSyncRuntimeAvailable();
    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedConnectionId = String(connectionId ?? "").trim();
    return clone(this.readState().channelConnections.find((connection) =>
      connection.tenantId === normalizedTenantId && connection.id === normalizedConnectionId
    ));
  }

  async findChannelConnectionAsync(tenantId: string, connectionId: string): Promise<ChannelConnectionStoredRecord | undefined> {
    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedConnectionId = String(connectionId ?? "").trim();
    if (!normalizedTenantId || !normalizedConnectionId) {
      return undefined;
    }

    if (!this.prismaClient) {
      return this.findChannelConnection(normalizedTenantId, normalizedConnectionId);
    }

    const row = await this.prismaClient.channelConnection.findUnique({
      where: { id: normalizedConnectionId }
    });
    if (!row || row.tenantId !== normalizedTenantId) {
      return undefined;
    }

    return toChannelConnection(row);
  }

  saveChannelConnection(connection: ChannelConnectionStoredRecord): ChannelConnectionStoredRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = normalizeChannelConnection(connection);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.channelConnections.some((item) =>
        item.tenantId === persisted.tenantId && item.id === persisted.id
      );

      return {
        ...current,
        channelConnections: exists
          ? current.channelConnections.map((item) =>
            item.tenantId === persisted.tenantId && item.id === persisted.id ? persisted : item
          )
          : [...current.channelConnections, persisted]
      };
    });

    return clone(persisted);
  }

  async saveChannelConnectionAsync(connection: ChannelConnectionStoredRecord): Promise<ChannelConnectionStoredRecord> {
    const persisted = normalizeChannelConnection(connection);
    if (!this.prismaClient) {
      return this.saveChannelConnection(persisted);
    }

    const row = await this.prismaClient.channelConnection.upsert({
      create: toPrismaChannelConnectionCreateInput(persisted),
      update: toPrismaChannelConnectionUpdateInput(persisted),
      where: { id: persisted.id }
    });

    return toChannelConnection(row);
  }

  listChannelConnectionEvents(tenantId: string, connectionId: string): ChannelConnectionEventRecord[] {
    this.assertSyncRuntimeAvailable();
    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedConnectionId = String(connectionId ?? "").trim();
    return clone(this.readState().channelConnectionEvents.filter((event) =>
      event.tenantId === normalizedTenantId && event.connectionId === normalizedConnectionId
    ));
  }

  async listChannelConnectionEventsAsync(tenantId: string, connectionId: string): Promise<ChannelConnectionEventRecord[]> {
    if (!this.prismaClient) {
      return this.listChannelConnectionEvents(tenantId, connectionId);
    }

    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedConnectionId = String(connectionId ?? "").trim();
    const rows = await this.prismaClient.channelConnectionEvent.findMany({
      orderBy: { at: "asc" },
      where: {
        connectionId: normalizedConnectionId,
        tenantId: normalizedTenantId
      }
    });

    return rows.map(toChannelConnectionEvent);
  }

  saveChannelConnectionEvent(event: ChannelConnectionEventRecord): ChannelConnectionEventRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = normalizeChannelConnectionEvent(event);
    this.store.update((state) => {
      const current = normalizeState(state);
      return {
        ...current,
        channelConnectionEvents: [...current.channelConnectionEvents, persisted]
      };
    });

    return clone(persisted);
  }

  async saveChannelConnectionEventAsync(event: ChannelConnectionEventRecord): Promise<ChannelConnectionEventRecord> {
    const persisted = normalizeChannelConnectionEvent(event);
    if (!this.prismaClient) {
      return this.saveChannelConnectionEvent(persisted);
    }

    const row = await this.prismaClient.channelConnectionEvent.create({
      data: toPrismaChannelConnectionEventCreateInput(persisted)
    });

    return toChannelConnectionEvent(row);
  }

  listChannelConnectionAuditEvents(): ChannelConnectionAuditEventRecord[] {
    this.assertSyncRuntimeAvailable();
    return clone(this.readState().channelConnectionAuditEvents);
  }

  async listChannelConnectionAuditEventsAsync(): Promise<ChannelConnectionAuditEventRecord[]> {
    if (!this.prismaClient) {
      return this.listChannelConnectionAuditEvents();
    }

    const rows = await this.prismaClient.channelConnectionAuditEvent.findMany({ orderBy: { at: "asc" } });
    return rows.map(toChannelConnectionAuditEvent);
  }

  saveChannelConnectionAuditEvent(event: ChannelConnectionAuditEventRecord): ChannelConnectionAuditEventRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = normalizeChannelConnectionAuditEvent(event);
    this.store.update((state) => {
      const current = normalizeState(state);
      return {
        ...current,
        channelConnectionAuditEvents: [...current.channelConnectionAuditEvents, persisted]
      };
    });

    return clone(persisted);
  }

  async saveChannelConnectionAuditEventAsync(event: ChannelConnectionAuditEventRecord): Promise<ChannelConnectionAuditEventRecord> {
    const persisted = normalizeChannelConnectionAuditEvent(event);
    if (!this.prismaClient) {
      return this.saveChannelConnectionAuditEvent(persisted);
    }

    const row = await this.prismaClient.channelConnectionAuditEvent.create({
      data: toPrismaChannelConnectionAuditEventCreateInput(persisted)
    });

    return toChannelConnectionAuditEvent(row);
  }

  findProviderConnectionCredential(tenantId: string, channelConnectionId: string): ProviderConnectionCredentialRecord | undefined {
    this.assertSyncRuntimeAvailable();
    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedConnectionId = String(channelConnectionId ?? "").trim();
    return clone((this.readState().providerConnectionCredentials ?? []).find((item) =>
      item.tenantId === normalizedTenantId && item.channelConnectionId === normalizedConnectionId
    ));
  }

  async findProviderConnectionCredentialAsync(tenantId: string, channelConnectionId: string): Promise<ProviderConnectionCredentialRecord | undefined> {
    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedConnectionId = String(channelConnectionId ?? "").trim();
    if (!normalizedTenantId || !normalizedConnectionId) return undefined;
    if (!this.prismaClient) return this.findProviderConnectionCredential(normalizedTenantId, normalizedConnectionId);
    const row = await this.prismaClient.providerConnectionCredential.findUnique({ where: { channelConnectionId: normalizedConnectionId } });
    return row?.tenantId === normalizedTenantId ? toProviderConnectionCredential(row) : undefined;
  }

  async findProviderConnectionCredentialByConnectionIdAsync(channelConnectionId: string): Promise<ProviderConnectionCredentialRecord | undefined> {
    const normalizedConnectionId = String(channelConnectionId ?? "").trim();
    if (!normalizedConnectionId) return undefined;
    if (!this.prismaClient) {
      this.assertSyncRuntimeAvailable();
      return clone((this.readState().providerConnectionCredentials ?? []).find((item) => item.channelConnectionId === normalizedConnectionId));
    }
    const row = await this.prismaClient.providerConnectionCredential.findUnique({ where: { channelConnectionId: normalizedConnectionId } });
    return row ? toProviderConnectionCredential(row) : undefined;
  }

  listActiveProviderConnectionCredentials(tenantId: string, provider: string): ProviderConnectionCredentialRecord[] {
    this.assertSyncRuntimeAvailable();
    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedProvider = String(provider ?? "").trim().toLowerCase();
    return clone((this.readState().providerConnectionCredentials ?? []).filter((item) =>
      item.tenantId === normalizedTenantId && item.provider === normalizedProvider && item.status === "active"
    ));
  }

  async listActiveProviderConnectionCredentialsAsync(tenantId: string, provider: string): Promise<ProviderConnectionCredentialRecord[]> {
    const normalizedTenantId = String(tenantId ?? "").trim();
    const normalizedProvider = String(provider ?? "").trim().toLowerCase();
    if (!normalizedTenantId || !normalizedProvider) return [];
    if (!this.prismaClient) return this.listActiveProviderConnectionCredentials(normalizedTenantId, normalizedProvider);
    const rows = await this.prismaClient.providerConnectionCredential.findMany({
      orderBy: { createdAt: "asc" },
      where: { provider: normalizedProvider, status: "active", tenantId: normalizedTenantId }
    });
    return rows.map(toProviderConnectionCredential);
  }

  saveProviderConnectionCredential(credential: ProviderConnectionCredentialRecord): ProviderConnectionCredentialRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = normalizeProviderConnectionCredential(credential);
    this.store.update((state) => {
      const current = normalizeState(state);
      const credentials = current.providerConnectionCredentials ?? [];
      const exists = credentials.some((item) => item.channelConnectionId === persisted.channelConnectionId);
      return { ...current, providerConnectionCredentials: exists
        ? credentials.map((item) => item.channelConnectionId === persisted.channelConnectionId ? persisted : item)
        : [...credentials, persisted] };
    });
    return clone(persisted);
  }

  async saveProviderConnectionCredentialAsync(credential: ProviderConnectionCredentialRecord): Promise<ProviderConnectionCredentialRecord> {
    const persisted = normalizeProviderConnectionCredential(credential);
    if (!this.prismaClient) return this.saveProviderConnectionCredential(persisted);
    const row = await this.prismaClient.providerConnectionCredential.upsert({
      create: toPrismaProviderConnectionCredentialCreateInput(persisted),
      update: toPrismaProviderConnectionCredentialUpdateInput(persisted),
      where: { channelConnectionId: persisted.channelConnectionId }
    });
    return toProviderConnectionCredential(row);
  }

  findTelegramConnectionByTenantId(tenantId: string): TelegramConnectionStoredRecord | undefined {
    this.assertSyncRuntimeAvailable();
    const normalizedTenantId = String(tenantId ?? "").trim();
    return clone(this.readState().telegramConnections.find((item) => item.tenantId === normalizedTenantId));
  }

  async findTelegramConnectionByTenantIdAsync(tenantId: string): Promise<TelegramConnectionStoredRecord | undefined> {
    const normalizedTenantId = String(tenantId ?? "").trim();
    if (!normalizedTenantId) {
      return undefined;
    }

    if (!this.prismaClient) {
      return this.findTelegramConnectionByTenantId(normalizedTenantId);
    }

    const row = await this.prismaClient.telegramConnection.findFirst({
      where: { tenantId: normalizedTenantId }
    });

    return row ? toTelegramConnection(row) : undefined;
  }

  findTelegramConnectionByWebhookSecret(webhookSecret: string): TelegramConnectionStoredRecord | undefined {
    this.assertSyncRuntimeAvailable();
    const normalizedSecret = String(webhookSecret ?? "").trim();
    return clone(this.readState().telegramConnections.find((item) =>
      item.status === "active" && item.webhookSecret === normalizedSecret
    ));
  }

  async findTelegramConnectionByWebhookSecretAsync(webhookSecret: string): Promise<TelegramConnectionStoredRecord | undefined> {
    const normalizedSecret = String(webhookSecret ?? "").trim();
    if (!normalizedSecret) {
      return undefined;
    }

    if (!this.prismaClient) {
      return this.findTelegramConnectionByWebhookSecret(normalizedSecret);
    }

    const row = await this.prismaClient.telegramConnection.findFirst({
      where: { webhookSecret: normalizedSecret }
    });
    if (!row || row.status !== "active") {
      return undefined;
    }

    return toTelegramConnection(row);
  }

  listTelegramConnections(): TelegramConnectionStoredRecord[] {
    this.assertSyncRuntimeAvailable();
    return clone(this.readState().telegramConnections);
  }

  async listTelegramConnectionsAsync(): Promise<TelegramConnectionStoredRecord[]> {
    if (!this.prismaClient) {
      return this.listTelegramConnections();
    }

    const rows = await this.prismaClient.telegramConnection.findMany({ orderBy: { createdAt: "asc" } });
    return rows.map(toTelegramConnection);
  }

  saveTelegramConnection(connection: TelegramConnectionStoredRecord): TelegramConnectionStoredRecord {
    this.assertSyncRuntimeAvailable();
    const persisted = clone(connection);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.telegramConnections.some((item) => item.channelConnectionId === persisted.channelConnectionId);

      return {
        ...current,
        telegramConnections: exists
          ? current.telegramConnections.map((item) => item.channelConnectionId === persisted.channelConnectionId ? persisted : item)
          : [...current.telegramConnections, persisted]
      };
    });

    return clone(persisted);
  }

  async saveTelegramConnectionAsync(connection: TelegramConnectionStoredRecord): Promise<TelegramConnectionStoredRecord> {
    const persisted = normalizeTelegramConnections([connection])[0];
    if (!this.prismaClient) {
      return this.saveTelegramConnection(persisted);
    }

    const row = await this.prismaClient.telegramConnection.upsert({
      create: toPrismaTelegramConnectionCreateInput(persisted),
      update: toPrismaTelegramConnectionUpdateInput(persisted),
      where: { channelConnectionId: persisted.channelConnectionId }
    });

    return toTelegramConnection(row);
  }

  private assertSyncRuntimeAvailable(): void {
    if (this.prismaClient) {
      throw new Error("prisma_integration_async_required");
    }
  }
}

function emptyIntegrationWorkspace(): IntegrationWorkspaceCatalog {
  return {
    apiChangelog: [],
    apiEnvironmentKeys: [],
    channelDetails: [],
    securityAlerts: [],
    securityControls: [],
    webhookDeliveryLog: [],
    webhookEndpoints: []
  };
}

export function createEmptyIntegrationState(): IntegrationState {
  return {
    apiKeyRotationAuditEvents: [],
    apiKeyRotationJobs: [],
    channelConnectionAuditEvents: [],
    channelConnectionEvents: [],
    channelConnections: [],
    providerConnectionCredentials: [],
    publicApiKeys: [],
    publicApiKeyRevealStates: [],
    publicDemoRequestAuditEvents: [],
    publicDemoRequestNotificationDescriptors: [],
    publicDemoRequests: [],
    securitySessions: [],
    sdkVisitorPresenceSessions: [],
    telegramConnections: [],
    webhookDeliveryJournal: [],
    webhookEndpointRecords: [],
    webhookReplayAuditEvents: [],
    webhookReplayJournal: [],
    workspace: emptyIntegrationWorkspace()
  };
}

function normalizeState(state: Partial<IntegrationState>): IntegrationState {
  return {
    apiKeyRotationAuditEvents: state.apiKeyRotationAuditEvents ?? [],
    apiKeyRotationJobs: state.apiKeyRotationJobs ?? [],
    channelConnectionAuditEvents: normalizeChannelConnectionAuditEvents(state.channelConnectionAuditEvents),
    channelConnectionEvents: normalizeChannelConnectionEvents(state.channelConnectionEvents),
    channelConnections: normalizeChannelConnections(state.channelConnections),
    providerConnectionCredentials: normalizeProviderConnectionCredentials(state.providerConnectionCredentials),
    publicApiKeys: normalizePublicApiKeys(state.publicApiKeys),
    publicApiKeyRevealStates: normalizePublicApiKeyRevealStates(state.publicApiKeyRevealStates),
    publicDemoRequestAuditEvents: normalizePublicDemoRequestAuditEvents(state.publicDemoRequestAuditEvents),
    publicDemoRequestNotificationDescriptors: normalizePublicDemoRequestNotificationDescriptors(state.publicDemoRequestNotificationDescriptors),
    publicDemoRequests: normalizePublicDemoRequests(state.publicDemoRequests),
    securitySessions: state.securitySessions ?? [],
    sdkVisitorPresenceSessions: (state.sdkVisitorPresenceSessions ?? []).map(normalizeSdkVisitorPresence),
    telegramConnections: normalizeTelegramConnections(state.telegramConnections),
    webhookDeliveryJournal: normalizeWebhookDeliveryJournal(state.webhookDeliveryJournal),
    webhookEndpointRecords: normalizeWebhookEndpointRecords(state.webhookEndpointRecords),
    webhookReplayAuditEvents: state.webhookReplayAuditEvents ?? [],
    webhookReplayJournal: state.webhookReplayJournal ?? [],
    workspace: state.workspace ?? emptyIntegrationWorkspace()
  };
}

function normalizeSdkVisitorPresence(value: SdkVisitorPresenceSessionRecord): SdkVisitorPresenceSessionRecord {
  return {
    ...value,
    channelConnectionId: String(value.channelConnectionId ?? "").trim(),
    connected: Boolean(value.connected),
    pagePath: value.pagePath || null,
    pageUrl: value.pageUrl || null,
    referrer: value.referrer || null,
    sessionKeyHash: String(value.sessionKeyHash ?? "").trim(),
    subjectId: String(value.subjectId ?? "").trim(),
    tenantId: String(value.tenantId ?? "").trim()
  };
}

function toPrismaSdkVisitorPresence(value: SdkVisitorPresenceSessionRecord): PrismaSdkVisitorPresenceCreateInput {
  return { ...value, createdAt: new Date(value.createdAt), disconnectedAt: value.disconnectedAt ? new Date(value.disconnectedAt) : null,
    expiresAt: new Date(value.expiresAt), firstSeenAt: new Date(value.firstSeenAt), lastSeenAt: new Date(value.lastSeenAt),
    updatedAt: new Date(value.updatedAt) };
}

function fromPrismaSdkVisitorPresence(value: PrismaSdkVisitorPresenceRow): SdkVisitorPresenceSessionRecord {
  return normalizeSdkVisitorPresence({ ...value, createdAt: value.createdAt.toISOString(),
    disconnectedAt: value.disconnectedAt?.toISOString() ?? null, expiresAt: value.expiresAt.toISOString(),
    firstSeenAt: value.firstSeenAt.toISOString(), lastSeenAt: value.lastSeenAt.toISOString(), updatedAt: value.updatedAt.toISOString() });
}

function normalizeWebhookEndpointRecords(records: WebhookEndpointStoredRecord[] | undefined): WebhookEndpointStoredRecord[] {
  return (records ?? []).map((record) => ({
    channel: String(record.channel ?? "").trim() || "SDK",
    createdAt: record.createdAt,
    custom: Boolean(record.custom),
    deleted: Boolean(record.deleted),
    failureRate: String(record.failureRate ?? "0%"),
    id: String(record.id ?? "").trim(),
    lastDelivery: String(record.lastDelivery ?? "—"),
    name: String(record.name ?? "").trim(),
    retries: String(record.retries ?? "3 попытки / 30 сек"),
    signature: String(record.signature ?? "HMAC SHA-256"),
    status: String(record.status ?? "Активен"),
    updatedAt: record.updatedAt,
    url: String(record.url ?? "").trim()
  }));
}

function toWebhookEndpointRow(record: WebhookEndpointStoredRecord): PrismaWebhookEndpointRow {
  return {
    channel: record.channel,
    createdAt: new Date(record.createdAt),
    custom: record.custom,
    deleted: record.deleted,
    failureRate: record.failureRate,
    id: record.id,
    lastDelivery: record.lastDelivery,
    name: record.name,
    retries: record.retries,
    signature: record.signature,
    status: record.status,
    updatedAt: new Date(record.updatedAt),
    url: record.url
  };
}

function toWebhookEndpointRecord(row: PrismaWebhookEndpointRow): WebhookEndpointStoredRecord {
  return normalizeWebhookEndpointRecords([{
    channel: row.channel,
    createdAt: row.createdAt.toISOString(),
    custom: row.custom,
    deleted: row.deleted,
    failureRate: row.failureRate,
    id: row.id,
    lastDelivery: row.lastDelivery,
    name: row.name,
    retries: row.retries,
    signature: row.signature,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    url: row.url
  }])[0]!;
}

function normalizeTelegramConnections(connections: TelegramConnectionStoredRecord[] | undefined): TelegramConnectionStoredRecord[] {
  return (connections ?? []).map((connection) => ({
    channelConnectionId: String(connection.channelConnectionId ?? "").trim(),
    botId: connection.botId ?? null,
    botToken: String(connection.botToken ?? ""),
    botUsername: connection.botUsername ?? null,
    pollingOffset: Number.isInteger(connection.pollingOffset) && Number(connection.pollingOffset) >= 0 ? Number(connection.pollingOffset) : 0,
    createdAt: connection.createdAt,
    status: connection.status === "disabled" ? "disabled" : "active",
    tenantId: connection.tenantId,
    tokenPreview: connection.tokenPreview,
    updatedAt: connection.updatedAt,
    webhookSecret: connection.webhookSecret
  }));
}

function normalizeChannelConnections(connections: ChannelConnectionStoredRecord[] | undefined): ChannelConnectionStoredRecord[] {
  return (connections ?? []).map(normalizeChannelConnection);
}

function normalizeProviderConnectionCredentials(credentials: ProviderConnectionCredentialRecord[] | undefined): ProviderConnectionCredentialRecord[] {
  return (credentials ?? []).map(normalizeProviderConnectionCredential);
}

function normalizeProviderConnectionCredential(credential: ProviderConnectionCredentialRecord): ProviderConnectionCredentialRecord {
  const now = new Date().toISOString();
  const nullable = (value: unknown): string | null => {
    const normalized = String(value ?? "").trim();
    return normalized || null;
  };
  return {
    accessTokenEncrypted: String(credential.accessTokenEncrypted ?? "").trim(),
    apiVersion: nullable(credential.apiVersion),
    channelConnectionId: String(credential.channelConnectionId ?? "").trim(),
    confirmationCodeEncrypted: nullable(credential.confirmationCodeEncrypted),
    createdAt: credential.createdAt ?? now,
    externalAccountId: String(credential.externalAccountId ?? "").trim(),
    keyVersion: String(credential.keyVersion ?? "").trim(),
    lastError: nullable(credential.lastError),
    lastWebhookAt: credential.lastWebhookAt ?? null,
    provider: String(credential.provider ?? "").trim().toLowerCase(),
    status: normalizeChannelStatus(credential.status),
    tenantId: String(credential.tenantId ?? "").trim(),
    updatedAt: credential.updatedAt ?? credential.createdAt ?? now,
    webhookSecretEncrypted: String(credential.webhookSecretEncrypted ?? "").trim()
  };
}

function normalizeChannelConnection(connection: ChannelConnectionStoredRecord): ChannelConnectionStoredRecord {
  const now = new Date().toISOString();
  return {
    chatLimit: normalizePositiveInteger(connection.chatLimit, 8),
    credentialsMasked: Boolean(connection.credentialsMasked),
    createdAt: connection.createdAt ?? connection.lastSyncAt ?? now,
    environment: normalizeChannelEnvironment(connection.environment),
    health: normalizePositiveInteger(connection.health, 100),
    id: String(connection.id ?? "").trim(),
    lastSyncAt: connection.lastSyncAt ?? connection.updatedAt ?? now,
    name: String(connection.name ?? "").trim(),
    rawExternalId: String(connection.rawExternalId ?? "").trim(),
    routingQueueId: String(connection.routingQueueId ?? "").trim(),
    status: normalizeChannelStatus(connection.status),
    tenantId: String(connection.tenantId ?? "").trim(),
    traffic: String(connection.traffic ?? "0 events"),
    type: String(connection.type ?? "").trim().toLowerCase(),
    updatedAt: connection.updatedAt ?? connection.lastSyncAt ?? now,
    webhookUrl: String(connection.webhookUrl ?? "").trim()
  };
}

function normalizeChannelConnectionEvents(events: ChannelConnectionEventRecord[] | undefined): ChannelConnectionEventRecord[] {
  return (events ?? []).map(normalizeChannelConnectionEvent);
}

function normalizeChannelConnectionEvent(event: ChannelConnectionEventRecord): ChannelConnectionEventRecord {
  return {
    action: String(event.action ?? "").trim(),
    at: event.at ?? new Date().toISOString(),
    connectionId: String(event.connectionId ?? "").trim(),
    id: String(event.id ?? "").trim(),
    message: String(event.message ?? "").trim(),
    severity: normalizeEventSeverity(event.severity),
    tenantId: String(event.tenantId ?? "").trim()
  };
}

function normalizeChannelConnectionAuditEvents(events: ChannelConnectionAuditEventRecord[] | undefined): ChannelConnectionAuditEventRecord[] {
  return (events ?? []).map(normalizeChannelConnectionAuditEvent);
}

function normalizeChannelConnectionAuditEvent(event: ChannelConnectionAuditEventRecord): ChannelConnectionAuditEventRecord {
  return {
    action: String(event.action ?? "").trim(),
    at: event.at ?? new Date().toISOString(),
    connectionId: String(event.connectionId ?? "").trim(),
    id: String(event.id ?? "").trim(),
    immutable: true,
    reason: String(event.reason ?? "").trim(),
    result: String(event.result ?? "ok").trim() || "ok",
    tenantId: String(event.tenantId ?? "").trim(),
    type: String(event.type ?? "").trim().toLowerCase()
  };
}

function normalizeChannelEnvironment(environment: string | undefined): string {
  const value = String(environment ?? "").trim().toLowerCase();
  return ["production", "sandbox", "stage"].includes(value) ? value : "production";
}

function normalizeChannelStatus(status: string | undefined): string {
  const value = String(status ?? "").trim().toLowerCase();
  return ["active", "disabled", "error", "paused"].includes(value) ? value : "active";
}

function normalizeEventSeverity(severity: string | undefined): string {
  const value = String(severity ?? "").trim().toLowerCase();
  return ["error", "info", "warn"].includes(value) ? value : "info";
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function normalizeWebhookDeliveryJournal(entries: WebhookDeliveryJournalEntry[] | undefined): WebhookDeliveryJournalEntry[] {
  return (entries ?? []).map(normalizeWebhookDeliveryJournalEntry);
}

function normalizeWebhookDeliveryJournalEntry(entry: WebhookDeliveryJournalEntry): WebhookDeliveryJournalEntry {
  return {
    attempts: entry.attempts,
    createdAt: entry.createdAt,
    ...(entry.deadLetteredAt ? { deadLetteredAt: entry.deadLetteredAt } : {}),
    deliveryId: entry.deliveryId,
    endpointId: entry.endpointId,
    eventType: entry.eventType,
    idempotencyKey: entry.idempotencyKey,
    ...(entry.lastAttemptAt ? { lastAttemptAt: entry.lastAttemptAt } : {}),
    ...(entry.lastError ? { lastError: normalizeWebhookDeliveryJournalError(entry.lastError) } : {}),
    ...(entry.lockedAt ? { lockedAt: entry.lockedAt } : {}),
    ...(entry.nextAttemptAt ? { nextAttemptAt: entry.nextAttemptAt } : {}),
    payloadRef: entry.payloadRef,
    queue: "webhook-delivery",
    status: entry.status,
    targetUrl: entry.targetUrl,
    tenantId: entry.tenantId,
    traceId: entry.traceId
  };
}

function isClaimableWebhookDeliveryJournalEntry(
  entry: WebhookDeliveryJournalEntry,
  nowMs: number,
  staleBeforeMs: number
): boolean {
  if (entry.status === "queued") {
    return true;
  }

  if (entry.status === "retry_scheduled") {
    return !entry.nextAttemptAt || Date.parse(entry.nextAttemptAt) <= nowMs;
  }

  if (entry.status === "publishing" && entry.lockedAt) {
    return Date.parse(entry.lockedAt) <= staleBeforeMs;
  }

  return false;
}

function normalizeWebhookDeliveryJournalError(error: WebhookDeliveryJournalError): WebhookDeliveryJournalError {
  return {
    code: error.code,
    message: redactWebhookDeliveryErrorMessage(error.message),
    ...(typeof error.statusCode === "number" ? { statusCode: error.statusCode } : {})
  };
}

function redactWebhookDeliveryErrorMessage(message: string): string {
  return redactSensitiveText(message)
    .replace(/\bAuthorization:\s*Bearer\s+\[REDACTED:api_key\]/gi, "[REDACTED:api_key]")
    .replace(/"authorization"\s*:\s*"Bearer \[REDACTED:api_key\]"/gi, "[REDACTED:api_key]")
    .replace(/"providerToken"\s*:\s*"\[REDACTED:provider_token\]"/gi, "[REDACTED:provider_token]")
    .replace(/"x-provider-signature"\s*:\s*"\[REDACTED:webhook_signature\]"/gi, "[REDACTED:webhook_signature]")
    .replace(/"webhookSecret"\s*:\s*"[^"]*"/gi, "[REDACTED:secret]")
    .replace(/\bsignatureSecret=(?!\[)[^"',.}\]\s]+/gi, "[REDACTED:secret]")
    .replace(/\bwebhookSecret=(?!\[)[^"',.}\]\s]+/gi, "[REDACTED:secret]")
    .replace(/\[REDACTED:([a-z_]+)\]\]/g, "[REDACTED:$1]");
}

function normalizePublicApiKeys(keys: PublicApiKeyStoredRecord[] | undefined): PublicApiKeyStoredRecord[] {
  return (keys ?? []).map((key) => ({
    ...(key.channelConnectionId ? { channelConnectionId: key.channelConnectionId } : {}),
    createdAt: key.createdAt,
    environment: key.environment,
    keyId: key.keyId,
    keyPreview: key.keyPreview,
    name: key.name,
    owner: key.owner,
    scopes: [...key.scopes],
    secretHash: key.secretHash,
    status: key.status,
    tenantId: key.tenantId
  }));
}

function normalizePublicApiKeyRevealStates(states: PublicApiKeyRevealStateRecord[] | undefined): PublicApiKeyRevealStateRecord[] {
  return (states ?? []).map((state) => ({
    consumedAt: state.consumedAt ?? null,
    createdAt: state.createdAt,
    keyId: state.keyId,
    keyPreview: state.keyPreview,
    status: state.status === "consumed" ? "consumed" : "available"
  }));
}

function normalizePublicDemoRequests(requests: PublicDemoRequestRecord[] | undefined): PublicDemoRequestRecord[] {
  return (requests ?? []).map(normalizePublicDemoRequest);
}

function normalizePublicDemoRequest(request: PublicDemoRequestRecord): PublicDemoRequestRecord {
  const now = new Date().toISOString();

  return {
    company: normalizeLimitedString(request.company, 160),
    consent: true,
    createdAt: request.createdAt ?? now,
    email: normalizeLimitedString(request.email, 254).toLowerCase(),
    id: normalizeLimitedString(request.id, 96),
    idempotencyKey: nullableLimitedString(request.idempotencyKey, 160),
    ipHash: nullableLimitedString(request.ipHash, 96),
    message: normalizeLimitedString(redactSensitiveText(request.message ?? ""), 1200),
    name: normalizeLimitedString(request.name, 120),
    planInterest: nullableLimitedString(request.planInterest, 80),
    requestFingerprint: normalizeLimitedString(request.requestFingerprint, 96),
    source: normalizeLimitedString(request.source, 80) || "landing",
    status: "queued",
    updatedAt: request.updatedAt ?? request.createdAt ?? now,
    userAgentHash: nullableLimitedString(request.userAgentHash, 96)
  };
}

function normalizePublicDemoRequestAuditEvents(events: PublicDemoRequestAuditEvent[] | undefined): PublicDemoRequestAuditEvent[] {
  return (events ?? []).map(normalizePublicDemoRequestAuditEvent);
}

function normalizePublicDemoRequestAuditEvent(event: PublicDemoRequestAuditEvent): PublicDemoRequestAuditEvent {
  const action = [
    "public_demo_request.created",
    "public_demo_request.duplicate",
    "public_demo_request.rate_limited"
  ].includes(event.action) ? event.action : "public_demo_request.created";
  const result = ["ok", "duplicate", "rate_limited"].includes(event.result) ? event.result : "ok";

  return {
    action,
    at: event.at ?? new Date().toISOString(),
    id: normalizeLimitedString(event.id, 96),
    immutable: true,
    leadId: nullableLimitedString(event.leadId, 96),
    requestFingerprint: normalizeLimitedString(event.requestFingerprint, 96),
    result,
    source: normalizeLimitedString(event.source, 80) || "landing"
  };
}

function normalizePublicDemoRequestNotificationDescriptors(
  descriptors: PublicDemoRequestNotificationDescriptor[] | undefined
): PublicDemoRequestNotificationDescriptor[] {
  return (descriptors ?? []).map(normalizePublicDemoRequestNotificationDescriptor);
}

function normalizePublicDemoRequestNotificationDescriptor(
  descriptor: PublicDemoRequestNotificationDescriptor
): PublicDemoRequestNotificationDescriptor {
  return {
    createdAt: descriptor.createdAt ?? new Date().toISOString(),
    id: normalizeLimitedString(descriptor.id, 96),
    leadId: normalizeLimitedString(descriptor.leadId, 96),
    payload: {
      company: normalizeLimitedString(descriptor.payload?.company, 160),
      ...(descriptor.payload?.delivery
        ? { delivery: normalizePublicDemoRequestNotificationDeliveryState(descriptor.payload.delivery) }
        : {}),
      email: normalizeLimitedString(descriptor.payload?.email, 254).toLowerCase(),
      messagePreview: normalizeLimitedString(redactSensitiveText(descriptor.payload?.messagePreview ?? ""), 240),
      name: normalizeLimitedString(descriptor.payload?.name, 120),
      planInterest: nullableLimitedString(descriptor.payload?.planInterest, 80),
      source: normalizeLimitedString(descriptor.payload?.source, 80) || "landing"
    },
    queue: "lead-notification",
    status: normalizePublicDemoRequestNotificationStatus(descriptor.status),
    type: "public.demo_request.notification.requested"
  };
}

function normalizePublicDemoRequestNotificationStatus(value: unknown): PublicDemoRequestNotificationStatus {
  return value === "delivered" || value === "failed" || value === "queued" ? value : "queued";
}

function normalizePublicDemoRequestNotificationDeliveryState(
  delivery: PublicDemoRequestNotificationDeliveryState
): PublicDemoRequestNotificationDeliveryState {
  const attempts = Number.isInteger(delivery.attempts) && delivery.attempts > 0 ? delivery.attempts : 1;
  const normalized: PublicDemoRequestNotificationDeliveryState = { attempts };
  if (delivery.deliveredAt) {
    normalized.deliveredAt = normalizeLimitedString(delivery.deliveredAt, 40);
  }
  if (delivery.failedAt) {
    normalized.failedAt = normalizeLimitedString(delivery.failedAt, 40);
  }
  if (delivery.providerMessageId) {
    normalized.providerMessageId = normalizeLimitedString(delivery.providerMessageId, 160);
  }
  if (delivery.lastError) {
    normalized.lastError = {
      code: "public_demo_request_notification_delivery_failed",
      message: redactPublicDemoNotificationDeliveryMessage(delivery.lastError.message)
    };
  }
  return normalized;
}

function redactPublicDemoNotificationDeliveryMessage(value: unknown): string {
  return normalizeLimitedString(redactSensitiveText(String(value ?? ""))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED:email]")
    .replace(/\b[A-Za-z0-9._-]*(?:secret|token)[A-Za-z0-9._-]*\b/gi, "[REDACTED:secret]"), 300);
}

function latestPublicDemoRequestNotificationDescriptor(
  descriptors: PublicDemoRequestNotificationDescriptor[]
): PublicDemoRequestNotificationDescriptor | null {
  const [latest] = [...descriptors]
    .sort((left, right) => compareTimestampStrings(
      publicDemoRequestNotificationTimestamp(right),
      publicDemoRequestNotificationTimestamp(left)
    ));

  return latest ? clone(latest) : null;
}

function publicDemoRequestNotificationTimestamp(descriptor: PublicDemoRequestNotificationDescriptor): string {
  return descriptor.payload.delivery?.failedAt
    ?? descriptor.payload.delivery?.deliveredAt
    ?? descriptor.createdAt;
}

function compareTimestampStrings(leftTimestamp: string, rightTimestamp: string): number {
  const leftTime = Date.parse(leftTimestamp);
  const rightTime = Date.parse(rightTimestamp);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return leftTimestamp.localeCompare(rightTimestamp);
}

function normalizeLimitedString(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function nullableLimitedString(value: unknown, maxLength: number): string | null {
  const normalized = normalizeLimitedString(value, maxLength);
  return normalized || null;
}

function assertCompletePrismaIntegrationClient(client: PrismaIntegrationClient): void {
  if (!client.integrationApiKeyRotationJob?.findMany || !client.integrationApiKeyRotationJob.upsert) {
    throw new Error("prisma_integration_api_key_rotation_job_delegate_required");
  }

  if (!client.publicApiKey?.create || !client.publicApiKey.findMany || !client.publicApiKey.findUnique || !client.publicApiKey.upsert) {
    throw new Error("prisma_integration_public_api_key_delegate_required");
  }

  if (
    !client.publicApiKeyRevealState?.findMany
    || !client.publicApiKeyRevealState.findUnique
    || !client.publicApiKeyRevealState.update
    || !client.publicApiKeyRevealState.updateMany
    || !client.publicApiKeyRevealState.upsert
  ) {
    throw new Error("prisma_integration_public_api_key_reveal_state_delegate_required");
  }

  if (!client.publicApiKeyRotationAuditEvent?.create || !client.publicApiKeyRotationAuditEvent.findMany) {
    throw new Error("prisma_integration_public_api_key_rotation_audit_delegate_required");
  }

  if (!client.publicDemoRequest?.findFirst || !client.publicDemoRequest.findMany || !client.publicDemoRequest.upsert) {
    throw new Error("prisma_integration_public_demo_request_delegate_required");
  }

  if (!client.publicDemoRequestAuditEvent?.create || !client.publicDemoRequestAuditEvent.findMany) {
    throw new Error("prisma_integration_public_demo_request_audit_delegate_required");
  }

  if (
    !client.publicDemoRequestNotificationDescriptor?.count
    || !client.publicDemoRequestNotificationDescriptor.findMany
    || !client.publicDemoRequestNotificationDescriptor.upsert
  ) {
    throw new Error("prisma_integration_public_demo_request_notification_delegate_required");
  }

  if (
    !client.webhookDeliveryJournalEntry?.findMany
    || !client.webhookDeliveryJournalEntry.findUnique
    || !client.webhookDeliveryJournalEntry.update
    || !client.webhookDeliveryJournalEntry.upsert
  ) {
    throw new Error("prisma_integration_webhook_delivery_journal_delegate_required");
  }

  if (!client.webhookReplayJournalEntry?.findMany || !client.webhookReplayJournalEntry.findUnique || !client.webhookReplayJournalEntry.upsert) {
    throw new Error("prisma_integration_webhook_replay_journal_delegate_required");
  }

  if (!client.webhookReplayAuditEvent?.create || !client.webhookReplayAuditEvent.findMany) {
    throw new Error("prisma_integration_webhook_replay_audit_delegate_required");
  }

  if (!client.securitySession?.findMany || !client.securitySession.upsert) {
    throw new Error("prisma_integration_security_session_delegate_required");
  }

  if (!client.channelConnection?.findMany || !client.channelConnection.findUnique || !client.channelConnection.upsert) {
    throw new Error("prisma_integration_channel_connection_delegate_required");
  }

  if (!client.channelConnectionEvent?.create || !client.channelConnectionEvent.findMany) {
    throw new Error("prisma_integration_channel_connection_event_delegate_required");
  }

  if (!client.channelConnectionAuditEvent?.create || !client.channelConnectionAuditEvent.findMany) {
    throw new Error("prisma_integration_channel_connection_audit_delegate_required");
  }

  if (
    !client.providerConnectionCredential?.findMany
    || !client.providerConnectionCredential.findUnique
    || !client.providerConnectionCredential.upsert
  ) {
    throw new Error("prisma_integration_provider_connection_credential_delegate_required");
  }

  if (
    !client.telegramConnection?.findFirst
    || !client.telegramConnection.findMany
    || !client.telegramConnection.findUnique
    || !client.telegramConnection.upsert
  ) {
    throw new Error("prisma_integration_telegram_connection_delegate_required");
  }
}

function toPrismaPublicApiKeyCreateInput(key: PublicApiKeyStoredRecord): PrismaPublicApiKeyCreateInput {
  return {
    ...(key.channelConnectionId ? { channelConnectionId: key.channelConnectionId } : {}),
    createdAt: new Date(key.createdAt),
    environment: key.environment,
    keyId: key.keyId,
    keyPreview: key.keyPreview,
    name: key.name,
    owner: key.owner,
    scopes: [...key.scopes],
    secretHash: key.secretHash,
    status: key.status,
    tenantId: key.tenantId,
    updatedAt: new Date(key.createdAt)
  };
}

function toPrismaPublicApiKeyUpdateInput(key: PrismaPublicApiKeyCreateInput): PrismaPublicApiKeyUpdateInput {
  return {
    ...(key.channelConnectionId ? { channelConnectionId: key.channelConnectionId } : {}),
    environment: key.environment,
    keyPreview: key.keyPreview,
    name: key.name,
    owner: key.owner,
    scopes: [...key.scopes],
    secretHash: key.secretHash,
    status: key.status,
    tenantId: key.tenantId,
    updatedAt: key.updatedAt
  };
}

function toPrismaPublicApiKeyReferenceUpdateInput(_key: PrismaPublicApiKeyCreateInput): PrismaPublicApiKeyReferenceUpdateInput {
  return {};
}

function toPublicApiKeyStoredRecord(row: PrismaPublicApiKeyRow): PublicApiKeyStoredRecord {
  return {
    ...(row.channelConnectionId ? { channelConnectionId: row.channelConnectionId } : {}),
    createdAt: row.createdAt.toISOString(),
    environment: row.environment,
    keyId: row.keyId,
    keyPreview: row.keyPreview,
    name: row.name,
    owner: row.owner,
    scopes: [...row.scopes],
    secretHash: row.secretHash,
    status: row.status,
    tenantId: row.tenantId
  };
}

function toPublicApiKeyRecord(row: PrismaPublicApiKeyRow): PublicApiKeyRecord {
  return {
    ...(row.channelConnectionId ? { channelConnectionId: row.channelConnectionId } : {}),
    environment: row.environment,
    keyId: row.keyId,
    scopes: [...row.scopes],
    secretHash: row.secretHash,
    status: row.status,
    tenantId: row.tenantId
  };
}

function toPrismaPublicApiKeyRevealStateCreateInput(state: PublicApiKeyRevealStateRecord): PrismaPublicApiKeyRevealStateCreateInput {
  return {
    consumedAt: state.consumedAt ? new Date(state.consumedAt) : null,
    createdAt: new Date(state.createdAt),
    keyId: state.keyId,
    keyPreview: state.keyPreview,
    status: state.status
  };
}

function toPrismaPublicApiKeyRevealStateUpdateInput(
  _state: PrismaPublicApiKeyRevealStateCreateInput
): PrismaPublicApiKeyRevealStateUpdateInput {
  return {};
}

function toPrismaApiKeyRotationAuditEventCreateInput(
  event: ApiKeyRotationAuditEvent
): PrismaApiKeyRotationAuditEventCreateInput {
  return {
    action: event.action,
    at: new Date(event.at),
    auditId: event.auditId,
    environment: event.environment,
    immutable: true,
    keyId: event.keyId,
    keyPreview: event.keyPreview,
    rotationId: event.rotationId,
    status: event.status
  };
}

function toApiKeyRotationAuditEvent(row: PrismaApiKeyRotationAuditEventRow): ApiKeyRotationAuditEvent {
  return {
    action: row.action,
    at: row.at.toISOString(),
    auditId: row.auditId,
    environment: row.environment,
    immutable: true,
    keyId: row.keyId,
    keyPreview: row.keyPreview,
    rotationId: row.rotationId,
    status: row.status
  };
}

function toPublicApiKeyRevealState(row: PrismaPublicApiKeyRevealStateRow): PublicApiKeyRevealStateRecord {
  return {
    consumedAt: row.consumedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    keyId: row.keyId,
    keyPreview: row.keyPreview,
    status: row.status
  };
}

function toPrismaApiKeyRotationJobCreateInput(job: ApiKeyRotationJob): PrismaApiKeyRotationJobCreateInput {
  return {
    auditId: job.auditId,
    environment: job.environment,
    keyId: job.keyId,
    rawKeyShownOnce: false,
    requires2fa: true,
    rotationId: job.rotationId,
    status: job.status
  };
}

function toPrismaApiKeyRotationJobUpdateInput(job: ApiKeyRotationJob): PrismaApiKeyRotationJobUpdateInput {
  return {
    auditId: job.auditId,
    environment: job.environment,
    keyId: job.keyId,
    rawKeyShownOnce: false,
    requires2fa: true,
    status: job.status,
    updatedAt: new Date()
  };
}

function toApiKeyRotationJob(row: PrismaApiKeyRotationJobRow): ApiKeyRotationJob {
  return {
    auditId: row.auditId,
    environment: row.environment,
    keyId: row.keyId,
    rawKeyShownOnce: false,
    requires2fa: true,
    rotationId: row.rotationId,
    status: row.status
  };
}

function toPrismaPublicDemoRequestCreateInput(request: PublicDemoRequestRecord): PrismaPublicDemoRequestCreateInput {
  return {
    company: request.company,
    consent: true,
    createdAt: new Date(request.createdAt),
    email: request.email,
    id: request.id,
    idempotencyKey: request.idempotencyKey,
    ipHash: request.ipHash,
    message: request.message,
    name: request.name,
    planInterest: request.planInterest,
    requestFingerprint: request.requestFingerprint,
    source: request.source,
    status: "queued",
    updatedAt: new Date(request.updatedAt),
    userAgentHash: request.userAgentHash
  };
}

function toPrismaPublicDemoRequestUpdateInput(request: PublicDemoRequestRecord): PrismaPublicDemoRequestUpdateInput {
  const create = toPrismaPublicDemoRequestCreateInput(request);
  return {
    company: create.company,
    consent: true,
    email: create.email,
    idempotencyKey: create.idempotencyKey,
    ipHash: create.ipHash,
    message: create.message,
    name: create.name,
    planInterest: create.planInterest,
    requestFingerprint: create.requestFingerprint,
    source: create.source,
    status: "queued",
    updatedAt: create.updatedAt,
    userAgentHash: create.userAgentHash
  };
}

function toPublicDemoRequest(row: PrismaPublicDemoRequestRow): PublicDemoRequestRecord {
  return normalizePublicDemoRequest({
    company: row.company,
    consent: true,
    createdAt: row.createdAt.toISOString(),
    email: row.email,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    ipHash: row.ipHash,
    message: row.message,
    name: row.name,
    planInterest: row.planInterest,
    requestFingerprint: row.requestFingerprint,
    source: row.source,
    status: "queued",
    updatedAt: row.updatedAt.toISOString(),
    userAgentHash: row.userAgentHash
  });
}

function toPrismaPublicDemoRequestAuditEventCreateInput(
  event: PublicDemoRequestAuditEvent
): PrismaPublicDemoRequestAuditEventCreateInput {
  return {
    action: event.action,
    at: new Date(event.at),
    id: event.id,
    immutable: true,
    leadId: event.leadId,
    requestFingerprint: event.requestFingerprint,
    result: event.result,
    source: event.source
  };
}

function toPublicDemoRequestAuditEvent(row: PrismaPublicDemoRequestAuditEventRow): PublicDemoRequestAuditEvent {
  return {
    action: row.action,
    at: row.at.toISOString(),
    id: row.id,
    immutable: true,
    leadId: row.leadId,
    requestFingerprint: row.requestFingerprint,
    result: row.result,
    source: row.source
  };
}

function toPrismaPublicDemoRequestNotificationDescriptorCreateInput(
  descriptor: PublicDemoRequestNotificationDescriptor
): PrismaPublicDemoRequestNotificationDescriptorCreateInput {
  return {
    createdAt: new Date(descriptor.createdAt),
    id: descriptor.id,
    leadId: descriptor.leadId,
    payload: clone(descriptor.payload),
    queue: "lead-notification",
    status: descriptor.status,
    type: "public.demo_request.notification.requested",
    updatedAt: new Date(descriptor.createdAt)
  };
}

function toPrismaPublicDemoRequestNotificationDescriptorUpdateInput(
  descriptor: PublicDemoRequestNotificationDescriptor
): PrismaPublicDemoRequestNotificationDescriptorUpdateInput {
  return {
    leadId: descriptor.leadId,
    payload: clone(descriptor.payload),
    queue: "lead-notification",
    status: descriptor.status,
    type: "public.demo_request.notification.requested",
    updatedAt: new Date()
  };
}

function toPublicDemoRequestNotificationDescriptor(
  row: PrismaPublicDemoRequestNotificationDescriptorRow
): PublicDemoRequestNotificationDescriptor {
  return normalizePublicDemoRequestNotificationDescriptor({
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    leadId: row.leadId,
    payload: clone(row.payload),
    queue: "lead-notification",
    status: row.status,
    type: "public.demo_request.notification.requested"
  });
}

function toPrismaWebhookReplayJournalCreateInput(
  entry: WebhookReplayJournalEntry
): PrismaWebhookReplayJournalCreateInput {
  return {
    auditId: entry.auditId,
    deliveryId: entry.deliveryId,
    idempotencyKey: entry.idempotencyKey,
    originalTraceId: entry.originalTraceId,
    replayId: entry.replayId,
    signatureVerified: entry.signatureVerified,
    status: entry.status,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

function toWebhookReplayJournalEntry(row: PrismaWebhookReplayJournalRow): WebhookReplayJournalEntry {
  return {
    auditId: row.auditId,
    deliveryId: row.deliveryId,
    idempotencyKey: row.idempotencyKey,
    originalTraceId: row.originalTraceId,
    replayId: row.replayId,
    signatureVerified: row.signatureVerified,
    status: row.status
  };
}

function toPrismaWebhookReplayAuditEventCreateInput(event: WebhookReplayAuditEvent): PrismaWebhookReplayAuditEventCreateInput {
  return {
    action: event.action,
    at: new Date(event.at),
    attempts: event.attempts,
    auditId: event.auditId,
    deliveryId: event.deliveryId,
    deliveryStatus: event.deliveryStatus,
    id: event.id,
    idempotencyKey: event.idempotencyKey,
    immutable: true,
    originalTraceId: event.originalTraceId,
    replayId: event.replayId,
    transition: event.transition
  };
}

function toWebhookReplayAuditEvent(row: PrismaWebhookReplayAuditEventRow): WebhookReplayAuditEvent {
  return {
    action: row.action,
    at: row.at.toISOString(),
    attempts: row.attempts,
    auditId: row.auditId,
    deliveryId: row.deliveryId,
    deliveryStatus: row.deliveryStatus,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    immutable: true,
    originalTraceId: row.originalTraceId,
    replayId: row.replayId,
    transition: row.transition
  };
}

function toPrismaWebhookDeliveryJournalCreateInput(
  entry: WebhookDeliveryJournalEntry
): PrismaWebhookDeliveryJournalCreateInput {
  return {
    attempts: entry.attempts,
    createdAt: new Date(entry.createdAt),
    deadLetteredAt: entry.deadLetteredAt ? new Date(entry.deadLetteredAt) : null,
    deliveryId: entry.deliveryId,
    endpointId: entry.endpointId,
    eventType: entry.eventType,
    idempotencyKey: entry.idempotencyKey,
    lastAttemptAt: entry.lastAttemptAt ? new Date(entry.lastAttemptAt) : null,
    lastError: entry.lastError ? normalizeWebhookDeliveryJournalError(entry.lastError) : null,
    lockedAt: entry.lockedAt ? new Date(entry.lockedAt) : null,
    nextAttemptAt: entry.nextAttemptAt ? new Date(entry.nextAttemptAt) : null,
    payloadRef: entry.payloadRef,
    queue: "webhook-delivery",
    status: entry.status,
    targetUrl: entry.targetUrl,
    tenantId: entry.tenantId,
    traceId: entry.traceId,
    updatedAt: new Date(entry.createdAt)
  };
}

function toWebhookDeliveryJournalEntry(row: PrismaWebhookDeliveryJournalRow): WebhookDeliveryJournalEntry {
  return normalizeWebhookDeliveryJournalEntry({
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    deadLetteredAt: row.deadLetteredAt?.toISOString(),
    deliveryId: row.deliveryId,
    endpointId: row.endpointId,
    eventType: row.eventType,
    idempotencyKey: row.idempotencyKey,
    lastAttemptAt: row.lastAttemptAt?.toISOString(),
    lastError: row.lastError ? normalizeWebhookDeliveryJournalError(row.lastError) : undefined,
    lockedAt: row.lockedAt?.toISOString(),
    nextAttemptAt: row.nextAttemptAt?.toISOString(),
    payloadRef: row.payloadRef,
    queue: "webhook-delivery",
    status: row.status,
    targetUrl: row.targetUrl,
    tenantId: row.tenantId,
    traceId: row.traceId
  });
}

function toPrismaSecuritySessionCreateInput(session: SecuritySession): PrismaSecuritySessionCreateInput {
  return {
    device: session.device,
    id: session.id,
    ip: session.ip,
    lastSeen: session.lastSeen,
    role: session.role,
    status: session.status,
    user: session.user,
    updatedAt: new Date()
  };
}

function toPrismaSecuritySessionUpdateInput(session: SecuritySession): PrismaSecuritySessionUpdateInput {
  return {
    device: session.device,
    ip: session.ip,
    lastSeen: session.lastSeen,
    role: session.role,
    status: session.status,
    user: session.user,
    updatedAt: new Date()
  };
}

function toSecuritySession(row: PrismaSecuritySessionRow): SecuritySession {
  return {
    device: row.device,
    id: row.id,
    ip: row.ip,
    lastSeen: row.lastSeen,
    role: row.role,
    status: row.status,
    user: row.user
  };
}

function toPrismaChannelConnectionCreateInput(connection: ChannelConnectionStoredRecord): PrismaChannelConnectionCreateInput {
  return {
    chatLimit: connection.chatLimit,
    createdAt: new Date(connection.createdAt),
    credentialsMasked: connection.credentialsMasked,
    environment: connection.environment,
    health: connection.health,
    id: connection.id,
    lastSyncAt: new Date(connection.lastSyncAt),
    name: connection.name,
    rawExternalId: connection.rawExternalId,
    routingQueueId: connection.routingQueueId,
    status: connection.status,
    tenantId: connection.tenantId,
    traffic: connection.traffic,
    type: connection.type,
    updatedAt: new Date(connection.updatedAt),
    webhookUrl: connection.webhookUrl
  };
}

function toPrismaProviderConnectionCredentialCreateInput(credential: ProviderConnectionCredentialRecord): PrismaProviderConnectionCredentialCreateInput {
  return {
    accessTokenEncrypted: credential.accessTokenEncrypted,
    apiVersion: credential.apiVersion,
    channelConnectionId: credential.channelConnectionId,
    confirmationCodeEncrypted: credential.confirmationCodeEncrypted,
    createdAt: new Date(credential.createdAt),
    externalAccountId: credential.externalAccountId,
    keyVersion: credential.keyVersion,
    lastError: credential.lastError,
    lastWebhookAt: credential.lastWebhookAt ? new Date(credential.lastWebhookAt) : null,
    provider: credential.provider,
    status: credential.status,
    tenantId: credential.tenantId,
    updatedAt: new Date(credential.updatedAt),
    webhookSecretEncrypted: credential.webhookSecretEncrypted
  };
}

function toPrismaProviderConnectionCredentialUpdateInput(credential: ProviderConnectionCredentialRecord): PrismaProviderConnectionCredentialUpdateInput {
  const { channelConnectionId: _channelConnectionId, createdAt: _createdAt, ...update } = toPrismaProviderConnectionCredentialCreateInput(credential);
  return update;
}

function toProviderConnectionCredential(row: PrismaProviderConnectionCredentialRow): ProviderConnectionCredentialRecord {
  return normalizeProviderConnectionCredential({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastWebhookAt: row.lastWebhookAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  });
}

function toPrismaChannelConnectionUpdateInput(connection: ChannelConnectionStoredRecord): PrismaChannelConnectionUpdateInput {
  const create = toPrismaChannelConnectionCreateInput(connection);
  return {
    chatLimit: create.chatLimit,
    credentialsMasked: create.credentialsMasked,
    environment: create.environment,
    health: create.health,
    lastSyncAt: create.lastSyncAt,
    name: create.name,
    rawExternalId: create.rawExternalId,
    routingQueueId: create.routingQueueId,
    status: create.status,
    tenantId: create.tenantId,
    traffic: create.traffic,
    type: create.type,
    updatedAt: create.updatedAt,
    webhookUrl: create.webhookUrl
  };
}

function toChannelConnection(row: PrismaChannelConnectionRow): ChannelConnectionStoredRecord {
  return normalizeChannelConnection({
    chatLimit: row.chatLimit,
    createdAt: row.createdAt.toISOString(),
    credentialsMasked: row.credentialsMasked,
    environment: row.environment,
    health: row.health,
    id: row.id,
    lastSyncAt: row.lastSyncAt.toISOString(),
    name: row.name,
    rawExternalId: row.rawExternalId,
    routingQueueId: row.routingQueueId,
    status: row.status,
    tenantId: row.tenantId,
    traffic: row.traffic,
    type: row.type,
    updatedAt: row.updatedAt.toISOString(),
    webhookUrl: row.webhookUrl
  });
}

function toPrismaChannelConnectionEventCreateInput(event: ChannelConnectionEventRecord): PrismaChannelConnectionEventCreateInput {
  return {
    action: event.action,
    at: new Date(event.at),
    connectionId: event.connectionId,
    id: event.id,
    message: event.message,
    severity: event.severity,
    tenantId: event.tenantId
  };
}

function toChannelConnectionEvent(row: PrismaChannelConnectionEventRow): ChannelConnectionEventRecord {
  return normalizeChannelConnectionEvent({
    action: row.action,
    at: row.at.toISOString(),
    connectionId: row.connectionId,
    id: row.id,
    message: row.message,
    severity: row.severity,
    tenantId: row.tenantId
  });
}

function toPrismaChannelConnectionAuditEventCreateInput(
  event: ChannelConnectionAuditEventRecord
): PrismaChannelConnectionAuditEventCreateInput {
  return {
    action: event.action,
    at: new Date(event.at),
    connectionId: event.connectionId,
    id: event.id,
    immutable: true,
    reason: event.reason,
    result: event.result,
    tenantId: event.tenantId,
    type: event.type
  };
}

function toChannelConnectionAuditEvent(row: PrismaChannelConnectionAuditEventRow): ChannelConnectionAuditEventRecord {
  return normalizeChannelConnectionAuditEvent({
    action: row.action,
    at: row.at.toISOString(),
    connectionId: row.connectionId,
    id: row.id,
    immutable: true,
    reason: row.reason,
    result: row.result,
    tenantId: row.tenantId,
    type: row.type
  });
}

function toPrismaTelegramConnectionCreateInput(connection: TelegramConnectionStoredRecord): PrismaTelegramConnectionCreateInput {
  return {
    channelConnectionId: connection.channelConnectionId,
    botId: connection.botId,
    botToken: connection.botToken,
    botUsername: connection.botUsername,
    pollingOffset: connection.pollingOffset ?? 0,
    createdAt: new Date(connection.createdAt),
    status: connection.status,
    tenantId: connection.tenantId,
    tokenPreview: connection.tokenPreview,
    updatedAt: new Date(connection.updatedAt),
    webhookSecret: connection.webhookSecret
  };
}

function toPrismaTelegramConnectionUpdateInput(connection: TelegramConnectionStoredRecord): PrismaTelegramConnectionUpdateInput {
  return {
    botId: connection.botId,
    botToken: connection.botToken,
    botUsername: connection.botUsername,
    pollingOffset: connection.pollingOffset ?? 0,
    status: connection.status,
    tokenPreview: connection.tokenPreview,
    updatedAt: new Date(connection.updatedAt),
    webhookSecret: connection.webhookSecret
  };
}

function toTelegramConnection(row: PrismaTelegramConnectionRow): TelegramConnectionStoredRecord {
  return normalizeTelegramConnections([{
    channelConnectionId: row.channelConnectionId,
    botId: row.botId,
    botToken: row.botToken,
    botUsername: row.botUsername,
    pollingOffset: row.pollingOffset,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    tenantId: row.tenantId,
    tokenPreview: row.tokenPreview,
    updatedAt: row.updatedAt.toISOString(),
    webhookSecret: row.webhookSecret
  }])[0];
}

function maskPublicApiKeySecret(rawSecret: string): string {
  const trimmed = rawSecret.trim();
  const prefix = trimmed.startsWith("sk_test_") ? "sk_test" : trimmed.startsWith("sk_live_") ? "sk_live" : "key";
  const suffix = trimmed.length > 4 ? trimmed.slice(-4) : "****";

  return `${prefix}_****_${suffix}`;
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
