import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { BotFeedbackRepository } from "../apps/api-gateway/src/automation/bot-feedback.repository.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";
import { AiConnectionRepository } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";

describe("automation bot scenario contracts", () => {
  beforeEach(() => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    BotFeedbackRepository.useDefault(BotFeedbackRepository.inMemory());
    AiConnectionRepository.useDefault(AiConnectionRepository.inMemory());
  });

  afterEach(() => {
    AiConnectionRepository.clearDefault();
    BotFeedbackRepository.clearDefault();
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

  it("does not mass-assign server-owned scenario fields from an update payload", async () => {
    const automation = new AutomationService();
    const created = await automation.createBotScenario({
      channels: ["SDK"],
      flowEdges: [],
      flowNodes: [{ id: "start", type: "message" }],
      id: "bot-mass-assignment",
      name: "Protected scenario"
    }, { tenantId: "tenant-volga" });
    const originalCreatedAt = created.data.scenario.createdAt;

    const updated = await automation.updateBotScenario("bot-mass-assignment", {
      activeVersionId: "attacker-version",
      auditHold: true,
      createdAt: "2000-01-01T00:00:00.000Z",
      draft: { name: "Injected draft", updatedAt: "2000-01-01T00:00:00.000Z" },
      enabled: false,
      id: "foreign-id",
      legalHold: true,
      name: "Allowed title",
      retentionUntil: "2099-01-01T00:00:00.000Z",
      status: "draft",
      tenantId: "tenant-ladoga"
    }, { tenantId: "tenant-volga" });
    const scenario = updated.data.scenario;

    assert.equal(updated.status, "ok");
    assert.equal(scenario.id, "bot-mass-assignment");
    assert.equal(scenario.tenantId, "tenant-volga");
    assert.equal(scenario.name, "Allowed title");
    assert.equal(scenario.createdAt, originalCreatedAt);
    assert.equal(scenario.activeVersionId, undefined);
    assert.equal(scenario.auditHold, undefined);
    assert.equal(scenario.draft, undefined);
    assert.equal(scenario.enabled, true);
    assert.equal(scenario.legalHold, undefined);
    assert.equal(scenario.retentionUntil, undefined);
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
    assert.equal(result.data.preview.trace.dryRun, true);
    assert.equal(result.data.preview.trace.isolation, "no_runtime_steps_no_outbound");
    assert.equal(result.data.preview.trace.aiWouldCall, false);
    assert.equal(AutomationRepository.default().readState().botRuntimeSteps.length, 0);
    assert.equal(AutomationRepository.default().readState().botRuntimeInstances.length, 0);
    const noMatch = await automation.testBotScenario({ id: "bot-sandbox", testMessage: "unrelated question" } as never, { tenantId: "tenant-volga" });
    assert.equal(noMatch.data.preview.outcome, "no_match");
    assert.equal(noMatch.data.preview.reason, "phrase_not_matched");
    assert.deepEqual(noMatch.data.preview.steps, []);
  });

  it("validates advanced JSON import with the same trigger and AI policy checks as publish", async () => {
    const automation = new AutomationService();
    const structural = await automation.validateBotFlowImport({
      name: "Import ok",
      flowNodes: [{ id: "start", type: "message" }],
      flowEdges: []
    }, { tenantId: "tenant-volga" });
    assert.equal(structural.status, "ok");
    assert.equal(structural.data.valid, true);
    assert.ok(Array.isArray(structural.data.payload.triggerRules));
    assert.ok(Array.isArray(structural.data.payload.sourceBindings));

    const aiWithoutPolicy = await automation.validateBotFlowImport({
      name: "AI import",
      flowNodes: [{ id: "start", type: "message" }, { id: "answer", type: "ai_reply" }],
      flowEdges: [{ from: "start", to: "answer" }],
      sourceBindings: [],
      triggerRules: [{ id: "phrase", type: "phrase", phrases: ["оплата"], matchMode: "contains" }]
    }, { tenantId: "tenant-volga" });
    assert.equal(aiWithoutPolicy.status, "invalid");
    assert.match(String(aiWithoutPolicy.error?.message ?? ""), /источник|AI|оператору/i);
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

  it("keeps existing trigger rules when a publish body sends an empty triggerRules array", async () => {
    const automation = new AutomationService();
    const triggerRules = [{ id: "always-except-1", matchMode: "contains" as const, phrases: [], priority: 0, type: "always_except" as const }];
    const base = {
      channels: ["Telegram"],
      flowEdges: [],
      flowNodes: [{ id: "start", type: "message", title: "Всегда, кроме" }],
      triggerRules
    };
    await automation.createBotScenario({ ...base, id: "bot-keep-triggers", name: "Keep" }, { tenantId: "tenant-volga" });
    const published = await automation.publishBotScenario({
      ...base,
      id: "bot-keep-triggers",
      name: "Keep",
      triggerRules: []
    }, { tenantId: "tenant-volga" });

    assert.equal(published.status, "ok");
    const detail = await automation.fetchBotScenario("bot-keep-triggers", { tenantId: "tenant-volga" });
    assert.equal(detail.status, "ok");
    assert.deepEqual(detail.data?.scenario?.triggerRules, triggerRules);
  });

  it("publishes scenarios regardless of source readiness — approval gates retired", async () => {
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

    const ready = await automation.publishBotScenario({ ...base, id: "bot-ready-source", name: "Ready", sourceBindings: [{ sourceId: "source-ready" }] }, { tenantId: "tenant-volga" });
    // Черновой (ещё не проиндексированный) источник больше не блокирует публикацию:
    // бот начнёт использовать его сразу после индексации.
    const draft = await automation.publishBotScenario({ ...base, id: "bot-draft-source", name: "Draft", sourceBindings: [{ sourceId: "source-draft" }] }, { tenantId: "tenant-volga" });

    assert.equal(ready.status, "ok");
    assert.equal(draft.status, "ok");
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

  it("exposes role-scoped scenario operational data in the workspace", async () => {
    const repository = AutomationRepository.inMemory(createEmptyAutomationState());
    await repository.saveBotScenario({
      channels: ["SDK"],
      flowEdges: [],
      flowNodes: [{ id: "ai", type: "ai_reply", title: "AI" }],
      id: "bot-ops-workspace",
      name: "Ops workspace",
      schemaVersion: "bot-flow/v1",
      status: "published",
      tenantId: "tenant-volga"
    });
    await repository.saveBotPublishAuditEvent({
      action: "bot.publish",
      actor: "admin-1",
      auditId: "aud-ops-1",
      createdAt: "2026-07-12T10:00:00.000Z",
      idempotencyKey: "ops-1",
      immutable: true,
      runtimeVersion: "v1",
      scenarioId: "bot-ops-workspace",
      tenantId: "tenant-volga",
      versionId: "v1"
    });
    await repository.commitBotRuntimeTransitionAsync({
      instance: {
        attempts: 1,
        context: { lastAiFailure: "bot_ai_quota_exhausted" },
        conversationId: "conv-ops",
        createdAt: "2026-07-12T11:00:00.000Z",
        currentNodeId: "ai",
        id: "rt-ops",
        lastError: null,
        nextAttemptAt: null,
        scenarioId: "bot-ops-workspace",
        status: "handoff",
        tenantId: "tenant-volga",
        updatedAt: "2026-07-12T11:05:00.000Z",
        versionId: "v1"
      },
      step: {
        conversationId: "conv-ops",
        createdAt: "2026-07-12T11:05:00.000Z",
        error: null,
        handoffSummary: { queue: "Л1", reason: "bot_ai_quota_exhausted" },
        id: "step-ops",
        inputEvent: { scenarioId: "bot-ops-workspace" },
        inputEventId: "evt-ops",
        lifecycleEvent: null,
        nodeId: "ai",
        nodeType: "ai_reply",
        outcome: "ai_handoff_requested",
        runtimeId: "rt-ops",
        sideEffects: [{
          descriptor: { payload: { citations: [{ sourceId: "src-1", title: "Оплата", version: 2 }] } },
          kind: "message_delivery"
        }],
        tenantId: "tenant-volga",
        webhookResponse: null
      }
    });

    const automation = new AutomationService(repository);
    const reader = await automation.fetchAutomationWorkspace({
      permissions: ["automation.read"],
      tenantId: "tenant-volga"
    });
    const manager = await automation.fetchAutomationWorkspace({
      permissions: ["settings.manage"],
      tenantId: "tenant-volga"
    });
    const ops = (reader.data.scenarioOperations as Array<Record<string, unknown>>).find((item) => item.scenarioId === "bot-ops-workspace");

    assert.equal(reader.status, "ok");
    assert.equal(ops?.status, "published");
    assert.equal((ops?.recentPublishes as Array<Record<string, unknown>>)[0]?.versionId, "v1");
    assert.equal((ops?.recentHandoffs as Array<Record<string, unknown>>)[0]?.reason, "bot_ai_quota_exhausted");
    assert.equal(ops?.lastFallbackReason, "bot_ai_quota_exhausted");
    assert.equal((ops?.lastCitations as Array<Record<string, unknown>>)[0]?.title, "Оплата");
    assert.equal(reader.data.aiUsage, null);
    assert.equal(typeof (manager.data.aiUsage as { usedTokens?: number })?.usedTokens, "number");
  });
});

function sourceFixture(id, tenantId, status, approvalStatus) {
  return { approvalStatus, approvedAt: approvalStatus === "approved" ? "2026-07-12T10:00:00.000Z" : null, approvedBy: approvalStatus === "approved" ? "admin" : null, archivedAt: null, contentChecksum: null, createdAt: "2026-07-12T10:00:00.000Z", disabledAt: null, failedAt: null, failureCode: null, id, kind: "document", lastIndexedAt: null, lastIngestedAt: null, metadata: {}, owner: "admin", readiness: "not_ready", retentionUntil: null, sourceConfig: {}, sourceRef: null, status, tenantId, title: id, updatedAt: "2026-07-12T10:00:00.000Z", version: 1 };
}
