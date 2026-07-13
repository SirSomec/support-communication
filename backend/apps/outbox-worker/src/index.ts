import { Worker as BullMqWorker } from "bullmq";
import {
  OutboxPublisher,
  OutboxWorker,
  type OutboxEventStore,
  type OutboxWorkerRunResult,
  type StoredOutboxEvent
} from "@support-communication/events";
import { type BillingSyncJobStore, type StoredBillingSyncJob } from "@support-communication/database";
import { type LogContext, writeStructuredLog } from "@support-communication/observability";
import { createIntegrationTelegramTokenResolver, type TelegramBotTokenResolver } from "./integration-telegram-store.js";
import type { ProviderAttachmentTransferStore } from "./provider-attachment-transfer-store.js";

export type OutboxEventHandler = (event: StoredOutboxEvent) => Promise<void> | void;
export type BillingSyncJobHandler = (job: StoredBillingSyncJob) => Promise<void> | void;
export type WorkerLogWriter = (level: "debug" | "info" | "warn" | "error", message: string, context: LogContext) => string | void;
export type BullMqRunOnce = () => Promise<OutboxWorkerRunResult> | OutboxWorkerRunResult;
export type BullMqWorkerInstance = { close(): Promise<void> };
export type WorkerHandlerRegistrations<THandler> = Iterable<readonly [string, THandler]> | Record<string, THandler>;
export type WorkerHttpResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  arrayBuffer?(): Promise<ArrayBuffer>;
};
export interface WorkerHttpRequestInit {
  body?: string | Uint8Array;
  headers: Record<string, string>;
  method: "GET" | "POST";
  signal?: AbortSignal;
}
export type WorkerHttpFetch = (url: string, init: WorkerHttpRequestInit) => Promise<WorkerHttpResponse> | WorkerHttpResponse;
export type BullMqWorkerConstructor = new (
  queueName: string,
  processor: (job: { id?: string; name?: string }) => Promise<OutboxWorkerRunResult>,
  options: { concurrency: number; connection: RedisConnectionSettings }
) => BullMqWorkerInstance;

export interface BillingSyncProviderRequest {
  eventType: string;
  fromPlanId: string;
  idempotencyKey: string;
  jobId: string;
  payload: Record<string, unknown>;
  provider: string;
  queue: string;
  reason: string;
  tenantId: string;
  toPlanId: string;
  traceId: string;
}

export interface BillingSyncProvider {
  syncBillingJob(request: BillingSyncProviderRequest): Promise<void> | void;
}

export interface ChannelConnectorRequest {
  attachments?: Array<Record<string, unknown>>;
  channel: string;
  channelConnectionId?: string;
  descriptorId: string;
  idempotencyKey: string;
  outboxEventId: string;
  traceId: string;
  clientName?: string;
  conversationId?: string;
  message?: string;
  messageId?: string;
  phone?: string;
  replyMarkup?: Record<string, unknown>;
  tenantId?: string;
  text?: string;
  topic?: string;
}

export interface ChannelConnector {
  deliverMessage(request: ChannelConnectorRequest): Promise<ChannelConnectorDeliveryResult | void> | ChannelConnectorDeliveryResult | void;
  startConversation(request: ChannelConnectorRequest): Promise<ChannelConnectorDeliveryResult | void> | ChannelConnectorDeliveryResult | void;
}

export interface ChannelConnectorDeliveryResult { providerMessageId: string; }

export interface AttachmentScanRequest {
  channel: string;
  checksum?: string;
  descriptorId: string;
  fileId: string;
  fileName: string;
  idempotencyKey: string;
  mimeType?: string;
  outboxEventId: string;
  signedFile?: SignedAttachmentFileAccess;
  sizeBytes: number;
  traceId: string;
}

export interface SignedAttachmentFileAccess {
  expiresAt: string;
  headers?: Record<string, string>;
  method: "GET";
  url: string;
}

export interface FileScanner {
  queueAttachmentScan(request: AttachmentScanRequest): Promise<void> | void;
}

export interface AttachmentScanResult {
  checkedAt?: string;
  reason?: string;
  scanner?: string;
  verdict: string;
}

export interface AttachmentScanner {
  scanAttachment(request: AttachmentScanRequest): AttachmentScanResult | void | Promise<AttachmentScanResult | void>;
}

export interface FileScanCallbackRequest extends AttachmentScanResult {
  fileId: string;
  idempotencyKey: string;
  traceId: string;
}

export interface FileScanResultCallback {
  recordScanResult(request: FileScanCallbackRequest): Promise<void> | void;
}

export interface DeterministicAttachmentScannerOptions {
  onScan?: (request: AttachmentScanRequest) => void;
  result?: AttachmentScanResult;
}

export type WorkerOutboundDescriptorKind = "attachment_upload" | "message_delivery" | "outbound_conversation";

export interface WorkerOutboundDescriptor {
  channel: string;
  conversationId: string | null;
  id: string;
  idempotencyKey?: string | null;
  kind: WorkerOutboundDescriptorKind;
  messageId: string | null;
  payload: Record<string, unknown>;
  tenantId: string;
}

export interface OutboundDescriptorStore {
  findOutboundDescriptorById(descriptorId: string): Promise<WorkerOutboundDescriptor | null | undefined> | WorkerOutboundDescriptor | null | undefined;
  markOutboundDescriptorDelivery?(descriptorId: string, deliveryState: "delivered" | "failed"): Promise<WorkerOutboundDescriptor | null | undefined> | WorkerOutboundDescriptor | null | undefined;
  recordProviderMessageBinding?(input: { channelConnectionId: string; conversationId: string; internalMessageId: string; provider: string; providerConversationId: string; providerMessageId: string; tenantId: string }): Promise<void> | void;
}

export interface WorkerHandlerRegistryOptions {
  billingSyncProvider?: BillingSyncProvider;
  channelConnectors?: Record<string, ChannelConnector>;
  fileScanner?: FileScanner;
  outboundDescriptorStore?: OutboundDescriptorStore;
  writeLog?: WorkerLogWriter;
}

export interface HttpWorkerAdapters {
  channelConnectors: Record<string, ChannelConnector>;
  fileScanner?: FileScanner;
  fileScanResultCallback?: FileScanResultCallback;
  scanner?: AttachmentScanner;
}

export interface TelegramRuntimeConnectorConfig {
  apiBaseUrl: string;
  botToken: string;
  channel: string;
  enabled: boolean;
}

export interface EndpointRuntimeConnectorConfig {
  channel: string;
  enabled: boolean;
  endpoint: string;
}

export interface AttachmentScannerRuntimeConfig extends EndpointRuntimeConnectorConfig {
  bearerToken?: string;
  localVerdict: string;
  providerMode: "http" | "local";
}

export interface TelegramChannelConnectorOptions {
  endpoint: string;
  fetcher: WorkerHttpFetch;
  timeoutMs?: number;
}

export interface TenantTelegramChannelConnectorOptions {
  apiBaseUrl: string;
  channel: string;
  fetcher: WorkerHttpFetch;
  resolveBotToken: TelegramBotTokenResolver["resolveBotToken"];
  timeoutMs?: number;
}

export interface ProviderChannelConnectorOptions {
  endpoint: string;
  fetcher: WorkerHttpFetch;
  timeoutMs?: number;
}

export interface RuntimeOutboxHandlerOptions {
  env?: Record<string, string | undefined>;
  fetcher?: WorkerHttpFetch;
  outboundDescriptorStore?: OutboundDescriptorStore;
  providerCredentialResolver?: ProviderConnectionCredentialResolver;
  providerAttachmentTransferStore?: ProviderAttachmentTransferStore;
  telegramBotTokenResolver?: TelegramBotTokenResolver;
  writeLog?: WorkerLogWriter;
}

export interface RuntimeBillingSyncHandlerOptions {
  env?: Record<string, string | undefined>;
  fetcher?: WorkerHttpFetch;
  writeLog?: WorkerLogWriter;
}

export interface RedisConnectionSettings {
  db?: number;
  host: string;
  password?: string;
  port: number;
  username?: string;
}

export interface BullMqWorkerConfig {
  concurrency: number;
  connection: RedisConnectionSettings;
  queueName: string;
}

export interface CreateBullMqWorkerBridgeInput extends BullMqWorkerConfig {
  runOnce: BullMqRunOnce;
  service: string;
  Worker?: BullMqWorkerConstructor;
  writeLog?: WorkerLogWriter;
}

export interface OutboxWorkerConfig {
  intervalMs: number;
  leaseTimeoutMs: number;
  limit: number;
  maxAttempts: number;
  once: boolean;
  queue?: string;
  retryBackoffMs: number;
}

export interface RunOutboxWorkerInput extends Partial<OutboxWorkerConfig> {
  handlers: Record<string, OutboxEventHandler>;
  store: OutboxEventStore;
  sleep?: (milliseconds: number) => Promise<void> | void;
}

export interface RunBillingSyncWorkerInput extends Partial<OutboxWorkerConfig> {
  handlers: Record<string, BillingSyncJobHandler>;
  store: BillingSyncJobStore;
  sleep?: (milliseconds: number) => Promise<void> | void;
}

export interface ClaimFileScanDescriptorsInput {
  leaseTimeoutMs?: number;
  limit?: number;
  now?: Date;
  queue?: string;
  store: OutboxEventStore;
}

export interface RunFileScanScannerClaimWorkerInput extends Partial<OutboxWorkerConfig> {
  now?: Date;
  store: OutboxEventStore;
}

export interface RunFileScanScannerWorkerInput extends RunFileScanScannerClaimWorkerInput {
  maxIterations?: number;
  scanResultCallback?: FileScanResultCallback;
  sleep?: (milliseconds: number) => Promise<void> | void;
  outboundDescriptorStore: OutboundDescriptorStore;
  scanner: AttachmentScanner;
}

export interface RunRuntimeFileScanScannerWorkerInput extends Partial<OutboxWorkerConfig> {
  env?: Record<string, string | undefined>;
  fetcher?: WorkerHttpFetch;
  maxIterations?: number;
  now?: Date;
  outboundDescriptorStore: OutboundDescriptorStore;
  sleep?: (milliseconds: number) => Promise<void> | void;
  store: OutboxEventStore;
}

export interface ExecuteClaimedFileScanDescriptorInput {
  event: StoredOutboxEvent;
  outboundDescriptorStore: OutboundDescriptorStore;
  scanner: AttachmentScanner;
}

export interface DeadLetterReplayQueueItem {
  attempts: number;
  deadLetteredAt: string | null;
  id: string;
  queue: string;
  status: string;
}

export interface DeadLetterReplayStore<TItem extends DeadLetterReplayQueueItem> {
  replayDeadLettered(id: string, queue: string, reason: string, replayedAt?: Date, auditEvent?: DeadLetterReplayAuditEvent): Promise<TItem>;
}

export interface DeadLetterReplayAuditEvent {
  action: "worker.dead_letter.replay";
  at: string;
  id: string;
  immutable: true;
  queue: string;
  reason: string;
  result: "requeued";
  target: string;
}

export interface ReplayDeadLetteredQueueItemInput<TItem extends DeadLetterReplayQueueItem> {
  id: string;
  now?: Date;
  queue: string;
  reason: string;
  store: DeadLetterReplayStore<TItem>;
}

export interface WorkerHandlerRegistry<THandler> {
  register(key: string, handler: THandler): WorkerHandlerRegistry<THandler>;
  registerMany(registrations: WorkerHandlerRegistrations<THandler>): WorkerHandlerRegistry<THandler>;
  resolve(key: string): THandler | undefined;
  resolveFirst(keys: string[]): { handler: THandler; key: string } | undefined;
  toRecord(): Record<string, THandler>;
}

export function createWorkerHandlerRegistry<THandler>(registrations: WorkerHandlerRegistrations<THandler> = []): WorkerHandlerRegistry<THandler> {
  const handlers = Object.create(null) as Record<string, THandler>;
  const registry: WorkerHandlerRegistry<THandler> = {
    register(key, handler) {
      const normalizedKey = stringValue(key);
      if (!normalizedKey) {
        throw new Error("worker_handler_key_required");
      }

      if (typeof handler !== "function") {
        throw new Error(`worker_handler_invalid:${normalizedKey}`);
      }

      handlers[normalizedKey] = handler;
      return registry;
    },
    registerMany(input) {
      for (const [key, handler] of workerHandlerEntries(input)) {
        registry.register(key, handler);
      }

      return registry;
    },
    resolve(key) {
      if (!Object.prototype.hasOwnProperty.call(handlers, key)) {
        return undefined;
      }

      const handler = handlers[key];
      return typeof handler === "function" ? handler : undefined;
    },
    resolveFirst(keys) {
      for (const key of keys) {
        const handler = registry.resolve(key);
        if (handler) {
          return { handler, key };
        }
      }

      return undefined;
    },
    toRecord() {
      return Object.assign(Object.create(null), handlers) as Record<string, THandler>;
    }
  };

  return registry.registerMany(registrations);
}

export async function replayDeadLetteredQueueItem<TItem extends DeadLetterReplayQueueItem>({
  id,
  now = new Date(),
  queue,
  reason,
  store
}: ReplayDeadLetteredQueueItemInput<TItem>): Promise<TItem> {
  const normalizedId = requireString(id, "dead_letter_item_id_required");
  const normalizedQueue = requireString(queue, "dead_letter_queue_required");
  const normalizedReason = requireString(reason, "dead_letter_replay_reason_required");
  const auditEvent: DeadLetterReplayAuditEvent = {
    action: "worker.dead_letter.replay",
    at: now.toISOString(),
    id: `evt_dead_letter_replay_${normalizedId}_${now.getTime()}`,
    immutable: true,
    queue: normalizedQueue,
    reason: normalizedReason,
    result: "requeued",
    target: normalizedId
  };
  return store.replayDeadLettered(normalizedId, normalizedQueue, normalizedReason, now, auditEvent);
}

export function claimFileScanDescriptors({
  leaseTimeoutMs,
  limit,
  now,
  queue,
  store
}: ClaimFileScanDescriptorsInput): Promise<StoredOutboxEvent[]> {
  return store.claimPending({
    leaseTimeoutMs,
    limit,
    now,
    queue: queue ?? "file-scan"
  });
}

export async function runFileScanScannerClaimWorker(input: RunFileScanScannerClaimWorkerInput): Promise<OutboxWorkerRunResult> {
  const config = normalizeRunConfig(input);
  const claimed = await claimFileScanDescriptors({
    leaseTimeoutMs: config.leaseTimeoutMs,
    limit: config.limit,
    now: input.now,
    queue: config.queue,
    store: input.store
  });

  return {
    failed: 0,
    iterations: 1,
    published: 0,
    scanned: claimed.length,
    stopped: false
  };
}

export async function runFileScanScannerWorker(input: RunFileScanScannerWorkerInput): Promise<OutboxWorkerRunResult> {
  const config = normalizeRunConfig({ ...input, once: input.once ?? true });
  const maxIterations = positiveOptionalInteger(input.maxIterations);
  const result: OutboxWorkerRunResult = {
    failed: 0,
    iterations: 0,
    published: 0,
    scanned: 0,
    stopped: false
  };

  while (config.once ? result.iterations < 1 : maxIterations ? result.iterations < maxIterations : true) {
    const claimed = await claimFileScanDescriptors({
      leaseTimeoutMs: config.leaseTimeoutMs,
      limit: config.limit,
      now: input.now,
      queue: config.queue,
      store: input.store
    });
    let published = 0;
    let failed = 0;

    for (const event of claimed) {
      try {
        const callback = await executeClaimedFileScanDescriptor({
          event,
          outboundDescriptorStore: input.outboundDescriptorStore,
          scanner: input.scanner
        });
        if (callback && input.scanResultCallback) {
          await input.scanResultCallback.recordScanResult(callback);
          await input.store.markPublished(event.id);
          published += 1;
        }
      } catch (error) {
        await input.store.markFailed(event.id, error instanceof Error ? error : String(error), input.now ?? new Date(), {
          currentAttempts: event.attempts,
          maxAttempts: config.maxAttempts,
          retryBackoffMs: config.retryBackoffMs
        });
        failed += 1;
      }
    }

    result.failed += failed;
    result.published += published;
    result.scanned += claimed.length;
    result.iterations += 1;

    if (config.once || (maxIterations && result.iterations >= maxIterations)) {
      break;
    }

    await Promise.resolve((input.sleep ?? defaultSleep)(config.intervalMs));
  }

  return result;
}

export function runRuntimeFileScanScannerWorker({
  env = process.env,
  fetcher = defaultWorkerHttpFetch,
  outboundDescriptorStore,
  store,
  ...config
}: RunRuntimeFileScanScannerWorkerInput): Promise<OutboxWorkerRunResult> {
  const adapters = createHttpWorkerAdaptersFromEnv(env, fetcher);
  if (!adapters.scanner) {
    throw new Error("file_scan_scanner_not_configured");
  }
  if (!adapters.fileScanResultCallback) {
    throw new Error("file_scan_result_callback_not_configured");
  }

  return runFileScanScannerWorker({
    ...config,
    outboundDescriptorStore,
    scanResultCallback: adapters.fileScanResultCallback,
    scanner: adapters.scanner,
    store
  });
}

export async function executeClaimedFileScanDescriptor({
  event,
  outboundDescriptorStore,
  scanner
}: ExecuteClaimedFileScanDescriptorInput): Promise<FileScanCallbackRequest | undefined> {
  const descriptor = await loadOutboundDescriptor(event, outboundDescriptorStore);
  requireDescriptorKind(descriptor, "attachment_upload");
  const request = toAttachmentScanRequest(event, descriptor);
  const result = await scanner.scanAttachment(request);
  if (!result) {
    return undefined;
  }

  return {
    ...result,
    fileId: request.fileId,
    idempotencyKey: request.idempotencyKey,
    traceId: request.traceId,
    verdict: requireString(result.verdict, "scan_verdict_required")
  };
}

export function createDeterministicAttachmentScanner({
  onScan,
  result
}: DeterministicAttachmentScannerOptions = {}): AttachmentScanner {
  return {
    scanAttachment(request: AttachmentScanRequest): AttachmentScanResult | undefined {
      onScan?.(request);
      return result;
    }
  };
}

export function createOutboxDispatcher(handlers: Record<string, OutboxEventHandler>) {
  const registry = createWorkerHandlerRegistry(handlers);
  return async (event: StoredOutboxEvent): Promise<void> => {
    const handler = registry.resolve(event.type);
    if (!handler) {
      throw new Error(`No outbox handler registered for ${event.type}.`);
    }

    await handler(event);
  };
}

export function createBillingSyncDispatcher(handlers: Record<string, BillingSyncJobHandler>) {
  const registry = createWorkerHandlerRegistry(handlers);
  return async (job: StoredBillingSyncJob): Promise<void> => {
    const handlerKey = billingSyncHandlerKey(job);
    const fallbackKeys = billingSyncHandlerFallbackKeys(job);
    const resolved = registry.resolveFirst([handlerKey, ...fallbackKeys]);
    if (!resolved) {
      throw new Error(`No billing sync handler registered for ${handlerKey}.`);
    }

    await resolved.handler(job);
  };
}

export function createDefaultOutboxHandlers({
  channelConnectors,
  fileScanner,
  outboundDescriptorStore,
  writeLog = writeStructuredLog
}: WorkerHandlerRegistryOptions = {}): Record<string, OutboxEventHandler> {
  const registry = createWorkerHandlerRegistry<OutboxEventHandler>([
    "attachment.upload.requested",
    "billing.tenant.plan_changed",
    "conversation.outbound.requested",
    "message.delivery.requested",
    "service_admin.login",
    "service_admin.logout",
    "tenant.status.changed"
  ].map((type): [string, OutboxEventHandler] => [type, createLoggingOutboxHandler(writeLog)]));

  if (outboundDescriptorStore && channelConnectors) {
    registry.registerMany(createExternalChannelOutboxHandlers({
      channelConnectors,
      outboundDescriptorStore,
      writeLog
    }));
  }

  if (outboundDescriptorStore && fileScanner) {
    registry.register("attachment.upload.requested", createAttachmentScanHandler(outboundDescriptorStore, fileScanner, writeLog));
  }

  return registry.toRecord();
}

export function createExternalChannelOutboxHandlers({
  channelConnectors,
  outboundDescriptorStore,
  writeLog = writeStructuredLog
}: Required<Pick<WorkerHandlerRegistryOptions, "channelConnectors" | "outboundDescriptorStore">> & Pick<WorkerHandlerRegistryOptions, "writeLog">): Record<string, OutboxEventHandler> {
  return {
    "conversation.outbound.requested": createChannelConnectorHandler("startConversation", "outbound_conversation", outboundDescriptorStore, channelConnectors, writeLog),
    "message.delivery.requested": createChannelConnectorHandler("deliverMessage", "message_delivery", outboundDescriptorStore, channelConnectors, writeLog)
  };
}

export function createHttpWorkerAdaptersFromEnv(
  env: Record<string, string | undefined> = process.env,
  fetcher: WorkerHttpFetch = defaultWorkerHttpFetch,
  telegramBotTokenResolver?: TelegramBotTokenResolver,
  providerCredentialResolver?: ProviderConnectionCredentialResolver,
  providerAttachmentTransferStore?: ProviderAttachmentTransferStore
): HttpWorkerAdapters {
  const timeoutMs = positiveInteger(env.OUTBOX_HTTP_TIMEOUT_MS, 5_000);
  const channelConnectors = Object.fromEntries(parseEndpointMap(env.OUTBOX_CHANNEL_CONNECTORS)
    .map(([channel, endpoint]) => [channel, createHttpChannelConnector(endpoint, fetcher, timeoutMs)]));
  channelConnectors.SDK ??= {
    deliverMessage: async () => undefined,
    startConversation: async () => undefined
  };
  const telegramConfig = loadTelegramRuntimeConnectorConfig(env);
  if (telegramConfig.enabled) {
    const tokenResolver = telegramBotTokenResolver ?? createIntegrationTelegramTokenResolver(
      stringValue(env.INTEGRATION_STORE_FILE),
      telegramConfig.botToken
    );
    channelConnectors[telegramConfig.channel] = createTenantTelegramChannelConnector({
      apiBaseUrl: telegramConfig.apiBaseUrl,
      channel: telegramConfig.channel,
      fetcher,
      resolveBotToken: tokenResolver.resolveBotToken,
      timeoutMs
    });
  }
  const vkConfig = loadVkRuntimeConnectorConfig(env);
  if (vkConfig.enabled) {
    channelConnectors[vkConfig.channel] = providerCredentialResolver
      ? createTenantVkChannelConnector({ apiBaseUrl: vkConfig.endpoint, fetcher, providerAttachmentTransferStore, resolveCredential: providerCredentialResolver.resolve, timeoutMs })
      : createVkChannelConnector({ endpoint: vkConfig.endpoint, fetcher, timeoutMs });
  }
  const maxConfig = loadMaxRuntimeConnectorConfig(env);
  if (maxConfig.enabled) {
    channelConnectors[maxConfig.channel] = providerCredentialResolver
      ? createTenantMaxChannelConnector({ apiBaseUrl: maxConfig.endpoint, fetcher, providerAttachmentTransferStore, resolveCredential: providerCredentialResolver.resolve, timeoutMs })
      : createMaxChannelConnector({ endpoint: maxConfig.endpoint, fetcher, timeoutMs });
  }
  const scannerConfig = loadAttachmentScannerRuntimeConfig(env);
  const fileScannerUrl = stringValue(env.OUTBOX_FILE_SCAN_URL);
  const fileScanResultBaseUrl = stringValue(env.OUTBOX_FILE_SCAN_RESULT_BASE_URL);

  return {
    channelConnectors,
    ...(fileScannerUrl ? { fileScanner: createHttpFileScanner(fileScannerUrl, fetcher, timeoutMs) } : {}),
    ...(fileScanResultBaseUrl ? {
      fileScanResultCallback: createHttpFileScanResultCallback({
        baseUrl: fileScanResultBaseUrl,
        bearerToken: requireString(env.OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN, "file_scan_result_bearer_token_required"),
        fetcher,
        timeoutMs
      })
    } : {}),
    ...(scannerConfig.enabled ? { scanner: createRuntimeAttachmentScanner(scannerConfig, fetcher, timeoutMs) } : {})
  };
}

export function loadTelegramRuntimeConnectorConfig(env: Record<string, string | undefined> = process.env): TelegramRuntimeConnectorConfig {
  const enabled = env.OUTBOX_TELEGRAM_ENABLED === "true";
  return {
    apiBaseUrl: stringValue(env.OUTBOX_TELEGRAM_API_BASE_URL) || "https://api.telegram.org",
    botToken: stringValue(env.OUTBOX_TELEGRAM_BOT_TOKEN),
    channel: stringValue(env.OUTBOX_TELEGRAM_CHANNEL) || "Telegram",
    enabled
  };
}

export function loadVkRuntimeConnectorConfig(env: Record<string, string | undefined> = process.env): EndpointRuntimeConnectorConfig {
  const enabled = env.OUTBOX_VK_ENABLED === "true";
  return {
    channel: stringValue(env.OUTBOX_VK_CHANNEL) || "VK",
    enabled,
    endpoint: enabled ? requireString(env.OUTBOX_VK_ENDPOINT, "vk_endpoint_required") : stringValue(env.OUTBOX_VK_ENDPOINT)
  };
}

export function loadMaxRuntimeConnectorConfig(env: Record<string, string | undefined> = process.env): EndpointRuntimeConnectorConfig {
  const enabled = env.OUTBOX_MAX_ENABLED === "true";
  return {
    channel: stringValue(env.OUTBOX_MAX_CHANNEL) || "MAX",
    enabled,
    endpoint: enabled ? requireString(env.OUTBOX_MAX_ENDPOINT, "max_endpoint_required") : stringValue(env.OUTBOX_MAX_ENDPOINT)
  };
}

export function loadAttachmentScannerRuntimeConfig(env: Record<string, string | undefined> = process.env): AttachmentScannerRuntimeConfig {
  const enabled = env.OUTBOX_SCANNER_ENABLED === "true";
  const providerMode = scannerProviderMode(env.OUTBOX_SCANNER_PROVIDER_MODE);
  const localVerdict = stringValue(env.OUTBOX_SCANNER_LOCAL_VERDICT) || "clean";
  return {
    ...(stringValue(env.OUTBOX_SCANNER_BEARER_TOKEN) ? { bearerToken: stringValue(env.OUTBOX_SCANNER_BEARER_TOKEN) } : {}),
    channel: "attachments",
    enabled,
    endpoint: providerMode === "http" && enabled
      ? requireString(env.OUTBOX_SCANNER_URL, "scanner_endpoint_required")
      : stringValue(env.OUTBOX_SCANNER_URL),
    localVerdict,
    providerMode
  };
}

export function createRuntimeOutboxHandlers({
  env = process.env,
  fetcher = defaultWorkerHttpFetch,
  outboundDescriptorStore,
  providerAttachmentTransferStore,
  providerCredentialResolver,
  telegramBotTokenResolver,
  writeLog = writeStructuredLog
}: RuntimeOutboxHandlerOptions = {}): Record<string, OutboxEventHandler> {
  const adapters = createHttpWorkerAdaptersFromEnv(env, fetcher, telegramBotTokenResolver, providerCredentialResolver, providerAttachmentTransferStore);
  if (!outboundDescriptorStore) {
    return createDefaultOutboxHandlers({ writeLog });
  }

  return createDefaultOutboxHandlers({
    channelConnectors: adapters.channelConnectors,
    fileScanner: adapters.fileScanner ?? createMissingFileScanner(),
    outboundDescriptorStore,
    writeLog
  });
}

export function createDefaultBillingSyncHandlers({
  billingSyncProvider,
  writeLog = writeStructuredLog
}: WorkerHandlerRegistryOptions = {}): Record<string, BillingSyncJobHandler> {
  const createHandler = billingSyncProvider
    ? (eventType: string): BillingSyncJobHandler => createBillingSyncProviderHandler(`*.${eventType}`, billingSyncProvider, writeLog)
    : (eventType: string): BillingSyncJobHandler => createLoggingBillingSyncHandler(`*.${eventType}`, writeLog);
  return createWorkerHandlerRegistry<BillingSyncJobHandler>([
    "billing.tenant.plan_changed",
    "customer.subscription.updated",
    "invoice.created",
    "invoice.paid",
    "invoice.payment_failed",
    "invoice.payment_succeeded",
    "subscription.updated"
  ].map((eventType): [string, BillingSyncJobHandler] => [`*.${eventType}`, createHandler(eventType)])).toRecord();
}

export function createRuntimeBillingSyncHandlers({
  env = process.env,
  fetcher = defaultWorkerHttpFetch,
  writeLog = writeStructuredLog
}: RuntimeBillingSyncHandlerOptions = {}): Record<string, BillingSyncJobHandler> {
  return createDefaultBillingSyncHandlers({
    billingSyncProvider: createBillingSyncProviderFromEnv(env, fetcher),
    writeLog
  });
}

export function createBullMqWorkerBridge({
  concurrency,
  connection,
  queueName,
  runOnce,
  service,
  Worker = BullMqWorker as unknown as BullMqWorkerConstructor,
  writeLog = writeStructuredLog
}: CreateBullMqWorkerBridgeInput): BullMqWorkerInstance {
  return new Worker(queueName, async (job) => {
    writeLog("info", "BullMQ worker job started", {
      jobId: job.id ?? null,
      jobName: job.name ?? null,
      operation: "bullMqWorkerJob",
      queue: queueName,
      service
    });

    const result = await runOnce();

    writeLog("info", "BullMQ worker job completed", {
      failed: result.failed,
      jobId: job.id ?? null,
      jobName: job.name ?? null,
      operation: "bullMqWorkerJob",
      published: result.published,
      queue: queueName,
      scanned: result.scanned,
      service
    });

    return result;
  }, {
    concurrency,
    connection
  });
}

export async function runOutboxWorker(input: RunOutboxWorkerInput): Promise<OutboxWorkerRunResult> {
  const config = normalizeRunConfig(input);
  const publisher = new OutboxPublisher(input.store, createOutboxDispatcher(input.handlers));
  const worker = new OutboxWorker(publisher, {
    intervalMs: config.intervalMs,
    leaseTimeoutMs: config.leaseTimeoutMs,
    limit: config.limit,
    maxAttempts: config.maxAttempts,
    queue: config.queue,
    retryBackoffMs: config.retryBackoffMs,
    sleep: input.sleep
  });

  return worker.start({ maxIterations: config.once ? 1 : undefined });
}

export async function runBillingSyncWorker(input: RunBillingSyncWorkerInput): Promise<OutboxWorkerRunResult> {
  const config = normalizeRunConfig(input);
  const dispatch = createBillingSyncDispatcher(input.handlers);
  const result: OutboxWorkerRunResult = {
    failed: 0,
    iterations: 0,
    published: 0,
    scanned: 0,
    stopped: false
  };

  while (config.once ? result.iterations < 1 : true) {
    const pending = await input.store.claimPending({
      leaseTimeoutMs: config.leaseTimeoutMs,
      limit: config.limit,
      queue: config.queue
    });
    let failed = 0;
    let published = 0;

    for (const job of pending) {
      try {
        await dispatch(job);
        await input.store.markPublished(job.id);
        published += 1;
      } catch (error) {
        await input.store.markFailed(job.id, error instanceof Error ? error : String(error), new Date(), {
          currentAttempts: job.attempts,
          maxAttempts: config.maxAttempts,
          retryBackoffMs: config.retryBackoffMs
        });
        failed += 1;
      }
    }

    result.failed += failed;
    result.published += published;
    result.scanned += pending.length;
    result.iterations += 1;

    if (config.once) {
      break;
    }

    await Promise.resolve((input.sleep ?? defaultSleep)(config.intervalMs));
  }

  return result;
}

export function loadOutboxWorkerConfig(env: Record<string, string | undefined> = process.env, argv: string[] = process.argv.slice(2)): OutboxWorkerConfig {
  return {
    intervalMs: positiveInteger(env.OUTBOX_POLL_INTERVAL_MS, 1_000),
    leaseTimeoutMs: positiveInteger(env.OUTBOX_LEASE_TIMEOUT_MS, 300_000),
    limit: positiveInteger(env.OUTBOX_BATCH_SIZE, 100),
    maxAttempts: positiveInteger(env.OUTBOX_MAX_ATTEMPTS, 5),
    once: argv.includes("--once") || env.OUTBOX_ONCE === "true",
    retryBackoffMs: positiveInteger(env.OUTBOX_RETRY_BACKOFF_MS, 60_000),
    ...(env.OUTBOX_QUEUE ? { queue: env.OUTBOX_QUEUE } : {})
  };
}

export function loadBullMqWorkerConfig(env: Record<string, string | undefined> = process.env, queueNameFallback = "outbox-worker-poll"): BullMqWorkerConfig {
  return {
    concurrency: positiveInteger(env.OUTBOX_BULLMQ_CONCURRENCY, 1),
    connection: redisConnectionFromUrl(env.REDIS_URL ?? "redis://127.0.0.1:6379"),
    queueName: stringValue(env.OUTBOX_BULLMQ_QUEUE) || queueNameFallback
  };
}

function normalizeRunConfig(input: Partial<OutboxWorkerConfig>): OutboxWorkerConfig {
  return {
    intervalMs: input.intervalMs ?? 1_000,
    leaseTimeoutMs: input.leaseTimeoutMs ?? 300_000,
    limit: input.limit ?? 100,
    maxAttempts: input.maxAttempts ?? 5,
    once: input.once ?? false,
    retryBackoffMs: input.retryBackoffMs ?? 60_000,
    ...(input.queue ? { queue: input.queue } : {})
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveOptionalInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : undefined;
}

function scannerProviderMode(value: string | undefined): "http" | "local" {
  const normalized = stringValue(value) || "http";
  if (normalized === "http" || normalized === "local") {
    return normalized;
  }

  throw new Error("scanner_provider_mode_invalid");
}

function billingSyncHandlerKey(job: StoredBillingSyncJob): string {
  const eventType = stringValue(job.payload.eventType) || internalBillingSyncEventType(job) || job.reason;
  const provider = stringValue(job.payload.provider);
  return provider ? `${provider}.${eventType}` : eventType;
}

function billingSyncHandlerFallbackKeys(job: StoredBillingSyncJob): string[] {
  const eventType = stringValue(job.payload.eventType) || internalBillingSyncEventType(job) || job.reason;
  const provider = stringValue(job.payload.provider);
  return [
    ...(provider ? [`${provider}.*`] : []),
    `*.${eventType}`,
    "*"
  ];
}

function workerHandlerEntries<THandler>(registrations: WorkerHandlerRegistrations<THandler>): Array<[string, THandler]> {
  if (isIterableHandlerRegistrations(registrations)) {
    return Array.from(registrations, ([key, handler]) => [key, handler]);
  }

  return Object.entries(registrations) as Array<[string, THandler]>;
}

function isIterableHandlerRegistrations<THandler>(registrations: WorkerHandlerRegistrations<THandler>): registrations is Iterable<readonly [string, THandler]> {
  return typeof (registrations as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function";
}

function ownValue<TValue>(values: Record<string, TValue>, key: string): TValue | undefined {
  if (!Object.prototype.hasOwnProperty.call(values, key)) {
    return undefined;
  }

  return values[key];
}

function internalBillingSyncEventType(job: StoredBillingSyncJob): string {
  return stringValue(job.payload.fromPlanId) && stringValue(job.payload.toPlanId)
    ? "billing.tenant.plan_changed"
    : "";
}

function createChannelConnectorHandler(
  method: "deliverMessage" | "startConversation",
  expectedKind: WorkerOutboundDescriptorKind,
  descriptorStore: OutboundDescriptorStore,
  channelConnectors: Record<string, ChannelConnector>,
  writeLog: WorkerLogWriter
): OutboxEventHandler {
  return async (event) => {
    const descriptor = await loadOutboundDescriptor(event, descriptorStore);
    requireDescriptorKind(descriptor, expectedKind);
    const channel = requireString(descriptor.channel, "channel_required");
    const connector = ownValue(channelConnectors, channel);
    if (!connector) {
      throw new Error(`channel_connector_not_registered:${channel}`);
    }

    const request = method === "deliverMessage"
      ? toMessageDeliveryRequest(event, descriptor, channel)
      : toOutboundConversationRequest(event, descriptor, channel);

    try {
      const result = await connector[method](request);
      if (result?.providerMessageId && descriptorStore.recordProviderMessageBinding && descriptor.messageId) {
        await descriptorStore.recordProviderMessageBinding({
          channelConnectionId: requireString(request.channelConnectionId, "provider_channel_connection_id_required"),
          conversationId: requireString(descriptor.conversationId, "provider_conversation_record_id_required"),
          internalMessageId: descriptor.messageId,
          provider: channel.toLowerCase(),
          providerConversationId: requireString(request.conversationId, "provider_conversation_id_required"),
          providerMessageId: result.providerMessageId,
          tenantId: requireString(descriptor.tenantId, "provider_tenant_id_required")
        });
      }
    } catch (error) {
      await markOutboundDescriptorDelivery(descriptorStore, descriptor.id, "failed", writeLog, event);
      writeLog("error", "channel connector dispatch failed", {
        channel,
        descriptorId: descriptor.id,
        errorMessage: error instanceof Error ? error.message : String(error),
        eventId: event.id,
        operation: method,
        queue: event.queue,
        service: "outbox-worker",
        traceId: event.traceId,
        type: event.type
      });
      throw error;
    }

    await markOutboundDescriptorDelivery(descriptorStore, descriptor.id, "delivered", writeLog, event);

    writeLog("info", "channel connector dispatch completed", {
      channel,
      descriptorId: descriptor.id,
      eventId: event.id,
      operation: method,
      queue: event.queue,
      service: "outbox-worker",
      traceId: event.traceId,
      type: event.type
    });
  };
}

export interface ProviderConnectionCredential {
  accessToken: string;
  apiVersion?: string | null;
  externalAccountId: string;
}

export interface ProviderConnectionCredentialResolver {
  resolve(input: { channelConnectionId: string; provider: "max" | "vk"; tenantId: string }): Promise<ProviderConnectionCredential>;
}

export interface TenantProviderChannelConnectorOptions {
  apiBaseUrl: string;
  fetcher: WorkerHttpFetch;
  providerAttachmentTransferStore?: ProviderAttachmentTransferStore;
  resolveCredential: ProviderConnectionCredentialResolver["resolve"];
  timeoutMs?: number;
}

async function markOutboundDescriptorDelivery(
  descriptorStore: OutboundDescriptorStore,
  descriptorId: string,
  deliveryState: "delivered" | "failed",
  writeLog: WorkerLogWriter,
  event: StoredOutboxEvent
): Promise<void> {
  if (!descriptorStore.markOutboundDescriptorDelivery) {
    return;
  }

  try {
    await descriptorStore.markOutboundDescriptorDelivery(descriptorId, deliveryState);
  } catch (error) {
    writeLog("error", "outbound descriptor delivery state update failed", {
      deliveryState,
      descriptorId,
      errorMessage: error instanceof Error ? error.message : String(error),
      eventId: event.id,
      operation: "updateDeliveryState",
      queue: event.queue,
      service: "outbox-worker",
      traceId: event.traceId,
      type: event.type
    });
    if (deliveryState === "delivered") {
      throw error;
    }
  }
}

function createAttachmentScanHandler(
  descriptorStore: OutboundDescriptorStore,
  fileScanner: FileScanner,
  writeLog: WorkerLogWriter
): OutboxEventHandler {
  return async (event) => {
    const descriptor = await loadOutboundDescriptor(event, descriptorStore);
    requireDescriptorKind(descriptor, "attachment_upload");
    const request = toAttachmentScanRequest(event, descriptor);

    try {
      await fileScanner.queueAttachmentScan(request);
    } catch (error) {
      writeLog("error", "file scan dispatch failed", {
        channel: request.channel,
        descriptorId: descriptor.id,
        errorMessage: error instanceof Error ? error.message : String(error),
        eventId: event.id,
        operation: "queueAttachmentScan",
        queue: event.queue,
        service: "outbox-worker",
        traceId: event.traceId,
        type: event.type
      });
      throw error;
    }

    writeLog("info", "file scan dispatch completed", {
      channel: request.channel,
      descriptorId: descriptor.id,
      eventId: event.id,
      operation: "queueAttachmentScan",
      queue: event.queue,
      service: "outbox-worker",
      traceId: event.traceId,
      type: event.type
    });
  };
}

function toAttachmentScanRequest(event: StoredOutboxEvent, descriptor: WorkerOutboundDescriptor): AttachmentScanRequest {
  const channel = requireString(descriptor.channel, "channel_required");
  const signedFile = signedAttachmentFileAccess(descriptor.payload.signedFile);
  return {
    channel,
    ...(stringValue(descriptor.payload.checksum) ? { checksum: stringValue(descriptor.payload.checksum) } : {}),
    descriptorId: descriptor.id,
    fileId: requireString(descriptor.payload.fileId ?? descriptor.id, "file_id_required"),
    fileName: requireString(descriptor.payload.fileName, "file_name_required"),
    idempotencyKey: descriptor.idempotencyKey || descriptor.id,
    ...(stringValue(descriptor.payload.mimeType) ? { mimeType: stringValue(descriptor.payload.mimeType) } : {}),
    outboxEventId: event.id,
    ...(signedFile ? { signedFile } : {}),
    sizeBytes: numberValue(descriptor.payload.sizeBytes, "size_bytes_required"),
    traceId: event.traceId
  };
}

function createHttpChannelConnector(endpoint: string, fetcher: WorkerHttpFetch, timeoutMs: number): ChannelConnector {
  return {
    deliverMessage: (request) => postWorkerHttpRequest(endpoint, "deliverMessage", request, fetcher, timeoutMs),
    startConversation: (request) => postWorkerHttpRequest(endpoint, "startConversation", request, fetcher, timeoutMs)
  };
}

export function createTelegramChannelConnector({
  endpoint,
  fetcher,
  timeoutMs = 5_000
}: TelegramChannelConnectorOptions): ChannelConnector {
  const sendMessage = (request: ChannelConnectorRequest, message: string): Promise<void> => postTelegramSendMessage({
    chatId: requireString(request.conversationId ?? request.phone, "telegram_chat_id_required"),
    endpoint: requireString(endpoint, "telegram_endpoint_required"),
    fetcher,
    idempotencyKey: requireString(request.idempotencyKey, "telegram_idempotency_key_required"),
    replyMarkup: request.replyMarkup,
    text: message,
    timeoutMs,
    traceId: requireString(request.traceId, "telegram_trace_id_required")
  });

  return {
    deliverMessage: async (request) => sendMessage(request, requireString(request.text, "telegram_text_required")),
    startConversation: async (request) => sendMessage(request, requireString(request.message, "telegram_text_required"))
  };
}

export function createTenantTelegramChannelConnector({
  apiBaseUrl,
  fetcher,
  resolveBotToken,
  timeoutMs = 5_000
}: TenantTelegramChannelConnectorOptions): ChannelConnector {
  const resolveToken = async (request: ChannelConnectorRequest): Promise<string> => {
    const tenantId = requireString(request.tenantId, "telegram_tenant_id_required");
    return requireString(await resolveBotToken(tenantId, request.channelConnectionId), "telegram_bot_token_not_configured");
  };
  const sendMessage = async (request: ChannelConnectorRequest, message: string): Promise<void> => {
    const botToken = await resolveToken(request);
    return postTelegramSendMessage({
      chatId: requireString(request.conversationId ?? request.phone, "telegram_chat_id_required"),
      endpoint: telegramSendMessageEndpoint(apiBaseUrl, botToken),
      fetcher,
      idempotencyKey: requireString(request.idempotencyKey, "telegram_idempotency_key_required"),
      replyMarkup: request.replyMarkup,
      text: message,
      timeoutMs,
      traceId: requireString(request.traceId, "telegram_trace_id_required")
    });
  };

  return {
    deliverMessage: async (request) => {
      if (!request.attachments?.length) {
        return sendMessage(request, requireString(request.text, "telegram_text_required"));
      }

      const botToken = await resolveToken(request);
      return sendTelegramAttachments({
        apiBaseUrl,
        attachments: request.attachments,
        botToken,
        chatId: requireString(request.conversationId ?? request.phone, "telegram_chat_id_required"),
        fetcher,
        idempotencyKey: requireString(request.idempotencyKey, "telegram_idempotency_key_required"),
        replyMarkup: request.replyMarkup,
        text: stringValue(request.text),
        // Attachment uploads carry the file bytes to the provider, so allow
        // them more time than a plain sendMessage call.
        timeoutMs: Math.max(timeoutMs, 30_000),
        traceId: requireString(request.traceId, "telegram_trace_id_required")
      });
    },
    startConversation: async (request) => sendMessage(request, requireString(request.message, "telegram_text_required"))
  };
}

export function createVkChannelConnector({
  endpoint,
  fetcher,
  timeoutMs = 5_000
}: ProviderChannelConnectorOptions): ChannelConnector {
  return {
    deliverMessage: async (request) => postProviderJsonRequest({
      body: {
        peer_id: requireString(request.conversationId, "vk_peer_id_required"),
        message: requireString(request.text, "vk_text_required"),
        ...vkAttachmentPayload(request.attachments)
      },
      endpoint: requireString(endpoint, "vk_endpoint_required"),
      errorPrefix: "vk",
      fetcher,
      idempotencyKey: requireString(request.idempotencyKey, "vk_idempotency_key_required"),
      timeoutMs,
      traceId: requireString(request.traceId, "vk_trace_id_required")
    }),
    startConversation: async () => {
      throw new Error("vk_proactive_delivery_unsupported");
    }
  };
}

export function createMaxChannelConnector({
  endpoint,
  fetcher,
  timeoutMs = 5_000
}: ProviderChannelConnectorOptions): ChannelConnector {
  return {
    deliverMessage: async (request) => {
      rejectMaxAttachments(request.attachments);
      await postProviderJsonRequest({
        body: {
          dialog_id: requireString(request.conversationId, "max_dialog_id_required"),
          text: requireString(request.text, "max_text_required")
        },
        endpoint: requireString(endpoint, "max_endpoint_required"),
        errorPrefix: "max",
        fetcher,
        idempotencyKey: requireString(request.idempotencyKey, "max_idempotency_key_required"),
        timeoutMs,
        traceId: requireString(request.traceId, "max_trace_id_required")
      });
    },
    startConversation: async (request) => postProviderJsonRequest({
      body: {
        phone: requireString(request.phone, "max_phone_required"),
        text: requireString(request.message, "max_text_required")
      },
      endpoint: requireString(endpoint, "max_endpoint_required"),
      errorPrefix: "max",
      fetcher,
      idempotencyKey: requireString(request.idempotencyKey, "max_idempotency_key_required"),
      timeoutMs,
      traceId: requireString(request.traceId, "max_trace_id_required")
    })
  };
}

export function createTenantVkChannelConnector({ apiBaseUrl, fetcher, providerAttachmentTransferStore, resolveCredential, timeoutMs = 5_000 }: TenantProviderChannelConnectorOptions): ChannelConnector {
  return {
    async deliverMessage(request) {
      const credential = await resolveCredential({
        channelConnectionId: requireString(request.channelConnectionId, "vk_channel_connection_id_required"),
        provider: "vk",
        tenantId: requireString(request.tenantId, "vk_tenant_id_required")
      });
      const providerAttachments = await resolveVkAttachments({
        accessToken: credential.accessToken,
        apiBaseUrl,
        apiVersion: credential.apiVersion?.trim() || "5.199",
        attachments: request.attachments,
        channelConnectionId: requireString(request.channelConnectionId, "vk_channel_connection_id_required"),
        fetcher,
        peerId: requireString(request.conversationId, "vk_peer_id_required"),
        tenantId: requireString(request.tenantId, "vk_tenant_id_required"),
        transferStore: providerAttachmentTransferStore
      });
      const params = new URLSearchParams({
        access_token: requireString(credential.accessToken, "vk_access_token_required"),
        message: requireString(request.text, "vk_text_required"),
        peer_id: requireString(request.conversationId, "vk_peer_id_required"),
        random_id: stableProviderRandomId(request.idempotencyKey),
        v: credential.apiVersion?.trim() || "5.199"
      });
      if (providerAttachments.length) params.set("attachment", providerAttachments.join(","));
      const response = await postOfficialProviderRequest({
        body: params.toString(),
        contentType: "application/x-www-form-urlencoded",
        endpoint: `${apiBaseUrl.replace(/\/+$/, "")}/method/messages.send`,
        errorPrefix: "vk",
        fetcher,
        idempotencyKey: request.idempotencyKey,
        timeoutMs,
        traceId: request.traceId
      });
      return { providerMessageId: requireProviderMessageId(response.response, "vk_provider_message_id_required") };
    },
    async startConversation() { throw new Error("vk_proactive_delivery_unsupported"); }
  };
}

export function createTenantMaxChannelConnector({ apiBaseUrl, fetcher, providerAttachmentTransferStore, resolveCredential, timeoutMs = 5_000 }: TenantProviderChannelConnectorOptions): ChannelConnector {
  return {
    async deliverMessage(request) {
      const credential = await resolveCredential({
        channelConnectionId: requireString(request.channelConnectionId, "max_channel_connection_id_required"),
        provider: "max",
        tenantId: requireString(request.tenantId, "max_tenant_id_required")
      });
      const attachments = await resolveMaxAttachments({
        accessToken: credential.accessToken,
        apiBaseUrl,
        attachments: request.attachments,
        channelConnectionId: requireString(request.channelConnectionId, "max_channel_connection_id_required"),
        fetcher,
        tenantId: requireString(request.tenantId, "max_tenant_id_required"),
        timeoutMs,
        transferStore: providerAttachmentTransferStore
      });
      const chatId = encodeURIComponent(requireString(request.conversationId, "max_chat_id_required"));
      const response = await postOfficialProviderRequest({
        authorization: requireString(credential.accessToken, "max_access_token_required"),
        body: JSON.stringify({ text: requireString(request.text, "max_text_required"), ...(attachments.length ? { attachments } : {}) }),
        contentType: "application/json",
        endpoint: `${apiBaseUrl.replace(/\/+$/, "")}/messages?chat_id=${chatId}`,
        errorPrefix: "max",
        fetcher,
        idempotencyKey: request.idempotencyKey,
        timeoutMs,
        traceId: request.traceId
      });
      const message = objectValue(response.message);
      const body = objectValue(message?.body);
      return { providerMessageId: requireProviderMessageId(body?.mid ?? message?.id, "max_provider_message_id_required") };
    },
    async startConversation() { throw new Error("max_proactive_delivery_unsupported"); }
  };
}

function createHttpFileScanner(endpoint: string, fetcher: WorkerHttpFetch, timeoutMs: number): FileScanner {
  return {
    queueAttachmentScan: (request) => postWorkerHttpRequest(endpoint, "queueAttachmentScan", request, fetcher, timeoutMs)
  };
}

function createHttpAttachmentScanner({
  bearerToken,
  endpoint,
  fetcher,
  timeoutMs
}: {
  bearerToken?: string;
  endpoint: string;
  fetcher: WorkerHttpFetch;
  timeoutMs: number;
}): AttachmentScanner {
  return {
    scanAttachment: (request) => postWorkerHttpJsonRequest({
      bearerToken,
      endpoint,
      fetcher,
      operation: "scanAttachment",
      request,
      timeoutMs
    })
  };
}

function createRuntimeAttachmentScanner(
  config: AttachmentScannerRuntimeConfig,
  fetcher: WorkerHttpFetch,
  timeoutMs: number
): AttachmentScanner {
  if (config.providerMode === "local") {
    return createDeterministicAttachmentScanner({
      result: {
        reason: `local scanner ${config.localVerdict}`,
        scanner: "local-deterministic-scanner",
        verdict: config.localVerdict
      }
    });
  }

  return createHttpAttachmentScanner({
    bearerToken: config.bearerToken,
    endpoint: config.endpoint,
    fetcher,
    timeoutMs
  });
}

function createHttpFileScanResultCallback({
  baseUrl,
  bearerToken,
  fetcher,
  timeoutMs
}: {
  baseUrl: string;
  bearerToken: string;
  fetcher: WorkerHttpFetch;
  timeoutMs: number;
}): FileScanResultCallback {
  return {
    recordScanResult: (request) => postFileScanResultCallbackRequest(baseUrl, bearerToken, request, fetcher, timeoutMs)
  };
}

function createMissingFileScanner(): FileScanner {
  return {
    queueAttachmentScan: () => {
      throw new Error("file_scanner_not_configured");
    }
  };
}

async function postWorkerHttpRequest(
  endpoint: string,
  operation: "deliverMessage" | "queueAttachmentScan" | "startConversation",
  request: AttachmentScanRequest | ChannelConnectorRequest,
  fetcher: WorkerHttpFetch,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let response: WorkerHttpResponse;

  try {
    response = await fetcher(endpoint, {
      body: JSON.stringify({ operation, request }),
      headers: {
        "content-type": "application/json",
        "idempotency-key": request.idempotencyKey,
        "x-trace-id": request.traceId
      },
      method: "POST",
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`worker_http_dispatch_timeout:${timeoutMs}`);
    }

    throw new Error("worker_http_dispatch_failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`worker_http_dispatch_failed:${response.status}`);
  }
}

async function postFileScanResultCallbackRequest(
  baseUrl: string,
  bearerToken: string,
  request: FileScanCallbackRequest,
  fetcher: WorkerHttpFetch,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let response: WorkerHttpResponse;

  try {
    response = await fetcher(`${baseUrl.replace(/\/+$/, "")}/files/${encodeURIComponent(request.fileId)}/scan-result`, {
      body: JSON.stringify({
        ...(request.checkedAt ? { checkedAt: request.checkedAt } : {}),
        ...(request.reason ? { reason: request.reason } : {}),
        ...(request.scanner ? { scanner: request.scanner } : {}),
        verdict: request.verdict
      }),
      headers: {
        "x-file-scan-callback-token": bearerToken,
        "content-type": "application/json",
        "idempotency-key": request.idempotencyKey,
        "x-trace-id": request.traceId
      },
      method: "POST",
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`file_scan_result_callback_timeout:${timeoutMs}`);
    }

    throw new Error("file_scan_result_callback_failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`file_scan_result_callback_failed:${response.status}`);
  }

  assertFileScanResultCallbackEnvelope(await response.text());
}

async function postWorkerHttpJsonRequest({
  bearerToken,
  endpoint,
  fetcher,
  operation,
  request,
  timeoutMs
}: {
  bearerToken?: string;
  endpoint: string;
  fetcher: WorkerHttpFetch;
  operation: "scanAttachment";
  request: AttachmentScanRequest;
  timeoutMs: number;
}): Promise<AttachmentScanResult | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let response: WorkerHttpResponse;

  try {
    response = await fetcher(endpoint, {
      body: JSON.stringify({ operation, request }),
      headers: {
        ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
        "content-type": "application/json",
        "idempotency-key": request.idempotencyKey,
        "x-trace-id": request.traceId
      },
      method: "POST",
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`worker_http_dispatch_timeout:${timeoutMs}`);
    }

    throw new Error("worker_http_dispatch_failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`worker_http_dispatch_failed:${response.status}`);
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    const result = JSON.parse(text);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("worker_http_dispatch_invalid_response");
    }

    const payload = result as Record<string, unknown>;
    return {
      checkedAt: stringValue(payload.checkedAt) || undefined,
      reason: stringValue(payload.reason) || undefined,
      scanner: stringValue(payload.scanner) || undefined,
      verdict: requireString(payload.verdict, "scan_verdict_required")
    };
  } catch (error) {
    if (error instanceof Error && error.message === "scan_verdict_required") {
      throw error;
    }

    throw new Error("worker_http_dispatch_invalid_response");
  }
}

function assertFileScanResultCallbackEnvelope(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error("file_scan_result_callback_invalid_response");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("file_scan_result_callback_invalid_response");
  }

  const envelope = parsed as Record<string, unknown>;
  const status = stringValue(envelope.status);
  const error = objectValue(envelope.error);
  if ((status && status !== "ok") || error) {
    throw new Error(`file_scan_result_callback_rejected:${status || "error"}:${stringValue(error?.code) || "unknown"}`);
  }
}

async function postTelegramSendMessage({
  chatId,
  endpoint,
  fetcher,
  idempotencyKey,
  replyMarkup,
  text,
  timeoutMs,
  traceId
}: {
  chatId: string;
  endpoint: string;
  fetcher: WorkerHttpFetch;
  idempotencyKey: string;
  replyMarkup?: Record<string, unknown>;
  text: string;
  timeoutMs: number;
  traceId: string;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  let response: WorkerHttpResponse;

  try {
    response = await fetcher(endpoint, {
      body: JSON.stringify({
        chat_id: chatId,
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        text
      }),
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-trace-id": traceId
      },
      method: "POST",
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`telegram_dispatch_timeout:${timeoutMs}`);
    }

    throw new Error("telegram_dispatch_failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`telegram_dispatch_failed:${response.status}`);
  }
}

async function postProviderJsonRequest({
  body,
  endpoint,
  errorPrefix,
  fetcher,
  idempotencyKey,
  timeoutMs,
  traceId
}: {
  body: Record<string, unknown>;
  endpoint: string;
  errorPrefix: string;
  fetcher: WorkerHttpFetch;
  idempotencyKey: string;
  timeoutMs: number;
  traceId: string;
}): Promise<void> {
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let response: WorkerHttpResponse;

  try {
    response = await Promise.race([
      Promise.resolve(fetcher(endpoint, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
          "x-trace-id": traceId
        },
        method: "POST",
        signal: controller.signal
      })),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error(`${errorPrefix}_dispatch_timeout:${timeoutMs}`));
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    if (timedOut || (error instanceof Error && error.message === `${errorPrefix}_dispatch_timeout:${timeoutMs}`)) {
      throw new Error(`${errorPrefix}_dispatch_timeout:${timeoutMs}`);
    }

    throw new Error(`${errorPrefix}_dispatch_failed`);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }

  if (!response.ok) {
    throw new Error(`${errorPrefix}_dispatch_failed:${response.status}`);
  }
}

function vkAttachmentPayload(attachments: Array<Record<string, unknown>> | undefined): { attachment_ids?: string[] } {
  if (!attachments?.length) {
    return {};
  }

  return {
    attachment_ids: attachments.map((attachment) => requireString(attachment.providerAttachmentId, "vk_attachment_id_required"))
  };
}

function rejectMaxAttachments(attachments: Array<Record<string, unknown>> | undefined): void {
  if (attachments?.length) {
    throw new Error("max_attachments_unsupported");
  }
}

function providerAttachmentIds(attachments: Array<Record<string, unknown>> | undefined): string[] {
  return (attachments ?? []).map((attachment) => requireString(attachment.providerAttachmentId, "provider_attachment_id_required"));
}

async function resolveVkAttachments(input: {
  accessToken: string; apiBaseUrl: string; apiVersion: string; attachments?: Array<Record<string, unknown>>;
  channelConnectionId: string; fetcher: WorkerHttpFetch; peerId: string; tenantId: string; transferStore?: ProviderAttachmentTransferStore;
}): Promise<string[]> {
  const ids: string[] = [];
  for (const attachment of input.attachments ?? []) {
    const fileId = requireString(attachment.fileId, "provider_attachment_file_required");
    const contentVersion = stringValue(attachment.checksum) || fileId;
    const key = { channelConnectionId: input.channelConnectionId, contentVersion, fileId, provider: "vk" as const, tenantId: input.tenantId };
    const existing = input.transferStore ? await input.transferStore.find(key) : null;
    if (existing?.status === "uploaded" && existing.providerAttachmentId) { ids.push(existing.providerAttachmentId); continue; }
    if (input.transferStore) { await input.transferStore.upsert(key); await input.transferStore.markAttempt(key); }
    try {
      const isImage = stringValue(attachment.mimeType).toLowerCase().startsWith("image/");
      const method = isImage ? "photos.getMessagesUploadServer" : "docs.getMessagesUploadServer";
      const serverParams = new URLSearchParams({ access_token: input.accessToken, peer_id: input.peerId, v: input.apiVersion });
      if (!isImage) serverParams.set("type", "doc");
      const server = await providerJsonFetch(input.fetcher, `${input.apiBaseUrl.replace(/\/+$/, "")}/method/${method}`, {
        body: serverParams.toString(), headers: { "content-type": "application/x-www-form-urlencoded" }, method: "POST"
      }, "vk_upload_server_failed");
      const serverResponse = objectValue(server.response);
      const uploadUrl = requireString(serverResponse?.upload_url, "vk_upload_url_required");
      const bytes = await downloadProviderAttachment(attachment, input.fetcher);
      const boundary = `----support-${fileId.replace(/[^A-Za-z0-9]/g, "").slice(-24)}`;
      const uploaded = await providerJsonFetch(input.fetcher, uploadUrl, {
        body: multipartFileBody(boundary, bytes, requireString(attachment.fileName, "provider_attachment_file_name_required"), stringValue(attachment.mimeType) || "application/octet-stream", isImage ? "photo" : "file"),
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, method: "POST"
      }, "vk_attachment_upload_failed");
      const saveMethod = isImage ? "photos.saveMessagesPhoto" : "docs.save";
      const saveParams = new URLSearchParams({ access_token: input.accessToken, v: input.apiVersion });
      if (isImage) {
        saveParams.set("server", requireScalarString(uploaded.server, "vk_photo_server_required"));
        saveParams.set("photo", requireString(uploaded.photo, "vk_photo_payload_required"));
        saveParams.set("hash", requireString(uploaded.hash, "vk_photo_hash_required"));
      } else {
        saveParams.set("file", requireString(uploaded.file, "vk_file_payload_required"));
        saveParams.set("title", requireString(attachment.fileName, "provider_attachment_file_name_required"));
      }
      const saved = await providerJsonFetch(input.fetcher, `${input.apiBaseUrl.replace(/\/+$/, "")}/method/${saveMethod}`, {
        body: saveParams.toString(), headers: { "content-type": "application/x-www-form-urlencoded" }, method: "POST"
      }, "vk_attachment_save_failed");
      const raw = isImage ? (Array.isArray(saved.response) ? saved.response[0] : undefined) : (objectValue(saved.response)?.doc ?? saved.response);
      const item = objectValue(raw);
      const prefix = isImage ? "photo" : "doc";
      const providerAttachmentId = `${prefix}${requireScalarString(item?.owner_id, "vk_attachment_owner_required")}_${requireScalarString(item?.id, "vk_attachment_id_required")}${stringValue(item?.access_key) ? `_${stringValue(item?.access_key)}` : ""}`;
      if (input.transferStore) await input.transferStore.markUploaded({ ...key, providerAttachmentId });
      ids.push(providerAttachmentId);
    } catch (error) {
      if (input.transferStore) await input.transferStore.markFailed({ ...key, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  return ids;
}

async function resolveMaxAttachments(input: {
  accessToken: string;
  apiBaseUrl: string;
  attachments?: Array<Record<string, unknown>>;
  channelConnectionId: string;
  fetcher: WorkerHttpFetch;
  tenantId: string;
  timeoutMs: number;
  transferStore?: ProviderAttachmentTransferStore;
}): Promise<Array<{ payload: { token: string }; type: string }>> {
  const resolved = [];
  for (const attachment of input.attachments ?? []) {
    const fileId = requireString(attachment.fileId, "provider_attachment_file_required");
    const contentVersion = stringValue(attachment.checksum) || fileId;
    const key = { channelConnectionId: input.channelConnectionId, contentVersion, fileId, provider: "max" as const, tenantId: input.tenantId };
    const existing = input.transferStore ? await input.transferStore.find(key) : null;
    if (existing?.status === "uploaded" && existing.providerAttachmentToken) {
      resolved.push({ payload: { token: existing.providerAttachmentToken }, type: maxAttachmentType(attachment) });
      continue;
    }
    if (input.transferStore) {
      await input.transferStore.upsert(key);
      await input.transferStore.markAttempt(key);
    }
    try {
      const type = maxAttachmentType(attachment);
      const bytes = await downloadProviderAttachment(attachment, input.fetcher);
      const uploadDescriptor = await providerJsonFetch(input.fetcher, `${input.apiBaseUrl.replace(/\/+$/, "")}/uploads?type=${type}`, {
        body: "",
        headers: { authorization: input.accessToken },
        method: "POST"
      }, "max_upload_descriptor_failed");
      const uploadUrl = requireString(uploadDescriptor.url, "max_upload_url_required");
      const boundary = `----support-${fileId.replace(/[^A-Za-z0-9]/g, "").slice(-24)}`;
      const body = multipartFileBody(boundary, bytes, requireString(attachment.fileName, "provider_attachment_file_name_required"), stringValue(attachment.mimeType) || "application/octet-stream");
      const uploaded = await providerJsonFetch(input.fetcher, uploadUrl, {
        body,
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        method: "POST"
      }, "max_attachment_upload_failed");
      const token = requireString(uploaded.token ?? uploadDescriptor.token, "max_attachment_token_required");
      if (input.transferStore) await input.transferStore.markUploaded({ ...key, providerAttachmentToken: token });
      resolved.push({ payload: { token }, type });
    } catch (error) {
      if (input.transferStore) await input.transferStore.markFailed({ ...key, error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }
  return resolved;
}

function maxAttachmentType(attachment: Record<string, unknown>): "audio" | "file" | "image" | "video" {
  const mime = stringValue(attachment.mimeType).toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

async function downloadProviderAttachment(attachment: Record<string, unknown>, fetcher: WorkerHttpFetch): Promise<Uint8Array> {
  const signedFile = signedAttachmentFileAccess(attachment.signedFile);
  if (!signedFile) throw new Error("provider_attachment_file_access_required");
  if (new Date(signedFile.expiresAt).getTime() <= Date.now()) throw new Error("provider_attachment_file_access_expired");
  const response = await fetcher(signedFile.url, { headers: signedFile.headers ?? {}, method: "GET" });
  if (!response.ok || !response.arrayBuffer) throw new Error(`provider_attachment_download_failed:${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function providerJsonFetch(fetcher: WorkerHttpFetch, url: string, init: WorkerHttpRequestInit, errorCode: string): Promise<Record<string, unknown>> {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error(`${errorCode}:${response.status}`);
  const text = await response.text();
  const value = text ? JSON.parse(text) : {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(errorCode);
  return value as Record<string, unknown>;
}

function multipartFileBody(boundary: string, bytes: Uint8Array, fileName: string, mimeType: string, fieldName = "data"): Uint8Array {
  const encoder = new TextEncoder();
  const safeName = fileName.replace(/["\r\n]/g, "_");
  const prefix = encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${safeName}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const suffix = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(prefix.length + bytes.length + suffix.length);
  body.set(prefix, 0);
  body.set(bytes, prefix.length);
  body.set(suffix, prefix.length + bytes.length);
  return body;
}

function stableProviderRandomId(value: string): string {
  let hash = 0;
  for (const character of requireString(value, "provider_idempotency_key_required")) {
    hash = ((hash * 31) + character.charCodeAt(0)) | 0;
  }
  return String(Math.abs(hash || 1));
}

async function postOfficialProviderRequest(input: {
  authorization?: string;
  body: string;
  contentType: string;
  endpoint: string;
  errorPrefix: "max" | "vk";
  fetcher: WorkerHttpFetch;
  idempotencyKey?: string;
  timeoutMs: number;
  traceId?: string;
}): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  let response: WorkerHttpResponse;
  try {
    response = await input.fetcher(input.endpoint, {
      body: input.body,
      headers: {
        ...(input.authorization ? { authorization: input.authorization } : {}),
        "content-type": input.contentType,
        "idempotency-key": requireString(input.idempotencyKey, `${input.errorPrefix}_idempotency_key_required`),
        "x-trace-id": requireString(input.traceId, `${input.errorPrefix}_trace_id_required`)
      },
      method: "POST",
      signal: controller.signal
    });
  } catch {
    if (controller.signal.aborted) throw new Error(`${input.errorPrefix}_dispatch_timeout:${input.timeoutMs}`);
    throw new Error(`${input.errorPrefix}_dispatch_failed`);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`${input.errorPrefix}_dispatch_failed:${response.status}`);
  const payload = await response.text();
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (parsed.error || parsed.success === false) throw new Error(`${input.errorPrefix}_provider_rejected`);
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message === `${input.errorPrefix}_provider_rejected`) throw error;
    throw new Error(`${input.errorPrefix}_provider_response_invalid`);
  }
}

function telegramSendMessageEndpoint(apiBaseUrl: string, botToken: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/bot${botToken}/sendMessage`;
}

const telegramCaptionLimit = 1024;

async function sendTelegramAttachments(input: {
  apiBaseUrl: string;
  attachments: Array<Record<string, unknown>>;
  botToken: string;
  chatId: string;
  fetcher: WorkerHttpFetch;
  idempotencyKey: string;
  replyMarkup?: Record<string, unknown>;
  text: string;
  timeoutMs: number;
  traceId: string;
}): Promise<void> {
  // A caption cannot exceed the Telegram limit and cannot carry reply_markup
  // together with the document reliably, so fall back to a separate text
  // message in those cases.
  const separateText = Boolean(input.text) && (input.text.length > telegramCaptionLimit || Boolean(input.replyMarkup));
  if (separateText) {
    await postTelegramSendMessage({
      chatId: input.chatId,
      endpoint: telegramApiEndpoint(input.apiBaseUrl, input.botToken, "sendMessage"),
      fetcher: input.fetcher,
      idempotencyKey: `${input.idempotencyKey}:text`,
      replyMarkup: input.replyMarkup,
      text: input.text,
      timeoutMs: input.timeoutMs,
      traceId: input.traceId
    });
  }

  for (const [index, attachment] of input.attachments.entries()) {
    const fileId = requireString(attachment.fileId, "provider_attachment_file_required");
    const fileName = requireString(attachment.fileName, "provider_attachment_file_name_required");
    const mimeType = stringValue(attachment.mimeType) || "application/octet-stream";
    const bytes = await downloadProviderAttachment(attachment, input.fetcher);
    const caption = !separateText && index === 0 ? input.text : "";
    const isLast = index === input.attachments.length - 1;
    const boundary = `----support-${fileId.replace(/[^A-Za-z0-9]/g, "").slice(-24)}`;
    const body = multipartFormBody(boundary, {
      chat_id: input.chatId,
      ...(caption ? { caption } : {}),
      ...(isLast && !separateText && input.replyMarkup ? { reply_markup: JSON.stringify(input.replyMarkup) } : {})
    }, { bytes, fieldName: "document", fileName, mimeType });
    await postTelegramMultipart({
      body,
      boundary,
      endpoint: telegramApiEndpoint(input.apiBaseUrl, input.botToken, "sendDocument"),
      fetcher: input.fetcher,
      idempotencyKey: `${input.idempotencyKey}:document:${index}`,
      timeoutMs: input.timeoutMs,
      traceId: input.traceId
    });
  }
}

function telegramApiEndpoint(apiBaseUrl: string, botToken: string, method: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/bot${botToken}/${method}`;
}

async function postTelegramMultipart(input: {
  body: Uint8Array;
  boundary: string;
  endpoint: string;
  fetcher: WorkerHttpFetch;
  idempotencyKey: string;
  timeoutMs: number;
  traceId: string;
}): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, input.timeoutMs);
  let response: WorkerHttpResponse;

  try {
    response = await input.fetcher(input.endpoint, {
      body: input.body,
      headers: {
        "content-type": `multipart/form-data; boundary=${input.boundary}`,
        "idempotency-key": input.idempotencyKey,
        "x-trace-id": input.traceId
      },
      method: "POST",
      signal: controller.signal
    });
  } catch {
    if (controller.signal.aborted) {
      throw new Error(`telegram_dispatch_timeout:${input.timeoutMs}`);
    }

    throw new Error("telegram_dispatch_failed");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`telegram_dispatch_failed:${response.status}`);
  }
}

function multipartFormBody(
  boundary: string,
  fields: Record<string, string>,
  file: { bytes: Uint8Array; fieldName: string; fileName: string; mimeType: string }
): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = Object.entries(fields).map(([name, value]) =>
    encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  const safeName = file.fileName.replace(/["\r\n]/g, "_");
  parts.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${safeName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n`));
  parts.push(file.bytes);
  parts.push(encoder.encode(`\r\n--${boundary}--\r\n`));

  const body = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return body;
}

async function loadOutboundDescriptor(event: StoredOutboxEvent, descriptorStore: OutboundDescriptorStore): Promise<WorkerOutboundDescriptor> {
  const descriptorId = requireString(event.payload.descriptorId, "descriptor_id_required");
  const descriptor = await descriptorStore.findOutboundDescriptorById(descriptorId);
  if (!descriptor) {
    throw new Error(`outbound_descriptor_not_found:${descriptorId}`);
  }

  return descriptor;
}

function requireDescriptorKind(descriptor: WorkerOutboundDescriptor, expectedKind: WorkerOutboundDescriptorKind): void {
  if (descriptor.kind !== expectedKind) {
    throw new Error(`descriptor_kind_mismatch:${descriptor.kind}:${expectedKind}`);
  }
}

function toMessageDeliveryRequest(event: StoredOutboxEvent, descriptor: WorkerOutboundDescriptor, channel: string): ChannelConnectorRequest {
  const attachments = attachmentsFromPayload(descriptor.payload.attachments);
  const replyMarkup = objectValue(descriptor.payload.replyMarkup);
  return {
    ...(attachments ? { attachments } : {}),
    channel,
    ...(stringValue(descriptor.payload.channelConnectionId) ? { channelConnectionId: stringValue(descriptor.payload.channelConnectionId) } : {}),
    conversationId: requireString(descriptor.payload.providerConversationId ?? descriptor.conversationId, "conversation_id_required"),
    descriptorId: descriptor.id,
    idempotencyKey: descriptor.idempotencyKey || descriptor.id,
    messageId: requireString(descriptor.messageId, "message_id_required"),
    outboxEventId: event.id,
    tenantId: requireString(descriptor.tenantId, "tenant_id_required"),
    ...(replyMarkup ? { replyMarkup } : {}),
    text: requireString(descriptor.payload.text, "message_text_required"),
    traceId: event.traceId
  };
}

function attachmentsFromPayload(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item)) : undefined;
}

function signedAttachmentFileAccess(value: unknown): SignedAttachmentFileAccess | undefined {
  const signedFile = objectValue(value);
  if (!signedFile) {
    return undefined;
  }

  const method = stringValue(signedFile.method) || "GET";
  if (method !== "GET") {
    throw new Error("signed_file_method_unsupported");
  }

  return {
    expiresAt: requireString(signedFile.expiresAt, "signed_file_expires_at_required"),
    ...(stringRecord(signedFile.headers) ? { headers: stringRecord(signedFile.headers) } : {}),
    method,
    url: requireString(signedFile.url, "signed_file_url_required")
  };
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  const record = objectValue(value);
  if (!record) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(record)
    .filter(([, entryValue]) => entryValue !== undefined && entryValue !== null)
    .map(([key, entryValue]) => [key, String(entryValue)]));
}

function toOutboundConversationRequest(event: StoredOutboxEvent, descriptor: WorkerOutboundDescriptor, channel: string): ChannelConnectorRequest {
  return {
    channel,
    ...(stringValue(descriptor.payload.clientName) ? { clientName: stringValue(descriptor.payload.clientName) } : {}),
    descriptorId: descriptor.id,
    idempotencyKey: descriptor.idempotencyKey || descriptor.id,
    message: requireString(descriptor.payload.message, "message_required"),
    outboxEventId: event.id,
    phone: requireString(descriptor.payload.phone, "phone_required"),
    tenantId: requireString(descriptor.tenantId, "tenant_id_required"),
    topic: requireString(descriptor.payload.topic, "topic_required"),
    traceId: event.traceId
  };
}

function createLoggingOutboxHandler(writeLog: WorkerLogWriter): OutboxEventHandler {
  return (event) => {
    writeLog("info", "outbox event acknowledged", {
      aggregateId: event.aggregateId,
      aggregateType: event.aggregateType,
      eventId: event.id,
      operation: "handleOutboxEvent",
      queue: event.queue,
      service: "outbox-worker",
      traceId: event.traceId,
      type: event.type
    });
  };
}

function createLoggingBillingSyncHandler(handlerKey: string, writeLog: WorkerLogWriter): BillingSyncJobHandler {
  return (job) => {
    writeLog("info", "billing sync job acknowledged", {
      handlerKey,
      jobId: job.id,
      operation: "handleBillingSyncJob",
      provider: stringValue(job.payload.provider),
      queue: job.queue,
      reason: job.reason,
      service: "billing-sync-worker",
      tenantId: job.tenantId,
      traceId: job.traceId
    });
  };
}

function createBillingSyncProviderHandler(handlerKey: string, provider: BillingSyncProvider, writeLog: WorkerLogWriter): BillingSyncJobHandler {
  return async (job) => {
    const request = toBillingSyncProviderRequest(job);
    try {
      await provider.syncBillingJob(request);
    } catch (error) {
      writeLog("error", "billing sync provider dispatch failed", {
        errorMessage: error instanceof Error ? error.message : String(error),
        eventType: request.eventType,
        handlerKey,
        jobId: job.id,
        operation: "syncBillingJob",
        provider: request.provider,
        queue: job.queue,
        service: "billing-sync-worker",
        tenantId: job.tenantId,
        traceId: job.traceId
      });
      throw error;
    }

    writeLog("info", "billing sync provider dispatch completed", {
      eventType: request.eventType,
      handlerKey,
      jobId: job.id,
      operation: "syncBillingJob",
      provider: request.provider,
      queue: job.queue,
      service: "billing-sync-worker",
      tenantId: job.tenantId,
      traceId: job.traceId
    });
  };
}

function createBillingSyncProviderFromEnv(
  env: Record<string, string | undefined>,
  fetcher: WorkerHttpFetch
): BillingSyncProvider {
  const mode = billingSyncProviderMode(env.BILLING_SYNC_PROVIDER_MODE);
  if (mode === "disabled") {
    return createDisabledBillingSyncProvider();
  }
  if (mode === "local") {
    return createLocalBillingSyncProvider();
  }

  return createHttpBillingSyncProvider({
    endpoint: requireString(env.BILLING_SYNC_PROVIDER_URL, "billing_sync_provider_url_required"),
    fetcher,
    timeoutMs: positiveInteger(env.BILLING_SYNC_PROVIDER_TIMEOUT_MS, 5_000)
  });
}

function createLocalBillingSyncProvider(): BillingSyncProvider {
  return {
    syncBillingJob: () => undefined
  };
}

function createDisabledBillingSyncProvider(): BillingSyncProvider {
  return {
    syncBillingJob: () => {
      throw new Error("billing_sync_provider_not_configured");
    }
  };
}

function createHttpBillingSyncProvider({
  endpoint,
  fetcher,
  timeoutMs
}: {
  endpoint: string;
  fetcher: WorkerHttpFetch;
  timeoutMs: number;
}): BillingSyncProvider {
  return {
    syncBillingJob: (request) => postProviderJsonRequest({
      body: {
        operation: "syncBillingJob",
        request
      },
      endpoint,
      errorPrefix: "billing_sync_provider",
      fetcher,
      idempotencyKey: request.idempotencyKey,
      timeoutMs,
      traceId: request.traceId
    })
  };
}

function toBillingSyncProviderRequest(job: StoredBillingSyncJob): BillingSyncProviderRequest {
  const eventType = requireString(
    stringValue(job.payload.eventType) || internalBillingSyncEventType(job) || job.reason,
    "billing_sync_event_type_required"
  );
  const payload = objectValue(job.payload) ?? {};

  return {
    eventType,
    fromPlanId: requireString(job.fromPlanId, "billing_sync_from_plan_required"),
    idempotencyKey: stringValue(job.payload.idempotencyKey) || job.id,
    jobId: requireString(job.id, "billing_sync_job_id_required"),
    payload,
    provider: stringValue(job.payload.provider) || "internal-billing",
    queue: requireString(job.queue, "billing_sync_queue_required"),
    reason: requireString(job.reason || eventType, "billing_sync_reason_required"),
    tenantId: requireString(job.tenantId || job.payload.tenantId, "billing_sync_tenant_id_required"),
    toPlanId: requireString(job.toPlanId, "billing_sync_to_plan_required"),
    traceId: requireString(job.traceId, "billing_sync_trace_id_required")
  };
}

function billingSyncProviderMode(value: string | undefined): "disabled" | "http" | "local" {
  const normalized = stringValue(value) || "disabled";
  if (normalized === "disabled" || normalized === "http" || normalized === "local") {
    return normalized;
  }

  throw new Error("billing_sync_provider_mode_invalid");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function requireString(value: unknown, code: string): string {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new Error(code);
  }

  return normalized;
}

function requireScalarString(value: unknown, code: string): string {
  const normalized = typeof value === "number" && Number.isFinite(value) ? String(value) : stringValue(value);
  if (!normalized) throw new Error(code);
  return normalized;
}

function requireProviderMessageId(value: unknown, code: string): string {
  const normalized = value === null || value === undefined ? "" : String(value).trim();
  if (!normalized) throw new Error(code);
  return normalized;
}

function numberValue(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(code);
  }

  return value;
}

function parseEndpointMap(value: string | undefined): Array<[string, string]> {
  return stringValue(value)
    .split(/[;,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf("=");
      const channel = separator >= 0 ? entry.slice(0, separator).trim() : "";
      const endpoint = separator >= 0 ? entry.slice(separator + 1).trim() : "";
      return [channel, endpoint] as [string, string];
    })
    .filter(([channel, endpoint]) => channel && endpoint);
}

function defaultWorkerHttpFetch(url: string, init: WorkerHttpRequestInit): Promise<WorkerHttpResponse> {
  const fetcher = (globalThis as { fetch?: WorkerHttpFetch }).fetch;
  if (!fetcher) {
    throw new Error("worker_http_fetch_unavailable");
  }

  return Promise.resolve(fetcher(url, init));
}

function redisConnectionFromUrl(value: string): RedisConnectionSettings {
  const parsed = new URL(value);
  const dbText = parsed.pathname.replace(/^\//, "");
  const db = dbText ? Number(dbText) : undefined;

  return {
    ...(Number.isInteger(db) && db !== undefined && db >= 0 ? { db } : {}),
    host: parsed.hostname || "127.0.0.1",
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {})
  };
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
