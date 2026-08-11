import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureBillingRepository } from "../billing/bootstrap.js";
import { configurePlatformRepository } from "../platform/bootstrap.js";
import { MarketingService } from "./marketing.service.js";

export async function runMarketingBillingWorkerFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const intervalMs = positiveInteger(source.MARKETING_BILLING_INTERVAL_MS, 60 * 60 * 1000);
  const limit = positiveInteger(source.MARKETING_BILLING_BATCH_LIMIT, 10);
  const once = argv.includes("--once") || source.MARKETING_BILLING_ONCE === "true";
  configureBillingRepository(source);
  configurePlatformRepository(source);
  const service = new MarketingService();
  let running = false;
  const runOnce = async () => {
    const result = await service.billPendingOverage(limit);
    writeStructuredLog("info", "Marketing overage billing run completed", { ...result, operation: "marketing.billing.run", service: "marketing-billing-worker" });
    return result;
  };
  const first = await runOnce();
  if (once) { console.log(JSON.stringify({ result: first, service: "marketing-billing-worker" })); return; }
  setInterval(() => {
    if (running) return;
    running = true;
    void runOnce().catch((error) => writeStructuredLog("error", "Marketing overage billing run failed", { error: error instanceof Error ? error.message : String(error), operation: "marketing.billing.run", service: "marketing-billing-worker" })).finally(() => { running = false; });
  }, intervalMs);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runMarketingBillingWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Marketing billing worker bootstrap failed", { error: error instanceof Error ? error.message : String(error), operation: "marketing.billing.bootstrap", service: "marketing-billing-worker" });
    process.exitCode = 1;
  });
}
