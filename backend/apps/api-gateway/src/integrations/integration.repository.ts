import { randomUUID } from "node:crypto";
import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import { redactSensitiveText } from "@support-communication/redaction";
import type { SecuritySession } from "./integration.fixtures.js";
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
  action: "public_api_key.rotation_queued";
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

export interface SavePublicApiKeyInput {
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

export interface IntegrationState {
  apiKeyRotationAuditEvents: ApiKeyRotationAuditEvent[];
  apiKeyRotationJobs: ApiKeyRotationJob[];
  publicApiKeys: PublicApiKeyStoredRecord[];
  publicApiKeyRevealStates: PublicApiKeyRevealStateRecord[];
  securitySessions: SecuritySession[];
  telegramConnections: TelegramConnectionStoredRecord[];
  webhookDeliveryJournal: WebhookDeliveryJournalEntry[];
  webhookReplayAuditEvents: WebhookReplayAuditEvent[];
  webhookReplayJournal: WebhookReplayJournalEntry[];
}

export interface TelegramConnectionStoredRecord {
  botId: string | null;
  botToken: string;
  botUsername: string | null;
  createdAt: string;
  status: "active" | "disabled";
  tenantId: string;
  tokenPreview: string;
  updatedAt: string;
  webhookSecret: string;
}

interface IntegrationRepositoryOptions {
  filePath: string;
}

export interface PrismaIntegrationRepositoryOptions {
  client: PrismaIntegrationClient;
}

type MaybePromise<T> = T | Promise<T>;

export interface PrismaIntegrationClient {
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
  };
}

interface PrismaPublicApiKeyWhereInput {
  status?: PublicApiKeyRecord["status"];
}

interface PrismaPublicApiKeyCreateInput {
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

let defaultRepository: IntegrationRepository | null = null;

export class IntegrationRepository {
  private constructor(
    private readonly store: DurableStore<IntegrationState>,
    private readonly publicApiRevealSecrets = new Map<string, string>(),
    private readonly prismaClient?: PrismaIntegrationClient
  ) {}

  static default(): IntegrationRepository {
    return defaultRepository ?? IntegrationRepository.inMemory();
  }

  static useDefault(repository: IntegrationRepository): void {
    defaultRepository = repository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: IntegrationState = seedIntegrationState()): IntegrationRepository {
    return new IntegrationRepository(new InMemoryStore(seed));
  }

  static open({ filePath }: IntegrationRepositoryOptions): IntegrationRepository {
    return new IntegrationRepository(new JsonFileStore({ filePath, seed: seedIntegrationState() }));
  }

  static prisma({ client }: PrismaIntegrationRepositoryOptions): IntegrationRepository {
    assertCompletePrismaIntegrationClient(client);

    return new IntegrationRepository(new InMemoryStore(seedIntegrationState()), new Map(), client);
  }

  readState(): IntegrationState {
    return normalizeState(this.store.read());
  }

  saveApiKeyRotationJob(job: ApiKeyRotationJob): ApiKeyRotationJob {
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
    return clone(this.readState().webhookReplayJournal.find((item) => item.idempotencyKey === idempotencyKey));
  }

  saveWebhookReplay(entry: WebhookReplayJournalEntry): WebhookReplayJournalEntry {
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

  saveWebhookReplayAuditEvent(event: WebhookReplayAuditEvent): WebhookReplayAuditEvent {
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

  findWebhookDeliveryJournalEntry(deliveryId: string): WebhookDeliveryJournalEntry | undefined {
    return clone(this.readState().webhookDeliveryJournal.find((item) => item.deliveryId === deliveryId));
  }

  listWebhookDeliveryJournal(filters: WebhookDeliveryJournalFilters = {}): WebhookDeliveryJournalEntry[] {
    const status = String(filters.status ?? "").trim();
    const rows = this.readState().webhookDeliveryJournal;

    return clone(status ? rows.filter((item) => item.status === status) : rows);
  }

  saveWebhookDeliveryJournalEntry(entry: WebhookDeliveryJournalEntry): WebhookDeliveryJournalEntry {
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

  recordWebhookDeliveryRetryState(input: RecordWebhookDeliveryRetryStateInput): WebhookDeliveryJournalEntry | undefined {
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

  recordWebhookDeliveryAttemptSuccess(input: RecordWebhookDeliveryAttemptSuccessInput): WebhookDeliveryJournalEntry | undefined {
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

  claimWebhookDeliveryJournalEntries(input: ClaimWebhookDeliveryJournalEntriesInput): WebhookDeliveryJournalEntry[] {
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

  listSecuritySessions(): SecuritySession[] {
    return clone(this.readState().securitySessions);
  }

  saveSecuritySession(session: SecuritySession): SecuritySession {
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

  findTelegramConnectionByTenantId(tenantId: string): TelegramConnectionStoredRecord | undefined {
    const normalizedTenantId = String(tenantId ?? "").trim();
    return clone(this.readState().telegramConnections.find((item) => item.tenantId === normalizedTenantId));
  }

  findTelegramConnectionByWebhookSecret(webhookSecret: string): TelegramConnectionStoredRecord | undefined {
    const normalizedSecret = String(webhookSecret ?? "").trim();
    return clone(this.readState().telegramConnections.find((item) =>
      item.status === "active" && item.webhookSecret === normalizedSecret
    ));
  }

  listTelegramConnections(): TelegramConnectionStoredRecord[] {
    return clone(this.readState().telegramConnections);
  }

  saveTelegramConnection(connection: TelegramConnectionStoredRecord): TelegramConnectionStoredRecord {
    const persisted = clone(connection);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.telegramConnections.some((item) => item.tenantId === persisted.tenantId);

      return {
        ...current,
        telegramConnections: exists
          ? current.telegramConnections.map((item) => item.tenantId === persisted.tenantId ? persisted : item)
          : [...current.telegramConnections, persisted]
      };
    });

    return clone(persisted);
  }
}

function seedIntegrationState(): IntegrationState {
  return {
    apiKeyRotationAuditEvents: [],
    apiKeyRotationJobs: [],
    publicApiKeys: [],
    publicApiKeyRevealStates: [],
    securitySessions: [],
    telegramConnections: [],
    webhookDeliveryJournal: [],
    webhookReplayAuditEvents: [],
    webhookReplayJournal: []
  };
}

function normalizeState(state: Partial<IntegrationState>): IntegrationState {
  return {
    apiKeyRotationAuditEvents: state.apiKeyRotationAuditEvents ?? [],
    apiKeyRotationJobs: state.apiKeyRotationJobs ?? [],
    publicApiKeys: normalizePublicApiKeys(state.publicApiKeys),
    publicApiKeyRevealStates: normalizePublicApiKeyRevealStates(state.publicApiKeyRevealStates),
    securitySessions: state.securitySessions ?? [],
    telegramConnections: normalizeTelegramConnections(state.telegramConnections),
    webhookDeliveryJournal: normalizeWebhookDeliveryJournal(state.webhookDeliveryJournal),
    webhookReplayAuditEvents: state.webhookReplayAuditEvents ?? [],
    webhookReplayJournal: state.webhookReplayJournal ?? []
  };
}

function normalizeTelegramConnections(connections: TelegramConnectionStoredRecord[] | undefined): TelegramConnectionStoredRecord[] {
  return (connections ?? []).map((connection) => ({
    botId: connection.botId ?? null,
    botToken: String(connection.botToken ?? ""),
    botUsername: connection.botUsername ?? null,
    createdAt: connection.createdAt,
    status: connection.status === "disabled" ? "disabled" : "active",
    tenantId: connection.tenantId,
    tokenPreview: connection.tokenPreview,
    updatedAt: connection.updatedAt,
    webhookSecret: connection.webhookSecret
  }));
}

function normalizeWebhookDeliveryJournal(entries: WebhookDeliveryJournalEntry[] | undefined): WebhookDeliveryJournalEntry[] {
  return (entries ?? []).map(normalizeWebhookDeliveryJournalEntry);
}

function normalizeWebhookDeliveryJournalEntry(entry: WebhookDeliveryJournalEntry): WebhookDeliveryJournalEntry {
  return {
    attempts: entry.attempts,
    createdAt: entry.createdAt,
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

function assertCompletePrismaIntegrationClient(client: PrismaIntegrationClient): void {
  if (!client.publicApiKey?.create || !client.publicApiKey.findMany || !client.publicApiKey.findUnique || !client.publicApiKey.upsert) {
    throw new Error("prisma_integration_public_api_key_delegate_required");
  }

  if (
    !client.publicApiKeyRevealState?.findUnique
    || !client.publicApiKeyRevealState.update
    || !client.publicApiKeyRevealState.updateMany
    || !client.publicApiKeyRevealState.upsert
  ) {
    throw new Error("prisma_integration_public_api_key_reveal_state_delegate_required");
  }

  if (!client.publicApiKeyRotationAuditEvent?.create) {
    throw new Error("prisma_integration_public_api_key_rotation_audit_delegate_required");
  }
}

function toPrismaPublicApiKeyCreateInput(key: PublicApiKeyStoredRecord): PrismaPublicApiKeyCreateInput {
  return {
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
