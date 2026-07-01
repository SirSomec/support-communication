import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  planCustomerVisibleIncidentCommunication
} from "../apps/api-gateway/src/incidents/incident-communication.worker.ts";
import {
  buildStatusPageExternalIdempotencyKey,
  createDeterministicStatusPagePublisherAdapter,
  createRuntimeHttpStatusPagePublisherAdapter,
  executeStatusPageSyncOutboxWorker,
  publishIncidentStatusPageCommunication,
  publishPlatformAlertStatusPageCommunication,
  sanitizeStatusPagePublisherFailure
} from "../apps/api-gateway/src/platform/status-page-publisher.adapter.ts";
import { PlatformRepository } from "../apps/api-gateway/src/platform/platform.repository.ts";

const incidentPlan = () => planCustomerVisibleIncidentCommunication({
  incident: {
    customerMessage: "Webhook delivery delays may affect outbound notifications.",
    id: "inc-webhook-retry",
    severity: "sev2",
    status: "monitoring",
    updateText: "Webhook delivery delay is being monitored."
  },
  job: {
    id: "status_page_incident_update_001",
    queue: "status-page-sync",
    scope: "incident-update",
    target: "inc-webhook-retry"
  },
  traceId: "trc_status_page_incident"
});

describe("status-page publisher adapter contracts", () => {
  it("defines the status-page publisher adapter contract for incident updates", async () => {
    const publisher = createDeterministicStatusPagePublisherAdapter();
    const plan = incidentPlan();
    const result = await publishIncidentStatusPageCommunication({
      job: {
        id: "status_page_incident_update_001",
        queue: "status-page-sync",
        scope: "incident-update",
        target: "inc-webhook-retry"
      },
      now: "2026-07-01T10:00:00.000Z",
      plan,
      publisher
    });

    assert.equal(result.ok, true);
    assert.equal(result.providerStatusCode, 202);
    assert.equal(result.externalIdempotencyKey, "status-page:incident-update:inc-webhook-retry");
    assert.match(result.externalId, /^status_page_external_inc_webhook_retry_/);
    assert.equal(result.publishedAt, "2026-07-01T10:00:00.000Z");
    assert.equal(result.sanitizedFailure, undefined);
  });

  it("builds stable idempotent external keys for incident and alert scopes", () => {
    const incidentKey = buildStatusPageExternalIdempotencyKey("incident-update", "inc-webhook-retry");
    const alertKey = buildStatusPageExternalIdempotencyKey("component-alert", "cmp-webhooks");

    assert.equal(incidentKey, "status-page:incident-update:inc-webhook-retry");
    assert.equal(alertKey, "status-page:component-alert:cmp-webhooks");
    assert.equal(
      buildStatusPageExternalIdempotencyKey("incident-update", "inc-webhook-retry"),
      incidentKey
    );
    assert.notEqual(incidentKey, alertKey);
  });

  it("implements a deterministic status-page publisher adapter without HTTP side effects", async () => {
    const publisher = createDeterministicStatusPagePublisherAdapter();
    const result = await publisher.publish({
      body: {
        incidentId: "inc-auth-degrade",
        public: true,
        severity: "sev2",
        status: "investigating",
        tenantNamesExposed: false,
        updateText: "Auth latency is under review."
      },
      externalIdempotencyKey: "status-page:incident-update:inc-auth-degrade",
      scope: "incident-update",
      target: "inc-auth-degrade",
      traceId: "trc_status_page_deterministic"
    });

    assert.equal(result.ok, true);
    assert.equal(result.externalIdempotencyKey, "status-page:incident-update:inc-auth-degrade");
    assert.equal(result.providerStatusCode, 202);
  });

  it("implements runtime HTTP status-page publisher adapter boundary", async () => {
    const calls: Array<{ body: string; headers: Record<string, string>; url: string }> = [];
    const publisher = createRuntimeHttpStatusPagePublisherAdapter({
      endpoint: "https://status-page.provider.example.test/update",
      fetch: async (url, init) => {
        const headers: Record<string, string> = {};
        for (const [key, value] of new Headers(init?.headers)) {
          headers[key] = value;
        }
        calls.push({
          body: String(init?.body ?? ""),
          headers,
          url: String(url)
        });
        return new Response(JSON.stringify({ id: "provider-page-001" }), { status: 202 });
      }
    });

    const result = await publisher.publish({
      body: {
        componentId: "cmp-webhooks",
        public: true,
        status: "degraded",
        tenantNamesExposed: false
      },
      externalIdempotencyKey: "status-page:component-alert:cmp-webhooks",
      scope: "component-alert",
      target: "cmp-webhooks",
      traceId: "trc_status_page_http"
    });

    assert.equal(result.ok, true);
    assert.equal(result.providerStatusCode, 202);
    assert.equal(result.externalId, "provider-page-001");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://status-page.provider.example.test/update");
    assert.equal(calls[0].headers["idempotency-key"], "status-page:component-alert:cmp-webhooks");
    assert.equal(calls[0].headers["trace-id"], "trc_status_page_http");
    assert.equal(JSON.parse(calls[0].body).componentId, "cmp-webhooks");
  });

  it("wires incident publishing through the status-page publisher adapter", async () => {
    const publisher = createDeterministicStatusPagePublisherAdapter();
    const plan = incidentPlan();
    const result = await publishIncidentStatusPageCommunication({
      job: {
        id: "status_page_incident_runtime",
        queue: "status-page-sync",
        scope: "incident-update",
        target: plan.descriptor.incidentId
      },
      plan,
      publisher,
      traceId: "trc_status_page_incident_runtime"
    });

    assert.equal(result.ok, true);
    assert.equal(result.externalIdempotencyKey, "status-page:incident-update:inc-webhook-retry");
  });

  it("wires platform alert publishing through the status-page publisher adapter", async () => {
    const publisher = createDeterministicStatusPagePublisherAdapter();
    const result = await publishPlatformAlertStatusPageCommunication({
      component: {
        id: "cmp-webhooks",
        name: "Webhook Delivery",
        status: "degraded"
      },
      publisher,
      reason: "Platform alert reviewed",
      statusPageSync: {
        id: "status_page_component_alert_runtime",
        queue: "status-page-sync",
        scope: "component-alert",
        target: "cmp-webhooks"
      },
      traceId: "trc_status_page_alert_runtime"
    });

    assert.equal(result.ok, true);
    assert.equal(result.externalIdempotencyKey, "status-page:component-alert:cmp-webhooks");
  });

  it("sanitizes incident status-page publishing failures", async () => {
    const publisher = createRuntimeHttpStatusPagePublisherAdapter({
      apiKey: "status-page-secret-token",
      endpoint: "https://status-page.provider.example.test/update",
      fetch: async () => {
        throw new Error("status-page provider failed with Authorization: Bearer status-page-secret-token");
      }
    });
    const plan = incidentPlan();
    const result = await publishIncidentStatusPageCommunication({
      job: {
        id: "status_page_incident_redaction",
        queue: "status-page-sync",
        scope: "incident-update",
        target: "inc-webhook-retry"
      },
      plan,
      publisher
    });

    assert.equal(result.ok, false);
    assert.equal(result.sanitizedFailure?.includes("status-page-secret-token"), false);
    assert.equal(result.sanitizedFailure?.includes("[REDACTED:api_key]"), true);
  });

  it("sanitizes platform alert status-page publishing failures", async () => {
    const publisher = createRuntimeHttpStatusPagePublisherAdapter({
      apiKey: "alert-status-page-secret",
      endpoint: "https://status-page.provider.example.test/update",
      fetch: async () => {
        throw new Error("alert publish failed with Bearer alert-status-page-secret");
      }
    });
    const result = await publishPlatformAlertStatusPageCommunication({
      component: {
        id: "cmp-auth",
        name: "Auth",
        status: "degraded"
      },
      publisher,
      statusPageSync: {
        id: "status_page_alert_redaction",
        queue: "status-page-sync",
        scope: "component-alert",
        target: "cmp-auth"
      },
      traceId: "trc_status_page_alert_redaction"
    });

    assert.equal(result.ok, false);
    assert.equal(result.sanitizedFailure?.includes("alert-status-page-secret"), false);
    assert.equal(sanitizeStatusPagePublisherFailure(
      new Error("alert publish failed with Bearer alert-status-page-secret")
    ).includes("[REDACTED:api_key]"), true);
  });

  it("publishes status-page outbox rows through a worker and records status transitions", async () => {
    const repository = PlatformRepository.inMemory();
    const outbox = repository.savePlatformOutboxRow({
      aggregateId: "cmp-webhooks",
      aggregateType: "platform_component",
      createdAt: "2026-07-01T10:00:00.000Z",
      fingerprint: "status-page-worker-alert-fingerprint",
      id: "platform_outbox_status_page_worker_001",
      idempotencyKey: "platform-outbox:alert:status-page-worker-001",
      mutationKind: "alert",
      payload: {
        componentId: "cmp-webhooks",
        scope: "component-alert",
        status: "degraded"
      },
      queue: "status-page-sync",
      status: "pending",
      target: "cmp-webhooks",
      traceId: "trc_status_page_worker",
      type: "platform.alert.status_page.requested"
    });
    const calls: Array<{ target: string; body: Record<string, unknown> }> = [];
    const result = await executeStatusPageSyncOutboxWorker({
      outbox,
      publisher: {
        async publish(request) {
          calls.push({ body: request.body, target: request.target });
          return {
            externalId: "provider-alert-001",
            externalIdempotencyKey: request.externalIdempotencyKey,
            ok: true,
            providerStatusCode: 202,
            publishedAt: "2026-07-01T10:01:00.000Z"
          };
        }
      },
      repository
    });

    assert.equal(result.status, "published");
    assert.equal(result.publishResult.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].target, "cmp-webhooks");
    assert.equal(calls[0].body.componentId, "cmp-webhooks");
    assert.equal(repository.findPlatformOutboxRow("platform-outbox:alert:status-page-worker-001")?.status, "published");
  });
});
