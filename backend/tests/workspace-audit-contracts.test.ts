import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorkspaceAuditService } from "../apps/api-gateway/src/audit/workspace-audit.service.ts";
import type { ConversationLifecycleEvent } from "../apps/api-gateway/src/conversation/conversation.repository.ts";

const TENANT_ID = "tenant-audit";

function lifecycleEvent(overrides: Partial<ConversationLifecycleEvent> = {}): ConversationLifecycleEvent {
  return {
    actorId: "usr-1",
    actorName: "Operator One",
    actorType: "operator",
    conversationId: "conv-1",
    data: {},
    eventType: "status.changed",
    id: `lifecycle-${Math.random().toString(36).slice(2)}`,
    ingestedAt: new Date().toISOString(),
    occurredAt: new Date().toISOString(),
    reason: null,
    schemaVersion: "conversation-lifecycle/v1",
    source: "dialog-service",
    sourceEventId: "rt-1",
    tenantId: TENANT_ID,
    traceId: "trace-1",
    ...overrides
  };
}

describe("workspace audit contracts", () => {
  it("requires tenant context", async () => {
    const service = new WorkspaceAuditService({
      conversationRepository: { listLifecycleEvents: async () => [] },
      integrationRepository: { listChannelConnectionAuditEvents: () => [] }
    });
    const response = await service.fetchWorkspaceAuditEvents({}, {});
    assert.equal(response.status, "invalid");
    assert.equal(response.error?.code, "tenant_context_required");
  });

  it("merges dialog and channel events with severity mapping and tenant scoping", async () => {
    const now = Date.now();
    const service = new WorkspaceAuditService({
      conversationRepository: {
        listLifecycleEvents: async () => [
          lifecycleEvent({ id: "lc-status", occurredAt: new Date(now - 3_000).toISOString() }),
          lifecycleEvent({
            actorId: "1210145661",
            actorName: null,
            actorType: "client",
            data: { score: 1 },
            eventType: "quality.assessment.set",
            id: "lc-rating",
            occurredAt: new Date(now - 1_000).toISOString(),
            source: "quality.rating"
          }),
          lifecycleEvent({
            actorId: null,
            actorName: "Bot runtime",
            actorType: "worker",
            eventType: "message.sent",
            id: "lc-bot",
            occurredAt: new Date(now - 2_000).toISOString()
          })
        ]
      },
      integrationRepository: {
        listChannelConnectionAuditEvents: () => [
          { action: "connection.check", at: new Date(now - 500).toISOString(), connectionId: "conn-1", id: "ch-ok", immutable: true, reason: "", result: "applied", tenantId: TENANT_ID, type: "telegram" },
          { action: "connection.check", at: new Date(now - 400).toISOString(), connectionId: "conn-2", id: "ch-failed", immutable: true, reason: "token revoked", result: "failed", tenantId: TENANT_ID, type: "telegram" },
          { action: "connection.check", at: new Date(now - 300).toISOString(), connectionId: "conn-3", id: "ch-foreign", immutable: true, reason: "", result: "applied", tenantId: "tenant-other", type: "telegram" }
        ]
      }
    });

    const response = await service.fetchWorkspaceAuditEvents({ period: "24h" }, { tenantId: TENANT_ID });
    assert.equal(response.status, "ok");
    const items = response.data.items as Array<Record<string, unknown>>;
    assert.deepEqual(items.map((item) => item.id), ["ch-failed", "ch-ok", "lc-rating", "lc-bot", "lc-status"]);
    assert.equal(items.find((item) => item.id === "lc-rating")?.severity, "warning");
    assert.equal(items.find((item) => item.id === "lc-rating")?.source, "Качество");
    assert.equal(items.find((item) => item.id === "lc-bot")?.source, "Боты");
    assert.equal(items.find((item) => item.id === "lc-status")?.severity, "info");
    assert.equal(items.find((item) => item.id === "lc-status")?.userId, "usr-1");
    assert.equal(items.find((item) => item.id === "ch-failed")?.severity, "critical");
    assert.equal(items.find((item) => item.id === "ch-ok")?.source, "Каналы");
    assert.equal(items.some((item) => item.id === "ch-foreign"), false, "foreign tenant channel events must be excluded");
  });

  it("applies the period cutoff", async () => {
    const now = Date.now();
    const service = new WorkspaceAuditService({
      conversationRepository: {
        listLifecycleEvents: async () => [
          lifecycleEvent({ id: "lc-fresh", occurredAt: new Date(now - 60 * 60 * 1000).toISOString() }),
          lifecycleEvent({ id: "lc-stale", occurredAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString() })
        ]
      },
      integrationRepository: { listChannelConnectionAuditEvents: () => [] }
    });

    const response = await service.fetchWorkspaceAuditEvents({ period: "24h" }, { tenantId: TENANT_ID });
    const items = response.data.items as Array<Record<string, unknown>>;
    assert.deepEqual(items.map((item) => item.id), ["lc-fresh"]);
    assert.equal((response.data.page as Record<string, unknown>).totalRows, 1);
  });
});
