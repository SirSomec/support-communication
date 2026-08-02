import type { BillingExpiredQuotaReservationReleaseInput, BillingQuotaReservation, BillingQuotaReservationClaimInput } from "./billing.repository.js";
type MaybePromise<T> = T | Promise<T>;
export interface QuotaExpirationClaimRepository {
    claimExpiredQuotaReservations(input?: BillingQuotaReservationClaimInput): MaybePromise<BillingQuotaReservation[]>;
}
export interface QuotaExpirationReleaseRepository {
    releaseExpiredQuotaReservation(input: BillingExpiredQuotaReservationReleaseInput): MaybePromise<BillingQuotaReservation | undefined>;
}
export type QuotaExpirationRepository = QuotaExpirationClaimRepository & QuotaExpirationReleaseRepository;
export interface ClaimExpiredQuotaReservationsForWorkerInput {
    leaseTimeoutMs?: number;
    limit?: number;
    now?: Date | string;
    repository: QuotaExpirationClaimRepository;
}
export interface ClaimExpiredQuotaReservationsForWorkerResult {
    claimed: BillingQuotaReservation[];
    claimedAt: string;
    leaseTimeoutMs: number;
    limit: number;
}
export interface ReleaseExpiredQuotaReservationForWorkerInput {
    releasedAt?: Date | string;
    repository: QuotaExpirationReleaseRepository;
    reservation: BillingQuotaReservation;
    traceId?: string;
}
export type ReleaseExpiredQuotaReservationForWorkerResult = {
    reservation: BillingQuotaReservation;
    reservationId: string;
    status: "released";
} | {
    reason: "already_committed" | "already_released" | "not_claimed" | "not_released";
    reservationId: string;
    status: "skipped";
};
export interface ExecuteQuotaExpirationWorkerOnceInput {
    leaseTimeoutMs?: number;
    limit?: number;
    now?: Date | string;
    repository: QuotaExpirationRepository;
}
export interface ExecuteQuotaExpirationWorkerOnceResult {
    claimed: number;
    released: number;
    skipped: number;
}
export declare function executeQuotaExpirationWorkerOnce(input: ExecuteQuotaExpirationWorkerOnceInput): Promise<ExecuteQuotaExpirationWorkerOnceResult>;
export declare function claimExpiredQuotaReservationsForWorker(input: ClaimExpiredQuotaReservationsForWorkerInput): Promise<ClaimExpiredQuotaReservationsForWorkerResult>;
export declare function releaseExpiredQuotaReservationForWorker(input: ReleaseExpiredQuotaReservationForWorkerInput): Promise<ReleaseExpiredQuotaReservationForWorkerResult>;
export {};
