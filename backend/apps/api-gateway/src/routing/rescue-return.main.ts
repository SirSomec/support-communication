import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureRoutingRepository } from "./bootstrap.js";
import type { RoutingJobDescriptor, RoutingRepository } from "./routing.repository.js";
import { applyRescueReturnTransition, claimExpiredRescueReturnJobs } from "./rescue-return.worker.js";
import {
  installRoutingWorkerShutdownHandlers,
  loadRoutingWorkerRuntimeConfig,
  positiveInteger,
  runRoutingWorkerRuntime,
  type RoutingWorkerRunSummary
} from "./routing-worker.runtime.js";

interface RescueReturnWorkerConfig {
  leaseDurationMs?: number;
  limit: number;
  maxAttempts: number;
  retryBackoffMs: number;
  workerId?: string;
}

export async function executeRescueReturnWorkerOnce(
  repository: RoutingRepository,
  config: RescueReturnWorkerConfig,
  now = new Date()
): Promise<RoutingWorkerRunSummary> {
  const jobs = (await claimExpiredRescueReturnJobs({
    leaseDurationMs: config.leaseDurationMs,
    limit: config.limit,
    now,
    routingRepository: repository,
    workerId: config.workerId
  })).claimed;
  const summary: RoutingWorkerRunSummary = { applied: 0, claimed: jobs.length, deadLettered: 0, failed: 0, skipped: 0 };
  for (const job of jobs) {
    try {
      const result = await applyRescueReturnTransition({ completedAt: now, job, routingRepository: repository });
      if (result.status === "applied") {
        summary.applied += 1;
      } else {
        await completeSkippedJob(repository, job, now);
        summary.skipped += 1;
      }
    } catch (error) {
      const failed = await recordRescueReturnFailure(repository, job, error, config, now);
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

export async function runRescueReturnWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const runtime = loadRoutingWorkerRuntimeConfig(source, argv, "RESCUE_RETURN");
  const worker = {
    limit: positiveInteger(source.RESCUE_RETURN_WORKER_LIMIT, 50),
    leaseDurationMs: runtime.leaseMs,
    maxAttempts: positiveInteger(source.RESCUE_RETURN_WORKER_MAX_ATTEMPTS, 5),
    retryBackoffMs: positiveInteger(source.RESCUE_RETURN_WORKER_RETRY_BACKOFF_MS, 60_000),
    workerId: runtime.workerId
  };
  const repository = configureRoutingRepository(source);
  const controller = new AbortController();
  const removeHandlers = installRoutingWorkerShutdownHandlers(controller, "rescue-return-worker");
  try {
    await runRoutingWorkerRuntime({
      config: runtime,
      executeOnce: () => executeRescueReturnWorkerOnce(repository, worker),
      serviceName: "rescue-return-worker",
      signal: controller.signal
    });
  } finally {
    removeHandlers();
  }
}

async function recordRescueReturnFailure(
  repository: RoutingRepository,
  job: RoutingJobDescriptor,
  error: unknown,
  config: RescueReturnWorkerConfig,
  now: Date
): Promise<RoutingJobDescriptor | undefined> {
  const current = (await repository.listJobs()).find((item) => item.id === job.id) ?? job;
  if (!ownsActiveLease(current, job.leaseOwner, now)) {
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
    runAt: exhausted ? current.runAt : now.getTime() + config.retryBackoffMs,
    status: exhausted ? "dead_lettered" : "pending"
  });
}

async function completeSkippedJob(repository: RoutingRepository, job: RoutingJobDescriptor, now: Date): Promise<void> {
  const current = (await repository.listJobs()).find((item) => item.id === job.id);
  if (ownsActiveLease(current, job.leaseOwner, now)) {
    await repository.saveJob({ ...current, completedAt: now.toISOString(), leaseExpiresAt: undefined, leaseOwner: undefined, status: "completed" });
  }
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
  void runRescueReturnWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Rescue return worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "routing.rescue-return.bootstrap",
      service: "rescue-return-worker"
    });
    process.exitCode = 1;
  });
}
