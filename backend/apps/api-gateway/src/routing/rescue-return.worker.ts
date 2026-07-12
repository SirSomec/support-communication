import type { RoutingJobDescriptor, RoutingRepository, RoutingRescueReturnApplyResult } from "./routing.repository.js";

interface RescueReturnClaimWorkerInput {
  leaseDurationMs?: number;
  limit?: number;
  now?: Date;
  routingRepository: Pick<RoutingRepository, "claimJob" | "listJobs">;
  workerId?: string;
}

interface RescueReturnApplyWorkerInput {
  completedAt?: Date;
  job: RoutingJobDescriptor;
  routingRepository: Pick<RoutingRepository, "applyRescueReturnTransition">;
}

interface RescueReturnClaimWorkerResult {
  claimed: RoutingJobDescriptor[];
}

type RescueReturnApplyWorkerResult = RoutingRescueReturnApplyResult;

export async function claimExpiredRescueReturnJobs(input: RescueReturnClaimWorkerInput): Promise<RescueReturnClaimWorkerResult> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.trunc(input.limit ?? 1));
  const jobs = await input.routingRepository.listJobs();
  const dueJobs = jobs
    .filter((job) => isClaimableRescueReturnJob(job, now))
    .sort(compareJobDueAt)
    .slice(0, limit);

  const claimed: RoutingJobDescriptor[] = [];
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

export async function applyRescueReturnTransition(input: RescueReturnApplyWorkerInput): Promise<RescueReturnApplyWorkerResult> {
  const completedAt = (input.completedAt ?? new Date()).toISOString();
  return input.routingRepository.applyRescueReturnTransition({
    completedAt,
    fallbackConversationId: input.job.conversationId ?? null,
    jobId: input.job.id,
    ...(input.job.leaseOwner ? { leaseOwner: input.job.leaseOwner } : {}),
    tenantId: input.job.tenantId
  });
}

function isDue(runAt: RoutingJobDescriptor["runAt"], now: Date): boolean {
  if (runAt === undefined) {
    return true;
  }
  const dueAt = new Date(runAt).getTime();
  return Number.isFinite(dueAt) && dueAt <= now.getTime();
}

function isClaimableRescueReturnJob(job: RoutingJobDescriptor, now: Date): boolean {
  return job.queue === "rescue-return"
    && job.action === "return_to_sla_queue"
    && ((job.status ?? "pending") === "pending"
      || ((job.status ?? "pending") === "claimed"
        && (typeof job.leaseExpiresAt !== "string" || isDue(job.leaseExpiresAt, now))))
    && isDue(job.runAt, now);
}

function compareJobDueAt(left: RoutingJobDescriptor, right: RoutingJobDescriptor): number {
  return jobDueAt(left) - jobDueAt(right);
}

function jobDueAt(job: RoutingJobDescriptor): number {
  if (job.runAt === undefined) {
    return 0;
  }
  const dueAt = new Date(job.runAt).getTime();
  return Number.isFinite(dueAt) ? dueAt : Number.POSITIVE_INFINITY;
}
