import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  AutomationRepository,
  createEmptyAutomationState
} from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { BotFeedbackRepository } from "../apps/api-gateway/src/automation/bot-feedback.repository.ts";
import { runProactiveDeliveryWorkerOnce } from "../apps/api-gateway/src/automation/proactive-delivery.worker.ts";
import { ProactiveExposureRepository } from "../apps/api-gateway/src/automation/proactive-exposure.repository.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { AiConnectionRepository } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";

describe("automation proactive visitor workspace contracts", () => {
  beforeEach(() => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    BotFeedbackRepository.useDefault(BotFeedbackRepository.inMemory());
    AiConnectionRepository.useDefault(AiConnectionRepository.inMemory());
  });

  afterEach(() => {
    AiConnectionRepository.clearDefault();
    BotFeedbackRepository.clearDefault();
    AutomationRepository.clearDefault();
    ProactiveExposureRepository.clearDefault();
  });

  it("returns tenant-scoped visitor workspace payload", async () => {
    const automation = new AutomationService(AutomationRepository.inMemory({
      ...createEmptyAutomationState(),
      activeVisitors: [{ id: "visitor-volga", tenantId: "tenant-volga" }]
    }));

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
        channel: "SDK",
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
        channels: ["SDK"],
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
    const exposureRepository = ProactiveExposureRepository.inMemory();
    const integrationRepository = IntegrationRepository.inMemory();
    await integrationRepository.upsertSdkVisitorPresence({ channelConnectionId: "conn-sdk", expiresAt: "2026-06-30T08:32:00.000Z",
      lastSeenAt: "2026-06-30T08:29:00.000Z", pagePath: "/checkout", pageUrl: "https://example.test/checkout",
      referrer: null, sessionKeyHash: "session-42", subjectId: "client-42", tenantId: "tenant-demo" });
    const input = {
      activeVariants: ["A", "B"],
      automationRepository,
      conversationRepository,
      exposureRepository,
      integrationRepository,
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
    const exposures = await exposureRepository.listPendingForSession("tenant-demo",
      (await integrationRepository.listLiveSdkVisitorPresence({ at: input.evaluatedAt }))[0]!.id);
    const descriptors = await conversationRepository.listOutboundDescriptors({
      idempotencyKey: "proactive-delivery:tenant-demo:rule-checkout:client-42",
      tenantId: "tenant-demo"
    });
    const outboxEvents = await conversationRepository.listOutboxEvents();

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
    assert.equal(exposures.length, 1);
    assert.equal(exposures[0].status, "planned");
    assert.equal(exposures[0].variant, "A");
    assert.equal(exposures[0].presenceSessionId.length > 0, true);
    assert.equal(descriptors.length, 1);
    assert.equal(outboxEvents.filter((event) => event.type === "conversation.outbound.requested").length, 1);
  });

  it("uses only live SDK presence and ignores stale or disconnected sessions", async () => {
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
    const exposureRepository = ProactiveExposureRepository.inMemory();
    const integrationRepository = IntegrationRepository.inMemory();
    await integrationRepository.upsertSdkVisitorPresence({ channelConnectionId: "conn-sdk", expiresAt: "2026-06-30T08:31:00.000Z",
      lastSeenAt: "2026-06-30T08:29:00.000Z", pagePath: "/checkout", pageUrl: null, referrer: null,
      sessionKeyHash: "active", subjectId: "visitor-42", tenantId: "tenant-conversation-fallback" });
    await integrationRepository.upsertSdkVisitorPresence({ channelConnectionId: "conn-sdk", expiresAt: "2026-06-30T08:00:00.000Z",
      lastSeenAt: "2026-06-30T07:59:00.000Z", pagePath: "/checkout", pageUrl: null, referrer: null,
      sessionKeyHash: "stale", subjectId: "visitor-stale", tenantId: "tenant-conversation-fallback" });

    const result = await runProactiveDeliveryWorkerOnce({
      automationRepository,
      conversationRepository,
      exposureRepository,
      integrationRepository,
      evaluatedAt: "2026-06-30T08:30:00.000Z",
      limit: 50,
      traceId: "trc_proactive_conversation_fallback",
    });
    const livePresence = await integrationRepository.listLiveSdkVisitorPresence({ at: "2026-06-30T08:30:00.000Z" });
    const exposures = await exposureRepository.listPendingForSession("tenant-conversation-fallback", livePresence[0]!.id);

    assert.equal(result.queued, 1);
    assert.equal(result.failed, 0);
    assert.equal(exposures.length, 1);
  });
});
