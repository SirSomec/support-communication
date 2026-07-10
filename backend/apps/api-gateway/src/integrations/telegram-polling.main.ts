import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeStructuredLog } from "@support-communication/observability";
import { configureConversationRepository } from "../conversation/bootstrap.js";
import { ConversationService } from "../conversation/conversation.service.js";
import { configureIntegrationRepository } from "./bootstrap.js";
import { pollTelegramUpdatesOnce, startTelegramPollingWorker } from "./telegram-polling.worker.js";

interface TelegramPollingRuntimeConfig {
  enabled: boolean;
  apiBaseUrl: string;
  ingressMode: "disabled" | "polling" | "webhook";
  intervalMs: number;
  limit: number;
  timeoutMs: number;
}

export function runTelegramPollingWorkerFromEnv(source: NodeJS.ProcessEnv = process.env): void {
  const config = loadTelegramPollingRuntimeConfig(source);
  const conversationRepository = configureConversationRepository(source);
  const integrationRepository = configureIntegrationRepository(source);
  const conversationService = new ConversationService(conversationRepository);
  const offsets = new Map<string, number>();

  startTelegramPollingWorker({
    intervalMs: config.intervalMs,
    onError(error) {
      writeStructuredLog("error", "Telegram polling worker run failed", {
        error: error instanceof Error ? error.message : String(error),
        operation: "telegram.polling.run",
        service: "telegram-polling-worker"
      });
    },
    pollOnce: async () => {
      const result = config.enabled
        ? await pollTelegramUpdatesOnce({
            conversationRepository,
            conversationService,
            integrationRepository,
            apiBaseUrl: config.apiBaseUrl,
            limit: config.limit,
            offsets,
            timeoutMs: config.timeoutMs
          })
        : { accepted: 0, duplicates: 0, failed: 0, polled: 0 };

      writeStructuredLog("info", "Telegram polling worker run completed", {
        ...result,
        enabled: config.enabled,
        operation: "telegram.polling.run",
        service: "telegram-polling-worker"
      });
      return result;
    }
  });
}

export function loadTelegramPollingRuntimeConfig(source: NodeJS.ProcessEnv = process.env): TelegramPollingRuntimeConfig {
  const ingressMode = telegramIngressMode(source);
  if (ingressMode === "polling" && source.TELEGRAM_WEBHOOK_ENABLED === "true") {
    throw new Error("telegram_ingress_mode_conflict:polling_and_webhook");
  }
  if (ingressMode === "webhook" && source.TELEGRAM_POLLING_ENABLED === "true") {
    throw new Error("telegram_ingress_mode_conflict:webhook_and_polling");
  }

  return {
    apiBaseUrl: String(source.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org").trim().replace(/\/+$/, ""),
    enabled: ingressMode === "polling",
    ingressMode,
    intervalMs: positiveInteger(source.TELEGRAM_POLLING_INTERVAL_MS, 5_000),
    limit: positiveInteger(source.TELEGRAM_POLLING_LIMIT, 50),
    timeoutMs: positiveInteger(source.TELEGRAM_POLLING_TIMEOUT_MS, 10_000)
  };
}

function telegramIngressMode(source: NodeJS.ProcessEnv): TelegramPollingRuntimeConfig["ingressMode"] {
  const explicit = String(source.TELEGRAM_INGRESS_MODE ?? "").trim().toLowerCase();
  if (explicit) {
    if (explicit === "disabled" || explicit === "polling" || explicit === "webhook") {
      return explicit;
    }
    throw new Error(`telegram_ingress_mode_invalid:${explicit}`);
  }

  if (source.TELEGRAM_WEBHOOK_ENABLED === "true") return "webhook";
  if (source.TELEGRAM_POLLING_ENABLED === "false") return "disabled";
  return "polling";
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    runTelegramPollingWorkerFromEnv();
  } catch (error) {
    writeStructuredLog("error", "Telegram polling worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "telegram.polling.bootstrap",
      service: "telegram-polling-worker"
    });
    process.exitCode = 1;
  }
}
