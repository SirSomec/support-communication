import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { QualityRepository } from "../apps/api-gateway/src/quality/quality.repository.ts";
import { QualityService } from "../apps/api-gateway/src/quality/quality.service.ts";
import { bootstrapQualityState } from "../apps/api-gateway/src/quality/seed.ts";

describe("quality workspace contracts", () => {
  it("starts empty unless a quality seed is explicitly injected", () => {
    const empty = QualityRepository.inMemory().readState();
    const seeded = QualityRepository.inMemory(bootstrapQualityState()).readState();

    assert.deepEqual(empty.ratings, []);
    assert.deepEqual(empty.manualQaReviews, []);
    assert.deepEqual(empty.aiScoringAudits, []);
    assert.deepEqual(empty.workspace.qualityMetrics, []);
    assert.ok(seeded.workspace.qualityMetrics.length > 0);
  });

  it("requires write permissions for durable quality mutations", () => {
    const controller = readFileSync(new URL("../apps/api-gateway/src/quality/quality.controller.ts", import.meta.url), "utf8");

    assert.match(controller, /@Post\("draft-score"\)[\s\S]*?@RequireTenantOperatorPermission\("quality\.scoring-audits\.write"\)/);
    assert.match(controller, /@Post\("ratings"\)[\s\S]*?@RequireTenantOperatorPermission\("quality\.ratings\.write"\)/);
    assert.match(controller, /@Post\("manual-reviews"\)[\s\S]*?@RequireTenantOperatorPermission\("quality\.manual-reviews\.write"\)/);
    assert.match(controller, /@Post\("ai-suggestion-decisions"\)[\s\S]*?@RequireTenantOperatorPermission\("quality\.scoring-audits\.write"\)/);
  });

  it("durably records idempotent AI suggestion decisions with lifecycle evidence and real effectiveness", async () => {
    const repository = QualityRepository.inMemory();
    const quality = new QualityService(repository);
    const context = { actorId: "operator-1", actorName: "Operator One", actorType: "operator" as const, tenantId: "tenant-decisions" };
    const request = {
      action: "edit" as const,
      conversationId: "conversation-1",
      finalText: "Edited answer",
      originalText: "Original answer",
      providerId: "openai-compatible",
      providerResultId: "result-1",
      scoringAuditId: "audit-1",
      suggestionId: "suggestion-1"
    };

    const first = await quality.recordAiSuggestionDecision(request, context);
    const replay = await quality.recordAiSuggestionDecision(request, context);
    const conflict = await quality.recordAiSuggestionDecision({ ...request, action: "reject" }, context);
    const unauthenticated = await quality.recordAiSuggestionDecision({ ...request, suggestionId: "suggestion-2" }, { tenantId: context.tenantId });
    const workspace = await quality.fetchQualityWorkspace(context);
    const state = repository.readState();

    assert.equal(first.status, "ok");
    assert.equal(replay.status, "ok");
    assert.equal(conflict.status, "invalid");
    assert.equal(conflict.error?.code, "idempotency_key_reused");
    assert.equal(unauthenticated.error?.code, "quality_operator_context_required");
    assert.equal(state.aiSuggestionDecisions.length, 1);
    assert.equal(state.aiSuggestionDecisions[0].originalTextHash.length, 64);
    assert.equal(state.aiSuggestionDecisions[0].finalTextHash?.length, 64);
    assert.equal(state.lifecycleEvents?.length, 1);
    assert.equal(state.lifecycleEvents?.[0].eventType, "quality.ai-suggestion.decided");
    assert.equal(workspace.data.aiSuggestionDecisions.length, 1);
    assert.deepEqual(workspace.data.aiEffectivenessMetrics[0], {
      accepted: 0, acceptanceRate: 0, edited: 1, editRate: 1, rejected: 0, rejectionRate: 0, total: 1
    });
  });

  it("ships tenant uniqueness and final-text integrity constraints for AI decisions", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../prisma/migrations/202607110011_ai_suggestion_decisions/migration.sql", import.meta.url), "utf8");
    assert.match(schema, /model AiSuggestionDecision[\s\S]*?@@unique\(\[tenantId, suggestionId\]/);
    assert.match(migration, /ai_suggestion_decisions_action_check/);
    assert.match(migration, /ai_suggestion_decisions_final_text_check/);
  });

  it("returns quality workspace payload with tenant metadata", async () => {
    const quality = new QualityService();

    const workspace = await quality.fetchQualityWorkspace({ tenantId: "tenant-volga" });

    assert.equal(workspace.status, "ok");
    assert.equal(workspace.data.tenantId, "tenant-volga");
    assert.ok(Array.isArray(workspace.data.qualityScores));
    assert.ok(Array.isArray(workspace.data.aiSuggestions));
  });

  it("persists ratings, manual reviews and scoring audits into the reloaded workspace", async () => {
    const repository = QualityRepository.inMemory();
    const quality = new QualityService(repository);
    const tenantId = "tenant-quality-runtime";

    const rating = await quality.recordClientQualityRating({
      channel: "Telegram",
      clientId: "client-quality-runtime",
      conversationId: "conversation-quality-runtime",
      operator: "operator-quality-runtime",
      scale: "CSAT",
      score: 5,
      topic: "Delivery"
    }, { tenantId });
    const review = await quality.recordManualQaReview({
      conversationId: "conversation-quality-runtime",
      criteria: { completeness: 5, tone: 4 },
      overrideReason: "Supervisor review",
      reviewer: "supervisor-quality-runtime",
      score: 92
    }, { tenantId });
    const scoring = await quality.scoreDraftResponse({
      conversationId: "conversation-quality-runtime",
      mode: "reply",
      text: "I understand and will check the delivery status."
    }, { tenantId });
    const workspace = await quality.fetchQualityWorkspace({ tenantId });

    assert.equal(rating.status, "ok");
    assert.equal(review.status, "ok");
    assert.equal(scoring.status, "ok");
    assert.equal(repository.listQualityRatings({ tenantId }).length, 1);
    assert.equal(repository.listManualQaReviews({ tenantId }).length, 1);
    assert.equal(repository.listAiScoringAudits({ tenantId }).length, 1);
    const lifecycleEvents = repository.readState().lifecycleEvents ?? [];
    assert.deepEqual(lifecycleEvents.map((event) => event.eventType).sort(), [
      "quality.assessment.appealed",
      "quality.assessment.completed",
      "quality.assessment.set"
    ]);
    assert.equal(lifecycleEvents.every((event) => event.tenantId === tenantId), true);
    assert.equal(workspace.data.qualityScores.length, 1);
    assert.equal(workspace.data.manualQaReviews.length, 1);
    assert.equal(workspace.data.aiScoringAudits.length, 1);
    assert.equal(workspace.data.qualityScores[0].conversationId, "conversation-quality-runtime");
    assert.equal(workspace.data.qualityScores[0].manualReviewId, review.data.reviewId);
    assert.equal(workspace.data.manualQaReviews[0].reviewId, review.data.reviewId);
    assert.equal(workspace.data.aiScoringAudits[0].auditId, scoring.data.telemetry.auditId);
  });

  it("replays idempotent writes without duplicates and rejects a changed request", async () => {
    const repository = QualityRepository.inMemory();
    const quality = new QualityService(repository);
    const tenantId = "tenant-quality-idempotency";
    const request = {
      channel: "Telegram",
      conversationId: "conversation-quality-idempotency",
      idempotencyKey: "rating-request-1",
      operator: "operator-quality-idempotency",
      score: 5
    };

    const actor = { actorId: "operator-quality", actorName: "Quality Operator", actorType: "operator" as const, tenantId };
    const first = await quality.recordClientQualityRating(request, actor);
    const replay = await quality.recordClientQualityRating(request, actor);
    const conflict = await quality.recordClientQualityRating({ ...request, score: 1 }, actor);

    assert.equal(first.status, "ok");
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.ratingId, first.data.ratingId);
    assert.equal(repository.listQualityRatings({ tenantId }).length, 1);
    const lifecycleEvents = repository.readState().lifecycleEvents ?? [];
    assert.equal(lifecycleEvents.length, 1);
    assert.equal(lifecycleEvents[0].actorId, "operator-quality");
    assert.equal(lifecycleEvents[0].actorName, "Quality Operator");
    assert.equal(lifecycleEvents[0].source, "quality.rating");
    assert.equal(conflict.status, "invalid");
    assert.equal(conflict.error?.code, "idempotency_key_reused");
  });

  it("records changed and appealed assessments with prior score and reason", async () => {
    const repository = QualityRepository.inMemory();
    const quality = new QualityService(repository);
    const tenantId = "tenant-quality-lifecycle";
    const context = { actorId: "supervisor-1", actorName: "Supervisor", actorType: "operator" as const, tenantId };
    const base = {
      channel: "Telegram",
      conversationId: "conversation-quality-lifecycle",
      operator: "operator-1"
    };

    await quality.recordClientQualityRating({ ...base, idempotencyKey: "initial", score: 3 }, context);
    await quality.recordClientQualityRating({ ...base, idempotencyKey: "changed", score: 5 }, context);
    await quality.recordManualQaReview({
      conversationId: base.conversationId,
      idempotencyKey: "appeal",
      overrideReason: "Appeal accepted after transcript review",
      reviewer: "Supervisor",
      score: 95
    }, context);

    const events = repository.readState().lifecycleEvents ?? [];
    assert.deepEqual(events.map((event) => event.eventType), [
      "quality.assessment.set",
      "quality.assessment.changed",
      "quality.assessment.appealed"
    ]);
    assert.equal(events[1].data.previousScore, 3);
    assert.equal(events[2].reason, "Appeal accepted after transcript review");
    assert.equal(events.every((event) => event.conversationId === base.conversationId && event.tenantId === tenantId), true);
  });

  it("restores manual review state for base workspace metrics", async () => {
    const tenantId = "tenant-quality-base-review";
    const repository = QualityRepository.inMemory({
      aiScoringAudits: [],
      manualQaReviews: [],
      ratings: [],
      workspace: {
        aiCoachingQueue: [],
        aiEffectivenessMetrics: [],
        aiRealtimeChecks: [],
        aiSuggestions: [],
        knowledgeArticles: [],
        qualityMetrics: [{ id: "base-score", conversationId: "base-conversation", score: 2 }]
      }
    });
    const quality = new QualityService(repository);

    const review = await quality.recordManualQaReview({
      conversationId: "base-conversation",
      reviewer: "supervisor",
      score: 90
    }, { tenantId });
    const workspace = await quality.fetchQualityWorkspace({ tenantId });

    assert.equal(workspace.data.qualityScores[0].manualReviewId, review.data.reviewId);
  });
});
