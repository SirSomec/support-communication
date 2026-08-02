export async function executeQuotaExpirationWorkerOnce(input) {
    const claim = await claimExpiredQuotaReservationsForWorker(input);
    let released = 0;
    let skipped = 0;
    for (const reservation of claim.claimed) {
        const result = await releaseExpiredQuotaReservationForWorker({
            releasedAt: claim.claimedAt,
            repository: input.repository,
            reservation
        });
        if (result.status === "released")
            released += 1;
        else
            skipped += 1;
    }
    return {
        claimed: claim.claimed.length,
        released,
        skipped
    };
}
export async function claimExpiredQuotaReservationsForWorker(input) {
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
export async function releaseExpiredQuotaReservationForWorker(input) {
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
function toWorkerDate(value) {
    return value instanceof Date ? value : new Date(value);
}
function positiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
function expiredReleaseIdempotencyKey(reservationId) {
    return `quota-expiration-release:${reservationId}`;
}
function isExpiredReleaseReplay(reservation) {
    return reservation.status === "released"
        && reservation.releaseIdempotencyKey === expiredReleaseIdempotencyKey(reservation.id);
}
function buildExpiredReleaseAuditEvent(reservation, releasedAt, traceId) {
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
//# sourceMappingURL=quota-expiration.worker.js.map