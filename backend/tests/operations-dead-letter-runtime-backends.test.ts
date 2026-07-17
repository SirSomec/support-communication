import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createOperationsDeadLetterBackendRegistry } from "../apps/api-gateway/src/operations/bootstrap.ts";
import {
  createReportExportDeadLetterReplayBackendStore,
  createWebhookDeliveryDeadLetterReplayBackendStore
} from "../apps/api-gateway/src/operations/operations-dead-letter-runtime.backends.ts";

describe("operations dead-letter runtime backends", () => {
  it("registers real replay backends outside local runtime", () => {
    const registry = createOperationsDeadLetterBackendRegistry({ NODE_ENV: "staging" });

    assert.ok(registry.resolveForQueueName("report-export"));
    assert.ok(registry.resolveForQueueName("webhook-delivery"));
    assert.equal(registry.resolveForQueueName("realtime-fanout"), undefined);
  });

  it("requeues a failed report export through its owning service", async () => {
    const calls: Array<Record<string, string>> = [];
    const store = createReportExportDeadLetterReplayBackendStore({
      findExportJob: async () => ({ id: "export-failed", statusKey: "error", tenantId: "tenant-volga" }),
      retryExport: async (id, tenantId, reason) => {
        calls.push({ id, reason, tenantId });
        return { data: { job: { id, statusKey: "queued" } }, status: "ok" };
      }
    });

    const replayed = await store.replayDeadLettered("export-failed", "report-export", "Retry after storage recovery");

    assert.deepEqual(calls, [{ id: "export-failed", reason: "Retry after storage recovery", tenantId: "tenant-volga" }]);
    assert.equal(replayed.status, "queued");
    assert.equal(replayed.deadLetteredAt, null);
  });

  it("queues a dead-lettered webhook replay with the operations audit id", async () => {
    const calls: Array<Record<string, string>> = [];
    const store = createWebhookDeliveryDeadLetterReplayBackendStore({
      findDelivery: async () => ({ attempts: 3, deliveryId: "delivery-failed", status: "dead_lettered" }),
      replayDelivery: async (id, idempotencyKey) => {
        calls.push({ id, idempotencyKey });
        return { data: { status: "replay_queued" }, status: "ok" };
      }
    });

    const replayed = await store.replayDeadLettered("delivery-failed", "webhook-delivery", "Retry", new Date(), {
      action: "worker.dead_letter.replay",
      at: "2026-07-17T12:00:00.000Z",
      id: "audit-replay-1",
      immutable: true,
      queue: "webhook-delivery",
      reason: "Retry",
      result: "requeued",
      target: "delivery-failed"
    });

    assert.deepEqual(calls, [{ id: "delivery-failed", idempotencyKey: "audit-replay-1" }]);
    assert.equal(replayed.status, "replay_queued");
    assert.equal(replayed.attempts, 3);
  });
});
