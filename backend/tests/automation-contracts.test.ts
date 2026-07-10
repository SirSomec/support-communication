import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";

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

    const updated = await automation.updateBotScenario("bot-draft-1", {
      name: "Draft bot updated"
    }, { tenantId: "tenant-volga" });

    assert.equal(updated.status, "ok");
    assert.equal(updated.data.scenario.name, "Draft bot updated");
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
});
