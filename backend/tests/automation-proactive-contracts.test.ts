import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { runProactiveDeliveryWorkerOnce } from "../apps/api-gateway/src/automation/proactive-delivery.worker.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";

describe("automation proactive visitor workspace contracts", () => {
  beforeEach(() => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
  });

  afterEach(() => {
    AutomationRepository.clearDefault();
  });

  it("returns tenant-scoped visitor workspace payload", async () => {
    const automation = new AutomationService();

    const volga = await automation.fetchVisitorWorkspace({ tenantId: "tenant-volga" });
    const ladoga = await automation.fetchVisitorWorkspace({ tenantId: "tenant-ladoga" });

    assert.equal(volga.status, "ok");
    assert.ok(volga.data.activeVisitors.length > 0);
    assert.ok(Array.isArray(volga.data.proactiveRules));
    assert.equal(ladoga.data.activeVisitors.length, 0);
  });

  it("persists proactive rule saves through repository", async () => {
    const automation = new AutomationService();

    const saved = await automation.saveProactiveRule({
      id: "rule-checkout-contract",
      channels: ["SDK"],
      segment: "checkout",
      status: "enabled"
    }, { tenantId: "tenant-volga" });

    assert.equal(saved.status, "ok");
    assert.equal(saved.data.rule.id, "rule-checkout-contract");
  });

  it("keeps proactive rules tenant-scoped and rejects a foreign rule id overwrite", async () => {
    const baseState = AutomationRepository.inMemory().readState();
    const repository = AutomationRepository.inMemory({
      ...baseState,
      proactiveRules: []
    });
    const automation = new AutomationService(repository);

    const first = await automation.saveProactiveRule({
      channels: ["SDK"],
      id: "shared-rule-id",
      segment: "checkout"
    }, { tenantId: "tenant-a" });
    const foreignOverwrite = await automation.saveProactiveRule({
      channels: ["Telegram"],
      id: "shared-rule-id",
      segment: "vip"
    }, { tenantId: "tenant-b" });
    const tenantA = await automation.fetchAutomationWorkspace({ tenantId: "tenant-a" });
    const tenantB = await automation.fetchAutomationWorkspace({ tenantId: "tenant-b" });

    assert.equal(first.status, "ok");
    assert.equal(first.data.rule.tenantId, "tenant-a");
    assert.equal(foreignOverwrite.status, "invalid");
    assert.equal(foreignOverwrite.error?.code, "proactive_rule_tenant_conflict");
    assert.deepEqual(tenantA.data.proactiveRules.map((rule: { id: string }) => rule.id), ["shared-rule-id"]);
    assert.equal(tenantB.data.proactiveRules.length, 0);
  });

  it("queues each eligible active visitor once with delivery evidence", async () => {
    const automationRepository = AutomationRepository.inMemory({
      activeVisitors: [{
        channel: "Telegram",
        id: "client-42",
        message: "Delivery slot is open today.",
        phone: "+7 900 000-00-00",
        segment: "checkout",
        tenantId: "tenant-demo",
        topic: "Delivery / Proactive"
      }],
      botPublishAuditEvents: [],
      botScenarios: [],
      botScenarioVersions: [],
      botTestRuns: [],
      proactiveDeliveryAttributions: [],
      proactiveDeliveryAttempts: [],
      proactiveDeliveryIdempotencyKeys: [],
      proactiveExecutionWindows: [{
        active: true,
        daysOfWeek: [2],
        endsAt: "18:00",
        ruleId: "rule-checkout",
        startsAt: "09:00",
        tenantId: "tenant-demo",
        timezone: "Europe/Moscow",
        windowId: "window-checkout"
      }],
      proactiveExperimentAssignments: [],
      proactiveFrequencyCaps: [{
        active: true,
        capId: "cap-checkout",
        limit: 2,
        period: "day",
        resetAt: "2026-07-01T00:00:00.000Z",
        ruleId: "rule-checkout",
        tenantId: "tenant-demo",
        used: 0
      }],
      proactiveRules: [{
        activeVariant: "B",
        channels: ["Telegram"],
        id: "rule-checkout",
        segment: "checkout",
        status: "enabled",
        tenantId: "tenant-demo"
      }],
      publishIdempotencyKeys: [],
      rescueChats: [],
      workspaceAuditEvents: [],
      workspaceRuntimeMetrics: []
    });
    const conversationRepository = ConversationRepository.inMemory();
    const input = {
      activeVariants: ["A", "B"],
      automationRepository,
      conversationRepository,
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      limit: 10,
      traceId: "trc_proactive_worker_contract"
    };

    const first = await runProactiveDeliveryWorkerOnce(input);
    const replay = await runProactiveDeliveryWorkerOnce(input);
    const laterReplay = await runProactiveDeliveryWorkerOnce({
      ...input,
      evaluatedAt: "2026-06-30T08:31:00.000Z"
    });
    const descriptors = await conversationRepository.listOutboundDescriptors({
      idempotencyKey: "proactive-delivery:tenant-demo:rule-checkout:client-42",
      tenantId: "tenant-demo"
    });
    const outboxEvents = await conversationRepository.listOutboxEvents();
    const attempts = await automationRepository.listProactiveDeliveryAttemptsAsync({ tenantId: "tenant-demo" });
    const attributions = await automationRepository.listProactiveDeliveryAttributionsAsync({ tenantId: "tenant-demo" });
    const frequencyCaps = await automationRepository.listProactiveFrequencyCapsAsync({
      ruleId: "rule-checkout",
      tenantId: "tenant-demo"
    });
    const idempotencyRecord = await automationRepository.findProactiveDeliveryIdempotencyKeyAsync(
      "proactive-delivery:tenant-demo:rule-checkout:client-42"
    );

    assert.deepEqual(first, {
      conflicted: 0,
      duplicate: 0,
      failed: 0,
      queued: 1,
      scanned: 1,
      skipped: 0
    });
    assert.deepEqual(replay, {
      conflicted: 0,
      duplicate: 1,
      failed: 0,
      queued: 0,
      scanned: 1,
      skipped: 0
    });
    assert.deepEqual(laterReplay, {
      conflicted: 0,
      duplicate: 1,
      failed: 0,
      queued: 0,
      scanned: 1,
      skipped: 0
    });
    assert.equal(descriptors.length, 1);
    assert.equal(descriptors[0].id, "proactive_rule_checkout_tenant_demo_client_42");
    assert.equal(outboxEvents.filter((event) => event.aggregateId === descriptors[0].id).length, 1);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].status, "queued");
    assert.equal(attempts[0].descriptorId, descriptors[0].id);
    assert.equal(attributions.length, 1);
    assert.equal(attributions[0].descriptorId, descriptors[0].id);
    assert.equal(attributions[0].variant, "A");
    assert.equal(frequencyCaps[0].used, 1);
    assert.equal(idempotencyRecord?.fingerprint, descriptors[0].requestFingerprint);
  });

  it("uses active conversation state when the Prisma-shaped automation state has no visitor rows", async () => {
    const baseState = AutomationRepository.inMemory().readState();
    const automationRepository = AutomationRepository.inMemory({
      ...baseState,
      activeVisitors: [],
      proactiveDeliveryAttributions: [],
      proactiveDeliveryAttempts: [],
      proactiveDeliveryIdempotencyKeys: [],
      proactiveExecutionWindows: [{
        active: true,
        daysOfWeek: [2],
        endsAt: "18:00",
        ruleId: "rule-conversation-fallback",
        startsAt: "09:00",
        tenantId: "tenant-conversation-fallback",
        timezone: "Europe/Moscow",
        windowId: "window-conversation-fallback"
      }],
      proactiveExperimentAssignments: [],
      proactiveFrequencyCaps: [{
        active: true,
        capId: "cap-conversation-fallback",
        limit: 1,
        period: "day",
        resetAt: "2026-07-01T00:00:00.000Z",
        ruleId: "rule-conversation-fallback",
        tenantId: "tenant-conversation-fallback",
        used: 0
      }],
      proactiveRules: [{
        channels: ["SDK"],
        id: "rule-conversation-fallback",
        segment: "checkout",
        status: "enabled",
        tenantId: "tenant-conversation-fallback"
      }]
    });
    const conversationRepository = ConversationRepository.inMemory();
    const [template] = await conversationRepository.listConversations();
    assert.ok(template);
    await conversationRepository.saveConversation({
      ...template,
      channel: "SDK",
      id: "conversation-stale-visitor",
      phone: "visitor-stale",
      status: "active",
      tags: ["segment:checkout"],
      tenantId: "tenant-conversation-fallback",
      topic: "Checkout",
      updatedAt: "2026-06-30T07:00:00.000Z"
    });
    await conversationRepository.saveConversation({
      ...template,
      channel: "SDK",
      id: "conversation-active-visitor",
      phone: "visitor-42",
      status: "active",
      tags: ["segment:checkout"],
      tenantId: "tenant-conversation-fallback",
      topic: "Checkout",
      updatedAt: "2026-06-30T08:29:00.000Z"
    });

    const result = await runProactiveDeliveryWorkerOnce({
      automationRepository,
      conversationRepository,
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      limit: 50,
      traceId: "trc_proactive_conversation_fallback",
      visitorTtlMs: 15 * 60 * 1000
    });
    const descriptors = await conversationRepository.listOutboundDescriptors({
      idempotencyKey: "proactive-delivery:tenant-conversation-fallback:rule-conversation-fallback:conversation-active-visitor",
      tenantId: "tenant-conversation-fallback"
    });

    assert.equal(result.queued, 1);
    assert.equal(result.failed, 0);
    assert.equal(descriptors.length, 1);
  });
});
