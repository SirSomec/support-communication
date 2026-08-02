import type { ServiceAdminActor } from "../identity/service-admin-auth.js";
import type { PlatformAuditOutboxRepository, PlatformAuditRow, PlatformOutboxRow } from "./platform.repository.js";
export type PlatformMutationKind = "alert" | "incident" | "rollout";
interface PersistPlatformIncidentMutationInput {
    actor?: ServiceAdminActor;
    customerVisible: boolean;
    idempotencyKey?: string;
    incidentId: string;
    message: string;
    reason: string;
    repository: PlatformAuditOutboxRepository;
    status: string;
    traceId: string;
}
interface PersistPlatformAlertMutationInput {
    actor?: ServiceAdminActor;
    componentId: string;
    idempotencyKey: string;
    reason: string;
    repository: PlatformAuditOutboxRepository;
    traceId: string;
}
interface PersistPlatformRolloutMutationInput {
    actor?: ServiceAdminActor;
    enabledTenantIds?: string[];
    flagKey: string;
    idempotencyKey: string;
    idempotencyPayload?: Record<string, unknown>;
    reason: string;
    repository: PlatformAuditOutboxRepository;
    rollout: number;
    status: string;
    traceId: string;
}
export interface PlatformMutationPersistenceResult {
    audit: PlatformAuditRow;
    outbox: PlatformOutboxRow | null;
}
export interface PlatformAuditOutboxAsyncRepository {
    findPlatformAuditRowAsync(idempotencyKey: string): Promise<PlatformAuditRow | undefined>;
    findPlatformOutboxRowAsync(idempotencyKey: string): Promise<PlatformOutboxRow | undefined>;
    savePlatformAuditRowAsync(row: PlatformAuditRow): Promise<PlatformAuditRow>;
    savePlatformOutboxRowAsync(row: PlatformOutboxRow): Promise<PlatformOutboxRow>;
}
export declare function persistPlatformIncidentMutation(input: PersistPlatformIncidentMutationInput): PlatformMutationPersistenceResult;
export declare function persistPlatformIncidentMutationAsync(input: Omit<PersistPlatformIncidentMutationInput, "repository"> & {
    repository: PlatformAuditOutboxAsyncRepository;
}): Promise<PlatformMutationPersistenceResult>;
export declare function persistPlatformAlertMutation(input: PersistPlatformAlertMutationInput): PlatformMutationPersistenceResult;
export declare function persistPlatformAlertMutationAsync(input: Omit<PersistPlatformAlertMutationInput, "repository"> & {
    repository: PlatformAuditOutboxAsyncRepository;
}): Promise<PlatformMutationPersistenceResult>;
export declare function persistPlatformRolloutMutation(input: PersistPlatformRolloutMutationInput): PlatformMutationPersistenceResult;
export declare function persistPlatformRolloutMutationAsync(input: Omit<PersistPlatformRolloutMutationInput, "repository"> & {
    repository: PlatformAuditOutboxAsyncRepository;
}): Promise<PlatformMutationPersistenceResult>;
export declare function buildPlatformAuditIdempotencyKey(kind: PlatformMutationKind, idempotencyKey: string | undefined, target: string): string;
export declare function makeEphemeralPlatformMutationIdempotencyKey(scope: string): string;
export {};
