import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { AiConnectionRepository } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import { evaluateFeatureFlagRollout, featureFlagToRolloutRule } from "../apps/api-gateway/src/feature-flags/feature-flag-rollout.engine.ts";
import { featureFlags } from "../apps/api-gateway/src/platform/seed-catalog.ts";

const scenario = (id: string) => ({
  id,
  name: "Negative contract scenario",
  channels: ["SDK"],
  flowNodes: [{ id: "start", type: "message", title: "Start" }],
  flowEdges: []
});

describe("BAI-006 negative bot contracts", () => {
  beforeEach(() => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    AiConnectionRepository.useDefault(AiConnectionRepository.inMemory());
  });
  afterEach(() => {
    AiConnectionRepository.clearDefault();
    AutomationRepository.clearDefault();
  });

  it("fails closed for every cross-tenant scenario action without changing the owner record", async () => {
    const automation = new AutomationService();
    await automation.createBotScenario(scenario("bot-owner-only"), { tenantId: "tenant-volga" });

    const foreignUpdate = await automation.updateBotScenario("bot-owner-only", { name: "Foreign edit" }, { tenantId: "tenant-ladoga" });
    const foreignArchive = await automation.archiveBotScenario("bot-owner-only", { tenantId: "tenant-ladoga" });
    const foreignRestore = await automation.restoreBotScenario("bot-owner-only", { tenantId: "tenant-ladoga" });
    const foreignPublish = await automation.publishBotScenario({ ...scenario("bot-owner-only"), idempotencyKey: "foreign-publish" }, { tenantId: "tenant-ladoga" });
    const owner = await automation.fetchBotScenario("bot-owner-only", { tenantId: "tenant-volga" });

    for (const result of [foreignUpdate, foreignArchive, foreignRestore, foreignPublish]) {
      assert.equal(result.status, "invalid");
      assert.equal(result.error?.code, "bot_scenario_not_found");
    }
    assert.equal(owner.data.scenario.name, "Negative contract scenario");
    assert.equal(owner.data.scenario.status, "draft");
  });

  it("rejects lifecycle transitions from an unknown persisted state and does not repair it implicitly", async () => {
    const repository = AutomationRepository.default();
    await repository.saveBotScenario({
      ...scenario("bot-unknown-state"),
      schemaVersion: "bot-flow/v1",
      status: "awaiting_approval",
      tenantId: "tenant-volga"
    });
    const automation = new AutomationService(repository);

    const archive = await automation.archiveBotScenario("bot-unknown-state", { tenantId: "tenant-volga" });
    const publish = await automation.publishBotScenario(scenario("bot-unknown-state"), { tenantId: "tenant-volga" });
    const persisted = await repository.findBotScenario("bot-unknown-state");

    assert.equal(archive.status, "conflict");
    assert.equal(archive.error?.code, "bot_scenario_transition_invalid");
    assert.equal(publish.status, "conflict");
    assert.equal(publish.error?.code, "bot_scenario_transition_invalid");
    assert.equal(persisted?.status, "awaiting_approval");
  });

  it("makes a repeated destructive action idempotent instead of performing a second transition", async () => {
    const automation = new AutomationService();
    await automation.createBotScenario(scenario("bot-archive-once"), { tenantId: "tenant-volga" });

    const first = await automation.archiveBotScenario("bot-archive-once", { tenantId: "tenant-volga" });
    const duplicate = await automation.archiveBotScenario("bot-archive-once", { tenantId: "tenant-volga" });

    assert.equal(first.status, "ok");
    assert.equal(first.data.duplicate, false);
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.scenario.status, "archived");
  });

  it("keeps AI bot capabilities inaccessible for every tenant while their launch flags are off", () => {
    for (const key of ["ai_bots", "ai_bot_mcp_sources"]) {
      const flag = featureFlags.find((item) => item.key === key);
      assert.ok(flag, `${key} must exist`);
      const evaluation = evaluateFeatureFlagRollout({
        planId: "enterprise",
        rule: featureFlagToRolloutRule(flag!),
        tenantId: "tenant-volga"
      });

      assert.equal(evaluation.eligible, false);
      assert.equal(evaluation.reason, "flag_off");
    }
  });
});
