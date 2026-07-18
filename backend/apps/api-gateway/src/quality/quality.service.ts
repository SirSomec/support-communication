import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { ConversationRepository, type ConversationLifecycleEvent } from "../conversation/conversation.repository.js";
import { IdentityRepository } from "../identity/identity.repository.js";
import { createQualityScoringProviderRequest } from "./quality-scoring.adapter.js";
import { createDeterministicQualityScoringProvider } from "./quality-scoring.deterministic-provider.js";
import {
  configureOpenAiCompatibleQualityProvider,
  type QualityAiProviderConfiguration
} from "./quality-scoring.openai-provider.js";
import type { QualityScoringProviderResult } from "./quality-scoring.provider.js";
import {
  QualityRepository,
  type AiScoringAuditRecord,
  type AiSuggestionDecisionRecord,
  type ManualQaReviewRecord,
  type QualityRatingRecord,
  type QualityRepositoryPort
} from "./quality.repository.js";
import { AI_CLOSED_CONVERSATION_OPERATOR } from "./quality.types.js";

const QUALITY_SERVICE = "qualityService";

export interface QualityRequestContext {
  actorId?: string;
  actorName?: string;
  actorType?: ConversationLifecycleEvent["actorType"];
  tenantId?: string;
}

interface AttachmentPayload {
  id?: string;
  status?: string;
}

interface ScoreDraftPayload {
  aiConsent?: boolean;
  attachments?: AttachmentPayload[];
  channel?: string;
  conversationId?: string;
  idempotencyKey?: string;
  locale?: string;
  mode?: string;
  operatorId?: string;
  suggestions?: Array<Record<string, unknown>>;
  text?: string;
}

interface ClientRatingPayload {
  channel?: string;
  clientId?: string;
  conversationId?: string;
  idempotencyKey?: string;
  operator?: string;
  scale?: "CSAT" | "CSI" | "QA";
  score?: number;
  topic?: string;
}

interface ManualQaPayload {
  conversationId?: string;
  criteria?: Record<string, number>;
  idempotencyKey?: string;
  overrideReason?: string;
  reviewer?: string;
  score?: number;
}

interface AiSuggestionDecisionPayload {
  action?: "accept" | "edit" | "reject";
  conversationId?: string;
  finalText?: string;
  originalText?: string;
  providerId?: string;
  providerResultId?: string;
  scoringAuditId?: string;
  suggestionId?: string;
}

export interface QualityDirectorySources {
  conversationRepository?: Pick<ConversationRepository, "listConversations">;
  identityRepository?: Pick<IdentityRepository, "findTenantUsers">;
}

export class QualityService {
  private readonly rulesProvider = createDeterministicQualityScoringProvider();
  private readonly aiProvider: QualityAiProviderConfiguration;
  private readonly directorySources: QualityDirectorySources;

  constructor(
    private readonly qualityRepository: QualityRepositoryPort = QualityRepository.default(),
    aiProvider: QualityAiProviderConfiguration = configureOpenAiCompatibleQualityProvider(),
    directorySources: QualityDirectorySources = {}
  ) {
    this.aiProvider = aiProvider;
    this.directorySources = directorySources;
  }

  async fetchQualityWorkspace(context: QualityRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveQualityTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("fetchQualityWorkspace");
    }

    const [workspace, ratings, manualQaReviews, aiScoringAudits, aiSuggestionDecisions, directory] = await Promise.all([
      Promise.resolve(this.qualityRepository.readWorkspace()),
      Promise.resolve(this.qualityRepository.listQualityRatings({ tenantId })),
      Promise.resolve(this.qualityRepository.listManualQaReviews({ tenantId })),
      Promise.resolve(this.qualityRepository.listAiScoringAudits({ tenantId })),
      Promise.resolve(this.qualityRepository.listAiSuggestionDecisions({ tenantId })),
      this.loadQualityDirectory(tenantId)
    ]);
    const qualityScores = mergeQualityScores(workspace.qualityMetrics, ratings, manualQaReviews, directory);

    return createEnvelope({
      service: QUALITY_SERVICE,
      operation: "fetchQualityWorkspace",
      traceId: qualityTraceId("fetchQualityWorkspace"),
      partial: true,
      meta: apiMeta({ tenantId }),
      data: {
        capabilities: {
          aiConsentRequired: true,
          aiProviderConnected: this.aiProvider.configured,
          aiProviderModel: this.aiProvider.model,
          aiProviderReason: this.aiProvider.reason,
          piiRedaction: ["email", "phone"],
          rulesFallbackAvailable: true,
          scoringLabel: this.aiProvider.configured ? "AI with local rules fallback" : "Local text rules",
          scoringMode: this.aiProvider.configured ? "ai_with_rules_fallback" : "rules"
        },
        aiCoachingQueue: clone(workspace.aiCoachingQueue),
        aiEffectivenessMetrics: buildAiEffectiveness(aiSuggestionDecisions),
        aiRealtimeChecks: clone(workspace.aiRealtimeChecks),
        aiSuggestions: clone(workspace.aiSuggestions),
        knowledgeArticles: clone(workspace.knowledgeArticles),
        aiScoringAudits: clone(aiScoringAudits),
        aiSuggestionDecisions: clone(aiSuggestionDecisions),
        manualQaReviews: clone(manualQaReviews),
        qualityMetrics: clone(qualityScores),
        qualityScores: clone(qualityScores),
        tenantId
      }
    });
  }

  private async loadQualityDirectory(tenantId: string): Promise<QualityDirectory> {
    const conversationRepository = this.directorySources.conversationRepository ?? ConversationRepository.default();
    const identityRepository = this.directorySources.identityRepository ?? IdentityRepository.default();
    const [conversations, users] = await Promise.all([
      Promise.resolve(conversationRepository.listConversations({ tenantId, take: 500, messageTake: 1 })).catch(() => []),
      Promise.resolve(identityRepository.findTenantUsers(tenantId)).catch(() => [])
    ]);

    return {
      conversationNameById: new Map(
        conversations
          .filter((conversation) => String(conversation.tenantId ?? "").trim() === tenantId)
          .map((conversation) => [conversation.id, String(conversation.name ?? "").trim()])
      ),
      operatorNameById: new Map(
        users.map((user) => [String(user.id ?? ""), String(user.name ?? "").trim()])
      )
    };
  }

  async scoreDraftResponse(payload: ScoreDraftPayload | null | undefined, context: QualityRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return invalidEnvelope("scoreDraftResponse", "quality_draft_payload_required", "Draft scoring payload is required.", {});
    }
    const tenantId = resolveQualityTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("scoreDraftResponse");
    }

    const traceId = qualityTraceId("scoreDraftResponse");
    const requestedAt = new Date().toISOString();
    const idempotencyKey = payload.idempotencyKey?.trim();
    const auditId = idempotencyKey ? stableQualityId("ai", tenantId, idempotencyKey) : makeAuditId("ai");
    const conversationId = payload.conversationId?.trim() || "draft";
    const requestFingerprint = idempotencyKey ? qualityDraftRequestFingerprint(payload, tenantId) : null;
    if (idempotencyKey && requestFingerprint) {
      let claim;
      try {
        claim = await this.qualityRepository.claimAiScoringAudit({
          auditId,
          conversationId,
          createdAt: requestedAt,
          providerId: "pending",
          providerResultId: null,
          queue: "quality-ai-scoring",
          requestFingerprint,
          resultSnapshot: null,
          score: null,
          status: "pending",
          tenantId,
          traceId,
          updatedAt: requestedAt
        });
      } catch {
        return errorEnvelope("scoreDraftResponse", traceId, "quality_scoring_persistence_failed", "Quality scoring request could not be claimed.", {
          conversationId: payload.conversationId ?? null,
          tenantId
        });
      }
      if (!claim.claimed) {
        if (claim.record.requestFingerprint !== requestFingerprint) {
          return idempotencyConflictEnvelope("scoreDraftResponse", traceId, idempotencyKey, tenantId);
        }
        if (claim.record.resultSnapshot) {
          return createEnvelope({
            service: QUALITY_SERVICE,
            operation: "scoreDraftResponse",
            traceId,
            meta: apiMeta({ conversationId: payload.conversationId ?? null, idempotentReplay: true, tenantId }),
            data: clone(claim.record.resultSnapshot)
          });
        }
        return errorEnvelope("scoreDraftResponse", traceId, "quality_scoring_in_progress", "Quality scoring is already in progress for this idempotency key.", {
          idempotencyKey,
          tenantId
        });
      }
    }

    const providerRequest = createQualityScoringProviderRequest({
      ...payload,
      attachments: payload.attachments?.map((attachment) => ({ ...attachment })),
      tenantId
    }, { requestedAt, traceId });
    const aiAllowed = payload.aiConsent === true && this.aiProvider.configured && Boolean(this.aiProvider.provider);
    let providerResult: QualityScoringProviderResult;
    let fallbackReason: string | null = null;
    if (aiAllowed) {
      try {
        providerResult = await this.aiProvider.provider!.score(providerRequest);
      } catch {
        fallbackReason = "provider_unavailable";
        providerResult = await this.rulesProvider.score(providerRequest);
      }
      if (providerResult.status === "failed") {
        fallbackReason = providerResult.error.code;
        providerResult = await this.rulesProvider.score(providerRequest);
      }
    } else {
      fallbackReason = payload.aiConsent === true
        ? this.aiProvider.reason ?? "provider_not_configured"
        : "consent_required";
      providerResult = await this.rulesProvider.score(providerRequest);
    }

    const checks = providerResult.checks;
    const score = providerResult.score;
    const scoringMode = providerResult.providerId === this.rulesProvider.providerId ? "rules" : "ai";
    const providerResultId = providerResult.providerResultId;
    const createdAt = requestedAt;
    const lifecycleEvent = conversationId === "draft" ? undefined : createQualityLifecycleEvent({
      context,
      conversationId,
      data: {
        auditId,
        fallbackReason,
        modelVersion: providerResult.explainability.modelVersion,
        providerId: providerResult.providerId,
        providerResultId,
        score,
        status: providerResult.status,
        usage: providerResult.telemetry.usage ?? null
      },
      eventType: "quality.assessment.completed",
      occurredAt: createdAt,
      reason: null,
      source: "quality.draft-score",
      sourceEventId: auditId,
      tenantId,
      traceId
    });
    const responseData = {
      checks,
      conversationId: payload.conversationId ?? null,
      explainability: providerResult.explainability,
      fallbackReason,
      provider: {
        model: providerResult.telemetry.model,
        providerId: providerResult.providerId,
        providerResultId
      },
      repairActions: providerResult.repairActions,
      score,
      scoringMode,
      telemetry: {
        auditId,
        effectivenessKey: `quality_${payload.conversationId ?? "draft"}`,
        model: providerResult.telemetry.model,
        persisted: true,
        providerResultId,
        queue: "quality-ai-scoring",
        usage: providerResult.telemetry.usage ?? null
      }
    };
    let persisted: AiScoringAuditRecord;
    try {
      const record: AiScoringAuditRecord = {
        auditId,
        conversationId,
        createdAt,
        providerId: providerResult.providerId,
        providerResultId,
        queue: "quality-ai-scoring",
        requestFingerprint,
        resultSnapshot: responseData,
        score,
        status: providerResult.status,
        tenantId,
        traceId,
        updatedAt: new Date().toISOString()
      };
      persisted = idempotencyKey
        ? await this.qualityRepository.completeAiScoringAudit(record, lifecycleEvent)
        : await this.qualityRepository.saveAiScoringAudit(record, lifecycleEvent);
    } catch {
      return errorEnvelope("scoreDraftResponse", traceId, "quality_scoring_persistence_failed", "Quality scoring result could not be persisted.", {
        conversationId: payload.conversationId ?? null,
        tenantId
      });
    }
    if (persisted.providerResultId !== providerResultId) {
      return idempotencyConflictEnvelope("scoreDraftResponse", traceId, idempotencyKey, tenantId);
    }

    return createEnvelope({
      service: QUALITY_SERVICE,
      operation: "scoreDraftResponse",
      traceId,
      meta: apiMeta({ conversationId: payload.conversationId ?? null, tenantId }),
      data: responseData
    });
  }

  async recordClientQualityRating(payload: ClientRatingPayload | null | undefined, context: QualityRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};

    if (!request.conversationId?.trim() || !request.channel?.trim() || !request.operator?.trim()) {
      return invalidEnvelope("recordClientQualityRating", "quality_rating_context_required", "conversationId, channel and operator are required.", {
        channel: request.channel ?? null,
        conversationId: request.conversationId ?? null,
        operator: request.operator ?? null
      });
    }
    const tenantId = resolveQualityTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("recordClientQualityRating");
    }

    const idempotencyKey = request.idempotencyKey?.trim();
    const ratingId = idempotencyKey ? stableQualityId("quality", tenantId, idempotencyKey) : `quality_${randomUUID()}`;
    const eventId = idempotencyKey ? stableQualityId("quality_score", tenantId, idempotencyKey) : makeEventId("quality_score");
    const traceId = qualityTraceId("recordClientQualityRating");
    const conversationId = request.conversationId;
    const createdAt = new Date().toISOString();
    let previousRating: QualityRatingRecord | undefined;
    try {
      previousRating = (await Promise.resolve(this.qualityRepository.listQualityRatings({
        conversationId: conversationId.trim(),
        tenantId
      }))).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
    } catch {
      return errorEnvelope("recordClientQualityRating", traceId, "quality_rating_persistence_failed", "Quality rating could not be persisted.", {
        conversationId,
        tenantId
      });
    }
    const lifecycleEvent = createQualityLifecycleEvent({
      context,
      conversationId: conversationId.trim(),
      data: {
        previousRatingId: previousRating?.ratingId ?? null,
        previousScore: previousRating?.score ?? null,
        ratingId,
        scale: request.scale ?? "CSAT",
        score: request.score ?? null
      },
      eventType: previousRating ? "quality.assessment.changed" : "quality.assessment.set",
      occurredAt: createdAt,
      reason: null,
      source: "quality.rating",
      sourceEventId: ratingId,
      tenantId,
      traceId
    });
    let persisted: QualityRatingRecord;
    try {
      persisted = await this.qualityRepository.saveQualityRating({
        auditId: makeAuditId("quality"),
        channel: request.channel.trim(),
        clientId: request.clientId?.trim() || null,
        conversationId: conversationId.trim(),
        createdAt,
        operator: request.operator.trim(),
        ratingId,
        realtimeEventId: eventId,
        scale: request.scale ?? "CSAT",
        score: request.score ?? null,
        tenantId,
        topic: request.topic?.trim() || null
      }, lifecycleEvent);
    } catch {
      return errorEnvelope("recordClientQualityRating", traceId, "quality_rating_persistence_failed", "Quality rating could not be persisted.", {
        conversationId,
        tenantId
      });
    }
    if (!sameQualityRatingRequest(persisted, request)) {
      return idempotencyConflictEnvelope("recordClientQualityRating", traceId, idempotencyKey, tenantId);
    }

    return createEnvelope({
      service: QUALITY_SERVICE,
      operation: "recordClientQualityRating",
      traceId,
      meta: apiMeta({ conversationId }),
      data: {
        auditId: persisted.auditId,
        links: {
          channel: persisted.channel,
          clientId: persisted.clientId,
          conversationId: persisted.conversationId,
          operator: persisted.operator,
          topic: persisted.topic
        },
        persisted: true,
        ratingId: persisted.ratingId,
        realtimeEvent: realtimeEvent({
          data: {
            ratingId: persisted.ratingId,
            scale: persisted.scale,
            score: persisted.score
          },
          eventId,
          eventName: "quality.score.updated",
          resourceId: conversationId,
          resourceType: "conversation",
          schemaVersion: "quality-score/v1",
          tenantId,
          traceId
        }),
        scale: persisted.scale,
        score: persisted.score
      }
    });
  }

  async recordManualQaReview(payload: ManualQaPayload | null | undefined, context: QualityRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};

    if (!request.conversationId?.trim() || !request.reviewer?.trim()) {
      return invalidEnvelope("recordManualQaReview", "manual_qa_context_required", "conversationId and reviewer are required.", {
        conversationId: request.conversationId ?? null,
        reviewer: request.reviewer ?? null
      });
    }
    const tenantId = resolveQualityTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("recordManualQaReview");
    }

    const traceId = qualityTraceId("recordManualQaReview");
    const idempotencyKey = request.idempotencyKey?.trim();
    const reviewId = idempotencyKey ? stableQualityId("qa", tenantId, idempotencyKey) : `qa_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const overrideReason = request.overrideReason?.trim() || null;
    const lifecycleEvent = createQualityLifecycleEvent({
      context,
      conversationId: request.conversationId.trim(),
      data: {
        criteria: clone(request.criteria ?? {}),
        reviewId,
        reviewer: request.reviewer.trim(),
        score: request.score ?? null
      },
      eventType: overrideReason ? "quality.assessment.appealed" : "quality.assessment.completed",
      occurredAt: createdAt,
      reason: overrideReason,
      source: "quality.manual-review",
      sourceEventId: reviewId,
      tenantId,
      traceId
    });
    let persisted: ManualQaReviewRecord;
    try {
      persisted = await this.qualityRepository.saveManualQaReview({
        auditId: makeAuditId("quality"),
        conversationId: request.conversationId.trim(),
        createdAt,
        criteria: clone(request.criteria ?? {}),
        overrideReason,
        reviewId,
        reviewer: request.reviewer.trim(),
        score: request.score ?? null,
        tenantId
      }, lifecycleEvent);
    } catch {
      return errorEnvelope("recordManualQaReview", traceId, "manual_qa_persistence_failed", "Manual QA review could not be persisted.", {
        conversationId: request.conversationId,
        tenantId
      });
    }
    if (!sameManualQaRequest(persisted, request)) {
      return idempotencyConflictEnvelope("recordManualQaReview", traceId, idempotencyKey, tenantId);
    }

    return createEnvelope({
      service: QUALITY_SERVICE,
      operation: "recordManualQaReview",
      traceId,
      meta: apiMeta({ conversationId: request.conversationId, tenantId }),
      data: {
        auditId: persisted.auditId,
        criteria: clone(persisted.criteria),
        override: {
          auditRequired: Boolean(persisted.overrideReason),
          reason: persisted.overrideReason
        },
        persisted: true,
        reviewId: persisted.reviewId,
        reviewer: persisted.reviewer,
        score: persisted.score
      }
    });
  }
  async recordAiSuggestionDecision(payload: AiSuggestionDecisionPayload | null | undefined, context: QualityRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const action = request.action;
    if (!request.suggestionId?.trim() || !request.conversationId?.trim() || !request.originalText?.trim() || !action || !["accept", "edit", "reject"].includes(action)) {
      return invalidEnvelope("recordAiSuggestionDecision", "quality_suggestion_decision_context_required", "suggestionId, conversationId, action and originalText are required.", {});
    }
    const finalText = action === "reject" ? null : action === "accept"
      ? request.finalText?.trim() || request.originalText.trim()
      : request.finalText?.trim() || null;
    if (action === "edit" && !finalText) {
      return invalidEnvelope("recordAiSuggestionDecision", "quality_suggestion_final_text_required", "finalText is required for edit.", {});
    }
    const tenantId = resolveQualityTenantId(context);
    if (!tenantId) return tenantRequiredEnvelope("recordAiSuggestionDecision");
    const operatorId = context.actorId?.trim();
    if (!operatorId) return invalidEnvelope("recordAiSuggestionDecision", "quality_operator_context_required", "Authenticated operator context is required.", {});
    const suggestionId = request.suggestionId.trim();
    const conversationId = request.conversationId.trim();
    const createdAt = new Date().toISOString();
    const traceId = qualityTraceId("recordAiSuggestionDecision");
    const decisionId = stableQualityId("ai_decision", tenantId, suggestionId);
    const record: AiSuggestionDecisionRecord = {
      action, conversationId, createdAt, decisionId, finalText,
      finalTextHash: finalText ? hashText(finalText) : null,
      operatorId, operatorName: context.actorName?.trim() || null,
      originalText: request.originalText.trim(), originalTextHash: hashText(request.originalText.trim()),
      providerId: request.providerId?.trim() || null, providerResultId: request.providerResultId?.trim() || null,
      scoringAuditId: request.scoringAuditId?.trim() || null, suggestionId, tenantId
    };
    const lifecycleEvent = createQualityLifecycleEvent({
      context,
      conversationId,
      data: { action, decisionId, finalTextHash: record.finalTextHash, originalTextHash: record.originalTextHash, providerId: record.providerId, providerResultId: record.providerResultId, scoringAuditId: record.scoringAuditId, suggestionId },
      eventType: "quality.ai-suggestion.decided", occurredAt: createdAt, reason: null,
      source: "quality.ai-suggestion-decision", sourceEventId: decisionId, tenantId, traceId
    });
    let persisted: AiSuggestionDecisionRecord;
    try { persisted = await this.qualityRepository.saveAiSuggestionDecision(record, lifecycleEvent); }
    catch { return errorEnvelope("recordAiSuggestionDecision", traceId, "quality_suggestion_decision_persistence_failed", "AI suggestion decision could not be persisted.", { conversationId, suggestionId, tenantId }); }
    if (!sameAiSuggestionDecision(persisted, record)) {
      return idempotencyConflictEnvelope("recordAiSuggestionDecision", traceId, suggestionId, tenantId);
    }
    return createEnvelope({ service: QUALITY_SERVICE, operation: "recordAiSuggestionDecision", traceId, meta: apiMeta({ conversationId, tenantId }), data: { decisionId: persisted.decisionId, decision: clone(persisted), persisted: true } });
  }
}

function hashText(text: string): string { return createHash("sha256").update(text).digest("hex"); }
function sameAiSuggestionDecision(left: AiSuggestionDecisionRecord, right: AiSuggestionDecisionRecord): boolean {
  const { createdAt: _leftCreatedAt, ...leftStable } = left;
  const { createdAt: _rightCreatedAt, ...rightStable } = right;
  return canonicalJson(leftStable) === canonicalJson(rightStable);
}
function buildAiEffectiveness(decisions: AiSuggestionDecisionRecord[]): Array<Record<string, unknown>> {
  const counts = { accept: 0, edit: 0, reject: 0 };
  for (const decision of decisions) counts[decision.action] += 1;
  const total = decisions.length;
  const rate = (count: number) => (total ? count / total : 0);
  const percent = (count: number) => `${Math.round(rate(count) * 100)}%`;
  const detail = (count: number) => `${count} of ${total} AI suggestion decisions`;
  return [
    { id: "accepted-rate", label: "Accepted without edits", value: percent(counts.accept), detail: detail(counts.accept), accepted: counts.accept, acceptanceRate: rate(counts.accept), total },
    { id: "edited-rate", label: "Edited before send", value: percent(counts.edit), detail: detail(counts.edit), edited: counts.edit, editRate: rate(counts.edit), total },
    { id: "rejected-rate", label: "Rejected by operator", value: percent(counts.reject), detail: detail(counts.reject), rejected: counts.reject, rejectionRate: rate(counts.reject), total }
  ];
}

interface QualityDirectory {
  conversationNameById: Map<string, string>;
  operatorNameById: Map<string, string>;
}

function mergeQualityScores(
  base: Array<Record<string, unknown>>,
  ratings: QualityRatingRecord[],
  reviews: ManualQaReviewRecord[],
  directory?: QualityDirectory
): Array<Record<string, unknown>> {
  const latestReviewByConversation = new Map<string, ManualQaReviewRecord>();
  for (const review of [...reviews].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))) {
    if (!latestReviewByConversation.has(review.conversationId)) {
      latestReviewByConversation.set(review.conversationId, review);
    }
  }
  const persisted = ratings.map((rating) => ({
    ...clone(rating),
    client: directory?.conversationNameById.get(rating.conversationId) || rating.clientId || rating.conversationId,
    id: rating.ratingId,
    manualReviewId: latestReviewByConversation.get(rating.conversationId)?.reviewId ?? null,
    operatorName: directory?.operatorNameById.get(rating.operator)
      || (rating.operator === AI_CLOSED_CONVERSATION_OPERATOR ? "AI-бот" : null),
    status: rating.score !== null && rating.score < 4 ? "Low score" : "Rated"
  }));
  const persistedIds = new Set(persisted.map((item) => item.id));
  const baseWithReviews = clone(base)
    .filter((item) => !persistedIds.has(String(item.id ?? "")))
    .map((item) => ({
      ...item,
      manualReviewId: latestReviewByConversation.get(String(item.conversationId ?? ""))?.reviewId ?? item.manualReviewId ?? null
    }));
  return [...persisted, ...baseWithReviews];
}

function createQualityLifecycleEvent(input: {
  context: QualityRequestContext;
  conversationId: string;
  data: Record<string, unknown>;
  eventType: string;
  occurredAt: string;
  reason: string | null;
  source: string;
  sourceEventId: string;
  tenantId: string;
  traceId: string;
}): ConversationLifecycleEvent {
  return {
    actorId: input.context.actorId?.trim() || null,
    actorName: input.context.actorName?.trim() || null,
    actorType: input.context.actorType ?? "system",
    conversationId: input.conversationId,
    data: clone(input.data),
    eventType: input.eventType,
    id: stableQualityId("lifecycle", input.tenantId, `${input.source}:${input.sourceEventId}`),
    ingestedAt: new Date().toISOString(),
    occurredAt: input.occurredAt,
    reason: input.reason,
    schemaVersion: "conversation-lifecycle/v1",
    source: input.source,
    sourceEventId: input.sourceEventId,
    tenantId: input.tenantId,
    traceId: input.traceId
  };
}

function stableQualityId(scope: string, tenantId: string, value: string): string {
  const digest = createHash("sha256").update(`${tenantId}:${scope}:${value}`).digest("hex").slice(0, 32);
  return `${scope}_${digest}`;
}

function sameQualityRatingRequest(persisted: QualityRatingRecord, request: ClientRatingPayload): boolean {
  return persisted.channel === request.channel?.trim()
    && persisted.clientId === (request.clientId?.trim() || null)
    && persisted.conversationId === request.conversationId?.trim()
    && persisted.operator === request.operator?.trim()
    && persisted.scale === (request.scale ?? "CSAT")
    && persisted.score === (request.score ?? null)
    && persisted.topic === (request.topic?.trim() || null);
}

function sameManualQaRequest(persisted: ManualQaReviewRecord, request: ManualQaPayload): boolean {
  return persisted.conversationId === request.conversationId?.trim()
    && persisted.reviewer === request.reviewer?.trim()
    && persisted.score === (request.score ?? null)
    && persisted.overrideReason === (request.overrideReason?.trim() || null)
    && canonicalJson(persisted.criteria) === canonicalJson(request.criteria ?? {});
}

function qualityDraftRequestFingerprint(payload: ScoreDraftPayload, tenantId: string): string {
  const request = { ...payload };
  delete request.idempotencyKey;
  return createHash("sha256")
    .update(canonicalJson({ ...request, tenantId }))
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function idempotencyConflictEnvelope(operation: string, traceId: string, idempotencyKey: string | undefined, tenantId: string) {
  return invalidEnvelope(operation, "idempotency_key_reused", "Idempotency key was already used for a different quality request.", {
    idempotencyKey: idempotencyKey ?? null,
    tenantId
  }, traceId);
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>, traceId = qualityTraceId(operation)): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: QUALITY_SERVICE,
    operation,
    traceId,
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function errorEnvelope(operation: string, traceId: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: QUALITY_SERVICE,
    operation,
    traceId,
    status: "error",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function resolveQualityTenantId(context: QualityRequestContext = {}): string | null {
  return context.tenantId?.trim() || null;
}

function tenantRequiredEnvelope(operation: string): BackendEnvelope<Record<string, unknown>> {
  return invalidEnvelope(operation, "tenant_context_required", "Tenant context is required for quality runtime operations.", {});
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeEventId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function qualityTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(QUALITY_SERVICE, operation);
}

function realtimeEvent({
  data,
  eventId,
  eventName,
  resourceId,
  resourceType,
  schemaVersion,
  tenantId,
  traceId
}: {
  data: Record<string, unknown>;
  eventId: string;
  eventName: string;
  resourceId: string;
  resourceType: string;
  schemaVersion: string;
  tenantId: string;
  traceId: string;
}): Record<string, unknown> {
  return {
    data,
    eventId,
    eventName,
    occurredAt: new Date().toISOString(),
    resourceId,
    resourceType,
    schemaVersion,
    tenantId,
    traceId
  };
}
