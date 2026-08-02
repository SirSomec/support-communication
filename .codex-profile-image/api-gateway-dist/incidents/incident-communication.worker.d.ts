import type { PlatformIncidentCommunicationAttempt, PlatformIncidentCommunicationDeadLetter, PlatformIncidentCommunicationRetry, PlatformRepository } from "../platform/platform.repository.js";
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
export declare function planCustomerVisibleIncidentCommunication(input: PlanCustomerVisibleIncidentCommunicationInput): CustomerVisibleIncidentCommunicationPlan;
export declare function planInternalIncidentCommunication(input: PlanCustomerVisibleIncidentCommunicationInput): InternalIncidentCommunicationPlan;
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
    listIncidentCommunicationAttempts(filters?: {
        incidentId?: string;
    }): PlatformIncidentCommunicationAttempt[];
    listIncidentCommunicationRetries(filters?: {
        attemptId?: string;
        incidentId?: string;
    }): PlatformIncidentCommunicationRetry[];
    saveIncidentCommunicationAttempt(attempt: PlatformIncidentCommunicationAttempt): PlatformIncidentCommunicationAttempt;
    saveIncidentCommunicationRetry(retry: PlatformIncidentCommunicationRetry): PlatformIncidentCommunicationRetry;
}
export interface IncidentCommunicationDeadLetterRepository {
    listIncidentCommunicationAttempts(filters?: {
        incidentId?: string;
    }): PlatformIncidentCommunicationAttempt[];
    listIncidentCommunicationRetries(filters?: {
        attemptId?: string;
        incidentId?: string;
    }): PlatformIncidentCommunicationRetry[];
    saveIncidentCommunicationAttempt(attempt: PlatformIncidentCommunicationAttempt): PlatformIncidentCommunicationAttempt;
    saveIncidentCommunicationDeadLetter(deadLetter: PlatformIncidentCommunicationDeadLetter): PlatformIncidentCommunicationDeadLetter;
}
export declare function persistIncidentCommunicationAttempt(input: PersistIncidentCommunicationAttemptInput): PlatformIncidentCommunicationAttempt;
export declare function resolveIncidentCommunicationFailureState(input: IncidentCommunicationFailureStateInput): IncidentCommunicationFailureState;
export declare function recordIncidentCommunicationRetryState(input: RecordIncidentCommunicationRetryStateInput): PlatformIncidentCommunicationRetry;
export declare function recordIncidentCommunicationDeadLetterState(input: RecordIncidentCommunicationDeadLetterStateInput): PlatformIncidentCommunicationDeadLetter;
