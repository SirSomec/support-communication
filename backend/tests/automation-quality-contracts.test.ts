import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  ConversationRepository,
  type ConversationOutboundDescriptor
} from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { bootstrapAutomationState } from "../apps/api-gateway/src/automation/seed.ts";
import {
  planEligibleProactiveRuleDelivery,
  persistProactiveDeliveryPlan,
  planProactiveDeliveryDescriptor
} from "../apps/api-gateway/src/automation/proactive-delivery.worker.ts";
import {
  evaluateProactiveExperimentAssignmentEligibility,
  evaluateProactiveExecutionWindowEligibility,
  evaluateProactiveFrequencyCapEligibility
} from "../apps/api-gateway/src/automation/proactive-eligibility.ts";
import {
  QUALITY_SCORING_PROVIDER_PORT_VERSION,
  normalizeQualityScoringProviderResult,
  type QualityScoringProvider,
  type QualityScoringProviderRequest
} from "../apps/api-gateway/src/quality/quality-scoring.provider.ts";
import {
  createQualityScoringProviderRequest,
  createQualityScoringRequestTelemetry,
  createQualityScoringResponseTelemetry,
  createQualityScoringResponseData
} from "../apps/api-gateway/src/quality/quality-scoring.adapter.ts";
import { createDeterministicQualityScoringProvider } from "../apps/api-gateway/src/quality/quality-scoring.deterministic-provider.ts";
import { QualityRepository } from "../apps/api-gateway/src/quality/quality.repository.ts";
import { QualityScoringRepository } from "../apps/api-gateway/src/quality/quality-scoring.repository.ts";
import { QualityService } from "../apps/api-gateway/src/quality/quality.service.ts";
import { bootstrapQualityState } from "../apps/api-gateway/src/quality/seed.ts";

describe("phase 7 automation, bot runtime, proactive and quality backend contracts", () => {
  it("loads automation fixtures only when a seed is passed explicitly", () => {
    const empty = AutomationRepository.inMemory().readState();
    const seeded = AutomationRepository.inMemory(bootstrapAutomationState()).readState();

    assert.equal(empty.botScenarios.length, 0);
    assert.equal(empty.proactiveRules.length, 0);
    assert.ok(seeded.botScenarios.length > 0);
    assert.ok(seeded.proactiveRules.length > 0);
    assert.ok(seeded.botScenarios.every((scenario) => scenario.tenantId === "tenant-demo"));
    assert.equal(seeded.botScenarios.some((scenario) => scenario.tenantId === "tenant-volga"), false);
  });

  it("returns automation workspace with bot scenarios, proactive rules and audit events", async () => {
    const automation = new AutomationService(AutomationRepository.inMemory(bootstrapAutomationState()));

    const workspace = await automation.fetchAutomationWorkspace({ tenantId: "tenant-demo" });

    assert.equal(workspace.service, "automationService");
    assert.equal(workspace.status, "ok");
    assert.equal(workspace.partial, true);
    assert.equal(workspace.meta.source, "api");
    assert.ok(workspace.data.botScenarios.some((scenario) => scenario.schemaVersion === "bot-flow/v1"));
    assert.ok(workspace.data.proactiveRules.some((rule) => Array.isArray(rule.channels)));
    assert.ok(workspace.data.auditEvents.length > 0);
    assert.ok(workspace.data.runtimeMetrics.some((metric) => metric.id === "bot-runtime"));
  });

  it("validates bot flow imports and publishes idempotent runtime versions", async () => {
    const automation = new AutomationService();

    const invalidJson = await automation.validateBotFlowImport("{not-json");
    assert.equal(invalidJson.status, "invalid");
    assert.equal(invalidJson.error?.code, "bot_flow_invalid");
    assert.ok(invalidJson.data.errors.some((error) => String(error).includes("JSON")));

    const missingPayload = await automation.validateBotFlowImport(undefined);
    assert.equal(missingPayload.status, "invalid");
    assert.equal(missingPayload.error?.code, "bot_flow_invalid");
    assert.ok(missingPayload.data.errors.some((error) => String(error).includes("payload")));

    const invalidFlow = await automation.validateBotFlowImport({
      name: "Broken",
      flowNodes: [{ id: "bad", type: "bad_type" }]
    });
    assert.equal(invalidFlow.status, "invalid");
    assert.ok(invalidFlow.data.errors.some((error) => String(error).includes("type")));

    const validFlow = await automation.validateBotFlowImport({
      name: "Checkout bot",
      flowNodes: [{ id: "start", type: "message" }],
      flowEdges: []
    });
    assert.equal(validFlow.status, "ok");
    assert.equal(validFlow.data.valid, true);
    assert.equal(validFlow.data.payload.schemaVersion, "bot-flow/v1");
    assert.ok(Array.isArray(validFlow.data.payload.triggerRules));
    assert.ok(Array.isArray(validFlow.data.payload.sourceBindings));

    const aiImport = await automation.validateBotFlowImport({
      name: "AI import",
      flowNodes: [{ id: "start", type: "message" }, { id: "answer", type: "ai_reply" }],
      flowEdges: [{ from: "start", to: "answer" }],
      sourceBindings: [],
      triggerRules: [{ id: "phrase", type: "phrase", phrases: [], matchMode: "contains" }]
    }, { tenantId: "tenant-demo" });
    assert.equal(aiImport.status, "invalid");
    assert.ok(String(aiImport.error?.message ?? "").length > 0);

    const publish = await automation.publishBotScenario({
      id: "bot-checkout",
      name: "Checkout bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message" }],
      flowEdges: [],
      idempotencyKey: "publish-bot-checkout"
    }, { tenantId: "tenant-demo" });
    assert.equal(publish.status, "ok");
    assert.equal(publish.data.scenarioId, "bot-checkout");
    assert.equal(publish.data.versionState, "published");
    assert.equal(publish.data.queue, "bot-runtime");
    assert.match(publish.data.runtimeVersion, /^runtime-bot-checkout-/);
    assert.match(publish.data.auditId, /^evt_bot_/);
    assert.equal(publish.data.handoffEvent.eventName, "bot.handoff.created");

    const duplicate = await automation.publishBotScenario({
      id: "bot-checkout",
      name: "Checkout bot",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message" }],
      flowEdges: [],
      idempotencyKey: "publish-bot-checkout"
    }, { tenantId: "tenant-demo" });
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.runtimeVersion, publish.data.runtimeVersion);

    const reusedKey = await automation.publishBotScenario({
      id: "bot-checkout",
      name: "Changed bot",
      channels: ["VK"],
      flowNodes: [{ id: "start", type: "message" }],
      flowEdges: [],
      idempotencyKey: "publish-bot-checkout"
    }, { tenantId: "tenant-demo" });
    assert.equal(reusedKey.status, "conflict");
    assert.equal(reusedKey.error?.code, "idempotency_key_reused");

    const crossTenantPublish = await automation.publishBotScenario({
      id: "bot-checkout-ladoga",
      name: "Checkout bot Ladoga",
      channels: ["SDK"],
      flowNodes: [{ id: "start", type: "message" }],
      flowEdges: [],
      idempotencyKey: "publish-bot-checkout"
    }, { tenantId: "tenant-ladoga" });
    assert.equal(crossTenantPublish.status, "ok");
    assert.equal(crossTenantPublish.data.duplicate, false);
    assert.equal(crossTenantPublish.data.tenantId, "tenant-ladoga");

    const testRun = await automation.testBotScenario({
      id: "bot-checkout",
      name: "Checkout bot",
      testCases: [{ id: "happy-path", expected: "handoff" }]
    }, { tenantId: "tenant-demo" });
    assert.equal(testRun.status, "ok");
    assert.equal(testRun.data.scenarioId, "bot-checkout");
    assert.match(testRun.data.testRunId, /^bot_test_/);
    assert.equal(testRun.data.status, "running");
    assert.equal(testRun.data.queue, "bot-runtime");
    assert.equal(testRun.data.cases.length, 1);
    assert.equal(testRun.data.tenantId, "tenant-demo");
    assert.match(testRun.data.auditId, /^evt_bot_/);
  });

  it("preserves the first durable bot publish idempotency record", () => {
    const repository = AutomationRepository.inMemory();

    const first = repository.savePublishIdempotencyKey({
      key: "publish-race",
      fingerprint: "first-fingerprint",
      result: { runtimeVersion: "runtime-first", tenantId: "tenant-demo" },
      tenantId: "tenant-demo"
    });
    const second = repository.savePublishIdempotencyKey({
      key: "publish-race",
      fingerprint: "second-fingerprint",
      result: { runtimeVersion: "runtime-second", tenantId: "tenant-demo" },
      tenantId: "tenant-demo"
    });
    const stored = repository.findPublishIdempotencyKey("tenant-demo", "publish-race");

    assert.equal(first.fingerprint, "first-fingerprint");
    assert.equal(second.fingerprint, "first-fingerprint");
    assert.equal(stored?.fingerprint, "first-fingerprint");
    assert.equal(stored?.result.runtimeVersion, "runtime-first");

    const otherTenant = repository.savePublishIdempotencyKey({
      key: "publish-race",
      fingerprint: "ladoga-fingerprint",
      result: { runtimeVersion: "runtime-ladoga", tenantId: "tenant-ladoga" },
      tenantId: "tenant-ladoga"
    });
    assert.equal(otherTenant.fingerprint, "ladoga-fingerprint");
    assert.equal(repository.findPublishIdempotencyKey("tenant-ladoga", "publish-race")?.result.runtimeVersion, "runtime-ladoga");
  });

  it("writes durable bot publish version and audit rows from publish runtime", async () => {
    const repository = AutomationRepository.inMemory();
    const automation = new AutomationService(repository);

    const publish = await automation.publishBotScenario({
      channels: ["SDK"],
      flowEdges: [{ from: "start", to: "handoff" }],
      flowNodes: [{ id: "start", type: "message" }],
      id: "bot-publish-hardening",
      idempotencyKey: "publish-hardening-key",
      name: "Publish hardening bot"
    }, { tenantId: "tenant-demo" });
    const duplicate = await automation.publishBotScenario({
      channels: ["SDK"],
      flowEdges: [{ from: "start", to: "handoff" }],
      flowNodes: [{ id: "start", type: "message" }],
      id: "bot-publish-hardening",
      idempotencyKey: "publish-hardening-key",
      name: "Publish hardening bot"
    }, { tenantId: "tenant-demo" });
    const version = await repository.findBotScenarioVersion(String(publish.data.runtimeVersion));
    const audit = await repository.findBotPublishAuditEvent(String(publish.data.auditId));
    const auditRows = await repository.listBotPublishAuditEvents("bot-publish-hardening");

    assert.equal(publish.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(version?.versionId, publish.data.runtimeVersion);
    assert.equal(version?.scenarioId, "bot-publish-hardening");
    assert.equal(version?.status, "published");
    assert.equal(audit?.action, "bot.publish");
    assert.equal(audit?.auditId, publish.data.auditId);
    assert.equal(audit?.idempotencyKey, "bot-publish:tenant-demo:publish-hardening-key");
    assert.equal(audit?.immutable, true);
    assert.equal(audit?.runtimeVersion, publish.data.runtimeVersion);
    assert.equal(audit?.tenantId, "tenant-demo");
    assert.deepEqual(auditRows.map((row) => row.auditId), [publish.data.auditId]);
  });

  it("exposes durable bot scenario versions and publish audit rows in automation workspace", async () => {
    const repository = AutomationRepository.inMemory();
    const automation = new AutomationService(repository);

    const publish = await automation.publishBotScenario({
      channels: ["SDK"],
      flowEdges: [{ from: "start", to: "handoff" }],
      flowNodes: [{ id: "start", type: "message" }],
      id: "bot-version-visible",
      idempotencyKey: "version-visible-key",
      name: "Version visible bot"
    }, { tenantId: "tenant-demo" });
    const workspace = await automation.fetchAutomationWorkspace({ tenantId: "tenant-demo" });
    const versions = workspace.data.botScenarioVersions as Array<Record<string, unknown>>;
    const auditRows = workspace.data.auditEvents as Array<Record<string, unknown>>;

    assert.equal(workspace.status, "ok");
    assert.ok(versions.some((version) =>
      version.scenarioId === "bot-version-visible"
        && version.versionId === publish.data.runtimeVersion
        && version.status === "published"
        && version.tenantId === "tenant-demo"
    ));
    assert.ok(auditRows.some((event) =>
      event.auditId === publish.data.auditId
        && event.runtimeVersion === publish.data.runtimeVersion
        && event.immutable === true
    ));
  });

  it("persists bot scenario definitions through repository lookup without shared mutable references", () => {
    const repository = AutomationRepository.inMemory();
    const scenario = {
      channels: ["SDK"],
      flowEdges: [{ from: "start", label: "ok", to: "handoff" }],
      flowNodes: [
        { id: "start", title: "Start", type: "message" },
        { id: "handoff", title: "Handoff", type: "handoff" }
      ],
      id: "bot-scenario-contract",
      name: "Scenario contract bot",
      schemaVersion: "bot-flow/v1" as const,
      status: "draft",
      tenantId: "tenant-demo"
    };

    const saved = repository.saveBotScenario(scenario);
    scenario.flowNodes[0].title = "Mutated after save";
    const found = repository.findBotScenario("bot-scenario-contract");
    const missing = repository.findBotScenario("missing-bot");
    const foundTitleBeforeLookupMutation = found?.flowNodes[0].title;
    found!.flowNodes[0].title = "Mutated after lookup";
    const foundAgain = repository.findBotScenario("bot-scenario-contract");
    const updated = repository.saveBotScenario({
      ...saved,
      channels: ["SDK", "Telegram"],
      status: "published"
    });
    const scenarios = repository.listBotScenarios();

    assert.equal(saved.id, "bot-scenario-contract");
    assert.equal(found?.name, "Scenario contract bot");
    assert.equal(foundTitleBeforeLookupMutation, "Start");
    assert.equal(foundAgain?.flowNodes[0].title, "Start");
    assert.equal(missing, undefined);
    assert.equal(updated.status, "published");
    assert.deepEqual(updated.channels, ["SDK", "Telegram"]);
    assert.equal(scenarios.filter((item) => item.id === "bot-scenario-contract").length, 1);
    assert.equal(repository.findBotScenario("bot-scenario-contract")?.status, "published");
  });

  it("persists bot scenario versions as immutable repository records", () => {
    const repository = AutomationRepository.inMemory();
    const version = {
      createdAt: "2026-06-30T15:10:00.000Z",
      flowEdges: [{ from: "start", to: "handoff" }],
      flowNodes: [
        { id: "start", title: "Start", type: "message" },
        { id: "handoff", title: "Handoff", type: "handoff" }
      ],
      scenarioId: "bot-version-contract",
      status: "draft",
      tenantId: "tenant-demo",
      versionId: "bot-version-contract-v1"
    };

    const saved = repository.saveBotScenarioVersion(version);
    version.flowNodes[0].title = "Mutated after save";
    const duplicate = repository.saveBotScenarioVersion({
      ...version,
      status: "published",
      versionId: "bot-version-contract-v1"
    });
    const second = repository.saveBotScenarioVersion({
      ...version,
      createdAt: "2026-06-30T15:11:00.000Z",
      status: "published",
      versionId: "bot-version-contract-v2"
    });
    const found = repository.findBotScenarioVersion("bot-version-contract-v1");
    const missing = repository.findBotScenarioVersion("missing-version");
    const versions = repository.listBotScenarioVersions("bot-version-contract");
    const otherScenarioVersions = repository.listBotScenarioVersions("other-bot");
    const foundTitleBeforeLookupMutation = found?.flowNodes[0].title;
    found!.flowNodes[0].title = "Mutated after lookup";
    const foundAgain = repository.findBotScenarioVersion("bot-version-contract-v1");

    assert.equal(saved.versionId, "bot-version-contract-v1");
    assert.equal(duplicate.status, "draft");
    assert.equal(second.versionId, "bot-version-contract-v2");
    assert.equal(foundTitleBeforeLookupMutation, "Start");
    assert.equal(foundAgain?.flowNodes[0].title, "Start");
    assert.equal(missing, undefined);
    assert.deepEqual(versions.map((item) => item.versionId), ["bot-version-contract-v1", "bot-version-contract-v2"]);
    assert.equal(otherScenarioVersions.length, 0);
  });

  it("persists immutable bot publish audit rows without mutable payload references", () => {
    const repository = AutomationRepository.inMemory();
    const auditEvent = {
      action: "bot.publish",
      actor: "automation-admin",
      auditId: "evt_bot_publish_contract_001",
      createdAt: "2026-06-30T15:20:00.000Z",
      immutable: true as const,
      idempotencyKey: "publish-audit-contract",
      runtimeVersion: "runtime-bot-audit-v1",
      scenarioId: "bot-publish-audit-contract",
      tenantId: "tenant-demo",
      versionId: "bot-publish-audit-contract-v1"
    };

    const saved = repository.saveBotPublishAuditEvent(auditEvent);
    auditEvent.runtimeVersion = "runtime-mutated-after-save";
    const duplicate = repository.saveBotPublishAuditEvent({
      ...auditEvent,
      actor: "changed-admin",
      auditId: "evt_bot_publish_contract_001",
      runtimeVersion: "runtime-duplicate"
    });
    const otherScenario = repository.saveBotPublishAuditEvent({
      ...auditEvent,
      auditId: "evt_bot_publish_contract_002",
      idempotencyKey: "publish-audit-contract-other",
      runtimeVersion: "runtime-other-scenario",
      scenarioId: "other-bot"
    });
    const duplicateKey = repository.saveBotPublishAuditEvent({
      ...auditEvent,
      auditId: "evt_bot_publish_contract_003",
      idempotencyKey: "publish-audit-contract",
      runtimeVersion: "runtime-duplicate-key"
    });
    const found = repository.findBotPublishAuditEvent("evt_bot_publish_contract_001");
    const missing = repository.findBotPublishAuditEvent("missing-audit");
    const events = repository.listBotPublishAuditEvents("bot-publish-audit-contract");
    const foundRuntimeVersionBeforeLookupMutation = found?.runtimeVersion;
    found!.runtimeVersion = "runtime-mutated-after-lookup";
    const foundAgain = repository.findBotPublishAuditEvent("evt_bot_publish_contract_001");

    assert.equal(saved.auditId, "evt_bot_publish_contract_001");
    assert.equal(saved.runtimeVersion, "runtime-bot-audit-v1");
    assert.equal(duplicate.actor, "automation-admin");
    assert.equal(duplicate.runtimeVersion, "runtime-bot-audit-v1");
    assert.equal(otherScenario.scenarioId, "other-bot");
    assert.equal(duplicateKey.auditId, "evt_bot_publish_contract_001");
    assert.equal(duplicateKey.runtimeVersion, "runtime-bot-audit-v1");
    assert.equal(foundRuntimeVersionBeforeLookupMutation, "runtime-bot-audit-v1");
    assert.equal(foundAgain?.runtimeVersion, "runtime-bot-audit-v1");
    assert.equal(missing, undefined);
    assert.deepEqual(events.map((item) => item.auditId), ["evt_bot_publish_contract_001"]);
  });

  it("persists proactive delivery rules and creates bot handoff summary events", async () => {
    const automation = new AutomationService();

    const invalidRule = await automation.saveProactiveRule({
      id: "rule-empty",
      channels: []
    });
    assert.equal(invalidRule.status, "invalid");
    assert.equal(invalidRule.error?.code, "proactive_channels_required");

    const malformedRule = await automation.saveProactiveRule(null);
    assert.equal(malformedRule.status, "invalid");
    assert.equal(malformedRule.error?.code, "proactive_rule_id_required");

    const rule = await automation.saveProactiveRule({
      id: "rule-checkout",
      channels: ["SDK", "Telegram"],
      activeVariant: "B",
      cooldown: "24h",
      segment: "checkout"
    }, { tenantId: "tenant-demo" });
    assert.equal(rule.status, "ok");
    assert.match(rule.data.frequencyCap.id, /^cap_rule-checkout_/);
    assert.match(rule.data.experiment.id, /^exp_rule-checkout_/);
    assert.equal(rule.data.experiment.persisted, true);
    assert.deepEqual(rule.data.targeting.channels, ["SDK", "Telegram"]);
    assert.equal(rule.data.targeting.privacyChecked, true);
    assert.equal(rule.data.queue, "proactive-delivery");
    assert.match(rule.data.auditId, /^evt_proactive_/);

    const handoff = await automation.createBotHandoffSummary({
      botId: "bot-checkout",
      conversationId: "conv-42",
      reason: "customer_requested_operator",
      collectedFields: { cardNumber: "4111111111111111", orderId: "A-42", phone: "+7 999 204-18-44" },
      queue: "Delivery",
      tenantId: "tenant-demo"
    });
    assert.equal(handoff.status, "ok");
    assert.equal(handoff.data.eventName, "bot.handoff.created");
    assert.equal(handoff.data.resourceId, "conv-42");
    assert.equal(handoff.data.summary.reason, "customer_requested_operator");
    assert.equal(handoff.data.summary.collectedFields.orderId, "A-42");
    assert.equal(handoff.data.summary.collectedFields.phone.includes("204-18-44"), false);
    assert.equal(handoff.data.summary.collectedFields.cardNumber, "****");
    assert.equal(JSON.stringify(handoff.data.realtimeEvent.data).includes("204-18-44"), false);
    assert.match(handoff.data.realtimeEvent.eventId, /^evt_bot_handoff_/);
    assert.equal(handoff.data.realtimeEvent.schemaVersion, "bot-handoff/v1");
    assert.equal(handoff.data.realtimeEvent.tenantId, "tenant-demo");
    assert.match(handoff.data.realtimeEvent.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(handoff.data.realtimeEvent.traceId, /^trc_|^req_|^test-/);
    assert.match(handoff.data.auditId, /^evt_bot_/);
  });

  it("persists proactive execution windows as tenant-scoped rule records without shared mutable references", () => {
    const repository = AutomationRepository.inMemory();

    const saved = repository.saveProactiveExecutionWindow({
      active: true,
      daysOfWeek: [1, 2, 3, 4, 5],
      endsAt: "18:00",
      ruleId: "rule-checkout",
      startsAt: "09:00",
      tenantId: "tenant-demo",
      timezone: "Europe/Moscow",
      windowId: "win-rule-checkout-business-hours"
    });
    const updated = repository.saveProactiveExecutionWindow({
      ...saved,
      daysOfWeek: [1, 2, 3, 4],
      startsAt: "10:00"
    });
    saved.daysOfWeek.push(6);
    updated.daysOfWeek.push(7);

    const tenantWindows = repository.listProactiveExecutionWindows({ tenantId: "tenant-demo" });
    tenantWindows[0].daysOfWeek.push(0);
    const ruleWindows = repository.listProactiveExecutionWindows({
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const otherTenantWindows = repository.listProactiveExecutionWindows({ tenantId: "tenant-other" });

    assert.equal(tenantWindows.length, 1);
    assert.equal(ruleWindows.length, 1);
    assert.equal(otherTenantWindows.length, 0);
    assert.equal(ruleWindows[0].windowId, "win-rule-checkout-business-hours");
    assert.equal(ruleWindows[0].ruleId, "rule-checkout");
    assert.equal(ruleWindows[0].tenantId, "tenant-demo");
    assert.equal(ruleWindows[0].timezone, "Europe/Moscow");
    assert.equal(ruleWindows[0].startsAt, "10:00");
    assert.equal(ruleWindows[0].endsAt, "18:00");
    assert.equal(ruleWindows[0].active, true);
    assert.deepEqual(ruleWindows[0].daysOfWeek, [1, 2, 3, 4]);

    assert.throws(() => repository.saveProactiveExecutionWindow({
      active: false,
      daysOfWeek: [6, 0],
      endsAt: "21:00",
      ruleId: "rule-weekend",
      startsAt: "12:00",
      timezone: "Europe/Moscow",
      windowId: "win-rule-weekend"
    }), /automation_tenant_required/);
  });

  it("persists proactive frequency caps as tenant-scoped rule records without shared mutable references", () => {
    const repository = AutomationRepository.inMemory();

    const saved = repository.saveProactiveFrequencyCap({
      active: true,
      capId: "cap-rule-checkout-daily",
      limit: 3,
      period: "day",
      resetAt: "2026-07-01T00:00:00.000Z",
      ruleId: "rule-checkout",
      tenantId: "tenant-demo",
      used: 1
    });
    const updated = repository.saveProactiveFrequencyCap({
      ...saved,
      limit: 4,
      used: 2
    });
    saved.limit = 99;
    updated.used = 99;

    const tenantCaps = repository.listProactiveFrequencyCaps({ tenantId: "tenant-demo" });
    tenantCaps[0].used = 42;
    const ruleCaps = repository.listProactiveFrequencyCaps({
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const otherTenantCaps = repository.listProactiveFrequencyCaps({ tenantId: "tenant-other" });
    assert.throws(() => repository.saveProactiveFrequencyCap({
      active: false,
      capId: "cap-rule-weekend-hourly",
      limit: 1,
      period: "hour",
      resetAt: "2026-06-30T20:00:00.000Z",
      ruleId: "rule-weekend",
      used: 0
    }), /automation_tenant_required/);

    assert.equal(tenantCaps.length, 1);
    assert.equal(ruleCaps.length, 1);
    assert.equal(otherTenantCaps.length, 0);
    assert.equal(ruleCaps[0].capId, "cap-rule-checkout-daily");
    assert.equal(ruleCaps[0].ruleId, "rule-checkout");
    assert.equal(ruleCaps[0].tenantId, "tenant-demo");
    assert.equal(ruleCaps[0].period, "day");
    assert.equal(ruleCaps[0].limit, 4);
    assert.equal(ruleCaps[0].used, 2);
    assert.equal(ruleCaps[0].resetAt, "2026-07-01T00:00:00.000Z");
    assert.equal(ruleCaps[0].active, true);
  });

  it("persists proactive experiment assignments as tenant-scoped rule records without shared mutable references", () => {
    const repository = AutomationRepository.inMemory();

    const saved = repository.saveProactiveExperimentAssignment({
      assignedAt: "2026-06-30T19:30:00.000Z",
      assignmentId: "exp-rule-checkout-client-42",
      experimentId: "exp-rule-checkout",
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo",
      variant: "B"
    });
    const updated = repository.saveProactiveExperimentAssignment({
      ...saved,
      assignedAt: "2026-06-30T19:31:00.000Z",
      variant: "A"
    });
    assert.equal(updated.variant, "B");
    assert.equal(updated.assignedAt, "2026-06-30T19:30:00.000Z");
    saved.variant = "Z";
    updated.variant = "Z";

    const tenantAssignments = repository.listProactiveExperimentAssignments({ tenantId: "tenant-demo" });
    tenantAssignments[0].variant = "Z";
    const ruleAssignments = repository.listProactiveExperimentAssignments({
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const subjectAssignments = repository.listProactiveExperimentAssignments({
      subjectId: "client-42",
      tenantId: "tenant-demo"
    });
    const otherTenantAssignments = repository.listProactiveExperimentAssignments({ tenantId: "tenant-other" });
    assert.throws(() => repository.saveProactiveExperimentAssignment({
      assignedAt: "2026-06-30T19:32:00.000Z",
      assignmentId: "exp-rule-weekend-client-99",
      experimentId: "exp-rule-weekend",
      ruleId: "rule-weekend",
      subjectId: "client-99",
      variant: "holdout"
    }), /automation_tenant_required/);

    assert.equal(tenantAssignments.length, 1);
    assert.equal(ruleAssignments.length, 1);
    assert.equal(subjectAssignments.length, 1);
    assert.equal(otherTenantAssignments.length, 0);
    assert.equal(ruleAssignments[0].assignmentId, "exp-rule-checkout-client-42");
    assert.equal(ruleAssignments[0].experimentId, "exp-rule-checkout");
    assert.equal(ruleAssignments[0].ruleId, "rule-checkout");
    assert.equal(ruleAssignments[0].subjectId, "client-42");
    assert.equal(ruleAssignments[0].tenantId, "tenant-demo");
    assert.equal(ruleAssignments[0].variant, "B");
    assert.equal(ruleAssignments[0].assignedAt, "2026-06-30T19:30:00.000Z");
  });

  it("rejects every persisted automation record that has no tenant", () => {
    const repository = AutomationRepository.inMemory();
    const required = /automation_tenant_required/;

    assert.throws(() => repository.saveBotScenario({
      channels: ["SDK"], flowEdges: [], flowNodes: [], id: "missing-tenant-scenario",
      name: "Missing tenant", schemaVersion: "bot-flow/v1", status: "draft"
    } as never), required);
    assert.throws(() => repository.saveBotScenarioVersion({
      createdAt: "2026-07-10T00:00:00.000Z", flowEdges: [], flowNodes: [],
      scenarioId: "missing-tenant-scenario", status: "draft", versionId: "missing-tenant-version"
    } as never), required);
    assert.throws(() => repository.saveBotPublishAuditEvent({
      action: "bot.publish", actor: "tester", auditId: "missing-tenant-audit",
      createdAt: "2026-07-10T00:00:00.000Z", idempotencyKey: "missing-tenant-audit-key",
      immutable: true, runtimeVersion: "runtime-v1", scenarioId: "missing-tenant-scenario", versionId: "v1"
    } as never), required);
    assert.throws(() => repository.saveBotTestRun({
      auditId: "missing-tenant-test-audit", cases: [], queue: "bot-runtime",
      scenarioId: "missing-tenant-scenario", status: "running", testRunId: "missing-tenant-test"
    } as never), required);
    assert.throws(() => repository.saveProactiveRule({
      channels: ["SDK"], id: "missing-tenant-rule", status: "enabled"
    } as never), required);
    assert.throws(() => repository.saveProactiveDeliveryAttempt({
      attemptedAt: "2026-07-10T00:00:00.000Z", attemptId: "missing-tenant-attempt", channel: "SDK",
      descriptorId: "descriptor", ruleId: "rule", status: "queued", subjectId: "subject", traceId: "trace"
    }), required);
    assert.throws(() => repository.saveProactiveDeliveryIdempotencyKey({
      fingerprint: "fingerprint", key: "missing-tenant-key", result: {}, ruleId: "rule", subjectId: "subject"
    }), required);
    assert.throws(() => repository.saveProactiveDeliveryAttribution({
      assignedAt: "2026-07-10T00:00:00.000Z", attributionId: "missing-tenant-attribution",
      descriptorId: "descriptor", experimentId: "experiment", ruleId: "rule", subjectId: "subject", variant: "A"
    }), required);
    assert.throws(() => repository.savePublishIdempotencyKey({
      fingerprint: "fingerprint", key: "missing-tenant-publish", result: {}
    } as never), required);
    assert.throws(() => AutomationRepository.inMemory({
      ...repository.readState(),
      workspaceAuditEvents: [{ id: "missing-tenant-workspace-audit" }]
    }).readState(), required);
  });

  it("evaluates proactive execution windows from tenant-scoped active windows using replay time", () => {
    const repository = AutomationRepository.inMemory();
    repository.saveProactiveExecutionWindow({
      active: true,
      daysOfWeek: [1, 2, 3, 4, 5],
      endsAt: "18:00",
      ruleId: "rule-checkout",
      startsAt: "09:00",
      tenantId: "tenant-demo",
      timezone: "Europe/Moscow",
      windowId: "win-checkout-business"
    });
    repository.saveProactiveExecutionWindow({
      active: false,
      daysOfWeek: [2],
      endsAt: "23:59",
      ruleId: "rule-checkout",
      startsAt: "00:00",
      tenantId: "tenant-demo",
      timezone: "Europe/Moscow",
      windowId: "win-checkout-inactive"
    });
    repository.saveProactiveExecutionWindow({
      active: true,
      daysOfWeek: [2],
      endsAt: "23:59",
      ruleId: "rule-checkout",
      startsAt: "00:00",
      tenantId: "tenant-other",
      timezone: "Europe/Moscow",
      windowId: "win-other-tenant"
    });

    const inside = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const replay = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const outside = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: "2026-06-30T19:30:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const noWindows = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      repository,
      ruleId: "rule-without-window",
      tenantId: "tenant-demo"
    });

    assert.equal(inside.eligible, true);
    assert.deepEqual(inside.matchedWindowIds, ["win-checkout-business"]);
    assert.deepEqual(inside.consideredWindowIds, ["win-checkout-business"]);
    assert.equal(inside.reason, "execution_window_matched");
    assert.deepEqual(replay, inside);
    assert.equal(outside.eligible, false);
    assert.equal(outside.reason, "outside_execution_window");
    assert.deepEqual(outside.consideredWindowIds, ["win-checkout-business"]);
    assert.equal(noWindows.eligible, true);
    assert.equal(noWindows.reason, "execution_window_not_configured");
  });

  it("evaluates overnight proactive execution windows against the window start weekday", () => {
    const repository = AutomationRepository.inMemory();
    repository.saveProactiveExecutionWindow({
      active: true,
      daysOfWeek: [1],
      endsAt: "06:00",
      ruleId: "rule-night",
      startsAt: "22:00",
      tenantId: "tenant-demo",
      timezone: "Europe/Moscow",
      windowId: "win-night-monday"
    });

    const earlyTuesday = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: "2026-06-29T22:00:00.000Z",
      repository,
      ruleId: "rule-night",
      tenantId: "tenant-demo"
    });
    const lateTuesday = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: "2026-06-30T19:00:00.000Z",
      repository,
      ruleId: "rule-night",
      tenantId: "tenant-demo"
    });

    assert.equal(earlyTuesday.eligible, true);
    assert.deepEqual(earlyTuesday.matchedWindowIds, ["win-night-monday"]);
    assert.equal(lateTuesday.eligible, false);
    assert.equal(lateTuesday.reason, "outside_execution_window");
  });

  it("evaluates proactive frequency caps from tenant-scoped active caps using replay time", () => {
    const repository = AutomationRepository.inMemory();
    repository.saveProactiveFrequencyCap({
      active: true,
      capId: "cap-rule-checkout-daily",
      limit: 3,
      period: "day",
      resetAt: "2026-07-01T00:00:00.000Z",
      ruleId: "rule-checkout",
      tenantId: "tenant-demo",
      used: 2
    });
    repository.saveProactiveFrequencyCap({
      active: false,
      capId: "cap-rule-checkout-inactive",
      limit: 0,
      period: "day",
      resetAt: "2026-07-01T00:00:00.000Z",
      ruleId: "rule-checkout",
      tenantId: "tenant-demo",
      used: 99
    });
    repository.saveProactiveFrequencyCap({
      active: true,
      capId: "cap-rule-checkout-other-tenant",
      limit: 0,
      period: "day",
      resetAt: "2026-07-01T00:00:00.000Z",
      ruleId: "rule-checkout",
      tenantId: "tenant-other",
      used: 0
    });

    const available = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: "2026-06-30T12:00:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const replay = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: "2026-06-30T12:00:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    repository.saveProactiveFrequencyCap({
      active: true,
      capId: "cap-rule-checkout-daily",
      limit: 3,
      period: "day",
      resetAt: "2026-07-01T00:00:00.000Z",
      ruleId: "rule-checkout",
      tenantId: "tenant-demo",
      used: 3
    });
    const exhausted = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: "2026-06-30T12:00:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const resetReached = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: "2026-07-01T00:00:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const noCaps = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: "2026-06-30T12:00:00.000Z",
      repository,
      ruleId: "rule-without-cap",
      tenantId: "tenant-demo"
    });

    assert.equal(available.eligible, true);
    assert.deepEqual(available.consideredCapIds, ["cap-rule-checkout-daily"]);
    assert.deepEqual(available.exhaustedCapIds, []);
    assert.equal(available.reason, "frequency_cap_available");
    assert.deepEqual(replay, available);
    assert.equal(exhausted.eligible, false);
    assert.deepEqual(exhausted.exhaustedCapIds, ["cap-rule-checkout-daily"]);
    assert.equal(exhausted.reason, "frequency_cap_exhausted");
    assert.equal(resetReached.eligible, true);
    assert.equal(resetReached.reason, "frequency_cap_reset_reached");
    assert.equal(noCaps.eligible, true);
    assert.equal(noCaps.reason, "frequency_cap_not_configured");
  });

  it("assigns proactive experiment variants once per tenant rule and subject using replay time", () => {
    const repository = AutomationRepository.inMemory();

    const first = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: "2026-06-30T12:00:00.000Z",
      experimentId: "exp-rule-checkout",
      repository,
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo",
      variants: ["A", "B"]
    });
    const replay = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: "2026-06-30T12:05:00.000Z",
      experimentId: "exp-rule-checkout",
      repository,
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo",
      variants: ["holdout", "changed"]
    });
    const otherTenant = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: "2026-06-30T12:10:00.000Z",
      experimentId: "exp-rule-checkout",
      repository,
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-other",
      variants: ["A", "B"]
    });
    const invalid = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: "not-iso",
      experimentId: "exp-rule-checkout",
      repository,
      ruleId: "rule-checkout",
      subjectId: "client-99",
      tenantId: "tenant-demo",
      variants: ["A", "B"]
    });
    const stored = repository.listProactiveExperimentAssignments({
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo"
    });

    assert.equal(first.eligible, true);
    assert.equal(first.reason, "experiment_assigned");
    assert.equal(first.assignment.assignmentId, "exp-rule-checkout:tenant-demo:rule-checkout:client-42");
    assert.equal(first.assignment.assignedAt, "2026-06-30T12:00:00.000Z");
    assert.ok(["A", "B"].includes(first.assignment.variant));
    assert.equal(replay.reason, "experiment_assignment_replayed");
    assert.deepEqual(replay.assignment, first.assignment);
    assert.equal(otherTenant.assignment.tenantId, "tenant-other");
    assert.notEqual(otherTenant.assignment.assignmentId, first.assignment.assignmentId);
    assert.equal(invalid.eligible, false);
    assert.equal(invalid.reason, "experiment_assignment_invalid_time");
    assert.equal(stored.length, 1);
    assert.deepEqual(stored[0], first.assignment);
  });

  it("fails proactive eligibility closed when tenant targeting is missing or mismatched", () => {
    const repository = AutomationRepository.inMemory();
    repository.saveProactiveExecutionWindow({
      active: true,
      daysOfWeek: [2],
      endsAt: "18:00",
      ruleId: "rule-checkout",
      startsAt: "09:00",
      tenantId: "tenant-demo",
      timezone: "Europe/Moscow",
      windowId: "win-tenant-demo"
    });
    repository.saveProactiveFrequencyCap({
      active: true,
      capId: "cap-tenant-demo",
      limit: 1,
      period: "day",
      resetAt: "2026-07-01T00:00:00.000Z",
      ruleId: "rule-checkout",
      tenantId: "tenant-demo",
      used: 0
    });

    const missingWindowTenant = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: ""
    });
    const mismatchedWindowTenant = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-other"
    });
    const missingCapTenant = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: ""
    });
    const mismatchedCapTenant = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-other"
    });
    const missingExperimentTenant = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: "2026-06-30T08:30:00.000Z",
      experimentId: "exp-rule-checkout",
      repository,
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "",
      variants: ["A", "B"]
    });

    assert.equal(missingWindowTenant.eligible, false);
    assert.equal(missingWindowTenant.reason, "tenant_targeting_invalid");
    assert.equal(mismatchedWindowTenant.eligible, false);
    assert.equal(mismatchedWindowTenant.reason, "tenant_targeting_mismatch");
    assert.equal(missingCapTenant.eligible, false);
    assert.equal(missingCapTenant.reason, "tenant_targeting_invalid");
    assert.equal(mismatchedCapTenant.eligible, false);
    assert.equal(mismatchedCapTenant.reason, "tenant_targeting_mismatch");
    assert.equal(missingExperimentTenant.eligible, false);
    assert.equal(missingExperimentTenant.reason, "tenant_targeting_invalid");
  });

  it("fails proactive experiment assignment closed when client targeting is missing", () => {
    const repository = AutomationRepository.inMemory();

    const missingSubject = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: "2026-06-30T08:30:00.000Z",
      experimentId: "exp-rule-checkout",
      repository,
      ruleId: "rule-checkout",
      subjectId: "",
      tenantId: "tenant-demo",
      variants: ["A", "B"]
    });
    const firstClient = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: "2026-06-30T08:31:00.000Z",
      experimentId: "exp-rule-checkout",
      repository,
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo",
      variants: ["A", "B"]
    });
    const secondClient = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: "2026-06-30T08:31:00.000Z",
      experimentId: "exp-rule-checkout",
      repository,
      ruleId: "rule-checkout",
      subjectId: "client-43",
      tenantId: "tenant-demo",
      variants: ["A", "B"]
    });

    assert.equal(missingSubject.eligible, false);
    assert.equal(missingSubject.reason, "client_targeting_invalid");
    assert.equal(firstClient.eligible, true);
    assert.equal(secondClient.eligible, true);
    assert.notEqual(firstClient.assignment?.assignmentId, secondClient.assignment?.assignmentId);
    assert.equal(repository.listProactiveExperimentAssignments({ ruleId: "rule-checkout", tenantId: "tenant-demo" }).length, 2);
  });

  it("fails proactive frequency cap eligibility closed when exhausted cap reset time is malformed", () => {
    const repository = AutomationRepository.inMemory();
    repository.saveProactiveFrequencyCap({
      active: true,
      capId: "cap-rule-checkout-malformed-reset",
      limit: 1,
      period: "day",
      resetAt: "tomorrow",
      ruleId: "rule-checkout",
      tenantId: "tenant-demo",
      used: 1
    });

    const result = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      repository,
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });

    assert.equal(result.eligible, false);
    assert.equal(result.reason, "frequency_cap_reset_invalid");
    assert.deepEqual(result.exhaustedCapIds, ["cap-rule-checkout-malformed-reset"]);
  });

  it("plans an eligible proactive rule as one outbound conversation descriptor", () => {
    const planned = planProactiveDeliveryDescriptor({
      channel: "Telegram",
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      message: "Your order can be delivered today. Reply if you want us to reserve the slot.",
      phone: "+7 900 000-00-00",
      rule: {
        activeVariant: "B",
        channels: ["SDK", "Telegram"],
        id: "rule-checkout",
        segment: "checkout",
        status: "enabled"
      },
      subjectId: "client-42",
      tenantId: "tenant-demo",
      topic: "Delivery / Proactive",
      traceId: "trc_proactive_delivery_contract"
    });
    const descriptor = planned.descriptor as ConversationOutboundDescriptor;

    assert.equal(planned.status, "planned");
    assert.equal(planned.ruleId, "rule-checkout");
    assert.equal(descriptor.id, "proactive_rule_checkout_tenant_demo_client_42");
    assert.equal(descriptor.kind, "outbound_conversation");
    assert.equal(descriptor.channel, "Telegram");
    assert.equal(descriptor.conversationId, null);
    assert.equal(descriptor.deliveryState, "queued");
    assert.equal(descriptor.idempotencyKey, "proactive-delivery:tenant-demo:rule-checkout:client-42");
    assert.equal(descriptor.messageId, null);
    assert.equal(descriptor.outboxEventId, planned.outbox.id);
    assert.equal(descriptor.payload.message, "Your order can be delivered today. Reply if you want us to reserve the slot.");
    assert.equal(descriptor.payload.phone, "+7 900 000-00-00");
    assert.equal(descriptor.payload.proactiveRuleId, "rule-checkout");
    assert.equal(descriptor.payload.segment, "checkout");
    assert.equal(descriptor.payload.variant, "B");
    assert.equal(descriptor.payload.queue, "message-delivery");
    assert.equal(descriptor.requestFingerprint, planned.requestFingerprint);
    assert.equal(descriptor.retryable, true);
    assert.equal(descriptor.status, "queued");
    assert.equal(descriptor.tenantId, "tenant-demo");
    assert.equal(descriptor.traceId, "trc_proactive_delivery_contract");
    assert.equal(planned.outbox.aggregateId, descriptor.id);
    assert.equal(planned.outbox.aggregateType, "conversation_outbound");
    assert.equal(planned.outbox.payload.descriptorId, descriptor.id);
    assert.equal(planned.outbox.payload.idempotencyKey, descriptor.idempotencyKey);
    assert.equal(planned.outbox.queue, "message-delivery");
    assert.equal(planned.outbox.status, "pending");
    assert.equal(planned.outbox.traceId, descriptor.traceId);
    assert.equal(planned.outbox.type, "conversation.outbound.requested");
  });

  it("selects one enabled eligible proactive rule execution for delivery", () => {
    const repository = AutomationRepository.inMemory();
    repository.saveProactiveExecutionWindow({
      active: true,
      daysOfWeek: [2],
      endsAt: "18:00",
      ruleId: "rule-eligible",
      startsAt: "09:00",
      tenantId: "tenant-demo",
      timezone: "Europe/Moscow",
      windowId: "win-rule-eligible"
    });
    repository.saveProactiveFrequencyCap({
      active: true,
      capId: "cap-rule-eligible",
      limit: 2,
      period: "day",
      resetAt: "2026-07-01T00:00:00.000Z",
      ruleId: "rule-eligible",
      tenantId: "tenant-demo",
      used: 0
    });

    const planned = planEligibleProactiveRuleDelivery({
      activeVariants: ["A", "B"],
      channel: "Telegram",
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      message: "Delivery slot is open today.",
      phone: "+7 900 000-00-00",
      repository,
      rules: [
        { channels: ["Telegram"], id: "rule-paused", segment: "checkout", status: "paused" },
        { channels: ["VK"], id: "rule-wrong-channel", segment: "checkout", status: "enabled" },
        { activeVariant: "B", channels: ["Telegram"], id: "rule-eligible", segment: "checkout", status: "enabled" },
        { channels: ["Telegram"], id: "rule-later", segment: "checkout", status: "enabled" }
      ],
      subjectId: "client-42",
      tenantId: "tenant-demo",
      topic: "Delivery / Proactive",
      traceId: "trc_proactive_delivery_select"
    });

    assert.equal(planned?.status, "planned");
    assert.equal(planned?.ruleId, "rule-eligible");
    assert.equal(planned?.descriptor.id, "proactive_rule_eligible_tenant_demo_client_42");
    assert.equal(planned?.descriptor.payload.proactiveRuleId, "rule-eligible");
    assert.equal(planned?.descriptor.payload.variant, "B");
    assert.equal(planned?.outbox.payload.descriptorId, planned?.descriptor.id);
  });

  it("does not treat proactive rules with missing status as enabled worker candidates", () => {
    const repository = AutomationRepository.inMemory();

    const planned = planEligibleProactiveRuleDelivery({
      activeVariants: ["A", "B"],
      channel: "Telegram",
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      message: "Delivery slot is open today.",
      phone: "+7 900 000-00-00",
      repository,
      rules: [
        { channels: ["Telegram"], id: "rule-missing-status", segment: "checkout" },
        { channels: ["Telegram"], id: "rule-enabled", segment: "checkout", status: "enabled" }
      ],
      subjectId: "client-42",
      tenantId: "tenant-demo",
      topic: "Delivery / Proactive",
      traceId: "trc_proactive_delivery_missing_status"
    });

    assert.equal(planned?.ruleId, "rule-enabled");
    assert.equal(planned?.descriptor.payload.proactiveRuleId, "rule-enabled");
  });

  it("persists a proactive delivery plan through the outbound descriptor outbox path", async () => {
    const conversationRepository = ConversationRepository.inMemory();
    const plan = planProactiveDeliveryDescriptor({
      channel: "Telegram",
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      message: "Delivery slot is open today.",
      phone: "+7 900 000-00-00",
      rule: {
        activeVariant: "B",
        channels: ["Telegram"],
        id: "rule-checkout",
        segment: "checkout",
        status: "enabled"
      },
      subjectId: "client-42",
      tenantId: "tenant-demo",
      topic: "Delivery / Proactive",
      traceId: "trc_proactive_delivery_persist"
    });

    const persisted = await persistProactiveDeliveryPlan({
      conversationRepository,
      plan
    });
    const descriptors = await conversationRepository.listOutboundDescriptors({
      idempotencyKey: "proactive-delivery:tenant-demo:rule-checkout:client-42",
      kind: "outbound_conversation",
      tenantId: "tenant-demo"
    });
    const outboxEvents = await conversationRepository.listOutboxEvents();

    assert.equal(persisted.descriptor.id, plan.descriptor.id);
    assert.equal(persisted.descriptor.outboxEventId, plan.outbox.id);
    assert.equal(persisted.outbox?.id, plan.outbox.id);
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].id, plan.descriptor.id);
    assert.equal(descriptors[0].payload.proactiveRuleId, "rule-checkout");
    assert.equal(outboxEvents.filter((event) => event.id === plan.outbox.id).length, 1);
    assert.equal(outboxEvents.find((event) => event.id === plan.outbox.id)?.type, "conversation.outbound.requested");
  });

  it("persists proactive delivery attempts as tenant-scoped rule records without shared mutable references", () => {
    const repository = AutomationRepository.inMemory();

    const saved = repository.saveProactiveDeliveryAttempt({
      attemptId: "attempt-rule-checkout-client-42",
      descriptorId: "proactive_rule_checkout_tenant_demo_client_42",
      attemptedAt: "2026-06-30T08:30:00.000Z",
      channel: "Telegram",
      ruleId: "rule-checkout",
      status: "queued",
      subjectId: "client-42",
      tenantId: "tenant-demo",
      traceId: "trc_proactive_attempt"
    });
    saved.status = "mutated";
    const replay = repository.saveProactiveDeliveryAttempt({
      attemptId: "attempt-rule-checkout-client-42",
      descriptorId: "changed",
      attemptedAt: "2026-06-30T08:31:00.000Z",
      channel: "VK",
      ruleId: "rule-checkout",
      status: "failed",
      subjectId: "client-42",
      tenantId: "tenant-demo",
      traceId: "trc_changed"
    });
    const attempts = repository.listProactiveDeliveryAttempts({
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    attempts[0].status = "mutated";
    const subjectAttempts = repository.listProactiveDeliveryAttempts({
      subjectId: "client-42",
      tenantId: "tenant-demo"
    });
    const otherTenantAttempts = repository.listProactiveDeliveryAttempts({ tenantId: "tenant-other" });

    assert.equal(replay.status, "queued");
    assert.equal(replay.descriptorId, "proactive_rule_checkout_tenant_demo_client_42");
    assert.equal(replay.attemptedAt, "2026-06-30T08:30:00.000Z");
    assert.equal(attempts.length, 1);
    assert.equal(subjectAttempts.length, 1);
    assert.equal(otherTenantAttempts.length, 0);
    assert.equal(subjectAttempts[0].attemptId, "attempt-rule-checkout-client-42");
    assert.equal(subjectAttempts[0].channel, "Telegram");
    assert.equal(subjectAttempts[0].status, "queued");
    assert.equal(subjectAttempts[0].traceId, "trc_proactive_attempt");
  });

  it("persists proactive delivery idempotency keys as first-write-wins replay records", () => {
    const repository = AutomationRepository.inMemory();

    const first = repository.saveProactiveDeliveryIdempotencyKey({
      fingerprint: "fingerprint-001",
      key: "proactive-delivery:tenant-demo:rule-checkout:client-42",
      result: {
        descriptorId: "proactive_rule_checkout_tenant_demo_client_42",
        outboxEventId: "outbox_proactive_001"
      },
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo"
    });
    first.result.descriptorId = "mutated";
    const replay = repository.saveProactiveDeliveryIdempotencyKey({
      fingerprint: "changed",
      key: "proactive-delivery:tenant-demo:rule-checkout:client-42",
      result: { descriptorId: "changed" },
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo"
    });
    const found = repository.findProactiveDeliveryIdempotencyKey("proactive-delivery:tenant-demo:rule-checkout:client-42");
    found!.result.descriptorId = "mutated-again";
    const foundAgain = repository.findProactiveDeliveryIdempotencyKey("proactive-delivery:tenant-demo:rule-checkout:client-42");

    assert.equal(replay.fingerprint, "fingerprint-001");
    assert.equal(replay.result.descriptorId, "proactive_rule_checkout_tenant_demo_client_42");
    assert.equal(replay.result.outboxEventId, "outbox_proactive_001");
    assert.equal(replay.ruleId, "rule-checkout");
    assert.equal(replay.subjectId, "client-42");
    assert.equal(replay.tenantId, "tenant-demo");
    assert.equal(foundAgain?.result.descriptorId, "proactive_rule_checkout_tenant_demo_client_42");
    assert.equal(repository.findProactiveDeliveryIdempotencyKey("missing"), undefined);
  });

  it("persists proactive delivery experiment attribution as first-write-wins descriptor evidence", () => {
    const repository = AutomationRepository.inMemory();

    const saved = repository.saveProactiveDeliveryAttribution({
      assignedAt: "2026-06-30T08:29:00.000Z",
      attributionId: "attr-rule-checkout-client-42",
      descriptorId: "proactive_rule_checkout_tenant_demo_client_42",
      experimentId: "exp-rule-checkout",
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo",
      variant: "B"
    });
    saved.variant = "mutated";
    const replay = repository.saveProactiveDeliveryAttribution({
      assignedAt: "2026-06-30T08:31:00.000Z",
      attributionId: "attr-rule-checkout-client-42",
      descriptorId: "changed",
      experimentId: "changed",
      ruleId: "rule-checkout",
      subjectId: "client-42",
      tenantId: "tenant-demo",
      variant: "A"
    });
    const ruleAttribution = repository.listProactiveDeliveryAttributions({
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    ruleAttribution[0].variant = "mutated-again";
    const subjectAttribution = repository.listProactiveDeliveryAttributions({
      subjectId: "client-42",
      tenantId: "tenant-demo"
    });
    const otherTenantAttribution = repository.listProactiveDeliveryAttributions({ tenantId: "tenant-other" });

    assert.equal(replay.variant, "B");
    assert.equal(replay.descriptorId, "proactive_rule_checkout_tenant_demo_client_42");
    assert.equal(replay.experimentId, "exp-rule-checkout");
    assert.equal(replay.assignedAt, "2026-06-30T08:29:00.000Z");
    assert.equal(subjectAttribution.length, 1);
    assert.equal(subjectAttribution[0].variant, "B");
    assert.equal(subjectAttribution[0].attributionId, "attr-rule-checkout-client-42");
    assert.equal(otherTenantAttribution.length, 0);
  });

  it("defines quality scoring provider port request, success and failure result contracts", async () => {
    const request: QualityScoringProviderRequest = {
      channel: "SDK",
      context: {
        locale: "en",
        operatorId: "operator-7",
        suggestions: [{ id: "ai-reply" }]
      },
      conversationId: "conv-quality-port",
      draft: {
        attachments: [{ id: "att-ready", status: "ready" }],
        text: "I am sorry for the delay. I will check the status and send the next update."
      },
      mode: "reply",
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      requestedAt: "2026-06-30T09:00:00.000Z",
      tenantId: "tenant-demo",
      traceId: "trc_quality_provider"
    };
    const provider: QualityScoringProvider = {
      model: "quality-rules/v1",
      providerId: "deterministic-quality",
      score: async (providerRequest) => ({
        checks: [
          {
            detail: "No critical risk remains before sending.",
            id: "ready",
            label: "Response is ready",
            tone: "ok"
          }
        ],
        explainability: {
          modelVersion: providerRequest.portVersion,
          reasons: ["ready:ok"]
        },
        providerId: "deterministic-quality",
        providerResultId: "quality-result-001",
        portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
        repairActions: [],
        score: 96,
        status: "ok",
        telemetry: {
          latencyMs: 12,
          model: "quality-rules/v1",
          providerId: "deterministic-quality",
          requestFingerprint: "quality-request-fingerprint",
          usage: {
            inputTokens: 24,
            outputTokens: 8,
            prompt: request.draft.text,
            secret: "nested-secret"
          },
          prompt: request.draft.text,
          secret: "sk-test"
        } as unknown as Awaited<ReturnType<QualityScoringProvider["score"]>>["telemetry"]
      })
    };

    const rawSuccess = await provider.score(request);
    const success = normalizeQualityScoringProviderResult(rawSuccess);
    rawSuccess.checks[0].tone = "danger";
    rawSuccess.telemetry.usage!.inputTokens = 999;
    const failure = normalizeQualityScoringProviderResult({
      checks: [],
      error: {
        code: "provider_timeout",
        message: "Provider timed out before returning a score.",
        retryable: true
      },
      explainability: {
        modelVersion: "quality-rules/v1",
        reasons: []
      },
      providerId: "model-quality",
      providerResultId: "quality-result-failed",
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      repairActions: [],
      score: null,
      status: "failed",
      telemetry: {
        latencyMs: 5000,
        model: "quality-model/v1",
        providerId: "model-quality",
        requestFingerprint: "quality-request-failed"
      }
    });

    assert.equal(request.portVersion, "quality-scoring-provider/v1");
    assert.equal(success.portVersion, "quality-scoring-provider/v1");
    assert.equal(success.status, "ok");
    assert.equal(success.score, 96);
    assert.equal(success.providerResultId, "quality-result-001");
    assert.equal(success.checks[0].tone, "ok");
    assert.equal(success.telemetry.usage?.inputTokens, 24);
    assert.equal("prompt" in success.telemetry, false);
    assert.equal("secret" in success.telemetry, false);
    assert.equal("prompt" in (success.telemetry.usage as Record<string, unknown>), false);
    assert.equal("secret" in (success.telemetry.usage as Record<string, unknown>), false);
    assert.throws(
      () => normalizeQualityScoringProviderResult({
        ...rawSuccess,
        portVersion: "quality-scoring-provider/v0" as typeof QUALITY_SCORING_PROVIDER_PORT_VERSION
      }),
      /quality_scoring_provider_port_version_mismatch/
    );
    assert.equal(failure.status, "failed");
    assert.equal(failure.score, null);
    assert.equal(failure.error?.code, "provider_timeout");
    assert.equal(failure.error?.retryable, true);
  });

  it("defines deterministic quality scoring provider contract for stable test scoring", async () => {
    const provider = createDeterministicQualityScoringProvider();
    const request: QualityScoringProviderRequest = {
      channel: "SDK",
      context: {
        locale: "en",
        operatorId: "operator-7",
        suggestions: [{ id: "suggestion-1" }]
      },
      conversationId: "conv-deterministic-quality",
      draft: {
        attachments: [{ id: "att-upload", status: "uploading" }],
        text: "This is not our problem"
      },
      mode: "reply",
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      requestedAt: "2026-06-30T10:00:00.000Z",
      tenantId: "tenant-demo",
      traceId: "trc_quality_deterministic"
    };

    const first = normalizeQualityScoringProviderResult(await provider.score(request));
    const replay = normalizeQualityScoringProviderResult(await provider.score(structuredClone(request)));
    const volatileReplay = normalizeQualityScoringProviderResult(await provider.score({
      ...request,
      requestedAt: "2026-06-30T10:05:00.000Z",
      traceId: "trc_quality_deterministic_replay"
    }));
    const changedDraft = normalizeQualityScoringProviderResult(await provider.score({
      ...request,
      draft: {
        attachments: [{ id: "att-upload", status: "ready" }],
        text: "I am sorry for the delay. I will check the status and send the next update."
      }
    }));

    assert.equal(provider.providerId, "deterministic-quality-scoring");
    assert.equal(provider.model, "quality-deterministic/v1");
    assert.equal(first.status, "ok");
    assert.equal(first.portVersion, QUALITY_SCORING_PROVIDER_PORT_VERSION);
    assert.equal(first.score, 0);
    assert.deepEqual(first.checks.map((check) => `${check.id}:${check.tone}`), [
      "short:warn",
      "empathy:warn",
      "resolution:warn",
      "risk:danger",
      "attachment:danger"
    ]);
    assert.deepEqual(first.repairActions.map((action) => `${action.id}:${action.severity}`), [
      "repair-short:warn",
      "repair-empathy:warn",
      "repair-resolution:warn",
      "repair-risk:danger",
      "repair-attachment:danger"
    ]);
    assert.equal(first.telemetry.requestFingerprint, "e458424cf60820b074c4b6ea61bcd7f6e4bcab85d980d9f12804f709b9acb6e9");
    assert.equal(first.providerResultId, "quality_deterministic_e458424cf60820b074c4b6ea");
    assert.equal(first.telemetry.usage?.inputTokens, 8);
    assert.equal(first.telemetry.usage?.outputTokens, 2);
    assert.equal(first.providerResultId, replay.providerResultId);
    assert.equal(first.providerResultId, volatileReplay.providerResultId);
    assert.equal(first.telemetry.requestFingerprint, replay.telemetry.requestFingerprint);
    assert.equal(first.telemetry.requestFingerprint, volatileReplay.telemetry.requestFingerprint);
    assert.notEqual(first.telemetry.requestFingerprint, changedDraft.telemetry.requestFingerprint);
    assert.ok(first.checks.some((check) => check.id === "risk" && check.tone === "danger"));
    assert.ok(first.checks.some((check) => check.id === "attachment" && check.tone === "danger"));
    assert.ok(first.repairActions.some((action) => action.id === "repair-risk" && action.severity === "danger"));
    assert.ok(Number(first.telemetry.usage?.inputTokens) > 0);
    assert.equal("prompt" in first.telemetry, false);
    assert.equal("secret" in first.telemetry, false);
    assert.ok(changedDraft.score! > first.score!);
  });

  it("maps draft scoring payloads into quality scoring provider requests", () => {
    const payload = {
      attachments: [
        { checksum: "drop-me", id: " att-1 ", status: " ready " },
        { id: "", status: "uploading", url: "https://files.local/private" },
        { checksum: "drop-me", id: " ", status: " ", url: "https://files.local/private" }
      ],
      channel: " Telegram ",
      conversationId: " conv-request-adapter ",
      locale: " ru ",
      mode: "external",
      operatorId: " operator-7 ",
      secret: "sk-test",
      suggestions: [
        { id: "suggestion-1", label: "Use apology", secret: "drop-me" },
        "invalid"
      ],
      tenantId: " tenant-demo ",
      text: "  I am sorry. I will check the delivery status.  "
    };

    const request = createQualityScoringProviderRequest(payload, {
      requestedAt: "2026-06-30T11:00:00.000Z",
      traceId: "trc_quality_request_adapter"
    });
    assert.throws(
      () => createQualityScoringProviderRequest({ text: "Missing tenant" }, { requestedAt: "2026-06-30T12:00:00.000Z", traceId: "trc-missing-tenant" }),
      /quality_scoring_tenant_required/
    );
    const internalRequest = createQualityScoringProviderRequest({
      ...payload,
      mode: " internal "
    }, {
      requestedAt: "2026-06-30T11:05:00.000Z",
      traceId: "trc_quality_request_adapter_internal"
    });
    payload.attachments[0].status = "mutated";
    (payload.suggestions[0] as Record<string, unknown>).label = "mutated";

    assert.equal(request.portVersion, QUALITY_SCORING_PROVIDER_PORT_VERSION);
    assert.equal(request.tenantId, "tenant-demo");
    assert.equal(request.channel, "Telegram");
    assert.equal(request.conversationId, "conv-request-adapter");
    assert.equal(request.mode, "reply");
    assert.equal(internalRequest.mode, "internal");
    assert.equal(request.requestedAt, "2026-06-30T11:00:00.000Z");
    assert.equal(request.traceId, "trc_quality_request_adapter");
    assert.equal(request.draft.text, "I am sorry. I will check the delivery status.");
    assert.deepEqual(request.draft.attachments, [
      { id: "att-1", status: "ready" },
      { status: "uploading" }
    ]);
    assert.deepEqual(request.context, {
      locale: "ru",
      operatorId: "operator-7",
      suggestions: [{ id: "suggestion-1", label: "Use apology" }]
    });
    assert.equal("secret" in request.context!.suggestions![0], false);
  });

  it("normalizes quality scoring provider results into API response data", () => {
    const success = createQualityScoringResponseData({
      checks: [
        {
          detail: "No critical risk remains before sending.",
          id: "ready",
          label: "Response is ready",
          tone: "ok"
        }
      ],
      explainability: {
        modelVersion: "quality-model/v1",
        reasons: ["ready:ok"]
      },
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      providerId: "model-quality",
      providerResultId: "quality-result-success",
      repairActions: [],
      score: 98,
      status: "ok",
      telemetry: {
        latencyMs: 44,
        model: "quality-model/v1",
        providerId: "model-quality",
        requestFingerprint: "request-success",
        usage: {
          inputTokens: 30,
          outputTokens: 10,
          prompt: "nested prompt",
          secret: "nested secret"
        },
        prompt: "raw prompt",
        secret: "raw secret"
      } as unknown as Awaited<ReturnType<QualityScoringProvider["score"]>>["telemetry"]
    }, {
      conversationId: "conv-response-adapter"
    });
    const failure = createQualityScoringResponseData({
      checks: [],
      error: {
        code: "provider_timeout",
        message: "Provider timed out before returning a score.",
        retryable: true
      },
      explainability: {
        modelVersion: "quality-model/v1",
        reasons: []
      },
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      providerId: "model-quality",
      providerResultId: "quality-result-failure",
      repairActions: [],
      score: null,
      status: "failed",
      telemetry: {
        latencyMs: 5000,
        model: "quality-model/v1",
        providerId: "model-quality",
        requestFingerprint: "request-failure",
        prompt: "raw failure prompt"
      } as unknown as Awaited<ReturnType<QualityScoringProvider["score"]>>["telemetry"]
    }, {
      conversationId: "conv-response-adapter"
    });

    assert.equal(success.conversationId, "conv-response-adapter");
    assert.equal(success.status, "ok");
    assert.equal(success.score, 98);
    assert.equal(success.provider.providerId, "model-quality");
    assert.equal(success.provider.providerResultId, "quality-result-success");
    assert.equal(success.explainability.modelVersion, "quality-model/v1");
    assert.deepEqual(success.explainability.reasons, ["ready:ok"]);
    assert.deepEqual(success.checks.map((check) => `${check.id}:${check.tone}`), ["ready:ok"]);
    assert.deepEqual(success.repairActions, []);
    assert.equal(success.telemetry.model, "quality-model/v1");
    assert.equal(success.telemetry.usage?.inputTokens, 30);
    assert.equal("prompt" in success.telemetry, false);
    assert.equal("secret" in success.telemetry, false);
    assert.equal("prompt" in (success.telemetry.usage as Record<string, unknown>), false);
    assert.equal("secret" in (success.telemetry.usage as Record<string, unknown>), false);
    assert.equal(failure.status, "failed");
    assert.equal(failure.score, null);
    assert.equal(failure.error?.code, "provider_timeout");
    assert.equal(failure.error?.retryable, true);
    assert.equal(failure.provider.providerResultId, "quality-result-failure");
    assert.equal(failure.telemetry.requestFingerprint, "request-failure");
    assert.equal("prompt" in failure.telemetry, false);
  });

  it("redacts quality scoring request telemetry before provider execution", () => {
    const request = createQualityScoringProviderRequest({
      attachments: [
        { id: "att-secret", status: "uploading", url: "https://files.local/support/tenant-demo/private/secret.pdf" },
        { id: "att-ready", status: "ready" },
        { id: "att-leaky", status: "https://files.local/support/tenant-demo/private/status-secret" }
      ],
      channel: "Telegram",
      conversationId: "conv-request-redaction",
      locale: "en",
      mode: "reply",
      operatorId: "operator-secret",
      secret: "sk-test",
      suggestions: [
        { id: "suggestion-secret", label: "Mention card 4242 4242 4242 4242", secret: "drop-me" }
      ],
      tenantId: "tenant-demo",
      text: "Customer token Bearer sk-live-secret should never be stored in telemetry."
    }, {
      requestedAt: "2026-06-30T12:00:00.000Z",
      traceId: "trc_quality_request_redaction"
    });

    const telemetry = createQualityScoringRequestTelemetry(request);
    const sensitiveMutation = createQualityScoringRequestTelemetry({
      ...request,
      context: {
        locale: "en",
        operatorId: "operator-mutated-secret",
        suggestions: [{ id: "suggestion-mutated", label: "Different sensitive suggestion" }]
      },
      draft: {
        attachments: [
          { id: "different-id", status: "uploading" },
          { id: "different-ready-id", status: "ready" },
          { id: "different-leaky-id", status: "Bearer sk-status-secret" }
        ],
        text: "X".repeat(73)
      }
    });
    const approvedDimensionMutation = createQualityScoringRequestTelemetry({
      ...request,
      channel: "VK"
    });
    const serialized = JSON.stringify(telemetry);

    assert.equal(telemetry.direction, "request");
    assert.equal(telemetry.providerPortVersion, QUALITY_SCORING_PROVIDER_PORT_VERSION);
    assert.equal(telemetry.tenantId, "tenant-demo");
    assert.equal(telemetry.channel, "Telegram");
    assert.equal(telemetry.mode, "reply");
    assert.equal(telemetry.conversationId, "conv-request-redaction");
    assert.equal(telemetry.traceId, "redacted");
    assert.equal(telemetry.requestedAt, "2026-06-30T12:00:00.000Z");
    assert.equal(telemetry.draft.textLength, 73);
    assert.equal(telemetry.draft.attachmentCount, 3);
    assert.deepEqual(telemetry.draft.attachmentStatuses, ["uploading", "ready", "other"]);
    assert.equal(telemetry.context.hasLocale, true);
    assert.equal(telemetry.context.hasOperatorId, true);
    assert.equal(telemetry.context.suggestionCount, 1);
    assert.match(telemetry.requestFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(telemetry.requestFingerprint, sensitiveMutation.requestFingerprint);
    assert.notEqual(telemetry.requestFingerprint, approvedDimensionMutation.requestFingerprint);
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("sk-live-secret"), false);
    assert.equal(serialized.includes("secret.pdf"), false);
    assert.equal(serialized.includes("status-secret"), false);
    assert.equal(serialized.includes("4242"), false);
    assert.equal(serialized.includes("operator-secret"), false);
    assert.equal(serialized.includes("suggestion-secret"), false);
  });

  it("redacts quality scoring response telemetry before persistence", () => {
    const result = {
      checks: [
        {
          detail: "Provider saw Bearer sk-live-secret in a prompt.",
          id: "risk",
          label: "Risky wording",
          tone: "danger"
        },
        {
          detail: "Provider saw object tenant-demo/private/secret.pdf.",
          id: "attachment",
          label: "Attachment is not ready",
          tone: "danger"
        }
      ],
      explainability: {
        modelVersion: "quality-model/v1",
        reasons: ["risk:Bearer sk-live-secret", "attachment:tenant-demo/private/secret.pdf"]
      },
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      providerId: "model-quality",
      providerResultId: "quality-result-Bearer-sk-live-secret",
      repairActions: [
        { id: "repair-risk", label: "Risky wording", severity: "danger" }
      ],
      score: 30,
      status: "ok",
      telemetry: {
        latencyMs: 77,
        model: "quality-model/v1",
        providerId: "model-quality",
        requestFingerprint: "request-response-redaction",
        usage: {
          inputTokens: 40,
          outputTokens: 12,
          prompt: "nested prompt"
        },
        prompt: "raw prompt",
        secret: "raw secret"
      } as unknown as Awaited<ReturnType<QualityScoringProvider["score"]>>["telemetry"]
    } satisfies Awaited<ReturnType<QualityScoringProvider["score"]>>;
    const sanitizedMutation = {
      ...result,
      checks: result.checks.map((check) => ({
        ...check,
        detail: "Different Bearer sk-mutated-secret detail"
      })),
      explainability: {
        modelVersion: "quality-model/v1",
        reasons: ["different:secret"]
      },
      providerResultId: "quality-result-Bearer-sk-mutated-secret"
    } satisfies Awaited<ReturnType<QualityScoringProvider["score"]>>;
    const approvedDimensionMutation = {
      ...result,
      score: 70
    } satisfies Awaited<ReturnType<QualityScoringProvider["score"]>>;
    const emptyProviderResultMutation = {
      ...result,
      providerResultId: ""
    } satisfies Awaited<ReturnType<QualityScoringProvider["score"]>>;

    const telemetry = createQualityScoringResponseTelemetry(result, {
      conversationId: "conv-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjb252In0.signature"
    });
    const sensitiveChanged = createQualityScoringResponseTelemetry(sanitizedMutation, {
      conversationId: "conv-response-redaction"
    });
    const emptyProviderResultChanged = createQualityScoringResponseTelemetry(emptyProviderResultMutation, {
      conversationId: "conv-response-redaction"
    });
    const approvedChanged = createQualityScoringResponseTelemetry(approvedDimensionMutation, {
      conversationId: "conv-response-redaction"
    });
    const failure = createQualityScoringResponseTelemetry({
      checks: [],
      error: {
        code: "provider_timeout",
        message: "Timed out after reading Bearer sk-live-secret prompt.",
        retryable: true
      },
      explainability: {
        modelVersion: "quality-model/v1",
        reasons: ["timeout:Bearer sk-live-secret"]
      },
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      providerId: "model-quality",
      providerResultId: "quality-result-response-failure",
      repairActions: [],
      score: null,
      status: "failed",
      telemetry: {
        latencyMs: 5000,
        model: "quality-model/v1",
        providerId: "model-quality",
        requestFingerprint: "request-response-redaction",
        prompt: "raw failure prompt"
      } as unknown as Awaited<ReturnType<QualityScoringProvider["score"]>>["telemetry"]
    }, {
      conversationId: "conv-response-redaction"
    });
    const serialized = JSON.stringify(telemetry);
    const failureSerialized = JSON.stringify(failure);

    assert.equal(telemetry.direction, "response");
    assert.equal(telemetry.providerPortVersion, QUALITY_SCORING_PROVIDER_PORT_VERSION);
    assert.equal(telemetry.conversationId, "redacted");
    assert.equal(telemetry.provider.providerId, "model-quality");
    assert.equal(telemetry.provider.providerResultStored, true);
    assert.equal(telemetry.provider.model, "quality-model/v1");
    assert.equal(telemetry.status, "ok");
    assert.equal(telemetry.score, 30);
    assert.deepEqual(telemetry.checks, { danger: 2, ok: 0, total: 2, warn: 0 });
    assert.equal(telemetry.repairActionCount, 1);
    assert.equal(telemetry.usage?.inputTokens, 40);
    assert.equal(telemetry.usage?.outputTokens, 12);
    assert.match(telemetry.responseFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(telemetry.responseFingerprint, sensitiveChanged.responseFingerprint);
    assert.equal(telemetry.responseFingerprint, emptyProviderResultChanged.responseFingerprint);
    assert.notEqual(telemetry.responseFingerprint, approvedChanged.responseFingerprint);
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("sk-live-secret"), false);
    assert.equal(serialized.includes("secret.pdf"), false);
    assert.equal(serialized.includes("quality-result-Bearer"), false);
    assert.equal(serialized.includes("eyJhbGci"), false);
    assert.equal(serialized.includes("raw prompt"), false);
    assert.equal(failure.status, "failed");
    assert.equal(failure.error?.code, "provider_timeout");
    assert.equal(failure.error?.retryable, true);
    assert.equal(failureSerialized.includes("Bearer"), false);
    assert.equal(failureSerialized.includes("sk-live-secret"), false);
    assert.equal(failureSerialized.includes("raw failure prompt"), false);
  });

  it("persists sanitized quality scoring request telemetry without mutable references", () => {
    const repository = QualityScoringRepository.inMemory();
    const request = createQualityScoringProviderRequest({
      attachments: [{ id: "att-secret", status: "uploading", url: "https://files.local/private/secret.pdf" }],
      channel: "Telegram Bearer sk-channel-secret",
      conversationId: "conv-request-telemetry-persist/Bearer-sk-conversation-secret",
      locale: "en",
      mode: "reply",
      operatorId: "operator-secret",
      suggestions: [{ id: "suggestion-secret", label: "Secret label" }],
      tenantId: "tenant-demo",
      text: "Bearer sk-live-secret should not be persisted."
    }, {
      requestedAt: "2026-06-30T13:00:00.000Z",
      traceId: "trc_quality_request_telemetry_persist Bearer sk-trace-secret"
    });
    const telemetry = createQualityScoringRequestTelemetry(request);
    const unsafeTelemetry = {
      ...telemetry,
      attachmentStatuses: undefined,
      channel: "Bearer:sk-channel-secret",
      conversationId: "conv-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjb252In0.signature",
      requestFingerprint: "Bearer sk-fingerprint-secret",
      traceId: "Bearer:sk-trace-secret",
      draft: {
        ...telemetry.draft,
        attachmentStatuses: ["Bearer:sk-status-secret", "ready"]
      },
      prompt: "raw prompt",
      secret: "raw secret"
    } as typeof telemetry;

    const saved = repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:01.000Z",
      telemetry: unsafeTelemetry,
      telemetryId: "quality-request-telemetry-Bearer-sk-id-secret"
    });
    telemetry.channel = "mutated";
    saved.telemetry.channel = "mutated";
    const replay = repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:02.000Z",
      telemetry: {
        ...createQualityScoringRequestTelemetry({
          ...request,
          channel: "VK"
        }),
        channel: "VK"
      },
      telemetryId: "quality-request-telemetry-Bearer-sk-id-secret"
    });
    const otherTenant = repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:03.000Z",
      telemetry: {
        ...createQualityScoringRequestTelemetry({
          ...request,
          channel: "VK",
          tenantId: "tenant-other"
        }),
        channel: "VK"
      },
      telemetryId: "quality-request-telemetry-Bearer-sk-other-id-secret"
    });
    const craftedInternalId = repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:04.000Z",
      telemetry: createQualityScoringRequestTelemetry(request),
      telemetryId: replay.telemetryId
    });
    const unsafeTenantOne = repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:05.000Z",
      telemetry: {
        ...createQualityScoringRequestTelemetry(request),
        tenantId: "tenant-with-Bearer-sk-unsafe-one"
      },
      telemetryId: "quality-request-telemetry-unsafe-tenant-shared"
    });
    const unsafeTenantTwo = repository.saveRequestTelemetry({
      recordedAt: "2026-06-30T13:00:06.000Z",
      telemetry: {
        ...createQualityScoringRequestTelemetry(request),
        tenantId: "tenant-with-Bearer-sk-unsafe-two"
      },
      telemetryId: "quality-request-telemetry-unsafe-tenant-shared"
    });
    const rows = repository.listRequestTelemetry({ tenantId: "tenant-demo" });
    rows[0].telemetry.channel = "mutated-again";
    const rowsAgain = repository.listRequestTelemetry({ tenantId: "tenant-demo" });
    const serialized = JSON.stringify(rowsAgain);

    assert.equal(replay.recordedAt, "2026-06-30T13:00:01.000Z");
    assert.match(replay.telemetryId, /^quality-request-telemetry-redacted:[a-f0-9]{16}$/);
    assert.notEqual(otherTenant.telemetryId, replay.telemetryId);
    assert.equal(otherTenant.telemetry.tenantId, "tenant-other");
    assert.notEqual(craftedInternalId.telemetryId, replay.telemetryId);
    assert.match(unsafeTenantOne.telemetry.tenantId, /^tenant-redacted:[a-f0-9]{16}$/);
    assert.match(unsafeTenantTwo.telemetry.tenantId, /^tenant-redacted:[a-f0-9]{16}$/);
    assert.notEqual(unsafeTenantOne.telemetry.tenantId, unsafeTenantTwo.telemetry.tenantId);
    assert.equal(unsafeTenantOne.telemetryId, unsafeTenantTwo.telemetryId);
    assert.notEqual(unsafeTenantOne.recordedAt, unsafeTenantTwo.recordedAt);
    assert.equal(replay.telemetry.channel, "other");
    assert.equal(rowsAgain.length, 2);
    assert.equal(rowsAgain[0].telemetry.channel, "other");
    assert.equal(rowsAgain[0].telemetry.direction, "request");
    assert.equal(rowsAgain[0].telemetry.tenantId, "tenant-demo");
    assert.equal(rowsAgain[0].telemetry.conversationId, "redacted");
    assert.equal(rowsAgain[0].telemetry.requestFingerprint, "redacted");
    assert.equal(rowsAgain[0].telemetry.traceId, "redacted");
    assert.deepEqual(rowsAgain[0].telemetry.draft.attachmentStatuses, ["other", "ready"]);
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("sk-live-secret"), false);
    assert.equal(serialized.includes("sk-channel-secret"), false);
    assert.equal(serialized.includes("sk-conversation-secret"), false);
    assert.equal(serialized.includes("eyJhbGci"), false);
    assert.equal(serialized.includes("sk-fingerprint-secret"), false);
    assert.equal(serialized.includes("sk-id-secret"), false);
    assert.equal(serialized.includes("quality-request-telemetry-redacted:"), true);
    assert.equal(serialized.includes("sk-trace-secret"), false);
    assert.equal(serialized.includes("sk-status-secret"), false);
    assert.equal(serialized.includes("secret.pdf"), false);
    assert.equal(serialized.includes("operator-secret"), false);
    assert.equal(serialized.includes("raw prompt"), false);
    assert.equal(serialized.includes("raw secret"), false);
    assert.equal("prompt" in rowsAgain[0].telemetry, false);
    assert.equal("secret" in rowsAgain[0].telemetry, false);
    assert.equal(repository.listRequestTelemetry({ tenantId: "tenant-other" }).length, 1);
    assert.equal(repository.listRequestTelemetry({ tenantId: unsafeTenantOne.telemetry.tenantId }).length, 1);
    assert.equal(repository.listRequestTelemetry({ tenantId: unsafeTenantTwo.telemetry.tenantId }).length, 1);
  });

  it("persists sanitized quality scoring response telemetry without mutable references", () => {
    const repository = QualityScoringRepository.inMemory();
    const result = {
      checks: [
        {
          detail: "Provider saw Bearer sk-live-secret in a prompt.",
          id: "risk",
          label: "Risky wording",
          tone: "danger"
        }
      ],
      explainability: {
        modelVersion: "quality-model/v1",
        reasons: ["risk:Bearer sk-live-secret"]
      },
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      providerId: "model-quality",
      providerResultId: "quality-result-response-persist",
      repairActions: [
        { id: "repair-risk", label: "Risky wording", severity: "danger" }
      ],
      score: 30,
      status: "ok",
      telemetry: {
        model: "quality-model/v1",
        providerId: "model-quality",
        requestFingerprint: "request-response-persist",
        usage: {
          inputTokens: 40,
          outputTokens: 12,
          prompt: "nested prompt",
          secret: "nested secret"
        },
        prompt: "raw prompt",
        secret: "raw secret"
      } as unknown as Awaited<ReturnType<QualityScoringProvider["score"]>>["telemetry"]
    } satisfies Awaited<ReturnType<QualityScoringProvider["score"]>>;
    const telemetry = createQualityScoringResponseTelemetry(result, {
      conversationId: "conv-response-telemetry-persist/Bearer-sk-conversation-secret"
    });
    const unsafeTelemetry = {
      ...telemetry,
      conversationId: "conv-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjb252In0.signature",
      error: {
        code: "raw_prompt_excerpt",
        retryable: true,
        message: "raw provider failure prompt"
      },
      provider: {
        model: "quality-model/v1 Bearer sk-model-secret",
        providerId: "Bearer:sk-provider-secret",
        providerResultId: "quality-result-Bearer-sk-live-secret",
        providerResultStored: true
      },
      responseFingerprint: "Bearer sk-response-fingerprint-secret",
      usage: {
        inputTokens: 40,
        outputTokens: 12,
        prompt: "nested prompt",
        secret: "nested secret"
      },
      prompt: "raw prompt",
      secret: "raw secret"
    } as typeof telemetry;

    const saved = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:01.000Z",
      tenantId: "tenant-demo",
      telemetry: unsafeTelemetry,
      telemetryId: "quality-response-telemetry-Bearer-sk-id-secret"
    });
    telemetry.status = "failed";
    saved.telemetry.status = "failed";
    const replay = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:02.000Z",
      tenantId: "tenant-demo",
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 80
      }, {
        conversationId: "conv-response-telemetry-persist"
      }),
      telemetryId: "quality-response-telemetry-Bearer-sk-id-secret"
    });
    const distinctUnsafeId = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:03.000Z",
      tenantId: "tenant-other",
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 80
      }, {
        conversationId: "conv-response-other-tenant"
      }),
      telemetryId: "quality-response-telemetry-Bearer-sk-other-id-secret"
    });
    const craftedSyntheticId = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:03.500Z",
      tenantId: "tenant-demo",
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 81
      }, {
        conversationId: "conv-response-crafted-synthetic-id"
      }),
      telemetryId: replay.telemetryId.replace(":", "-")
    });
    const craftedInternalId = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:03.750Z",
      tenantId: "tenant-demo",
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 82
      }, {
        conversationId: "conv-response-crafted-internal-id"
      }),
      telemetryId: replay.telemetryId
    });
    const sameValidIdOtherTenant = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:04.000Z",
      tenantId: "tenant-other",
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 90
      }, {
        conversationId: "conv-response-valid-id-other-tenant"
      }),
      telemetryId: "quality-response-telemetry-shared"
    });
    const sameValidIdDemoTenant = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:05.000Z",
      tenantId: "tenant-demo",
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 91
      }, {
        conversationId: "conv-response-valid-id-demo-tenant"
      }),
      telemetryId: "quality-response-telemetry-shared"
    });
    const unsafeTenantOne = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:06.000Z",
      tenantId: "tenant-with-Bearer-sk-unsafe-one",
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 92
      }, {
        conversationId: "conv-response-unsafe-tenant-one"
      }),
      telemetryId: "quality-response-telemetry-unsafe-tenant-shared"
    });
    const unsafeTenantTwo = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:07.000Z",
      tenantId: "tenant-with-Bearer-sk-unsafe-two",
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 93
      }, {
        conversationId: "conv-response-unsafe-tenant-two"
      }),
      telemetryId: "quality-response-telemetry-unsafe-tenant-shared"
    });
    const craftedSyntheticTenant = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:08.000Z",
      tenantId: unsafeTenantOne.tenantId.replace(":", "-"),
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 94
      }, {
        conversationId: "conv-response-crafted-synthetic-tenant"
      }),
      telemetryId: "quality-response-telemetry-unsafe-tenant-shared"
    });
    const craftedInternalTenant = repository.saveResponseTelemetry({
      recordedAt: "2026-06-30T13:05:09.000Z",
      tenantId: unsafeTenantOne.tenantId,
      telemetry: createQualityScoringResponseTelemetry({
        ...result,
        score: 95
      }, {
        conversationId: "conv-response-crafted-internal-tenant"
      }),
      telemetryId: "quality-response-telemetry-unsafe-tenant-shared"
    });
    const rows = repository.listResponseTelemetry({ status: "ok", tenantId: "tenant-demo" });
    rows[0].telemetry.status = "failed";
    const rowsAgain = repository.listResponseTelemetry({ status: "ok", tenantId: "tenant-demo" });
    const serialized = JSON.stringify(rowsAgain);

    assert.equal(replay.recordedAt, "2026-06-30T13:05:01.000Z");
    assert.match(replay.telemetryId, /^quality-response-telemetry-redacted:[a-f0-9]{16}$/);
    assert.notEqual(distinctUnsafeId.telemetryId, replay.telemetryId);
    assert.notEqual(craftedSyntheticId.telemetryId, replay.telemetryId);
    assert.notEqual(craftedInternalId.telemetryId, replay.telemetryId);
    assert.equal(distinctUnsafeId.tenantId, "tenant-other");
    assert.equal(sameValidIdOtherTenant.tenantId, "tenant-other");
    assert.equal(sameValidIdDemoTenant.tenantId, "tenant-demo");
    assert.equal(sameValidIdOtherTenant.telemetryId, sameValidIdDemoTenant.telemetryId);
    assert.notEqual(sameValidIdOtherTenant.recordedAt, sameValidIdDemoTenant.recordedAt);
    assert.match(unsafeTenantOne.tenantId, /^tenant-redacted:[a-f0-9]{16}$/);
    assert.match(unsafeTenantTwo.tenantId, /^tenant-redacted:[a-f0-9]{16}$/);
    assert.notEqual(unsafeTenantOne.tenantId, unsafeTenantTwo.tenantId);
    assert.equal(unsafeTenantOne.telemetryId, unsafeTenantTwo.telemetryId);
    assert.notEqual(unsafeTenantOne.recordedAt, unsafeTenantTwo.recordedAt);
    assert.notEqual(craftedSyntheticTenant.tenantId, unsafeTenantOne.tenantId);
    assert.equal(craftedSyntheticTenant.telemetryId, unsafeTenantOne.telemetryId);
    assert.notEqual(craftedInternalTenant.tenantId, unsafeTenantOne.tenantId);
    assert.equal(craftedInternalTenant.telemetryId, unsafeTenantOne.telemetryId);
    assert.equal(replay.telemetry.status, "ok");
    assert.equal(rowsAgain.length, 4);
    assert.equal(rowsAgain[0].tenantId, "tenant-demo");
    assert.equal(rowsAgain[0].telemetry.direction, "response");
    assert.equal(rowsAgain[0].telemetry.conversationId, "redacted");
    assert.equal(rowsAgain[0].telemetry.provider.model, "redacted");
    assert.equal(rowsAgain[0].telemetry.provider.providerId, "redacted");
    assert.equal(rowsAgain[0].telemetry.provider.providerResultStored, true);
    assert.equal(rowsAgain[0].telemetry.responseFingerprint, "redacted");
    assert.equal(rowsAgain[0].telemetry.error?.code, "redacted");
    assert.equal(rowsAgain[0].telemetry.error?.retryable, true);
    assert.deepEqual(rowsAgain[0].telemetry.usage, { inputTokens: 40, outputTokens: 12 });
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("sk-live-secret"), false);
    assert.equal(serialized.includes("sk-conversation-secret"), false);
    assert.equal(serialized.includes("eyJhbGci"), false);
    assert.equal(serialized.includes("raw_prompt_excerpt"), false);
    assert.equal(serialized.includes("sk-error-secret"), false);
    assert.equal(serialized.includes("sk-provider-secret"), false);
    assert.equal(serialized.includes("sk-model-secret"), false);
    assert.equal(serialized.includes("sk-response-fingerprint-secret"), false);
    assert.equal(serialized.includes("sk-id-secret"), false);
    assert.equal(serialized.includes("nested prompt"), false);
    assert.equal(serialized.includes("raw prompt"), false);
    assert.equal(serialized.includes("raw secret"), false);
    assert.equal("prompt" in rowsAgain[0].telemetry, false);
    assert.equal("secret" in rowsAgain[0].telemetry, false);
    assert.equal(repository.listResponseTelemetry({ status: "failed", tenantId: "tenant-demo" }).length, 0);
    assert.equal(repository.listResponseTelemetry({ status: "ok", tenantId: "tenant-other" }).length, 2);
    assert.equal(repository.listResponseTelemetry({ status: "ok", tenantId: unsafeTenantOne.tenantId }).length, 1);
    assert.equal(repository.listResponseTelemetry({ status: "ok", tenantId: unsafeTenantTwo.tenantId }).length, 1);
  });

  it("rejects legacy quality scoring response telemetry rows without tenant ids", () => {
    const telemetry = createQualityScoringResponseTelemetry({
      checks: [],
      explainability: {
        modelVersion: "quality-model/v1",
        reasons: []
      },
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      providerId: "model-quality",
      providerResultId: "quality-result-legacy",
      repairActions: [],
      score: 100,
      status: "ok",
      telemetry: {
        model: "quality-model/v1",
        providerId: "model-quality"
      }
    }, {
      conversationId: "conv-response-legacy"
    });
    const repository = QualityScoringRepository.inMemory({
      requestTelemetry: [],
      responseTelemetry: [{
        recordedAt: "2026-06-30T13:06:01.000Z",
        telemetry,
        telemetryId: "quality-response-telemetry-legacy"
      }]
    } as Parameters<typeof QualityScoringRepository.inMemory>[0]);

    assert.throws(
      () => repository.listResponseTelemetry({ tenantId: "tenant-demo" }),
      /quality_scoring_tenant_required/
    );
  });

  it("persists sanitized quality scoring failure envelopes without prompt leakage", () => {
    const repository = QualityScoringRepository.inMemory();
    const failureTelemetry = createQualityScoringResponseTelemetry({
      checks: [],
      error: {
        code: "provider_timeout",
        message: "Timed out after reading Bearer sk-live-secret prompt.",
        retryable: true
      },
      explainability: {
        modelVersion: "quality-model/v1",
        reasons: ["timeout:Bearer sk-live-secret"]
      },
      portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
      providerId: "model-quality",
      providerResultId: "quality-result-failure-envelope",
      repairActions: [],
      score: null,
      status: "failed",
      telemetry: {
        model: "quality-model/v1",
        providerId: "model-quality",
        requestFingerprint: "request-failure-envelope",
        prompt: "raw failure prompt",
        secret: "raw failure secret"
      } as unknown as Awaited<ReturnType<QualityScoringProvider["score"]>>["telemetry"]
    }, {
      conversationId: "conv-failure-envelope/Bearer-sk-conversation-secret"
    });
    const unsafeEnvelope = {
      conversationId: "conv-eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJjb252In0.signature",
      error: {
        code: "customer_requested_refund",
        retryable: true,
        message: "raw provider failure prompt"
      },
      provider: {
        model: "quality-model/v1 Bearer sk-model-secret",
        providerId: "Bearer:sk-provider-secret",
        providerResultStored: true
      },
      providerPortVersion: "quality-scoring-provider/unsafe",
      responseFingerprint: "Bearer sk-response-fingerprint-secret",
      status: "failed",
      prompt: "raw prompt",
      secret: "raw secret"
    };

    const saved = repository.saveFailureEnvelope({
      envelope: unsafeEnvelope,
      failureId: "quality-failure-envelope-Bearer-sk-id-secret",
      recordedAt: "2026-06-30T13:10:01.000Z",
      tenantId: "tenant-with-Bearer-sk-unsafe-one"
    });
    saved.envelope.error.code = "mutated";
    const replay = repository.saveFailureEnvelope({
      envelope: {
        conversationId: "conv-failure-envelope",
        error: failureTelemetry.error!,
        provider: failureTelemetry.provider,
        providerPortVersion: failureTelemetry.providerPortVersion,
        responseFingerprint: failureTelemetry.responseFingerprint,
        status: "failed"
      },
      failureId: "quality-failure-envelope-Bearer-sk-id-secret",
      recordedAt: "2026-06-30T13:10:02.000Z",
      tenantId: "tenant-with-Bearer-sk-unsafe-one"
    });
    const otherTenant = repository.saveFailureEnvelope({
      envelope: {
        conversationId: "conv-failure-other-tenant",
        error: failureTelemetry.error!,
        provider: failureTelemetry.provider,
        providerPortVersion: failureTelemetry.providerPortVersion,
        responseFingerprint: failureTelemetry.responseFingerprint,
        status: "failed"
      },
      failureId: "quality-failure-envelope-shared",
      recordedAt: "2026-06-30T13:10:03.000Z",
      tenantId: "tenant-other"
    });
    const sameValidIdUnsafeTenant = repository.saveFailureEnvelope({
      envelope: {
        conversationId: "conv-failure-same-valid-id",
        error: failureTelemetry.error!,
        provider: failureTelemetry.provider,
        providerPortVersion: failureTelemetry.providerPortVersion,
        responseFingerprint: failureTelemetry.responseFingerprint,
        status: "failed"
      },
      failureId: "quality-failure-envelope-shared",
      recordedAt: "2026-06-30T13:10:04.000Z",
      tenantId: "tenant-with-Bearer-sk-unsafe-one"
    });
    const craftedInternalId = repository.saveFailureEnvelope({
      envelope: {
        conversationId: "conv-failure-crafted-internal-id",
        error: failureTelemetry.error!,
        provider: failureTelemetry.provider,
        providerPortVersion: failureTelemetry.providerPortVersion,
        responseFingerprint: failureTelemetry.responseFingerprint,
        status: "failed"
      },
      failureId: replay.failureId,
      recordedAt: "2026-06-30T13:10:05.000Z",
      tenantId: replay.tenantId
    });
    const rows = repository.listFailureEnvelopes({ tenantId: replay.tenantId });
    rows[0].envelope.error.code = "mutated-again";
    const rowsAgain = repository.listFailureEnvelopes({ tenantId: replay.tenantId });
    const serialized = JSON.stringify(rowsAgain);

    assert.equal(replay.recordedAt, "2026-06-30T13:10:01.000Z");
    assert.match(replay.failureId, /^quality-failure-envelope-redacted:[a-f0-9]{16}$/);
    assert.match(replay.tenantId, /^tenant-redacted:[a-f0-9]{16}$/);
    assert.equal(otherTenant.failureId, "quality-failure-envelope-shared");
    assert.equal(otherTenant.tenantId, "tenant-other");
    assert.equal(sameValidIdUnsafeTenant.failureId, otherTenant.failureId);
    assert.equal(sameValidIdUnsafeTenant.tenantId, replay.tenantId);
    assert.notEqual(craftedInternalId.failureId, replay.failureId);
    assert.equal(rowsAgain.length, 2);
    assert.equal(rowsAgain[0].envelope.status, "failed");
    assert.equal(rowsAgain[0].envelope.providerPortVersion, QUALITY_SCORING_PROVIDER_PORT_VERSION);
    assert.equal(rowsAgain[0].envelope.conversationId, "redacted");
    assert.equal(rowsAgain[0].envelope.provider.model, "redacted");
    assert.equal(rowsAgain[0].envelope.provider.providerId, "redacted");
    assert.equal(rowsAgain[0].envelope.provider.providerResultStored, true);
    assert.equal(rowsAgain[0].envelope.responseFingerprint, "redacted");
    assert.equal(rowsAgain[0].envelope.error.code, "redacted");
    assert.equal(rowsAgain[0].envelope.error.retryable, true);
    assert.equal(repository.listFailureEnvelopes({ tenantId: "tenant-other" }).length, 1);
    assert.equal(serialized.includes("Bearer"), false);
    assert.equal(serialized.includes("sk-live-secret"), false);
    assert.equal(serialized.includes("sk-id-secret"), false);
    assert.equal(serialized.includes("sk-conversation-secret"), false);
    assert.equal(serialized.includes("customer_requested_refund"), false);
    assert.equal(serialized.includes("sk-error-secret"), false);
    assert.equal(serialized.includes("sk-provider-secret"), false);
    assert.equal(serialized.includes("sk-model-secret"), false);
    assert.equal(serialized.includes("raw provider failure prompt"), false);
    assert.equal(serialized.includes("raw failure prompt"), false);
    assert.equal(serialized.includes("raw prompt"), false);
    assert.equal(serialized.includes("raw secret"), false);
  });

  it("defines repository contracts for tenant-scoped quality ratings", () => {
    const repository = QualityRepository.inMemory();
    const rating = {
      auditId: "evt_quality_rating_contract",
      channel: "SDK",
      clientId: "client-42",
      conversationId: "conv-rating-contract",
      createdAt: "2026-06-30T13:20:00.000Z",
      operator: "operator-7",
      ratingId: "quality_rating_contract",
      realtimeEventId: "evt_quality_score_contract",
      scale: "CSAT" as const,
      score: 5,
      tenantId: "tenant-demo",
      topic: "Delivery"
    };

    const saved = repository.saveQualityRating(rating);
    rating.score = 1;
    saved.score = 1;
    const replay = repository.saveQualityRating({
      ...rating,
      channel: "VK",
      createdAt: "2026-06-30T13:21:00.000Z",
      score: 2,
      tenantId: "tenant-demo"
    });
    const otherTenant = repository.saveQualityRating({
      ...rating,
      createdAt: "2026-06-30T13:22:00.000Z",
      score: 4,
      tenantId: "tenant-other"
    });
    const tenantRows = repository.listQualityRatings({ tenantId: "tenant-demo" });
    tenantRows[0].score = 1;
    const tenantRowsAgain = repository.listQualityRatings({ tenantId: "tenant-demo" });

    assert.equal(replay.createdAt, "2026-06-30T13:20:00.000Z");
    assert.equal(replay.score, 5);
    assert.equal(replay.channel, "SDK");
    assert.equal(otherTenant.tenantId, "tenant-other");
    assert.equal(otherTenant.score, 4);
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].score, 5);
    assert.equal(tenantRowsAgain[0].ratingId, "quality_rating_contract");
    assert.equal(tenantRowsAgain[0].conversationId, "conv-rating-contract");
    assert.equal(repository.listQualityRatings({ tenantId: "tenant-other" }).length, 1);
    assert.equal(repository.listQualityRatings({ conversationId: "conv-rating-contract", tenantId: "tenant-demo" }).length, 1);
    assert.equal(repository.listQualityRatings({ conversationId: "conv-missing", tenantId: "tenant-demo" }).length, 0);
    assert.equal(repository.listQualityRatings().length, 0);
    assert.equal(repository.listQualityRatings({ tenantId: "" }).length, 0);
  });

  it("wires quality rating controller writes to service-admin rating permissions", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/quality/quality.controller.ts", import.meta.url), "utf8");
    const identityFixtures = readFileSync(new URL("../apps/api-gateway/src/identity/seed-catalog.ts", import.meta.url), "utf8");

    assert.match(source, /@UseGuards\(TenantOperatorOrServiceAdminGuard\)[\s\S]*@Post\("ratings"\)[\s\S]*@RequireServiceAdminAction\("quality\.ratings\.write"\)[\s\S]*recordClientQualityRating\(/);
    assert.match(identityFixtures, /"quality\.ratings\.write"/);
  });

  it("persists JSON quality ratings with tenant-scoped replay parity across repository reopen", () => {
    const workspace = makeTempWorkspace();

    try {
      const filePath = join(workspace, "quality-ratings.json");
      const first = QualityRepository.open({ filePath });
      const rating = {
        auditId: "evt_quality_rating_json",
        channel: "SDK",
        clientId: "client-json",
        conversationId: "conv-rating-json",
        createdAt: "2026-06-30T14:00:00.000Z",
        operator: "operator-json",
        ratingId: "quality_rating_json",
        realtimeEventId: "evt_quality_score_json",
        scale: "CSI" as const,
        score: 4,
        tenantId: "tenant-demo",
        topic: "Delivery"
      };

      const saved = first.saveQualityRating(rating);
      rating.score = 1;
      saved.score = 1;

      const second = QualityRepository.open({ filePath });
      const replay = second.saveQualityRating({
        ...rating,
        channel: "Email",
        createdAt: "2026-06-30T14:01:00.000Z",
        score: 2,
        tenantId: "tenant-demo"
      });
      const otherTenant = second.saveQualityRating({
        ...rating,
        createdAt: "2026-06-30T14:02:00.000Z",
        score: 5,
        tenantId: "tenant-other"
      });
      const reopenedRows = QualityRepository.open({ filePath }).listQualityRatings({ tenantId: "tenant-demo" });
      const state = JSON.parse(readFileSync(filePath, "utf8")) as {
        ratings: Array<Record<string, unknown>>;
      };

      assert.equal(replay.createdAt, "2026-06-30T14:00:00.000Z");
      assert.equal(replay.channel, "SDK");
      assert.equal(replay.score, 4);
      assert.equal(otherTenant.tenantId, "tenant-other");
      assert.equal(otherTenant.score, 5);
      assert.equal(reopenedRows.length, 1);
      assert.equal(reopenedRows[0].ratingId, "quality_rating_json");
      assert.equal(reopenedRows[0].score, 4);
      assert.equal(state.ratings.length, 2);
      assert.ok(state.ratings.some((row) =>
        row.tenantId === "tenant-demo"
          && row.ratingId === "quality_rating_json"
          && row.score === 4
          && row.channel === "SDK"
      ));
      assert.ok(state.ratings.some((row) =>
        row.tenantId === "tenant-other"
          && row.ratingId === "quality_rating_json"
          && row.score === 5
      ));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("preserves immutable quality rating audit evidence on duplicate replay", () => {
    const repository = QualityRepository.inMemory();
    const first = repository.saveQualityRating({
      auditId: "audit-rating-original",
      channel: "SDK",
      clientId: "client-audit",
      conversationId: "conv-rating-audit",
      createdAt: "2026-06-30T15:30:00.000Z",
      operator: "operator-audit",
      ratingId: "rating-audit-immutable",
      realtimeEventId: "rt-rating-original",
      scale: "CSAT",
      score: 5,
      tenantId: "tenant-demo",
      topic: "Delivery"
    });
    const replay = repository.saveQualityRating({
      auditId: "audit-rating-mutated",
      channel: "Email",
      clientId: "client-mutated",
      conversationId: "conv-rating-audit-mutated",
      createdAt: "2026-06-30T15:31:00.000Z",
      operator: "operator-mutated",
      ratingId: "rating-audit-immutable",
      realtimeEventId: "rt-rating-mutated",
      scale: "QA",
      score: 1,
      tenantId: "tenant-demo",
      topic: "Mutated"
    });
    const rows = repository.listQualityRatings({ tenantId: "tenant-demo" });

    assert.equal(first.auditId, "audit-rating-original");
    assert.equal(replay.auditId, "audit-rating-original");
    assert.equal(replay.realtimeEventId, "rt-rating-original");
    assert.equal(replay.conversationId, "conv-rating-audit");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].auditId, "audit-rating-original");
    assert.equal(rows[0].realtimeEventId, "rt-rating-original");
  });

  it("defines repository contracts for tenant-scoped manual QA reviews", () => {
    const repository = QualityRepository.inMemory();
    const review = {
      auditId: "evt_quality_manual_review_contract",
      conversationId: "conv-review-contract",
      createdAt: "2026-06-30T13:25:00.000Z",
      criteria: {
        completeness: 5,
        correctness: 4,
        speed: 5,
        tone: 4
      },
      overrideReason: "senior_review",
      reviewId: "qa_review_contract",
      reviewer: "senior-1",
      score: 92,
      tenantId: "tenant-demo"
    };

    const saved = repository.saveManualQaReview(review);
    review.criteria.tone = 1;
    saved.criteria.tone = 1;
    const replay = repository.saveManualQaReview({
      ...review,
      createdAt: "2026-06-30T13:26:00.000Z",
      reviewer: "senior-2",
      score: 70,
      tenantId: "tenant-demo"
    });
    const otherTenant = repository.saveManualQaReview({
      ...review,
      createdAt: "2026-06-30T13:27:00.000Z",
      reviewer: "senior-3",
      score: 88,
      tenantId: "tenant-other"
    });
    const tenantRows = repository.listManualQaReviews({ tenantId: "tenant-demo" });
    tenantRows[0].criteria.tone = 1;
    const tenantRowsAgain = repository.listManualQaReviews({ tenantId: "tenant-demo" });

    assert.equal(replay.createdAt, "2026-06-30T13:25:00.000Z");
    assert.equal(replay.reviewer, "senior-1");
    assert.equal(replay.score, 92);
    assert.equal(replay.criteria.tone, 4);
    assert.equal(otherTenant.tenantId, "tenant-other");
    assert.equal(otherTenant.score, 88);
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].criteria.tone, 4);
    assert.equal(tenantRowsAgain[0].overrideReason, "senior_review");
    assert.equal(repository.listManualQaReviews({ tenantId: "tenant-other" }).length, 1);
    assert.equal(repository.listManualQaReviews({ conversationId: "conv-review-contract", tenantId: "tenant-demo" }).length, 1);
    assert.equal(repository.listManualQaReviews({ conversationId: "conv-missing", tenantId: "tenant-demo" }).length, 0);
    assert.equal(repository.listManualQaReviews().length, 0);
    assert.equal(repository.listManualQaReviews({ tenantId: "" }).length, 0);
  });

  it("wires manual QA review controller writes to service-admin review permissions", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/quality/quality.controller.ts", import.meta.url), "utf8");
    const identityFixtures = readFileSync(new URL("../apps/api-gateway/src/identity/seed-catalog.ts", import.meta.url), "utf8");

    assert.match(source, /@UseGuards\(TenantOperatorOrServiceAdminGuard\)[\s\S]*@Post\("manual-reviews"\)[\s\S]*@RequireServiceAdminAction\("quality\.manual-reviews\.write"\)[\s\S]*recordManualQaReview\(/);
    assert.match(identityFixtures, /"quality\.manual-reviews\.write"/);
  });

  it("persists JSON manual QA reviews with tenant-scoped replay parity across repository reopen", () => {
    const workspace = makeTempWorkspace();

    try {
      const filePath = join(workspace, "quality-manual-reviews.json");
      const first = QualityRepository.open({ filePath });
      const review = {
        auditId: "evt_quality_manual_review_json",
        conversationId: "conv-review-json",
        createdAt: "2026-06-30T14:05:00.000Z",
        criteria: {
          completeness: 5,
          correctness: 4,
          speed: 5,
          tone: 4
        },
        overrideReason: "senior_review",
        reviewId: "qa_review_json",
        reviewer: "senior-json",
        score: 92,
        tenantId: "tenant-demo"
      };

      const saved = first.saveManualQaReview(review);
      review.criteria.tone = 1;
      saved.criteria.tone = 1;

      const second = QualityRepository.open({ filePath });
      const replay = second.saveManualQaReview({
        ...review,
        createdAt: "2026-06-30T14:06:00.000Z",
        reviewer: "senior-replay",
        score: 70,
        tenantId: "tenant-demo"
      });
      const otherTenant = second.saveManualQaReview({
        ...review,
        createdAt: "2026-06-30T14:07:00.000Z",
        reviewer: "senior-other",
        score: 88,
        tenantId: "tenant-other"
      });
      const reopenedRows = QualityRepository.open({ filePath }).listManualQaReviews({ tenantId: "tenant-demo" });
      const state = JSON.parse(readFileSync(filePath, "utf8")) as {
        manualQaReviews: Array<Record<string, unknown> & { criteria?: Record<string, unknown> }>;
      };

      assert.equal(replay.createdAt, "2026-06-30T14:05:00.000Z");
      assert.equal(replay.reviewer, "senior-json");
      assert.equal(replay.score, 92);
      assert.equal(replay.criteria.tone, 4);
      assert.equal(otherTenant.tenantId, "tenant-other");
      assert.equal(otherTenant.score, 88);
      assert.equal(reopenedRows.length, 1);
      assert.equal(reopenedRows[0].reviewId, "qa_review_json");
      assert.equal(reopenedRows[0].criteria.tone, 4);
      assert.equal(state.manualQaReviews.length, 2);
      assert.ok(state.manualQaReviews.some((row) =>
        row.tenantId === "tenant-demo"
          && row.reviewId === "qa_review_json"
          && row.score === 92
          && row.criteria?.tone === 4
      ));
      assert.ok(state.manualQaReviews.some((row) =>
        row.tenantId === "tenant-other"
          && row.reviewId === "qa_review_json"
          && row.score === 88
      ));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("preserves immutable manual QA review audit evidence on duplicate replay", () => {
    const repository = QualityRepository.inMemory();
    const first = repository.saveManualQaReview({
      auditId: "audit-review-original",
      conversationId: "conv-review-audit",
      createdAt: "2026-06-30T15:40:00.000Z",
      criteria: { empathy: 5, resolution: 4 },
      overrideReason: "Supervisor accepted calibrated score",
      reviewer: "reviewer-original",
      reviewId: "review-audit-immutable",
      score: 4.5,
      tenantId: "tenant-demo"
    });
    const replay = repository.saveManualQaReview({
      auditId: "audit-review-mutated",
      conversationId: "conv-review-audit-mutated",
      createdAt: "2026-06-30T15:41:00.000Z",
      criteria: { empathy: 1 },
      overrideReason: null,
      reviewer: "reviewer-mutated",
      reviewId: "review-audit-immutable",
      score: 1,
      tenantId: "tenant-demo"
    });
    const rows = repository.listManualQaReviews({ tenantId: "tenant-demo" });

    assert.equal(first.auditId, "audit-review-original");
    assert.equal(replay.auditId, "audit-review-original");
    assert.deepEqual(replay.criteria, { empathy: 5, resolution: 4 });
    assert.equal(replay.overrideReason, "Supervisor accepted calibrated score");
    assert.equal(replay.reviewer, "reviewer-original");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].auditId, "audit-review-original");
    assert.deepEqual(rows[0].criteria, { empathy: 5, resolution: 4 });
  });

  it("defines repository contracts for tenant-scoped AI scoring audit rows", () => {
    const repository = QualityRepository.inMemory();
    const audit = {
      auditId: "evt_ai_scoring_contract",
      conversationId: "conv-scoring-audit-contract",
      createdAt: "2026-06-30T13:30:00.000Z",
      providerId: "deterministic-quality-scoring",
      providerResultId: "quality_deterministic_contract",
      queue: "quality-ai-scoring",
      score: 96,
      status: "ok" as const,
      tenantId: "tenant-demo",
      traceId: "trc_quality_scoring_audit"
    };

    const saved = repository.saveAiScoringAudit(audit);
    audit.score = 10;
    saved.score = 10;
    const replay = repository.saveAiScoringAudit({
      ...audit,
      createdAt: "2026-06-30T13:31:00.000Z",
      providerResultId: "quality_deterministic_changed",
      score: 20,
      tenantId: "tenant-demo"
    });
    const otherTenant = repository.saveAiScoringAudit({
      ...audit,
      createdAt: "2026-06-30T13:32:00.000Z",
      score: 88,
      tenantId: "tenant-other"
    });
    const tenantRows = repository.listAiScoringAudits({ tenantId: "tenant-demo" });
    tenantRows[0].score = 10;
    const tenantRowsAgain = repository.listAiScoringAudits({ tenantId: "tenant-demo" });

    assert.equal(replay.createdAt, "2026-06-30T13:30:00.000Z");
    assert.equal(replay.providerResultId, "quality_deterministic_contract");
    assert.equal(replay.score, 96);
    assert.equal(otherTenant.tenantId, "tenant-other");
    assert.equal(otherTenant.score, 88);
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].score, 96);
    assert.equal(tenantRowsAgain[0].queue, "quality-ai-scoring");
    assert.equal(tenantRowsAgain[0].status, "ok");
    assert.equal(repository.listAiScoringAudits({ tenantId: "tenant-other" }).length, 1);
    assert.equal(repository.listAiScoringAudits({ conversationId: "conv-scoring-audit-contract", tenantId: "tenant-demo" }).length, 1);
    assert.equal(repository.listAiScoringAudits({ conversationId: "conv-missing", tenantId: "tenant-demo" }).length, 0);
    assert.equal(repository.listAiScoringAudits().length, 0);
    assert.equal(repository.listAiScoringAudits({ tenantId: "" }).length, 0);
  });

  it("wires AI scoring controller writes to service-admin scoring audit permissions", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/quality/quality.controller.ts", import.meta.url), "utf8");
    const identityFixtures = readFileSync(new URL("../apps/api-gateway/src/identity/seed-catalog.ts", import.meta.url), "utf8");

    assert.match(source, /@Post\("draft-score"\)[\s\S]*@RequireServiceAdminAction\("quality\.scoring-audits\.write"\)[\s\S]*scoreDraftResponse\(/);
    assert.match(source, /@Post\("draft-scores"\)[\s\S]*@RequireServiceAdminAction\("quality\.scoring-audits\.write"\)[\s\S]*scoreDraftResponseAlias\(/);
    assert.match(identityFixtures, /"quality\.scoring-audits\.write"/);
  });

  it("persists JSON AI scoring audit rows with tenant-scoped replay parity across repository reopen", () => {
    const workspace = makeTempWorkspace();

    try {
      const filePath = join(workspace, "quality-ai-scoring-audits.json");
      const first = QualityRepository.open({ filePath });
      const audit = {
        auditId: "evt_ai_scoring_json",
        conversationId: "conv-scoring-json",
        createdAt: "2026-06-30T14:10:00.000Z",
        providerId: "deterministic-quality-scoring",
        providerResultId: "quality_deterministic_json",
        queue: "quality-ai-scoring",
        score: 96,
        status: "ok" as const,
        tenantId: "tenant-demo",
        traceId: "trc_quality_scoring_json"
      };

      const saved = first.saveAiScoringAudit(audit);
      audit.score = 10;
      saved.score = 10;

      const second = QualityRepository.open({ filePath });
      const replay = second.saveAiScoringAudit({
        ...audit,
        createdAt: "2026-06-30T14:11:00.000Z",
        providerResultId: "quality_deterministic_changed",
        score: 20,
        status: "failed",
        tenantId: "tenant-demo"
      });
      const otherTenant = second.saveAiScoringAudit({
        ...audit,
        createdAt: "2026-06-30T14:12:00.000Z",
        providerResultId: null,
        score: null,
        status: "failed",
        tenantId: "tenant-other"
      });
      const reopenedRows = QualityRepository.open({ filePath }).listAiScoringAudits({ tenantId: "tenant-demo" });
      const state = JSON.parse(readFileSync(filePath, "utf8")) as {
        aiScoringAudits: Array<Record<string, unknown>>;
      };

      assert.equal(replay.createdAt, "2026-06-30T14:10:00.000Z");
      assert.equal(replay.providerResultId, "quality_deterministic_json");
      assert.equal(replay.score, 96);
      assert.equal(replay.status, "ok");
      assert.equal(otherTenant.tenantId, "tenant-other");
      assert.equal(otherTenant.providerResultId, null);
      assert.equal(otherTenant.score, null);
      assert.equal(otherTenant.status, "failed");
      assert.equal(reopenedRows.length, 1);
      assert.equal(reopenedRows[0].auditId, "evt_ai_scoring_json");
      assert.equal(reopenedRows[0].queue, "quality-ai-scoring");
      assert.equal(reopenedRows[0].traceId, "trc_quality_scoring_json");
      assert.equal(state.aiScoringAudits.length, 2);
      assert.ok(state.aiScoringAudits.some((row) =>
        row.tenantId === "tenant-demo"
          && row.auditId === "evt_ai_scoring_json"
          && row.providerResultId === "quality_deterministic_json"
          && row.score === 96
          && row.status === "ok"
      ));
      assert.ok(state.aiScoringAudits.some((row) =>
        row.tenantId === "tenant-other"
          && row.auditId === "evt_ai_scoring_json"
          && row.providerResultId === null
          && row.status === "failed"
      ));
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("preserves immutable AI scoring audit evidence on duplicate replay", () => {
    const repository = QualityRepository.inMemory();
    const first = repository.saveAiScoringAudit({
      auditId: "audit-scoring-immutable",
      conversationId: "conv-scoring-audit",
      createdAt: "2026-06-30T15:50:00.000Z",
      providerId: "deterministic-quality-scoring",
      providerResultId: "quality-result-original",
      queue: "quality-ai-scoring",
      score: 91,
      status: "ok",
      tenantId: "tenant-demo",
      traceId: "trace-scoring-original"
    });
    const replay = repository.saveAiScoringAudit({
      auditId: "audit-scoring-immutable",
      conversationId: "conv-scoring-audit-mutated",
      createdAt: "2026-06-30T15:51:00.000Z",
      providerId: "mutated-provider",
      providerResultId: "quality-result-mutated",
      queue: "quality-ai-scoring-mutated",
      score: 1,
      status: "failed",
      tenantId: "tenant-demo",
      traceId: "trace-scoring-mutated"
    });
    const rows = repository.listAiScoringAudits({ tenantId: "tenant-demo" });

    assert.equal(first.providerResultId, "quality-result-original");
    assert.equal(replay.providerId, "deterministic-quality-scoring");
    assert.equal(replay.providerResultId, "quality-result-original");
    assert.equal(replay.status, "ok");
    assert.equal(replay.score, 91);
    assert.equal(replay.traceId, "trace-scoring-original");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].providerResultId, "quality-result-original");
    assert.equal(rows[0].traceId, "trace-scoring-original");
  });

  it("returns quality workspace and scores draft responses with explainable telemetry", async () => {
    const quality = new QualityService(QualityRepository.inMemory(bootstrapQualityState()));

    const workspace = await quality.fetchQualityWorkspace({ tenantId: "tenant-demo" });
    assert.equal(workspace.service, "qualityService");
    assert.equal(workspace.status, "ok");
    assert.equal(workspace.partial, true);
    assert.ok(workspace.data.qualityMetrics.every((score) => score.conversationId && score.channel && score.operator));
    assert.ok(workspace.data.aiRealtimeChecks.some((check) => check.state === "danger"));
    assert.ok(workspace.data.aiEffectivenessMetrics.some((metric) => metric.id === "accepted-rate"));

    const empty = await quality.scoreDraftResponse({
      conversationId: "conv-empty",
      mode: "reply",
      text: ""
    }, { tenantId: "tenant-demo" });
    assert.equal(empty.status, "ok");
    assert.equal(empty.data.checks[0].id, "empty");
    assert.equal(empty.data.checks[0].tone, "danger");
    assert.equal(empty.data.telemetry.model, "quality-deterministic/v1");
    assert.match(empty.data.telemetry.auditId, /^evt_ai_/);

    const risky = await quality.scoreDraftResponse({
      attachments: [{ id: "att-1", status: "uploading" }],
      conversationId: "conv-risk",
      mode: "reply",
      suggestions: [{ id: "ai-reply" }],
      text: "This is not our problem"
    }, { tenantId: "tenant-demo" });
    assert.equal(risky.status, "ok");
    assert.ok(risky.data.checks.some((check) => check.id === "attachment" && check.tone === "danger"));
    assert.ok(risky.data.repairActions.length > 0);
    assert.equal(risky.data.telemetry.effectivenessKey, "quality_conv-risk");
    assert.ok(risky.data.explainability.reasons.length > 0);

    const malformed = await quality.scoreDraftResponse(null, { tenantId: "tenant-demo" });
    assert.equal(malformed.status, "invalid");
    assert.equal(malformed.error?.code, "quality_draft_payload_required");
  });

  it("records client ratings and manual QA with conversation, channel and operator links", async () => {
    const quality = new QualityService();

    const invalidRating = await quality.recordClientQualityRating({
      score: 5,
      scale: "CSAT"
    });
    assert.equal(invalidRating.status, "invalid");
    assert.equal(invalidRating.error?.code, "quality_rating_context_required");

    const rating = await quality.recordClientQualityRating({
      channel: "SDK",
      clientId: "client-42",
      conversationId: "conv-42",
      operator: "operator-7",
      score: 5,
      scale: "CSAT",
      topic: "Delivery"
    }, { tenantId: "tenant-demo" });
    assert.equal(rating.status, "ok");
    assert.match(rating.data.ratingId, /^quality_/);
    assert.equal(rating.data.links.conversationId, "conv-42");
    assert.equal(rating.data.links.channel, "SDK");
    assert.equal(rating.data.links.operator, "operator-7");
    assert.match(rating.data.realtimeEvent.eventId, /^evt_quality_score_/);
    assert.equal(rating.data.realtimeEvent.eventName, "quality.score.updated");
    assert.equal(rating.data.realtimeEvent.tenantId, "tenant-demo");
    assert.match(rating.data.realtimeEvent.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(rating.data.realtimeEvent.traceId, /^trc_|^req_|^test-/);
    assert.match(rating.data.auditId, /^evt_quality_/);

    const review = await quality.recordManualQaReview({
      conversationId: "conv-42",
      reviewer: "senior-1",
      score: 92,
      criteria: {
        completeness: 5,
        tone: 4,
        correctness: 5,
        instruction: 4,
        speed: 5
      },
      overrideReason: "senior_review"
    }, { tenantId: "tenant-demo" });
    assert.equal(review.status, "ok");
    assert.equal(review.data.reviewId.startsWith("qa_"), true);
    assert.equal(review.data.override.auditRequired, true);
    assert.match(review.data.auditId, /^evt_quality_/);
  });
});

function makeTempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "support-quality-"));
}
