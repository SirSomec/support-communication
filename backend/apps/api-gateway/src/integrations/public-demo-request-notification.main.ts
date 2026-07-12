import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { writeStructuredLog } from "@support-communication/observability";
import { isLocalRuntime } from "../runtime/local-runtime.js";
import { configureIntegrationRepository } from "./bootstrap.js";
import {
  createDeterministicPublicDemoRequestNotificationProvider,
  createDisabledPublicDemoRequestNotificationProvider,
  createSmtpPublicDemoRequestNotificationProvider,
  executePublicDemoRequestNotificationWorker
} from "./public-demo-request-notification.worker.js";

interface PublicDemoRequestNotificationWorkerRuntimeConfig {
  intervalMs: number;
  limit: number;
  once: boolean;
  providerMode: "disabled" | "local" | "smtp";
}

export async function runPublicDemoRequestNotificationWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const config = loadPublicDemoRequestNotificationWorkerRuntimeConfig(source, argv);
  const repository = configureIntegrationRepository(source);
  const provider = createPublicDemoRequestNotificationProviderFromEnv(source, config.providerMode);

  const runOnce = async () => {
    const result = await executePublicDemoRequestNotificationWorker({
      limit: config.limit,
      provider,
      repository
    });

    writeStructuredLog("info", "Public demo request notification worker run completed", {
      ...result,
      operation: "public_demo_request.notification.run",
      providerMode: config.providerMode,
      service: "lead-notification-worker"
    });

    return result;
  };

  const first = await runOnce();
  if (config.once) {
    console.log(JSON.stringify({
      result: first,
      service: "lead-notification-worker"
    }));
    return;
  }

  setInterval(() => {
    void runOnce().catch((error) => {
      writeStructuredLog("error", "Public demo request notification worker run failed", {
        error: error instanceof Error ? error.message : String(error),
        operation: "public_demo_request.notification.run",
        service: "lead-notification-worker"
      });
    });
  }, config.intervalMs);
}

export function loadPublicDemoRequestNotificationWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): PublicDemoRequestNotificationWorkerRuntimeConfig {
  return {
    intervalMs: positiveInteger(source.PUBLIC_DEMO_NOTIFICATION_DELIVERY_INTERVAL_MS, 10_000),
    limit: positiveInteger(source.PUBLIC_DEMO_NOTIFICATION_DELIVERY_LIMIT, 50),
    once: argv.includes("--once") || source.PUBLIC_DEMO_NOTIFICATION_DELIVERY_ONCE === "true",
    providerMode: normalizeProviderMode(source.PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE)
  };
}

export function createPublicDemoRequestNotificationProviderFromEnv(
  source: NodeJS.ProcessEnv,
  providerMode: PublicDemoRequestNotificationWorkerRuntimeConfig["providerMode"]
) {
  if (providerMode === "smtp") {
    return createSmtpPublicDemoRequestNotificationProvider({
      auth: optionalSmtpAuth(source),
      from: requiredString(source.PUBLIC_DEMO_NOTIFICATION_SMTP_FROM ?? source.MAIL_FROM, "PUBLIC_DEMO_NOTIFICATION_SMTP_FROM"),
      host: requiredString(source.PUBLIC_DEMO_NOTIFICATION_SMTP_HOST ?? source.MAIL_HOST, "PUBLIC_DEMO_NOTIFICATION_SMTP_HOST"),
      port: positiveInteger(source.PUBLIC_DEMO_NOTIFICATION_SMTP_PORT ?? source.MAIL_PORT, 1025),
      secure: booleanFlag(source.PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE ?? source.MAIL_SECURE, false),
      timeoutMs: positiveInteger(source.PUBLIC_DEMO_NOTIFICATION_SMTP_TIMEOUT_MS, 10_000),
      tlsRejectUnauthorized: booleanFlag(
        source.PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED ?? source.MAIL_TLS_REJECT_UNAUTHORIZED,
        true
      ),
      to: requiredString(source.PUBLIC_DEMO_NOTIFICATION_SMTP_TO, "PUBLIC_DEMO_NOTIFICATION_SMTP_TO")
    });
  }

  if (providerMode === "local" && isLocalRuntime(source.NODE_ENV)) {
    return createDeterministicPublicDemoRequestNotificationProvider();
  }

  return createDisabledPublicDemoRequestNotificationProvider("public_demo_request_notification_provider_not_configured");
}

function normalizeProviderMode(value: string | undefined): PublicDemoRequestNotificationWorkerRuntimeConfig["providerMode"] {
  const normalized = String(value ?? "local").trim().toLowerCase();
  if (normalized === "disabled" || normalized === "smtp") {
    return normalized;
  }
  return "local";
}

function optionalSmtpAuth(source: NodeJS.ProcessEnv): { password: string; username: string } | undefined {
  const username = optionalString(source.PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME ?? source.MAIL_USERNAME);
  const password = optionalString(source.PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD ?? source.MAIL_PASSWORD);
  if (!username && !password) {
    return undefined;
  }
  if (!username || !password) {
    throw new Error("PUBLIC_DEMO_NOTIFICATION_SMTP_AUTH_required");
  }
  return { password, username };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function booleanFlag(value: string | undefined, fallback: boolean): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["1", "true", "yes"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function optionalString(value: string | undefined): string {
  return String(value ?? "").trim();
}

function requiredString(value: string | undefined, name: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${name}_required`);
  }
  return normalized;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runPublicDemoRequestNotificationWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Public demo request notification worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "public_demo_request.notification.bootstrap",
      service: "lead-notification-worker"
    });
    process.exitCode = 1;
  });
}
