import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";

describe("report and automation idempotency tenant migration", () => {
  it("declares tenant-scoped composite identities in Prisma", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

    assert.match(schema, /model ReportIdempotencyKey[\s\S]*?tenantId\s+String[\s\S]*?@@id\(\[tenantId, key\]\)/);
    assert.match(schema, /model AutomationPublishIdempotencyKey[\s\S]*?tenantId\s+String[\s\S]*?@@id\(\[tenantId, key\]\)/);
  });

  it("backfills from referenced records and JSON and fails closed on unresolved rows", () => {
    const migration = readFileSync(new URL(
      "../prisma/migrations/202607110002_tenant_scope_report_automation_idempotency/migration.sql",
      import.meta.url
    ), "utf8");

    assert.match(migration, /JOIN "report_export_jobs"/);
    assert.match(migration, /JOIN "saved_report_templates"/);
    assert.match(migration, /"result" ->> 'tenantId'/);
    assert.match(migration, /JOIN "bot_scenarios"/);
    assert.match(migration, /JOIN "bot_publish_audit_events"/);
    assert.match(migration, /RAISE EXCEPTION 'Cannot tenant-scope report_idempotency_keys/);
    assert.match(migration, /RAISE EXCEPTION 'Cannot tenant-scope automation_publish_idempotency_keys/);
    assert.match(migration, /PRIMARY KEY \("tenant_id", "key"\)/g);
  });

  it("isolates automation publish replay by tenant", async () => {
    const repository = AutomationRepository.inMemory();
    const service = new AutomationService(repository);
    const scenario = (scenarioId: string, tenantId: string) => ({
      channels: ["SDK"],
      flowEdges: [],
      flowNodes: [{ id: "start", type: "message" }],
      id: scenarioId,
      idempotencyKey: "shared-publish-key",
      name: `Bot ${tenantId}`
    });
    await service.createBotScenario(scenario("bot-volga", "tenant-volga"), { tenantId: "tenant-volga" });
    await service.createBotScenario(scenario("bot-ladoga", "tenant-ladoga"), { tenantId: "tenant-ladoga" });
    const publish = (scenarioId: string, tenantId: string) => service.publishBotScenario(
      scenario(scenarioId, tenantId),
      { tenantId }
    );

    const volga = await publish("bot-volga", "tenant-volga");
    const ladoga = await publish("bot-ladoga", "tenant-ladoga");
    const volgaReplay = await publish("bot-volga", "tenant-volga");

    assert.equal(volga.status, "ok");
    assert.equal(ladoga.status, "ok");
    assert.equal(ladoga.data.duplicate, false);
    assert.equal(volgaReplay.data.duplicate, true);
    assert.notEqual(ladoga.data.runtimeVersion, volga.data.runtimeVersion);
    assert.equal(repository.readState().publishIdempotencyKeys.length, 2);
    assert.equal(repository.readState().botPublishAuditEvents.length, 2);
  });
});
