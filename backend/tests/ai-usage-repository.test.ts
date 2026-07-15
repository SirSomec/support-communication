import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AiUsageRepository,
  type AiUsagePrismaClient,
  type PrismaAiUsageRow
} from "../apps/api-gateway/src/ai-connections/ai-usage.repository.ts";

function inMemoryPrismaAiUsageClient(): AiUsagePrismaClient {
  const rows = new Map<string, PrismaAiUsageRow>();
  const key = (tenantId: string, connectionId: string, month: string) => `${tenantId} ${connectionId} ${month}`;
  return {
    aiUsageCounter: {
      findUnique: async ({ where }) => rows.get(key(where.tenantId_connectionId_month.tenantId, where.tenantId_connectionId_month.connectionId, where.tenantId_connectionId_month.month)) ?? null,
      upsert: async ({ create, update, where }) => {
        const mapKey = key(where.tenantId_connectionId_month.tenantId, where.tenantId_connectionId_month.connectionId, where.tenantId_connectionId_month.month);
        const existing = rows.get(mapKey);
        const next: PrismaAiUsageRow = existing
          ? { ...existing, ...update, requestTimes: update.requestTimes ?? existing.requestTimes }
          : { connectionId: create.connectionId, month: create.month, requestTimes: create.requestTimes, tenantId: create.tenantId, usedTokens: create.usedTokens };
        rows.set(mapKey, next);
        return next;
      }
    }
  };
}

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

  it("enforces rate, quota and concurrency through the prisma branch and records token spend", async () => {
    const repository = AiUsageRepository.prisma({ client: inMemoryPrismaAiUsageClient() });
    const now = new Date("2026-07-12T10:00:00.000Z");

    // Rate window (durable in Postgres): second reserve within the minute fails.
    await repository.reserve({ connectionId: "a", now, requestsPerMinute: 1, tenantId: "tenant-a", worstCaseTokens: 1 });
    await assert.rejects(() => Promise.resolve(repository.reserve({ connectionId: "a", now, requestsPerMinute: 1, tenantId: "tenant-a", worstCaseTokens: 1 })), /bot_ai_rate_limit_reached/);
    // Different tenant is unaffected.
    await repository.reserve({ connectionId: "a", now, requestsPerMinute: 1, tenantId: "tenant-b", worstCaseTokens: 1 });

    // Monthly token budget (durable): worst-case over budget fails.
    await assert.rejects(() => Promise.resolve(repository.reserve({ connectionId: "b", monthlyTokenBudget: 100, tenantId: "tenant-a", worstCaseTokens: 500 })), /bot_ai_quota_exhausted/);

    // Concurrency (in-process gauge): second concurrent reserve fails, release frees the slot.
    const release = await repository.reserve({ connectionId: "c", maxConcurrentRuns: 1, tenantId: "tenant-a", worstCaseTokens: 1 });
    await assert.rejects(() => Promise.resolve(repository.reserve({ connectionId: "c", maxConcurrentRuns: 1, tenantId: "tenant-a", worstCaseTokens: 1 })), /bot_ai_concurrency_limit_reached/);
    release(); release();
    await repository.reserve({ connectionId: "c", maxConcurrentRuns: 1, tenantId: "tenant-a", worstCaseTokens: 1 });

    // recordUsage accrues durable monthly token spend, visible via current().
    await repository.recordUsage("tenant-a", "d", 250, now);
    await repository.recordUsage("tenant-a", "d", 150, now);
    const snapshot = await repository.current("tenant-a", "d", now);
    assert.equal(snapshot.usedTokens, 400);
    assert.equal(snapshot.month, "2026-07");
  });
});
