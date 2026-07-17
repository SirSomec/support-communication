import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRequestBody,
  createOpenAiCompatibleChatProvider
} from "../apps/api-gateway/src/ai-connections/openai-compatible-chat.provider.ts";

describe("BAI-871 provider cache primitives (AITunnel prompt caching)", () => {
  it("serializes systemBlocks as one system message with an explicit cache breakpoint", () => {
    const body = buildRequestBody(
      {
        messages: [{ content: "Question", role: "user" }],
        systemBlocks: [
          { text: "Selector instructions" },
          { cacheControl: { ttl: "1h" }, text: "Knowledge corpus" }
        ]
      },
      "expensive-model"
    );
    const messages = body.messages as Array<Record<string, unknown>>;
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "system");
    assert.deepEqual(messages[0].content, [
      { type: "text", text: "Selector instructions" },
      { type: "text", text: "Knowledge corpus", cache_control: { type: "ephemeral", ttl: "1h" } }
    ]);
    assert.deepEqual(messages[1], { content: "Question", role: "user" });
  });

  it("serializes top-level cache_control and session_id per AITunnel docs", () => {
    const body = buildRequestBody(
      {
        cacheControl: {},
        messages: [{ content: "Q", role: "user" }],
        sessionId: `  kr:tenant-volga:bot-1:${"x".repeat(300)}  `
      },
      "model"
    );
    assert.deepEqual(body.cache_control, { type: "ephemeral" });
    const sessionId = String(body.session_id);
    assert.equal(sessionId.length, 256);
    assert.equal(sessionId.startsWith("kr:tenant-volga:bot-1:"), true);
    assert.equal(sessionId.includes(" "), false);
  });

  it("rejects an empty system block instead of sending a hollow cache breakpoint", () => {
    assert.throws(
      () => buildRequestBody({ messages: [{ content: "Q", role: "user" }], systemBlocks: [{ text: "   " }] }, "model"),
      /ai_chat_message_invalid/
    );
  });

  it("keeps legacy requests byte-compatible when no cache fields are set", () => {
    const body = buildRequestBody({ messages: [{ content: "Q", role: "user" }], promptCacheKey: "bot:t:s:v" }, "model");
    assert.deepEqual(Object.keys(body).sort(), ["messages", "model", "prompt_cache_key"]);
  });

  it("parses cached_tokens and cache_write_tokens from the provider usage payload", async () => {
    const provider = createOpenAiCompatibleChatProvider(
      { apiKey: "sk-aitunnel-test", baseUrl: "https://api.aitunnel.ru/v1", maxRetries: 0, model: "expensive-model" },
      {
        fetch: (async () => new Response(JSON.stringify({
          choices: [{ message: { content: "{\"chunks\":[]}" } }],
          id: "req-1",
          model: "expensive-model",
          usage: {
            completion_tokens: 12,
            prompt_tokens: 4000,
            prompt_tokens_details: { cache_write_tokens: 3900, cached_tokens: 100 },
            total_tokens: 4012
          }
        }), { headers: { "Content-Type": "application/json" }, status: 200 })) as typeof fetch
      }
    );
    const result = await provider.complete({ messages: [{ content: "Q", role: "user" }] });
    assert.equal(result.usage.cachedTokens, 100);
    assert.equal(result.usage.cacheWriteTokens, 3900);
    assert.equal(result.usage.totalTokens, 4012);
  });
});
