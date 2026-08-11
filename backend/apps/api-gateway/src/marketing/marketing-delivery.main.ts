import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { MarketingService } from "./marketing.service.js";

export async function runMarketingDeliveryWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const intervalMs = positiveInteger(source.MARKETING_DELIVERY_INTERVAL_MS, 10_000);
  const limit = positiveInteger(source.MARKETING_DELIVERY_LIMIT, 50);
  const once = argv.includes("--once") || source.MARKETING_DELIVERY_ONCE === "true";
  const service = new MarketingService();
  let running = false;
  const runOnce = async () => {
    const result = await service.dispatchDueCampaigns(limit);
    writeStructuredLog("info", "Marketing delivery scheduler run completed", {
      ...result,
      operation: "marketing.delivery.schedule",
      service: "marketing-delivery-worker"
    });
    return result;
  };

  const first = await runOnce();
  if (once) {
    console.log(JSON.stringify({ result: first, service: "marketing-delivery-worker" }));
    return;
  }
  setInterval(() => {
    if (running) return;
    running = true;
    void runOnce().catch((error) => writeStructuredLog("error", "Marketing delivery scheduler run failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "marketing.delivery.schedule",
      service: "marketing-delivery-worker"
    })).finally(() => { running = false; });
  }, intervalMs);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runMarketingDeliveryWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Marketing delivery worker bootstrap failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "marketing.delivery.bootstrap",
      service: "marketing-delivery-worker"
    });
    process.exitCode = 1;
  });
}
