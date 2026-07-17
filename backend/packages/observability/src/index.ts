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
const logLevelPriorities = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
} as const;
type LogLevel = keyof typeof logLevelPriorities;

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

export function writeStructuredLog(level: LogLevel, message: string, context: LogContext): string {
  const line = formatStructuredLog(level, message, context);
  if (shouldWriteStructuredLog(level)) {
    process.stdout.write(`${line}\n`);
  }
  return line;
}

export function shouldWriteStructuredLog(level: LogLevel, configuredLevel = process.env.LOG_LEVEL): boolean {
  const minimumLevel = isLogLevel(configuredLevel) ? configuredLevel : "info";
  return logLevelPriorities[level] >= logLevelPriorities[minimumLevel];
}

export function formatStructuredLog(level: LogLevel, message: string, context: LogContext): string {
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

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && Object.hasOwn(logLevelPriorities, value);
}
