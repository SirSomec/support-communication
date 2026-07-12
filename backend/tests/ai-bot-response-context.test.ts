import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractRelevantKnowledge } from "../apps/api-gateway/src/automation/ai-bot-response.service.ts";

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
