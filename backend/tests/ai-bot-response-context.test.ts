import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildAiBotSystemPrompt, extractRelevantKnowledge } from "../apps/api-gateway/src/automation/ai-bot-response.service.ts";

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
});
