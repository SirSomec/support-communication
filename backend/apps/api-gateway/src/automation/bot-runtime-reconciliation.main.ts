import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureConversationRealtimeFanout, configureConversationRepository } from "../conversation/bootstrap.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { configureAutomationRepository } from "./bootstrap.js";
import { runBotRuntimeReconciliationOnce } from "./bot-runtime-reconciliation.worker.js";
import { runBotRuntimeRetryOnce } from "./bot-runtime-retry.worker.js";
import { QueueDirectoryRepository } from "../routing/queue-directory.repository.js";

export async function runBotRuntimeReconciliationFromEnv(source: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Promise<void> {
  const intervalMs = positive(source.BOT_RUNTIME_RECONCILIATION_INTERVAL_MS, 5_000);
  const conversationRepository = configureConversationRepository(source);
  const realtimeFanout = configureConversationRealtimeFanout(source);
  // Закрытие решённых ботом обращений идёт через штатный сервис диалогов:
  // история, resolutionOutcome, журнал, realtime и CSAT-опрос — как у оператора.
  const conversationService = new ConversationService(conversationRepository, { realtimeFanout });
  const automationRepository = configureAutomationRepository(source);
  const queueDirectoryRepository = new QueueDirectoryRepository();
  const input = {
    automationRepository,
    closeConversation: (payload: { conversationId: string; reason: string; resolutionOutcome: string; topic?: string }, scope: { tenantId: string }) =>
      conversationService.transitionConversationStatus({ ...payload, nextStatus: "closed" }, scope),
    conversationRepository,
    leaseMs: positive(source.BOT_RUNTIME_RECONCILIATION_LEASE_MS, 30_000),
    limit: positive(source.BOT_RUNTIME_RECONCILIATION_LIMIT, 50),
    maxAttempts: positive(source.BOT_RUNTIME_RECONCILIATION_MAX_ATTEMPTS, 5),
    realtimeFanout,
    resolveQueueId: async (tenantId: string, queueReference: string) => {
      const normalized = queueReference.trim();
      if (!normalized) return undefined;
      const queues = await queueDirectoryRepository.listQueues(tenantId, "active");
      return queues.find((queue) => queue.id === normalized || queue.name.trim().toLocaleLowerCase("ru") === normalized.toLocaleLowerCase("ru"))?.id;
    },
    retryBackoffMs: positive(source.BOT_RUNTIME_RECONCILIATION_RETRY_MS, 5_000)
  };
  const run = async () => {
    const runtimeRetries = await runBotRuntimeRetryOnce({
      automationRepository,
      leaseMs: positive(source.BOT_RUNTIME_RETRY_LEASE_MS, 30_000),
      limit: positive(source.BOT_RUNTIME_RETRY_LIMIT, 50),
      maxAttempts: positive(source.BOT_RUNTIME_RECONCILIATION_MAX_ATTEMPTS, 5)
    });
    const sideEffects = await runBotRuntimeReconciliationOnce(input);
    const result = { runtimeRetries, sideEffects };
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
