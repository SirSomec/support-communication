import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureAutomationRepository } from "./bootstrap.js";
import { runBotScenarioPurgeOnce } from "./bot-scenario-purge.worker.js";

export async function runBotScenarioPurgeFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const intervalMs = positiveInteger(source.BOT_SCENARIO_PURGE_INTERVAL_MS, 60 * 60 * 1000);
  const limit = positiveInteger(source.BOT_SCENARIO_PURGE_LIMIT, 50);
  const repository = configureAutomationRepository(source);
  const run = async () => {
    const result = await runBotScenarioPurgeOnce({ automationRepository: repository, limit });
    writeStructuredLog("info", "Bot scenario retention purge completed", { ...result, operation: "bot-scenario.purge", service: "bot-scenario-purge-worker" });
    return result;
  };
  const first = await run();
  if (argv.includes("--once") || source.BOT_SCENARIO_PURGE_ONCE === "true") { console.log(JSON.stringify({ result: first, service: "bot-scenario-purge-worker" })); return; }
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    void run().catch((error) => writeStructuredLog("error", "Bot scenario retention purge failed", { error: error instanceof Error ? error.message : String(error), operation: "bot-scenario.purge", service: "bot-scenario-purge-worker" })).finally(() => { running = false; });
  }, intervalMs);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runBotScenarioPurgeFromEnv().catch((error) => { writeStructuredLog("error", "Bot scenario retention purge worker failed", { error: error instanceof Error ? error.message : String(error), operation: "bot-scenario.purge.bootstrap", service: "bot-scenario-purge-worker" }); process.exitCode = 1; });
}
