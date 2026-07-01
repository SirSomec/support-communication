import { randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
import { type DeadLetterMessage } from "./operations.fixtures.js";
import {
  type OperationsDeadLetterReplayRequeueAuditRecord,
  type OperationsDeadLetterReplayValidationDenialRecord,
  type OperationsRepository
} from "./operations.repository.js";

export interface DeadLetterQueueOwnershipRecord {
  ownerQueue: string;
  replayEnabled: boolean;
  resourceType: string;
}

export interface DeadLetterReplayBackendItem {
  attempts: number;
  deadLetteredAt: string | null;
  id: string;
  lastError?: string | null;
  queue: string;
  status: string;
}

export interface DeadLetterReplayBackendAuditEvent {
  action: "worker.dead_letter.replay";
  at: string;
  id: string;
  immutable: true;
  queue: string;
  reason: string;
  result: "requeued";
  target: string;
}

export interface DeadLetterReplayBackendStore<TItem extends DeadLetterReplayBackendItem> {
  replayDeadLettered(
    id: string,
    queue: string,
    reason: string,
    replayedAt?: Date,
    auditEvent?: DeadLetterReplayBackendAuditEvent
  ): Promise<TItem>;
}

export interface DeadLetterReplayWorkerConflictEnvelope {
  code: string;
  message: string;
  messageId: string;
  queueName: string;
  sanitized: true;
}

export interface DeadLetterReplayValidationDenialAudit {
  action: "operations.dead_letter.replay.validation_denied";
  code: string;
  id: string;
  immutable: true;
  messageId: string;
  queueName: string;
  reason: string;
  target: string;
}

export interface DeadLetterReplayRequeueAudit {
  action: "operations.dead_letter.replay.requeued";
  backendAuditId: string;
  id: string;
  immutable: true;
  messageId: string;
  queueName: string;
  reason: string;
  resourceId: string;
  target: string;
}

export interface DeadLetterReplayWorkerSuccess {
  audit: DeadLetterReplayRequeueAudit;
  backendItem: DeadLetterReplayBackendItem;
  duplicate?: boolean;
  replay: {
    id: string;
    messageId: string;
    originalTraceId?: string;
    queue: string;
    sourceQueue: string;
  };
  status: "requeued";
}

export interface DeadLetterReplayWorkerDenied {
  audit: DeadLetterReplayValidationDenialAudit;
  envelope: DeadLetterReplayWorkerConflictEnvelope;
  status: "denied";
  validationDenial: OperationsDeadLetterReplayValidationDenialRecord;
}

export type DeadLetterReplayWorkerResult = DeadLetterReplayWorkerDenied | DeadLetterReplayWorkerSuccess;

const QUEUE_OWNERSHIP: Record<string, DeadLetterQueueOwnershipRecord> = {
  "billing-sync": {
    ownerQueue: "billing-sync",
    replayEnabled: false,
    resourceType: "billing_sync"
  },
  "realtime-fanout": {
    ownerQueue: "realtime-fanout",
    replayEnabled: true,
    resourceType: "realtime_fanout"
  },
  "report-export": {
    ownerQueue: "report-export",
    replayEnabled: true,
    resourceType: "report_export"
  },
  "webhook-delivery": {
    ownerQueue: "webhook-delivery",
    replayEnabled: true,
    resourceType: "webhook_delivery"
  }
};

export function listKnownDeadLetterQueueNames(): string[] {
  return Object.keys(QUEUE_OWNERSHIP).sort();
}

export function resolveDeadLetterQueueOwnership(queueName: string): DeadLetterQueueOwnershipRecord | undefined {
  return QUEUE_OWNERSHIP[queueName] ? { ...QUEUE_OWNERSHIP[queueName] } : undefined;
}

export function validateDeadLetterQueueOwnership(message: Pick<DeadLetterMessage, "queueName" | "resourceType">): {
  code: string | null;
  message: string | null;
  ok: boolean;
  ownership: DeadLetterQueueOwnershipRecord | null;
} {
  const ownership = resolveDeadLetterQueueOwnership(message.queueName);
  if (!ownership) {
    return {
      code: "dead_letter_queue_unknown",
      message: `Dead-letter queue ${message.queueName} is not registered for replay.`,
      ok: false,
      ownership: null
    };
  }

  if (ownership.resourceType !== message.resourceType) {
    return {
      code: "dead_letter_queue_ownership_mismatch",
      message: `Dead-letter queue ${message.queueName} does not own resource type ${message.resourceType}.`,
      ok: false,
      ownership
    };
  }

  if (!ownership.replayEnabled) {
    return {
      code: "dead_letter_replay_disabled",
      message: `Dead-letter replay is disabled for queue ${message.queueName}.`,
      ok: false,
      ownership
    };
  }

  return {
    code: null,
    message: null,
    ok: true,
    ownership
  };
}

export function buildDeadLetterReplayIdempotencyFingerprint(input: {
  messageId: string;
  reason: string;
  resourceId: string;
}): string {
  return JSON.stringify({
    messageId: input.messageId,
    reason: normalizeReason(input.reason),
    resourceId: input.resourceId
  });
}

export function validateDeadLetterReplayIdempotency(input: {
  fingerprint: string;
  idempotencyKey?: string;
  operationsRepository: OperationsRepository;
}): {
  cachedResult?: Record<string, unknown>;
  code?: "idempotency_key_reused";
  duplicate?: boolean;
  ok: boolean;
} {
  const idempotencyKey = input.idempotencyKey?.trim();
  if (!idempotencyKey) {
    return { ok: true };
  }

  const cached = input.operationsRepository.findDeadLetterReplayIdempotencyKey(idempotencyKey);
  if (!cached) {
    return { ok: true };
  }

  if (cached.fingerprint !== input.fingerprint) {
    return {
      code: "idempotency_key_reused",
      ok: false
    };
  }

  return {
    cachedResult: cached.result,
    duplicate: true,
    ok: true
  };
}

export async function requeueDeadLetterThroughReplayHelper<TItem extends DeadLetterReplayBackendItem>(input: {
  backendStore: DeadLetterReplayBackendStore<TItem>;
  id: string;
  now?: Date;
  queue: string;
  reason: string;
}): Promise<{ auditEvent: DeadLetterReplayBackendAuditEvent; item: TItem }> {
  const normalizedId = requireNonEmpty(input.id, "dead_letter_item_id_required");
  const normalizedQueue = requireNonEmpty(input.queue, "dead_letter_queue_required");
  const normalizedReason = requireNonEmpty(input.reason, "dead_letter_replay_reason_required");
  const now = input.now ?? new Date();
  const auditEvent: DeadLetterReplayBackendAuditEvent = {
    action: "worker.dead_letter.replay",
    at: now.toISOString(),
    id: `evt_dead_letter_replay_${normalizedId}_${now.getTime()}`,
    immutable: true,
    queue: normalizedQueue,
    reason: normalizedReason,
    result: "requeued",
    target: normalizedId
  };

  const item = await input.backendStore.replayDeadLettered(
    normalizedId,
    normalizedQueue,
    normalizedReason,
    now,
    auditEvent
  );

  return { auditEvent, item };
}

export async function executeDeadLetterReplayWorker(input: {
  backendStore: DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>;
  idempotencyKey?: string;
  message: DeadLetterMessage;
  now?: Date;
  operationsRepository: OperationsRepository;
  reason: string;
}): Promise<DeadLetterReplayWorkerResult> {
  const ownership = validateDeadLetterQueueOwnership(input.message);
  if (!ownership.ok) {
    return denyDeadLetterReplay({
      code: ownership.code ?? "dead_letter_queue_unknown",
      message: ownership.message ?? "Dead-letter replay was denied.",
      messageId: input.message.id,
      operationsRepository: input.operationsRepository,
      queueName: input.message.queueName,
      reason: input.reason
    });
  }

  const fingerprint = buildDeadLetterReplayIdempotencyFingerprint({
    messageId: input.message.id,
    reason: input.reason,
    resourceId: input.message.resourceId
  });
  const idempotency = validateDeadLetterReplayIdempotency({
    fingerprint,
    idempotencyKey: input.idempotencyKey,
    operationsRepository: input.operationsRepository
  });
  if (!idempotency.ok) {
    return denyDeadLetterReplay({
      code: idempotency.code ?? "idempotency_key_reused",
      message: "Idempotency key was already used for a different dead-letter replay request.",
      messageId: input.message.id,
      operationsRepository: input.operationsRepository,
      queueName: input.message.queueName,
      reason: input.reason
    });
  }

  if (idempotency.duplicate && idempotency.cachedResult) {
    return {
      audit: requeueAuditFromCached(idempotency.cachedResult, input.message, input.reason),
      backendItem: backendItemFromCached(idempotency.cachedResult),
      duplicate: true,
      replay: replayFromCached(idempotency.cachedResult),
      status: "requeued"
    };
  }

  let requeued: Awaited<ReturnType<typeof requeueDeadLetterThroughReplayHelper>>;
  try {
    requeued = await requeueDeadLetterThroughReplayHelper({
      backendStore: input.backendStore,
      id: input.message.resourceId,
      now: input.now,
      queue: ownership.ownership!.ownerQueue,
      reason: input.reason
    });
  } catch (error) {
    return denyDeadLetterReplay({
      code: deadLetterReplayBackendFailureCode(error),
      message: deadLetterReplayBackendFailureMessage(error, input.message.queueName),
      messageId: input.message.id,
      operationsRepository: input.operationsRepository,
      queueName: input.message.queueName,
      reason: input.reason
    });
  }

  const replay = {
    id: makeReplayQueueId(),
    messageId: input.message.id,
    originalTraceId: input.message.originalTraceId,
    queue: "dead-letter-replay",
    sourceQueue: input.message.queueName
  };
  const persistedReplay = input.operationsRepository.saveDeadLetterReplay({
    auditEvent: {
      action: "operations.dead_letter.replay",
      id: `evt_operations_dead_letter_${randomUUID()}`,
      immutable: true,
      reason: normalizeReason(input.reason),
      target: input.message.id
    },
    reason: normalizeReason(input.reason),
    replay
  });
  const requeueAudit = persistDeadLetterReplayRequeueAudit(input.operationsRepository, {
    auditEvent: {
      action: "operations.dead_letter.replay.requeued",
      backendAuditId: requeued.auditEvent.id,
      id: `evt_dead_letter_requeue_${randomUUID()}`,
      immutable: true,
      messageId: input.message.id,
      queueName: input.message.queueName,
      reason: normalizeReason(input.reason),
      resourceId: input.message.resourceId,
      target: input.message.id
    },
    messageId: input.message.id,
    queueName: input.message.queueName,
    reason: normalizeReason(input.reason),
    replay: persistedReplay.replay
  });

  if (input.idempotencyKey?.trim()) {
    input.operationsRepository.saveDeadLetterReplayIdempotencyKey({
      fingerprint,
      key: input.idempotencyKey.trim(),
      result: {
        audit: requeueAudit.auditEvent,
        backendItem: requeued.item,
        replay: persistedReplay.replay
      }
    });
  }

  return {
    audit: {
      action: "operations.dead_letter.replay.requeued",
      backendAuditId: requeued.auditEvent.id,
      id: String(requeueAudit.auditEvent.id),
      immutable: true,
      messageId: input.message.id,
      queueName: input.message.queueName,
      reason: normalizeReason(input.reason) ?? "",
      resourceId: input.message.resourceId,
      target: input.message.id
    },
    backendItem: requeued.item,
    replay: persistedReplay.replay as DeadLetterReplayWorkerSuccess["replay"],
    status: "requeued"
  };
}

export function persistDeadLetterReplayValidationDenial(
  operationsRepository: OperationsRepository,
  record: OperationsDeadLetterReplayValidationDenialRecord
): OperationsDeadLetterReplayValidationDenialRecord {
  return operationsRepository.saveDeadLetterReplayValidationDenial(record);
}

export function persistDeadLetterReplayRequeueAudit(
  operationsRepository: OperationsRepository,
  record: OperationsDeadLetterReplayRequeueAuditRecord
): OperationsDeadLetterReplayRequeueAuditRecord {
  return operationsRepository.saveDeadLetterReplayRequeueAudit(record);
}

export function createDeadLetterReplayConflictEnvelope(input: {
  code: string;
  message: string;
  messageId: string;
  queueName: string;
}): DeadLetterReplayWorkerConflictEnvelope {
  return {
    code: input.code,
    message: redactSensitiveText(input.message),
    messageId: input.messageId,
    queueName: input.queueName,
    sanitized: true
  };
}

export interface DeterministicDeadLetterReplayBackendStoreOptions {
  items?: Map<string, DeadLetterReplayBackendItem>;
  missingIds?: Set<string>;
  queueMismatches?: Set<string>;
}

export function createDeterministicDeadLetterReplayBackendStore(
  options: DeterministicDeadLetterReplayBackendStoreOptions = {}
): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem> {
  const items = options.items ?? new Map<string, DeadLetterReplayBackendItem>();
  const missingIds = options.missingIds ?? new Set<string>();
  const queueMismatches = options.queueMismatches ?? new Set<string>();

  return {
    async replayDeadLettered(id, queue, reason, replayedAt = new Date(), auditEvent) {
      if (missingIds.has(id)) {
        throw new Error(`dead_letter_item_not_found:${queue}`);
      }
      if (queueMismatches.has(id)) {
        throw new Error(`dead_letter_item_not_found:${queue}`);
      }

      const existing = items.get(`${queue}:${id}`) ?? {
        attempts: 3,
        deadLetteredAt: "2026-06-27T07:21:00.000Z",
        id,
        lastError: "provider failure",
        queue,
        status: "dead_lettered"
      };
      const replayed: DeadLetterReplayBackendItem = {
        ...existing,
        attempts: existing.attempts + 1,
        deadLetteredAt: null,
        lastError: `dead_letter_replay:${reason}`,
        status: "failed"
      };
      items.set(`${queue}:${id}`, replayed);

      if (!auditEvent) {
        throw new Error("dead_letter_replay_audit_required");
      }

      return replayed;
    }
  };
}

export function createUnavailableDeadLetterReplayBackendStore(): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem> {
  return {
    async replayDeadLettered(_id, queue) {
      throw new Error(`dead_letter_replay_backend_unavailable:${queue}`);
    }
  };
}

function denyDeadLetterReplay(input: {
  code: string;
  message: string;
  messageId: string;
  operationsRepository: OperationsRepository;
  queueName: string;
  reason: string;
}): DeadLetterReplayWorkerDenied {
  const audit: DeadLetterReplayValidationDenialAudit = {
    action: "operations.dead_letter.replay.validation_denied",
    code: input.code,
    id: `evt_dead_letter_validation_denied_${randomUUID()}`,
    immutable: true,
    messageId: input.messageId,
    queueName: input.queueName,
    reason: normalizeReason(input.reason) ?? "",
    target: input.messageId
  };
  const validationDenial = persistDeadLetterReplayValidationDenial(input.operationsRepository, {
    auditEvent: { ...audit },
    code: input.code,
    messageId: input.messageId,
    queueName: input.queueName,
    reason: normalizeReason(input.reason)
  });

  return {
    audit,
    envelope: createDeadLetterReplayConflictEnvelope({
      code: input.code,
      message: input.message,
      messageId: input.messageId,
      queueName: input.queueName
    }),
    status: "denied",
    validationDenial
  };
}

function backendItemFromCached(cached: Record<string, unknown>): DeadLetterReplayBackendItem {
  const item = cached.backendItem;
  if (!item || typeof item !== "object") {
    throw new Error("dead_letter_replay_cached_backend_item_missing");
  }

  return item as DeadLetterReplayBackendItem;
}

function replayFromCached(cached: Record<string, unknown>): DeadLetterReplayWorkerSuccess["replay"] {
  const replay = cached.replay;
  if (!replay || typeof replay !== "object") {
    throw new Error("dead_letter_replay_cached_replay_missing");
  }

  return replay as DeadLetterReplayWorkerSuccess["replay"];
}

function requeueAuditFromCached(
  cached: Record<string, unknown>,
  message: DeadLetterMessage,
  reason: string
): DeadLetterReplayRequeueAudit {
  const audit = cached.audit;
  if (!audit || typeof audit !== "object") {
    return {
      action: "operations.dead_letter.replay.requeued",
      backendAuditId: "cached",
      id: `evt_dead_letter_requeue_cached_${message.id}`,
      immutable: true,
      messageId: message.id,
      queueName: message.queueName,
      reason: normalizeReason(reason) ?? "",
      resourceId: message.resourceId,
      target: message.id
    };
  }

  const record = audit as Record<string, unknown>;
  return {
    action: "operations.dead_letter.replay.requeued",
    backendAuditId: String(record.backendAuditId ?? "cached"),
    id: String(record.id ?? `evt_dead_letter_requeue_cached_${message.id}`),
    immutable: true,
    messageId: message.id,
    queueName: message.queueName,
    reason: normalizeReason(reason) ?? "",
    resourceId: message.resourceId,
    target: message.id
  };
}

function makeReplayQueueId(): string {
  return `dead_letter_replay_${randomUUID()}`;
}

function deadLetterReplayBackendFailureCode(error: unknown): string {
  return error instanceof Error && error.message.includes("dead_letter_replay_backend_unavailable")
    ? "dead_letter_replay_backend_unavailable"
    : "dead_letter_replay_backend_failed";
}

function deadLetterReplayBackendFailureMessage(error: unknown, queueName: string): string {
  if (error instanceof Error && error.message.includes("dead_letter_replay_backend_unavailable")) {
    return `Dead-letter replay backend is not configured for queue ${queueName}.`;
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `Dead-letter replay backend failed for queue ${queueName}: ${detail}`;
}

function normalizeReason(reason: string): string | null {
  return typeof reason === "string" ? reason.trim() : null;
}

function requireNonEmpty(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(code);
  }

  return normalized;
}
