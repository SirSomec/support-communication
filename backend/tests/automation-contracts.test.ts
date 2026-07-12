import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";

describe("automation bot scenario contracts", () => {
  beforeEach(() => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
  });

  afterEach(() => {
    AutomationRepository.clearDefault();
  });

  it("creates and updates bot scenario drafts", async () => {
    const automation = new AutomationService();

    const created = await automation.createBotScenario({
      id: "bot-draft-1",
      name: "Draft bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message", title: "Start" }],
      flowEdges: []
    }, { tenantId: "tenant-volga" });

    assert.equal(created.status, "ok");
    assert.equal(created.data.scenario.id, "bot-draft-1");
    assert.equal(created.data.scenario.status, "draft");

    const updated = await automation.updateBotScenario("bot-draft-1", {
      name: "Draft bot updated"
    }, { tenantId: "tenant-volga" });

    assert.equal(updated.status, "ok");
    assert.equal(updated.data.scenario.name, "Draft bot updated");
  });

  it("normalizes legacy localized draft statuses before persistence", async () => {
    const automation = new AutomationService();

    const created = await automation.createBotScenario({
      id: "bot-localized-draft",
      name: "Localized draft",
      status: "\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message", title: "Start" }],
      flowEdges: []
    }, { tenantId: "tenant-volga" });

    assert.equal(created.status, "ok");
    assert.equal(created.data.scenario.status, "draft");
  });

  it("scopes bot scenario workspace and draft updates to the tenant context", async () => {
    const automation = new AutomationService();

    await automation.createBotScenario({
      id: "bot-volga-only",
      name: "Volga bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message", title: "Start" }],
      flowEdges: []
    }, { tenantId: "tenant-volga" });

    const volga = await automation.fetchAutomationWorkspace({ tenantId: "tenant-volga" });
    const ladoga = await automation.fetchAutomationWorkspace({ tenantId: "tenant-ladoga" });
    const crossTenantUpdate = await automation.updateBotScenario("bot-volga-only", {
      name: "Ladoga overwrite"
    }, { tenantId: "tenant-ladoga" });

    assert.ok(volga.data.botScenarios.some((scenario) => scenario.id === "bot-volga-only"));
    assert.equal(ladoga.data.botScenarios.some((scenario) => scenario.id === "bot-volga-only"), false);
    assert.equal(crossTenantUpdate.status, "invalid");
    assert.equal(crossTenantUpdate.error?.code, "bot_scenario_not_found");
  });

  it("lists scenario details only in their tenant", async () => {
    const automation = new AutomationService();
    await automation.createBotScenario({
      id: "bot-list-only",
      name: "Listed bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message", title: "Start" }],
      flowEdges: []
    }, { tenantId: "tenant-volga" });

    const list = await automation.listBotScenarios({ tenantId: "tenant-volga" });
    const detail = await automation.fetchBotScenario("bot-list-only", { tenantId: "tenant-volga" });
    const foreignDetail = await automation.fetchBotScenario("bot-list-only", { tenantId: "tenant-ladoga" });

    assert.equal(list.status, "ok");
    assert.equal(list.data.scenarios.length, 1);
    assert.equal(detail.data.scenario.name, "Listed bot");
    assert.equal(foreignDetail.error?.code, "bot_scenario_not_found");
  });

  it("archives, restores and protects the scenario lifecycle", async () => {
    const automation = new AutomationService();
    await automation.createBotScenario({
      id: "bot-lifecycle",
      name: "Lifecycle bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message", title: "Start" }],
      flowEdges: []
    }, { tenantId: "tenant-volga" });

    const archived = await automation.archiveBotScenario("bot-lifecycle", { tenantId: "tenant-volga" });
    const blockedEdit = await automation.updateBotScenario("bot-lifecycle", { name: "Must not edit" }, { tenantId: "tenant-volga" });
    const restored = await automation.restoreBotScenario("bot-lifecycle", { tenantId: "tenant-volga" });
    const published = await automation.publishBotScenario({
      id: "bot-lifecycle",
      name: "Lifecycle bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message", title: "Start" }],
      flowEdges: []
    }, { tenantId: "tenant-volga" });
    const disabled = await automation.disableBotScenario("bot-lifecycle", { tenantId: "tenant-volga" });

    assert.equal(archived.data.scenario.status, "archived");
    assert.equal(blockedEdit.error?.code, "bot_scenario_archived");
    assert.equal(restored.data.scenario.status, "disabled");
    assert.equal(published.status, "ok");
    assert.equal(disabled.data.scenario.status, "disabled");
  });

  it("runs a tenant-scoped sandbox preview without dispatching a real conversation", async () => {
    const automation = new AutomationService();
    await automation.createBotScenario({
      id: "bot-sandbox", name: "Sandbox", channels: ["SDK"], sourceBindings: [],
      flowNodes: [{ id: "start", type: "message" }, { id: "answer", type: "ai_reply" }],
      flowEdges: [{ from: "start", to: "answer" }],
      triggerRules: [{ id: "phrase", matchMode: "contains", phrases: ["status"], type: "phrase" }]
    }, { tenantId: "tenant-volga" });
    const result = await automation.testBotScenario({ id: "bot-sandbox", testMessage: "status please" } as never, { tenantId: "tenant-volga" });
    assert.equal(result.status, "ok");
    assert.equal(result.data.preview.outcome, "handoff");
    assert.equal(result.data.preview.trigger.matched, true);
    assert.equal(AutomationRepository.default().readState().botRuntimeSteps.length, 0);
    const noMatch = await automation.testBotScenario({ id: "bot-sandbox", testMessage: "unrelated question" } as never, { tenantId: "tenant-volga" });
    assert.equal(noMatch.data.preview.outcome, "no_match");
    assert.equal(noMatch.data.preview.reason, "phrase_not_matched");
    assert.deepEqual(noMatch.data.preview.steps, []);
  });

  it("blocks AI publication and returns actionable prerequisite violations", async () => {
    const automation = new AutomationService();
    const scenario = { id: "bot-ai-invalid", name: "AI invalid", channels: ["SDK"], flowNodes: [{ id: "start", type: "message" }, { id: "answer", type: "ai_reply" }], flowEdges: [{ from: "start", to: "answer" }] };
    await automation.createBotScenario(scenario, { tenantId: "tenant-volga" });
    const result = await automation.publishBotScenario(scenario, { tenantId: "tenant-volga" });
    assert.equal(result.error?.code, "bot_publish_prerequisites_invalid");
    assert.ok((result.data.violations as string[]).some((item) => item.includes("источник")));
    assert.ok((result.data.violations as string[]).some((item) => item.includes("AI-подключение")));
    assert.ok((result.data.violations as string[]).some((item) => item.includes("оператор")));
  });

  it("fails closed by ignoring pre-tenant local proactive and audit records", () => {
    const state = createEmptyAutomationState();
    state.proactiveRules.push({ channels: ["SDK"], id: "legacy-unsafe", tenantId: "", status: "active" });
    state.workspaceAuditEvents.push({ id: "legacy-audit" });
    const normalized = AutomationRepository.inMemory(state).readState();

    assert.deepEqual(normalized.proactiveRules, []);
    assert.deepEqual(normalized.workspaceAuditEvents, []);
  });

  it("rejects a published keyword phrase conflict at the same priority", async () => {
    const automation = new AutomationService();
    const common = {
      channels: ["SDK"],
      flowEdges: [],
      flowNodes: [{ id: "start", type: "message", title: "Start" }],
      triggerRules: [{ id: "phrase", matchMode: "contains" as const, phrases: ["где оплата"], priority: 0, type: "phrase" as const }]
    };
    await automation.createBotScenario({ ...common, id: "bot-first", name: "First" }, { tenantId: "tenant-volga" });
    const first = await automation.publishBotScenario({ ...common, id: "bot-first", name: "First" }, { tenantId: "tenant-volga" });
    await automation.createBotScenario({ ...common, id: "bot-second", name: "Second" }, { tenantId: "tenant-volga" });
    const second = await automation.publishBotScenario({ ...common, id: "bot-second", name: "Second" }, { tenantId: "tenant-volga" });

    assert.equal(first.status, "ok");
    assert.equal(second.error?.code, "trigger_conflict");
  });

  it("publishes only sources that are ready and approved in the same tenant", async () => {
    const sources = KnowledgeSourceRepository.inMemory({
      sources: [
        sourceFixture("source-ready", "tenant-volga", "ready", "approved"),
        sourceFixture("source-draft", "tenant-volga", "draft", "pending"),
        sourceFixture("source-foreign", "tenant-ladoga", "ready", "approved")
      ]
    });
    const automation = new AutomationService(AutomationRepository.inMemory(), undefined, sources);
    const base = { channels: ["SDK"], flowEdges: [], flowNodes: [{ id: "start", type: "message", title: "Start" }] };
    await automation.createBotScenario({ ...base, id: "bot-ready-source", name: "Ready", sourceBindings: [{ sourceId: "source-ready" }] }, { tenantId: "tenant-volga" });
    await automation.createBotScenario({ ...base, id: "bot-draft-source", name: "Draft", sourceBindings: [{ sourceId: "source-draft" }] }, { tenantId: "tenant-volga" });
    await automation.createBotScenario({ ...base, id: "bot-foreign-source", name: "Foreign", sourceBindings: [{ sourceId: "source-foreign" }] }, { tenantId: "tenant-volga" });

    const ready = await automation.publishBotScenario({ ...base, id: "bot-ready-source", name: "Ready", sourceBindings: [{ sourceId: "source-ready" }] }, { tenantId: "tenant-volga" });
    const draft = await automation.publishBotScenario({ ...base, id: "bot-draft-source", name: "Draft", sourceBindings: [{ sourceId: "source-draft" }] }, { tenantId: "tenant-volga" });
    const foreign = await automation.publishBotScenario({ ...base, id: "bot-foreign-source", name: "Foreign", sourceBindings: [{ sourceId: "source-foreign" }] }, { tenantId: "tenant-volga" });

    assert.equal(ready.status, "ok");
    assert.equal(draft.error?.code, "knowledge_source_not_ready");
    assert.equal(foreign.error?.code, "knowledge_source_not_ready");
  });

  it("audits dangerous scenario actions and makes repeated requests idempotent per tenant", async () => {
    const automation = new AutomationService();
    const context = { actor: "operator-7", reason: "Смена графика", tenantId: "tenant-volga", traceId: "trc-lifecycle-7" };
    await automation.createBotScenario({ id: "bot-audited", name: "Audited", channels: ["SDK"], flowNodes: [{ id: "start", type: "message", title: "Start" }], flowEdges: [] }, context);
    const archived = await automation.archiveBotScenario("bot-audited", { ...context, idempotencyKey: "archive-7" });
    const repeated = await automation.archiveBotScenario("bot-audited", { ...context, idempotencyKey: "archive-7" });
    const reused = await automation.archiveBotScenario("bot-audited", { ...context, idempotencyKey: "archive-7", reason: "Другая причина" });
    const foreign = await automation.restoreBotScenario("bot-audited", { ...context, tenantId: "tenant-ladoga", idempotencyKey: "restore-7" });
    const workspace = await automation.fetchAutomationWorkspace({ tenantId: "tenant-volga" });
    const audit = (workspace.data.auditEvents as Array<Record<string, unknown>>).find((event) => event.action === "bot.archive");

    assert.equal(archived.data.duplicate, false);
    assert.equal(repeated.data.duplicate, true);
    assert.equal(reused.error?.code, "idempotency_key_reused");
    assert.equal(foreign.error?.code, "bot_scenario_not_found");
    assert.equal(audit?.actor, "operator-7");
    assert.equal(audit?.reason, "Смена графика");
    assert.equal(audit?.traceId, "trc-lifecycle-7");
    assert.equal(audit?.tenantId, "tenant-volga");
  });

  it("audits trigger and knowledge-policy changes with tenant-scoped idempotency", async () => {
    const automation = new AutomationService();
    const context = { actor: "operator-8", idempotencyKey: "trigger-policy-8", reason: "Новая тема", tenantId: "tenant-volga", traceId: "trc-trigger-8" };
    await automation.createBotScenario({ channels: ["SDK"], flowEdges: [], flowNodes: [{ id: "start", type: "message" }], id: "bot-trigger-audit", name: "Trigger audit" }, context);
    const first = await automation.updateBotScenario("bot-trigger-audit", { triggerPhrases: ["доставка"], matchMode: "exact" }, context);
    const duplicate = await automation.updateBotScenario("bot-trigger-audit", { triggerPhrases: ["доставка"], matchMode: "exact" }, context);
    const reused = await automation.updateBotScenario("bot-trigger-audit", { triggerPhrases: ["оплата"], matchMode: "exact" }, context);
    const state = AutomationRepository.default().readState();
    const audit = state.scenarioAuditEvents.find((event) => event.scenarioId === "bot-trigger-audit");

    assert.equal(first.data.duplicate, false);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(reused.error?.code, "idempotency_key_reused");
    assert.equal(audit?.action, "bot.trigger_policy.update");
    assert.equal(audit?.actor, "operator-8");
    assert.equal(audit?.traceId, "trc-trigger-8");
  });
});

function sourceFixture(id, tenantId, status, approvalStatus) {
  return { approvalStatus, approvedAt: approvalStatus === "approved" ? "2026-07-12T10:00:00.000Z" : null, approvedBy: approvalStatus === "approved" ? "admin" : null, archivedAt: null, contentChecksum: null, createdAt: "2026-07-12T10:00:00.000Z", disabledAt: null, failedAt: null, failureCode: null, id, kind: "document", lastIndexedAt: null, lastIngestedAt: null, metadata: {}, owner: "admin", readiness: "not_ready", retentionUntil: null, sourceConfig: {}, sourceRef: null, status, tenantId, title: id, updatedAt: "2026-07-12T10:00:00.000Z", version: 1 };
}
