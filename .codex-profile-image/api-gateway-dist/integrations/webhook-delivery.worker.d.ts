import type { ClaimWebhookDeliveryJournalEntriesInput, RecordWebhookDeliveryDeadLetterStateInput, RecordWebhookDeliveryAttemptSuccessInput, RecordWebhookDeliveryRetryStateInput, WebhookDeliveryJournalEntry, WebhookDeliveryJournalError } from "./integration.repository.js";
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
    recordWebhookDeliveryDeadLetterState(input: RecordWebhookDeliveryDeadLetterStateInput): WebhookDeliveryJournalEntry | undefined;
    recordWebhookDeliveryRetryState(input: RecordWebhookDeliveryRetryStateInput): WebhookDeliveryJournalEntry | undefined;
}
export interface WebhookDeliveryWorkerRepository {
    claimWebhookDeliveryJournalEntriesAsync(input: ClaimWebhookDeliveryJournalEntriesInput): Promise<WebhookDeliveryJournalEntry[]>;
    recordWebhookDeliveryAttemptSuccessAsync(input: RecordWebhookDeliveryAttemptSuccessInput): Promise<WebhookDeliveryJournalEntry | undefined>;
    recordWebhookDeliveryDeadLetterStateAsync(input: RecordWebhookDeliveryDeadLetterStateInput): Promise<WebhookDeliveryJournalEntry | undefined>;
    recordWebhookDeliveryRetryStateAsync(input: RecordWebhookDeliveryRetryStateInput): Promise<WebhookDeliveryJournalEntry | undefined>;
}
export interface WebhookDeliveryProviderResponse {
    body?: string;
    statusCode?: number;
}
export interface WebhookDeliveryProvider {
    deliver(entry: WebhookDeliveryJournalEntry): Promise<WebhookDeliveryProviderResponse>;
}
export interface WebhookDeliveryWorkerRunInput {
    leaseTimeoutMs?: number;
    limit?: number;
    maxAttempts?: number;
    now?: string;
    provider: WebhookDeliveryProvider;
    queue?: string;
    repository: WebhookDeliveryWorkerRepository;
    retryBackoffMs?: number;
}
export interface WebhookDeliveryWorkerRunResult {
    claimed: number;
    deadLettered: number;
    delivered: number;
    failed: number;
    retryScheduled: number;
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
export declare function recordWebhookDeliveryAttemptSuccess(input: RecordWebhookDeliveryAttemptSuccessForWorkerInput): WebhookDeliveryJournalEntry;
export declare function recordWebhookDeliveryFailureForRetry(input: RecordWebhookDeliveryFailureForRetryInput): WebhookDeliveryJournalEntry;
export declare function runWebhookDeliveryWorkerOnce(input: WebhookDeliveryWorkerRunInput): Promise<WebhookDeliveryWorkerRunResult>;
export declare function createDeterministicWebhookDeliveryProvider(): WebhookDeliveryProvider;
export declare function createDisabledWebhookDeliveryProvider(reason?: string): WebhookDeliveryProvider;
export declare function createHttpWebhookDeliveryProvider(options?: {
    fetchImpl?: typeof fetch;
    signingSecret?: string;
    timeoutMs?: number;
}): WebhookDeliveryProvider;
export declare function resolveWebhookDeliveryFailureState(input: WebhookDeliveryFailureStateInput): WebhookDeliveryFailureState;
