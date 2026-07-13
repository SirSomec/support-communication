import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  approveKnowledgeArticle,
  archiveKnowledgeArticle,
  deleteKnowledgeArticleAttachment,
  publishKnowledgeArticle,
  rejectKnowledgeArticle,
  submitKnowledgeArticleDraft,
  submitKnowledgeArticleForReview
} from "../src/app/knowledgeArticleActions.js";
import {
  buildAiSuggestionBatchScorePayload,
  buildCoachingDraftScorePayload,
  buildManualQaReviewPayload,
  scoreAiSuggestionBatch,
  scoreCoachingDraft,
  submitManualQaReview
} from "../src/app/qualityAiActions.js";

describe("quality and knowledge workflow actions", () => {
  it("does not return a saved article when knowledge draft save fails", async () => {
    const result = await submitKnowledgeArticleDraft(
      { id: "kb-refund", body: "Updated body", title: "Refund" },
      {
        saveArticleDraft: async () => ({
          error: { message: "Draft rejected" },
          status: "error"
        })
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.article, undefined);
    assert.equal(result.message, "Draft rejected");
  });

  it("returns backend article and sends draft fields on knowledge draft save success", async () => {
    let capturedArticleId = "";
    let capturedPayload = null;
    const result = await submitKnowledgeArticleDraft(
      {
        body: "Updated refund policy",
        category: "Payment",
        channels: ["SDK", "VK"],
        id: "kb-refund",
        title: "Refund policy",
        topics: ["Payment / Refund"],
        visibility: "public"
      },
      {
        saveArticleDraft: async (articleId, payload) => {
          capturedArticleId = articleId;
          capturedPayload = payload;
          return {
            data: {
              article: {
                ...payload,
                id: articleId,
                status: "draft",
                versions: [{ id: "draft-1", label: "v2.1-draft", status: "draft" }]
              },
              auditEvent: { id: "evt-knowledge-draft" }
            },
            status: "ok"
          };
        }
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.article.id, "kb-refund");
    assert.equal(result.article.title, "Refund policy");
    assert.equal(result.auditEvent.id, "evt-knowledge-draft");
    assert.equal(capturedArticleId, "kb-refund");
    assert.equal(capturedPayload.body, "Updated refund policy");
    assert.deepEqual(capturedPayload.channels, ["SDK", "VK"]);
    assert.match(capturedPayload.reason, /Saved draft from quality workspace/);
  });

  it("submits knowledge articles for review only when backend returns article and immutable evidence", async () => {
    let capturedArticleId = "";
    let capturedPayload = null;

    const result = await submitKnowledgeArticleForReview(
      { id: "kb-refund", title: "Refund policy" },
      {
        actor: "operator-anna",
        submitArticleForReview: async (articleId, payload) => {
          capturedArticleId = articleId;
          capturedPayload = payload;
          return {
            data: {
              article: { id: articleId, status: "review", title: "Refund policy" },
              approvalDecision: { action: "sent_for_review", id: "decision-1", immutable: true },
              auditEvent: { id: "evt-review" }
            },
            status: "ok"
          };
        }
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.article.status, "review");
    assert.equal(result.approvalDecision.id, "decision-1");
    assert.equal(capturedArticleId, "kb-refund");
    assert.deepEqual(capturedPayload, {
      actor: "operator-anna",
      draftId: undefined,
      reason: "Submitted knowledge article Refund policy for review."
    });
  });

  it("does not report knowledge governance success without immutable backend evidence", async () => {
    const result = await publishKnowledgeArticle(
      { id: "kb-refund", title: "Refund policy" },
      {
        publishArticle: async () => ({
          data: {
            article: { id: "kb-refund", status: "published" },
            approvalDecision: { id: "decision-1", immutable: false }
          },
          status: "ok"
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /подтверждение действия со статьёй/);
  });

  it("wraps approve, publish, reject, archive and attachment delete knowledge actions", async () => {
    const calls = [];
    const article = { id: "kb-refund", title: "Refund policy" };
    const response = (status, action) => ({
      data: {
        article: { ...article, status },
        approvalDecision: { action, id: `decision-${action}`, immutable: true },
        auditEvent: { id: `evt-${action}` }
      },
      status: "ok"
    });

    const approved = await approveKnowledgeArticle(article, {
      actor: "senior-editor",
      approveArticle: async (articleId, payload) => {
        calls.push(["approve", articleId, payload.reason]);
        return response("approved", "approved");
      }
    });
    const published = await publishKnowledgeArticle(article, {
      actor: "senior-editor",
      publishArticle: async (articleId, payload) => {
        calls.push(["publish", articleId, payload.reason]);
        return response("published", "published");
      }
    });
    const rejected = await rejectKnowledgeArticle(article, {
      actor: "senior-editor",
      rejectArticle: async (articleId, payload) => {
        calls.push(["reject", articleId, payload.reason]);
        return response("draft", "returned_for_revision");
      }
    });
    const archived = await archiveKnowledgeArticle(article, {
      actor: "senior-editor",
      archiveArticle: async (articleId, payload) => {
        calls.push(["archive", articleId, payload.reason]);
        return response("archived", "archived");
      }
    });
    const removed = await deleteKnowledgeArticleAttachment(
      article,
      { id: "att-policy", name: "policy.pdf" },
      {
        actor: "senior-editor",
        deleteArticleAttachment: async (payload) => {
          calls.push(["deleteAttachment", payload.articleId, payload.attachmentId, payload.reason]);
          return {
            data: {
              article: { ...article, attachments: [] },
              auditEvent: { action: "knowledge.article.attachment.deleted", id: "evt-delete" }
            },
            status: "ok"
          };
        }
      }
    );

    assert.equal(approved.ok, true);
    assert.equal(published.ok, true);
    assert.equal(rejected.ok, true);
    assert.equal(archived.ok, true);
    assert.equal(removed.ok, true);
    assert.equal(removed.auditEvent.id, "evt-delete");
    assert.deepEqual(calls.map((call) => call[0]), ["approve", "publish", "reject", "archive", "deleteAttachment"]);
  });

  it("builds and submits coaching draft score payloads to the quality backend", async () => {
    const item = {
      draft: "We will check the refund status.",
      id: "coach-1",
      recommendation: "Add next step.",
      segment: "SLA",
      severity: "warn",
      trigger: "SLA риск"
    };
    let capturedPayload = null;

    const result = await scoreCoachingDraft(item, {
      scoreDraftResponse: async (payload) => {
        capturedPayload = payload;
        return {
          data: {
            checks: [{ id: "next-step", tone: "warn" }],
            score: 85,
            telemetry: { auditId: "evt-ai-score" }
          },
          status: "ok"
        };
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.score, 85);
    assert.equal(result.auditId, "evt-ai-score");
    assert.deepEqual(capturedPayload, buildCoachingDraftScorePayload(item));
  });

  it("does not return a score when draft scoring fails", async () => {
    const result = await scoreCoachingDraft(
      { draft: "", id: "coach-2", trigger: "Пустой ответ" },
      {
        scoreDraftResponse: async () => ({
          error: { message: "tenant_context_required" },
          status: "error"
        })
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.score, undefined);
    assert.equal(result.message, "tenant_context_required");
  });

  it("builds and submits manual QA reviews to the quality backend", async () => {
    const score = {
      channel: "Telegram",
      conversationId: "conv-low-score",
      id: "csat-low",
      operator: "operator-kirill",
      scale: "CSAT",
      score: 2,
      topic: "Product / Mismatch"
    };
    let capturedPayload = null;

    const result = await submitManualQaReview(score, {
      recordManualQaReview: async (payload) => {
        capturedPayload = payload;
        return {
          data: {
            auditId: "evt_quality_manual_review",
            reviewId: "qa_backend_review",
            score: 40
          },
          status: "ok"
        };
      },
      reviewer: "senior-qa"
    });

    assert.equal(result.ok, true);
    assert.equal(result.reviewId, "qa_backend_review");
    assert.equal(result.auditId, "evt_quality_manual_review");
    assert.deepEqual(capturedPayload, buildManualQaReviewPayload(score, { reviewer: "senior-qa" }));
  });

  it("does not report manual QA success without backend review evidence", async () => {
    const result = await submitManualQaReview(
      { conversationId: "conv-low-score", id: "csat-low", score: 2 },
      {
        recordManualQaReview: async () => ({
          data: { auditId: "evt_missing_review" },
          status: "ok"
        }),
        reviewer: "senior-qa"
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /Ручная QA-оценка не подтверждена/);
  });

  it("submits reviewer criteria and their calculated score instead of copying CSAT", async () => {
    const score = { conversationId: "conv-reviewed", id: "csat-reviewed", scale: "CSAT", score: 1 };
    const criteria = { accuracy: 5, communication: 4, completeness: 3, process: 2 };
    let capturedPayload;

    const result = await submitManualQaReview(score, {
      criteria,
      recordManualQaReview: async (payload) => {
        capturedPayload = payload;
        return { data: { auditId: "audit-review", reviewId: "review-1", score: 70 }, status: "ok" };
      },
      reviewer: "qa-lead",
      reviewScore: 70
    });

    assert.equal(result.ok, true);
    assert.deepEqual(capturedPayload.criteria, criteria);
    assert.equal(capturedPayload.score, 70);
    assert.equal(capturedPayload.reviewer, "qa-lead");
  });

  it("builds and submits AI suggestion batch scoring payloads to the quality backend", async () => {
    const suggestions = [
      {
        confidence: 88,
        conversationId: "conv-1",
        id: "ai-reply-1",
        risk: "sla_overdue",
        suggestedTopic: "Delivery",
        text: "Please check the delivery status.",
        title: "Reply suggestion",
        type: "reply"
      },
      {
        confidence: 91,
        conversationId: "conv-2",
        id: "ai-summary-2",
        risk: "low",
        suggestedTopic: "Payment",
        text: "Customer asks about refund.",
        title: "Summary",
        type: "summary"
      }
    ];
    let capturedPayload = null;

    const result = await scoreAiSuggestionBatch(suggestions, {
      scoreDraftResponses: async (payload) => {
        capturedPayload = payload;
        return {
          data: {
            checks: [{ id: "empathy", tone: "warn" }],
            score: 85,
            telemetry: { auditId: "evt_ai_batch_score" }
          },
          status: "ok"
        };
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.score, 85);
    assert.equal(result.auditId, "evt_ai_batch_score");
    assert.deepEqual(capturedPayload, buildAiSuggestionBatchScorePayload(suggestions));
  });

  it("keeps AI suggestion conversation ids and action intent in scoring payloads", () => {
    const payload = buildAiSuggestionBatchScorePayload([
      {
        action: "accept",
        confidence: 88,
        conversationId: "conv-vladimir",
        id: "ai-vladimir-reply",
        risk: "sla_overdue",
        suggestedTopic: "Product / Mismatch",
        text: "Please check the order and offer an exchange.",
        title: "Reply suggestion",
        type: "reply"
      }
    ]);

    assert.equal(payload.conversationId, "conv-vladimir");
    assert.equal(payload.suggestions[0].conversationId, "conv-vladimir");
    assert.equal(payload.suggestions[0].action, "accept");
  });

  it("does not report AI batch scoring success without backend audit evidence", async () => {
    const result = await scoreAiSuggestionBatch(
      [{ conversationId: "conv-1", id: "ai-reply-1", text: "Check status" }],
      {
        scoreDraftResponses: async () => ({
          data: { score: 90 },
          status: "ok"
        })
      }
    );

    assert.equal(result.ok, false);
    assert.match(result.message, /не подтвердил сохранение результата/);
  });
});
