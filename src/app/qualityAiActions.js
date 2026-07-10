import { qualityService } from "../services/qualityService.js";

export function buildCoachingDraftScorePayload(item) {
  return {
    conversationId: item?.conversationId ?? item?.id ?? "quality-coaching-draft",
    mode: "quality-coaching",
    suggestions: [
      {
        id: item?.id,
        label: item?.trigger,
        recommendation: item?.recommendation,
        segment: item?.segment,
        severity: item?.severity
      }
    ],
    text: item?.draft ?? ""
  };
}

export function buildManualQaReviewPayload(score, { reviewer = "senior-qa" } = {}) {
  const normalizedScore = normalizeManualQaScore(score);

  return {
    conversationId: score?.conversationId ?? score?.id ?? "",
    criteria: {
      customerScore: Number(score?.score ?? 0),
      normalizedScore
    },
    overrideReason: `Manual QA review from quality workspace for ${score?.id ?? score?.conversationId ?? "score"}.`,
    reviewer,
    score: normalizedScore
  };
}

export function buildAiSuggestionBatchScorePayload(suggestions = []) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  const ids = list.map((suggestion) => suggestion?.id).filter(Boolean);
  const conversationIds = list.map((suggestion) => suggestion?.conversationId).filter(Boolean);
  const primaryConversationId = conversationIds[0] ?? ids[0];

  return {
    conversationId: primaryConversationId ?? `quality-ai-batch-${ids.join("-").slice(0, 80) || "suggestions"}`,
    mode: "quality-ai-batch",
    suggestions: list.map((suggestion) => ({
      action: suggestion?.action,
      confidence: suggestion?.confidence,
      conversationId: suggestion?.conversationId,
      id: suggestion?.id,
      label: suggestion?.title,
      recommendation: suggestion?.text,
      risk: suggestion?.risk,
      suggestedTopic: suggestion?.suggestedTopic,
      type: suggestion?.type
    })),
    text: list
      .map((suggestion) => [suggestion?.title, suggestion?.text].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("\n\n")
  };
}

export async function scoreCoachingDraft(
  item,
  { scoreDraftResponse = qualityService.scoreDraftResponse } = {}
) {
  const response = await scoreDraftResponse(buildCoachingDraftScorePayload(item));

  if (response?.status !== "ok") {
    return {
      ok: false,
      message: response?.error?.message ?? "Draft score was not accepted by the backend."
    };
  }

  return {
    auditId: response.data?.telemetry?.auditId ?? "",
    checks: Array.isArray(response.data?.checks) ? response.data.checks : [],
    ok: true,
    score: Number(response.data?.score ?? 0)
  };
}

export async function submitManualQaReview(
  score,
  {
    recordManualQaReview = qualityService.recordManualQaReview,
    reviewer = "senior-qa"
  } = {}
) {
  const response = await recordManualQaReview(buildManualQaReviewPayload(score, { reviewer }));

  if (response?.status !== "ok") {
    return {
      ok: false,
      message: response?.error?.message ?? "Manual QA review was not accepted by the backend."
    };
  }

  const reviewId = response.data?.reviewId;
  const auditId = response.data?.auditId;

  if (!reviewId || !auditId) {
    return {
      ok: false,
      message: "Manual QA review was not confirmed by backend manual QA evidence."
    };
  }

  return {
    auditId,
    ok: true,
    reviewId,
    score: Number(response.data?.score ?? 0)
  };
}

export async function scoreAiSuggestionBatch(
  suggestions,
  { scoreDraftResponses = qualityService.scoreDraftResponses } = {}
) {
  const payload = buildAiSuggestionBatchScorePayload(suggestions);

  if (!payload.suggestions.length) {
    return {
      ok: false,
      message: "No AI suggestions are available for backend scoring."
    };
  }

  const response = await scoreDraftResponses(payload);

  if (response?.status !== "ok") {
    return {
      ok: false,
      message: response?.error?.message ?? "AI suggestion scoring was not accepted by the backend."
    };
  }

  const auditId = response.data?.telemetry?.auditId;

  if (!auditId) {
    return {
      ok: false,
      message: "AI suggestion scoring was not confirmed by backend scoring audit evidence."
    };
  }

  return {
    auditId,
    checks: Array.isArray(response.data?.checks) ? response.data.checks : [],
    ok: true,
    score: Number(response.data?.score ?? 0)
  };
}

function normalizeManualQaScore(score) {
  const numericScore = Number(score?.score ?? 0);

  if (String(score?.scale ?? "").toUpperCase() === "QA" || numericScore > 5) {
    return Math.max(0, Math.min(100, Math.round(numericScore)));
  }

  return Math.max(0, Math.min(100, Math.round((numericScore / 5) * 100)));
}
