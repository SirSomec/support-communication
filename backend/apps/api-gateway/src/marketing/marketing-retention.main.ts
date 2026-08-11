import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { MarketingService } from "./marketing.service.js";

export async function runMarketingRetentionWorkerFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const intervalMs = positiveInteger(source.MARKETING_RETENTION_INTERVAL_MS, 24 * 60 * 60 * 1000);
  const retentionDays = positiveInteger(source.MARKETING_RETENTION_DAYS, 90);
  const once = argv.includes("--once") || source.MARKETING_RETENTION_ONCE === "true";
  const service = new MarketingService();
  let running = false;
  const runOnce = async () => {
    const result = await service.purgeExpiredData(retentionDays);
    writeStructuredLog("info", "Marketing retention run completed", { ...result, operation: "marketing.retention.run", retentionDays, service: "marketing-retention-worker" });
    return result;
  };
  const first = await runOnce();
  if (once) { console.log(JSON.stringify({ result: first, service: "marketing-retention-worker" })); return; }
  setInterval(() => {
    if (running) return;
    running = true;
    void runOnce().catch((error) => writeStructuredLog("error", "Marketing retention run failed", { error: error instanceof Error ? error.message : String(error), operation: "marketing.retention.run", service: "marketing-retention-worker" })).finally(() => { running = false; });
  }, intervalMs);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runMarketingRetentionWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Marketing retention worker bootstrap failed", { error: error instanceof Error ? error.message : String(error), operation: "marketing.retention.bootstrap", service: "marketing-retention-worker" });
    process.exitCode = 1;
  });
}
