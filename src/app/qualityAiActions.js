import { qualityService } from "../services/qualityService.js";

export function buildCoachingDraftScorePayload(item, { aiConsent = false } = {}) {
  return {
    aiConsent,
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

export function buildManualQaReviewPayload(score, { criteria, reviewer = "senior-qa", reviewScore } = {}) {
  const normalizedScore = Number.isFinite(Number(reviewScore))
    ? clampScore(reviewScore)
    : normalizeManualQaScore(score);

  return {
    conversationId: score?.conversationId ?? score?.id ?? "",
    criteria: criteria ?? {
      customerScore: Number(score?.score ?? 0),
      normalizedScore
    },
    reviewer,
    score: normalizedScore
  };
}

export function buildAiSuggestionBatchScorePayload(suggestions = [], { aiConsent = false } = {}) {
  const list = Array.isArray(suggestions) ? suggestions : [];
  const ids = list.map((suggestion) => suggestion?.id).filter(Boolean);
  const conversationIds = list.map((suggestion) => suggestion?.conversationId).filter(Boolean);
  const primaryConversationId = conversationIds[0] ?? ids[0];

  return {
    aiConsent,
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
  { aiConsent = false, scoreDraftResponse = qualityService.scoreDraftResponse } = {}
) {
  const response = await scoreDraftResponse(buildCoachingDraftScorePayload(item, { aiConsent }));

  if (response?.status !== "ok") {
    return {
      ok: false,
      message: response?.error?.message ?? "Сервер не принял оценку черновика."
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
    criteria,
    recordManualQaReview = qualityService.recordManualQaReview,
    reviewer = "senior-qa",
    reviewScore
  } = {}
) {
  const response = await recordManualQaReview(buildManualQaReviewPayload(score, { criteria, reviewer, reviewScore }));

  if (response?.status !== "ok") {
    return {
      ok: false,
      message: response?.error?.message ?? "Сервер не принял ручную QA-оценку."
    };
  }

  const reviewId = response.data?.reviewId;
  const auditId = response.data?.auditId;

  if (!reviewId || !auditId) {
    return {
      ok: false,
      message: "Ручная QA-оценка не подтверждена бэкендом."
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
  { aiConsent = false, scoreDraftResponses = qualityService.scoreDraftResponses } = {}
) {
  const payload = buildAiSuggestionBatchScorePayload(suggestions, { aiConsent });

  if (!payload.suggestions.length) {
    return {
      ok: false,
      message: "Нет подсказок для проверки по правилам."
    };
  }

  const response = await scoreDraftResponses(payload);

  if (response?.status !== "ok") {
    return {
      ok: false,
      message: response?.error?.message ?? "Сервер не принял проверку подсказок."
    };
  }

  const auditId = response.data?.telemetry?.auditId;

  if (!auditId) {
    return {
      ok: false,
      message: "Сервер не подтвердил сохранение результата проверки."
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

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}
