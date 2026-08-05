import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeStructuredLog } from "@support-communication/observability";
import { configureBillingRepository } from "./bootstrap.js";
import { BillingService } from "./billing.service.js";

export async function runDailyBillingWorkerFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const intervalMs = positiveInteger(source.DAILY_BILLING_WORKER_INTERVAL_MS, 60 * 60 * 1000);
  const once = argv.includes("--once") || source.DAILY_BILLING_WORKER_ONCE === "true";
  const service = new BillingService(configureBillingRepository(source));
  const runOnce = async () => {
    const result = await service.chargeDailySubscriptions();
    writeStructuredLog("info", "Daily billing worker run completed", { ...result, operation: "billing.daily-charge.run", service: "daily-billing-worker" });
    return result;
  };
  const first = await runOnce();
  if (once) {
    console.log(JSON.stringify({ result: first, service: "daily-billing-worker" }));
    return;
  }
  setInterval(() => void runOnce().catch((error) => writeStructuredLog("error", "Daily billing worker run failed", { error: error instanceof Error ? error.message : String(error), operation: "billing.daily-charge.run", service: "daily-billing-worker" })), intervalMs);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runDailyBillingWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Daily billing worker failed", { error: error instanceof Error ? error.message : String(error), operation: "billing.daily-charge.bootstrap", service: "daily-billing-worker" });
    process.exitCode = 1;
  });
}
