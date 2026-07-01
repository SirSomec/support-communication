# Connect Frontend To Real API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace frontend mock service implementations with calls to the real API Gateway while preserving the existing service adapter interface used by React screens.

**Architecture:** Add one small HTTP client that owns base URL, headers, query serialization, JSON parsing and envelope normalization. Refactor each `src/services/*Service.js` adapter from in-memory data and `createEnvelope()` to the matching `backend/apps/api-gateway/src/**/**.controller.ts` route, keeping method names and response envelopes stable for the app. Use unit tests with mocked `fetch` for adapter contracts and one runtime smoke test against a locally running API Gateway.

**Tech Stack:** React 19, Vite 6, browser `fetch`, Node test runner, Playwright smoke tests, NestJS API Gateway under `backend/apps/api-gateway`.

---

## File Structure

- Create: `src/services/apiClient.js`
  - Shared HTTP client for `/api/v1` requests.
  - Reads `VITE_API_BASE_URL` and `VITE_DEMO_SERVICE_ADMIN_KEY`.
  - Sends JSON, query params and demo service-admin header.
  - Converts network and non-envelope HTTP failures into the same envelope shape that UI code already understands.
- Modify: `vite.config.js`
  - Add a dev proxy from `/api` to `http://127.0.0.1:4100`, so the frontend can call the backend without browser CORS issues during local development.
- Modify: `src/services/*.js`
  - Replace `createEnvelope()` mock logic with `apiClient` calls.
  - Keep exported object names and method names unchanged.
- Modify: `src/services/backendIntegrationService.js`
  - Report real adapter readiness from a static registry and mark the source as `api-gateway`.
- Modify: `tests/backend-services.test.js`
  - Replace mock-data assertions with mocked `fetch` contract checks for the frontend service adapters.
- Create: `tests/api-client.test.js`
  - Cover URL building, headers, query strings, request bodies, envelope pass-through and HTTP/network error envelopes.
- Create: `tests/backend-api-smoke.test.js`
  - Optional runtime smoke that runs only when `RUN_BACKEND_API_SMOKE=1`; it checks `/api/v1/health`, `/api/v1/ready`, `/api/v1/auth/state` and one domain endpoint against a live API Gateway.
- Modify: `package.json`
  - Add `test:api-client` and `test:backend-api-smoke` scripts.
- Modify: `backend/README.md`
  - Document how to run the backend and frontend together with real API mode.

## API Route Mapping

| Frontend service | Current method | API Gateway route |
| --- | --- | --- |
| `authService` | `getAuthState` | `GET /api/v1/auth/state` |
| `authService` | `login` | `POST /api/v1/auth/login` |
| `authService` | `logout` | `POST /api/v1/auth/logout` |
| `dialogService` | `fetchDialogs` | `GET /api/v1/dialogs` |
| `dialogService` | `transitionConversationStatus` | `PATCH /api/v1/dialogs/:conversationId/status` |
| `dialogService` | `uploadAttachment` | `POST /api/v1/dialogs/attachments` |
| `dialogService` | `createOutboundConversationRequest` | `POST /api/v1/dialogs/outbound` |
| `clientService` | `fetchClientProfiles` | `GET /api/v1/clients` |
| `clientService` | `mergeClientProfiles` | `POST /api/v1/clients/merge` |
| `clientService` | `unmergeClientProfile` | `POST /api/v1/clients/unmerge` |
| `templateService` | `fetchTemplates` | `GET /api/v1/templates` |
| `templateService` | `saveTemplate` | `POST /api/v1/templates` |
| `reportService` | `fetchReportWorkspace` | `GET /api/v1/reports/workspace` |
| `reportService` | `requestReportExport` | `POST /api/v1/reports/exports` |
| `reportService` | `retryReportExport` | `POST /api/v1/reports/exports/:jobId/retry` |
| `reportService` | `getExportFileDescriptor` | `GET /api/v1/reports/exports/:jobId/file` |
| `integrationService` | `fetchIntegrationWorkspace` | `GET /api/v1/integrations/workspace` |
| `integrationService` | `testChannelConnection` | `POST /api/v1/integrations/channel-tests` |
| `integrationService` | `rotateApiKey` | `POST /api/v1/integrations/api-keys/:keyId/rotate` |
| `integrationService` | `replayWebhookDelivery` | `POST /api/v1/integrations/webhooks/deliveries/:deliveryId/replay` |
| `integrationService` | `revokeSecuritySession` | `POST /api/v1/integrations/security/sessions/:sessionId/revoke` |
| `permissionService` | `validatePermission` | `POST /api/v1/permissions/validate` |
| `permissionService` | `fetchPermissionModel` | `GET /api/v1/permissions/model` |
| `visitorService` | `fetchVisitorWorkspace` | `GET /api/v1/automation/workspace` |
| `visitorService` | `saveProactiveRule` | `POST /api/v1/automation/proactive-rules` |
| `visitorService` | `triggerRescueReturn` | `POST /api/v1/automation/handoff-events` |
| `automationService` | `fetchAutomationWorkspace` | `GET /api/v1/automation/workspace` |
| `automationService` | `validateBotFlowImport` | `POST /api/v1/automation/bot-flow/validate` |
| `automationService` | `publishBotScenario` | `POST /api/v1/automation/bot-scenarios/:scenarioId/publish` |
| `automationService` | `testBotScenario` | `POST /api/v1/automation/bot-scenarios/:scenarioId/test-runs` |
| `qualityService` | `fetchQualityWorkspace` | `GET /api/v1/quality/workspace` |
| `qualityService` | `scoreDraftResponse` | `POST /api/v1/quality/draft-score` |
| `auditService` | `fetchAuditEvents` | `GET /api/v1/service-admin/audit-events` |
| `tenantService` | `fetchTenants` | `GET /api/v1/tenants` |
| `tenantService` | `fetchTenantDetail` | `GET /api/v1/tenants/:tenantId` |
| `tenantService` | `updateTenantStatus` | `PATCH /api/v1/tenants/:tenantId/status` |
| `billingService` | `fetchTariffs` | `GET /api/v1/billing/tariffs` |
| `billingService` | `previewTariffChange` | `POST /api/v1/billing/tenants/:tenantId/tariff-change/preview` |
| `billingService` | `changeTenantTariff` | `POST /api/v1/billing/tenants/:tenantId/tariff-change` |
| `platformMonitoringService` | `fetchPlatformSnapshot` | `GET /api/v1/platform-monitoring/snapshot` |
| `platformMonitoringService` | `fetchComponentDrilldown` | `GET /api/v1/platform-monitoring/components/:componentId` |
| `platformMonitoringService` | `acknowledgeComponentAlert` | `POST /api/v1/platform-monitoring/components/:componentId/acknowledgements` |
| `supportAdminService` | `fetchSupportUsers` | `GET /api/v1/service-admin/users` |
| `supportAdminService` | `resetTwoFactor` | `POST /api/v1/service-admin/users/:userId/mfa/reset` |
| `supportAdminService` | `forceLogout` | `POST /api/v1/service-admin/users/:userId/sessions/logout` |
| `supportAdminService` | `blockUser` | `POST /api/v1/service-admin/users/:userId/block` |
| `supportAdminService` | `resendInvite` | `POST /api/v1/service-admin/users/:userId/invite/resend` |
| `supportAdminService` | `startImpersonation` | `POST /api/v1/service-admin/impersonations` |
| `supportAdminService` | `stopImpersonation` | `POST /api/v1/service-admin/impersonations/:impersonationId/stop` |
| `incidentService` | `fetchIncidents` | `GET /api/v1/incidents` |
| `incidentService` | `fetchIncidentDetail` | `GET /api/v1/incidents/:incidentId` |
| `incidentService` | `addIncidentUpdate` | `POST /api/v1/incidents/:incidentId/updates` |
| `featureFlagService` | `fetchFeatureFlags` | `GET /api/v1/feature-flags` |
| `featureFlagService` | `previewFlagChange` | `POST /api/v1/feature-flags/:flagId/preview` |
| `featureFlagService` | `updateFeatureFlag` | `PATCH /api/v1/feature-flags/:flagId` |

## Task 1: Shared API Client

**Files:**
- Create: `src/services/apiClient.js`
- Test: `tests/api-client.test.js`

- [x] **Step 1: Write failing tests for API client URL, headers and envelope behavior**

Create `tests/api-client.test.js` with:

```js
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { apiRequest, buildApiUrl, createApiErrorEnvelope } from "../src/services/apiClient.js";

describe("api client", () => {
  afterEach(() => {
    mock.restoreAll();
    delete globalThis.fetch;
  });

  it("builds /api/v1 URLs with query params when no explicit base URL is configured", () => {
    const url = buildApiUrl("/dialogs", {
      page: 2,
      pageSize: 25,
      query: "vip client",
      empty: "",
      missing: null
    });

    assert.equal(url, "/api/v1/dialogs?page=2&pageSize=25&query=vip+client");
  });

  it("sends JSON, trace headers and the demo service-admin key", async () => {
    globalThis.fetch = mock.fn(async (url, options) => {
      assert.equal(url, "/api/v1/auth/login");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["content-type"], "application/json");
      assert.equal(options.headers["x-demo-service-admin-key"], "dev-service-admin-key");
      assert.deepEqual(JSON.parse(options.body), { email: "admin@example.com", password: "secret" });

      return new Response(JSON.stringify({
        service: "authService",
        operation: "login",
        status: "ok",
        partial: true,
        traceId: "trc_auth_login",
        updatedAt: "2026-07-01T00:00:00.000Z",
        data: { authState: "mfa_required" },
        error: null,
        states: { loading: false, empty: false, error: false, partial: true },
        meta: { source: "api-gateway" }
      }), { headers: { "content-type": "application/json" }, status: 200 });
    });

    const response = await apiRequest("/auth/login", {
      body: { email: "admin@example.com", password: "secret" },
      method: "POST",
      operation: "login",
      service: "authService"
    });

    assert.equal(response.service, "authService");
    assert.equal(response.status, "ok");
    assert.equal(response.data.authState, "mfa_required");
  });

  it("normalizes HTTP errors into frontend envelopes", async () => {
    globalThis.fetch = mock.fn(async () => new Response(JSON.stringify({
      service: "authService",
      operation: "getAuthState",
      status: "error",
      data: null,
      error: { code: "unauthorized", message: "Unauthorized" }
    }), { headers: { "content-type": "application/json" }, status: 401 }));

    const response = await apiRequest("/auth/state", {
      operation: "getAuthState",
      service: "authService"
    });

    assert.equal(response.status, "error");
    assert.equal(response.states.error, true);
    assert.equal(response.error.code, "unauthorized");
  });

  it("normalizes network failures into frontend envelopes", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new TypeError("fetch failed");
    });

    const response = await apiRequest("/health", {
      operation: "health",
      service: "apiClient"
    });

    assert.equal(response.status, "error");
    assert.equal(response.error.code, "network_error");
    assert.equal(response.states.error, true);
  });

  it("creates explicit error envelopes for adapter-level validation", () => {
    const response = createApiErrorEnvelope({
      code: "missing_id",
      message: "Identifier is required.",
      operation: "rotateApiKey",
      service: "integrationService"
    });

    assert.equal(response.service, "integrationService");
    assert.equal(response.status, "error");
    assert.equal(response.error.code, "missing_id");
  });
});
```

- [x] **Step 2: Run the test and verify it fails because the client does not exist**

Run: `npm run test:api-client`

Expected: FAIL with `Cannot find module '../src/services/apiClient.js'`.

- [x] **Step 3: Add the API client**

Create `src/services/apiClient.js` with:

```js
const DEFAULT_API_BASE_PATH = "/api/v1";
const DEFAULT_DEMO_SERVICE_ADMIN_KEY = "dev-service-admin-key";

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
    "x-demo-service-admin-key": getDemoServiceAdminKey(),
    ...headers
  };

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
  return String(import.meta.env?.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
}

function getDemoServiceAdminKey() {
  return String(import.meta.env?.VITE_DEMO_SERVICE_ADMIN_KEY ?? DEFAULT_DEMO_SERVICE_ADMIN_KEY);
}

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}
```

- [x] **Step 4: Add the npm script**

Modify `package.json` scripts:

```json
"test:api-client": "node --test tests/api-client.test.js"
```

- [x] **Step 5: Run the API client tests**

Run: `npm run test:api-client`

Expected: PASS, 5 tests passing.

- [x] **Step 6: Commit**

```bash
git add package.json tests/api-client.test.js src/services/apiClient.js
git commit -m "test: cover frontend API client"
```

## Task 2: Local Dev Proxy And Runtime Docs

**Files:**
- Modify: `vite.config.js`
- Modify: `backend/README.md`

- [x] **Step 1: Add Vite proxy**

Modify `vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4100",
        changeOrigin: true
      }
    }
  }
});
```

- [x] **Step 2: Document real API local mode**

Append to `backend/README.md`:

````md
## Frontend Real API Mode

Run the API Gateway:

```bash
cd backend
npm run start:api-gateway
```

In another terminal, run the frontend:

```bash
npm run dev
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:4100`, and frontend service adapters call `/api/v1/*` by default. To call a different API host from the browser, set `VITE_API_BASE_URL`, for example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:4100 npm run dev
```

Local privileged demo actions use `VITE_DEMO_SERVICE_ADMIN_KEY`; when it is not set, the frontend sends `dev-service-admin-key`, matching `.env.example`.
````

- [x] **Step 3: Run build to verify config syntax**

Run: `npm run build`

Expected: PASS with Vite production build output.

- [x] **Step 4: Commit**

```bash
git add vite.config.js backend/README.md
git commit -m "chore: proxy frontend API requests in dev"
```

## Task 3: Auth And Dialog Service Adapters

**Files:**
- Modify: `src/services/authService.js`
- Modify: `src/services/dialogService.js`
- Modify: `tests/backend-services.test.js`

- [x] **Step 1: Replace auth service mock logic**

Change `src/services/authService.js` to:

```js
import { apiRequest } from "./apiClient.js";

const SERVICE = "authService";

export const authService = {
  async getAuthState() {
    return apiRequest("/auth/state", {
      operation: "getAuthState",
      service: SERVICE
    });
  },

  async login(payload = {}) {
    return apiRequest("/auth/login", {
      body: payload,
      method: "POST",
      operation: "login",
      service: SERVICE
    });
  },

  async logout(payload = {}) {
    return apiRequest("/auth/logout", {
      body: payload,
      method: "POST",
      operation: "logout",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["getAuthState", "login", "logout"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
      note: "Connected to API Gateway auth routes."
    };
  }
};
```

- [x] **Step 2: Replace dialog service mock logic**

Change `src/services/dialogService.js` to:

```js
import { apiRequest } from "./apiClient.js";

const SERVICE = "dialogService";

export const dialogService = {
  async fetchDialogs(filters = {}) {
    return apiRequest("/dialogs", {
      operation: "fetchDialogs",
      query: filters,
      service: SERVICE
    });
  },

  async transitionConversationStatus({ conversationId, ...payload }) {
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/status`, {
      body: payload,
      method: "PATCH",
      operation: "transitionConversationStatus",
      service: SERVICE
    });
  },

  async uploadAttachment(payload) {
    return apiRequest("/dialogs/attachments", {
      body: payload,
      method: "POST",
      operation: "uploadAttachment",
      service: SERVICE
    });
  },

  async createOutboundConversationRequest(payload) {
    return apiRequest("/dialogs/outbound", {
      body: payload,
      method: "POST",
      operation: "createOutboundConversationRequest",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchDialogs", "transitionConversationStatus", "uploadAttachment", "createOutboundConversationRequest"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway dialog routes."
    };
  }
};
```

- [x] **Step 3: Rewrite affected backend service tests to mock `fetch`**

In `tests/backend-services.test.js`, add shared helpers near the top:

```js
import { afterEach, mock } from "node:test";

afterEach(() => {
  mock.restoreAll();
  delete globalThis.fetch;
});

function installFetchMock(assertRequest, envelope) {
  globalThis.fetch = mock.fn(async (url, options = {}) => {
    assertRequest(url, options);
    return new Response(JSON.stringify(envelope), {
      headers: { "content-type": "application/json" },
      status: 200
    });
  });
}

function envelope(service, operation, data = {}) {
  return {
    service,
    operation,
    status: "ok",
    partial: false,
    traceId: `trc_${service}_${operation}`,
    updatedAt: "2026-07-01T00:00:00.000Z",
    data,
    error: null,
    states: { loading: false, empty: false, error: false, partial: false },
    meta: { source: "api-gateway" }
  };
}
```

Replace auth and dialog assertions with route assertions:

```js
it("auth service calls real API routes", async () => {
  installFetchMock((url, options) => {
    assert.equal(url, "/api/v1/auth/login");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), {
      email: "service-admin@example.com",
      password: "correct-password"
    });
  }, envelope("authService", "login", { authState: "mfa_required" }));

  const response = await authService.login({
    email: "service-admin@example.com",
    password: "correct-password"
  });

  assert.equal(response.service, "authService");
  assert.equal(response.data.authState, "mfa_required");
});

it("dialog service calls real API routes", async () => {
  installFetchMock((url, options) => {
    assert.equal(url, "/api/v1/dialogs?page=1&pageSize=25");
    assert.equal(options.method, "GET");
  }, envelope("dialogService", "fetchDialogs", { items: [], pagination: { page: 1, pageSize: 25, total: 0 } }));

  const response = await dialogService.fetchDialogs({ page: 1, pageSize: 25 });

  assert.equal(response.service, "dialogService");
  assert.deepEqual(response.data.items, []);
});
```

- [x] **Step 4: Run focused tests**

Run: `npm run test:api-client && npm run test:services`

Expected: PASS for API client tests and service contract tests.

- [x] **Step 5: Commit**

```bash
git add src/services/authService.js src/services/dialogService.js tests/backend-services.test.js
git commit -m "feat: connect auth and dialogs to API gateway"
```

## Task 4: Workspace, Reports, Integrations, Permissions And Automation Adapters

**Files:**
- Modify: `src/services/clientService.js`
- Modify: `src/services/templateService.js`
- Modify: `src/services/reportService.js`
- Modify: `src/services/integrationService.js`
- Modify: `src/services/permissionService.js`
- Modify: `src/services/visitorService.js`
- Modify: `src/services/automationService.js`
- Modify: `src/services/qualityService.js`
- Modify: `tests/backend-services.test.js`

- [x] **Step 1: Convert adapters to `apiRequest` routes**

For each method, replace `createEnvelope()` mock code with the route from the API Route Mapping table. Use these operation snippets:

```js
// clientService
fetchClientProfiles(filters = {}) => apiRequest("/clients", { operation: "fetchClientProfiles", query: filters, service: SERVICE })
mergeClientProfiles(payload) => apiRequest("/clients/merge", { body: payload, method: "POST", operation: "mergeClientProfiles", service: SERVICE })
unmergeClientProfile(payload) => apiRequest("/clients/unmerge", { body: payload, method: "POST", operation: "unmergeClientProfile", service: SERVICE })

// templateService
fetchTemplates(filters = {}) => apiRequest("/templates", { operation: "fetchTemplates", query: filters, service: SERVICE })
saveTemplate(template) => apiRequest("/templates", { body: template, method: "POST", operation: "saveTemplate", service: SERVICE })

// reportService
fetchReportWorkspace(filters = {}) => apiRequest("/reports/workspace", { operation: "fetchReportWorkspace", query: filters, service: SERVICE })
requestReportExport(payload) => apiRequest("/reports/exports", { body: payload, method: "POST", operation: "requestReportExport", service: SERVICE })
retryReportExport(job) => apiRequest(`/reports/exports/${encodeURIComponent(job.id)}/retry`, { body: job, method: "POST", operation: "retryReportExport", service: SERVICE })
getExportFileDescriptor(job) => apiRequest(`/reports/exports/${encodeURIComponent(job.id)}/file`, { operation: "getExportFileDescriptor", service: SERVICE })

// integrationService
fetchIntegrationWorkspace() => apiRequest("/integrations/workspace", { operation: "fetchIntegrationWorkspace", service: SERVICE })
testChannelConnection(payload) => apiRequest("/integrations/channel-tests", { body: payload, method: "POST", operation: "testChannelConnection", service: SERVICE })
rotateApiKey(keyId) => apiRequest(`/integrations/api-keys/${encodeURIComponent(keyId)}/rotate`, { method: "POST", operation: "rotateApiKey", service: SERVICE })
replayWebhookDelivery(delivery) => apiRequest(`/integrations/webhooks/deliveries/${encodeURIComponent(delivery.id)}/replay`, { body: delivery, method: "POST", operation: "replayWebhookDelivery", service: SERVICE })
revokeSecuritySession(sessionId) => apiRequest(`/integrations/security/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: "POST", operation: "revokeSecuritySession", service: SERVICE })

// permissionService
validatePermission(payload) => apiRequest("/permissions/validate", { body: payload, method: "POST", operation: "validatePermission", service: SERVICE })
fetchPermissionModel() => apiRequest("/permissions/model", { operation: "fetchPermissionModel", service: SERVICE })

// visitorService
fetchVisitorWorkspace() => apiRequest("/automation/workspace", { operation: "fetchVisitorWorkspace", service: SERVICE })
saveProactiveRule(rule) => apiRequest("/automation/proactive-rules", { body: rule, method: "POST", operation: "saveProactiveRule", service: SERVICE })
triggerRescueReturn(chat) => apiRequest("/automation/handoff-events", { body: chat, method: "POST", operation: "triggerRescueReturn", service: SERVICE })

// automationService
fetchAutomationWorkspace() => apiRequest("/automation/workspace", { operation: "fetchAutomationWorkspace", service: SERVICE })
validateBotFlowImport(input) => apiRequest("/automation/bot-flow/validate", { body: { input }, method: "POST", operation: "validateBotFlowImport", service: SERVICE })
publishBotScenario(scenario) => apiRequest(`/automation/bot-scenarios/${encodeURIComponent(scenario.id)}/publish`, { body: scenario, method: "POST", operation: "publishBotScenario", service: SERVICE })
testBotScenario(scenario) => apiRequest(`/automation/bot-scenarios/${encodeURIComponent(scenario.id)}/test-runs`, { body: scenario, method: "POST", operation: "testBotScenario", service: SERVICE })

// qualityService
fetchQualityWorkspace() => apiRequest("/quality/workspace", { operation: "fetchQualityWorkspace", service: SERVICE })
scoreDraftResponse(payload) => apiRequest("/quality/draft-score", { body: payload, method: "POST", operation: "scoreDraftResponse", service: SERVICE })
```

- [x] **Step 2: Update readiness notes**

For each converted service, keep `getReadiness()` and set:

```js
status: "ready",
note: "Connected to API Gateway routes."
```

- [x] **Step 3: Add one route assertion per converted service**

In `tests/backend-services.test.js`, add a table-driven test:

```js
it("workspace, reports, integrations, permissions, automation and quality services call API Gateway routes", async () => {
  const cases = [
    [() => clientService.fetchClientProfiles({ page: 1 }), "/api/v1/clients?page=1", "GET", "clientService"],
    [() => templateService.fetchTemplates({ operatorId: "current" }), "/api/v1/templates?operatorId=current", "GET", "templateService"],
    [() => reportService.fetchReportWorkspace({ period: "Today" }), "/api/v1/reports/workspace?period=Today", "GET", "reportService"],
    [() => integrationService.fetchIntegrationWorkspace(), "/api/v1/integrations/workspace", "GET", "integrationService"],
    [() => permissionService.fetchPermissionModel(), "/api/v1/permissions/model", "GET", "permissionService"],
    [() => visitorService.fetchVisitorWorkspace(), "/api/v1/automation/workspace", "GET", "visitorService"],
    [() => automationService.fetchAutomationWorkspace(), "/api/v1/automation/workspace", "GET", "automationService"],
    [() => qualityService.fetchQualityWorkspace(), "/api/v1/quality/workspace", "GET", "qualityService"]
  ];

  for (const [callService, expectedUrl, expectedMethod, expectedService] of cases) {
    installFetchMock((url, options) => {
      assert.equal(url, expectedUrl);
      assert.equal(options.method, expectedMethod);
    }, envelope(expectedService, "contract", { ok: true }));

    const response = await callService();
    assert.equal(response.service, expectedService);
    mock.restoreAll();
    delete globalThis.fetch;
  }
});
```

- [x] **Step 4: Run focused tests**

Run: `npm run test:api-client && npm run test:services`

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/services/clientService.js src/services/templateService.js src/services/reportService.js src/services/integrationService.js src/services/permissionService.js src/services/visitorService.js src/services/automationService.js src/services/qualityService.js tests/backend-services.test.js
git commit -m "feat: connect workspace service adapters to API gateway"
```

## Task 5: Admin, Billing, Monitoring, Incidents And Feature Flag Adapters

**Files:**
- Modify: `src/services/auditService.js`
- Modify: `src/services/tenantService.js`
- Modify: `src/services/billingService.js`
- Modify: `src/services/platformMonitoringService.js`
- Modify: `src/services/supportAdminService.js`
- Modify: `src/services/incidentService.js`
- Modify: `src/services/featureFlagService.js`
- Modify: `tests/backend-services.test.js`

- [ ] **Step 1: Convert remaining adapters to API Gateway routes**

Use these operation snippets:

```js
// auditService
fetchAuditEvents(filters = {}) => apiRequest("/service-admin/audit-events", { operation: "fetchAuditEvents", query: filters, service: SERVICE })
exportAuditEvents(payload = {}) => apiRequest("/service-admin/audit-events", { operation: "exportAuditEvents", query: { ...payload, export: true }, service: SERVICE })
redactAuditEvent(eventId, payload) => apiRequest(`/service-admin/audit-events/${encodeURIComponent(eventId)}/redactions`, { body: payload, method: "POST", operation: "redactAuditEvent", service: SERVICE })

// tenantService
fetchTenants(filters = {}) => apiRequest("/tenants", { operation: "fetchTenants", query: filters, service: SERVICE })
fetchTenantDetail(tenantId) => apiRequest(`/tenants/${encodeURIComponent(tenantId)}`, { operation: "fetchTenantDetail", service: SERVICE })
updateTenantStatus({ tenantId, ...payload }) => apiRequest(`/tenants/${encodeURIComponent(tenantId)}/status`, { body: payload, method: "PATCH", operation: "updateTenantStatus", service: SERVICE })

// billingService
fetchTariffs() => apiRequest("/billing/tariffs", { operation: "fetchTariffs", service: SERVICE })
previewTariffChange({ tenantId, ...payload }) => apiRequest(`/billing/tenants/${encodeURIComponent(tenantId)}/tariff-change/preview`, { body: payload, method: "POST", operation: "previewTariffChange", service: SERVICE })
changeTenantTariff({ tenantId, ...payload }) => apiRequest(`/billing/tenants/${encodeURIComponent(tenantId)}/tariff-change`, { body: payload, method: "POST", operation: "changeTenantTariff", service: SERVICE })

// platformMonitoringService
fetchPlatformSnapshot(filters = {}) => apiRequest("/platform-monitoring/snapshot", { operation: "fetchPlatformSnapshot", query: filters, service: SERVICE })
fetchComponentDrilldown(componentId) => apiRequest(`/platform-monitoring/components/${encodeURIComponent(componentId)}`, { operation: "fetchComponentDrilldown", service: SERVICE })
acknowledgeComponentAlert({ componentId, ...payload }) => apiRequest(`/platform-monitoring/components/${encodeURIComponent(componentId)}/acknowledgements`, { body: payload, method: "POST", operation: "acknowledgeComponentAlert", service: SERVICE })

// supportAdminService
fetchSupportUsers(filters = {}) => apiRequest("/service-admin/users", { operation: "fetchSupportUsers", query: filters, service: SERVICE })
resetTwoFactor({ userId, ...payload }) => apiRequest(`/service-admin/users/${encodeURIComponent(userId)}/mfa/reset`, { body: payload, method: "POST", operation: "resetTwoFactor", service: SERVICE })
forceLogout({ userId, ...payload }) => apiRequest(`/service-admin/users/${encodeURIComponent(userId)}/sessions/logout`, { body: payload, method: "POST", operation: "forceLogout", service: SERVICE })
blockUser({ userId, ...payload }) => apiRequest(`/service-admin/users/${encodeURIComponent(userId)}/block`, { body: payload, method: "POST", operation: "blockUser", service: SERVICE })
resendInvite({ userId, ...payload }) => apiRequest(`/service-admin/users/${encodeURIComponent(userId)}/invite/resend`, { body: payload, method: "POST", operation: "resendInvite", service: SERVICE })
startImpersonation(payload) => apiRequest("/service-admin/impersonations", { body: payload, method: "POST", operation: "startImpersonation", service: SERVICE })
stopImpersonation({ impersonationId, ...payload }) => apiRequest(`/service-admin/impersonations/${encodeURIComponent(impersonationId)}/stop`, { body: payload, method: "POST", operation: "stopImpersonation", service: SERVICE })

// incidentService
fetchIncidents(filters = {}) => apiRequest("/incidents", { operation: "fetchIncidents", query: filters, service: SERVICE })
fetchIncidentDetail(incidentId) => apiRequest(`/incidents/${encodeURIComponent(incidentId)}`, { operation: "fetchIncidentDetail", service: SERVICE })
addIncidentUpdate({ incidentId, ...payload }) => apiRequest(`/incidents/${encodeURIComponent(incidentId)}/updates`, { body: payload, method: "POST", operation: "addIncidentUpdate", service: SERVICE })

// featureFlagService
fetchFeatureFlags(filters = {}) => apiRequest("/feature-flags", { operation: "fetchFeatureFlags", query: filters, service: SERVICE })
previewFlagChange({ flagId, ...payload }) => apiRequest(`/feature-flags/${encodeURIComponent(flagId)}/preview`, { body: payload, method: "POST", operation: "previewFlagChange", service: SERVICE })
updateFeatureFlag({ flagId, ...payload }) => apiRequest(`/feature-flags/${encodeURIComponent(flagId)}`, { body: payload, method: "PATCH", operation: "updateFeatureFlag", service: SERVICE })
```

- [ ] **Step 2: Confirm backend support for audit export and redaction**

Run: `rg -n "audit-events|redact|redaction" backend/apps/api-gateway/src/service-admin backend/apps/api-gateway/src/platform backend/apps/api-gateway/src -g "*.ts"`

Expected: if no audit export or redaction route exists, keep `exportAuditEvents` and `redactAuditEvent` as API-client error envelopes with `code: "api_route_missing"` and document the backend route gap in `backendIntegrationService` readiness. Do not silently return mock export URLs after this task.

- [ ] **Step 3: Add route assertions for remaining services**

In `tests/backend-services.test.js`, add:

```js
it("admin, billing, monitoring, incidents and feature flag services call API Gateway routes", async () => {
  const cases = [
    [() => tenantService.fetchTenants({ status: "watch" }), "/api/v1/tenants?status=watch", "GET", "tenantService"],
    [() => billingService.fetchTariffs(), "/api/v1/billing/tariffs", "GET", "billingService"],
    [() => platformMonitoringService.fetchPlatformSnapshot({ status: "degraded" }), "/api/v1/platform-monitoring/snapshot?status=degraded", "GET", "platformMonitoringService"],
    [() => supportAdminService.fetchSupportUsers({ query: "agent" }), "/api/v1/service-admin/users?query=agent", "GET", "supportAdminService"],
    [() => incidentService.fetchIncidents({ status: "open" }), "/api/v1/incidents?status=open", "GET", "incidentService"],
    [() => featureFlagService.fetchFeatureFlags({ status: "on" }), "/api/v1/feature-flags?status=on", "GET", "featureFlagService"]
  ];

  for (const [callService, expectedUrl, expectedMethod, expectedService] of cases) {
    installFetchMock((url, options) => {
      assert.equal(url, expectedUrl);
      assert.equal(options.method, expectedMethod);
    }, envelope(expectedService, "contract", { ok: true }));

    const response = await callService();
    assert.equal(response.service, expectedService);
    mock.restoreAll();
    delete globalThis.fetch;
  }
});
```

- [ ] **Step 4: Run focused tests**

Run: `npm run test:api-client && npm run test:services`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/auditService.js src/services/tenantService.js src/services/billingService.js src/services/platformMonitoringService.js src/services/supportAdminService.js src/services/incidentService.js src/services/featureFlagService.js tests/backend-services.test.js
git commit -m "feat: connect admin service adapters to API gateway"
```

## Task 6: Backend Integration Snapshot And Mock Removal Guard

**Files:**
- Modify: `src/services/backendIntegrationService.js`
- Modify: `tests/backend-services.test.js`

- [ ] **Step 1: Replace dynamic mock registry with static API readiness**

Change `src/services/backendIntegrationService.js` so `fetchBackendIntegrationSnapshot()` returns a local readiness envelope with `meta.source: "api-client"` and every connected adapter marked `ready`. Use this registry:

```js
const serviceReadiness = [
  ["dialogService", ["fetchDialogs", "transitionConversationStatus", "uploadAttachment", "createOutboundConversationRequest"]],
  ["clientService", ["fetchClientProfiles", "mergeClientProfiles", "unmergeClientProfile"]],
  ["templateService", ["fetchTemplates", "saveTemplate"]],
  ["reportService", ["fetchReportWorkspace", "requestReportExport", "retryReportExport", "getExportFileDescriptor"]],
  ["integrationService", ["fetchIntegrationWorkspace", "testChannelConnection", "rotateApiKey", "replayWebhookDelivery", "revokeSecuritySession"]],
  ["permissionService", ["validatePermission", "fetchPermissionModel"]],
  ["visitorService", ["fetchVisitorWorkspace", "saveProactiveRule", "triggerRescueReturn"]],
  ["automationService", ["fetchAutomationWorkspace", "validateBotFlowImport", "publishBotScenario", "testBotScenario"]],
  ["qualityService", ["fetchQualityWorkspace", "scoreDraftResponse"]],
  ["auditService", ["fetchAuditEvents", "exportAuditEvents", "redactAuditEvent"]],
  ["authService", ["getAuthState", "login", "logout"]],
  ["tenantService", ["fetchTenants", "fetchTenantDetail", "updateTenantStatus"]],
  ["billingService", ["fetchTariffs", "previewTariffChange", "changeTenantTariff"]],
  ["platformMonitoringService", ["fetchPlatformSnapshot", "fetchComponentDrilldown", "acknowledgeComponentAlert"]],
  ["supportAdminService", ["fetchSupportUsers", "resetTwoFactor", "forceLogout", "blockUser", "resendInvite", "startImpersonation", "stopImpersonation"]],
  ["incidentService", ["fetchIncidents", "fetchIncidentDetail", "addIncidentUpdate"]],
  ["featureFlagService", ["fetchFeatureFlags", "previewFlagChange", "updateFeatureFlag"]]
];
```

- [ ] **Step 2: Add a no-mock-import regression test**

In `tests/backend-services.test.js`, add:

```js
it("service adapters do not import mockBackend or static data fixtures", () => {
  const serviceFiles = [
    "auditService.js",
    "authService.js",
    "automationService.js",
    "billingService.js",
    "clientService.js",
    "dialogService.js",
    "featureFlagService.js",
    "incidentService.js",
    "integrationService.js",
    "permissionService.js",
    "platformMonitoringService.js",
    "qualityService.js",
    "reportService.js",
    "supportAdminService.js",
    "templateService.js",
    "tenantService.js",
    "visitorService.js"
  ];

  for (const fileName of serviceFiles) {
    const source = readFileSync(new URL(`../src/services/${fileName}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /mockBackend\.js/);
    assert.doesNotMatch(source, /\.\.\/data/);
  }
});
```

- [ ] **Step 3: Run service tests**

Run: `npm run test:services`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/backendIntegrationService.js tests/backend-services.test.js
git commit -m "test: prevent mock backend service regressions"
```

## Task 7: Live API Smoke Test

**Files:**
- Create: `tests/backend-api-smoke.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add gated live API smoke test**

Create `tests/backend-api-smoke.test.js`:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const baseUrl = process.env.BACKEND_API_BASE_URL ?? "http://127.0.0.1:4100/api/v1";
const demoKey = process.env.VITE_DEMO_SERVICE_ADMIN_KEY ?? "dev-service-admin-key";
const enabled = process.env.RUN_BACKEND_API_SMOKE === "1";

describe("live backend API smoke", { skip: !enabled }, () => {
  it("responds to health and authenticated envelope routes", async () => {
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const ready = await fetch(`${baseUrl}/ready`);
    assert.equal(ready.status, 200);

    const authState = await fetch(`${baseUrl}/auth/state`, {
      headers: {
        "x-demo-service-admin-key": demoKey
      }
    });
    assert.equal(authState.status, 200);
    const authEnvelope = await authState.json();
    assert.equal(authEnvelope.service, "authService");
    assert.equal(authEnvelope.operation, "getAuthState");

    const dialogs = await fetch(`${baseUrl}/dialogs?page=1&pageSize=1`, {
      headers: {
        "x-demo-service-admin-key": demoKey
      }
    });
    assert.equal(dialogs.status, 200);
    const dialogEnvelope = await dialogs.json();
    assert.equal(dialogEnvelope.service, "dialogService");
    assert.equal(dialogEnvelope.operation, "fetchDialogs");
    assert.ok(Array.isArray(dialogEnvelope.data.items));
  });
});
```

- [ ] **Step 2: Add npm script**

Modify `package.json` scripts:

```json
"test:backend-api-smoke": "node --test tests/backend-api-smoke.test.js"
```

- [ ] **Step 3: Run skipped smoke test without backend**

Run: `npm run test:backend-api-smoke`

Expected: PASS with the suite skipped.

- [ ] **Step 4: Run live smoke test with backend**

Terminal 1:

```bash
cd backend
npm run start:api-gateway
```

Terminal 2:

```bash
RUN_BACKEND_API_SMOKE=1 npm run test:backend-api-smoke
```

Expected: PASS with health, ready, auth state and dialogs envelopes.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/backend-api-smoke.test.js
git commit -m "test: add live backend API smoke coverage"
```

## Task 8: Full Verification

**Files:**
- No source files expected unless verification exposes a defect.

- [ ] **Step 1: Run frontend service and build checks**

Run:

```bash
npm run test:api-client
npm run test:services
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Run backend typecheck**

Run: `npm run backend:typecheck`

Expected: PASS.

- [ ] **Step 3: Run backend contract tests if time allows**

Run: `npm run backend:test`

Expected: PASS.

- [ ] **Step 4: Run Playwright smoke against real API mode**

Terminal 1:

```bash
cd backend
npm run start:api-gateway
```

Terminal 2:

```bash
npm run dev
```

Terminal 3:

```bash
npm run test:smoke
```

Expected: PASS. If the existing Playwright smoke assumes mock-only fixture text, update the smoke assertion to verify rendered data from the API Gateway envelope instead of static mock text.

- [ ] **Step 5: Commit final verification changes**

```bash
git add package.json tests src backend/README.md vite.config.js
git commit -m "chore: verify frontend real API integration"
```

## Self-Review

- Spec coverage: the plan covers the shared client, dev proxy, every existing frontend service adapter, auth headers, envelope preservation, tests, live backend smoke and documentation.
- Placeholder scan: no open implementation placeholders are left. The audit export/redaction backend gap is handled with an explicit `api_route_missing` behavior if the route does not exist.
- Type and name consistency: service names match `src/services/index.js`; operation names match existing frontend method names; backend routes match controller decorators found under `backend/apps/api-gateway/src`.
- Scope check: this plan intentionally does not add new backend routes except where verification proves an adapter currently has no API route. The primary goal is wiring existing frontend adapters to existing API Gateway endpoints.
