import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiProviderError, createOpenAiCompatibleChatProvider } from "./openai-compatible-chat.provider.js";

describe("OpenAI-compatible chat provider", () => {
  it("sends an OpenAI-compatible request and exposes only safe completion data", async () => {
    let endpoint = "";
    let authorization = "";
    let body = "";
    const provider = createOpenAiCompatibleChatProvider(connection(), {
      fetch: async (url, init) => {
        endpoint = String(url);
        authorization = String((init?.headers as Record<string, string>).Authorization);
        body = String(init?.body);
        return jsonResponse(completion());
      }
    });

    const result = await provider.complete({ messages: [{ content: "Answer briefly", role: "system" }, { content: "Hello", role: "user" }], temperature: 0.2 });

    assert.equal(endpoint, "https://ai.example.test/v1/chat/completions");
    assert.equal(authorization, "Bearer super-secret-key");
    assert.match(body, /"model":"chat-model"/);
    assert.equal(result.content, "Hello! How can I help?");
    assert.equal(result.model, "served-model");
    assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 8, totalTokens: 20 });
  });

  it("retries only retryable provider failures", async () => {
    let calls = 0;
    const delays: number[] = [];
    const provider = createOpenAiCompatibleChatProvider({ ...connection(), maxRetries: 2 }, {
      fetch: async () => { calls += 1; return calls < 3 ? new Response("busy", { status: 503 }) : jsonResponse(completion()); },
      sleep: async (milliseconds) => { delays.push(milliseconds); }
    });

    const result = await provider.complete({ messages: [{ content: "Hello", role: "user" }] });

    assert.equal(result.content, "Hello! How can I help?");
    assert.equal(calls, 3);
    assert.deepEqual(delays, [100, 200]);
  });

  it("maps timeout and failures to redacted errors without leaking connection secrets", async () => {
    const provider = createOpenAiCompatibleChatProvider({ ...connection(), maxRetries: 0, timeoutMs: 100 }, {
      fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("super-secret-key leaked"), { name: "AbortError" }))))
    });

    await assert.rejects(
      provider.complete({ messages: [{ content: "Hello", role: "user" }] }),
      (error: unknown) => error instanceof AiProviderError && error.code === "provider_timeout" && !error.message.includes("super-secret-key")
    );
  });

  it("does not retry a provider validation error", async () => {
    let calls = 0;
    const provider = createOpenAiCompatibleChatProvider({ ...connection(), maxRetries: 2 }, { fetch: async () => { calls += 1; return new Response("bad", { status: 400 }); } });
    await assert.rejects(provider.complete({ messages: [{ content: "Hello", role: "user" }] }), (error: unknown) => error instanceof AiProviderError && error.code === "provider_error");
    assert.equal(calls, 1);
  });
});

function connection() { return { apiKey: "super-secret-key", baseUrl: "https://ai.example.test/v1/", model: "chat-model" }; }
function completion() { return { choices: [{ message: { content: "Hello! How can I help?" } }], id: "chatcmpl-1", model: "served-model", usage: { completion_tokens: 8, prompt_tokens: 12, total_tokens: 20 } }; }
function jsonResponse(body: Record<string, unknown>) { return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status: 200 }); }
