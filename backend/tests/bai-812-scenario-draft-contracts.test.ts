import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { BotRuntimeService } from "../apps/api-gateway/src/automation/bot-runtime.service.ts";
import { BotSandboxService } from "../apps/api-gateway/src/automation/bot-sandbox.service.ts";
import { BotSandboxSessionRepository } from "../apps/api-gateway/src/automation/bot-sandbox-session.repository.ts";
import { AiConnectionRepository } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";

const TENANT = "tenant-volga";
const CONTEXT = { actor: "admin-1", tenantId: TENANT };

const scenarioPayload = (title: string) => ({
  channels: ["SDK"],
  flowEdges: [{ from: "start", to: "reply" }],
  flowNodes: [
    { id: "start", type: "condition" },
    { id: "reply", title, type: "message" }
  ],
  id: "bot-draft",
  name: "Сценарий с черновиком",
  triggerRules: [{ id: "rule-1", matchMode: "contains" as const, phrases: ["заказ"], priority: 1, type: "phrase" as const }]
});

describe("BAI-812 draft-over-published scenario", () => {
  beforeEach(() => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    AiConnectionRepository.useDefault(AiConnectionRepository.inMemory());
  });
  afterEach(() => {
    AiConnectionRepository.clearDefault();
    AutomationRepository.clearDefault();
  });

  async function publishBaseline(automation: AutomationService, title = "Ответ v1") {
    await automation.createBotScenario(scenarioPayload(title), CONTEXT);
    const published = await automation.publishBotScenario({ ...scenarioPayload(title), idempotencyKey: `pub-${title}` }, CONTEXT);
    assert.equal(published.status, "ok");
    return published;
  }

  it("stores published-scenario edits as a draft overlay without touching the runtime", async () => {
    const automation = new AutomationService();
    await publishBaseline(automation);

    const update = await automation.updateBotScenario("bot-draft", {
      basePrompt: "Новый промпт из черновика",
      flowNodes: [
        { id: "start", type: "condition" },
        { id: "reply", title: "Ответ v2 (черновик)", type: "message" }
      ],
      flowEdges: [{ from: "start", to: "reply" }]
    }, CONTEXT);
    assert.equal(update.status, "ok");
    assert.equal(update.data.draftPending, true);

    const detail = await automation.fetchBotScenario("bot-draft", CONTEXT);
    const scenario = detail.data.scenario as { basePrompt?: string; draft?: { basePrompt?: string }; flowNodes: Array<{ title?: string }> };
    assert.equal(scenario.draft?.basePrompt, "Новый промпт из черновика");
    assert.equal(scenario.basePrompt, undefined);
    assert.equal(scenario.flowNodes[1]?.title, "Ответ v1");

    const runtime = new BotRuntimeService(AutomationRepository.default());
    const run = await runtime.handleInboundEvent({ channel: "SDK", conversationId: "conv-1", eventId: "evt-1", payload: { text: "где заказ" }, tenantId: TENANT, traceId: "trace-1" });
    assert.equal((run.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text, "Ответ v1");
  });

  it("lets the sandbox draft mode execute the overlay while clients keep the published version", async () => {
    const automation = new AutomationService();
    await publishBaseline(automation);
    await automation.updateBotScenario("bot-draft", {
      flowNodes: [{ id: "start", type: "condition" }, { id: "reply", title: "Ответ из черновика", type: "message" }],
      flowEdges: [{ from: "start", to: "reply" }]
    }, CONTEXT);

    const sandbox = new BotSandboxService(AutomationRepository.default(), {
      connections: AiConnectionRepository.inMemory(),
      sessions: BotSandboxSessionRepository.inMemory()
    });
    const draftSession = await sandbox.createSession({ actor: "admin-1", mode: "draft", scenarioId: "bot-draft", tenantId: TENANT });
    const draftTurn = await sandbox.postMessage({ messageId: "m1", scenarioId: "bot-draft", sessionId: draftSession.id, tenantId: TENANT, text: "где заказ" });
    assert.equal(draftTurn.turn.messages[0]?.text, "Ответ из черновика");

    const publishedSession = await sandbox.createSession({ actor: "admin-1", mode: "published", scenarioId: "bot-draft", tenantId: TENANT });
    const publishedTurn = await sandbox.postMessage({ messageId: "m2", scenarioId: "bot-draft", sessionId: publishedSession.id, tenantId: TENANT, text: "где заказ" });
    assert.equal(publishedTurn.turn.messages[0]?.text, "Ответ v1");
  });

  it("materializes the draft on publish and clears it", async () => {
    const automation = new AutomationService();
    await publishBaseline(automation);
    await automation.updateBotScenario("bot-draft", {
      basePrompt: "Промпт из черновика",
      flowNodes: [{ id: "start", type: "condition" }, { id: "reply", title: "Ответ v2", type: "message" }],
      flowEdges: [{ from: "start", to: "reply" }]
    }, CONTEXT);

    const republished = await automation.publishBotScenario({
      ...scenarioPayload("Ответ v2"),
      basePrompt: undefined,
      idempotencyKey: "pub-v2"
    }, CONTEXT);
    assert.equal(republished.status, "ok");

    const detail = await automation.fetchBotScenario("bot-draft", CONTEXT);
    const scenario = detail.data.scenario as { basePrompt?: string; draft?: unknown; flowNodes: Array<{ title?: string }> };
    assert.equal(scenario.draft, undefined);
    assert.equal(scenario.basePrompt, "Промпт из черновика");
    assert.equal(scenario.flowNodes[1]?.title, "Ответ v2");

    const runtime = new BotRuntimeService(AutomationRepository.default());
    const run = await runtime.handleInboundEvent({ channel: "SDK", conversationId: "conv-2", eventId: "evt-2", payload: { text: "где заказ" }, tenantId: TENANT, traceId: "trace-2" });
    assert.equal((run.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text, "Ответ v2");
  });

  it("discards the draft without touching published fields", async () => {
    const automation = new AutomationService();
    await publishBaseline(automation);
    await automation.updateBotScenario("bot-draft", { basePrompt: "Черновик" }, CONTEXT);

    const discard = await automation.discardBotScenarioDraft("bot-draft", CONTEXT);
    assert.equal(discard.status, "ok");
    assert.equal(discard.data.discarded, true);

    const detail = await automation.fetchBotScenario("bot-draft", CONTEXT);
    const scenario = detail.data.scenario as { draft?: unknown; name: string; status: string };
    assert.equal(scenario.draft, undefined);
    assert.equal(scenario.status, "published");

    const foreign = await automation.discardBotScenarioDraft("bot-draft", { actor: "x", tenantId: "tenant-ladoga" });
    assert.equal(foreign.status, "invalid");
    assert.equal(foreign.error?.code, "bot_scenario_not_found");
  });
});

describe("BAI-813 scenario version rollback", () => {
  beforeEach(() => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    AiConnectionRepository.useDefault(AiConnectionRepository.inMemory());
  });
  afterEach(() => {
    AiConnectionRepository.clearDefault();
    AutomationRepository.clearDefault();
  });

  it("rolls a published scenario back to an earlier published version", async () => {
    const automation = new AutomationService();
    await automation.createBotScenario(scenarioPayload("Ответ v1"), CONTEXT);
    const first = await automation.publishBotScenario({ ...scenarioPayload("Ответ v1"), idempotencyKey: "pub-1" }, CONTEXT);
    const firstVersion = String((first.data as { runtimeVersion?: string }).runtimeVersion);
    const second = await automation.publishBotScenario({ ...scenarioPayload("Ответ v2"), idempotencyKey: "pub-2" }, CONTEXT);
    assert.equal(second.status, "ok");

    const rollback = await automation.rollbackBotScenarioToVersion("bot-draft", firstVersion, CONTEXT);
    assert.equal(rollback.status, "ok");
    const scenario = rollback.data.scenario as { activeVersionId?: string; flowNodes: Array<{ title?: string }> };
    assert.equal(scenario.activeVersionId, firstVersion);
    assert.equal(scenario.flowNodes[1]?.title, "Ответ v1");

    const runtime = new BotRuntimeService(AutomationRepository.default());
    const run = await runtime.handleInboundEvent({ channel: "SDK", conversationId: "conv-3", eventId: "evt-3", payload: { text: "где заказ" }, tenantId: TENANT, traceId: "trace-3" });
    assert.equal((run.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text, "Ответ v1");
  });

  it("rejects unknown versions and cross-tenant rollback", async () => {
    const automation = new AutomationService();
    await automation.createBotScenario(scenarioPayload("Ответ v1"), CONTEXT);
    await automation.publishBotScenario({ ...scenarioPayload("Ответ v1"), idempotencyKey: "pub-1" }, CONTEXT);

    const missing = await automation.rollbackBotScenarioToVersion("bot-draft", "runtime-none", CONTEXT);
    assert.equal(missing.status, "invalid");
    assert.equal(missing.error?.code, "bot_runtime_rollback_version_not_found");

    const detail = await automation.fetchBotScenario("bot-draft", CONTEXT);
    const versionId = String((detail.data.versions as Array<{ versionId: string }>)[0]?.versionId ?? "");
    const foreign = await automation.rollbackBotScenarioToVersion("bot-draft", versionId, { actor: "x", tenantId: "tenant-ladoga" });
    assert.equal(foreign.status, "invalid");
  });
});
