import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeStructuredLog } from "@support-communication/observability";
import { configureConversationRepository } from "../conversation/bootstrap.js";
import { configureAutomationRepository } from "./bootstrap.js";
import { runProactiveDeliveryWorkerOnce } from "./proactive-delivery.worker.js";

export interface ProactiveDeliveryWorkerRuntimeConfig {
  activeVariants: string[];
  evaluatedAt?: string;
  intervalMs: number;
  limit: number;
  once: boolean;
  traceId?: string;
  visitorTtlMs: number;
}

export async function runProactiveDeliveryWorkerFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): Promise<void> {
  const config = loadProactiveDeliveryWorkerRuntimeConfig(source, argv);
  const automationRepository = configureAutomationRepository(source);
  const conversationRepository = configureConversationRepository(source);
  let running = false;

  const runOnce = async () => {
    const result = await runProactiveDeliveryWorkerOnce({
      activeVariants: config.activeVariants,
      automationRepository,
      conversationRepository,
      ...(config.evaluatedAt ? { evaluatedAt: config.evaluatedAt } : {}),
      limit: config.limit,
      ...(config.traceId ? { traceId: config.traceId } : {}),
      visitorTtlMs: config.visitorTtlMs
    });
    writeStructuredLog("info", "Proactive delivery worker run completed", {
      ...result,
      operation: "proactive.delivery.run",
      service: "proactive-delivery-worker"
    });
    return result;
  };

  const first = await runOnce();
  if (config.once) {
    console.log(JSON.stringify({
      result: first,
      service: "proactive-delivery-worker"
    }));
    return;
  }

  setInterval(() => {
    if (running) {
      return;
    }
    running = true;
    void runOnce()
      .catch((error) => {
        writeStructuredLog("error", "Proactive delivery worker run failed", {
          error: error instanceof Error ? error.message : String(error),
          operation: "proactive.delivery.run",
          service: "proactive-delivery-worker"
        });
      })
      .finally(() => {
        running = false;
      });
  }, config.intervalMs);
}

export function loadProactiveDeliveryWorkerRuntimeConfig(
  source: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv
): ProactiveDeliveryWorkerRuntimeConfig {
  const evaluatedAt = validIsoTimestamp(source.PROACTIVE_DELIVERY_EVALUATED_AT);
  const traceId = source.PROACTIVE_DELIVERY_TRACE_ID?.trim();
  return {
    activeVariants: commaSeparatedValues(source.PROACTIVE_DELIVERY_ACTIVE_VARIANTS, ["A", "B"]),
    ...(evaluatedAt ? { evaluatedAt } : {}),
    intervalMs: positiveInteger(source.PROACTIVE_DELIVERY_INTERVAL_MS, 10_000),
    limit: positiveInteger(source.PROACTIVE_DELIVERY_LIMIT, 50),
    once: argv.includes("--once") || source.PROACTIVE_DELIVERY_ONCE === "true",
    ...(traceId ? { traceId } : {}),
    visitorTtlMs: positiveInteger(source.PROACTIVE_DELIVERY_VISITOR_TTL_MS, 15 * 60 * 1000)
  };
}

function commaSeparatedValues(value: string | undefined, fallback: string[]): string[] {
  const values = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length ? [...new Set(values)] : fallback;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const normalized = Number(value ?? fallback);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function validIsoTimestamp(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    return undefined;
  }
  return new Date(normalized).toISOString();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runProactiveDeliveryWorkerFromEnv().catch((error) => {
    writeStructuredLog("error", "Proactive delivery worker failed", {
      error: error instanceof Error ? error.message : String(error),
      operation: "proactive.delivery.bootstrap",
      service: "proactive-delivery-worker"
    });
    process.exitCode = 1;
  });
}
