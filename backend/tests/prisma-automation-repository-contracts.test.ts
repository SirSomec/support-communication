import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";

describe("Prisma-backed automation repository contracts", () => {
  it("persists bot scenarios through Prisma with tenant parity and defensive JSON mapping", async () => {
    const { client, calls } = createFakePrismaAutomationClient();
    const repository = AutomationRepository.prisma({ client });

    const saved = await repository.saveBotScenario({
      channels: ["SDK"],
      flowEdges: [{ from: "start", label: "ok", to: "handoff" }],
      flowNodes: [
        { id: "start", title: "Start", type: "message" },
        { id: "handoff", title: "Handoff", type: "handoff" }
      ],
      id: "bot-scenario-prisma",
      name: "Prisma scenario bot",
      schemaVersion: "bot-flow/v1",
      status: "draft"
    });
    saved.flowNodes[0].title = "Mutated after save";

    const found = await repository.findBotScenario("bot-scenario-prisma");
    const foundTitleBeforeMutation = found?.flowNodes[0].title;
    found!.flowNodes[0].title = "Mutated after lookup";
    const foundAgainBeforeUpdate = await repository.findBotScenario("bot-scenario-prisma");

    const updated = await repository.saveBotScenario({
      ...foundAgainBeforeUpdate!,
      channels: ["SDK", "Telegram"],
      status: "published",
      tenantId: "tenant-spoofed"
    });
    const foundAgain = await repository.findBotScenario("bot-scenario-prisma");
    const listed = await repository.listBotScenarios();
    const missing = await repository.findBotScenario("missing-bot");
    const state = repository.readState();

    assert.equal(saved.tenantId, "tenant-demo");
    assert.equal(found?.tenantId, "tenant-demo");
    assert.equal(foundTitleBeforeMutation, "Start");
    assert.equal(foundAgainBeforeUpdate?.flowNodes[0].title, "Start");
    assert.equal(foundAgain?.flowNodes[0].title, "Start");
    assert.equal(updated.tenantId, "tenant-demo");
    assert.equal(updated.status, "published");
    assert.deepEqual(updated.channels, ["SDK", "Telegram"]);
    assert.equal(listed.filter((scenario) => scenario.id === "bot-scenario-prisma").length, 1);
    assert.equal(state.botScenarios.find((scenario) => scenario.id === "bot-scenario-prisma")?.status, "published");
    assert.equal(missing, undefined);
    assert.equal(calls.botScenarioFindUnique.length, 6);
    assert.equal(calls.botScenarioUpsert.length, 2);
    assert.deepEqual(calls.botScenarioFindMany, [{
      orderBy: { updatedAt: "desc" }
    }]);
    assert.equal(calls.botScenarioUpsert[0].create.tenantId, "tenant-demo");
    assert.equal(calls.botScenarioUpsert[1].update.tenantId, "tenant-demo");
    assert.equal(calls.botScenarioUpsert[0].create.createdAt instanceof Date, true);
    assert.equal(calls.botScenarioUpsert[1].update.createdAt, undefined);
  });

  it("persists immutable bot scenario versions through Prisma with first-write-wins replay", async () => {
    const { client, calls } = createFakePrismaAutomationClient();
    const repository = AutomationRepository.prisma({ client });
    const version = {
      createdAt: "2026-06-30T17:20:00.000Z",
      flowEdges: [{ from: "start", to: "handoff" }],
      flowNodes: [
        { id: "start", title: "Start", type: "message" },
        { id: "handoff", title: "Handoff", type: "handoff" }
      ],
      scenarioId: "bot-version-prisma",
      status: "draft",
      versionId: "bot-version-prisma-v1"
    };

    const saved = await repository.saveBotScenarioVersion(version);
    version.flowNodes[0].title = "Mutated after save";
    const duplicate = await repository.saveBotScenarioVersion({
      ...version,
      status: "published",
      tenantId: "tenant-spoofed"
    });
    const second = await repository.saveBotScenarioVersion({
      ...version,
      createdAt: "2026-06-30T17:21:00.000Z",
      status: "published",
      versionId: "bot-version-prisma-v2"
    });
    const found = await repository.findBotScenarioVersion("bot-version-prisma-v1");
    const foundTitleBeforeMutation = found?.flowNodes[0].title;
    found!.flowNodes[0].title = "Mutated after lookup";
    const foundAgain = await repository.findBotScenarioVersion("bot-version-prisma-v1");
    const versions = await repository.listBotScenarioVersions("bot-version-prisma");
    const missing = await repository.findBotScenarioVersion("missing-version");
    const state = repository.readState();

    assert.equal(saved.tenantId, "tenant-demo");
    assert.equal(duplicate.versionId, "bot-version-prisma-v1");
    assert.equal(duplicate.status, "draft");
    assert.equal(duplicate.tenantId, "tenant-demo");
    assert.equal(second.versionId, "bot-version-prisma-v2");
    assert.equal(second.status, "published");
    assert.equal(found?.createdAt, "2026-06-30T17:20:00.000Z");
    assert.equal(foundTitleBeforeMutation, "Start");
    assert.equal(foundAgain?.flowNodes[0].title, "Start");
    assert.deepEqual(versions.map((item) => item.versionId), ["bot-version-prisma-v1", "bot-version-prisma-v2"]);
    assert.equal(state.botScenarioVersions.length, 2);
    assert.equal(missing, undefined);
    assert.equal(calls.botScenarioVersionCreates.length, 2);
    assert.equal(calls.botScenarioVersionFindUnique.length, 6);
    assert.deepEqual(calls.botScenarioVersionFindMany, [{
      orderBy: { createdAt: "asc" },
      where: { scenarioId: "bot-version-prisma" }
    }]);
    assert.equal(calls.botScenarioVersionCreates[0].data.createdAt instanceof Date, true);
    assert.equal(calls.botScenarioVersionCreates[0].data.tenantId, "tenant-demo");
    assert.equal(calls.botScenarioVersionCreates[1].data.tenantId, "tenant-demo");
  });

  it("persists immutable bot publish audit rows through Prisma with idempotency replay", async () => {
    const { client, calls } = createFakePrismaAutomationClient();
    const repository = AutomationRepository.prisma({ client });
    const auditEvent = {
      action: "bot.publish",
      actor: "automation-admin",
      auditId: "evt_bot_publish_prisma_001",
      createdAt: "2026-06-30T17:30:00.000Z",
      idempotencyKey: "publish-audit-prisma",
      immutable: true as const,
      runtimeVersion: "runtime-bot-prisma-v1",
      scenarioId: "bot-publish-prisma",
      versionId: "bot-publish-prisma-v1"
    };

    const saved = await repository.saveBotPublishAuditEvent(auditEvent);
    const duplicateAuditId = await repository.saveBotPublishAuditEvent({
      ...auditEvent,
      actor: "changed-admin",
      idempotencyKey: "publish-audit-prisma-other-key",
      runtimeVersion: "runtime-bot-prisma-v2",
      tenantId: "tenant-spoofed"
    });
    const duplicateKey = await repository.saveBotPublishAuditEvent({
      ...auditEvent,
      auditId: "evt_bot_publish_prisma_002",
      actor: "changed-admin",
      runtimeVersion: "runtime-bot-prisma-v2",
      tenantId: "tenant-spoofed"
    });
    const otherScenario = await repository.saveBotPublishAuditEvent({
      ...auditEvent,
      auditId: "evt_bot_publish_prisma_other",
      idempotencyKey: "publish-audit-prisma-other-scenario",
      scenarioId: "bot-publish-prisma-other"
    });
    const found = await repository.findBotPublishAuditEvent("evt_bot_publish_prisma_001");
    const listed = await repository.listBotPublishAuditEvents("bot-publish-prisma");
    const missing = await repository.findBotPublishAuditEvent("missing-audit");
    const state = repository.readState();

    assert.equal(saved.tenantId, "tenant-demo");
    assert.equal(saved.immutable, true);
    assert.equal(duplicateAuditId.auditId, "evt_bot_publish_prisma_001");
    assert.equal(duplicateAuditId.runtimeVersion, "runtime-bot-prisma-v1");
    assert.equal(duplicateKey.auditId, "evt_bot_publish_prisma_001");
    assert.equal(duplicateKey.tenantId, "tenant-demo");
    assert.equal(otherScenario.scenarioId, "bot-publish-prisma-other");
    assert.equal(found?.createdAt, "2026-06-30T17:30:00.000Z");
    assert.deepEqual(listed.map((event) => event.auditId), ["evt_bot_publish_prisma_001"]);
    assert.equal(state.botPublishAuditEvents.length, 2);
    assert.equal(missing, undefined);
    assert.equal(calls.botPublishAuditEventCreates.length, 2);
    assert.equal(calls.botPublishAuditEventFindUnique.length, 9);
    assert.deepEqual(calls.botPublishAuditEventFindMany, [{
      orderBy: { createdAt: "asc" },
      where: { scenarioId: "bot-publish-prisma" }
    }]);
    assert.equal(calls.botPublishAuditEventCreates[0].data.createdAt instanceof Date, true);
    assert.equal(calls.botPublishAuditEventCreates[0].data.immutable, true);
    assert.equal(calls.botPublishAuditEventCreates[0].data.tenantId, "tenant-demo");
  });
});

function createFakePrismaAutomationClient() {
  const scenarios = new Map<string, FakeBotScenarioRow>();
  const scenarioVersions = new Map<string, FakeBotScenarioVersionRow>();
  const publishAuditEvents = new Map<string, FakeBotPublishAuditEventRow>();
  const calls = {
    botScenarioFindMany: [] as Array<{ orderBy: { updatedAt: "desc" } }>,
    botScenarioFindUnique: [] as Array<{ where: { id: string } }>,
    botScenarioUpsert: [] as Array<FakeBotScenarioUpsertInput>,
    botScenarioVersionCreates: [] as Array<{ data: FakeBotScenarioVersionCreateInput }>,
    botScenarioVersionFindMany: [] as Array<{
      orderBy: { createdAt: "asc" };
      where: { scenarioId: string };
    }>,
    botScenarioVersionFindUnique: [] as Array<{ where: { versionId: string } }>,
    botPublishAuditEventCreates: [] as Array<{ data: FakeBotPublishAuditEventCreateInput }>,
    botPublishAuditEventFindMany: [] as Array<{
      orderBy: { createdAt: "asc" };
      where: { scenarioId: string };
    }>,
    botPublishAuditEventFindUnique: [] as Array<{
      where: { auditId: string } | { idempotencyKey: string };
    }>
  };
  const client = {
    botScenario: {
      async findMany(input: { orderBy: { updatedAt: "desc" } }): Promise<FakeBotScenarioRow[]> {
        calls.botScenarioFindMany.push(input);
        return Array.from(scenarios.values()).sort((left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime()
        ).map(clone);
      },
      async findUnique(input: { where: { id: string } }): Promise<FakeBotScenarioRow | null> {
        calls.botScenarioFindUnique.push(input);
        return clone(scenarios.get(input.where.id) ?? null);
      },
      async upsert(input: FakeBotScenarioUpsertInput): Promise<FakeBotScenarioRow> {
        calls.botScenarioUpsert.push(input);
        const existing = scenarios.get(input.where.id);
        const row = existing
          ? {
              ...existing,
              ...clone(input.update),
              createdAt: existing.createdAt,
              updatedAt: new Date("2026-06-30T17:10:00.000Z")
            }
          : clone(input.create);
        scenarios.set(row.id, clone(row));
        return clone(row);
      }
    },
    botScenarioVersion: {
      async create(input: { data: FakeBotScenarioVersionCreateInput }): Promise<FakeBotScenarioVersionRow> {
        calls.botScenarioVersionCreates.push(input);
        const row = clone(input.data) as FakeBotScenarioVersionRow;
        scenarioVersions.set(row.versionId, clone(row));
        return clone(row);
      },
      async findMany(input: {
        orderBy: { createdAt: "asc" };
        where: { scenarioId: string };
      }): Promise<FakeBotScenarioVersionRow[]> {
        calls.botScenarioVersionFindMany.push(input);
        return Array.from(scenarioVersions.values())
          .filter((row) => row.scenarioId === input.where.scenarioId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map(clone);
      },
      async findUnique(input: { where: { versionId: string } }): Promise<FakeBotScenarioVersionRow | null> {
        calls.botScenarioVersionFindUnique.push(input);
        return clone(scenarioVersions.get(input.where.versionId) ?? null);
      }
    },
    botPublishAuditEvent: {
      async create(input: { data: FakeBotPublishAuditEventCreateInput }): Promise<FakeBotPublishAuditEventRow> {
        calls.botPublishAuditEventCreates.push(input);
        const row = clone(input.data) as FakeBotPublishAuditEventRow;
        publishAuditEvents.set(row.auditId, clone(row));
        return clone(row);
      },
      async findMany(input: {
        orderBy: { createdAt: "asc" };
        where: { scenarioId: string };
      }): Promise<FakeBotPublishAuditEventRow[]> {
        calls.botPublishAuditEventFindMany.push(input);
        return Array.from(publishAuditEvents.values())
          .filter((row) => row.scenarioId === input.where.scenarioId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map(clone);
      },
      async findUnique(input: {
        where: { auditId: string } | { idempotencyKey: string };
      }): Promise<FakeBotPublishAuditEventRow | null> {
        calls.botPublishAuditEventFindUnique.push(input);
        if ("auditId" in input.where) {
          return clone(publishAuditEvents.get(input.where.auditId) ?? null);
        }

        return clone(
          Array.from(publishAuditEvents.values()).find((row) => row.idempotencyKey === input.where.idempotencyKey) ?? null
        );
      }
    }
  };

  return { calls, client };
}

interface FakeBotScenarioUpsertInput {
  create: FakeBotScenarioCreateInput;
  update: Partial<FakeBotScenarioCreateInput>;
  where: { id: string };
}

interface FakeBotScenarioCreateInput {
  channels: string[];
  createdAt?: Date;
  flowEdges: unknown;
  flowNodes: unknown;
  id: string;
  name: string;
  schemaVersion: string;
  status: string;
  tenantId: string;
  updatedAt?: Date;
}

interface FakeBotScenarioRow extends FakeBotScenarioCreateInput {
  createdAt: Date;
  updatedAt: Date;
}

interface FakeBotScenarioVersionCreateInput {
  createdAt: Date;
  flowEdges: unknown;
  flowNodes: unknown;
  scenarioId: string;
  status: string;
  tenantId: string;
  versionId: string;
}

interface FakeBotScenarioVersionRow extends FakeBotScenarioVersionCreateInput {}

interface FakeBotPublishAuditEventCreateInput {
  action: string;
  actor: string;
  auditId: string;
  createdAt: Date;
  idempotencyKey: string;
  immutable: boolean;
  runtimeVersion: string;
  scenarioId: string;
  tenantId: string;
  versionId: string;
}

interface FakeBotPublishAuditEventRow extends FakeBotPublishAuditEventCreateInput {}

function clone<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value), (_key, item) => {
    if (typeof item === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item)) {
      return new Date(item);
    }
    return item;
  }) as T;
}
