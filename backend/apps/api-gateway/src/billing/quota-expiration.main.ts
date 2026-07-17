import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeStructuredLog } from "@support-communication/observability";
import { configureBillingRepository } from "./bootstrap.js";
import { executeQuotaExpirationWorkerOnce } from "./quota-expiration.worker.js";

interface QuotaExpirationWorkerRuntimeConfig {
  intervalMs: number;
  leaseTimeoutMs: number;
  limit: number;
  now?: Date;
  once: boolean;
}

export async function runQuotaExpirationWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const config = loadQuotaExpirationWorkerRuntimeConfig(source, argv);
  const repository = configureBillingRepository(source);

  const runOnce = async () => {
    const result = await executeQuotaExpirationWorkerOnce({
      leaseTimeoutMs: config.leaseTimeoutMs,
      limit: config.limit,
      now: config.now ?? new Date(),
      repository
    });
    writeStructuredLog("info", "Quota expiration worker run completed", {
      ...result,
      operation: "billing.quota-expiration.run",
      service: "quota-expiration-worker"
    });
    return result;
  };

  const first = await runOnce();
  if (config.once) {
    console.log(JSON.stringify({ result: first, service: "quota-expiration-worker" }));
    return;
  }

  setInterval(() => {
    void runOnce().catch((error) => {
      writeStructuredLog("error", "Quota expiration worker run failed", {
        error: error instanceof Error ? error.message : String(error),
        operation: "billing.quota-expiration.run",
        service: "quota-expiration-worker"
      });
    });
  }, config.intervalMs);
}

export function loadQuotaExpirationWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): QuotaExpirationWorkerRuntimeConfig {
  const now = source.QUOTA_EXPIRATION_WORKER_NOW?.trim();
  return {
    intervalMs: positiveInteger(source.QUOTA_EXPIRATION_WORKER_INTERVAL_MS, 10_000),
    leaseTimeoutMs: positiveInteger(source.QUOTA_EXPIRATION_WORKER_LEASE_TIMEOUT_MS, 300_000),
    limit: positiveInteger(source.QUOTA_EXPIRATION_WORKER_LIMIT, 100),
    now: now ? new Date(now) : undefined,
    once: argv.includes("--once") || source.QUOTA_EXPIRATION_WORKER_ONCE === "true"
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runQuotaExpirationWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Quota expiration worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "billing.quota-expiration.bootstrap",
      service: "quota-expiration-worker"
    });
    process.exitCode = 1;
  });
}
