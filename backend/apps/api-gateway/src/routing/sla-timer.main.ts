import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureRoutingRepository } from "./bootstrap.js";
import type { RoutingJobDescriptor, RoutingRepository } from "./routing.repository.js";
import {
  applySlaTimerTransition,
  claimDueSlaTimerJobs,
  planSlaTimerTransition
} from "./sla-timer.worker.js";
import {
  installRoutingWorkerShutdownHandlers,
  loadRoutingWorkerRuntimeConfig,
  positiveInteger,
  runRoutingWorkerRuntime,
  type RoutingWorkerRunSummary
} from "./routing-worker.runtime.js";

interface SlaTimerWorkerConfig {
  leaseDurationMs?: number;
  limit: number;
  maxAttempts: number;
  retryBackoffMs: number;
  workerId?: string;
}

export async function executeSlaTimerWorkerOnce(
  repository: RoutingRepository,
  config: SlaTimerWorkerConfig,
  now = new Date()
): Promise<RoutingWorkerRunSummary> {
  const jobs = (await claimDueSlaTimerJobs({
    leaseDurationMs: config.leaseDurationMs,
    limit: config.limit,
    now,
    routingRepository: repository,
    workerId: config.workerId
  })).claimed;
  const summary: RoutingWorkerRunSummary = { applied: 0, claimed: jobs.length, deadLettered: 0, failed: 0, skipped: 0 };
  for (const job of jobs) {
    try {
      const state = await repository.hydrateStateSnapshot();
      const conversation = state.conversations.find((item) => item.id === job.conversationId);
      if (!conversation) {
        throw new Error(`sla_timer_conversation_not_found:${job.conversationId ?? "missing"}`);
      }
      const transition = planSlaTimerTransition({ conversation, job, now });
      if (transition.status !== "ready") {
        await completeSkippedJob(repository, job, now);
        summary.skipped += 1;
        continue;
      }
      const result = await applySlaTimerTransition({ completedAt: now, routingRepository: repository, transition });
      if (result.status === "applied") {
        summary.applied += 1;
      } else {
        await completeSkippedJob(repository, job, now);
        summary.skipped += 1;
      }
    } catch (error) {
      const failed = await recordOwnedSlaFailure(repository, job, error, config, now);
      if (!failed) {
        summary.skipped += 1;
        continue;
      }
      summary.failed += 1;
      if (failed.status === "dead_lettered") {
        summary.deadLettered += 1;
      }
    }
  }
  return summary;
}

export async function runSlaTimerWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const runtime = loadRoutingWorkerRuntimeConfig(source, argv, "SLA_TIMER");
  const worker = {
    limit: positiveInteger(source.SLA_TIMER_WORKER_LIMIT, 50),
    leaseDurationMs: runtime.leaseMs,
    maxAttempts: positiveInteger(source.SLA_TIMER_WORKER_MAX_ATTEMPTS, 5),
    retryBackoffMs: positiveInteger(source.SLA_TIMER_WORKER_RETRY_BACKOFF_MS, 60_000),
    workerId: runtime.workerId
  };
  const repository = configureRoutingRepository(source);
  const controller = new AbortController();
  const removeHandlers = installRoutingWorkerShutdownHandlers(controller, "sla-timer-worker");
  try {
    await runRoutingWorkerRuntime({
      config: runtime,
      executeOnce: () => executeSlaTimerWorkerOnce(repository, worker),
      serviceName: "sla-timer-worker",
      signal: controller.signal
    });
  } finally {
    removeHandlers();
  }
}

async function completeSkippedJob(repository: RoutingRepository, job: RoutingJobDescriptor, now: Date): Promise<void> {
  const current = (await repository.listJobs()).find((item) => item.id === job.id);
  if (ownsActiveLease(current, job.leaseOwner, now)) {
    await repository.saveJob({ ...current, completedAt: now.toISOString(), leaseExpiresAt: undefined, leaseOwner: undefined, status: "completed" });
  }
}

async function recordOwnedSlaFailure(
  repository: RoutingRepository,
  claimedJob: RoutingJobDescriptor,
  error: unknown,
  config: SlaTimerWorkerConfig,
  now: Date
): Promise<RoutingJobDescriptor | undefined> {
  const current = (await repository.listJobs()).find((item) => item.id === claimedJob.id);
  if (!ownsActiveLease(current, claimedJob.leaseOwner, now)) {
    return undefined;
  }
  const attempts = Math.max(0, current.attempts ?? 0) + 1;
  const exhausted = attempts >= config.maxAttempts;
  return repository.saveJob({
    ...current,
    attempts,
    claimedAt: undefined,
    completedAt: undefined,
    deadLetteredAt: exhausted ? now.toISOString() : undefined,
    lastError: error instanceof Error ? error.message : String(error),
    leaseExpiresAt: undefined,
    leaseOwner: undefined,
    nextAttemptAt: exhausted ? null : new Date(now.getTime() + config.retryBackoffMs).toISOString(),
    status: exhausted ? "dead_lettered" : "failed"
  });
}

function ownsActiveLease(
  job: RoutingJobDescriptor | undefined,
  leaseOwner: string | undefined,
  now: Date
): job is RoutingJobDescriptor {
  if (!job || job.status !== "claimed" || !leaseOwner || job.leaseOwner !== leaseOwner) {
    return false;
  }
  const leaseExpiresAt = typeof job.leaseExpiresAt === "string" ? new Date(job.leaseExpiresAt).getTime() : Number.NaN;
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt > now.getTime();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runSlaTimerWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "SLA timer worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "routing.sla-timer.bootstrap",
      service: "sla-timer-worker"
    });
    process.exitCode = 1;
  });
}
