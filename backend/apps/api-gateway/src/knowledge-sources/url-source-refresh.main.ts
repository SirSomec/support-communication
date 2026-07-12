import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { KnowledgeSourcesService } from "./knowledge-sources.service.js";
import { runUrlSourceRefreshOnce } from "./url-source-refresh.worker.js";

export async function runUrlSourceRefreshFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const intervalMs = positive(source.URL_SOURCE_REFRESH_INTERVAL_MS, 60_000);
  const service = new KnowledgeSourcesService();
  const run = async () => {
    const result = await runUrlSourceRefreshOnce(service);
    writeStructuredLog("info", "URL knowledge source refresh completed", { ...result, operation: "knowledge-source.url.refresh", service: "url-source-refresh-worker" });
    return result;
  };
  const first = await run();
  if (argv.includes("--once") || source.URL_SOURCE_REFRESH_ONCE === "true") { console.log(JSON.stringify({ result: first, service: "url-source-refresh-worker" })); return; }
  let running = false;
  setInterval(() => { if (running) return; running = true; void run().catch((error) => writeStructuredLog("error", "URL knowledge source refresh failed", { error: error instanceof Error ? error.message : String(error), operation: "knowledge-source.url.refresh", service: "url-source-refresh-worker" })).finally(() => { running = false; }); }, intervalMs);
}
function positive(value: string | undefined, fallback: number): number { const parsed = Number(value ?? fallback); return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback; }
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) void runUrlSourceRefreshFromEnv().catch((error) => { writeStructuredLog("error", "URL source refresh worker failed", { error: error instanceof Error ? error.message : String(error), operation: "knowledge-source.url.refresh.bootstrap", service: "url-source-refresh-worker" }); process.exitCode = 1; });
