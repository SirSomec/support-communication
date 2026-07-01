const DEFAULT_API_BASE_PATH = "/api/v1";
const DEFAULT_DEMO_SERVICE_ADMIN_KEY = "dev-service-admin-key";
const DEFAULT_DEMO_SERVICE_ADMIN_ACTOR_ID = "svc-admin-demo";
const DEFAULT_DEMO_SERVICE_ADMIN_ACTOR_NAME = "Demo Service Admin";
const DEFAULT_DEMO_SERVICE_ADMIN_ROLES = "service_admin";
const DEFAULT_DEMO_SERVICE_ADMIN_PERMISSIONS = "*";
const DEFAULT_DEMO_SERVICE_ADMIN_TENANT_ID = "tenant-northstar";

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
  const url = baseUrl ? new URL(normalizedPath, ensureTrailingSlash(baseUrl)) : new URL(normalizedPath, "http://local.frontend");

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

export async function apiRequest(path, { body, headers = {}, method = "GET", operation, query, service } = {}) {
  const requestHeaders = {
    accept: "application/json",
    ...headers
  };
  const demoServiceAdminKey = getDemoServiceAdminKey();

  if (demoServiceAdminKey && getRuntimeMode() !== "production") {
    requestHeaders["x-demo-service-admin-key"] = demoServiceAdminKey;
    Object.assign(requestHeaders, getDemoServiceAdminHeaders());
  }

  const requestInit = {
    headers: requestHeaders,
    method
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
      return {
        ...envelope,
        status: "error",
        states: {
          loading: false,
          empty: envelope.data === null || envelope.data === undefined,
          error: true,
          partial: Boolean(envelope.partial)
        },
        error: envelope.error ?? {
          code: `http_${response.status}`,
          message: response.statusText || "API request failed."
        }
      };
    }

    return envelope;
  } catch (error) {
    return createApiErrorEnvelope({
      code: "network_error",
      message: error instanceof Error ? error.message : "Network request failed.",
      operation,
      service
    });
  }
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

function getDemoServiceAdminKey() {
  return String(getRuntimeConfigValue("demoServiceAdminKey", "VITE_DEMO_SERVICE_ADMIN_KEY", DEFAULT_DEMO_SERVICE_ADMIN_KEY)).trim();
}

function getDemoServiceAdminHeaders() {
  return {
    "x-demo-service-admin-actor-id": String(getRuntimeConfigValue("demoServiceAdminActorId", "VITE_DEMO_SERVICE_ADMIN_ACTOR_ID", DEFAULT_DEMO_SERVICE_ADMIN_ACTOR_ID)).trim(),
    "x-demo-service-admin-actor-name": String(getRuntimeConfigValue("demoServiceAdminActorName", "VITE_DEMO_SERVICE_ADMIN_ACTOR_NAME", DEFAULT_DEMO_SERVICE_ADMIN_ACTOR_NAME)).trim(),
    "x-demo-service-admin-mfa-verified": "true",
    "x-demo-service-admin-permissions": String(getRuntimeConfigValue("demoServiceAdminPermissions", "VITE_DEMO_SERVICE_ADMIN_PERMISSIONS", DEFAULT_DEMO_SERVICE_ADMIN_PERMISSIONS)).trim(),
    "x-demo-service-admin-roles": String(getRuntimeConfigValue("demoServiceAdminRoles", "VITE_DEMO_SERVICE_ADMIN_ROLES", DEFAULT_DEMO_SERVICE_ADMIN_ROLES)).trim(),
    "x-demo-service-admin-tenant-id": String(getRuntimeConfigValue("demoServiceAdminTenantId", "VITE_DEMO_SERVICE_ADMIN_TENANT_ID", DEFAULT_DEMO_SERVICE_ADMIN_TENANT_ID)).trim(),
    "x-demo-service-admin-session-expires-at": new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
}

function getRuntimeMode() {
  return String(
    getRuntimeConfigValue("mode", "MODE", getNodeEnv() || "development")
  ).trim();
}

function getRuntimeConfigValue(testKey, envKey, fallback) {
  if (Object.hasOwn(apiClientTestConfig, testKey)) {
    return apiClientTestConfig[testKey];
  }

  return import.meta.env?.[envKey] ?? fallback;
}

function getNodeEnv() {
  return typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
