import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { configureAutomationRepository } from "../apps/api-gateway/src/automation/bootstrap.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { planEligibleProactiveRuleDeliveryAsync } from "../apps/api-gateway/src/automation/proactive-delivery.worker.ts";
import { bootstrapAutomationState } from "../apps/api-gateway/src/automation/seed.ts";

describe("Prisma-backed automation repository contracts", () => {
  it("applies local automation fixtures only through an explicit seed, never inferred", () => {
    // The JSON file store stays a test-only utility (the JSON runtime is removed in
    // phase D); it must still seed only when a seed is passed explicitly, not inferred.
    const workspace = mkdtempSync(join(tmpdir(), "automation-bootstrap-"));
    try {
      const empty = AutomationRepository.open({ filePath: join(workspace, "empty.json") });
      const seeded = AutomationRepository.open({
        filePath: join(workspace, "seeded.json"),
        seed: bootstrapAutomationState()
      });

      assert.equal(empty.readState().botScenarios.length, 0);
      assert.ok(seeded.readState().botScenarios.length > 0);
      assert.ok(seeded.readState().botScenarios.every((scenario) => scenario.tenantId === "tenant-volga"));
    } finally {
      AutomationRepository.clearDefault();
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("bootstraps the default automation repository from a Prisma client factory", async () => {
    const { client, calls } = createFakePrismaAutomationClient();
    let datasourceUrl: string | undefined;

    const repository = configureAutomationRepository({
      AUTOMATION_REPOSITORY: "prisma",
      DATABASE_URL: "postgresql://automation-bootstrap"
    }, {
      prismaClientFactory(options) {
        datasourceUrl = options.datasourceUrl;
        return client;
      }
    });

    await repository.saveBotScenario({
      channels: ["SDK"],
      flowEdges: [],
      flowNodes: [{ id: "start", title: "Start", type: "message" }],
      id: "automation-bootstrap-bot",
      name: "Automation bootstrap bot",
      schemaVersion: "bot-flow/v1",
      status: "draft",
      tenantId: "tenant-bootstrap"
    });
    const defaultRepository = AutomationRepository.default();
    const listed = await defaultRepository.listBotScenarios();

    assert.equal(datasourceUrl, "postgresql://automation-bootstrap");
    assert.deepEqual(listed.map((scenario) => scenario.id), ["automation-bootstrap-bot"]);
    assert.equal(calls.botScenarioUpsert.length, 1);
  });

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
      status: "draft",
      tenantId: "tenant-volga"
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
      tenantId: "tenant-volga"
    });
    const foundAgain = await repository.findBotScenario("bot-scenario-prisma");
    const listed = await repository.listBotScenarios();
    const missing = await repository.findBotScenario("missing-bot");
    const state = await repository.readStateAsync();

    assert.equal(saved.tenantId, "tenant-volga");
    assert.equal(found?.tenantId, "tenant-volga");
    assert.equal(foundTitleBeforeMutation, "Start");
    assert.equal(foundAgainBeforeUpdate?.flowNodes[0].title, "Start");
    assert.equal(foundAgain?.flowNodes[0].title, "Start");
    assert.equal(updated.tenantId, "tenant-volga");
    assert.equal(updated.status, "published");
    assert.deepEqual(updated.channels, ["SDK", "Telegram"]);
    assert.equal(listed.filter((scenario) => scenario.id === "bot-scenario-prisma").length, 1);
    assert.equal(state.botScenarios.find((scenario) => scenario.id === "bot-scenario-prisma")?.status, "published");
    assert.equal(missing, undefined);
    assert.equal(calls.botScenarioFindUnique.length, 6);
    assert.equal(calls.botScenarioUpsert.length, 2);
    assert.deepEqual(calls.botScenarioFindMany[0], {
      orderBy: { updatedAt: "desc" }
    });
    assert.equal(calls.botScenarioUpsert[0].create.tenantId, "tenant-volga");
    assert.equal(calls.botScenarioUpsert[1].update.tenantId, "tenant-volga");
    assert.equal(calls.botScenarioUpsert[0].create.createdAt instanceof Date, true);
    assert.equal(calls.botScenarioUpsert[1].update.createdAt, undefined);
  });

  it("persists disabled and archived lifecycle metadata while keeping archived scenarios disabled", async () => {
    const { client, calls } = createFakePrismaAutomationClient();
    const repository = AutomationRepository.prisma({ client });

    const disabled = await repository.saveBotScenario({
      channels: ["SDK"],
      disableReason: "Maintenance window",
      disabledBy: "tenant-admin",
      enabled: false,
      flowEdges: [],
      flowNodes: [{ id: "start", type: "message" }],
      id: "bot-scenario-lifecycle",
      name: "Lifecycle scenario",
      schemaVersion: "bot-flow/v1",
      status: "published",
      tenantId: "tenant-volga"
    });
    const archived = await repository.saveBotScenario({
      ...disabled,
      archiveReason: "No longer needed",
      archivedBy: "tenant-admin",
      enabled: true,
      status: "archived"
    });
    const found = await repository.findBotScenario("bot-scenario-lifecycle");

    assert.equal(disabled.enabled, false);
    assert.ok(disabled.disabledAt);
    assert.equal(disabled.disableReason, "Maintenance window");
    assert.equal(archived.enabled, false);
    assert.ok(archived.archivedAt);
    assert.equal(archived.archiveReason, "No longer needed");
    assert.equal(found?.enabled, false);
    assert.equal(found?.archivedBy, "tenant-admin");
    assert.equal(calls.botScenarioUpsert[0].create.enabled, false);
    assert.equal(calls.botScenarioUpsert[1].update.enabled, false);
    assert.equal(calls.botScenarioUpsert[1].update.archivedAt instanceof Date, true);
  });

  it("purges an expired archived scenario through Prisma with a tenant-qualified predicate", async () => {
    const { client, calls } = createFakePrismaAutomationClient();
    const repository = AutomationRepository.prisma({ client });
    await repository.saveBotScenario({
      archivedAt: "2026-06-01T00:00:00.000Z", channels: ["SDK"], enabled: false, flowEdges: [],
      flowNodes: [{ id: "start", type: "message" }], id: "bot-scenario-prisma-purge", name: "Prisma purge scenario",
      retentionUntil: "2026-07-01T00:00:00.000Z", schemaVersion: "bot-flow/v1", status: "archived", tenantId: "tenant-volga"
    });

    const result = await repository.purgeArchivedBotScenarioAsync("tenant-volga", "bot-scenario-prisma-purge", "2026-07-12T00:00:00.000Z");

    assert.equal(result.outcome, "purged");
    assert.equal(await repository.findBotScenario("bot-scenario-prisma-purge"), undefined);
    assert.equal(calls.botScenarioDeleteMany[0]?.where.tenantId, "tenant-volga");
    assert.equal(calls.botScenarioDeleteMany[0]?.where.status, "archived");
    assert.equal(calls.botScenarioDeleteMany[0]?.where.auditHold, false);
    assert.equal(calls.botScenarioDeleteMany[0]?.where.legalHold, false);
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
      tenantId: "tenant-volga",
      versionId: "bot-version-prisma-v1"
    };

    const saved = await repository.saveBotScenarioVersion(version);
    version.flowNodes[0].title = "Mutated after save";
    const duplicate = await repository.saveBotScenarioVersion({
      ...version,
      status: "published"
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
    const state = await repository.readStateAsync();

    assert.equal(saved.tenantId, "tenant-volga");
    assert.equal(duplicate.versionId, "bot-version-prisma-v1");
    assert.equal(duplicate.status, "draft");
    assert.equal(duplicate.tenantId, "tenant-volga");
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
    assert.deepEqual(calls.botScenarioVersionFindMany.find((input) => input.where?.scenarioId === "bot-version-prisma"), {
      orderBy: { createdAt: "asc" },
      where: { scenarioId: "bot-version-prisma" }
    });
    assert.equal(calls.botScenarioVersionCreates[0].data.createdAt instanceof Date, true);
    assert.equal(calls.botScenarioVersionCreates[0].data.tenantId, "tenant-volga");
    assert.equal(calls.botScenarioVersionCreates[1].data.tenantId, "tenant-volga");
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
      tenantId: "tenant-volga",
      versionId: "bot-publish-prisma-v1"
    };

    const saved = await repository.saveBotPublishAuditEvent(auditEvent);
    const duplicateAuditId = await repository.saveBotPublishAuditEvent({
      ...auditEvent,
      actor: "changed-admin",
      idempotencyKey: "publish-audit-prisma-other-key",
      runtimeVersion: "runtime-bot-prisma-v2"
    });
    const duplicateKey = await repository.saveBotPublishAuditEvent({
      ...auditEvent,
      auditId: "evt_bot_publish_prisma_002",
      actor: "changed-admin",
      runtimeVersion: "runtime-bot-prisma-v2"
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
    const state = await repository.readStateAsync();

    assert.equal(saved.tenantId, "tenant-volga");
    assert.equal(saved.immutable, true);
    assert.equal(duplicateAuditId.auditId, "evt_bot_publish_prisma_001");
    assert.equal(duplicateAuditId.runtimeVersion, "runtime-bot-prisma-v1");
    assert.equal(duplicateKey.auditId, "evt_bot_publish_prisma_001");
    assert.equal(duplicateKey.tenantId, "tenant-volga");
    assert.equal(otherScenario.scenarioId, "bot-publish-prisma-other");
    assert.equal(found?.createdAt, "2026-06-30T17:30:00.000Z");
    assert.deepEqual(listed.map((event) => event.auditId), ["evt_bot_publish_prisma_001"]);
    assert.equal(state.botPublishAuditEvents.length, 2);
    assert.equal(missing, undefined);
    assert.equal(calls.botPublishAuditEventCreates.length, 2);
    assert.equal(calls.botPublishAuditEventFindUnique.length, 9);
    assert.deepEqual(calls.botPublishAuditEventFindMany.find((input) => input.where?.scenarioId === "bot-publish-prisma"), {
      orderBy: { createdAt: "asc" },
      where: { scenarioId: "bot-publish-prisma" }
    });
    assert.equal(calls.botPublishAuditEventCreates[0].data.createdAt instanceof Date, true);
    assert.equal(calls.botPublishAuditEventCreates[0].data.immutable, true);
    assert.equal(calls.botPublishAuditEventCreates[0].data.tenantId, "tenant-volga");
  });

  it("persists automation runtime state through Prisma delegates without JSON fallback", async () => {
    const { client, calls } = createFakePrismaAutomationClient();
    const repository = AutomationRepository.prisma({ client });

    assert.throws(() => repository.readState(), /prisma_automation_async_required/);

    const publishRecord = await repository.savePublishIdempotencyKeyAsync({
      fingerprint: "publish-fingerprint",
      key: "publish-key",
      result: { runtimeVersion: "runtime-prisma-v1", scenarioId: "bot-prisma-runtime", tenantId: "tenant-volga" },
      tenantId: "tenant-volga"
    });
    const replayedPublish = await repository.savePublishIdempotencyKeyAsync({
      fingerprint: "changed-fingerprint",
      key: "publish-key",
      result: { runtimeVersion: "changed", tenantId: "tenant-volga" },
      tenantId: "tenant-volga"
    });
    const foundPublish = await repository.findPublishIdempotencyKeyAsync("tenant-volga", "publish-key");
    const otherTenantPublish = await repository.savePublishIdempotencyKeyAsync({
      fingerprint: "ladoga-publish-fingerprint",
      key: "publish-key",
      result: { runtimeVersion: "runtime-ladoga-v1", scenarioId: "bot-prisma-ladoga", tenantId: "tenant-ladoga" },
      tenantId: "tenant-ladoga"
    });

    const testRun = await repository.saveBotTestRunAsync({
      auditId: "evt_bot_test_prisma",
      cases: [{ input: "hello" }],
      queue: "bot-runtime",
      scenarioId: "bot-prisma-runtime",
      status: "running",
      tenantId: "tenant-volga",
      testRunId: "bot-test-prisma"
    });

    const rule = await repository.saveProactiveRuleAsync({
      activeVariant: "B",
      channels: ["SDK", "Telegram"],
      cooldown: "24h",
      id: "rule-prisma",
      segment: "checkout",
      status: "enabled",
      tenantId: "tenant-volga"
    });
    const listedRules = await repository.listProactiveRulesAsync();

    const window = await repository.saveProactiveExecutionWindowAsync({
      active: true,
      daysOfWeek: [1, 2, 3],
      endsAt: "18:00",
      ruleId: "rule-prisma",
      startsAt: "09:00",
      tenantId: "tenant-volga",
      timezone: "Europe/Moscow",
      windowId: "window-prisma"
    });
    const cap = await repository.saveProactiveFrequencyCapAsync({
      active: true,
      capId: "cap-prisma",
      limit: 3,
      period: "day",
      resetAt: "2026-07-03T21:00:00.000Z",
      ruleId: "rule-prisma",
      tenantId: "tenant-volga",
      used: 1
    });
    const assignment = await repository.saveProactiveExperimentAssignmentAsync({
      assignedAt: "2026-07-03T10:00:00.000Z",
      assignmentId: "assignment-prisma",
      experimentId: "exp-rule-prisma",
      ruleId: "rule-prisma",
      subjectId: "client-42",
      tenantId: "tenant-volga",
      variant: "B"
    });
    const replayedAssignment = await repository.saveProactiveExperimentAssignmentAsync({
      ...assignment,
      variant: "C"
    });

    const attempt = await repository.saveProactiveDeliveryAttemptAsync({
      attemptedAt: "2026-07-03T10:05:00.000Z",
      attemptId: "attempt-prisma",
      channel: "SDK",
      descriptorId: "proactive_rule_prisma_tenant_volga_client_42",
      ruleId: "rule-prisma",
      status: "queued",
      subjectId: "client-42",
      tenantId: "tenant-volga",
      traceId: "trc_proactive_prisma"
    });
    const deliveryRecord = await repository.saveProactiveDeliveryIdempotencyKeyAsync({
      fingerprint: "delivery-fingerprint",
      key: "proactive-delivery:tenant-volga:rule-prisma:client-42",
      result: { descriptorId: "proactive_rule_prisma_tenant_volga_client_42" },
      ruleId: "rule-prisma",
      subjectId: "client-42",
      tenantId: "tenant-volga"
    });
    const attribution = await repository.saveProactiveDeliveryAttributionAsync({
      assignedAt: "2026-07-03T10:05:01.000Z",
      attributionId: "attribution-prisma",
      descriptorId: "proactive_rule_prisma_tenant_volga_client_42",
      experimentId: "exp-rule-prisma",
      ruleId: "rule-prisma",
      subjectId: "client-42",
      tenantId: "tenant-volga",
      variant: "B"
    });
    const state = await repository.readStateAsync();

    assert.equal(publishRecord.key, "publish-key");
    assert.equal(replayedPublish.fingerprint, "publish-fingerprint");
    assert.equal(foundPublish?.result.runtimeVersion, "runtime-prisma-v1");
    assert.equal(otherTenantPublish.fingerprint, "ladoga-publish-fingerprint");
    assert.equal(testRun.tenantId, "tenant-volga");
    assert.equal(rule.status, "enabled");
    assert.deepEqual(listedRules.map((item) => item.id), ["rule-prisma"]);
    assert.equal(window.windowId, "window-prisma");
    assert.equal(cap.capId, "cap-prisma");
    assert.equal(replayedAssignment.variant, "B");
    assert.equal(attempt.traceId, "trc_proactive_prisma");
    assert.equal(deliveryRecord.result.descriptorId, "proactive_rule_prisma_tenant_volga_client_42");
    assert.equal(attribution.variant, "B");
    assert.equal(state.publishIdempotencyKeys.length, 2);
    assert.equal(state.botTestRuns.length, 1);
    assert.equal(state.proactiveRules.length, 1);
    assert.equal(state.proactiveExecutionWindows.length, 1);
    assert.equal(state.proactiveFrequencyCaps.length, 1);
    assert.equal(state.proactiveExperimentAssignments.length, 1);
    assert.equal(state.proactiveDeliveryAttempts.length, 1);
    assert.equal(state.proactiveDeliveryIdempotencyKeys.length, 1);
    assert.equal(state.proactiveDeliveryAttributions.length, 1);
    assert.equal(calls.automationPublishIdempotencyKeyCreates.length, 2);
    assert.equal(calls.automationBotTestRunUpserts.length, 1);
    assert.equal(calls.proactiveRuleUpserts.length, 1);
    assert.equal(calls.proactiveExecutionWindowUpserts.length, 1);
    assert.equal(calls.proactiveFrequencyCapUpserts.length, 1);
    assert.equal(calls.proactiveExperimentAssignmentCreates.length, 1);
    assert.equal(calls.proactiveDeliveryAttemptCreates.length, 1);
    assert.equal(calls.proactiveDeliveryIdempotencyKeyCreates.length, 1);
    assert.equal(calls.proactiveDeliveryAttributionCreates.length, 1);
  });

  it("rejects tenantless automation writes before calling Prisma", async () => {
    const { client, calls } = createFakePrismaAutomationClient();
    const repository = AutomationRepository.prisma({ client });
    const required = /automation_tenant_required/;

    await assert.rejects(Promise.resolve(repository.saveBotScenario({
      channels: ["SDK"], flowEdges: [], flowNodes: [], id: "tenantless-scenario",
      name: "Tenantless", schemaVersion: "bot-flow/v1", status: "draft"
    } as never)), required);
    await assert.rejects(Promise.resolve(repository.saveBotScenarioVersion({
      createdAt: "2026-07-10T00:00:00.000Z", flowEdges: [], flowNodes: [],
      scenarioId: "tenantless-scenario", status: "draft", versionId: "tenantless-version"
    } as never)), required);
    await assert.rejects(Promise.resolve(repository.saveBotPublishAuditEvent({
      action: "bot.publish", actor: "tester", auditId: "tenantless-audit",
      createdAt: "2026-07-10T00:00:00.000Z", idempotencyKey: "tenantless-audit-key",
      immutable: true, runtimeVersion: "runtime-v1", scenarioId: "tenantless-scenario", versionId: "v1"
    } as never)), required);
    await assert.rejects(repository.saveBotTestRunAsync({
      auditId: "tenantless-test-audit", cases: [], queue: "bot-runtime",
      scenarioId: "tenantless-scenario", status: "running", testRunId: "tenantless-test"
    } as never), required);
    await assert.rejects(repository.saveProactiveRuleAsync({
      channels: ["SDK"], id: "tenantless-rule", status: "enabled"
    } as never), required);
    await assert.rejects(repository.saveProactiveExecutionWindowAsync({
      active: true, daysOfWeek: [1], endsAt: "18:00", ruleId: "rule", startsAt: "09:00",
      timezone: "UTC", windowId: "tenantless-window"
    }), required);
    await assert.rejects(repository.saveProactiveFrequencyCapAsync({
      active: true, capId: "tenantless-cap", limit: 1, period: "day",
      resetAt: "2026-07-11T00:00:00.000Z", ruleId: "rule", used: 0
    }), required);
    await assert.rejects(repository.saveProactiveExperimentAssignmentAsync({
      assignedAt: "2026-07-10T00:00:00.000Z", assignmentId: "tenantless-assignment",
      experimentId: "experiment", ruleId: "rule", subjectId: "subject", variant: "A"
    }), required);
    await assert.rejects(repository.saveProactiveDeliveryAttemptAsync({
      attemptedAt: "2026-07-10T00:00:00.000Z", attemptId: "tenantless-attempt", channel: "SDK",
      descriptorId: "descriptor", ruleId: "rule", status: "queued", subjectId: "subject", traceId: "trace"
    }), required);
    await assert.rejects(repository.saveProactiveDeliveryIdempotencyKeyAsync({
      fingerprint: "fingerprint", key: "tenantless-idempotency", result: {}, ruleId: "rule", subjectId: "subject"
    }), required);
    await assert.rejects(repository.saveProactiveDeliveryAttributionAsync({
      assignedAt: "2026-07-10T00:00:00.000Z", attributionId: "tenantless-attribution",
      descriptorId: "descriptor", experimentId: "experiment", ruleId: "rule", subjectId: "subject", variant: "A"
    }), required);
    await assert.rejects(repository.savePublishIdempotencyKeyAsync({
      fingerprint: "fingerprint", key: "tenantless-publish", result: {}
    } as never), required);

    assert.equal(calls.botScenarioUpsert.length, 0);
    assert.equal(calls.proactiveRuleUpserts.length, 0);
    assert.equal(calls.proactiveDeliveryAttemptCreates.length, 0);
  });

  it("plans proactive delivery through async Prisma-backed eligibility without sync fallback reads", async () => {
    const { client } = createFakePrismaAutomationClient();
    const repository = AutomationRepository.prisma({ client });
    await repository.saveProactiveRuleAsync({
      activeVariant: "A",
      channels: ["SDK"],
      id: "rule-prisma-eligible",
      segment: "checkout",
      status: "enabled",
      tenantId: "tenant-volga"
    });
    await repository.saveProactiveExecutionWindowAsync({
      active: true,
      daysOfWeek: [5],
      endsAt: "23:59",
      ruleId: "rule-prisma-eligible",
      startsAt: "00:00",
      tenantId: "tenant-volga",
      timezone: "UTC",
      windowId: "window-prisma-eligible"
    });
    await repository.saveProactiveFrequencyCapAsync({
      active: true,
      capId: "cap-prisma-eligible",
      limit: 10,
      period: "day",
      resetAt: "2026-07-04T00:00:00.000Z",
      ruleId: "rule-prisma-eligible",
      tenantId: "tenant-volga",
      used: 0
    });
    const rules = await repository.listProactiveRulesAsync();

    const plan = await planEligibleProactiveRuleDeliveryAsync({
      activeVariants: ["A", "B"],
      channel: "SDK",
      evaluatedAt: "2026-07-03T10:00:00.000Z",
      message: "Checkout help",
      phone: "+79000000000",
      repository,
      rules,
      subjectId: "client-42",
      tenantId: "tenant-volga",
      topic: "checkout",
      traceId: "trc_prisma_proactive_plan"
    });

    const assignments = await repository.listProactiveExperimentAssignmentsAsync({
      ruleId: "rule-prisma-eligible",
      subjectId: "client-42",
      tenantId: "tenant-volga"
    });

    assert.equal(plan?.descriptor.id, "proactive_rule_prisma_eligible_tenant_volga_client_42");
    assert.equal(plan?.descriptor.payload.variant, assignments[0]?.variant);
    assert.equal(assignments.length, 1);
  });
});

function createFakePrismaAutomationClient() {
  const automationPublishIdempotencyKeys = new Map<string, FakeAutomationPublishIdempotencyKeyRow>();
  const automationBotTestRuns = new Map<string, FakeAutomationBotTestRunRow>();
  const scenarios = new Map<string, FakeBotScenarioRow>();
  const scenarioVersions = new Map<string, FakeBotScenarioVersionRow>();
  const publishAuditEvents = new Map<string, FakeBotPublishAuditEventRow>();
  const proactiveRules = new Map<string, FakeProactiveRuleRow>();
  const proactiveExecutionWindows = new Map<string, FakeProactiveExecutionWindowRow>();
  const proactiveFrequencyCaps = new Map<string, FakeProactiveFrequencyCapRow>();
  const proactiveExperimentAssignments = new Map<string, FakeProactiveExperimentAssignmentRow>();
  const proactiveDeliveryAttempts = new Map<string, FakeProactiveDeliveryAttemptRow>();
  const proactiveDeliveryIdempotencyKeys = new Map<string, FakeProactiveDeliveryIdempotencyKeyRow>();
  const proactiveDeliveryAttributions = new Map<string, FakeProactiveDeliveryAttributionRow>();
  const calls = {
    automationPublishIdempotencyKeyCreates: [] as Array<{ data: FakeAutomationPublishIdempotencyKeyRow }>,
    automationBotTestRunUpserts: [] as Array<FakeGenericUpsertInput>,
    botScenarioDeleteMany: [] as Array<{ where: Record<string, unknown> }>,
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
    }>,
    proactiveRuleUpserts: [] as Array<FakeGenericUpsertInput>,
    proactiveExecutionWindowUpserts: [] as Array<FakeGenericUpsertInput>,
    proactiveFrequencyCapUpserts: [] as Array<FakeGenericUpsertInput>,
    proactiveExperimentAssignmentCreates: [] as Array<{ data: FakeProactiveExperimentAssignmentRow }>,
    proactiveDeliveryAttemptCreates: [] as Array<{ data: FakeProactiveDeliveryAttemptRow }>,
    proactiveDeliveryIdempotencyKeyCreates: [] as Array<{ data: FakeProactiveDeliveryIdempotencyKeyRow }>,
    proactiveDeliveryAttributionCreates: [] as Array<{ data: FakeProactiveDeliveryAttributionRow }>
  };
  const client = {
    automationPublishIdempotencyKey: {
      async create(input: { data: FakeAutomationPublishIdempotencyKeyRow }): Promise<FakeAutomationPublishIdempotencyKeyRow> {
        calls.automationPublishIdempotencyKeyCreates.push(input);
        automationPublishIdempotencyKeys.set(fakeAutomationPublishMapKey(input.data.tenantId, input.data.key), clone(input.data));
        return clone(input.data);
      },
      async findMany(): Promise<FakeAutomationPublishIdempotencyKeyRow[]> {
        return Array.from(automationPublishIdempotencyKeys.values()).sort((left, right) => left.key.localeCompare(right.key)).map(clone);
      },
      async findUnique(input: { where: FakeAutomationPublishIdempotencyKeyWhereUniqueInput }): Promise<FakeAutomationPublishIdempotencyKeyRow | null> {
        const { key, tenantId } = input.where.tenantId_key;
        return clone(automationPublishIdempotencyKeys.get(fakeAutomationPublishMapKey(tenantId, key)) ?? null);
      }
    },
    automationBotTestRun: {
      async findMany(): Promise<FakeAutomationBotTestRunRow[]> {
        return Array.from(automationBotTestRuns.values()).sort((left, right) => left.testRunId.localeCompare(right.testRunId)).map(clone);
      },
      async upsert(input: FakeGenericUpsertInput): Promise<FakeAutomationBotTestRunRow> {
        calls.automationBotTestRunUpserts.push(input);
        const key = String(input.where.testRunId);
        const existing = automationBotTestRuns.get(key);
        const row = clone((existing ? { ...existing, ...input.update } : input.create) as FakeAutomationBotTestRunRow);
        automationBotTestRuns.set(key, clone(row));
        return clone(row);
      }
    },
    botScenario: {
      async deleteMany(input: { where: Record<string, unknown> }): Promise<{ count: number }> {
        calls.botScenarioDeleteMany.push(input);
        const existing = scenarios.get(String(input.where.id));
        if (!existing || existing.tenantId !== input.where.tenantId || existing.status !== input.where.status) return { count: 0 };
        scenarios.delete(existing.id);
        return { count: 1 };
      },
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
        where?: { scenarioId?: string };
      }): Promise<FakeBotScenarioVersionRow[]> {
        calls.botScenarioVersionFindMany.push(input);
        return Array.from(scenarioVersions.values())
          .filter((row) => !input.where?.scenarioId || row.scenarioId === input.where.scenarioId)
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
        where?: { scenarioId?: string };
      }): Promise<FakeBotPublishAuditEventRow[]> {
        calls.botPublishAuditEventFindMany.push(input);
        return Array.from(publishAuditEvents.values())
          .filter((row) => !input.where?.scenarioId || row.scenarioId === input.where.scenarioId)
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
    },
    proactiveRule: {
      async findMany(): Promise<FakeProactiveRuleRow[]> {
        return Array.from(proactiveRules.values()).sort((left, right) => left.id.localeCompare(right.id)).map(clone);
      },
      async upsert(input: FakeGenericUpsertInput): Promise<FakeProactiveRuleRow> {
        calls.proactiveRuleUpserts.push(input);
        const key = String(input.where.id);
        const existing = proactiveRules.get(key);
        const row = clone((existing ? { ...existing, ...input.update } : input.create) as FakeProactiveRuleRow);
        proactiveRules.set(key, clone(row));
        return clone(row);
      }
    },
    proactiveExecutionWindow: {
      async findMany(input: { where?: Partial<FakeProactiveExecutionWindowRow> } = {}): Promise<FakeProactiveExecutionWindowRow[]> {
        return filterRows(proactiveExecutionWindows, input.where, "windowId");
      },
      async upsert(input: FakeGenericUpsertInput): Promise<FakeProactiveExecutionWindowRow> {
        calls.proactiveExecutionWindowUpserts.push(input);
        const key = String(input.where.windowId);
        const existing = proactiveExecutionWindows.get(key);
        const row = clone((existing ? { ...existing, ...input.update } : input.create) as FakeProactiveExecutionWindowRow);
        proactiveExecutionWindows.set(key, clone(row));
        return clone(row);
      }
    },
    proactiveFrequencyCap: {
      async findMany(input: { where?: Partial<FakeProactiveFrequencyCapRow> } = {}): Promise<FakeProactiveFrequencyCapRow[]> {
        return filterRows(proactiveFrequencyCaps, input.where, "capId");
      },
      async upsert(input: FakeGenericUpsertInput): Promise<FakeProactiveFrequencyCapRow> {
        calls.proactiveFrequencyCapUpserts.push(input);
        const key = String(input.where.capId);
        const existing = proactiveFrequencyCaps.get(key);
        const row = clone((existing ? { ...existing, ...input.update } : input.create) as FakeProactiveFrequencyCapRow);
        proactiveFrequencyCaps.set(key, clone(row));
        return clone(row);
      }
    },
    proactiveExperimentAssignment: {
      async create(input: { data: FakeProactiveExperimentAssignmentRow }): Promise<FakeProactiveExperimentAssignmentRow> {
        calls.proactiveExperimentAssignmentCreates.push(input);
        proactiveExperimentAssignments.set(input.data.assignmentId, clone(input.data));
        return clone(input.data);
      },
      async findMany(input: { where?: Partial<FakeProactiveExperimentAssignmentRow> } = {}): Promise<FakeProactiveExperimentAssignmentRow[]> {
        return filterRows(proactiveExperimentAssignments, input.where, "assignmentId");
      },
      async findUnique(input: { where: { assignmentId: string } }): Promise<FakeProactiveExperimentAssignmentRow | null> {
        return clone(proactiveExperimentAssignments.get(input.where.assignmentId) ?? null);
      }
    },
    proactiveDeliveryAttempt: {
      async create(input: { data: FakeProactiveDeliveryAttemptRow }): Promise<FakeProactiveDeliveryAttemptRow> {
        calls.proactiveDeliveryAttemptCreates.push(input);
        proactiveDeliveryAttempts.set(input.data.attemptId, clone(input.data));
        return clone(input.data);
      },
      async findMany(input: { where?: Partial<FakeProactiveDeliveryAttemptRow> } = {}): Promise<FakeProactiveDeliveryAttemptRow[]> {
        return filterRows(proactiveDeliveryAttempts, input.where, "attemptId");
      },
      async findUnique(input: { where: { attemptId: string } }): Promise<FakeProactiveDeliveryAttemptRow | null> {
        return clone(proactiveDeliveryAttempts.get(input.where.attemptId) ?? null);
      }
    },
    proactiveDeliveryIdempotencyKey: {
      async create(input: { data: FakeProactiveDeliveryIdempotencyKeyRow }): Promise<FakeProactiveDeliveryIdempotencyKeyRow> {
        calls.proactiveDeliveryIdempotencyKeyCreates.push(input);
        proactiveDeliveryIdempotencyKeys.set(input.data.key, clone(input.data));
        return clone(input.data);
      },
      async findMany(input: { where?: Partial<FakeProactiveDeliveryIdempotencyKeyRow> } = {}): Promise<FakeProactiveDeliveryIdempotencyKeyRow[]> {
        return filterRows(proactiveDeliveryIdempotencyKeys, input.where, "key");
      },
      async findUnique(input: { where: { key: string } }): Promise<FakeProactiveDeliveryIdempotencyKeyRow | null> {
        return clone(proactiveDeliveryIdempotencyKeys.get(input.where.key) ?? null);
      }
    },
    proactiveDeliveryAttribution: {
      async create(input: { data: FakeProactiveDeliveryAttributionRow }): Promise<FakeProactiveDeliveryAttributionRow> {
        calls.proactiveDeliveryAttributionCreates.push(input);
        proactiveDeliveryAttributions.set(input.data.attributionId, clone(input.data));
        return clone(input.data);
      },
      async findMany(input: { where?: Partial<FakeProactiveDeliveryAttributionRow> } = {}): Promise<FakeProactiveDeliveryAttributionRow[]> {
        return filterRows(proactiveDeliveryAttributions, input.where, "attributionId");
      },
      async findUnique(input: { where: { attributionId: string } }): Promise<FakeProactiveDeliveryAttributionRow | null> {
        return clone(proactiveDeliveryAttributions.get(input.where.attributionId) ?? null);
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

interface FakeGenericUpsertInput {
  create: Record<string, unknown>;
  update: Record<string, unknown>;
  where: Record<string, unknown>;
}

interface FakeAutomationPublishIdempotencyKeyRow {
  fingerprint: string;
  key: string;
  result: Record<string, unknown>;
  tenantId: string;
}

interface FakeAutomationPublishIdempotencyKeyWhereUniqueInput {
  tenantId_key: {
    key: string;
    tenantId: string;
  };
}

function fakeAutomationPublishMapKey(tenantId: string, key: string): string {
  return `${tenantId}\u0000${key}`;
}

interface FakeAutomationBotTestRunRow {
  auditId: string;
  cases: Array<Record<string, unknown>>;
  queue: string;
  scenarioId: string;
  status: string;
  tenantId: string | null;
  testRunId: string;
}

interface FakeProactiveRuleRow {
  activeVariant: string | null;
  channels: string[];
  cooldown: string | null;
  id: string;
  segment: string | null;
  status: string | null;
}

interface FakeProactiveExecutionWindowRow {
  active: boolean;
  daysOfWeek: number[];
  endsAt: string;
  ruleId: string;
  startsAt: string;
  tenantId: string;
  timezone: string;
  windowId: string;
}

interface FakeProactiveFrequencyCapRow {
  active: boolean;
  capId: string;
  limit: number;
  period: string;
  resetAt: Date;
  ruleId: string;
  tenantId: string;
  used: number;
}

interface FakeProactiveExperimentAssignmentRow {
  assignedAt: Date;
  assignmentId: string;
  experimentId: string;
  ruleId: string;
  subjectId: string;
  tenantId: string;
  variant: string;
}

interface FakeProactiveDeliveryAttemptRow {
  attemptedAt: Date;
  attemptId: string;
  channel: string;
  descriptorId: string;
  ruleId: string;
  status: string;
  subjectId: string;
  tenantId: string;
  traceId: string;
}

interface FakeProactiveDeliveryIdempotencyKeyRow {
  fingerprint: string;
  key: string;
  result: Record<string, unknown>;
  ruleId: string;
  subjectId: string;
  tenantId: string;
}

interface FakeProactiveDeliveryAttributionRow {
  assignedAt: Date;
  attributionId: string;
  descriptorId: string;
  experimentId: string;
  ruleId: string;
  subjectId: string;
  tenantId: string;
  variant: string;
}

function filterRows<TRow extends Record<string, unknown>>(
  rows: Map<string, TRow>,
  where: Partial<TRow> | undefined,
  sortField: keyof TRow
): TRow[] {
  return Array.from(rows.values())
    .filter((row) => Object.entries(where ?? {}).every(([key, value]) => value === undefined || row[key] === value))
    .sort((left, right) => String(left[sortField]).localeCompare(String(right[sortField])))
    .map(clone);
}

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
