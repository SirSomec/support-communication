import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureConversationRealtimeFanout, configureConversationRepository } from "../conversation/bootstrap.js";
import { configureAutomationRepository } from "./bootstrap.js";
import { runBotRuntimeReconciliationOnce } from "./bot-runtime-reconciliation.worker.js";

export async function runBotRuntimeReconciliationFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const intervalMs = positive(source.BOT_RUNTIME_RECONCILIATION_INTERVAL_MS, 5_000);
  const conversationRepository = configureConversationRepository(source);
  const realtimeFanout = configureConversationRealtimeFanout(source);
  const input = {
    automationRepository: configureAutomationRepository(source),
    conversationRepository,
    leaseMs: positive(source.BOT_RUNTIME_RECONCILIATION_LEASE_MS, 30_000),
    limit: positive(source.BOT_RUNTIME_RECONCILIATION_LIMIT, 50),
    maxAttempts: positive(source.BOT_RUNTIME_RECONCILIATION_MAX_ATTEMPTS, 5),
    realtimeFanout,
    retryBackoffMs: positive(source.BOT_RUNTIME_RECONCILIATION_RETRY_MS, 5_000)
  };
  const run = async () => {
    const result = await runBotRuntimeReconciliationOnce(input);
    writeStructuredLog("info", "Bot runtime reconciliation completed", {
      ...result,
      operation: "bot-runtime.reconcile",
      service: "bot-runtime-reconciliation-worker"
    });
    return result;
  };
  const first = await run();
  if (argv.includes("--once") || source.BOT_RUNTIME_RECONCILIATION_ONCE === "true") {
    console.log(JSON.stringify({ result: first, service: "bot-runtime-reconciliation-worker" }));
    return;
  }
  let running = false;
  setInterval(() => {
    if (running) return;
    running = true;
    void run()
      .catch((error) => writeStructuredLog("error", "Bot runtime reconciliation failed", {
        error: error instanceof Error ? error.message : String(error),
        operation: "bot-runtime.reconcile",
        service: "bot-runtime-reconciliation-worker"
      }))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runBotRuntimeReconciliationFromEnv().catch((error) => {
    writeStructuredLog("error", "Bot runtime reconciliation worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "bot-runtime.reconcile.bootstrap",
      service: "bot-runtime-reconciliation-worker"
    });
    process.exitCode = 1;
  });
}
