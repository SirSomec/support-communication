import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { redactSensitiveValue } from "@support-communication/redaction";

export {
  METRIC_BUCKETS,
  MetricsRegistry,
  metricsRegistry,
  resetMetricsRegistry,
  sanitizeMetricLabel,
  type MetricLabelValue,
  type MetricLabels,
  type MetricSnapshot,
  type CounterSnapshot,
  type HistogramSnapshot
} from "./metrics.js";

export interface LogContext {
  operation?: string;
  service: string;
  traceId?: string;
  [key: string]: unknown;
}

const traceContext = new AsyncLocalStorage<{ traceId: string }>();

export function createRequestTraceId(service: string, operation = "request", requestId?: string): string {
  const normalizedRequestId = normalizeRequestId(requestId);

  if (normalizedRequestId) {
    return normalizedRequestId;
  }

  return `trc_${sanitizeTracePart(service)}_${sanitizeTracePart(operation)}_${randomUUID()}`;
}

export function normalizeRequestId(requestId?: string): string | undefined {
  const trimmed = requestId?.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/[^a-zA-Z0-9._:-]+/g, "_").slice(0, 128);
}

export function runWithTraceId<T>(traceId: string, callback: () => T): T {
  return traceContext.run({ traceId }, callback);
}

export function getCurrentTraceId(): string | undefined {
  return traceContext.getStore()?.traceId;
}

export function writeStructuredLog(level: "debug" | "info" | "warn" | "error", message: string, context: LogContext): string {
  const line = formatStructuredLog(level, message, context);
  process.stdout.write(`${line}\n`);
  return line;
}

export function formatStructuredLog(level: "debug" | "info" | "warn" | "error", message: string, context: LogContext): string {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context
  };

  return JSON.stringify(redactSensitiveValue(entry));
}

function sanitizeTracePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}
