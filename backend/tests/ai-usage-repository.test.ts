import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiUsageRepository } from "../apps/api-gateway/src/ai-connections/ai-usage.repository.ts";

describe("AI usage limits", () => {
  it("enforces tenant-scoped per-minute request limits", () => {
    const repository = AiUsageRepository.inMemory(); const now = new Date("2026-07-12T10:00:00.000Z");
    repository.reserve({ connectionId: "a", now, requestsPerMinute: 1, tenantId: "tenant-a", worstCaseTokens: 1 });
    assert.throws(() => repository.reserve({ connectionId: "a", now, requestsPerMinute: 1, tenantId: "tenant-a", worstCaseTokens: 1 }), /bot_ai_rate_limit_reached/);
    assert.doesNotThrow(() => repository.reserve({ connectionId: "a", now, requestsPerMinute: 1, tenantId: "tenant-b", worstCaseTokens: 1 }));
  });

  it("reserves a monthly token budget before contacting a provider", () => {
    const repository = AiUsageRepository.inMemory();
    assert.throws(() => repository.reserve({ connectionId: "a", monthlyTokenBudget: 100, tenantId: "tenant-a", worstCaseTokens: 500 }), /bot_ai_quota_exhausted/);
  });

  it("limits concurrent runs and releases the slot idempotently", () => {
    const repository = AiUsageRepository.inMemory();
    const release = repository.reserve({ connectionId: "a", maxConcurrentRuns: 1, tenantId: "tenant-a", worstCaseTokens: 1 });
    assert.throws(() => repository.reserve({ connectionId: "a", maxConcurrentRuns: 1, tenantId: "tenant-a", worstCaseTokens: 1 }), /bot_ai_concurrency_limit_reached/);
    assert.doesNotThrow(() => { release(); release(); });
    assert.doesNotThrow(() => repository.reserve({ connectionId: "a", maxConcurrentRuns: 1, tenantId: "tenant-a", worstCaseTokens: 1 }));
  });
});
