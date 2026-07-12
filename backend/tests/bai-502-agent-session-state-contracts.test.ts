import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySessionUpdate,
  DEFAULT_AGENT_SESSION_POLICY,
  formatSessionForPrompt,
  isSessionExpired
} from "../apps/api-gateway/src/automation/agent-session-state.ts";
import { AgentSessionStateRepository } from "../apps/api-gateway/src/automation/agent-session-state.repository.ts";
import type { AgentSessionState } from "../apps/api-gateway/src/automation/agent-session-state.types.ts";

function baseState(overrides: Partial<AgentSessionState> = {}): AgentSessionState {
  return {
    conversationId: "conv-a",
    createdAt: "2026-07-12T10:00:00.000Z",
    expiresAt: "2026-07-13T10:00:00.000Z",
    facts: [{ key: "language", value: "ru" }],
    intent: "delivery_status",
    openQuestion: null,
    recentTurns: [],
    scenarioRevisionId: "rev-1",
    schemaVersion: 1,
    summary: "Клиент спрашивает статус доставки.",
    tenantId: "tenant-volga",
    tokenEstimate: 40,
    turnCount: 1,
    updatedAt: "2026-07-12T10:00:00.000Z",
    version: 1,
    ...overrides
  };
}

describe("BAI-502 compact agent session state", () => {
  it("updates facts, intent, open question and summary after each run without storing a full transcript", () => {
    const result = applySessionUpdate(baseState(), {
      assistantText: "Статус обновляется каждый рабочий день.",
      conversationId: "conv-a",
      facts: { orderId: "A-42" },
      intent: "delivery_status",
      openQuestion: "Нужен ли трек-номер?",
      summary: "Клиент ждёт обновление статуса заказа A-42.",
      tenantId: "tenant-volga",
      tokensUsed: 120,
      userText: "Где мой заказ A-42?"
    });

    assert.equal(result.state.intent, "delivery_status");
    assert.equal(result.state.openQuestion, "Нужен ли трек-номер?");
    assert.equal(result.state.summary, "Клиент ждёт обновление статуса заказа A-42.");
    assert.ok(result.state.facts.some((fact) => fact.key === "orderId" && fact.value === "A-42"));
    assert.ok(result.state.facts.some((fact) => fact.key === "language" && fact.value === "ru"));
    assert.equal(result.state.turnCount, 2);
    assert.equal(result.state.version, 2);
    assert.ok(result.state.tokenEstimate >= 120);
    assert.ok(result.state.recentTurns.length <= DEFAULT_AGENT_SESSION_POLICY.maxRecentTurns);
    assert.ok(!JSON.stringify(result.state).includes("Где мой заказ A-42?".repeat(3)));
  });

  it("compacts recent turns into structured state once turn or token thresholds are crossed", () => {
    const longTurns = Array.from({ length: 8 }, (_, index) => ({
      at: `2026-07-12T10:0${index}:00.000Z`,
      role: index % 2 === 0 ? "user" as const : "assistant" as const,
      text: `turn-${index} ${"detail ".repeat(20)}`
    }));
    const result = applySessionUpdate(
      baseState({ recentTurns: longTurns, tokenEstimate: 900, turnCount: 8 }),
      {
        conversationId: "conv-a",
        facts: { promisedAction: "check_status" },
        intent: "delivery_status",
        now: new Date("2026-07-12T11:00:00.000Z"),
        summary: "Клиент уточняет доставку; обещали проверить статус.",
        tenantId: "tenant-volga",
        tokensUsed: 200,
        userText: "Есть новости?"
      },
      { ...DEFAULT_AGENT_SESSION_POLICY, compactionTokenThreshold: 1_000, compactionTurnThreshold: 6, maxRecentTurns: 2 }
    );

    assert.equal(result.compacted, true);
    assert.ok(result.state.recentTurns.length <= 2);
    assert.ok(result.state.facts.some((fact) => fact.key === "promisedAction" && fact.value === "check_status"));
    assert.equal(result.state.intent, "delivery_status");
    assert.match(result.state.summary, /доставк/i);
    assert.ok(result.state.tokenEstimate < 900 + 200);
  });

  it("expires session state by TTL and never mixes tenants or conversations", () => {
    const repository = AgentSessionStateRepository.inMemory();
    const now = new Date("2026-07-12T12:00:00.000Z");
    repository.save(applySessionUpdate(null, {
      conversationId: "conv-a",
      intent: "billing",
      now,
      summary: "Volga billing question",
      tenantId: "tenant-volga",
      userText: "Счёт"
    }, { ...DEFAULT_AGENT_SESSION_POLICY, ttlMs: 60_000 }).state);

    repository.save(applySessionUpdate(null, {
      conversationId: "conv-b",
      intent: "shipping",
      now,
      summary: "Other tenant shipping",
      tenantId: "tenant-other",
      userText: "Доставка"
    }, { ...DEFAULT_AGENT_SESSION_POLICY, ttlMs: 60_000 }).state);

    assert.equal(repository.get("tenant-volga", "conv-a", now)?.intent, "billing");
    assert.equal(repository.get("tenant-other", "conv-a", now), null);
    assert.equal(repository.get("tenant-volga", "conv-b", now), null);
    assert.equal(repository.get("tenant-other", "conv-b", now)?.intent, "shipping");

    const expiredAt = new Date(now.getTime() + 61_000);
    assert.equal(repository.get("tenant-volga", "conv-a", expiredAt), null);
    assert.equal(isSessionExpired(baseState({ expiresAt: "2026-07-12T12:00:30.000Z" }), expiredAt), true);
  });

  it("formats only compact session fields for the model prompt", () => {
    const prompt = formatSessionForPrompt(baseState({
      facts: [{ key: "orderId", value: "A-42" }, { key: "language", value: "ru" }],
      openQuestion: "Нужен трек?",
      recentTurns: [
        { at: "2026-07-12T10:01:00.000Z", role: "user", text: "Где заказ?" },
        { at: "2026-07-12T10:01:05.000Z", role: "assistant", text: "Проверяю статус." }
      ]
    }));

    assert.match(prompt, /Intent: delivery_status/);
    assert.match(prompt, /orderId=A-42/);
    assert.match(prompt, /Open question: Нужен трек\?/);
    assert.match(prompt, /Summary:/);
    assert.match(prompt, /Recent turns:/);
    assert.ok(!prompt.includes("transcript"));
  });
});
