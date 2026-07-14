import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import { BotFeedbackRepository } from "../apps/api-gateway/src/automation/bot-feedback.repository.ts";
import { buildRequestBody } from "../apps/api-gateway/src/ai-connections/openai-compatible-chat.provider.ts";

const TENANT = "tenant-volga";
const CONTEXT = { actor: "operator-1", tenantId: TENANT };

describe("BAI-852 feedback review queue", () => {
  beforeEach(() => {
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    BotFeedbackRepository.useDefault(BotFeedbackRepository.inMemory());
  });
  afterEach(() => {
    AutomationRepository.clearDefault();
    BotFeedbackRepository.clearDefault();
  });

  it("lists review-required feedback and resolves it without mutating knowledge", async () => {
    const automation = new AutomationService();
    await automation.recordBotAiFeedback({ conversationId: "conv-1", outcome: "wrong_source", citationSourceIds: ["src-1"], comment: "Устаревшая цена" }, CONTEXT);
    await automation.recordBotAiFeedback({ conversationId: "conv-2", outcome: "helped" }, CONTEXT);

    const list = await automation.listBotAiFeedback(CONTEXT);
    const items = list.data.feedback as Array<{ feedbackId: string; outcome: string; reviewRequired: boolean }>;
    const pending = items.filter((item) => item.reviewRequired);
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.outcome, "wrong_source");

    const resolved = await automation.resolveBotAiFeedback(pending[0]!.feedbackId, "article_created", CONTEXT);
    assert.equal(resolved.status, "ok");
    assert.equal((resolved.data.feedback as { knowledgeMutated: boolean }).knowledgeMutated, false);
    assert.equal((resolved.data.feedback as { reviewRequired: boolean }).reviewRequired, false);
    assert.equal((resolved.data.feedback as { resolvedAction: string }).resolvedAction, "article_created");

    const after = await automation.listBotAiFeedback(CONTEXT);
    assert.equal((after.data.feedback as Array<{ reviewRequired: boolean }>).filter((item) => item.reviewRequired).length, 0);
  });

  it("keeps feedback tenant-scoped and rejects unknown ids", async () => {
    const automation = new AutomationService();
    await automation.recordBotAiFeedback({ conversationId: "conv-1", outcome: "not_helped" }, CONTEXT);

    const foreign = await automation.listBotAiFeedback({ actor: "x", tenantId: "tenant-ladoga" });
    assert.equal((foreign.data.feedback as unknown[]).length, 0);

    const missing = await automation.resolveBotAiFeedback("bot_fb_missing", "reviewed", CONTEXT);
    assert.equal(missing.error?.code, "bot_feedback_not_found");
  });
});

describe("BAI-851 stable prompt cache key", () => {
  it("passes a PII-free prompt_cache_key through to the provider body", () => {
    const body = buildRequestBody(
      { messages: [{ content: "policy", role: "system" }, { content: "Q", role: "user" }], promptCacheKey: "bot:tenant-volga:bot-1:v3" },
      "gpt-test"
    );
    assert.equal(body.prompt_cache_key, "bot:tenant-volga:bot-1:v3");
    assert.equal(String(body.prompt_cache_key).includes("@"), false);
  });
});
