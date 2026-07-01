import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  apiRequest,
  buildApiUrl,
  configureApiClientForTests,
  createApiErrorEnvelope,
  resetApiClientTestConfig
} from "../src/services/apiClient.js";

const originalFetch = globalThis.fetch;

describe("api client", () => {
  afterEach(() => {
    mock.restoreAll();
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

  it("sends JSON, trace headers and the demo service-admin key", async () => {
    globalThis.fetch = mock.fn(async (url, options) => {
      assert.equal(url, "/api/v1/auth/login");
      assert.equal(options.method, "POST");
      assert.equal(options.headers["content-type"], "application/json");
      assert.equal(options.headers["x-demo-service-admin-key"], "dev-service-admin-key");
      assert.equal(options.headers["x-demo-service-admin-actor-id"], "svc-admin-demo");
      assert.equal(options.headers["x-demo-service-admin-actor-name"], "Demo Service Admin");
      assert.equal(options.headers["x-demo-service-admin-mfa-verified"], "true");
      assert.equal(options.headers["x-demo-service-admin-permissions"], "*");
      assert.equal(options.headers["x-demo-service-admin-roles"], "service_admin");
      assert.ok(Date.parse(options.headers["x-demo-service-admin-session-expires-at"]) > Date.now());
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

  it("sends a configured demo service-admin key outside production", async () => {
    configureApiClientForTests({
      demoServiceAdminKey: "configured-demo-key",
      mode: "test"
    });

    globalThis.fetch = mock.fn(async (_url, options) => {
      assert.equal(options.headers["x-demo-service-admin-key"], "configured-demo-key");
      assert.equal(options.headers["x-demo-service-admin-actor-id"], "svc-admin-demo");
      assert.equal(options.headers["x-demo-service-admin-permissions"], "*");

      return new Response(JSON.stringify({ status: "ok", data: { ok: true } }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    });

    const response = await apiRequest("/health", {
      operation: "health",
      service: "apiClient"
    });

    assert.equal(response.status, "ok");
  });

  it("omits the demo service-admin key in production mode", async () => {
    configureApiClientForTests({
      demoServiceAdminKey: "configured-demo-key",
      mode: "production"
    });

    globalThis.fetch = mock.fn(async (_url, options) => {
      assert.equal("x-demo-service-admin-key" in options.headers, false);
      assert.equal("x-demo-service-admin-actor-id" in options.headers, false);
      assert.equal("x-demo-service-admin-permissions" in options.headers, false);

      return new Response(JSON.stringify({ status: "ok", data: { ok: true } }), {
        headers: { "content-type": "application/json" },
        status: 200
      });
    });

    const response = await apiRequest("/health", {
      operation: "health",
      service: "apiClient"
    });

    assert.equal(response.status, "ok");
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
