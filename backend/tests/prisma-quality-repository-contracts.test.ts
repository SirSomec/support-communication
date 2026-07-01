import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  QualityRepository,
  type AiScoringAuditRecord,
  type ManualQaReviewRecord,
  type QualityRatingRecord
} from "../apps/api-gateway/src/quality/quality.repository.ts";

describe("Prisma-backed quality repository contracts", () => {
  it("persists quality ratings through Prisma with tenant-scoped first-write-wins replay", async () => {
    const { client, calls } = createFakePrismaQualityClient();
    const repository = QualityRepository.prisma({ client });
    const rating: QualityRatingRecord = {
      auditId: "evt_quality_rating_prisma",
      channel: "SDK",
      clientId: "client-prisma",
      conversationId: "conv-rating-prisma",
      createdAt: "2026-06-30T15:00:00.000Z",
      operator: "operator-prisma",
      ratingId: "quality_rating_prisma",
      realtimeEventId: "evt_quality_score_prisma",
      scale: "CSAT",
      score: 5,
      tenantId: "tenant-demo",
      topic: "Delivery"
    };

    const saved = await repository.saveQualityRating(rating);
    rating.score = 1;
    saved.score = 1;
    const replay = await repository.saveQualityRating({
      ...rating,
      channel: "Email",
      createdAt: "2026-06-30T15:01:00.000Z",
      score: 2,
      tenantId: "tenant-demo"
    });
    const otherTenant = await repository.saveQualityRating({
      ...rating,
      createdAt: "2026-06-30T15:02:00.000Z",
      score: 4,
      tenantId: "tenant-other"
    });
    const tenantRows = await repository.listQualityRatings({ tenantId: "tenant-demo" });
    tenantRows[0].score = 1;
    const tenantRowsAgain = await repository.listQualityRatings({ tenantId: "tenant-demo" });
    const conversationRows = await repository.listQualityRatings({
      conversationId: "conv-rating-prisma",
      tenantId: "tenant-demo"
    });
    const missingRows = await repository.listQualityRatings({ conversationId: "missing", tenantId: "tenant-demo" });
    const unscopedRows = await repository.listQualityRatings();

    assert.equal(replay.createdAt, "2026-06-30T15:00:00.000Z");
    assert.equal(replay.channel, "SDK");
    assert.equal(replay.score, 5);
    assert.equal(otherTenant.tenantId, "tenant-other");
    assert.equal(otherTenant.score, 4);
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].ratingId, "quality_rating_prisma");
    assert.equal(tenantRowsAgain[0].score, 5);
    assert.equal(conversationRows.length, 1);
    assert.equal(missingRows.length, 0);
    assert.equal(unscopedRows.length, 0);
    assert.deepEqual(calls.qualityRatingCreates.map((call) => call.data.tenantId), ["tenant-demo", "tenant-other"]);
    assert.equal(calls.qualityRatingCreates[0].data.createdAt instanceof Date, true);
    assert.deepEqual(calls.qualityRatingFindUnique[0], {
      where: { tenantId_ratingId: { ratingId: "quality_rating_prisma", tenantId: "tenant-demo" } }
    });
    assert.deepEqual(calls.qualityRatingFindMany[0], {
      orderBy: { createdAt: "desc" },
      where: { tenantId: "tenant-demo" }
    });
  });

  it("persists manual QA reviews through Prisma with tenant-scoped first-write-wins replay", async () => {
    const { client, calls } = createFakePrismaQualityClient();
    const repository = QualityRepository.prisma({ client });
    const review: ManualQaReviewRecord = {
      auditId: "evt_manual_review_prisma",
      conversationId: "conv-review-prisma",
      createdAt: "2026-06-30T15:05:00.000Z",
      criteria: {
        completeness: 5,
        correctness: 4,
        speed: 5,
        tone: 4
      },
      overrideReason: "senior_review",
      reviewId: "qa_review_prisma",
      reviewer: "senior-prisma",
      score: 92,
      tenantId: "tenant-demo"
    };

    const saved = await repository.saveManualQaReview(review);
    review.criteria.tone = 1;
    saved.criteria.tone = 1;
    const replay = await repository.saveManualQaReview({
      ...review,
      createdAt: "2026-06-30T15:06:00.000Z",
      reviewer: "senior-replay",
      score: 70,
      tenantId: "tenant-demo"
    });
    const otherTenant = await repository.saveManualQaReview({
      ...review,
      createdAt: "2026-06-30T15:07:00.000Z",
      reviewer: "senior-other",
      score: 88,
      tenantId: "tenant-other"
    });
    const tenantRows = await repository.listManualQaReviews({ tenantId: "tenant-demo" });
    tenantRows[0].criteria.tone = 1;
    const tenantRowsAgain = await repository.listManualQaReviews({ tenantId: "tenant-demo" });
    const conversationRows = await repository.listManualQaReviews({
      conversationId: "conv-review-prisma",
      tenantId: "tenant-demo"
    });
    const missingRows = await repository.listManualQaReviews({ conversationId: "missing", tenantId: "tenant-demo" });
    const unscopedRows = await repository.listManualQaReviews();

    assert.equal(replay.createdAt, "2026-06-30T15:05:00.000Z");
    assert.equal(replay.reviewer, "senior-prisma");
    assert.equal(replay.score, 92);
    assert.equal(replay.criteria.tone, 4);
    assert.equal(otherTenant.tenantId, "tenant-other");
    assert.equal(otherTenant.score, 88);
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].reviewId, "qa_review_prisma");
    assert.equal(tenantRowsAgain[0].criteria.tone, 4);
    assert.equal(conversationRows.length, 1);
    assert.equal(missingRows.length, 0);
    assert.equal(unscopedRows.length, 0);
    assert.deepEqual(calls.manualQaReviewCreates.map((call) => call.data.tenantId), ["tenant-demo", "tenant-other"]);
    assert.equal(calls.manualQaReviewCreates[0].data.createdAt instanceof Date, true);
    assert.deepEqual(calls.manualQaReviewCreates[0].data.criteria, {
      completeness: 5,
      correctness: 4,
      speed: 5,
      tone: 4
    });
    assert.deepEqual(calls.manualQaReviewFindUnique[0], {
      where: { tenantId_reviewId: { reviewId: "qa_review_prisma", tenantId: "tenant-demo" } }
    });
    assert.deepEqual(calls.manualQaReviewFindMany[0], {
      orderBy: { createdAt: "desc" },
      where: { tenantId: "tenant-demo" }
    });
  });

  it("persists AI scoring audits through Prisma with tenant-scoped first-write-wins replay", async () => {
    const { client, calls } = createFakePrismaQualityClient();
    const repository = QualityRepository.prisma({ client });
    const audit: AiScoringAuditRecord = {
      auditId: "evt_ai_scoring_prisma",
      conversationId: "conv-scoring-prisma",
      createdAt: "2026-06-30T15:10:00.000Z",
      providerId: "deterministic-quality-scoring",
      providerResultId: "quality_deterministic_prisma",
      queue: "quality-ai-scoring",
      score: 96,
      status: "ok",
      tenantId: "tenant-demo",
      traceId: "trc_quality_scoring_prisma"
    };

    const saved = await repository.saveAiScoringAudit(audit);
    audit.score = 10;
    saved.score = 10;
    const replay = await repository.saveAiScoringAudit({
      ...audit,
      createdAt: "2026-06-30T15:11:00.000Z",
      providerResultId: "quality_deterministic_changed",
      score: 20,
      status: "failed",
      tenantId: "tenant-demo"
    });
    const otherTenant = await repository.saveAiScoringAudit({
      ...audit,
      createdAt: "2026-06-30T15:12:00.000Z",
      providerResultId: null,
      score: null,
      status: "failed",
      tenantId: "tenant-other"
    });
    const tenantRows = await repository.listAiScoringAudits({ tenantId: "tenant-demo" });
    tenantRows[0].score = 10;
    const tenantRowsAgain = await repository.listAiScoringAudits({ tenantId: "tenant-demo" });
    const conversationRows = await repository.listAiScoringAudits({
      conversationId: "conv-scoring-prisma",
      tenantId: "tenant-demo"
    });
    const missingRows = await repository.listAiScoringAudits({ conversationId: "missing", tenantId: "tenant-demo" });
    const unscopedRows = await repository.listAiScoringAudits();

    assert.equal(replay.createdAt, "2026-06-30T15:10:00.000Z");
    assert.equal(replay.providerResultId, "quality_deterministic_prisma");
    assert.equal(replay.score, 96);
    assert.equal(replay.status, "ok");
    assert.equal(otherTenant.tenantId, "tenant-other");
    assert.equal(otherTenant.providerResultId, null);
    assert.equal(otherTenant.score, null);
    assert.equal(otherTenant.status, "failed");
    assert.equal(tenantRowsAgain.length, 1);
    assert.equal(tenantRowsAgain[0].auditId, "evt_ai_scoring_prisma");
    assert.equal(tenantRowsAgain[0].queue, "quality-ai-scoring");
    assert.equal(tenantRowsAgain[0].traceId, "trc_quality_scoring_prisma");
    assert.equal(tenantRowsAgain[0].score, 96);
    assert.equal(conversationRows.length, 1);
    assert.equal(missingRows.length, 0);
    assert.equal(unscopedRows.length, 0);
    assert.deepEqual(calls.aiScoringAuditCreates.map((call) => call.data.tenantId), ["tenant-demo", "tenant-other"]);
    assert.equal(calls.aiScoringAuditCreates[0].data.createdAt instanceof Date, true);
    assert.equal(calls.aiScoringAuditCreates[1].data.providerResultId, null);
    assert.deepEqual(calls.aiScoringAuditFindUnique[0], {
      where: { tenantId_auditId: { auditId: "evt_ai_scoring_prisma", tenantId: "tenant-demo" } }
    });
    assert.deepEqual(calls.aiScoringAuditFindMany[0], {
      orderBy: { createdAt: "desc" },
      where: { tenantId: "tenant-demo" }
    });
  });
});

function createFakePrismaQualityClient() {
  const aiScoringAudits = new Map<string, FakeAiScoringAuditRow>();
  const ratings = new Map<string, FakeQualityRatingRow>();
  const manualReviews = new Map<string, FakeManualQaReviewRow>();
  const calls = {
    aiScoringAuditCreates: [] as Array<{ data: FakeAiScoringAuditCreateInput }>,
    aiScoringAuditFindMany: [] as Array<{
      orderBy: { createdAt: "desc" };
      where: { conversationId?: string; tenantId: string };
    }>,
    aiScoringAuditFindUnique: [] as Array<{
      where: { tenantId_auditId: { auditId: string; tenantId: string } };
    }>,
    manualQaReviewCreates: [] as Array<{ data: FakeManualQaReviewCreateInput }>,
    manualQaReviewFindMany: [] as Array<{
      orderBy: { createdAt: "desc" };
      where: { conversationId?: string; tenantId: string };
    }>,
    manualQaReviewFindUnique: [] as Array<{
      where: { tenantId_reviewId: { reviewId: string; tenantId: string } };
    }>,
    qualityRatingCreates: [] as Array<{ data: FakeQualityRatingCreateInput }>,
    qualityRatingFindMany: [] as Array<{
      orderBy: { createdAt: "desc" };
      where: { conversationId?: string; tenantId: string };
    }>,
    qualityRatingFindUnique: [] as Array<{
      where: { tenantId_ratingId: { ratingId: string; tenantId: string } };
    }>
  };
  const client = {
    aiScoringAudit: {
      async create(input: { data: FakeAiScoringAuditCreateInput }): Promise<FakeAiScoringAuditRow> {
        calls.aiScoringAuditCreates.push(input);
        const row = clone(input.data) as FakeAiScoringAuditRow;
        aiScoringAudits.set(auditKey(row.tenantId, row.auditId), row);
        return clone(row);
      },
      async findMany(input: {
        orderBy: { createdAt: "desc" };
        where: { conversationId?: string; tenantId: string };
      }): Promise<FakeAiScoringAuditRow[]> {
        calls.aiScoringAuditFindMany.push(input);
        return Array.from(aiScoringAudits.values())
          .filter((row) =>
            row.tenantId === input.where.tenantId
              && (!input.where.conversationId || row.conversationId === input.where.conversationId)
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map(clone);
      },
      async findUnique(input: {
        where: { tenantId_auditId: { auditId: string; tenantId: string } };
      }): Promise<FakeAiScoringAuditRow | null> {
        calls.aiScoringAuditFindUnique.push(input);
        const key = auditKey(input.where.tenantId_auditId.tenantId, input.where.tenantId_auditId.auditId);
        return clone(aiScoringAudits.get(key) ?? null);
      }
    },
    manualQaReview: {
      async create(input: { data: FakeManualQaReviewCreateInput }): Promise<FakeManualQaReviewRow> {
        calls.manualQaReviewCreates.push(input);
        const row = clone(input.data) as FakeManualQaReviewRow;
        manualReviews.set(reviewKey(row.tenantId, row.reviewId), row);
        return clone(row);
      },
      async findMany(input: {
        orderBy: { createdAt: "desc" };
        where: { conversationId?: string; tenantId: string };
      }): Promise<FakeManualQaReviewRow[]> {
        calls.manualQaReviewFindMany.push(input);
        return Array.from(manualReviews.values())
          .filter((row) =>
            row.tenantId === input.where.tenantId
              && (!input.where.conversationId || row.conversationId === input.where.conversationId)
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map(clone);
      },
      async findUnique(input: {
        where: { tenantId_reviewId: { reviewId: string; tenantId: string } };
      }): Promise<FakeManualQaReviewRow | null> {
        calls.manualQaReviewFindUnique.push(input);
        const key = reviewKey(input.where.tenantId_reviewId.tenantId, input.where.tenantId_reviewId.reviewId);
        return clone(manualReviews.get(key) ?? null);
      }
    },
    qualityRating: {
      async create(input: { data: FakeQualityRatingCreateInput }): Promise<FakeQualityRatingRow> {
        calls.qualityRatingCreates.push(input);
        const row = clone(input.data) as FakeQualityRatingRow;
        ratings.set(ratingKey(row.tenantId, row.ratingId), row);
        return clone(row);
      },
      async findMany(input: {
        orderBy: { createdAt: "desc" };
        where: { conversationId?: string; tenantId: string };
      }): Promise<FakeQualityRatingRow[]> {
        calls.qualityRatingFindMany.push(input);
        return Array.from(ratings.values())
          .filter((row) =>
            row.tenantId === input.where.tenantId
              && (!input.where.conversationId || row.conversationId === input.where.conversationId)
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map(clone);
      },
      async findUnique(input: {
        where: { tenantId_ratingId: { ratingId: string; tenantId: string } };
      }): Promise<FakeQualityRatingRow | null> {
        calls.qualityRatingFindUnique.push(input);
        const key = ratingKey(input.where.tenantId_ratingId.tenantId, input.where.tenantId_ratingId.ratingId);
        return clone(ratings.get(key) ?? null);
      }
    }
  };

  return { calls, client };
}

interface FakeQualityRatingCreateInput {
  auditId: string;
  channel: string;
  clientId: string | null;
  conversationId: string;
  createdAt: Date;
  operator: string;
  ratingId: string;
  realtimeEventId: string;
  scale: string;
  score: number | null;
  tenantId: string;
  topic: string | null;
}

type FakeQualityRatingRow = FakeQualityRatingCreateInput;

interface FakeManualQaReviewCreateInput {
  auditId: string;
  conversationId: string;
  createdAt: Date;
  criteria: Record<string, number>;
  overrideReason: string | null;
  reviewId: string;
  reviewer: string;
  score: number | null;
  tenantId: string;
}

type FakeManualQaReviewRow = FakeManualQaReviewCreateInput;

interface FakeAiScoringAuditCreateInput {
  auditId: string;
  conversationId: string;
  createdAt: Date;
  providerId: string;
  providerResultId: string | null;
  queue: string;
  score: number | null;
  status: string;
  tenantId: string;
  traceId: string;
}

type FakeAiScoringAuditRow = FakeAiScoringAuditCreateInput;

function ratingKey(tenantId: string, ratingId: string): string {
  return `${tenantId}:${ratingId}`;
}

function auditKey(tenantId: string, auditId: string): string {
  return `${tenantId}:${auditId}`;
}

function reviewKey(tenantId: string, reviewId: string): string {
  return `${tenantId}:${reviewId}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_key, item: unknown) =>
    typeof item === "string" && /^\d{4}-\d{2}-\d{2}T/.test(item) ? new Date(item) : item
  ) as T;
}
