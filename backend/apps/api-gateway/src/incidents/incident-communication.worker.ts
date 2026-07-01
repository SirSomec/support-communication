import { createHash } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
import type {
  PlatformIncidentCommunicationAttempt,
  PlatformIncidentCommunicationDeadLetter,
  PlatformIncidentCommunicationRetry,
  PlatformRepository
} from "../platform/platform.repository.js";

export interface IncidentCommunicationSyncJob {
  id: string;
  queue: string;
  scope: string;
  target: string;
}

export interface IncidentCommunicationSource {
  customerMessage?: string;
  id: string;
  severity: string;
  status: string;
  updateText: string;
}

export interface StatusPageCommunicationDescriptor {
  id: string;
  idempotencyKey: string;
  incidentId: string;
  payload: {
    customerMessage: string;
    incidentId: string;
    public: true;
    severity: string;
    status: string;
    tenantNamesExposed: false;
    updateText: string;
  };
  port: "status-page";
  queue: "status-page-sync";
  requestFingerprint: string;
  scope: string;
  status: "queued";
  traceId: string;
  visibility: "customer-visible";
}

export interface CustomerVisibleIncidentCommunicationPlan {
  descriptor: StatusPageCommunicationDescriptor;
  requestFingerprint: string;
  status: "planned";
}

export interface InternalNotificationCommunicationDescriptor {
  id: string;
  idempotencyKey: string;
  incidentId: string;
  payload: {
    incidentId: string;
    public: false;
    severity: string;
    status: string;
    tenantNamesExposed: false;
    updateText: string;
  };
  port: "internal-notification";
  queue: "platform-notification";
  requestFingerprint: string;
  scope: string;
  status: "queued";
  traceId: string;
  visibility: "internal-only";
}

export interface InternalIncidentCommunicationPlan {
  descriptor: InternalNotificationCommunicationDescriptor;
  requestFingerprint: string;
  status: "planned";
}

export interface PlanCustomerVisibleIncidentCommunicationInput {
  incident: IncidentCommunicationSource;
  job: IncidentCommunicationSyncJob;
  traceId: string;
}

export function planCustomerVisibleIncidentCommunication(
  input: PlanCustomerVisibleIncidentCommunicationInput
): CustomerVisibleIncidentCommunicationPlan {
  if (input.job.queue !== "status-page-sync") {
    throw new Error("incident_communication_queue_unsupported");
  }

  if (input.job.scope !== "incident-update") {
    throw new Error("incident_communication_scope_unsupported");
  }

  if (input.job.target !== input.incident.id) {
    throw new Error("incident_communication_target_mismatch");
  }

  const customerMessage = input.incident.customerMessage?.trim();
  if (!customerMessage) {
    throw new Error("incident_communication_customer_message_required");
  }

  const idempotencyKey = makeIncidentCommunicationIdempotencyKey(
    "customer-visible",
    input.incident.id,
    input.job.scope,
    input.job.id
  );
  const descriptorPayload = {
    customerMessage,
    incidentId: input.incident.id,
    public: true as const,
    severity: input.incident.severity,
    status: input.incident.status,
    tenantNamesExposed: false as const,
    updateText: input.incident.updateText
  };
  const requestFingerprint = createRequestFingerprint("incident_communication_customer_visible", {
    idempotencyKey,
    scope: input.job.scope,
    ...descriptorPayload
  });
  const descriptor: StatusPageCommunicationDescriptor = {
    id: makeIncidentCommunicationId(input.incident.id, input.job.id),
    idempotencyKey,
    incidentId: input.incident.id,
    payload: descriptorPayload,
    port: "status-page",
    queue: "status-page-sync",
    requestFingerprint,
    scope: input.job.scope,
    status: "queued",
    traceId: input.traceId,
    visibility: "customer-visible"
  };

  return {
    descriptor,
    requestFingerprint,
    status: "planned"
  };
}

export function planInternalIncidentCommunication(
  input: PlanCustomerVisibleIncidentCommunicationInput
): InternalIncidentCommunicationPlan {
  if (input.job.queue !== "platform-notification") {
    throw new Error("incident_communication_queue_unsupported");
  }

  if (input.job.scope !== "incident-update-internal") {
    throw new Error("incident_communication_scope_unsupported");
  }

  if (input.job.target !== input.incident.id) {
    throw new Error("incident_communication_target_mismatch");
  }

  const idempotencyKey = makeIncidentCommunicationIdempotencyKey(
    "internal-only",
    input.incident.id,
    input.job.scope,
    input.job.id
  );
  const descriptorPayload = {
    incidentId: input.incident.id,
    public: false as const,
    severity: input.incident.severity,
    status: input.incident.status,
    tenantNamesExposed: false as const,
    updateText: input.incident.updateText
  };
  const requestFingerprint = createRequestFingerprint("incident_communication_internal", {
    idempotencyKey,
    scope: input.job.scope,
    ...descriptorPayload
  });
  const descriptor: InternalNotificationCommunicationDescriptor = {
    id: makeInternalIncidentCommunicationId(input.incident.id, input.job.id),
    idempotencyKey,
    incidentId: input.incident.id,
    payload: descriptorPayload,
    port: "internal-notification",
    queue: "platform-notification",
    requestFingerprint,
    scope: input.job.scope,
    status: "queued",
    traceId: input.traceId,
    visibility: "internal-only"
  };

  return {
    descriptor,
    requestFingerprint,
    status: "planned"
  };
}

function makeInternalIncidentCommunicationId(incidentId: string, jobId: string): string {
  return `incident_internal_${sanitizeIdentifierSegment(incidentId)}_${createHash("sha256")
    .update(`internal:${incidentId}:${jobId}`)
    .digest("hex")
    .slice(0, 12)}`;
}

export type IncidentCommunicationPlan = CustomerVisibleIncidentCommunicationPlan | InternalIncidentCommunicationPlan;

export interface PersistIncidentCommunicationAttemptInput {
  attemptedAt: string;
  plan: IncidentCommunicationPlan;
  repository: Pick<PlatformRepository, "listIncidentCommunicationAttempts" | "saveIncidentCommunicationAttempt">;
}

export interface IncidentCommunicationFailureStateInput {
  currentAttempts?: number;
  failedAt: string;
  maxAttempts?: number;
  retryBackoffMs?: number;
}

export interface IncidentCommunicationFailureState {
  attempts: number;
  deadLetteredAt: string | null;
  nextAttemptAt: string | null;
  status: "dead_lettered" | "retry_scheduled";
}

export interface RecordIncidentCommunicationRetryStateInput {
  attemptId: string;
  error: string;
  failedAt: string;
  maxAttempts?: number;
  repository: IncidentCommunicationRetryRepository;
  retryBackoffMs?: number;
}

export interface RecordIncidentCommunicationDeadLetterStateInput {
  attemptId: string;
  error: string;
  failedAt: string;
  maxAttempts?: number;
  repository: IncidentCommunicationDeadLetterRepository;
}

export interface IncidentCommunicationRetryRepository {
  listIncidentCommunicationAttempts(
    filters?: { incidentId?: string }
  ): PlatformIncidentCommunicationAttempt[];
  listIncidentCommunicationRetries(
    filters?: { attemptId?: string; incidentId?: string }
  ): PlatformIncidentCommunicationRetry[];
  saveIncidentCommunicationAttempt(
    attempt: PlatformIncidentCommunicationAttempt
  ): PlatformIncidentCommunicationAttempt;
  saveIncidentCommunicationRetry(retry: PlatformIncidentCommunicationRetry): PlatformIncidentCommunicationRetry;
}

export interface IncidentCommunicationDeadLetterRepository {
  listIncidentCommunicationAttempts(
    filters?: { incidentId?: string }
  ): PlatformIncidentCommunicationAttempt[];
  listIncidentCommunicationRetries(
    filters?: { attemptId?: string; incidentId?: string }
  ): PlatformIncidentCommunicationRetry[];
  saveIncidentCommunicationAttempt(
    attempt: PlatformIncidentCommunicationAttempt
  ): PlatformIncidentCommunicationAttempt;
  saveIncidentCommunicationDeadLetter(
    deadLetter: PlatformIncidentCommunicationDeadLetter
  ): PlatformIncidentCommunicationDeadLetter;
}

export function persistIncidentCommunicationAttempt(
  input: PersistIncidentCommunicationAttemptInput
): PlatformIncidentCommunicationAttempt {
  const attemptId = makeIncidentCommunicationAttemptId(input.plan.descriptor.idempotencyKey);
  const existing = input.repository.listIncidentCommunicationAttempts({
    incidentId: input.plan.descriptor.incidentId
  }).find((attempt) => attempt.attemptId === attemptId);
  if (existing) {
    if (
      existing.requestFingerprint &&
      existing.requestFingerprint !== input.plan.requestFingerprint
    ) {
      throw new Error(`incident_communication_idempotency_conflict:${input.plan.descriptor.idempotencyKey}`);
    }

    return cloneIncidentCommunicationAttempt(existing);
  }

  return input.repository.saveIncidentCommunicationAttempt({
    attemptId,
    attemptedAt: input.attemptedAt,
    descriptorId: input.plan.descriptor.id,
    idempotencyKey: input.plan.descriptor.idempotencyKey,
    incidentId: input.plan.descriptor.incidentId,
    port: input.plan.descriptor.port,
    requestFingerprint: input.plan.descriptor.requestFingerprint,
    status: "queued",
    traceId: input.plan.descriptor.traceId,
    visibility: input.plan.descriptor.visibility
  });
}

export function resolveIncidentCommunicationFailureState(
  input: IncidentCommunicationFailureStateInput
): IncidentCommunicationFailureState {
  const failedAtMs = Date.parse(input.failedAt);
  if (!Number.isFinite(failedAtMs)) {
    throw new Error("incident_communication_failed_at_invalid");
  }

  const failedAt = new Date(failedAtMs);
  const attempts = Math.max(0, Math.trunc(input.currentAttempts ?? 0)) + 1;
  const maxAttempts = positiveInteger(input.maxAttempts);
  const retryBackoffMs = positiveInteger(input.retryBackoffMs);
  const exhausted = maxAttempts !== undefined && attempts >= maxAttempts;
  let nextAttemptAt: string | null = null;
  if (!exhausted) {
    if (retryBackoffMs === undefined) {
      throw new Error("incident_communication_retry_backoff_invalid");
    }

    nextAttemptAt = new Date(failedAt.getTime() + retryBackoffMs).toISOString();
  }

  return {
    attempts,
    deadLetteredAt: exhausted ? failedAt.toISOString() : null,
    nextAttemptAt,
    status: exhausted ? "dead_lettered" : "retry_scheduled"
  };
}

export function recordIncidentCommunicationRetryState(
  input: RecordIncidentCommunicationRetryStateInput
): PlatformIncidentCommunicationRetry {
  const current = findClaimedIncidentCommunicationAttempt(input.repository, input.attemptId);
  const currentAttempts = maxPersistedRetryAttempts(input.repository, input.attemptId);
  const failure = resolveIncidentCommunicationFailureState({
    currentAttempts,
    failedAt: input.failedAt,
    maxAttempts: input.maxAttempts,
    retryBackoffMs: input.retryBackoffMs
  });
  if (failure.status !== "retry_scheduled" || !failure.nextAttemptAt) {
    throw new Error(`incident_communication_retry_schedule_not_available:${input.attemptId}`);
  }

  const retry = input.repository.saveIncidentCommunicationRetry({
    attemptId: current.attemptId,
    attempts: failure.attempts,
    failedAt: input.failedAt,
    incidentId: current.incidentId,
    lastError: redactSensitiveText(input.error),
    nextAttemptAt: failure.nextAttemptAt,
    status: "retry_scheduled"
  });
  input.repository.saveIncidentCommunicationAttempt({
    ...current,
    status: "retry_scheduled"
  });

  return retry;
}

export function recordIncidentCommunicationDeadLetterState(
  input: RecordIncidentCommunicationDeadLetterStateInput
): PlatformIncidentCommunicationDeadLetter {
  const current = findClaimedIncidentCommunicationAttempt(input.repository, input.attemptId);
  const persistedRetryAttempts = maxPersistedRetryAttempts(input.repository, input.attemptId);
  const failure = resolveIncidentCommunicationFailureState({
    currentAttempts: Math.max(persistedRetryAttempts, (input.maxAttempts ?? 1) - 1),
    failedAt: input.failedAt,
    maxAttempts: input.maxAttempts
  });
  if (failure.status !== "dead_lettered" || !failure.deadLetteredAt) {
    throw new Error(`incident_communication_dead_letter_not_available:${input.attemptId}`);
  }

  const deadLetter = input.repository.saveIncidentCommunicationDeadLetter({
    attemptId: current.attemptId,
    attempts: failure.attempts,
    deadLetteredAt: failure.deadLetteredAt,
    failedAt: input.failedAt,
    incidentId: current.incidentId,
    lastError: redactSensitiveText(input.error),
    status: "dead_lettered"
  });
  input.repository.saveIncidentCommunicationAttempt({
    ...current,
    status: "dead_lettered"
  });

  return deadLetter;
}

function findClaimedIncidentCommunicationAttempt(
  repository: Pick<PlatformRepository, "listIncidentCommunicationAttempts">,
  attemptId: string
): PlatformIncidentCommunicationAttempt {
  const current = repository.listIncidentCommunicationAttempts().find((attempt) => attempt.attemptId === attemptId);
  if (!current) {
    throw new Error(`incident_communication_attempt_not_found:${attemptId}`);
  }
  if (current.status !== "publishing") {
    throw new Error(`incident_communication_not_claimed:${attemptId}`);
  }

  return current;
}

function maxPersistedRetryAttempts(
  repository: Pick<IncidentCommunicationRetryRepository, "listIncidentCommunicationRetries">,
  attemptId: string
): number {
  return repository
    .listIncidentCommunicationRetries({ attemptId })
    .reduce((max, retry) => Math.max(max, retry.attempts), 0);
}

function makeIncidentCommunicationAttemptId(idempotencyKey: string): string {
  return `attempt_${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 16)}`;
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function cloneIncidentCommunicationAttempt(
  attempt: PlatformIncidentCommunicationAttempt
): PlatformIncidentCommunicationAttempt {
  return JSON.parse(JSON.stringify(attempt)) as PlatformIncidentCommunicationAttempt;
}

function makeIncidentCommunicationId(incidentId: string, jobId: string): string {
  return `incident_comm_${sanitizeIdentifierSegment(incidentId)}_${createHash("sha256")
    .update(`${incidentId}:${jobId}`)
    .digest("hex")
    .slice(0, 12)}`;
}

function makeIncidentCommunicationIdempotencyKey(
  visibility: "customer-visible" | "internal-only",
  incidentId: string,
  scope: string,
  jobId: string
): string {
  const durableJobId = jobId.trim();
  if (!durableJobId) {
    throw new Error("incident_communication_job_id_required");
  }

  return `incident-communication:${visibility}:${incidentId}:${scope}:${durableJobId}`;
}

function createRequestFingerprint(scope: string, payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify({ payload, scope }))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sanitizeIdentifierSegment(value: string): string {
  return value.replace(/[^a-z0-9_]+/gi, "_");
}
