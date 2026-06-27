const DEFAULT_LATENCY_MS = 42;
const MIN_AUDIT_REASON_LENGTH = 8;

export function cloneEntity(value) {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

export function makeTraceId(service, operation = "op") {
  return `trc_${sanitizeId(service)}_${sanitizeId(operation)}_${makeSuffix()}`;
}

export function makeAuditId(scope) {
  return `evt_${sanitizeId(scope)}_${makeSuffix()}`;
}

export function makeQueueId(scope) {
  return `queue_${sanitizeId(scope)}_${makeSuffix()}`;
}

export function makeRequestId(scope) {
  return `test_${sanitizeId(scope)}_${makeSuffix()}`;
}

export function createEnvelope({
  data,
  error = null,
  meta = {},
  operation,
  partial = false,
  service,
  status = "ok"
}) {
  const hasErrorState = Boolean(error) || ["denied", "error", "invalid"].includes(status);

  return {
    service,
    operation,
    status,
    partial,
    traceId: makeTraceId(service, operation),
    updatedAt: new Date().toISOString(),
    data: cloneEntity(data),
    error,
    states: {
      loading: false,
      empty: isEmptyData(data),
      error: hasErrorState,
      partial: Boolean(partial)
    },
    meta: {
      source: "mock-backend",
      latencyMs: DEFAULT_LATENCY_MS,
      ...meta
    }
  };
}

export function createBackendErrorEnvelope({ code, data = null, message, operation, service }) {
  return createEnvelope({
    service,
    operation,
    status: "error",
    data,
    error: { code, message }
  });
}

export function createInvalidEnvelope({ code, data = {}, message, operation, service }) {
  return createEnvelope({
    service,
    operation,
    status: "invalid",
    data,
    error: { code, message }
  });
}

export function hasAuditReason(reason) {
  return String(reason ?? "").trim().length >= MIN_AUDIT_REASON_LENGTH;
}

export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "export";
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function makeSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function sanitizeId(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "mock";
}

function isEmptyData(data) {
  if (data === null || data === undefined) {
    return true;
  }

  if (Array.isArray(data)) {
    return data.length === 0;
  }

  if (typeof data === "object") {
    if (Array.isArray(data.items)) {
      return data.items.length === 0;
    }

    return Object.keys(data).length === 0;
  }

  return false;
}
