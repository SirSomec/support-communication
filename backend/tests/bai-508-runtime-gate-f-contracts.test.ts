import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AiUsageRepository } from "../apps/api-gateway/src/ai-connections/ai-usage.repository.ts";
import { applySessionUpdate, DEFAULT_AGENT_SESSION_POLICY } from "../apps/api-gateway/src/automation/agent-session-state.ts";
import { AgentSessionStateRepository } from "../apps/api-gateway/src/automation/agent-session-state.repository.ts";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { BotRuntimeService } from "../apps/api-gateway/src/automation/bot-runtime.service.ts";
import { KnowledgeRetrievalCache } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval-cache.ts";
import { KnowledgeRetrievalService } from "../apps/api-gateway/src/knowledge-sources/knowledge-retrieval.service.ts";
import { KnowledgeSourceRepository } from "../apps/api-gateway/src/knowledge-sources/knowledge-source.repository.ts";

afterEach(() => {
  KnowledgeRetrievalCache.clearDefault();
  AgentSessionStateRepository.clearDefault();
});

function aiScenario(tenantId = "tenant-volga") {
  const state = createEmptyAutomationState();
  const nodes = [
    { id: "start", type: "condition" as const },
    { id: "answer", type: "ai_reply" as const, config: { handoffQueue: "Support", instructions: "Answer from knowledge." } }
  ];
  const edges = [{ from: "start", to: "answer" }];
  state.botScenarios.push({
    activeVersionId: "rev-current",
    channels: ["SDK"],
    flowEdges: edges,
    flowNodes: nodes,
    id: "bot-ai",
    name: "AI bot",
    schemaVersion: "bot-flow/v1",
    sourceBindings: [{ sourceId: "faq", sourceVersion: "2" }],
    status: "published",
    tenantId
  });
  state.botScenarioVersions.push(
    {
      createdAt: "2026-07-12T09:00:00.000Z",
      flowEdges: edges,
      flowNodes: [
        { id: "start", type: "condition" },
        { id: "answer", type: "message", title: "Old pinned reply" }
      ],
      scenarioId: "bot-ai",
      status: "published",
      tenantId,
      versionId: "rev-old"
    },
    {
      createdAt: "2026-07-12T10:00:00.000Z",
      flowEdges: edges,
      flowNodes: nodes,
      scenarioId: "bot-ai",
      sourceBindings: [{ sourceId: "faq", sourceVersion: "2" }],
      status: "published",
      tenantId,
      versionId: "rev-current"
    }
  );
  return AutomationRepository.inMemory(state);
}

function knowledgeSource(tenantId: string, version = 2, text = "Доставка заказа занимает три рабочих дня.") {
  return {
    approvalStatus: "approved" as const,
    approvedAt: "2026-07-12T10:00:00.000Z",
    approvedBy: "admin",
    archivedAt: null,
    contentChecksum: "sum",
    createdAt: "2026-07-12T10:00:00.000Z",
    disabledAt: null,
    failedAt: null,
    failureCode: null,
    id: "faq",
    kind: "url" as const,
    lastIndexedAt: "2026-07-12T10:00:00.000Z",
    lastIngestedAt: "2026-07-12T10:00:00.000Z",
    metadata: { extractedText: text },
    owner: "admin",
    readiness: "ready" as const,
    retentionUntil: null,
    sourceConfig: {},
    sourceRef: null,
    status: "ready" as const,
    tenantId,
    title: "FAQ",
    updatedAt: "2026-07-12T10:00:00.000Z",
    version
  };
}

describe("BAI-508 comprehensive grounded AI runtime contracts", () => {
  it("starts a new user without foreign conversation or tenant memory", async () => {
    const sessions = AgentSessionStateRepository.inMemory();
    sessions.save(applySessionUpdate(null, {
      conversationId: "conv-other",
      intent: "billing",
      summary: "Чужой диалог",
      tenantId: "tenant-volga",
      userText: "Счёт"
    }).state);
    sessions.save(applySessionUpdate(null, {
      conversationId: "conv-new",
      intent: "shipping",
      summary: "Другой tenant",
      tenantId: "tenant-ladoga",
      userText: "Доставка"
    }).state);

    assert.equal(sessions.get("tenant-volga", "conv-new"), null);
    assert.equal(sessions.get("tenant-ladoga", "conv-other"), null);

    const runtime = new BotRuntimeService(aiScenario(), {
      aiResponder: {
        respond: async (input) => {
          assert.equal(input.conversationId, "conv-new");
          assert.equal(input.tenantId, "tenant-volga");
          return { citations: [{ endOffset: 10, sourceId: "faq", startOffset: 0, title: "FAQ", version: 2 }], model: "test", text: "Ответ новому пользователю" };
        }
      }
    });
    const result = await runtime.handleInboundEvent({
      channel: "SDK",
      conversationId: "conv-new",
      eventId: "evt-new-user",
      payload: { text: "Здравствуйте" },
      scenarioId: "bot-ai",
      tenantId: "tenant-volga",
      traceId: "trc-new"
    });
    assert.equal(result.step.outcome, "ai_reply_queued");
    assert.equal(result.instance.versionId, "rev-current");
  });

  it("compacts a long dialog instead of accumulating an unbounded transcript", () => {
    let state = applySessionUpdate(null, {
      conversationId: "conv-long",
      intent: "delivery_status",
      summary: "Старт",
      tenantId: "tenant-volga",
      userText: "Где заказ?"
    }, { ...DEFAULT_AGENT_SESSION_POLICY, compactionTurnThreshold: 4, maxRecentTurns: 2 }).state;

    for (let index = 0; index < 6; index += 1) {
      const result = applySessionUpdate(state, {
        assistantText: `Ответ ${index} ${"detail ".repeat(30)}`,
        conversationId: "conv-long",
        facts: { orderId: "A-42" },
        intent: "delivery_status",
        summary: "Клиент ждёт статус A-42",
        tenantId: "tenant-volga",
        tokensUsed: 250,
        userText: `Уточнение ${index} ${"question ".repeat(20)}`
      }, { ...DEFAULT_AGENT_SESSION_POLICY, compactionTokenThreshold: 400, compactionTurnThreshold: 4, maxRecentTurns: 2 });
      state = result.state;
      if (index >= 2) assert.equal(result.compacted, true);
    }

    assert.ok(state.recentTurns.length <= 2);
    assert.ok(state.facts.some((fact) => fact.key === "orderId" && fact.value === "A-42"));
    assert.equal(state.intent, "delivery_status");
    assert.ok(state.tokenEstimate < 250 * 7);
  });

  it("invalidates retrieval cache after source revision changes", async () => {
    const repository = KnowledgeSourceRepository.inMemory({
      ingestionJobs: [],
      sources: [knowledgeSource("tenant-volga", 2)]
    });
    const cache = new KnowledgeRetrievalCache();
    KnowledgeRetrievalCache.useDefault(cache);
    const service = new KnowledgeRetrievalService(repository, undefined, cache);
    const input = {
      query: "сколько занимает доставка заказа",
      sourceBindings: [{ sourceId: "faq", sourceVersion: "2" }],
      tenantId: "tenant-volga",
      tokenBudget: 200
    };

    assert.equal((await service.retrieve(input)).cache, "miss");
    assert.equal((await service.retrieve(input)).cache, "hit");

    repository.save(knowledgeSource("tenant-volga", 3, "Доставка заказа занимает семь рабочих дней."));
    const refreshed = await service.retrieve({
      ...input,
      sourceBindings: [{ sourceId: "faq", sourceVersion: "3" }]
    });
    assert.equal(refreshed.cache, "miss");
    assert.match(refreshed.passages[0]?.content ?? "", /семь/);
    assert.ok(cache.metrics.purges >= 1);
  });

  it("hands off on AI timeout or missing knowledge without inventing an answer", async () => {
    const timeoutRuntime = new BotRuntimeService(aiScenario(), {
      aiResponder: {
        respond: async () => {
          throw new Error("bot_ai_provider_timeout");
        }
      }
    });
    const timeout = await timeoutRuntime.handleInboundEvent({
      channel: "SDK",
      conversationId: "conv-timeout",
      eventId: "evt-timeout",
      payload: { text: "Нужна помощь" },
      scenarioId: "bot-ai",
      tenantId: "tenant-volga",
      traceId: "trc-timeout"
    });
    assert.equal(timeout.instance.status, "handoff");
    assert.equal(timeout.step.outcome, "ai_handoff_requested");
    assert.match(String((timeout.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text), /специалисту/i);
    assert.equal(timeout.step.sideEffects.some((effect) => effect.kind === "bot_handoff"), true);

    const emptyRuntime = new BotRuntimeService(aiScenario(), {
      aiResponder: {
        respond: async () => {
          throw new Error("bot_ai_knowledge_not_ready");
        }
      }
    });
    const empty = await emptyRuntime.handleInboundEvent({
      channel: "SDK",
      conversationId: "conv-empty",
      eventId: "evt-empty",
      payload: { text: "Секретные цены?" },
      scenarioId: "bot-ai",
      tenantId: "tenant-volga",
      traceId: "trc-empty"
    });
    assert.equal(empty.step.outcome, "ai_handoff_requested");
    assert.equal(JSON.stringify(empty.instance.context).includes("invent"), false);
  });

  it("deduplicates replayed inbound events and keeps a pinned old revision for active dialogs", async () => {
    const repo = aiScenario();
    const runtime = new BotRuntimeService(repo, {
      aiResponder: {
        respond: async () => ({ citations: [], model: "test", text: "ok" })
      }
    });
    const first = await runtime.handleInboundEvent({
      channel: "SDK",
      conversationId: "conv-pin",
      eventId: "evt-pin",
      payload: { text: "Вопрос" },
      scenarioId: "bot-ai",
      tenantId: "tenant-volga",
      traceId: "trc-pin"
    });
    const duplicate = await runtime.handleInboundEvent({
      channel: "SDK",
      conversationId: "conv-pin",
      eventId: "evt-pin",
      payload: { text: "Вопрос" },
      scenarioId: "bot-ai",
      tenantId: "tenant-volga",
      traceId: "trc-pin"
    });
    assert.equal(first.outcome, "committed");
    assert.equal(duplicate.outcome, "duplicate");
    assert.equal(repo.readState().botRuntimeSteps.length, 1);

    await runtime.rollbackToPublishedVersion("tenant-volga", "bot-ai", "rev-old");
    const nextConversation = await runtime.handleInboundEvent({
      channel: "SDK",
      conversationId: "conv-after-rollback",
      eventId: "evt-after-rollback",
      payload: { text: "Новый диалог" },
      scenarioId: "bot-ai",
      tenantId: "tenant-volga",
      traceId: "trc-after"
    });
    assert.equal(first.instance.versionId, "rev-current");
    assert.equal((await repo.findBotRuntimeInstanceAsync("tenant-volga", "conv-pin"))?.versionId, "rev-current");
    assert.equal(nextConversation.instance.versionId, "rev-old");
  });

  it("rejects cross-tenant retrieval and exhausts budget before contacting a provider", async () => {
    const repository = KnowledgeSourceRepository.inMemory({
      ingestionJobs: [],
      sources: [knowledgeSource("tenant-volga"), knowledgeSource("tenant-ladoga")]
    });
    const retrieval = new KnowledgeRetrievalService(repository, undefined, new KnowledgeRetrievalCache());
    const foreign = await retrieval.retrieve({
      query: "доставка заказа",
      sourceBindings: [{ sourceId: "faq", sourceVersion: "2" }],
      tenantId: "tenant-other",
      tokenBudget: 200
    });
    assert.equal(foreign.passages.length, 0);

    const usage = AiUsageRepository.inMemory();
    assert.throws(
      () => usage.reserve({
        connectionId: "conn-1",
        monthlyTokenBudget: 100,
        tenantId: "tenant-volga",
        worstCaseTokens: 500
      }),
      /bot_ai_quota_exhausted/
    );
    assert.doesNotThrow(() => usage.reserve({
      connectionId: "conn-1",
      monthlyTokenBudget: 100,
      tenantId: "tenant-ladoga",
      worstCaseTokens: 50
    }));
  });
});
