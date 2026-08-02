export async function claimExpiredRescueReturnJobs(input) {
    const now = input.now ?? new Date();
    const limit = Math.max(1, Math.trunc(input.limit ?? 1));
    const jobs = await input.routingRepository.listJobs();
    const dueJobs = jobs
        .filter((job) => isClaimableRescueReturnJob(job, now))
        .sort(compareJobDueAt)
        .slice(0, limit);
    const claimed = [];
    for (const job of dueJobs) {
        const current = await input.routingRepository.claimJob({
            claimedAt: now.toISOString(),
            expectedLeaseExpiresAt: job.leaseExpiresAt ?? null,
            expectedLeaseOwner: job.leaseOwner ?? null,
            expectedStatus: job.status ?? null,
            jobId: job.id,
            ...(input.leaseDurationMs ? { leaseDurationMs: input.leaseDurationMs } : {}),
            queue: job.queue,
            ...(input.workerId ? { workerId: input.workerId } : {})
        });
        if (current) {
            claimed.push(current);
        }
    }
    return { claimed };
}
export async function applyRescueReturnTransition(input) {
    const completedAt = (input.completedAt ?? new Date()).toISOString();
    return input.routingRepository.applyRescueReturnTransition({
        completedAt,
        fallbackConversationId: input.job.conversationId ?? null,
        jobId: input.job.id,
        ...(input.job.leaseOwner ? { leaseOwner: input.job.leaseOwner } : {}),
        tenantId: input.job.tenantId
    });
}
function isDue(runAt, now) {
    if (runAt === undefined) {
        return true;
    }
    const dueAt = new Date(runAt).getTime();
    return Number.isFinite(dueAt) && dueAt <= now.getTime();
}
function isClaimableRescueReturnJob(job, now) {
    return job.queue === "rescue-return"
        && job.action === "return_to_sla_queue"
        && ((job.status ?? "pending") === "pending"
            || ((job.status ?? "pending") === "claimed"
                && (typeof job.leaseExpiresAt !== "string" || isDue(job.leaseExpiresAt, now))))
        && isDue(job.runAt, now);
}
function compareJobDueAt(left, right) {
    return jobDueAt(left) - jobDueAt(right);
}
function jobDueAt(job) {
    if (job.runAt === undefined) {
        return 0;
    }
    const dueAt = new Date(job.runAt).getTime();
    return Number.isFinite(dueAt) ? dueAt : Number.POSITIVE_INFINITY;
}
//# sourceMappingURL=rescue-return.worker.js.map