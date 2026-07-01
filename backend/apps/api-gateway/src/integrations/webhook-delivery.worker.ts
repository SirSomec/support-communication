import type {
  RecordWebhookDeliveryAttemptSuccessInput,
  RecordWebhookDeliveryRetryStateInput,
  WebhookDeliveryJournalEntry,
  WebhookDeliveryJournalError
} from "./integration.repository.js";

export interface WebhookDeliveryFailureStateInput {
  currentAttempts?: number;
  failedAt: string;
  maxAttempts?: number;
  retryBackoffMs?: number;
}

export interface WebhookDeliveryFailureState {
  attempts: number;
  deadLetteredAt: string | null;
  nextAttemptAt: string | null;
  status: "dead_lettered" | "retry_scheduled";
}

export interface WebhookDeliveryRetryRepository {
  findWebhookDeliveryJournalEntry(deliveryId: string): WebhookDeliveryJournalEntry | undefined;
  recordWebhookDeliveryAttemptSuccess(input: RecordWebhookDeliveryAttemptSuccessInput): WebhookDeliveryJournalEntry | undefined;
  recordWebhookDeliveryRetryState(input: RecordWebhookDeliveryRetryStateInput): WebhookDeliveryJournalEntry | undefined;
}

export interface RecordWebhookDeliveryAttemptSuccessForWorkerInput {
  attemptedAt: string;
  deliveryId: string;
  providerResponse?: {
    body?: string;
    statusCode?: number;
  };
  repository: WebhookDeliveryRetryRepository;
}

export interface RecordWebhookDeliveryFailureForRetryInput {
  deliveryId: string;
  error: WebhookDeliveryJournalError;
  failedAt: string;
  maxAttempts?: number;
  repository: WebhookDeliveryRetryRepository;
  retryBackoffMs?: number;
}

export function recordWebhookDeliveryAttemptSuccess(
  input: RecordWebhookDeliveryAttemptSuccessForWorkerInput
): WebhookDeliveryJournalEntry {
  const current = input.repository.findWebhookDeliveryJournalEntry(input.deliveryId);
  if (!current) {
    throw new Error(`webhook_delivery_journal_entry_not_found:${input.deliveryId}`);
  }
  if (current.status !== "publishing" || !current.lockedAt) {
    throw new Error(`webhook_delivery_not_claimed:${input.deliveryId}`);
  }

  const updated = input.repository.recordWebhookDeliveryAttemptSuccess({
    attemptedAt: input.attemptedAt,
    deliveryId: input.deliveryId
  });
  if (!updated) {
    throw new Error(`webhook_delivery_journal_entry_not_found:${input.deliveryId}`);
  }

  return updated;
}

export function recordWebhookDeliveryFailureForRetry(
  input: RecordWebhookDeliveryFailureForRetryInput
): WebhookDeliveryJournalEntry {
  const current = input.repository.findWebhookDeliveryJournalEntry(input.deliveryId);
  if (!current) {
    throw new Error(`webhook_delivery_journal_entry_not_found:${input.deliveryId}`);
  }
  if (current.status !== "publishing" || !current.lockedAt) {
    throw new Error(`webhook_delivery_not_claimed:${input.deliveryId}`);
  }

  const failure = resolveWebhookDeliveryFailureState({
    currentAttempts: current.attempts,
    failedAt: input.failedAt,
    maxAttempts: input.maxAttempts,
    retryBackoffMs: input.retryBackoffMs
  });
  if (failure.status !== "retry_scheduled" || !failure.nextAttemptAt) {
    throw new Error(`webhook_delivery_retry_schedule_not_available:${input.deliveryId}`);
  }

  const updated = input.repository.recordWebhookDeliveryRetryState({
    attempts: failure.attempts,
    deliveryId: input.deliveryId,
    lastAttemptAt: input.failedAt,
    lastError: input.error,
    nextAttemptAt: failure.nextAttemptAt
  });
  if (!updated) {
    throw new Error(`webhook_delivery_journal_entry_not_found:${input.deliveryId}`);
  }

  return updated;
}

export function resolveWebhookDeliveryFailureState(input: WebhookDeliveryFailureStateInput): WebhookDeliveryFailureState {
  const failedAtMs = Date.parse(input.failedAt);
  if (!Number.isFinite(failedAtMs)) {
    throw new Error("webhook_delivery_failed_at_invalid");
  }

  const failedAt = new Date(failedAtMs);
  const attempts = Math.max(0, Math.trunc(input.currentAttempts ?? 0)) + 1;
  const maxAttempts = positiveInteger(input.maxAttempts);
  const retryBackoffMs = positiveInteger(input.retryBackoffMs);
  const exhausted = maxAttempts !== undefined && attempts >= maxAttempts;
  let nextAttemptAt: string | null = null;
  if (!exhausted) {
    if (retryBackoffMs === undefined) {
      throw new Error("webhook_delivery_retry_backoff_invalid");
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

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
