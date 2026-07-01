import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestEnv } from "../packages/testing/src/index.ts";
import { loadBackendConfig } from "../packages/config/src/index.ts";
import { createEnvelope } from "../packages/envelope/src/index.ts";
import { buildHealthEnvelope, buildReadinessEnvelope } from "../apps/api-gateway/src/health.response.ts";
import { createRequestTraceId } from "../packages/observability/src/index.ts";

describe("phase 0 shared backend foundation", () => {
  it("creates frontend-compatible response envelopes", () => {
    const envelope = createEnvelope({
      service: "api-gateway",
      operation: "health",
      traceId: "req-phase-0",
      data: { ok: true }
    });

    assert.equal(envelope.service, "api-gateway");
    assert.equal(envelope.operation, "health");
    assert.equal(envelope.status, "ok");
    assert.equal(envelope.partial, false);
    assert.equal(envelope.traceId, "req-phase-0");
    assert.equal(envelope.states.loading, false);
    assert.equal(envelope.states.empty, false);
    assert.equal(envelope.states.error, false);
    assert.equal(envelope.states.partial, false);
    assert.equal(envelope.meta.constructor, Object);
    assert.deepEqual(envelope.data, { ok: true });
    assert.equal(envelope.error, null);
  });

  it("generates unique fallback trace IDs for envelopes", () => {
    const traceIds = new Set(
      Array.from({ length: 1000 }, () =>
        createEnvelope({
          service: "api-gateway",
          operation: "health",
          data: { ok: true }
        }).traceId
      )
    );

    assert.equal(traceIds.size, 1000);
  });

  it("fails fast when required configuration is missing", () => {
    assert.throws(
      () => loadBackendConfig({ NODE_ENV: "test" }),
      /Invalid backend configuration: .*DATABASE_URL/
    );
  });

  it("loads validated backend configuration from environment variables", () => {
    const config = loadBackendConfig(createTestEnv({ PORT: "4201" }));

    assert.equal(config.NODE_ENV, "test");
    assert.equal(config.PORT, 4201);
    assert.equal(config.SERVICE_NAME, "api-gateway");
    assert.equal(config.BILLING_REPOSITORY, "json");
    assert.equal(config.CONVERSATION_REPOSITORY, "json");
    assert.equal(config.ROUTING_REPOSITORY, "json");
    assert.equal(config.S3_REGION, "us-east-1");
    assert.equal(loadBackendConfig(createTestEnv({ BILLING_REPOSITORY: "prisma" })).BILLING_REPOSITORY, "prisma");
    assert.equal(loadBackendConfig(createTestEnv({ CONVERSATION_REPOSITORY: "prisma" })).CONVERSATION_REPOSITORY, "prisma");
    assert.equal(loadBackendConfig(createTestEnv({ ROUTING_REPOSITORY: "prisma" })).ROUTING_REPOSITORY, "prisma");
  });

  it("requires explicit non-default demo service-admin key outside local test environments", () => {
    const missingKeyEnv = createTestEnv({ NODE_ENV: "production" });
    delete missingKeyEnv.DEMO_SERVICE_ADMIN_KEY;

    assert.throws(
      () => loadBackendConfig(missingKeyEnv),
      /DEMO_SERVICE_ADMIN_KEY/
    );

    assert.throws(
      () => loadBackendConfig(createTestEnv({ NODE_ENV: "production", DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key" })),
      /DEMO_SERVICE_ADMIN_KEY must be set to a non-default value/
    );

    const config = loadBackendConfig(createTestEnv({
      NODE_ENV: "staging",
      DEMO_SERVICE_ADMIN_KEY: "staging-service-admin-key"
    }));

    assert.equal(config.NODE_ENV, "staging");
    assert.equal(config.DEMO_SERVICE_ADMIN_KEY, "staging-service-admin-key");
  });

  it("returns envelope-shaped health and readiness responses with propagated request IDs", () => {
    const config = loadBackendConfig(createTestEnv());

    const health = buildHealthEnvelope(config, "req-health-1");
    const ready = buildReadinessEnvelope(config, "req-ready-1");

    assert.equal(health.operation, "health");
    assert.equal(health.traceId, "req-health-1");
    assert.equal(health.data.status, "ok");
    assert.equal(health.data.dependencies.database.configured, true);
    assert.equal(health.data.dependencies.redis.configured, true);
    assert.equal(health.data.dependencies.objectStorage.configured, true);

    const partialObjectStorage = buildHealthEnvelope({ ...config, S3_SECRET_KEY: "" }, "req-health-partial-storage");
    assert.equal(partialObjectStorage.data.dependencies.objectStorage.configured, false);

    assert.equal(ready.operation, "ready");
    assert.equal(ready.traceId, "req-ready-1");
    assert.equal(ready.data.status, "ready");
    assert.equal(ready.data.service, "api-gateway");
  });

  it("normalizes client request IDs and generates unique trace IDs", () => {
    const normalized = createRequestTraceId("api-gateway", "health", "  req with spaces/\r\n  ");
    const generatedOne = createRequestTraceId("api-gateway", "health");
    const generatedTwo = createRequestTraceId("api-gateway", "health");

    assert.equal(normalized, "req_with_spaces_");
    assert.match(generatedOne, /^trc_api_gateway_health_[0-9a-f-]{36}$/);
    assert.notEqual(generatedOne, generatedTwo);
  });
});
