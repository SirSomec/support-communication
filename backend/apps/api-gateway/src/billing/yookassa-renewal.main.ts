import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeStructuredLog } from "@support-communication/observability";
import { configureBillingRepository } from "./bootstrap.js";
import { BillingService } from "./billing.service.js";

export async function runYooKassaRenewalWorkerFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const intervalMs = positiveInteger(source.YOOKASSA_RENEWAL_WORKER_INTERVAL_MS, 60 * 60 * 1000);
  const once = argv.includes("--once") || source.YOOKASSA_RENEWAL_WORKER_ONCE === "true";
  const service = new BillingService(configureBillingRepository(source));
  const runOnce = async () => {
    const result = await service.renewDueYooKassaSubscriptions();
    writeStructuredLog("info", "YooKassa renewal worker run completed", { ...result, operation: "billing.yookassa-renewal.run", service: "yookassa-renewal-worker" });
    return result;
  };
  const first = await runOnce();
  if (once) {
    console.log(JSON.stringify({ result: first, service: "yookassa-renewal-worker" }));
    return;
  }
  setInterval(() => void runOnce().catch((error) => writeStructuredLog("error", "YooKassa renewal worker run failed", { error: error instanceof Error ? error.message : String(error), operation: "billing.yookassa-renewal.run", service: "yookassa-renewal-worker" })), intervalMs);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runYooKassaRenewalWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "YooKassa renewal worker failed", { error: error instanceof Error ? error.message : String(error), operation: "billing.yookassa-renewal.bootstrap", service: "yookassa-renewal-worker" });
    process.exitCode = 1;
  });
}
