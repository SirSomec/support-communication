import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { BotRuntimeService } from "../apps/api-gateway/src/automation/bot-runtime.service.ts";
import type { BotScenario } from "../apps/api-gateway/src/automation/automation.types.ts";

function repository(nodes: BotScenario["flowNodes"], edges: BotScenario["flowEdges"]) {
  const state = createEmptyAutomationState();
  state.botScenarios.push({ channels: ["SDK"], flowEdges: edges, flowNodes: nodes, id: "bot-1", name: "Bot", schemaVersion: "bot-flow/v1", status: "published", tenantId: "tenant-1" });
  state.botScenarioVersions.push({ createdAt: "2026-07-11T10:00:00.000Z", flowEdges: edges, flowNodes: nodes, scenarioId: "bot-1", status: "published", tenantId: "tenant-1", versionId: "v1" });
  return AutomationRepository.inMemory(state);
}

function event(eventId = "evt-1", payload: Record<string, unknown> = {}) {
  return { channel: "SDK", conversationId: "conv-1", eventId, payload, scenarioId: "bot-1", tenantId: "tenant-1", traceId: "trace-1" };
}

describe("durable bot runtime core", () => {
  it("pins an immutable version and replays an input event without a second step", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "reply", type: "message", title: "Hello" }], [{ from: "start", to: "reply" }]);
    const runtime = new BotRuntimeService(repo, { now: () => new Date("2026-07-11T11:00:00.000Z") });
    const first = await runtime.handleInboundEvent(event());
    const replay = await runtime.handleInboundEvent(event());
    assert.equal(first.outcome, "committed");
    assert.equal(replay.outcome, "duplicate");
    assert.equal(repo.readState().botRuntimeSteps.length, 1);
    assert.equal(first.instance.versionId, "v1");
    assert.equal(first.step.sideEffects[0]?.kind, "message_delivery");
  });

  it("routes quick replies and preserves collected contact in redacted context", async () => {
    const repo = repository([
      { id: "start", type: "quick_replies", config: { quickReplies: ["yes", "no"] } },
      { id: "contact", type: "contact_request", config: { field: "phone" }, title: "Phone" },
      { id: "fallback", type: "fallback", title: "Retry" }
    ], [{ from: "start", label: "yes", to: "contact" }, { from: "start", label: "default", to: "fallback" }]);
    const result = await new BotRuntimeService(repo).handleInboundEvent(event("evt-contact", { quickReply: "yes", value: "+7 999 123-45-67" }));
    assert.equal(result.step.outcome, "contact_collected");
    assert.equal(JSON.stringify(result.instance.context).includes("123-45-67"), false);
  });

  it("calls only allowlisted HTTPS webhooks and stores a bounded redacted response", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "hook", type: "webhook", config: { url: "https://hooks.example.test/runtime" } }], [{ from: "start", to: "hook" }]);
    const runtime = new BotRuntimeService(repo, { fetch: async () => new Response("email user@example.test", { status: 200 }), webhookAllowlist: ["hooks.example.test"] });
    const result = await runtime.handleInboundEvent(event("evt-hook"));
    assert.equal(result.step.outcome, "webhook_succeeded");
    assert.equal(JSON.stringify(result.step.webhookResponse).includes("user@example.test"), false);
  });

  it("rolls back the node on failure and enters retry then dead-letter state", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "hook", type: "webhook", config: { url: "http://unsafe.test" } }], [{ from: "start", to: "hook" }]);
    const runtime = new BotRuntimeService(repo, { maxAttempts: 1, now: () => new Date("2026-07-11T11:00:00.000Z") });
    const result = await runtime.handleInboundEvent(event("evt-fail"));
    assert.equal(result.instance.status, "dead_lettered");
    assert.equal(result.instance.currentNodeId, "start");
    assert.equal(result.step.error?.includes("http://unsafe.test"), false);
  });

  it("retries a due failed event with a distinct idempotency key and dead-letters at the limit", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "hook", type: "webhook", config: { url: "https://fail.example.test" } }], [{ from: "start", to: "hook" }]);
    let now = new Date("2026-07-11T11:00:00.000Z");
    const runtime = new BotRuntimeService(repo, { fetch: async () => new Response("failed", { status: 503 }), maxAttempts: 2, now: () => now, webhookAllowlist: ["fail.example.test"] });
    const first = await runtime.handleInboundEvent(event("evt-retry"));
    assert.equal(first.instance.status, "retry_scheduled");
    now = new Date("2026-07-11T11:00:02.000Z");
    const second = await runtime.retryInboundEvent(event("evt-retry"));
    assert.equal(second.instance.status, "dead_lettered");
    assert.equal(repo.readState().botRuntimeSteps.length, 2);
  });

  it("creates a durable handoff summary and terminal runtime status", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "operator", type: "handoff", title: "Priority" }], [{ from: "start", to: "operator" }]);
    const result = await new BotRuntimeService(repo).handleInboundEvent(event("evt-handoff", { context: { orderId: "A-42" } }));
    assert.equal(result.instance.status, "handoff");
    assert.equal(result.step.handoffSummary?.queue, "Priority");
    assert.equal(result.step.sideEffects[0]?.kind, "bot_handoff");
  });

  it("rolls new conversations back to a prior published version without moving pinned conversations", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "v1", type: "message" }], [{ from: "start", to: "v1" }]);
    const state = repo.readState();
    state.botScenarioVersions.push({ createdAt: "2026-07-11T12:00:00.000Z", flowEdges: [{ from: "start", to: "v2" }], flowNodes: [{ id: "start", type: "condition" }, { id: "v2", type: "message" }], scenarioId: "bot-1", status: "published", tenantId: "tenant-1", versionId: "v2" });
    state.botScenarios[0]!.activeVersionId = "v2";
    const seeded = AutomationRepository.inMemory(state);
    const runtime = new BotRuntimeService(seeded);
    const pinned = await runtime.handleInboundEvent(event("evt-before"));
    await runtime.rollbackToPublishedVersion("tenant-1", "bot-1", "v1");
    const next = await runtime.handleInboundEvent({ ...event("evt-after"), conversationId: "conv-2" });
    assert.equal(pinned.instance.versionId, "v2");
    assert.equal(next.instance.versionId, "v1");
    assert.equal((await seeded.findBotRuntimeInstanceAsync("tenant-1", "conv-1"))?.versionId, "v2");
  });
});
