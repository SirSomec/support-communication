import { getServiceAdminAccessToken, getTenantAccessToken } from "../app/sessionStore.js";

const DEFAULT_API_BASE_PATH = "/api/v1";
const DEFAULT_API_TIMEOUT_MS = 30_000;

let apiClientTestConfig = {};

export function configureApiClientForTests(overrides = {}) {
  apiClientTestConfig = {
    ...apiClientTestConfig,
    ...overrides
  };
}

export function resetApiClientTestConfig() {
  apiClientTestConfig = {};
}

export function buildApiUrl(path, query = {}) {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = `${DEFAULT_API_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
  const url = baseUrl
    ? new URL(normalizedPath.replace(/^\/+/, ""), ensureTrailingSlash(baseUrl))
    : new URL(normalizedPath, "http://local.frontend");

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return baseUrl ? url.toString() : `${url.pathname}${url.search}`;
}

export async function apiRequest(path, { authMode = "auto", body, headers = {}, method = "GET", operation, query, service, signal, timeoutMs } = {}) {
  const requestHeaders = {
    accept: "application/json",
    ...headers
  };

  if (authMode === "service-admin") {
    const token = getServiceAdminAccessToken();
    if (!token) {
      return createApiErrorEnvelope({
        code: "service_admin_session_required",
        message: "Service-admin bearer session is required.",
        operation,
        service
      });
    }

    if (!requestHeaders.authorization) {
      requestHeaders.authorization = `Bearer ${token}`;
    }
  } else if (authMode !== "public") {
    const token = getTenantAccessToken();
    if (token && !requestHeaders.authorization) {
      requestHeaders.authorization = `Bearer ${token}`;
    }
  }

  const abortContext = createRequestAbortContext({ signal, timeoutMs });
  const requestInit = {
    headers: requestHeaders,
    method,
    signal: abortContext.signal
  };

  if (body !== undefined) {
    requestHeaders["content-type"] = "application/json";
    requestInit.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(buildApiUrl(path, query), requestInit);
    const payload = await parseJsonResponse(response);
    const envelope = normalizeEnvelope(payload, { operation, service });

    if (!response.ok) {
      const rawError = envelope.error ?? {
        code: `http_${response.status}`,
        message: response.statusText || "API request failed."
      };

      return {
        ...envelope,
        status: "error",
        states: {
          loading: false,
          empty: envelope.data === null || envelope.data === undefined,
          error: true,
          partial: Boolean(envelope.partial)
        },
        error: {
          ...rawError,
          message: humanizeErrorMessage({
            httpStatus: response.status,
            message: rawError.message,
            traceId: envelope.traceId
          }),
          detail: rawError.message
        }
      };
    }

    return envelope;
  } catch (error) {
    if (abortContext.reason === "cancelled") {
      return createApiErrorEnvelope({
        code: "request_cancelled",
        message: "Запрос отменён.",
        operation,
        service
      });
    }
    if (abortContext.reason === "timeout") {
      return createApiErrorEnvelope({
        code: "request_timeout",
        message: "Сервер не ответил вовремя. Попробуйте ещё раз.",
        operation,
        service
      });
    }
    const rawMessage = error instanceof Error ? error.message : "Network request failed.";
    const failureEnvelope = createApiErrorEnvelope({
      code: "network_error",
      message: "Нет соединения с сервером. Проверьте сеть и попробуйте ещё раз.",
      operation,
      service
    });
    failureEnvelope.error.detail = rawMessage;
    return failureEnvelope;
  } finally {
    abortContext.cleanup();
  }
}

function createRequestAbortContext({ signal, timeoutMs }) {
  const controller = new AbortController();
  const configuredTimeout = Number(timeoutMs ?? getRuntimeConfigValue("timeoutMs", "VITE_API_TIMEOUT_MS", DEFAULT_API_TIMEOUT_MS));
  const normalizedTimeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? Math.min(Math.trunc(configuredTimeout), 120_000)
    : DEFAULT_API_TIMEOUT_MS;
  const context = {
    cleanup: () => {},
    reason: null,
    signal: controller.signal
  };
  const cancelFromCaller = () => {
    context.reason = "cancelled";
    controller.abort(signal?.reason);
  };

  if (signal?.aborted) {
    cancelFromCaller();
  } else {
    signal?.addEventListener("abort", cancelFromCaller, { once: true });
  }
  const timeout = globalThis.setTimeout(() => {
    if (!controller.signal.aborted) {
      context.reason = "timeout";
      controller.abort(new DOMException("Request timed out", "TimeoutError"));
    }
  }, normalizedTimeout);
  context.cleanup = () => {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", cancelFromCaller);
  };
  return context;
}

const GENERIC_TECHNICAL_MESSAGES = new Set([
  "",
  "api request failed.",
  "bad gateway",
  "bad request",
  "forbidden",
  "gateway timeout",
  "internal server error",
  "not found",
  "request timeout",
  "service unavailable",
  "too many requests",
  "unauthorized"
]);

const HTTP_STATUS_MESSAGES = {
  401: "Сессия не авторизована или данные для входа не подошли. Проверьте их и попробуйте снова.",
  403: "Недостаточно прав для этого действия.",
  404: "Запрошенные данные не найдены.",
  408: "Сервер не ответил вовремя. Попробуйте ещё раз.",
  429: "Слишком много запросов. Подождите немного и повторите."
};

function humanizeErrorMessage({ httpStatus, message, traceId }) {
  const normalized = String(message ?? "").trim();
  const isGenericTechnical = GENERIC_TECHNICAL_MESSAGES.has(normalized.toLowerCase());

  if (!isGenericTechnical && !(httpStatus >= 500)) {
    return normalized;
  }

  if (httpStatus >= 500) {
    const traceSuffix = traceId ? ` Код обращения: ${traceId}.` : "";
    return `Сервис временно недоступен. Попробуйте ещё раз через минуту.${traceSuffix}`;
  }

  return HTTP_STATUS_MESSAGES[httpStatus] ?? "Не удалось выполнить запрос. Попробуйте ещё раз.";
}

export function createApiErrorEnvelope({ code, data = null, message, operation = "request", service = "apiClient" }) {
  return {
    service,
    operation,
    status: "error",
    partial: false,
    traceId: `trc_${service}_${operation}_client_error`,
    updatedAt: new Date().toISOString(),
    data,
    error: { code, message },
    states: {
      loading: false,
      empty: data === null || data === undefined,
      error: true,
      partial: false
    },
    meta: {
      source: "api-client"
    }
  };
}

function normalizeEnvelope(payload, { operation = "request", service = "apiClient" }) {
  if (payload && typeof payload === "object" && "status" in payload && "data" in payload) {
    return {
      service: payload.service ?? service,
      operation: payload.operation ?? operation,
      status: payload.status ?? "ok",
      partial: Boolean(payload.partial),
      traceId: payload.traceId ?? `trc_${service}_${operation}_api`,
      updatedAt: payload.updatedAt ?? new Date().toISOString(),
      data: payload.data,
      error: payload.error ?? null,
      states: payload.states ?? {
        loading: false,
        empty: payload.data === null || payload.data === undefined,
        error: Boolean(payload.error),
        partial: Boolean(payload.partial)
      },
      meta: {
        source: "api-gateway",
        ...(payload.meta ?? {})
      }
    };
  }

  return {
    service,
    operation,
    status: "ok",
    partial: false,
    traceId: `trc_${service}_${operation}_api`,
    updatedAt: new Date().toISOString(),
    data: payload ?? null,
    error: null,
    states: {
      loading: false,
      empty: payload === null || payload === undefined,
      error: false,
      partial: false
    },
    meta: {
      source: "api-gateway"
    }
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      data: text,
      error: {
        code: "invalid_json",
        message: "API returned a non-JSON response."
      },
      status: "error"
    };
  }
}

function getApiBaseUrl() {
  return String(getRuntimeConfigValue("apiBaseUrl", "VITE_API_BASE_URL", "")).trim().replace(/\/+$/, "");
}

function getRuntimeConfigValue(testKey, envKey, fallback) {
  if (Object.hasOwn(apiClientTestConfig, testKey)) {
    return apiClientTestConfig[testKey];
  }

  return import.meta.env?.[envKey] ?? fallback;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
