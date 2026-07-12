import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type OutboxEvent, type OutboxEventClaimQuery, type OutboxEventListQuery, type OutboxEventStore, type OutboxRetryPolicy, type StoredOutboxEvent, type StoredOutboxEventStatus, resolveRetryFailureState } from "@support-communication/events";
import { redactSensitiveText } from "@support-communication/redaction";

export interface DurableStore<TState> {
  read(): TState;
  update(mutator: (state: TState) => TState): TState;
  write(state: TState): TState;
}

export interface JsonFileStoreOptions<TState> {
  filePath: string;
  seed: TState;
}

export class JsonFileStore<TState> implements DurableStore<TState> {
  constructor(private readonly options: JsonFileStoreOptions<TState>) {
    mkdirSync(dirname(options.filePath), { recursive: true });

    if (!existsSync(options.filePath)) {
      this.write(options.seed);
    }
  }

  read(): TState {
    return clone(JSON.parse(readFileSync(this.options.filePath, "utf8")) as TState);
  }

  update(mutator: (state: TState) => TState): TState {
    return this.write(mutator(this.read()));
  }

  write(state: TState): TState {
    const next = clone(state);
    const temporaryPath = `${this.options.filePath}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    replaceJsonFile(temporaryPath, this.options.filePath);
    return clone(next);
  }
}

export class InMemoryStore<TState> implements DurableStore<TState> {
  private state: TState;

  constructor(seed: TState) {
    this.state = clone(seed);
  }

  read(): TState {
    return clone(this.state);
  }

  update(mutator: (state: TState) => TState): TState {
    return this.write(mutator(this.read()));
  }

  write(state: TState): TState {
    this.state = clone(state);
    return this.read();
  }
}

export interface PrismaClientFactoryOptions {
  datasourceUrl?: string;
  log?: unknown[];
}

export type RepositoryKind = "json" | "prisma";
export type RepositoryBootstrapSource = object;

export interface RepositoryStoreFileInput {
  defaultPort?: number | string;
  defaultServiceName?: string;
  source: RepositoryBootstrapSource;
  storeFileEnv: string;
  suffix: string;
}

export interface RepositoryBootstrapInput<TRepository, TPrismaClient> extends RepositoryStoreFileInput {
  createJsonRepository(filePath: string): TRepository;
  createPrismaRepository(client: TPrismaClient, createJsonFallback: () => TRepository): TRepository;
  prismaClientFactory(options: PrismaClientFactoryOptions): TPrismaClient;
  repositoryEnv: string;
  useDefault(repository: TRepository): void;
}

export function resolveRepositoryKind(source: RepositoryBootstrapSource, repositoryEnv: string): RepositoryKind {
  return String(sourceValue(source, repositoryEnv) ?? "").trim().toLowerCase() === "prisma" ? "prisma" : "json";
}

export function resolveRepositoryStoreFile(input: RepositoryStoreFileInput): string {
  const configuredPath = String(sourceValue(input.source, input.storeFileEnv) ?? "").trim();
  if (configuredPath) {
    return resolve(configuredPath);
  }

  const serviceName = sanitizePathSegment(String(sourceValue(input.source, "SERVICE_NAME") ?? input.defaultServiceName ?? "api-gateway"));
  const nodeEnv = sanitizePathSegment(String(sourceValue(input.source, "NODE_ENV") ?? "development"));
  const port = sanitizePathSegment(String(sourceValue(input.source, "PORT") ?? input.defaultPort ?? "4100"));

  return join(tmpdir(), "support-communication", `${serviceName}-${nodeEnv}-${port}-${input.suffix}.json`);
}

export function configureRepositoryBootstrap<TRepository, TPrismaClient>(
  input: RepositoryBootstrapInput<TRepository, TPrismaClient>
): TRepository {
  const filePath = resolveRepositoryStoreFile(input);
  const createJsonRepository = () => input.createJsonRepository(filePath);
  const repository = resolveRepositoryKind(input.source, input.repositoryEnv) === "prisma"
    ? input.createPrismaRepository(input.prismaClientFactory({ datasourceUrl: stringOrUndefined(sourceValue(input.source, "DATABASE_URL")) }), createJsonRepository)
    : createJsonRepository();
  input.useDefault(repository);
  return repository;
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "default";
}

function replaceJsonFile(sourcePath: string, targetPath: string): void {
  const maxAttempts = 6;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      renameSync(sourcePath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableFileReplaceError(error) || attempt === maxAttempts - 1) {
        break;
      }
      sleepSync(10 * (attempt + 1));
    }
  }

  try {
    writeFileSync(targetPath, readFileSync(sourcePath, "utf8"), "utf8");
    rmSync(sourcePath, { force: true });
  } catch {
    throw lastError;
  }
}

function isRetryableFileReplaceError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function stringOrUndefined(value: number | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return String(value);
}

function sourceValue(source: RepositoryBootstrapSource, key: string): number | string | undefined {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

export interface PrismaTransactionRunner<TTransactionClient> {
  $transaction<TResult>(operation: (client: TTransactionClient) => Promise<TResult>): Promise<TResult>;
}

export interface PrismaOutboxClient {
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  outboxEvent: {
    count?(input: PrismaOutboxEventCountInput): Promise<number>;
    create(input: { data: PrismaOutboxEventCreateInput }): Promise<PrismaOutboxEventRow>;
    findMany?(input: PrismaOutboxEventFindManyInput): Promise<PrismaOutboxEventRow[]>;
    update?(input: PrismaOutboxEventUpdateInput): Promise<PrismaOutboxEventRow>;
  };
}

export interface PrismaOutboxEventCreateInput {
  aggregateId: string;
  aggregateType: string;
  attempts?: number | { increment: number };
  deadLetteredAt?: Date | null;
  deadLetterReplayAuditEvents?: Array<Record<string, unknown>>;
  id: string;
  lastError?: string | null;
  lockedAt?: Date | null;
  nextAttemptAt?: Date | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
  publishedAt?: Date | null;
  queue: string;
  status: string;
  traceId: string;
  type: string;
}

interface PrismaOutboxEventCountInput {
  where: PrismaOutboxEventWhereInput;
}

interface PrismaOutboxEventFindManyInput {
  orderBy: PrismaOutboxEventOrderByInput;
  take?: number;
  where: PrismaOutboxEventWhereInput;
}

type PrismaOutboxEventOrderByInput = Partial<Record<"deadLetteredAt" | "lockedAt" | "nextAttemptAt" | "occurredAt" | "publishedAt", "asc" | "desc">>;
type PrismaNullableTimestampFilter = { not: null };
type PrismaOutboxNullableEvidenceOrderField = "deadLetteredAt" | "lockedAt" | "nextAttemptAt" | "publishedAt";

interface PrismaOutboxEventWhereInput {
  deadLetteredAt?: PrismaNullableTimestampFilter;
  lockedAt?: PrismaNullableTimestampFilter;
  nextAttemptAt?: PrismaNullableTimestampFilter;
  publishedAt?: PrismaNullableTimestampFilter;
  queue?: string;
  status?: string | { in: string[] };
}

interface PrismaOutboxEventUpdateInput {
  data: Partial<PrismaOutboxEventCreateInput>;
  where: { id: string };
}

interface PrismaOutboxEventRow extends PrismaOutboxEventCreateInput {
  attempts: number;
  deadLetteredAt: Date | null;
  lastError: string | null;
  lockedAt: Date | null;
  nextAttemptAt: Date | null;
  publishedAt: Date | null;
}

export type StoredBillingSyncJobStatus = "dead_lettered" | "failed" | "pending" | "published" | "publishing";

export interface StoredBillingSyncJob {
  actor: string;
  actorName: string;
  attempts: number;
  auditEventId: string;
  createdAt: string;
  deadLetteredAt: string | null;
  deadLetterReplayAuditEvents?: Array<Record<string, unknown>>;
  fromPlanId: string;
  id: string;
  lastError: string | null;
  lockedAt: string | null;
  nextAttemptAt: string | null;
  payload: Record<string, unknown>;
  publishedAt: string | null;
  queue: string;
  reason: string;
  status: StoredBillingSyncJobStatus;
  tenantId: string;
  toPlanId: string;
  traceId: string;
}

export interface BillingSyncJobListQuery {
  limit?: number;
  queue?: string;
  statuses?: StoredBillingSyncJobStatus[];
}

export interface BillingSyncJobClaimQuery {
  leaseTimeoutMs?: number;
  limit?: number;
  now?: Date;
  queue?: string;
}

export interface BillingSyncJobStore {
  claimPending(query?: BillingSyncJobClaimQuery): Promise<StoredBillingSyncJob[]>;
  list(query?: BillingSyncJobListQuery): Promise<StoredBillingSyncJob[]>;
  markFailed(id: string, error: Error | string, failedAt?: Date, policy?: OutboxRetryPolicy): Promise<StoredBillingSyncJob>;
  markPublished(id: string, publishedAt?: Date): Promise<StoredBillingSyncJob>;
  replayDeadLettered(id: string, queue: string, reason: string, replayedAt?: Date, auditEvent?: Record<string, unknown>): Promise<StoredBillingSyncJob>;
}

export interface PrismaBillingSyncJobClient {
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  billingSyncJob: {
    count?(input: PrismaBillingSyncJobCountInput): Promise<number>;
    findMany?(input: PrismaBillingSyncJobFindManyInput): Promise<PrismaBillingSyncJobRow[]>;
    update?(input: PrismaBillingSyncJobUpdateInput): Promise<PrismaBillingSyncJobRow>;
  };
}

export interface OutboxQueueSummary {
  deadLetterCount: number;
  latestEvent: StoredOutboxEvent | null;
  queue: string;
  queueDepth: number;
}

export interface OutboxQueueSummaryStore {
  summarizeOutboxQueue(query: { queue: string }): Promise<OutboxQueueSummary>;
}

export interface BillingSyncQueueSummary {
  deadLetterCount: number;
  latestJob: StoredBillingSyncJob | null;
  queue: string;
  queueDepth: number;
}

export interface BillingSyncQueueSummaryStore {
  summarizeBillingSyncQueue(query: { queue: string }): Promise<BillingSyncQueueSummary>;
}

export type ConversationOutboundDescriptorKind = "attachment_upload" | "message_delivery" | "outbound_conversation";

export interface WorkerConversationOutboundDescriptor {
  channel: string;
  conversationId: string | null;
  id: string;
  idempotencyKey?: string | null;
  kind: ConversationOutboundDescriptorKind;
  messageId: string | null;
  payload: Record<string, unknown>;
  tenantId: string;
}

export interface ConversationOutboundDescriptorStore {
  findOutboundDescriptorById(descriptorId: string): Promise<WorkerConversationOutboundDescriptor | null | undefined> | WorkerConversationOutboundDescriptor | null | undefined;
  markOutboundDescriptorDelivery?(descriptorId: string, deliveryState: "delivered" | "failed"): Promise<WorkerConversationOutboundDescriptor | null>;
  recordProviderMessageBinding?(input: { channelConnectionId: string; conversationId: string; internalMessageId: string; provider: string; providerConversationId: string; providerMessageId: string; tenantId: string }): Promise<void>;
}

export interface PrismaConversationOutboundDescriptorClient {
  conversationOutboundDescriptor: {
    findUnique(input: PrismaConversationOutboundDescriptorFindUniqueInput): Promise<PrismaConversationOutboundDescriptorRow | null>;
    update?(input: {
      data: { deliveryState: string; retryable: boolean; status: string; updatedAt: Date };
      where: { id: string };
    }): Promise<PrismaConversationOutboundDescriptorRow>;
  };
  providerMessageBinding?: {
    upsert(input: {
      create: Record<string, unknown>;
      update: { providerConversationId: string; providerMessageId: string; status: string; updatedAt: Date };
      where: { tenantId_internalMessageId_provider: { internalMessageId: string; provider: string; tenantId: string } };
    }): Promise<unknown>;
  };
}

export interface ChannelDeliveryReceipt {
  channel: string;
  conversationId: string;
  id: string;
  idempotencyKey: string;
  messageId: string;
  payload?: Record<string, unknown> | null;
  provider: string;
  providerEventId: string;
  receivedAt: string;
  status: string;
  tenantId: string;
  traceId: string;
}

export interface ChannelDeliveryReceiptListQuery {
  channel?: string;
  messageId?: string;
  tenantId?: string;
}

export interface ChannelDeliveryReceiptStore {
  listDeliveryReceipts(query?: ChannelDeliveryReceiptListQuery): Promise<ChannelDeliveryReceipt[]>;
  recordDeliveryReceipt(receipt: ChannelDeliveryReceipt): Promise<ChannelDeliveryReceipt>;
}

export interface PrismaChannelDeliveryReceiptClient {
  channelDeliveryReceipt: {
    create(input: PrismaChannelDeliveryReceiptCreateInput): Promise<PrismaChannelDeliveryReceiptRow>;
    findMany(input: PrismaChannelDeliveryReceiptFindManyInput): Promise<PrismaChannelDeliveryReceiptRow[]>;
    findUnique(input: PrismaChannelDeliveryReceiptFindUniqueInput): Promise<PrismaChannelDeliveryReceiptRow | null>;
  };
}

interface PrismaConversationOutboundDescriptorFindUniqueInput {
  where: { id: string };
}

interface PrismaConversationOutboundDescriptorRow {
  channel: string;
  conversationId: string | null;
  id: string;
  idempotencyKey?: string | null;
  kind: string;
  messageId: string | null;
  payload: unknown;
  tenantId: string;
}

interface PrismaChannelDeliveryReceiptCreateInput {
  data: {
    channel: string;
    conversationId: string;
    id: string;
    idempotencyKey: string;
    messageId: string;
    payload?: Record<string, unknown> | null;
    provider: string;
    providerEventId: string;
    receivedAt: Date;
    status: string;
    tenantId: string;
    traceId: string;
  };
}

interface PrismaChannelDeliveryReceiptFindManyInput {
  orderBy: { receivedAt: "asc" };
  where: ChannelDeliveryReceiptListQuery;
}

interface PrismaChannelDeliveryReceiptFindUniqueInput {
  where: {
    provider_providerEventId?: {
      provider: string;
      providerEventId: string;
    };
  };
}

interface PrismaChannelDeliveryReceiptRow {
  channel: string;
  conversationId: string;
  id: string;
  idempotencyKey: string;
  messageId: string;
  payload?: unknown;
  provider: string;
  providerEventId: string;
  receivedAt: Date | string;
  status: string;
  tenantId: string;
  traceId: string;
}

interface PrismaBillingSyncJobCountInput {
  where: PrismaBillingSyncJobWhereInput;
}

interface PrismaBillingSyncJobFindManyInput {
  orderBy: PrismaBillingSyncJobOrderByInput;
  take?: number;
  where: PrismaBillingSyncJobWhereInput;
}

type PrismaBillingSyncJobOrderByInput = Partial<Record<"createdAt" | "deadLetteredAt" | "lockedAt" | "nextAttemptAt" | "publishedAt", "asc" | "desc">>;
type PrismaBillingSyncNullableEvidenceOrderField = "deadLetteredAt" | "lockedAt" | "nextAttemptAt" | "publishedAt";

interface PrismaBillingSyncJobWhereInput {
  deadLetteredAt?: PrismaNullableTimestampFilter;
  lockedAt?: PrismaNullableTimestampFilter;
  nextAttemptAt?: PrismaNullableTimestampFilter;
  publishedAt?: PrismaNullableTimestampFilter;
  queue?: string;
  status?: string | { in: string[] };
}

interface PrismaBillingSyncJobUpdateInput {
  data: Partial<PrismaBillingSyncJobUpdateData>;
  where: { id: string };
}

interface PrismaBillingSyncJobUpdateData {
  attempts: number | { increment: number };
  deadLetteredAt: Date | null;
  deadLetterReplayAuditEvents: Array<Record<string, unknown>>;
  lastError: string | null;
  lockedAt: Date | null;
  nextAttemptAt: Date | null;
  publishedAt: Date | null;
  status: string;
  updatedAt: Date;
}

interface PrismaBillingSyncJobRow {
  actor: string;
  actorName: string;
  attempts?: number;
  auditEventId: string;
  createdAt: Date | string;
  deadLetteredAt?: Date | string | null;
  deadLetterReplayAuditEvents?: unknown;
  fromPlanId: string;
  id: string;
  lastError?: string | null;
  lockedAt?: Date | string | null;
  nextAttemptAt?: Date | string | null;
  payload: unknown;
  publishedAt?: Date | string | null;
  queue: string;
  reason: string;
  status: string;
  tenantId: string;
  toPlanId: string;
  traceId: string;
}

export function createPrismaClient(options: PrismaClientFactoryOptions = {}): unknown {
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require("@prisma/client") as {
    PrismaClient: new (clientOptions?: Record<string, unknown>) => unknown;
  };
  const clientOptions: Record<string, unknown> = {};

  if (options.datasourceUrl) {
    clientOptions.datasources = {
      db: {
        url: options.datasourceUrl
      }
    };
  }

  if (options.log) {
    clientOptions.log = options.log;
  }

  return new PrismaClient(clientOptions);
}

export function withTransaction<TTransactionClient, TResult>(
  client: PrismaTransactionRunner<TTransactionClient>,
  operation: (client: TTransactionClient) => Promise<TResult>
): Promise<TResult> {
  return client.$transaction(operation);
}

const OUTBOX_EVIDENCE_STATUSES: StoredOutboxEventStatus[] = ["dead_lettered", "failed", "pending", "publishing", "published"];
const BILLING_SYNC_EVIDENCE_STATUSES: StoredBillingSyncJobStatus[] = ["dead_lettered", "failed", "pending", "publishing", "published"];
const SUMMARY_EVIDENCE_LIMIT = 25;
const OUTBOX_EVIDENCE_ORDER_FIELDS: Record<StoredOutboxEventStatus, Array<keyof PrismaOutboxEventOrderByInput>> = {
  dead_lettered: ["deadLetteredAt", "occurredAt"],
  failed: ["nextAttemptAt", "lockedAt", "occurredAt"],
  pending: ["occurredAt"],
  published: ["publishedAt", "occurredAt"],
  publishing: ["lockedAt", "occurredAt"]
};
const OUTBOX_NULLABLE_EVIDENCE_ORDER_FIELDS = new Set<PrismaOutboxNullableEvidenceOrderField>([
  "deadLetteredAt",
  "lockedAt",
  "nextAttemptAt",
  "publishedAt"
]);
const BILLING_SYNC_EVIDENCE_ORDER_FIELDS: Record<StoredBillingSyncJobStatus, Array<keyof PrismaBillingSyncJobOrderByInput>> = {
  dead_lettered: ["deadLetteredAt", "createdAt"],
  failed: ["nextAttemptAt", "lockedAt", "createdAt"],
  pending: ["createdAt"],
  published: ["publishedAt", "createdAt"],
  publishing: ["lockedAt", "createdAt"]
};
const BILLING_SYNC_NULLABLE_EVIDENCE_ORDER_FIELDS = new Set<PrismaBillingSyncNullableEvidenceOrderField>([
  "deadLetteredAt",
  "lockedAt",
  "nextAttemptAt",
  "publishedAt"
]);

function outboxEvidenceWhere(
  queue: string,
  status: StoredOutboxEventStatus,
  field: keyof PrismaOutboxEventOrderByInput
): PrismaOutboxEventWhereInput {
  const where: PrismaOutboxEventWhereInput = { queue, status };
  if (isOutboxNullableEvidenceOrderField(field)) {
    where[field] = { not: null };
  }
  return where;
}

function billingSyncEvidenceWhere(
  queue: string,
  status: StoredBillingSyncJobStatus,
  field: keyof PrismaBillingSyncJobOrderByInput
): PrismaBillingSyncJobWhereInput {
  const where: PrismaBillingSyncJobWhereInput = { queue, status };
  if (isBillingSyncNullableEvidenceOrderField(field)) {
    where[field] = { not: null };
  }
  return where;
}

function isOutboxNullableEvidenceOrderField(
  field: keyof PrismaOutboxEventOrderByInput
): field is PrismaOutboxNullableEvidenceOrderField {
  return OUTBOX_NULLABLE_EVIDENCE_ORDER_FIELDS.has(field as PrismaOutboxNullableEvidenceOrderField);
}

function isBillingSyncNullableEvidenceOrderField(
  field: keyof PrismaBillingSyncJobOrderByInput
): field is PrismaBillingSyncNullableEvidenceOrderField {
  return BILLING_SYNC_NULLABLE_EVIDENCE_ORDER_FIELDS.has(field as PrismaBillingSyncNullableEvidenceOrderField);
}

export function createPrismaOutboxQueueSummaryStore(client: PrismaOutboxClient): OutboxQueueSummaryStore {
  return {
    async summarizeOutboxQueue({ queue }: { queue: string }): Promise<OutboxQueueSummary> {
      if (!client.outboxEvent.count || !client.outboxEvent.findMany) {
        throw new Error("Prisma outbox client does not support queue summaries.");
      }

      const [
        pendingCount,
        publishingCount,
        failedCount,
        deadLetterCount
      ] = await Promise.all([
        client.outboxEvent.count({ where: { queue, status: "pending" } }),
        client.outboxEvent.count({ where: { queue, status: "publishing" } }),
        client.outboxEvent.count({ where: { queue, status: "failed" } }),
        client.outboxEvent.count({ where: { queue, status: "dead_lettered" } })
      ]);
      const evidenceStatuses = deadLetterCount > 0 ? ["dead_lettered" as const] : OUTBOX_EVIDENCE_STATUSES;
      const evidenceRows = await Promise.all(evidenceStatuses.flatMap((status) => OUTBOX_EVIDENCE_ORDER_FIELDS[status].map((field) => client.outboxEvent.findMany!({
        orderBy: { [field]: "desc" },
        take: SUMMARY_EVIDENCE_LIMIT,
        where: outboxEvidenceWhere(queue, status, field)
      }))));
      const evidenceEvents = uniqueById(evidenceRows.flat().map(toStoredOutboxEvent));

      return {
        deadLetterCount,
        latestEvent: latestByTimestamp(evidenceEvents, outboxSummaryTimestamp),
        queue,
        queueDepth: pendingCount + publishingCount + failedCount
      };
    }
  };
}

export function createPrismaBillingSyncQueueSummaryStore(client: PrismaBillingSyncJobClient): BillingSyncQueueSummaryStore {
  return {
    async summarizeBillingSyncQueue({ queue }: { queue: string }): Promise<BillingSyncQueueSummary> {
      if (!client.billingSyncJob.count || !client.billingSyncJob.findMany) {
        throw new Error("Prisma billing sync job client does not support queue summaries.");
      }

      const [
        pendingCount,
        publishingCount,
        failedCount,
        deadLetterCount
      ] = await Promise.all([
        client.billingSyncJob.count({ where: { queue, status: "pending" } }),
        client.billingSyncJob.count({ where: { queue, status: "publishing" } }),
        client.billingSyncJob.count({ where: { queue, status: "failed" } }),
        client.billingSyncJob.count({ where: { queue, status: "dead_lettered" } })
      ]);
      const evidenceStatuses = deadLetterCount > 0 ? ["dead_lettered" as const] : BILLING_SYNC_EVIDENCE_STATUSES;
      const evidenceRows = await Promise.all(evidenceStatuses.flatMap((status) => BILLING_SYNC_EVIDENCE_ORDER_FIELDS[status].map((field) => client.billingSyncJob.findMany!({
        orderBy: { [field]: "desc" },
        take: SUMMARY_EVIDENCE_LIMIT,
        where: billingSyncEvidenceWhere(queue, status, field)
      }))));
      const evidenceJobs = uniqueById(evidenceRows.flat().map(toStoredBillingSyncJob));

      return {
        deadLetterCount,
        latestJob: latestByTimestamp(evidenceJobs, billingSyncSummaryTimestamp),
        queue,
        queueDepth: pendingCount + publishingCount + failedCount
      };
    }
  };
}

export function createPrismaOutboxStore(client: PrismaOutboxClient): OutboxEventStore {
  return {
    async append(event: OutboxEvent): Promise<StoredOutboxEvent> {
      const row = await client.outboxEvent.create({
        data: {
          aggregateId: event.aggregateId,
          aggregateType: event.aggregateType,
          id: event.id,
          occurredAt: new Date(event.occurredAt),
          payload: event.payload,
          queue: event.queue,
          status: event.status,
          traceId: event.traceId,
          type: event.type
        }
      });

      return toStoredOutboxEvent(row);
    },

    async claimPending({ leaseTimeoutMs = 300_000, limit = 100, now = new Date(), queue }: OutboxEventClaimQuery = {}): Promise<StoredOutboxEvent[]> {
      if (!client.$queryRawUnsafe) {
        throw new Error("Prisma outbox client does not support atomic event claiming.");
      }

      const staleBefore = new Date(now.getTime() - leaseTimeoutMs);
      const rows = await client.$queryRawUnsafe<PrismaOutboxEventRow[]>(`
        UPDATE "outbox_events"
        SET "status" = 'publishing',
            "locked_at" = $1
        WHERE "id" IN (
          SELECT "id"
          FROM "outbox_events"
          WHERE (
            "status" = 'pending'
            OR ("status" = 'failed' AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= $1))
            OR ("status" = 'publishing' AND "locked_at" <= $2)
          )
          ${queue ? `AND "queue" = $4` : ""}
          ORDER BY "occurred_at" ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        RETURNING
          "id",
          "aggregate_id" AS "aggregateId",
          "aggregate_type" AS "aggregateType",
          "attempts",
          "dead_lettered_at" AS "deadLetteredAt",
          "dead_letter_replay_audit_events" AS "deadLetterReplayAuditEvents",
          "last_error" AS "lastError",
          "locked_at" AS "lockedAt",
          "next_attempt_at" AS "nextAttemptAt",
          "occurred_at" AS "occurredAt",
          "payload",
          "published_at" AS "publishedAt",
          "queue",
          "status",
          "trace_id" AS "traceId",
          "type"
      `, ...(
        queue
          ? [now, staleBefore, limit, queue]
          : [now, staleBefore, limit]
      ));

      return rows.map(toStoredOutboxEvent);
    },

    async list({ limit, queue, statuses }: OutboxEventListQuery = {}): Promise<StoredOutboxEvent[]> {
      if (!client.outboxEvent.findMany) {
        throw new Error("Prisma outbox client does not support listing events.");
      }

      const rows = await client.outboxEvent.findMany({
        orderBy: { occurredAt: "asc" },
        take: limit,
        where: {
          ...(queue ? { queue } : {}),
          ...(statuses ? { status: { in: statuses } } : {})
        }
      });

      return rows.map(toStoredOutboxEvent);
    },

    markFailed(id: string, error: Error | string, failedAt = new Date(), policy: OutboxRetryPolicy = {}): Promise<StoredOutboxEvent> {
      const failure = resolveRetryFailureState(policy.currentAttempts ?? 0, failedAt, policy);
      return updateOutboxEvent(client, id, {
        deadLetteredAt: failure.deadLetteredAt ? new Date(failure.deadLetteredAt) : null,
        lastError: formatFailureError(error),
        lockedAt: null,
        nextAttemptAt: failure.nextAttemptAt ? new Date(failure.nextAttemptAt) : null,
        publishedAt: null,
        status: failure.status
      }, true);
    },

    markPublished(id: string, publishedAt = new Date()): Promise<StoredOutboxEvent> {
      return updateOutboxEvent(client, id, {
        deadLetteredAt: null,
        lastError: null,
        lockedAt: null,
        nextAttemptAt: null,
        publishedAt,
        status: "published"
      });
    },

    async replayDeadLettered(id: string, queue: string, reason: string, replayedAt = new Date(), auditEvent?: Record<string, unknown>): Promise<StoredOutboxEvent> {
      if (!client.$queryRawUnsafe) {
        throw new Error("Prisma outbox client does not support atomic dead-letter replay.");
      }

      const auditEventsJson = JSON.stringify(auditEvent ? [auditEvent] : []);
      const rows = await client.$queryRawUnsafe<PrismaOutboxEventRow[]>(`
        UPDATE "outbox_events"
        SET "status" = 'failed',
            "attempts" = "attempts" + 1,
            "dead_lettered_at" = NULL,
            "dead_letter_replay_audit_events" = COALESCE("dead_letter_replay_audit_events", '[]'::jsonb) || $4::jsonb,
            "last_error" = $3,
            "locked_at" = NULL,
            "next_attempt_at" = NULL,
            "published_at" = NULL
        WHERE "id" = $1
          AND "queue" = $2
          AND "status" = 'dead_lettered'
        RETURNING
          "id",
          "aggregate_id" AS "aggregateId",
          "aggregate_type" AS "aggregateType",
          "attempts",
          "dead_lettered_at" AS "deadLetteredAt",
          "dead_letter_replay_audit_events" AS "deadLetterReplayAuditEvents",
          "last_error" AS "lastError",
          "locked_at" AS "lockedAt",
          "next_attempt_at" AS "nextAttemptAt",
          "occurred_at" AS "occurredAt",
          "payload",
          "published_at" AS "publishedAt",
          "queue",
          "status",
          "trace_id" AS "traceId",
          "type"
      `, id, queue, redactSensitiveText(`dead_letter_replay:${reason}`), auditEventsJson);

      const [row] = rows;
      if (!row) {
        throw new Error(`dead_letter_item_not_found:${queue}:${id}`);
      }

      return toStoredOutboxEvent(row);
    }

  };
}

export class InMemoryBillingSyncJobStore implements BillingSyncJobStore {
  private readonly jobs = new Map<string, StoredBillingSyncJob>();

  constructor(seed: StoredBillingSyncJob[] = []) {
    for (const job of seed) {
      const stored = normalizeBillingSyncJob(job);
      this.jobs.set(stored.id, stored);
    }
  }

  async list({ limit, queue, statuses }: BillingSyncJobListQuery = {}): Promise<StoredBillingSyncJob[]> {
    const matching = [...this.jobs.values()]
      .filter((job) => !queue || job.queue === queue)
      .filter((job) => !statuses || statuses.includes(job.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

    return clone(limit ? matching.slice(0, limit) : matching);
  }

  async claimPending({ leaseTimeoutMs = 300_000, limit = 100, now = new Date(), queue }: BillingSyncJobClaimQuery = {}): Promise<StoredBillingSyncJob[]> {
    const staleBefore = new Date(now.getTime() - leaseTimeoutMs);
    const claimed: StoredBillingSyncJob[] = [];

    for (const job of [...this.jobs.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
      if (claimed.length >= limit) {
        break;
      }

      if (queue && job.queue !== queue) {
        continue;
      }

      const stalePublishing = job.status === "publishing"
        && job.lockedAt
        && Date.parse(job.lockedAt) <= staleBefore.getTime();
      const retryableFailure = job.status === "failed"
        && (!job.nextAttemptAt || Date.parse(job.nextAttemptAt) <= now.getTime());
      if (job.status !== "pending" && !retryableFailure && !stalePublishing) {
        continue;
      }

      const updated: StoredBillingSyncJob = {
        ...job,
        lockedAt: now.toISOString(),
        status: "publishing"
      };
      this.jobs.set(job.id, updated);
      claimed.push(updated);
    }

    return clone(claimed);
  }

  async markFailed(id: string, error: Error | string, failedAt = new Date(), policy: OutboxRetryPolicy = {}): Promise<StoredBillingSyncJob> {
    const job = this.requireJob(id);
    const failure = resolveRetryFailureState(job.attempts, failedAt, policy);
    const updated: StoredBillingSyncJob = {
      ...job,
      attempts: failure.attempts,
      deadLetteredAt: failure.deadLetteredAt,
      lastError: formatFailureError(error),
      lockedAt: null,
      nextAttemptAt: failure.nextAttemptAt,
      publishedAt: null,
      status: failure.status
    };

    this.jobs.set(id, updated);
    return clone(updated);
  }

  async markPublished(id: string, publishedAt = new Date()): Promise<StoredBillingSyncJob> {
    const job = this.requireJob(id);
    const updated: StoredBillingSyncJob = {
      ...job,
      deadLetteredAt: null,
      lastError: null,
      lockedAt: null,
      nextAttemptAt: null,
      publishedAt: publishedAt.toISOString(),
      status: "published"
    };

    this.jobs.set(id, updated);
    return clone(updated);
  }

  async replayDeadLettered(id: string, queue: string, reason: string, replayedAt = new Date(), auditEvent?: Record<string, unknown>): Promise<StoredBillingSyncJob> {
    const job = this.requireJob(id);
    if (job.queue !== queue || job.status !== "dead_lettered") {
      throw new Error(`dead_letter_item_not_found:${queue}:${id}`);
    }

    const updated: StoredBillingSyncJob = {
      ...job,
      attempts: job.attempts + 1,
      deadLetteredAt: null,
      deadLetterReplayAuditEvents: appendAuditEvent(job.deadLetterReplayAuditEvents, auditEvent),
      lastError: redactSensitiveText(`dead_letter_replay:${reason}`),
      lockedAt: null,
      nextAttemptAt: null,
      publishedAt: null,
      status: "failed"
    };

    this.jobs.set(id, updated);
    return clone(updated);
  }

  private requireJob(id: string): StoredBillingSyncJob {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Billing sync job ${id} was not found.`);
    }

    return job;
  }
}

export function createPrismaBillingSyncJobStore(client: PrismaBillingSyncJobClient): BillingSyncJobStore {
  return {
    async claimPending({ leaseTimeoutMs = 300_000, limit = 100, now = new Date(), queue }: BillingSyncJobClaimQuery = {}): Promise<StoredBillingSyncJob[]> {
      if (!client.$queryRawUnsafe) {
        throw new Error("Prisma billing sync job client does not support atomic job claiming.");
      }

      const staleBefore = new Date(now.getTime() - leaseTimeoutMs);
      const rows = await client.$queryRawUnsafe<PrismaBillingSyncJobRow[]>(`
        UPDATE "billing_sync_jobs"
        SET "status" = 'publishing',
            "locked_at" = $1,
            "updated_at" = $1
        WHERE "id" IN (
          SELECT "id"
          FROM "billing_sync_jobs"
          WHERE (
            "status" = 'pending'
            OR ("status" = 'failed' AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= $1))
            OR ("status" = 'publishing' AND "locked_at" <= $2)
          )
          ${queue ? `AND "queue" = $4` : ""}
          ORDER BY "created_at" ASC
          LIMIT $3
          FOR UPDATE SKIP LOCKED
        )
        RETURNING
          "actor",
          "actor_name" AS "actorName",
          "attempts",
          "audit_event_id" AS "auditEventId",
          "created_at" AS "createdAt",
          "dead_lettered_at" AS "deadLetteredAt",
          "dead_letter_replay_audit_events" AS "deadLetterReplayAuditEvents",
          "from_plan_id" AS "fromPlanId",
          "id",
          "last_error" AS "lastError",
          "locked_at" AS "lockedAt",
          "next_attempt_at" AS "nextAttemptAt",
          "payload",
          "published_at" AS "publishedAt",
          "queue",
          "reason",
          "status",
          "tenant_id" AS "tenantId",
          "to_plan_id" AS "toPlanId",
          "trace_id" AS "traceId"
      `, ...(
        queue
          ? [now, staleBefore, limit, queue]
          : [now, staleBefore, limit]
      ));

      return rows.map(toStoredBillingSyncJob);
    },

    async list({ limit, queue, statuses }: BillingSyncJobListQuery = {}): Promise<StoredBillingSyncJob[]> {
      if (!client.billingSyncJob.findMany) {
        throw new Error("Prisma billing sync job client does not support listing jobs.");
      }

      const rows = await client.billingSyncJob.findMany({
        orderBy: { createdAt: "asc" },
        take: limit,
        where: {
          ...(queue ? { queue } : {}),
          ...(statuses ? { status: { in: statuses } } : {})
        }
      });

      return rows.map(toStoredBillingSyncJob);
    },

    markFailed(id: string, error: Error | string, failedAt = new Date(), policy: OutboxRetryPolicy = {}): Promise<StoredBillingSyncJob> {
      const failure = resolveRetryFailureState(policy.currentAttempts ?? 0, failedAt, policy);
      return updateBillingSyncJob(client, id, {
        deadLetteredAt: failure.deadLetteredAt ? new Date(failure.deadLetteredAt) : null,
        lastError: formatFailureError(error),
        lockedAt: null,
        nextAttemptAt: failure.nextAttemptAt ? new Date(failure.nextAttemptAt) : null,
        publishedAt: null,
        status: failure.status,
        updatedAt: failedAt
      }, true);
    },

    markPublished(id: string, publishedAt = new Date()): Promise<StoredBillingSyncJob> {
      return updateBillingSyncJob(client, id, {
        deadLetteredAt: null,
        lastError: null,
        lockedAt: null,
        nextAttemptAt: null,
        publishedAt,
        status: "published",
        updatedAt: publishedAt
      });
    },

    async replayDeadLettered(id: string, queue: string, reason: string, replayedAt = new Date(), auditEvent?: Record<string, unknown>): Promise<StoredBillingSyncJob> {
      if (!client.$queryRawUnsafe) {
        throw new Error("Prisma billing sync job client does not support atomic dead-letter replay.");
      }

      const auditEventsJson = JSON.stringify(auditEvent ? [auditEvent] : []);
      const rows = await client.$queryRawUnsafe<PrismaBillingSyncJobRow[]>(`
        UPDATE "billing_sync_jobs"
        SET "status" = 'failed',
            "attempts" = "attempts" + 1,
            "dead_lettered_at" = NULL,
            "dead_letter_replay_audit_events" = COALESCE("dead_letter_replay_audit_events", '[]'::jsonb) || $5::jsonb,
            "last_error" = $3,
            "locked_at" = NULL,
            "next_attempt_at" = NULL,
            "published_at" = NULL,
            "updated_at" = $4
        WHERE "id" = $1
          AND "queue" = $2
          AND "status" = 'dead_lettered'
        RETURNING
          "actor",
          "actor_name" AS "actorName",
          "attempts",
          "audit_event_id" AS "auditEventId",
          "created_at" AS "createdAt",
          "dead_lettered_at" AS "deadLetteredAt",
          "dead_letter_replay_audit_events" AS "deadLetterReplayAuditEvents",
          "from_plan_id" AS "fromPlanId",
          "id",
          "last_error" AS "lastError",
          "locked_at" AS "lockedAt",
          "next_attempt_at" AS "nextAttemptAt",
          "payload",
          "published_at" AS "publishedAt",
          "queue",
          "reason",
          "status",
          "tenant_id" AS "tenantId",
          "to_plan_id" AS "toPlanId",
          "trace_id" AS "traceId"
      `, id, queue, redactSensitiveText(`dead_letter_replay:${reason}`), replayedAt, auditEventsJson);

      const [row] = rows;
      if (!row) {
        throw new Error(`dead_letter_item_not_found:${queue}:${id}`);
      }

      return toStoredBillingSyncJob(row);
    }
  };
}

export function createPrismaConversationOutboundDescriptorStore(client: PrismaConversationOutboundDescriptorClient): ConversationOutboundDescriptorStore {
  return {
    async findOutboundDescriptorById(descriptorId: string): Promise<WorkerConversationOutboundDescriptor | null> {
      const row = await client.conversationOutboundDescriptor.findUnique({
        where: { id: descriptorId }
      });

      return row ? toWorkerConversationOutboundDescriptor(row) : null;
    },
    async markOutboundDescriptorDelivery(descriptorId, deliveryState) {
      if (!client.conversationOutboundDescriptor.update) {
        return null;
      }

      const row = await client.conversationOutboundDescriptor.update({
        data: {
          deliveryState,
          retryable: deliveryState !== "delivered",
          status: deliveryState,
          updatedAt: new Date()
        },
        where: { id: descriptorId }
      });
      return toWorkerConversationOutboundDescriptor(row);
    },
    async recordProviderMessageBinding(input) {
      if (!client.providerMessageBinding) throw new Error("provider_message_binding_store_required");
      const now = new Date();
      await client.providerMessageBinding.upsert({
        create: {
          ...input,
          id: `provider_binding_${randomUUID()}`,
          status: "sent",
          createdAt: now,
          updatedAt: now
        },
        update: {
          providerConversationId: input.providerConversationId,
          providerMessageId: input.providerMessageId,
          status: "sent",
          updatedAt: now
        },
        where: { tenantId_internalMessageId_provider: { internalMessageId: input.internalMessageId, provider: input.provider, tenantId: input.tenantId } }
      });
    }
  };
}

export function createPrismaChannelDeliveryReceiptStore(client: PrismaChannelDeliveryReceiptClient): ChannelDeliveryReceiptStore {
  return {
    async listDeliveryReceipts(query: ChannelDeliveryReceiptListQuery = {}): Promise<ChannelDeliveryReceipt[]> {
      const rows = await client.channelDeliveryReceipt.findMany({
        orderBy: { receivedAt: "asc" },
        where: {
          ...(query.channel ? { channel: query.channel } : {}),
          ...(query.messageId ? { messageId: query.messageId } : {}),
          ...(query.tenantId ? { tenantId: query.tenantId } : {})
        }
      });

      return rows.map(toChannelDeliveryReceipt);
    },
    async recordDeliveryReceipt(receipt: ChannelDeliveryReceipt): Promise<ChannelDeliveryReceipt> {
      const existing = await client.channelDeliveryReceipt.findUnique({
        where: {
          provider_providerEventId: {
            provider: receipt.provider,
            providerEventId: receipt.providerEventId
          }
        }
      });
      if (existing) {
        return toChannelDeliveryReceipt(existing);
      }

      try {
        const row = await client.channelDeliveryReceipt.create({
          data: {
            channel: receipt.channel,
            conversationId: receipt.conversationId,
            id: receipt.id,
            idempotencyKey: receipt.idempotencyKey,
            messageId: receipt.messageId,
            payload: receipt.payload ?? null,
            provider: receipt.provider,
            providerEventId: receipt.providerEventId,
            receivedAt: new Date(receipt.receivedAt),
            status: receipt.status,
            tenantId: receipt.tenantId,
            traceId: receipt.traceId
          }
        });

        return toChannelDeliveryReceipt(row);
      } catch (error) {
        if (!isPrismaUniqueConstraintError(error)) {
          throw error;
        }

        const raced = await client.channelDeliveryReceipt.findUnique({
          where: {
            provider_providerEventId: {
              provider: receipt.provider,
              providerEventId: receipt.providerEventId
            }
          }
        });
        if (!raced) {
          throw error;
        }

        return toChannelDeliveryReceipt(raced);
      }
    }
  };
}

async function updateOutboxEvent(
  client: PrismaOutboxClient,
  id: string,
  data: Partial<PrismaOutboxEventCreateInput>,
  incrementAttempts = false
): Promise<StoredOutboxEvent> {
  if (!client.outboxEvent.update) {
    throw new Error("Prisma outbox client does not support updating events.");
  }

  const row = await client.outboxEvent.update({
    data: {
      ...data,
      ...(incrementAttempts ? { attempts: { increment: 1 } as unknown as number } : {})
    },
    where: { id }
  });

  return toStoredOutboxEvent(row);
}

async function updateBillingSyncJob(
  client: PrismaBillingSyncJobClient,
  id: string,
  data: Partial<PrismaBillingSyncJobUpdateData>,
  incrementAttempts = false
): Promise<StoredBillingSyncJob> {
  if (!client.billingSyncJob.update) {
    throw new Error("Prisma billing sync job client does not support updating jobs.");
  }

  const row = await client.billingSyncJob.update({
    data: {
      ...data,
      ...(incrementAttempts ? { attempts: { increment: 1 } } : {})
    },
    where: { id }
  });

  return toStoredBillingSyncJob(row);
}

function toStoredOutboxEvent(row: PrismaOutboxEventRow): StoredOutboxEvent {
  return {
    aggregateId: row.aggregateId,
    aggregateType: row.aggregateType,
    attempts: row.attempts ?? 0,
    deadLetteredAt: row.deadLetteredAt?.toISOString() ?? null,
    deadLetterReplayAuditEvents: toJsonArray(row.deadLetterReplayAuditEvents),
    id: row.id,
    lastError: row.lastError ?? null,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    occurredAt: row.occurredAt.toISOString(),
    payload: row.payload,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    queue: row.queue,
    status: row.status as StoredOutboxEvent["status"],
    traceId: row.traceId,
    type: row.type
  };
}

function normalizeBillingSyncJob(job: StoredBillingSyncJob): StoredBillingSyncJob {
  return {
    ...job,
    attempts: job.attempts ?? 0,
    deadLetteredAt: job.deadLetteredAt ?? null,
    deadLetterReplayAuditEvents: job.deadLetterReplayAuditEvents ?? [],
    lastError: job.lastError ?? null,
    lockedAt: job.lockedAt ?? null,
    nextAttemptAt: job.nextAttemptAt ?? null,
    payload: toJsonRecord(job.payload),
    publishedAt: job.publishedAt ?? null,
    status: billingSyncJobStatusFromRow(job.status)
  };
}

function toStoredBillingSyncJob(row: PrismaBillingSyncJobRow): StoredBillingSyncJob {
  return {
    actor: row.actor,
    actorName: row.actorName,
    attempts: row.attempts ?? 0,
    auditEventId: row.auditEventId,
    createdAt: toIso(row.createdAt),
    deadLetteredAt: row.deadLetteredAt ? toIso(row.deadLetteredAt) : null,
    deadLetterReplayAuditEvents: toJsonArray(row.deadLetterReplayAuditEvents),
    fromPlanId: row.fromPlanId,
    id: row.id,
    lastError: row.lastError ?? null,
    lockedAt: row.lockedAt ? toIso(row.lockedAt) : null,
    nextAttemptAt: row.nextAttemptAt ? toIso(row.nextAttemptAt) : null,
    payload: toJsonRecord(row.payload),
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : null,
    queue: row.queue,
    reason: row.reason,
    status: billingSyncJobStatusFromRow(row.status),
    tenantId: row.tenantId,
    toPlanId: row.toPlanId,
    traceId: row.traceId
  };
}

function billingSyncJobStatusFromRow(status: string): StoredBillingSyncJobStatus {
  return status === "dead_lettered" || status === "published" || status === "failed" || status === "pending" || status === "publishing" ? status : "pending";
}

function toWorkerConversationOutboundDescriptor(row: PrismaConversationOutboundDescriptorRow): WorkerConversationOutboundDescriptor {
  return {
    channel: row.channel,
    conversationId: row.conversationId,
    id: row.id,
    idempotencyKey: row.idempotencyKey ?? null,
    kind: row.kind as ConversationOutboundDescriptorKind,
    messageId: row.messageId,
    payload: toJsonRecord(row.payload),
    tenantId: row.tenantId
  };
}

function toChannelDeliveryReceipt(row: PrismaChannelDeliveryReceiptRow): ChannelDeliveryReceipt {
  return {
    channel: row.channel,
    conversationId: row.conversationId,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    messageId: row.messageId,
    payload: row.payload === null || row.payload === undefined ? null : toJsonRecord(row.payload),
    provider: row.provider,
    providerEventId: row.providerEventId,
    receivedAt: toIso(row.receivedAt),
    status: row.status,
    tenantId: row.tenantId,
    traceId: row.traceId
  };
}

function outboxSummaryTimestamp(event: StoredOutboxEvent): string {
  return event.publishedAt
    ?? event.deadLetteredAt
    ?? event.lockedAt
    ?? event.nextAttemptAt
    ?? event.occurredAt;
}

function billingSyncSummaryTimestamp(job: StoredBillingSyncJob): string {
  return job.publishedAt
    ?? job.deadLetteredAt
    ?? job.lockedAt
    ?? job.nextAttemptAt
    ?? job.createdAt;
}

function uniqueById<TItem extends { id: string }>(items: TItem[]): TItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function latestByTimestamp<T>(items: T[], timestamp: (item: T) => string): T | null {
  return [...items].sort((left, right) => compareTimestampStrings(timestamp(right), timestamp(left)))[0] ?? null;
}

function compareTimestampStrings(leftTimestamp: string, rightTimestamp: string): number {
  const leftTime = Date.parse(leftTimestamp);
  const rightTime = Date.parse(rightTimestamp);

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return leftTimestamp.localeCompare(rightTimestamp);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "P2002";
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function toJsonArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item))
    : [];
}

function appendAuditEvent(events: Array<Record<string, unknown>> | undefined, event: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  return event ? [...events ?? [], event] : events ?? [];
}

function formatFailureError(error: Error | string): string {
  return redactSensitiveText(typeof error === "string" ? error : error.message);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
