import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  apiRequest,
  buildApiUrl,
  configureApiClientForTests,
  createApiErrorEnvelope,
  resetApiClientTestConfig
} from "../src/services/apiClient.js";
import { clearServiceAdminSession, setServiceAdminSession } from "../src/app/sessionStore.js";

const originalFetch = globalThis.fetch;

describe("api client", () => {
  afterEach(() => {
    mock.restoreAll();
    clearServiceAdminSession();
    resetApiClientTestConfig();
    globalThis.fetch = originalFetch;
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

  it("builds URLs against a configured API base URL", () => {
    configureApiClientForTests({ apiBaseUrl: "https://api.example.test/base/" });

    const url = buildApiUrl("/dialogs", { page: 1 });

    assert.equal(url, "https://api.example.test/api/v1/dialogs?page=1");
  });

  it("sends JSON and tenant bearer token for default auth mode", async () => {
    globalThis.fetch = mock.fn(async (url, options) => {
      assert.equal(url, "/api/v1/auth/tenant/state");
      assert.equal(options.method, "GET");
      assert.equal(options.headers.authorization, "Bearer tenant-token");
      assert.equal("x-demo-service-admin-key" in options.headers, false);

      return new Response(JSON.stringify({
        service: "authService",
        operation: "getTenantAuthState",
        status: "ok",
        data: { authenticated: true },
        error: null
      }), { headers: { "content-type": "application/json" }, status: 200 });
    });

    const { setTenantSession } = await import("../src/app/sessionStore.js");
    setTenantSession({ accessToken: "tenant-token", tenantId: "tenant-demo" });

    const response = await apiRequest("/auth/tenant/state", {
      operation: "getTenantAuthState",
      service: "authService"
    });

    assert.equal(response.status, "ok");
  });

  it("requires a stored service-admin bearer token for service-admin routes", async () => {
    const response = await apiRequest("/service-admin/users", {
      authMode: "service-admin",
      operation: "fetchUsers",
      service: "supportAdminService"
    });

    assert.equal(response.status, "error");
    assert.equal(response.error.code, "service_admin_session_required");
  });

  it("sends service-admin bearer token when session is seeded", async () => {
    setServiceAdminSession({ accessToken: "svc-admin-token" });

    globalThis.fetch = mock.fn(async (_url, options) => {
      assert.equal(options.headers.authorization, "Bearer svc-admin-token");
      assert.equal("x-demo-service-admin-key" in options.headers, false);

      return new Response(JSON.stringify({ status: "ok", data: { ok: true } }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    });

    const response = await apiRequest("/service-admin/users", {
      authMode: "service-admin",
      operation: "fetchUsers",
      service: "supportAdminService"
    });

    assert.equal(response.status, "ok");
  });

  it("does not send demo service-admin headers in development mode", async () => {
    configureApiClientForTests({ mode: "development" });

    globalThis.fetch = mock.fn(async (_url, options) => {
      assert.equal("x-demo-service-admin-key" in options.headers, false);
      assert.equal("authorization" in options.headers, false);

      return new Response(JSON.stringify({ status: "ok", data: { ok: true } }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    });

    const response = await apiRequest("/health", {
      authMode: "public",
      operation: "health",
      service: "apiClient"
    });

    assert.equal(response.status, "ok");
  });

  it("normalizes HTTP errors into frontend envelopes", async () => {
    setServiceAdminSession({ accessToken: "service-admin-token" });

    globalThis.fetch = mock.fn(async () => new Response(JSON.stringify({
      service: "authService",
      operation: "getAuthState",
      status: "error",
      data: null,
      error: { code: "unauthorized", message: "Unauthorized" }
    }), { headers: { "content-type": "application/json" }, status: 401 }));

    const response = await apiRequest("/auth/state", {
      authMode: "service-admin",
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
      authMode: "public",
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
