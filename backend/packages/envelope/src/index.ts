import { randomUUID } from "node:crypto";
import { redactSensitiveValue } from "@support-communication/redaction";

export type EnvelopeStatus = "ok" | "invalid" | "denied" | "not_found" | "conflict" | "rate_limited" | "error";

export interface EnvelopeStates {
  loading: boolean;
  empty: boolean;
  error: boolean;
  partial: boolean;
}

export interface BackendEnvelope<TData = unknown> {
  service: string;
  operation: string;
  status: EnvelopeStatus;
  partial: boolean;
  traceId: string;
  updatedAt: string;
  states: EnvelopeStates;
  meta: Record<string, unknown>;
  data: TData;
  error: null | {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface CreateEnvelopeOptions<TData> {
  data: TData;
  error?: BackendEnvelope<TData>["error"];
  meta?: Record<string, unknown>;
  operation: string;
  partial?: boolean;
  service: string;
  status?: EnvelopeStatus;
  traceId?: string;
}

export function createEnvelope<TData>({
  data,
  error = null,
  meta = {},
  operation,
  partial = false,
  service,
  status = "ok",
  traceId = createTraceId(service, operation)
}: CreateEnvelopeOptions<TData>): BackendEnvelope<TData> {
  const errorState = Boolean(error) || ["invalid", "denied", "not_found", "conflict", "rate_limited", "error"].includes(status);
  const redactedMeta = errorState ? redactSensitiveValue(meta) : meta;
  const redactedData = errorState ? redactSensitiveValue(data) : data;
  const redactedError = errorState ? redactSensitiveValue(error) as BackendEnvelope<TData>["error"] : error;

  return {
    service,
    operation,
    status,
    partial,
    traceId,
    updatedAt: new Date().toISOString(),
    states: {
      loading: false,
      empty: isEmptyData(data),
      error: errorState,
      partial
    },
    meta: redactedMeta,
    data: redactedData,
    error: redactedError
  };
}

export function redactExportedDescriptor<TDescriptor extends Record<string, unknown>>(descriptor: TDescriptor): TDescriptor {
  return redactSensitiveValue(descriptor);
}

export function createTraceId(service: string, operation: string): string {
  return `trc_${sanitizeTracePart(service)}_${sanitizeTracePart(operation)}_${randomUUID()}`;
}

function sanitizeTracePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function isEmptyData(data: unknown): boolean {
  if (data === null || data === undefined) {
    return true;
  }

  if (Array.isArray(data)) {
    return data.length === 0;
  }

  if (typeof data === "object") {
    return Object.keys(data).length === 0;
  }

  return false;
}
