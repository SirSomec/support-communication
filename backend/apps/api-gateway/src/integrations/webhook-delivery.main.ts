import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeStructuredLog } from "@support-communication/observability";
import { isLocalRuntime } from "../runtime/local-runtime.js";
import { configureIntegrationRepository } from "./bootstrap.js";
import {
  createDeterministicWebhookDeliveryProvider,
  createDisabledWebhookDeliveryProvider,
  createHttpWebhookDeliveryProvider,
  runWebhookDeliveryWorkerOnce
} from "./webhook-delivery.worker.js";

interface WebhookDeliveryWorkerRuntimeConfig {
  intervalMs: number;
  leaseTimeoutMs: number;
  limit: number;
  maxAttempts: number;
  once: boolean;
  providerMode: "disabled" | "http" | "local";
  queue: string;
  retryBackoffMs: number;
  timeoutMs: number;
}

export async function runWebhookDeliveryWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const config = loadWebhookDeliveryWorkerRuntimeConfig(source, argv);
  const repository = configureIntegrationRepository(source);
  const provider = createWebhookDeliveryProviderFromEnv(source, config);

  const runOnce = async () => {
    const result = await runWebhookDeliveryWorkerOnce({
      leaseTimeoutMs: config.leaseTimeoutMs,
      limit: config.limit,
      maxAttempts: config.maxAttempts,
      provider,
      queue: config.queue,
      repository,
      retryBackoffMs: config.retryBackoffMs
    });
    writeStructuredLog("info", "Webhook delivery worker run completed", {
      ...result,
      operation: "webhook.delivery.run",
      providerMode: config.providerMode,
      service: "webhook-delivery-worker"
    });
    return result;
  };

  const first = await runOnce();
  if (config.once) {
    console.log(JSON.stringify({
      result: first,
      service: "webhook-delivery-worker"
    }));
    return;
  }

  setInterval(() => {
    void runOnce().catch((error) => {
      writeStructuredLog("error", "Webhook delivery worker run failed", {
        error: error instanceof Error ? error.message : String(error),
        operation: "webhook.delivery.run",
        service: "webhook-delivery-worker"
      });
    });
  }, config.intervalMs);
}

export function loadWebhookDeliveryWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): WebhookDeliveryWorkerRuntimeConfig {
  return {
    intervalMs: positiveInteger(source.WEBHOOK_DELIVERY_INTERVAL_MS, 10_000),
    leaseTimeoutMs: positiveInteger(source.WEBHOOK_DELIVERY_LEASE_TIMEOUT_MS, 300_000),
    limit: positiveInteger(source.WEBHOOK_DELIVERY_LIMIT, 50),
    maxAttempts: positiveInteger(source.WEBHOOK_DELIVERY_MAX_ATTEMPTS, 3),
    once: argv.includes("--once") || source.WEBHOOK_DELIVERY_ONCE === "true",
    providerMode: normalizeProviderMode(source.WEBHOOK_DELIVERY_PROVIDER_MODE),
    queue: source.WEBHOOK_DELIVERY_QUEUE?.trim() || "webhook-delivery",
    retryBackoffMs: positiveInteger(source.WEBHOOK_DELIVERY_RETRY_BACKOFF_MS, 60_000),
    timeoutMs: positiveInteger(source.WEBHOOK_DELIVERY_HTTP_TIMEOUT_MS, 10_000)
  };
}

export function createWebhookDeliveryProviderFromEnv(
  source: NodeJS.ProcessEnv,
  config: WebhookDeliveryWorkerRuntimeConfig
) {
  if (config.providerMode === "http") {
    return createHttpWebhookDeliveryProvider({
      timeoutMs: config.timeoutMs
    });
  }

  if (config.providerMode === "local" && isLocalRuntime(source.NODE_ENV)) {
    return createDeterministicWebhookDeliveryProvider();
  }

  return createDisabledWebhookDeliveryProvider("webhook_delivery_provider_not_configured");
}

function normalizeProviderMode(value: string | undefined): WebhookDeliveryWorkerRuntimeConfig["providerMode"] {
  const normalized = String(value ?? "local").trim().toLowerCase();
  if (normalized === "disabled" || normalized === "http") {
    return normalized;
  }
  return "local";
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runWebhookDeliveryWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Webhook delivery worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "webhook.delivery.bootstrap",
      service: "webhook-delivery-worker"
    });
    process.exitCode = 1;
  });
}
