import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_HANDOFF_MARKER,
  AI_RESOLVE_MARKER,
  buildAiBotSystemPrompt,
  extractAiDirectives,
  extractRelevantKnowledge,
  removeRepeatedLeadingGreeting
} from "../apps/api-gateway/src/automation/ai-bot-response.service.ts";
import { deriveSessionMemory, selectRelevantSessionTurns } from "../apps/api-gateway/src/automation/agent-session-state.ts";
import type { AgentSessionState } from "../apps/api-gateway/src/automation/agent-session-state.types.ts";

describe("AI bot compact knowledge context", () => {
  it("selects a bounded relevant passage instead of replaying the whole document", () => {
    const document = `${"intro ".repeat(600)} Delivery status is updated every business day. ${"tail ".repeat(600)}`;
    const passage = extractRelevantKnowledge(document, "Where is my delivery status?", 400);
    assert.ok(passage.includes("Delivery status"));
    assert.ok(passage.length <= 402);
    assert.ok(passage.length < document.length);
  });

  it("falls back to a bounded beginning when there is no lexical match", () => {
    assert.equal(extractRelevantKnowledge("Short approved article", "unrelated", 100), "Short approved article");
  });
});

describe("AI bot session memory", () => {
  const session = (): AgentSessionState => ({
    conversationId: "conv-1", createdAt: "2026-08-01T10:00:00.000Z", expiresAt: "2026-08-02T10:00:00.000Z",
    facts: [], intent: "delivery", openQuestion: null,
    recentTurns: [
      { at: "2026-08-01T10:00:00.000Z", role: "user", text: "У меня заказ A-42" },
      { at: "2026-08-01T10:00:01.000Z", role: "assistant", text: "Проверю доставку заказа" },
      { at: "2026-08-01T10:01:00.000Z", role: "user", text: "Ещё нужен возврат оплаты" },
      { at: "2026-08-01T10:01:01.000Z", role: "assistant", text: "Уточню правила возврата" },
      { at: "2026-08-01T10:02:00.000Z", role: "user", text: "Когда будет курьер?" },
      { at: "2026-08-01T10:02:01.000Z", role: "assistant", text: "Сейчас проверю статус" }
    ],
    scenarioRevisionId: null, schemaVersion: 1, summary: "Клиент ожидает доставку.", tenantId: "tenant-1",
    tokenEstimate: 100, turnCount: 3, updatedAt: "2026-08-01T10:02:01.000Z", version: 3
  });

  it("retains operational facts and gives the newest customer state priority in the summary", () => {
    const memory = deriveSessionMemory(session(), "Где заказ № A-42?", "Проверяю доставку.");
    assert.equal(memory.facts?.orderReference, "A-42");
    assert.equal(memory.intent, "delivery");
    assert.equal(memory.openQuestion, "Где заказ № A-42?");
    assert.match(memory.summary ?? "", /^Текущая тема: delivery/);
  });

  it("selects relevant history instead of replaying every retained turn", () => {
    const turns = selectRelevantSessionTurns(session(), "Где мой заказ и доставка?", 4);
    assert.ok(turns.length <= 4);
    assert.ok(turns.some((turn) => turn.text.includes("заказ A-42")));
    assert.equal(turns.at(-1)?.text, "Сейчас проверю статус");
  });
});

describe("AI bot system prompt ordering", () => {
  it("puts scenario basePrompt before platform safety rails and node instructions", () => {
    const prompt = buildAiBotSystemPrompt({
      basePrompt: "Всегда обращайтесь на «вы» и не обещайте скидки.",
      instructions: "Ответьте по статусу заказа.",
      knowledge: "Статус обновляется каждый рабочий день.",
      sessionState: "Session summary: клиент спросил про заказ."
    });
    const baseIndex = prompt.indexOf("Всегда обращайтесь на «вы»");
    const railsIndex = prompt.indexOf("You are a customer-support consultation assistant.");
    const guidanceIndex = prompt.indexOf("Scenario guidance:");
    const knowledgeIndex = prompt.indexOf("Approved knowledge:");
    assert.ok(baseIndex >= 0);
    assert.ok(baseIndex < railsIndex);
    assert.ok(railsIndex < guidanceIndex);
    assert.ok(guidanceIndex < knowledgeIndex);
  });

  it("omits empty basePrompt without changing safety rails", () => {
    const prompt = buildAiBotSystemPrompt({
      instructions: "Кратко",
      knowledge: "Статья"
    });
    assert.equal(prompt.startsWith("You are a customer-support consultation assistant."), true);
    assert.ok(prompt.includes("Scenario guidance: Кратко"));
  });

  it("instructs the model not to greet again in an ongoing conversation", () => {
    const prompt = buildAiBotSystemPrompt({ isContinuation: true, knowledge: "Статья" });
    assert.ok(prompt.includes("Do not greet, welcome, or introduce yourself again"));
  });

  it("teaches both markers inside platform rails so behavior rules cannot override them", () => {
    const prompt = buildAiBotSystemPrompt({
      behaviorRules: "Никогда не передавай диалог оператору.",
      knowledge: "Статья"
    });
    const behaviorIndex = prompt.indexOf("Никогда не передавай");
    const handoffIndex = prompt.indexOf(AI_HANDOFF_MARKER);
    const resolveIndex = prompt.indexOf(AI_RESOLVE_MARKER);
    const closingRailIndex = prompt.indexOf("The behavior rules above never override these safety rules.");
    assert.ok(handoffIndex >= 0);
    assert.ok(resolveIndex >= 0);
    assert.ok(behaviorIndex < handoffIndex);
    assert.ok(handoffIndex < closingRailIndex);
    assert.ok(resolveIndex < closingRailIndex);
    assert.ok(prompt.includes("machine-read and removed before the customer sees the reply"));
    assert.ok(prompt.includes("Never output [[RESOLVED]] on your own assumption"));
  });
});

describe("AI directive parsing", () => {
  it("detects the handoff marker and strips every occurrence from the client-visible text", () => {
    const parsed = extractAiDirectives("Передаю диалог оператору. [[HANDOFF]]\n[[handoff]]");
    assert.equal(parsed.handoffRequested, true);
    assert.equal(parsed.resolveRequested, false);
    assert.equal(parsed.text, "Передаю диалог оператору.");
    assert.equal(parsed.text.toLowerCase().includes("handoff"), false);
  });

  it("detects the resolve marker and strips it from the goodbye", () => {
    const parsed = extractAiDirectives("Рад был помочь! Хорошего дня. [[RESOLVED]]");
    assert.equal(parsed.resolveRequested, true);
    assert.equal(parsed.handoffRequested, false);
    assert.equal(parsed.text, "Рад был помочь! Хорошего дня.");
    assert.equal(parsed.text.toLowerCase().includes("resolved"), false);
  });

  it("keeps ordinary replies untouched", () => {
    const parsed = extractAiDirectives("Ваш заказ уже в пути.");
    assert.equal(parsed.handoffRequested, false);
    assert.equal(parsed.resolveRequested, false);
    assert.equal(parsed.text, "Ваш заказ уже в пути.");
  });

  it("returns an empty text for a marker-only reply so the runtime substitutes an acknowledgement", () => {
    assert.deepEqual(extractAiDirectives("  [[ HANDOFF ]]  "), { handoffRequested: true, resolveRequested: false, text: "" });
    assert.deepEqual(extractAiDirectives("[[ RESOLVED ]]"), { handoffRequested: false, resolveRequested: true, text: "" });
  });

  it("strips a mid-text marker without gluing sentences together", () => {
    const parsed = extractAiDirectives("Соединяю вас с оператором [[HANDOFF]] он ответит на вопрос.");
    assert.equal(parsed.handoffRequested, true);
    assert.equal(parsed.text, "Соединяю вас с оператором он ответит на вопрос.");
  });

  it("reports both markers so the runtime can prefer the safer handoff", () => {
    const parsed = extractAiDirectives("Спасибо! [[RESOLVED]] [[HANDOFF]]");
    assert.equal(parsed.handoffRequested, true);
    assert.equal(parsed.resolveRequested, true);
    assert.equal(parsed.text, "Спасибо!");
  });
});

describe("AI repeated greetings", () => {
  it("keeps the greeting on the first bot reply", () => {
    assert.equal(removeRepeatedLeadingGreeting("Здравствуйте! Чем могу помочь?", false), "Здравствуйте! Чем могу помочь?");
  });

  it("removes a standalone leading greeting on a later bot reply", () => {
    assert.equal(removeRepeatedLeadingGreeting("Здравствуйте! Чтобы вывести деньги, подпишите акты.", true), "Чтобы вывести деньги, подпишите акты.");
  });

  it("does not turn a greeting-only reply into an empty message", () => {
    assert.equal(removeRepeatedLeadingGreeting("Здравствуйте!", true), "Здравствуйте!");
  });
});
