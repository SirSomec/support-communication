import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AutomationRepository, createEmptyAutomationState } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { BotRuntimeService } from "../apps/api-gateway/src/automation/bot-runtime.service.ts";
import { BotSandboxService } from "../apps/api-gateway/src/automation/bot-sandbox.service.ts";
import { BotSandboxSessionRepository, type BotSandboxPrismaClient, type PrismaBotSandboxSessionRow, type PrismaBotSandboxUsageRow } from "../apps/api-gateway/src/automation/bot-sandbox-session.repository.ts";
import { AiConnectionRepository, type AiConnectionRecord } from "../apps/api-gateway/src/ai-connections/ai-connection.repository.ts";
import type { BotSandboxSession } from "../apps/api-gateway/src/automation/bot-sandbox.types.ts";
import type { BotScenario } from "../apps/api-gateway/src/automation/automation.types.ts";

const TENANT = "tenant-1";

function consultationRepository(aiConfig: Record<string, unknown> = {}, extraNodes: BotScenario["flowNodes"] = [], extraEdges: BotScenario["flowEdges"] = []) {
  const nodes: BotScenario["flowNodes"] = [
    { id: "start", type: "condition" },
    { id: "ai", type: "ai_reply", config: { consultationMode: true, handoffQueue: "Support", maxTurns: 3, ...aiConfig } },
    ...extraNodes
  ];
  const edges: BotScenario["flowEdges"] = [{ from: "start", to: "ai" }, ...extraEdges];
  const state = createEmptyAutomationState();
  state.botScenarios.push({ activeVersionId: "v1", channels: ["SDK"], enabled: true, flowEdges: edges, flowNodes: nodes, id: "bot-1", name: "Консультант", schemaVersion: "bot-flow/v1", sourceBindings: [{ sourceId: "source-1" }], status: "published", tenantId: TENANT });
  state.botScenarioVersions.push({ createdAt: "2026-07-13T10:00:00.000Z", flowEdges: edges, flowNodes: nodes, scenarioId: "bot-1", sourceBindings: [{ sourceId: "source-1" }], status: "published", tenantId: TENANT, versionId: "v1" });
  return AutomationRepository.inMemory(state);
}

function inboundEvent(eventId: string, text: string) {
  return { channel: "SDK", conversationId: "conv-1", eventId, payload: { text }, scenarioId: "bot-1", tenantId: TENANT, traceId: "trace-1" };
}

const okResponder = (calls: string[] = []) => ({
  respond: async (input: { message: string }) => {
    calls.push(input.message);
    return { citations: [{ endOffset: 10, sourceId: "source-1", startOffset: 0, title: "FAQ", version: 1 }], model: "test-model", text: `Ответ на: ${input.message}`, usage: { totalTokens: 42 } };
  }
});

describe("BAI-800 consultation loop in the runtime", () => {
  it("stays on the ai_reply node across plain-text turns and counts consultation turns", async () => {
    const repo = consultationRepository();
    const runtime = new BotRuntimeService(repo, { aiResponder: okResponder() });
    const first = await runtime.handleInboundEvent(inboundEvent("evt-1", "Как оплатить заказ?"));
    assert.equal(first.step.nodeId, "ai");
    assert.equal(first.instance.currentNodeId, "ai");
    const second = await runtime.handleInboundEvent(inboundEvent("evt-2", "А если картой не получается?"));
    assert.equal(second.step.nodeId, "ai");
    assert.equal(second.step.outcome, "ai_reply_queued");
    assert.equal(second.instance.context.consultationTurns, 2);
    assert.equal((second.step.sideEffects[0] as { descriptor: { payload: { text: string } } }).descriptor.payload.text.includes("картой"), true);
  });

  it("hands off when the client asks for a human operator", async () => {
    const repo = consultationRepository();
    const runtime = new BotRuntimeService(repo, { aiResponder: okResponder() });
    await runtime.handleInboundEvent(inboundEvent("evt-1", "Вопрос про доставку"));
    const handoff = await runtime.handleInboundEvent(inboundEvent("evt-2", "Позовите оператора, пожалуйста"));
    assert.equal(handoff.instance.status, "handoff");
    assert.equal(handoff.step.outcome, "ai_handoff_requested");
    assert.equal(handoff.step.handoffSummary?.reason, "client_requested_operator");
    assert.equal(handoff.step.handoffSummary?.queue, "Support");
  });

  it("hands off at the configured turn limit instead of answering forever", async () => {
    const repo = consultationRepository({ maxTurns: 2 });
    const runtime = new BotRuntimeService(repo, { aiResponder: okResponder() });
    await runtime.handleInboundEvent(inboundEvent("evt-1", "Первый вопрос"));
    await runtime.handleInboundEvent(inboundEvent("evt-2", "Второй вопрос"));
    const third = await runtime.handleInboundEvent(inboundEvent("evt-3", "Третий вопрос"));
    assert.equal(third.instance.status, "handoff");
    assert.equal(third.step.handoffSummary?.reason, "bot_ai_consultation_turn_limit");
  });

  it("keeps the bot silent after a handoff", async () => {
    const repo = consultationRepository({ maxTurns: 1 });
    const runtime = new BotRuntimeService(repo, { aiResponder: okResponder() });
    await runtime.handleInboundEvent(inboundEvent("evt-1", "Вопрос"));
    await runtime.handleInboundEvent(inboundEvent("evt-2", "Ещё вопрос"));
    await assert.rejects(
      () => runtime.handleInboundEvent(inboundEvent("evt-3", "Бот, ты тут?")),
      /bot_runtime_conversation_inactive/
    );
    assert.equal(repo.readState().botRuntimeSteps.length, 2);
  });

  it("keeps legacy edge-based transitions for ai_reply nodes without consultation mode", async () => {
    const state = createEmptyAutomationState();
    const nodes: BotScenario["flowNodes"] = [
      { id: "start", type: "condition" },
      { id: "ai", type: "ai_reply", config: {} },
      { id: "bye", type: "message", title: "До связи!" }
    ];
    const edges: BotScenario["flowEdges"] = [{ from: "start", to: "ai" }, { from: "ai", to: "bye" }];
    state.botScenarios.push({ activeVersionId: "v1", channels: ["SDK"], enabled: true, flowEdges: edges, flowNodes: nodes, id: "bot-1", name: "Legacy", schemaVersion: "bot-flow/v1", status: "published", tenantId: TENANT });
    state.botScenarioVersions.push({ createdAt: "2026-07-13T10:00:00.000Z", flowEdges: edges, flowNodes: nodes, scenarioId: "bot-1", status: "published", tenantId: TENANT, versionId: "v1" });
    const runtime = new BotRuntimeService(AutomationRepository.inMemory(state), { aiResponder: okResponder() });
    await runtime.handleInboundEvent(inboundEvent("evt-1", "Вопрос"));
    const second = await runtime.handleInboundEvent(inboundEvent("evt-2", "Спасибо"));
    assert.equal(second.step.nodeId, "bye");
    assert.equal(second.step.outcome, "message_queued");
  });
});

function sandboxFixtures(overrides: { aiConfig?: Record<string, unknown>; scenarioStatus?: string } = {}) {
  const nodes: BotScenario["flowNodes"] = [
    { id: "start", type: "condition" },
    { id: "ai", type: "ai_reply", config: { consultationMode: true, handoffQueue: "Support", maxTurns: 5, ...(overrides.aiConfig ?? {}) } }
  ];
  const edges: BotScenario["flowEdges"] = [{ from: "start", to: "ai" }];
  const state = createEmptyAutomationState();
  state.botScenarios.push({
    channels: ["SDK", "Telegram"],
    enabled: overrides.scenarioStatus !== "draft",
    flowEdges: edges,
    flowNodes: nodes,
    id: "bot-1",
    name: "Консультант",
    schemaVersion: "bot-flow/v1",
    sourceBindings: [],
    status: overrides.scenarioStatus ?? "draft",
    tenantId: TENANT,
    triggerRules: [{ id: "rule-1", matchMode: "contains", phrases: ["заказ"], priority: 1, type: "phrase" }]
  });
  const automationRepository = AutomationRepository.inMemory(state);
  const sessions = BotSandboxSessionRepository.inMemory();
  const connections = AiConnectionRepository.inMemory();
  return { automationRepository, connections, sessions };
}

function readyConnection(limits: AiConnectionRecord["limits"] = {}): AiConnectionRecord {
  return {
    baseUrl: "https://ai.example.test/v1",
    capabilities: ["chat_completion"],
    chatModel: "test-model",
    createdAt: "2026-07-13T10:00:00.000Z",
    disabledAt: null,
    embeddingModel: null,
    id: "conn-1",
    keyVersion: "local-v1",
    lastTestMessage: null,
    lastTestStatus: "passed",
    lastTestedAt: "2026-07-13T10:00:00.000Z",
    limits,
    providerType: "openai_compatible",
    retrievalModel: null,
    secret: { authTag: "dGFn", ciphertext: "c2VjcmV0", iv: "aXY=", keyVersion: "local-v1" } as unknown as AiConnectionRecord["secret"],
    status: "ready",
    tenantId: TENANT,
    updatedAt: "2026-07-13T10:00:00.000Z"
  };
}

describe("BAI-801/802 sandbox sessions: isolation, idempotency, budget", () => {
  it("runs a multi-turn live chat without touching production runtime state", async () => {
    const { automationRepository, connections, sessions } = sandboxFixtures();
    const calls: string[] = [];
    const sandbox = new BotSandboxService(automationRepository, { aiResponder: okResponder(calls), connections, sessions });
    const session = await sandbox.createSession({ actor: "admin-1", scenarioId: "bot-1", tenantId: TENANT });
    assert.equal(session.mode, "draft");

    const first = await sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Где мой заказ №42?" });
    assert.equal(first.turn.messages[0]?.text.includes("заказ"), true);
    assert.equal(first.turn.trace?.aiCalled, true);
    assert.equal(first.turn.trace?.trigger.matched, true);
    assert.equal(first.session.usage.totalTokens, 42);

    const second = await sandbox.postMessage({ messageId: "m2", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "А когда привезут?" });
    assert.equal(second.turn.trace?.consultationTurns, 2);
    assert.equal(calls.length, 2);

    const state = automationRepository.readState();
    assert.equal(state.botRuntimeInstances.length, 0);
    assert.equal(state.botRuntimeSteps.length, 0);
    assert.equal(state.botRuntimeSideEffects.length, 0);
  });

  it("replays a repeated messageId without a second AI call", async () => {
    const { automationRepository, connections, sessions } = sandboxFixtures();
    const calls: string[] = [];
    const sandbox = new BotSandboxService(automationRepository, { aiResponder: okResponder(calls), connections, sessions });
    const session = await sandbox.createSession({ actor: "admin-1", scenarioId: "bot-1", tenantId: TENANT });
    const first = await sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Где заказ?" });
    const replay = await sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Где заказ?" });
    assert.equal(calls.length, 1);
    assert.deepEqual(replay.turn, first.turn);
  });

  it("marks the session as handed off and stays silent afterwards", async () => {
    const { automationRepository, connections, sessions } = sandboxFixtures();
    const calls: string[] = [];
    const sandbox = new BotSandboxService(automationRepository, { aiResponder: okResponder(calls), connections, sessions });
    const session = await sandbox.createSession({ actor: "admin-1", scenarioId: "bot-1", tenantId: TENANT });
    await sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Вопрос про заказ" });
    const handoff = await sandbox.postMessage({ messageId: "m2", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Позовите оператора" });
    assert.equal(handoff.session.status, "handoff");
    assert.equal(handoff.turn.events.some((event) => event.kind === "handoff" && event.reason === "client_requested_operator"), true);

    const after = await sandbox.postMessage({ messageId: "m3", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Ау?" });
    assert.equal(after.turn.events[0]?.kind, "bot_inactive");
    assert.equal(calls.length, 1);
  });

  it("stops the live chat when the sandbox token budget is exhausted", async () => {
    const { automationRepository, connections, sessions } = sandboxFixtures();
    connections.save(readyConnection({ sandboxMonthlyTokenBudget: 100 }));
    sessions.recordSandboxUsage(TENANT, 90);
    const sandbox = new BotSandboxService(automationRepository, { aiResponder: okResponder(), connections, sessions });
    const session = await sandbox.createSession({ actor: "admin-1", scenarioId: "bot-1", tenantId: TENANT });
    await assert.rejects(
      () => sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Где заказ?" }),
      /bot_sandbox_budget_exhausted/
    );
  });

  it("denies cross-tenant access to sandbox sessions", async () => {
    const { automationRepository, connections, sessions } = sandboxFixtures();
    const sandbox = new BotSandboxService(automationRepository, { aiResponder: okResponder(), connections, sessions });
    const session = await sandbox.createSession({ actor: "admin-1", scenarioId: "bot-1", tenantId: TENANT });
    await assert.rejects(
      () => sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: "tenant-2", text: "Привет" }),
      /bot_sandbox_session_not_found/
    );
  });

  it("shows a forced start in the trace when the trigger would not fire", async () => {
    const { automationRepository, connections, sessions } = sandboxFixtures();
    const sandbox = new BotSandboxService(automationRepository, { aiResponder: okResponder(), connections, sessions });
    const session = await sandbox.createSession({ actor: "admin-1", scenarioId: "bot-1", tenantId: TENANT });
    const result = await sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Просто привет" });
    assert.equal(result.turn.trace?.trigger.matched, false);
    assert.equal(result.turn.trace?.trigger.forcedStart, true);
    assert.equal(result.turn.messages.length > 0, true);
  });

  it("saves the dialog as a regression test run in the real repository", async () => {
    const { automationRepository, connections, sessions } = sandboxFixtures();
    const sandbox = new BotSandboxService(automationRepository, { aiResponder: okResponder(), connections, sessions });
    const session = await sandbox.createSession({ actor: "admin-1", scenarioId: "bot-1", tenantId: TENANT });
    await sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Где заказ №1?" });
    const run = await sandbox.saveRegression({ actor: "admin-1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT });
    assert.equal(run.queue, "bot-sandbox-regression");
    assert.equal(run.cases.length, 1);
    assert.equal((run.cases[0] as { message: string }).message, "Где заказ №1?");
    assert.equal(automationRepository.readState().botTestRuns.some((item) => item.testRunId === run.testRunId), true);
  });

  it("expires sessions by TTL", async () => {
    const { automationRepository, connections, sessions } = sandboxFixtures();
    let now = new Date("2026-07-13T10:00:00.000Z");
    const sandbox = new BotSandboxService(automationRepository, { aiResponder: okResponder(), connections, now: () => now, sessions });
    const session = await sandbox.createSession({ actor: "admin-1", scenarioId: "bot-1", tenantId: TENANT });
    now = new Date("2026-07-13T13:00:00.000Z");
    await assert.rejects(
      () => sandbox.postMessage({ messageId: "m1", scenarioId: "bot-1", sessionId: session.id, tenantId: TENANT, text: "Привет" }),
      /bot_sandbox_session_not_found/
    );
  });
});

function inMemoryPrismaBotSandboxClient(): BotSandboxPrismaClient {
  const sessions = new Map<string, PrismaBotSandboxSessionRow>();
  const usage = new Map<string, PrismaBotSandboxUsageRow>();
  const usageKey = (tenantId: string, month: string) => `${tenantId} ${month}`;
  return {
    botSandboxSession: {
      deleteMany: async ({ where }) => {
        let count = 0;
        for (const [key, row] of [...sessions.entries()]) {
          const hasFilter = where.id !== undefined || where.tenantId !== undefined || where.expiresAt !== undefined;
          const matchesId = where.id === undefined || row.id === where.id;
          const matchesTenant = where.tenantId === undefined || row.tenantId === where.tenantId;
          const matchesExpiry = where.expiresAt === undefined || row.expiresAt.getTime() <= where.expiresAt.lte.getTime();
          if (hasFilter && matchesId && matchesTenant && matchesExpiry) { sessions.delete(key); count += 1; }
        }
        return { count };
      },
      findFirst: async ({ where }) => [...sessions.values()].find((row) => row.id === where.id && row.tenantId === where.tenantId) ?? null,
      findMany: async ({ where }) => [...sessions.values()].filter((row) => row.tenantId === where.tenantId).sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()),
      upsert: async ({ create, update, where }) => {
        const existing = sessions.get(where.id);
        const next = (existing ? { ...existing, ...update } : { ...create }) as PrismaBotSandboxSessionRow;
        sessions.set(where.id, next);
        return next;
      }
    },
    botSandboxUsageCounter: {
      findUnique: async ({ where }) => usage.get(usageKey(where.tenantId_month.tenantId, where.tenantId_month.month)) ?? null,
      upsert: async ({ create, update, where }) => {
        const key = usageKey(where.tenantId_month.tenantId, where.tenantId_month.month);
        const existing = usage.get(key);
        const next = existing
          ? {
            ...existing,
            usedTokens: typeof update.usedTokens === "number"
              ? update.usedTokens
              : existing.usedTokens + update.usedTokens.increment
          }
          : { ...create };
        usage.set(key, next);
        return next;
      }
    }
  };
}

function sandboxSession(overrides: Partial<BotSandboxSession> = {}): BotSandboxSession {
  return {
    channel: "SDK",
    context: {},
    createdAt: "2026-07-13T10:00:00.000Z",
    createdBy: "admin-1",
    currentNodeId: null,
    expiresAt: "2026-07-13T12:00:00.000Z",
    id: "sbx-1",
    locale: "ru-RU",
    mode: "draft",
    scenarioId: "bot-1",
    scenarioName: "Консультант",
    status: "active",
    tenantId: TENANT,
    turns: [],
    updatedAt: "2026-07-13T10:00:00.000Z",
    usage: { totalTokens: 0 },
    versionId: "v1",
    webhooksEnabled: false,
    ...overrides
  };
}

describe("BAI-806 bot sandbox session prisma branch", () => {
  it("persists, round-trips JSON fields, expires by TTL and stays tenant-scoped", async () => {
    const repository = BotSandboxSessionRepository.prisma({ client: inMemoryPrismaBotSandboxClient() });
    const now = new Date("2026-07-13T10:30:00.000Z");

    await repository.save(sandboxSession({
      id: "sbx-1",
      turns: [{ at: "2026-07-13T10:05:00.000Z", clientMessageId: "m1", clientText: "Где заказ?", events: [], messages: [], trace: null }],
      usage: { totalTokens: 42 }
    }));
    await repository.save(sandboxSession({ id: "sbx-2", tenantId: "tenant-2" }));

    const found = await repository.find(TENANT, "sbx-1", now);
    assert.equal(found?.scenarioName, "Консультант");
    assert.equal(found?.usage.totalTokens, 42);
    assert.equal(found?.turns.length, 1);
    assert.equal(found?.turns[0]?.clientText, "Где заказ?");
    assert.equal(await repository.find("tenant-2", "sbx-1", now), null);
    assert.equal(await repository.find(TENANT, "sbx-2", now), null);

    const expired = new Date("2026-07-13T12:30:00.000Z");
    assert.equal(await repository.find(TENANT, "sbx-1", expired), null);
    assert.equal(await repository.find(TENANT, "sbx-1", now), null);
  });

  it("counts sandbox usage per tenant and month and purges expired sessions", async () => {
    const repository = BotSandboxSessionRepository.prisma({ client: inMemoryPrismaBotSandboxClient() });
    const july = new Date("2026-07-13T10:00:00.000Z");
    const august = new Date("2026-08-01T10:00:00.000Z");

    await repository.recordSandboxUsage(TENANT, 90, july);
    await repository.recordSandboxUsage(TENANT, 10, july);
    await repository.recordSandboxUsage("tenant-2", 5, july);
    assert.equal(await repository.sandboxUsage(TENANT, july), 100);
    assert.equal(await repository.sandboxUsage("tenant-2", july), 5);
    assert.equal(await repository.sandboxUsage(TENANT, august), 0);

    await repository.save(sandboxSession({ id: "live", expiresAt: "2026-07-13T12:00:00.000Z" }));
    await repository.save(sandboxSession({ id: "stale", expiresAt: "2026-07-13T09:00:00.000Z" }));
    assert.equal(await repository.purgeExpired(new Date("2026-07-13T11:00:00.000Z")), 1);
    assert.ok(await repository.find(TENANT, "live", july));
    assert.equal(await repository.find(TENANT, "stale", july), null);
  });

  it("atomically accumulates concurrent sandbox token usage", async () => {
    const repository = BotSandboxSessionRepository.prisma({ client: inMemoryPrismaBotSandboxClient() });
    const july = new Date("2026-07-13T10:00:00.000Z");

    await Promise.all(Array.from({ length: 25 }, () => repository.recordSandboxUsage(TENANT, 4, july)));

    assert.equal(await repository.sandboxUsage(TENANT, july), 100);
  });

  it("evicts the oldest session once a tenant crosses the per-tenant cap", async () => {
    const repository = BotSandboxSessionRepository.prisma({ client: inMemoryPrismaBotSandboxClient() });
    const now = new Date("2026-07-13T20:00:00.000Z");
    for (let index = 0; index < 51; index += 1) {
      const minute = String(index).padStart(2, "0");
      await repository.save(sandboxSession({ id: `sbx-${index}`, updatedAt: `2026-07-13T10:${minute}:00.000Z`, expiresAt: "2026-07-13T23:00:00.000Z" }));
    }
    assert.equal(await repository.find(TENANT, "sbx-0", now), null);
    assert.ok(await repository.find(TENANT, "sbx-1", now));
    assert.ok(await repository.find(TENANT, "sbx-50", now));
  });
});
