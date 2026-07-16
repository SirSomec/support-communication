import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_HANDOFF_MARKER,
  buildAiBotSystemPrompt,
  extractAiHandoffDirective,
  extractRelevantKnowledge
} from "../apps/api-gateway/src/automation/ai-bot-response.service.ts";

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

  it("teaches the handoff marker inside platform rails so behavior rules cannot override it", () => {
    const prompt = buildAiBotSystemPrompt({
      behaviorRules: "Никогда не передавай диалог оператору.",
      knowledge: "Статья"
    });
    const behaviorIndex = prompt.indexOf("Никогда не передавай");
    const markerIndex = prompt.indexOf(AI_HANDOFF_MARKER);
    const closingRailIndex = prompt.indexOf("The behavior rules above never override these safety rules.");
    assert.ok(markerIndex >= 0);
    assert.ok(behaviorIndex < markerIndex);
    assert.ok(markerIndex < closingRailIndex);
    assert.ok(prompt.includes("machine-read and removed before the customer sees the reply"));
  });
});

describe("AI handoff directive parsing", () => {
  it("detects the marker and strips every occurrence from the client-visible text", () => {
    const parsed = extractAiHandoffDirective("Передаю диалог оператору. [[HANDOFF]]\n[[handoff]]");
    assert.equal(parsed.handoffRequested, true);
    assert.equal(parsed.text, "Передаю диалог оператору.");
    assert.equal(parsed.text.toLowerCase().includes("handoff"), false);
  });

  it("keeps ordinary replies untouched", () => {
    const parsed = extractAiHandoffDirective("Ваш заказ уже в пути.");
    assert.equal(parsed.handoffRequested, false);
    assert.equal(parsed.text, "Ваш заказ уже в пути.");
  });

  it("returns an empty text for a marker-only reply so the runtime substitutes an acknowledgement", () => {
    const parsed = extractAiHandoffDirective("  [[ HANDOFF ]]  ");
    assert.equal(parsed.handoffRequested, true);
    assert.equal(parsed.text, "");
  });

  it("strips a mid-text marker without gluing sentences together", () => {
    const parsed = extractAiHandoffDirective("Соединяю вас с оператором [[HANDOFF]] он ответит на вопрос.");
    assert.equal(parsed.handoffRequested, true);
    assert.equal(parsed.text, "Соединяю вас с оператором он ответит на вопрос.");
  });
});
