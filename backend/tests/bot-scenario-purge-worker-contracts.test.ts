import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { runBotScenarioPurgeOnce } from "../apps/api-gateway/src/automation/bot-scenario-purge.worker.ts";

const EXPIRED = "2026-07-01T00:00:00.000Z";
const NOW = "2026-07-12T00:00:00.000Z";

function archivedScenario(id: string, tenantId = "tenant-volga", extra: Record<string, unknown> = {}) {
  return {
    archivedAt: "2026-06-01T00:00:00.000Z",
    channels: ["SDK"],
    enabled: false,
    flowEdges: [],
    flowNodes: [{ id: "start", type: "message" }],
    id,
    name: id,
    retentionUntil: EXPIRED,
    schemaVersion: "bot-flow/v1" as const,
    status: "archived",
    tenantId,
    ...extra
  };
}

describe("bot scenario retention purge worker", () => {
  it("purges only expired archived scenarios without a legal or audit hold", async () => {
    const state = createEmptyAutomationState();
    state.botScenarios.push(
      archivedScenario("purge-me"),
      archivedScenario("legal-hold", "tenant-volga", { legalHold: true, legalHoldBy: "legal" }),
      archivedScenario("audit-hold", "tenant-volga", { auditHold: true, auditHoldBy: "auditor" }),
      archivedScenario("immutable-audit")
    );
    state.botScenarioVersions.push({ createdAt: EXPIRED, flowEdges: [], flowNodes: [], scenarioId: "purge-me", status: "published", tenantId: "tenant-volga", versionId: "purge-me-v1" });
    state.botTestRuns.push({ auditId: "test-audit", cases: [], queue: "bot", scenarioId: "purge-me", status: "passed", tenantId: "tenant-volga", testRunId: "purge-me-test" });
    state.botPublishAuditEvents.push({ action: "bot.publish", actor: "admin", auditId: "immutable-audit-1", createdAt: EXPIRED, idempotencyKey: "immutable-audit-key", immutable: true, runtimeVersion: "runtime-v1", scenarioId: "immutable-audit", tenantId: "tenant-volga", versionId: "immutable-audit-v1" });
    const repository = AutomationRepository.inMemory(state);

    const result = await runBotScenarioPurgeOnce({ automationRepository: repository, now: NOW });
    const after = repository.readState();

    assert.deepEqual(result, { auditHeld: 2, legalHeld: 1, notEligible: 0, purged: 1, scanned: 4 });
    assert.equal(after.botScenarios.some((item) => item.id === "purge-me"), false);
    assert.equal(after.botScenarioVersions.some((item) => item.scenarioId === "purge-me"), false);
    assert.equal(after.botTestRuns.some((item) => item.scenarioId === "purge-me"), false);
    assert.deepEqual(after.botScenarios.map((item) => item.id).sort(), ["audit-hold", "immutable-audit", "legal-hold"]);
    assert.equal(after.botPublishAuditEvents.length, 1);
    assert.equal(after.scenarioAuditEvents.length, 1);
    assert.equal(after.scenarioAuditEvents[0]?.actorType, "system");
  });

  it("keeps tenant scope on direct purge and never purges an unexpired or non-archived scenario", async () => {
    const state = createEmptyAutomationState();
    state.botScenarios.push(
      archivedScenario("other-tenant", "tenant-ladoga"),
      archivedScenario("not-due", "tenant-volga", { retentionUntil: "2026-08-01T00:00:00.000Z" }),
      { ...archivedScenario("disabled", "tenant-volga"), status: "disabled" }
    );
    const repository = AutomationRepository.inMemory(state);

    assert.equal((await repository.purgeArchivedBotScenarioAsync("tenant-volga", "other-tenant", NOW)).outcome, "not_eligible");
    assert.equal((await repository.purgeArchivedBotScenarioAsync("tenant-volga", "not-due", NOW)).outcome, "not_eligible");
    assert.equal((await repository.purgeArchivedBotScenarioAsync("tenant-volga", "disabled", NOW)).outcome, "not_eligible");
    assert.equal(repository.readState().botScenarios.length, 3);
  });
});
