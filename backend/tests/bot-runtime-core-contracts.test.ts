import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { BotRuntimeService } from "../apps/api-gateway/src/automation/bot-runtime.service.ts";
import { runBotRuntimeRetryOnce } from "../apps/api-gateway/src/automation/bot-runtime-retry.worker.ts";
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

function triggerRepository() {
  const state = createEmptyAutomationState();
  for (const scenario of [
    { id: "bot-contains", priority: 1, triggerRules: [{ id: "contains", matchMode: "contains" as const, phrases: ["оплата"], priority: 0, type: "phrase" as const }] },
    { id: "bot-exact", priority: 3, triggerRules: [{ id: "exact", matchMode: "exact" as const, phrases: ["где оплата"], priority: 0, type: "phrase" as const }] },
    { id: "bot-tokens", priority: 2, triggerRules: [{ id: "tokens", matchMode: "tokens" as const, phrases: ["статус заказа"], priority: 0, type: "phrase" as const }] }
  ]) {
    const nodes = [{ id: "start", type: "message", title: scenario.id }];
    state.botScenarios.push({ activeVersionId: `${scenario.id}-v1`, channels: ["SDK"], flowEdges: [], flowNodes: nodes, id: scenario.id, name: scenario.id, priority: scenario.priority, schemaVersion: "bot-flow/v1", status: "published", tenantId: "tenant-1", triggerRules: scenario.triggerRules });
    state.botScenarioVersions.push({ createdAt: "2026-07-12T10:00:00.000Z", flowEdges: [], flowNodes: nodes, scenarioId: scenario.id, status: "published", tenantId: "tenant-1", versionId: `${scenario.id}-v1` });
  }
  return AutomationRepository.inMemory(state);
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

  it("claims and executes a due retry through the runtime worker", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "hook", type: "webhook", config: { url: "https://retry.example.test" } }], [{ from: "start", to: "hook" }]);
    const failed = await new BotRuntimeService(repo, {
      fetch: async () => new Response("temporary", { status: 503 }),
      maxAttempts: 3,
      now: () => new Date("2026-07-11T11:00:00.000Z"),
      webhookAllowlist: ["retry.example.test"]
    }).handleInboundEvent(event("evt-worker-retry"));
    assert.equal(failed.instance.status, "retry_scheduled");

    const runtime = new BotRuntimeService(repo, {
      fetch: async () => new Response("ok", { status: 200 }),
      maxAttempts: 3,
      now: () => new Date("2026-07-11T11:00:02.000Z"),
      webhookAllowlist: ["retry.example.test"]
    });
    const result = await runBotRuntimeRetryOnce({
      automationRepository: repo,
      now: "2026-07-11T11:00:02.000Z",
      runtime
    });

    assert.deepEqual(result, { claimed: 1, deadLettered: 0, failed: 0, retried: 1, scanned: 1, skipped: 0 });
    assert.notEqual((await repo.findBotRuntimeInstanceAsync("tenant-1", "conv-1"))?.status, "retry_scheduled");
    assert.equal(repo.readState().botRuntimeSteps.length, 2);
  });

  it("creates a durable handoff summary and terminal runtime status", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "operator", type: "handoff", title: "Priority" }], [{ from: "start", to: "operator" }]);
    const result = await new BotRuntimeService(repo).handleInboundEvent(event("evt-handoff", { context: { orderId: "A-42" } }));
    assert.equal(result.instance.status, "handoff");
    assert.equal(result.step.handoffSummary?.queue, "Priority");
    assert.equal(result.step.sideEffects[0]?.kind, "bot_handoff");
  });

  it("delivers a grounded AI reply through the normal outbound queue without exposing prompt content", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "answer", type: "ai_reply", config: { instructions: "Use approved knowledge." } }], [{ from: "start", to: "answer" }]);
    const state = repo.readState();
    state.botScenarios[0]!.sourceBindings = [{ sourceId: "source-1" }];
    const runtime = new BotRuntimeService(AutomationRepository.inMemory(state), {
      aiResponder: { respond: async (input) => {
        assert.equal(input.tenantId, "tenant-1");
        assert.deepEqual(input.sourceBindings, [{ sourceId: "source-1" }]);
        return { citations: [{ sourceId: "source-1", title: "FAQ", version: 1 }], model: "test-model", text: "Grounded answer" };
      } }
    });
    const result = await runtime.handleInboundEvent(event("evt-ai", { text: "What are your hours?" }));
    assert.equal(result.step.outcome, "ai_reply_queued");
    assert.equal((result.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text, "Grounded answer");
    assert.deepEqual((result.step.sideEffects[0] as { descriptor: { payload: { citations: Array<{ sourceId: string }> } } }).descriptor.payload.citations, [{ sourceId: "source-1", title: "FAQ", version: 1 }]);
    assert.equal(JSON.stringify(result.instance.context).includes("What are your hours?"), false);
  });

  it("hands off when the model emits the [[HANDOFF]] marker and never shows the marker to the client", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "answer", type: "ai_reply", config: { handoffQueue: "Support" } }], [{ from: "start", to: "answer" }]);
    // Сырой текст модели: кастомный aiResponder без собственного парсинга —
    // рантайм обязан сам вырезать маркер и перевести диалог в handoff.
    const runtime = new BotRuntimeService(repo, {
      aiResponder: { respond: async () => ({ citations: [], model: "test-model", text: "Передаю диалог оператору — он продолжит с этого места. [[HANDOFF]]" }) }
    });
    const result = await runtime.handleInboundEvent(event("evt-ai-marker", { text: "Хочу оформить возврат денег" }));
    assert.equal(result.instance.status, "handoff");
    assert.equal(result.step.outcome, "ai_handoff_requested");
    assert.equal(result.step.handoffSummary?.reason, "ai_requested_handoff");
    assert.equal(result.step.handoffSummary?.queue, "Support");
    const clientText = (result.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text;
    assert.equal(clientText, "Передаю диалог оператору — он продолжит с этого места.");
    assert.equal(clientText.toLowerCase().includes("handoff"), false);
    assert.equal(result.step.sideEffects[1]?.kind, "bot_handoff");
  });

  it("closes the runtime and schedules a conversation_close effect when the model emits [[RESOLVED]]", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "answer", type: "ai_reply", config: {} }], [{ from: "start", to: "answer" }]);
    const runtime = new BotRuntimeService(repo, {
      aiResponder: { respond: async () => ({ citations: [], model: "test-model", text: "Рад был помочь! Хорошего дня. [[RESOLVED]]" }) }
    });
    const result = await runtime.handleInboundEvent(event("evt-ai-resolved", { text: "Спасибо, всё получилось!" }));
    assert.equal(result.instance.status, "completed");
    assert.equal(result.step.outcome, "ai_resolved");
    const clientText = (result.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text;
    assert.equal(clientText, "Рад был помочь! Хорошего дня.");
    assert.equal(clientText.toLowerCase().includes("resolved"), false);
    const closeEffect = result.step.sideEffects[1] as { descriptor: { summary: Record<string, string> }; kind: string };
    assert.equal(closeEffect?.kind, "conversation_close");
    assert.equal(closeEffect?.descriptor.summary.reason, "ai_resolved");
    assert.equal(closeEffect?.descriptor.summary.resolutionOutcome, "resolved");
    // Повторное сообщение клиента в закрытый рантайм отбивается — новое
    // обращение пойдёт через форк повторного обращения с новым id.
    await assert.rejects(() => runtime.handleInboundEvent(event("evt-after-close", { text: "ещё вопрос" })), /bot_runtime_conversation_inactive/);
  });

  it("prefers handoff over close when the model emits both markers", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "answer", type: "ai_reply", config: {} }], [{ from: "start", to: "answer" }]);
    const runtime = new BotRuntimeService(repo, {
      aiResponder: { respond: async () => ({ citations: [], model: "test-model", text: "Спасибо! [[RESOLVED]] [[HANDOFF]]" }) }
    });
    const result = await runtime.handleInboundEvent(event("evt-ai-both", { text: "Спасибо, но есть ещё вопрос" }));
    assert.equal(result.instance.status, "handoff");
    assert.equal(result.step.outcome, "ai_handoff_requested");
    assert.equal(result.step.sideEffects.some((effect) => effect.kind === "conversation_close"), false);
  });

  it("substitutes the acknowledgement text when the model reply is the marker alone", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "answer", type: "ai_reply", config: { handoffAcknowledgement: "Соединяю с оператором." } }], [{ from: "start", to: "answer" }]);
    const runtime = new BotRuntimeService(repo, {
      aiResponder: { respond: async () => ({ citations: [], handoffRequested: true, model: "test-model", text: "" }) }
    });
    const result = await runtime.handleInboundEvent(event("evt-ai-marker-only", { text: "Позовите человека пожалуйста" }));
    assert.equal(result.instance.status, "handoff");
    assert.equal((result.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text, "Соединяю с оператором.");
  });

  it("safely hands off when AI is unavailable instead of retrying or inventing an answer", async () => {
    const repo = repository([{ id: "start", type: "condition" }, { id: "answer", type: "ai_reply", config: { handoffQueue: "Support" } }], [{ from: "start", to: "answer" }]);
    const runtime = new BotRuntimeService(repo, { aiResponder: { respond: async () => { throw new Error("bot_ai_connection_not_ready"); } } });
    const result = await runtime.handleInboundEvent(event("evt-ai-unavailable", { text: "Need help" }));
    assert.equal(result.instance.status, "handoff");
    assert.equal(result.step.outcome, "ai_handoff_requested");
    assert.equal((result.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text.includes("специалисту"), true);
    assert.equal(result.step.sideEffects[1]?.kind, "bot_handoff");
  });

  it("does not start disabled or archived scenarios", async () => {
    const repo = repository([{ id: "start", type: "message" }], []);
    const state = repo.readState();
    state.botScenarios[0]!.enabled = false;
    const disabled = AutomationRepository.inMemory(state);
    await assert.rejects(() => new BotRuntimeService(disabled).handleInboundEvent(event("evt-disabled")), /bot_runtime_published_scenario_not_found/);
  });

  it("recovers always_except from the wizard trigger node when triggerRules were emptied", async () => {
    const repo = repository([{ id: "start", type: "message", title: "Всегда, кроме" }, { id: "reply", type: "message", title: "Ответ" }], [{ from: "start", to: "reply" }]);
    const state = repo.readState();
    state.botScenarios[0]!.channels = ["SDK", "Telegram"];
    state.botScenarios[0]!.triggerRules = [];
    state.botScenarioVersions[0]!.triggerRules = [];
    const runtime = new BotRuntimeService(AutomationRepository.inMemory(state));
    const result = await runtime.handleInboundEvent({
      channel: "Telegram",
      conversationId: "recover-1",
      eventId: "recover-1",
      payload: { text: "любой вопрос" },
      tenantId: "tenant-1",
      traceId: "recover-1"
    });
    assert.equal(result.instance.scenarioId, "bot-1");
  });

  it("selects a published scenario from configured phrases and never falls back to the first scenario", async () => {
    const runtime = new BotRuntimeService(triggerRepository());
    const exact = await runtime.handleInboundEvent({ channel: "SDK", conversationId: "phrase-1", eventId: "phrase-1", payload: { text: "ГДЕ   ОПЛАТА" }, tenantId: "tenant-1", traceId: "phrase-1" });
    const tokens = await runtime.handleInboundEvent({ channel: "SDK", conversationId: "phrase-2", eventId: "phrase-2", payload: { text: "Подскажите статус нового заказа" }, tenantId: "tenant-1", traceId: "phrase-2" });

    assert.equal(exact.instance.scenarioId, "bot-exact");
    assert.equal(tokens.instance.scenarioId, "bot-tokens");
    await assert.rejects(() => runtime.handleInboundEvent({ channel: "SDK", conversationId: "phrase-3", eventId: "phrase-3", payload: { text: "совсем другой вопрос" }, tenantId: "tenant-1", traceId: "phrase-3" }), /bot_runtime_published_scenario_not_found/);
    await assert.rejects(() => runtime.handleInboundEvent({ channel: "SDK", conversationId: "foreign", eventId: "foreign", payload: { text: "где оплата" }, tenantId: "tenant-2", traceId: "foreign" }), /bot_runtime_published_scenario_not_found/);
    await assert.rejects(() => runtime.handleInboundEvent({ channel: "Email", conversationId: "wrong-channel", eventId: "wrong-channel", payload: { text: "где оплата" }, tenantId: "tenant-1", traceId: "wrong-channel" }), /bot_runtime_published_scenario_not_found/);
  });

  it("selects the same deterministic rule across every configured channel", async () => {
    const initial = triggerRepository().readState();
    initial.botScenarios.forEach((scenario) => { scenario.channels = ["SDK", "Telegram"]; });
    const result = await new BotRuntimeService(AutomationRepository.inMemory(initial)).handleInboundEvent({ channel: "Telegram", conversationId: "telegram", eventId: "telegram", payload: { text: "ГДЕ ОПЛАТА" }, tenantId: "tenant-1", traceId: "telegram" });
    assert.equal(result.instance.scenarioId, "bot-exact");
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
