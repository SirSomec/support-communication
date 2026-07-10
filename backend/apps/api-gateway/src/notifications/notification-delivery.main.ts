import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeStructuredLog } from "@support-communication/observability";
import { isLocalRuntime } from "../runtime/local-runtime.js";
import { configureNotificationRepository } from "./bootstrap.js";
import {
  createDeterministicNotificationDeliveryProviderAdapter,
  createDisabledNotificationDeliveryProviderAdapter,
  createWebPushNotificationDeliveryProviderAdapter,
  executeNotificationDeliveryWorker
} from "./notification-delivery.worker.js";

type NotificationDeliveryProviderMode = "disabled" | "local" | "web-push";

export interface NotificationDeliveryWorkerRuntimeConfig {
  intervalMs: number;
  limit: number;
  maxAttempts: number;
  once: boolean;
  providerMode: NotificationDeliveryProviderMode;
  queue: string;
  retryDelayMs: number;
}

export async function runNotificationDeliveryWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const config = loadNotificationDeliveryWorkerRuntimeConfig(source, process.argv);
  const notificationRepository = configureNotificationRepository(source);
  const provider = await createNotificationDeliveryProviderFromEnv(source, config.providerMode);

  const runOnce = async () => {
    const result = await executeNotificationDeliveryWorker({
      limit: config.limit,
      maxAttempts: config.maxAttempts,
      notificationRepository,
      provider,
      queue: config.queue,
      retryDelayMs: config.retryDelayMs
    });
    writeStructuredLog("info", "Notification delivery worker run completed", {
      ...result,
      operation: "notification.delivery.run",
      providerMode: config.providerMode,
      service: "notification-delivery-worker"
    });
    return result;
  };

  const first = await runOnce();
  if (config.once) {
    console.log(JSON.stringify({
      result: first,
      service: "notification-delivery-worker"
    }));
    return;
  }

  setInterval(() => {
    void runOnce().catch((error) => {
      writeStructuredLog("error", "Notification delivery worker run failed", {
        error: error instanceof Error ? error.message : String(error),
        operation: "notification.delivery.run",
        service: "notification-delivery-worker"
      });
    });
  }, config.intervalMs);
}

export function loadNotificationDeliveryWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): NotificationDeliveryWorkerRuntimeConfig {
  const providerMode = normalizeProviderMode(source.NOTIFICATION_DELIVERY_PROVIDER_MODE);
  assertNotificationDeliveryProviderReady(source, providerMode);

  return {
    intervalMs: positiveInteger(source.NOTIFICATION_DELIVERY_INTERVAL_MS, 10_000),
    limit: positiveInteger(source.NOTIFICATION_DELIVERY_LIMIT, 50),
    maxAttempts: positiveInteger(source.NOTIFICATION_DELIVERY_MAX_ATTEMPTS, 3),
    once: argv.includes("--once") || source.NOTIFICATION_DELIVERY_ONCE === "true",
    providerMode,
    queue: source.NOTIFICATION_DELIVERY_QUEUE?.trim() || "browser-push",
    retryDelayMs: positiveInteger(source.NOTIFICATION_DELIVERY_RETRY_DELAY_MS, 60_000)
  };
}

export function assertNotificationDeliveryProviderReady(
  source: NodeJS.ProcessEnv,
  providerMode: NotificationDeliveryProviderMode
): void {
  if (!allowsLocalProviderFallback(source) && isBrowserPushEnabled(source) && providerMode !== "web-push") {
    throw new Error("browser_push_provider_required_in_production_like_runtime");
  }

  if (providerMode === "web-push" && !hasCompleteVapidCredentials(source)) {
    throw new Error("browser_push_vapid_keys_required");
  }
}

async function createNotificationDeliveryProviderFromEnv(
  source: NodeJS.ProcessEnv,
  providerMode: NotificationDeliveryWorkerRuntimeConfig["providerMode"]
) {
  if (providerMode === "local" && isLocalRuntime(source.NODE_ENV)) {
    return createDeterministicNotificationDeliveryProviderAdapter();
  }

  if (providerMode !== "web-push") {
    return createDisabledNotificationDeliveryProviderAdapter("notification_delivery_provider_not_configured");
  }

  const { privateKey, publicKey } = resolveVapidCredentials(source);
  const subject = source.BROWSER_PUSH_SUBJECT?.trim() || "mailto:ops@support-communication.local";
  if (!publicKey || !privateKey) {
    throw new Error("browser_push_vapid_keys_required");
  }

  const webPush = await import("web-push");
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return createWebPushNotificationDeliveryProviderAdapter(webPush);
}

function normalizeProviderMode(value: string | undefined): NotificationDeliveryProviderMode {
  const normalized = String(value ?? "disabled").trim().toLowerCase();
  if (normalized === "disabled" || normalized === "local" || normalized === "web-push") {
    return normalized;
  }

  throw new Error("notification_delivery_provider_mode_invalid");
}

function allowsLocalProviderFallback(source: NodeJS.ProcessEnv): boolean {
  const nodeEnv = String(source.NODE_ENV ?? "development").trim().toLowerCase();
  const runtimeProfile = String(source.RUNTIME_PROFILE ?? "local").trim().toLowerCase();
  return runtimeProfile === "local" && isLocalRuntime(nodeEnv);
}

function hasCompleteVapidCredentials(source: NodeJS.ProcessEnv): boolean {
  const { privateKey, publicKey } = resolveVapidCredentials(source);
  return Boolean(publicKey && privateKey);
}

function isBrowserPushEnabled(source: NodeJS.ProcessEnv): boolean {
  const explicitlyEnabled = String(source.BROWSER_PUSH_ENABLED ?? "").trim().toLowerCase() === "true";
  const { privateKey, publicKey } = resolveVapidCredentials(source);
  return explicitlyEnabled || Boolean(publicKey || privateKey);
}

function resolveVapidCredentials(source: NodeJS.ProcessEnv): {
  privateKey: string | undefined;
  publicKey: string | undefined;
} {
  return {
    privateKey: source.BROWSER_PUSH_PRIVATE_KEY?.trim() || source.VAPID_PRIVATE_KEY?.trim(),
    publicKey: source.BROWSER_PUSH_PUBLIC_KEY?.trim() || source.VAPID_PUBLIC_KEY?.trim()
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runNotificationDeliveryWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Notification delivery worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "notification.delivery.bootstrap",
      service: "notification-delivery-worker"
    });
    process.exitCode = 1;
  });
}
