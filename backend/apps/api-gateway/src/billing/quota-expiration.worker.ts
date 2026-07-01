import type {
  BillingAuditEvent,
  BillingExpiredQuotaReservationReleaseInput,
  BillingQuotaReservation,
  BillingQuotaReservationClaimInput
} from "./billing.repository.js";

type MaybePromise<T> = T | Promise<T>;

export interface QuotaExpirationClaimRepository {
  claimExpiredQuotaReservations(input?: BillingQuotaReservationClaimInput): MaybePromise<BillingQuotaReservation[]>;
}

export interface QuotaExpirationReleaseRepository {
  releaseExpiredQuotaReservation(input: BillingExpiredQuotaReservationReleaseInput): MaybePromise<BillingQuotaReservation | undefined>;
}

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

export type ReleaseExpiredQuotaReservationForWorkerResult =
  | {
      reservation: BillingQuotaReservation;
      reservationId: string;
      status: "released";
    }
  | {
      reason: "already_committed" | "already_released" | "not_claimed" | "not_released";
      reservationId: string;
      status: "skipped";
    };

export async function claimExpiredQuotaReservationsForWorker(
  input: ClaimExpiredQuotaReservationsForWorkerInput
): Promise<ClaimExpiredQuotaReservationsForWorkerResult> {
  const claimedAt = toWorkerDate(input.now ?? new Date()).toISOString();
  const leaseTimeoutMs = positiveInteger(input.leaseTimeoutMs) ?? 300_000;
  const limit = positiveInteger(input.limit) ?? 100;
  const claimed = await input.repository.claimExpiredQuotaReservations({
    leaseTimeoutMs,
    limit,
    now: claimedAt
  });

  return {
    claimed,
    claimedAt,
    leaseTimeoutMs,
    limit
  };
}

export async function releaseExpiredQuotaReservationForWorker(
  input: ReleaseExpiredQuotaReservationForWorkerInput
): Promise<ReleaseExpiredQuotaReservationForWorkerResult> {
  const releasedAt = toWorkerDate(input.releasedAt ?? new Date()).toISOString();
  if (isExpiredReleaseReplay(input.reservation)) {
    return {
      reservation: input.reservation,
      reservationId: input.reservation.id,
      status: "released"
    };
  }
  if (input.reservation.status === "committed") {
    return {
      reason: "already_committed",
      reservationId: input.reservation.id,
      status: "skipped"
    };
  }
  if (input.reservation.status === "released") {
    return {
      reason: "already_released",
      reservationId: input.reservation.id,
      status: "skipped"
    };
  }
  if (!input.reservation.lockedAt) {
    return {
      reason: "not_claimed",
      reservationId: input.reservation.id,
      status: "skipped"
    };
  }

  const traceId = input.traceId ?? `quota-expiration-release:${input.reservation.id}`;
  const released = await input.repository.releaseExpiredQuotaReservation({
    auditEvent: buildExpiredReleaseAuditEvent(input.reservation, releasedAt, traceId),
    idempotencyKey: expiredReleaseIdempotencyKey(input.reservation.id),
    lockedAt: input.reservation.lockedAt,
    releasedAt,
    reservationId: input.reservation.id,
    traceId
  });

  if (!released) {
    return {
      reason: "not_released",
      reservationId: input.reservation.id,
      status: "skipped"
    };
  }

  return {
    reservation: released,
    reservationId: released.id,
    status: "released"
  };
}

function toWorkerDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function expiredReleaseIdempotencyKey(reservationId: string): string {
  return `quota-expiration-release:${reservationId}`;
}

function isExpiredReleaseReplay(reservation: BillingQuotaReservation): boolean {
  return reservation.status === "released"
    && reservation.releaseIdempotencyKey === expiredReleaseIdempotencyKey(reservation.id);
}

function buildExpiredReleaseAuditEvent(
  reservation: BillingQuotaReservation,
  releasedAt: string,
  traceId: string
): BillingAuditEvent {
  return {
    action: "quota.expired.release",
    actor: "quota-expiration-worker",
    actorName: "Quota Expiration Worker",
    at: releasedAt,
    id: `evt_quota_expired_release_${reservation.id}`,
    immutable: true,
    reason: "quota_reservation_expired",
    result: "released",
    severity: "info",
    target: reservation.id,
    tenantId: reservation.tenantId,
    traceId
  };
}
