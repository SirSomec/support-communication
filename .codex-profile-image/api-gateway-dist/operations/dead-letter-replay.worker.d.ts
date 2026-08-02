import { type DeadLetterMessage } from "./operations.types.js";
import { type OperationsDeadLetterReplayRequeueAuditRecord, type OperationsDeadLetterReplayValidationDenialRecord, type OperationsRepository } from "./operations.repository.js";
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
    replayDeadLettered(id: string, queue: string, reason: string, replayedAt?: Date, auditEvent?: DeadLetterReplayBackendAuditEvent): Promise<TItem>;
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
export declare function listKnownDeadLetterQueueNames(): string[];
export declare function resolveDeadLetterQueueOwnership(queueName: string): DeadLetterQueueOwnershipRecord | undefined;
export declare function validateDeadLetterQueueOwnership(message: Pick<DeadLetterMessage, "queueName" | "resourceType">): {
    code: string | null;
    message: string | null;
    ok: boolean;
    ownership: DeadLetterQueueOwnershipRecord | null;
};
export declare function buildDeadLetterReplayIdempotencyFingerprint(input: {
    messageId: string;
    reason: string;
    resourceId: string;
}): string;
export declare function validateDeadLetterReplayIdempotency(input: {
    fingerprint: string;
    idempotencyKey?: string;
    operationsRepository: OperationsRepository;
}): {
    cachedResult?: Record<string, unknown>;
    code?: "idempotency_key_reused";
    duplicate?: boolean;
    ok: boolean;
};
export declare function validateDeadLetterReplayIdempotencyAsync(input: {
    fingerprint: string;
    idempotencyKey?: string;
    operationsRepository: OperationsRepository;
}): Promise<{
    cachedResult?: Record<string, unknown>;
    code?: "idempotency_key_reused";
    duplicate?: boolean;
    ok: boolean;
}>;
export declare function requeueDeadLetterThroughReplayHelper<TItem extends DeadLetterReplayBackendItem>(input: {
    backendStore: DeadLetterReplayBackendStore<TItem>;
    id: string;
    now?: Date;
    queue: string;
    reason: string;
}): Promise<{
    auditEvent: DeadLetterReplayBackendAuditEvent;
    item: TItem;
}>;
export declare function executeDeadLetterReplayWorker(input: {
    backendStore: DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>;
    idempotencyKey?: string;
    message: DeadLetterMessage;
    now?: Date;
    operationsRepository: OperationsRepository;
    reason: string;
}): Promise<DeadLetterReplayWorkerResult>;
export declare function persistDeadLetterReplayValidationDenial(operationsRepository: OperationsRepository, record: OperationsDeadLetterReplayValidationDenialRecord): OperationsDeadLetterReplayValidationDenialRecord;
export declare function persistDeadLetterReplayRequeueAudit(operationsRepository: OperationsRepository, record: OperationsDeadLetterReplayRequeueAuditRecord): OperationsDeadLetterReplayRequeueAuditRecord;
export declare function createDeadLetterReplayConflictEnvelope(input: {
    code: string;
    message: string;
    messageId: string;
    queueName: string;
}): DeadLetterReplayWorkerConflictEnvelope;
export interface DeterministicDeadLetterReplayBackendStoreOptions {
    items?: Map<string, DeadLetterReplayBackendItem>;
    missingIds?: Set<string>;
    queueMismatches?: Set<string>;
}
export declare function createDeterministicDeadLetterReplayBackendStore(options?: DeterministicDeadLetterReplayBackendStoreOptions): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>;
export declare function createUnavailableDeadLetterReplayBackendStore(): DeadLetterReplayBackendStore<DeadLetterReplayBackendItem>;
