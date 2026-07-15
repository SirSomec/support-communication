import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resetMetricsRegistry } from "../packages/observability/src/index.ts";
import { AutomationRepository } from "../apps/api-gateway/src/automation/automation.repository.ts";
import { AutomationService } from "../apps/api-gateway/src/automation/automation.service.ts";
import {
  BotFeedbackRepository,
  type BotAiFeedbackRecord,
  type BotFeedbackPrismaClient,
  type PrismaBotAiFeedbackRow
} from "../apps/api-gateway/src/automation/bot-feedback.repository.ts";

function inMemoryPrismaBotFeedbackClient(): BotFeedbackPrismaClient {
  const rows = new Map<string, PrismaBotAiFeedbackRow>();
  return {
    botAiFeedback: {
      create: async ({ data }) => {
        const row: PrismaBotAiFeedbackRow = { ...data, citationSourceIds: data.citationSourceIds };
        rows.set(row.feedbackId, row);
        return row;
      },
      findFirst: async ({ where }) => [...rows.values()].find((row) =>
        (!where.tenantId || row.tenantId === where.tenantId) && (!where.idempotencyKey || row.idempotencyKey === where.idempotencyKey)) ?? null,
      findMany: async ({ where } = {}) => [...rows.values()]
        .filter((row) => (!where?.tenantId || row.tenantId === where.tenantId) && (!where?.conversationId || row.conversationId === where.conversationId))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()),
      findUnique: async ({ where }) => rows.get(where.feedbackId) ?? null,
      updateMany: async ({ data, where }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (row.tenantId === where.tenantId && row.feedbackId === where.feedbackId) {
            rows.set(row.feedbackId, { ...row, ...data });
            count += 1;
          }
        }
        return { count };
      }
    }
  };
}

function feedbackRecord(overrides: Partial<BotAiFeedbackRecord> = {}): BotAiFeedbackRecord {
  return {
    actorId: "op-1",
    citationSourceIds: ["src-faq"],
    comment: null,
    conversationId: "maria",
    createdAt: new Date("2026-07-15T10:00:00.000Z").toISOString(),
    feedbackId: "fb-prisma-1",
    idempotencyKey: "idem-1",
    knowledgeMutated: false,
    outcome: "wrong_source",
    resolvedAction: null,
    resolvedAt: null,
    reviewRequired: true,
    scenarioId: "bot-delivery",
    tenantId: "tenant-volga",
    ...overrides
  };
}

describe("BAI-703 bot AI feedback loop", () => {
  beforeEach(() => {
    resetMetricsRegistry();
    AutomationRepository.useDefault(AutomationRepository.inMemory());
    BotFeedbackRepository.useDefault(BotFeedbackRepository.inMemory());
  });

  afterEach(() => {
    BotFeedbackRepository.clearDefault();
    AutomationRepository.clearDefault();
    resetMetricsRegistry();
  });

  it("records tenant-scoped feedback and never claims knowledge mutation", async () => {
    const automation = new AutomationService();
    const response = await automation.recordBotAiFeedback(
      {
        citationSourceIds: ["src-faq"],
        conversationId: "maria",
        outcome: "wrong_source",
        scenarioId: "bot-delivery"
      },
      { actor: "op-1", tenantId: "tenant-volga" }
    );

    assert.equal(response.status, "ok");
    assert.equal(response.data.knowledgeMutated, false);
    assert.equal(response.data.reviewRequired, true);
    assert.equal(response.data.feedback.outcome, "wrong_source");
    assert.equal(response.data.feedback.knowledgeMutated, false);
    assert.equal(response.data.feedback.tenantId, "tenant-volga");

    const foreign = await automation.fetchAutomationWorkspace({ tenantId: "tenant-ladoga" });
    assert.equal(foreign.status, "ok");
    assert.equal((foreign.data.telemetry as { feedback: unknown[] }).feedback.length, 0);

    const own = await automation.fetchAutomationWorkspace({ tenantId: "tenant-volga" });
    assert.equal((own.data.telemetry as { feedback: unknown[] }).feedback.length, 1);
  });

  it("is idempotent for the same tenant + idempotency key", async () => {
    const automation = new AutomationService();
    const first = await automation.recordBotAiFeedback(
      { conversationId: "maria", outcome: "helped", idempotencyKey: "fb-1" },
      { actor: "op-1", tenantId: "tenant-volga" }
    );
    const second = await automation.recordBotAiFeedback(
      { conversationId: "maria", outcome: "helped", idempotencyKey: "fb-1" },
      { actor: "op-1", tenantId: "tenant-volga" }
    );

    assert.equal(first.status, "ok");
    assert.equal(second.status, "ok");
    assert.equal(second.data.duplicate, true);
    assert.equal(second.data.feedback.feedbackId, first.data.feedback.feedbackId);
  });

  it("persists feedback lifecycle through the prisma branch, idempotent and tenant-scoped", async () => {
    const repository = BotFeedbackRepository.prisma({ client: inMemoryPrismaBotFeedbackClient() });

    const saved = await repository.saveFeedback(feedbackRecord());
    assert.equal(saved.feedbackId, "fb-prisma-1");
    assert.equal(saved.knowledgeMutated, false);
    assert.equal(saved.reviewRequired, true);

    // Idempotent by (tenant, idempotencyKey): a second save with a different id
    // returns the original record, not a duplicate.
    const dup = await repository.saveFeedback(feedbackRecord({ feedbackId: "fb-prisma-2" }));
    assert.equal(dup.feedbackId, "fb-prisma-1");

    await repository.saveFeedback(feedbackRecord({ feedbackId: "fb-other-tenant", idempotencyKey: "idem-2", tenantId: "tenant-ladoga" }));
    assert.equal((await repository.listFeedback({ tenantId: "tenant-volga" })).length, 1);
    assert.equal((await repository.listFeedback({ tenantId: "tenant-ladoga" })).length, 1);

    const resolved = await repository.resolveFeedback("tenant-volga", "fb-prisma-1", "created_article");
    assert.equal(resolved?.resolvedAction, "created_article");
    assert.equal(resolved?.reviewRequired, false);
    assert.equal(typeof resolved?.resolvedAt, "string");
    assert.equal(await repository.resolveFeedback("tenant-ladoga", "fb-prisma-1", "x"), undefined);
  });

  it("exposes the bot-feedback route with operator permission guards", () => {
    const source = readFileSync(
      join(process.cwd(), "apps/api-gateway/src/automation/automation.controller.ts"),
      "utf8"
    );
    assert.match(source, /@Post\("bot-feedback"\)/);
    assert.match(source, /recordBotAiFeedback/);
    assert.match(source, /RequireTenantOperatorPermission\("automation\.read"\)/);
  });
});
