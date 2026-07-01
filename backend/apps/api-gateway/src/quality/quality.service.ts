import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { aiCoachingQueue, aiEffectivenessMetrics, aiRealtimeChecks, aiSuggestions, knowledgeArticles, qualityMetrics } from "./quality.fixtures.js";

const QUALITY_SERVICE = "qualityService";
const DEFAULT_TENANT_ID = "tenant-demo";
const empathyPattern = /understand|sorry|apolog|help|check|verify/i;
const resolutionPattern = /check|verify|return|send|transfer|resolve|next|status/i;
const riskyPattern = /not our problem|your problem|impossible|cannot help|nothing we can do|blame/i;

interface AttachmentPayload {
  id?: string;
  status?: string;
}

interface ScoreDraftPayload {
  attachments?: AttachmentPayload[];
  conversationId?: string;
  mode?: string;
  suggestions?: Array<Record<string, unknown>>;
  text?: string;
}

interface ClientRatingPayload {
  channel?: string;
  clientId?: string;
  conversationId?: string;
  operator?: string;
  scale?: "CSAT" | "CSI" | "QA";
  score?: number;
  topic?: string;
}

interface ManualQaPayload {
  conversationId?: string;
  criteria?: Record<string, number>;
  overrideReason?: string;
  reviewer?: string;
  score?: number;
}

export class QualityService {
  async fetchQualityWorkspace(): Promise<BackendEnvelope<Record<string, unknown>>> {
    return createEnvelope({
      service: QUALITY_SERVICE,
      operation: "fetchQualityWorkspace",
      traceId: qualityTraceId("fetchQualityWorkspace"),
      partial: true,
      meta: apiMeta(),
      data: {
        aiCoachingQueue: clone(aiCoachingQueue),
        aiEffectivenessMetrics: clone(aiEffectivenessMetrics),
        aiRealtimeChecks: clone(aiRealtimeChecks),
        aiSuggestions: clone(aiSuggestions),
        knowledgeArticles: clone(knowledgeArticles),
        qualityMetrics: clone(qualityMetrics)
      }
    });
  }

  async scoreDraftResponse(payload: ScoreDraftPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return invalidEnvelope("scoreDraftResponse", "quality_draft_payload_required", "Draft scoring payload is required.", {});
    }

    const checks = getPreSendQualityChecks(payload);
    const dangerCount = checks.filter((check) => check.tone === "danger").length;
    const warnCount = checks.filter((check) => check.tone === "warn").length;
    const score = Math.max(0, 100 - dangerCount * 35 - warnCount * 15);

    return createEnvelope({
      service: QUALITY_SERVICE,
      operation: "scoreDraftResponse",
      traceId: qualityTraceId("scoreDraftResponse"),
      meta: apiMeta({ conversationId: payload.conversationId ?? null }),
      data: {
        checks,
        conversationId: payload.conversationId ?? null,
        explainability: {
          modelVersion: "quality-rules/v1",
          reasons: checks.map((check) => `${check.id}:${check.tone}`)
        },
        repairActions: checks
          .filter((check) => check.tone !== "ok")
          .map((check) => ({ id: `repair-${check.id}`, label: check.label, severity: check.tone })),
        score,
        telemetry: {
          auditId: makeAuditId("ai"),
          effectivenessKey: `quality_${payload.conversationId ?? "draft"}`,
          model: "quality-rules/v1",
          queue: "quality-ai-scoring"
        }
      }
    });
  }

  async recordClientQualityRating(payload: ClientRatingPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};

    if (!request.conversationId?.trim() || !request.channel?.trim() || !request.operator?.trim()) {
      return invalidEnvelope("recordClientQualityRating", "quality_rating_context_required", "conversationId, channel and operator are required.", {
        channel: request.channel ?? null,
        conversationId: request.conversationId ?? null,
        operator: request.operator ?? null
      });
    }

    const ratingId = `quality_${randomUUID()}`;
    const eventId = makeEventId("quality_score");
    const traceId = qualityTraceId("recordClientQualityRating");
    const conversationId = request.conversationId;

    return createEnvelope({
      service: QUALITY_SERVICE,
      operation: "recordClientQualityRating",
      traceId,
      meta: apiMeta({ conversationId }),
      data: {
        auditId: makeAuditId("quality"),
        links: {
          channel: request.channel,
          clientId: request.clientId ?? null,
          conversationId,
          operator: request.operator,
          topic: request.topic ?? null
        },
        ratingId,
        realtimeEvent: realtimeEvent({
          data: {
            ratingId,
            scale: request.scale ?? "CSAT",
            score: request.score ?? null
          },
          eventId,
          eventName: "quality.score.updated",
          resourceId: conversationId,
          resourceType: "conversation",
          schemaVersion: "quality-score/v1",
          traceId
        }),
        scale: request.scale ?? "CSAT",
        score: request.score ?? null
      }
    });
  }

  async recordManualQaReview(payload: ManualQaPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};

    if (!request.conversationId?.trim() || !request.reviewer?.trim()) {
      return invalidEnvelope("recordManualQaReview", "manual_qa_context_required", "conversationId and reviewer are required.", {
        conversationId: request.conversationId ?? null,
        reviewer: request.reviewer ?? null
      });
    }

    return createEnvelope({
      service: QUALITY_SERVICE,
      operation: "recordManualQaReview",
      traceId: qualityTraceId("recordManualQaReview"),
      meta: apiMeta({ conversationId: request.conversationId }),
      data: {
        auditId: makeAuditId("quality"),
        criteria: clone(request.criteria ?? {}),
        override: {
          auditRequired: Boolean(request.overrideReason),
          reason: request.overrideReason ?? null
        },
        reviewId: `qa_${randomUUID()}`,
        reviewer: request.reviewer,
        score: request.score ?? null
      }
    });
  }
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

function getPreSendQualityChecks(payload: ScoreDraftPayload): Array<{ detail: string; id: string; label: string; tone: "danger" | "ok" | "warn" }> {
  const text = String(payload.text ?? "").trim();
  const attachments = payload.attachments ?? [];
  const isInternal = payload.mode === "internal";
  const hasReadyAttachment = attachments.some((attachment) => attachment.status === "ready");
  const hasBlockingAttachment = attachments.some((attachment) => attachment.status && attachment.status !== "ready");

  if (!text && !hasReadyAttachment) {
    return [
      {
        id: "empty",
        label: isInternal ? "Comment is empty" : "Response is empty",
        detail: "Add text or a ready attachment before sending.",
        tone: "danger"
      }
    ];
  }

  const checks: Array<{ detail: string; id: string; label: string; tone: "danger" | "ok" | "warn" }> = [];

  if (!isInternal && text.length > 0 && text.length < 24) {
    checks.push({
      id: "short",
      label: "Response is short",
      detail: "Add next step or timing for a customer-facing reply.",
      tone: "warn"
    });
  }

  if (!isInternal && text && !empathyPattern.test(text)) {
    checks.push({
      id: "empathy",
      label: "Missing empathy",
      detail: "Acknowledge the issue or promise a check.",
      tone: "warn"
    });
  }

  if (!isInternal && text && !resolutionPattern.test(text)) {
    checks.push({
      id: "resolution",
      label: "Missing next step",
      detail: "State what the operator will do next.",
      tone: "warn"
    });
  }

  if (riskyPattern.test(text)) {
    checks.push({
      id: "risk",
      label: "Risky wording",
      detail: "The wording may sound like refusal without an alternative.",
      tone: "danger"
    });
  }

  if (hasBlockingAttachment) {
    checks.push({
      id: "attachment",
      label: "Attachment is not ready",
      detail: "Upload or scan state blocks sending.",
      tone: "danger"
    });
  }

  if (!checks.length) {
    checks.push({
      id: "ready",
      label: isInternal ? "Comment is ready" : "Response is ready",
      detail: payload.suggestions?.length ? "AI suggestions were checked and no critical risk remains." : "No critical risk remains before sending.",
      tone: "ok"
    });
  }

  return checks;
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: QUALITY_SERVICE,
    operation,
    traceId: qualityTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
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
  traceId
}: {
  data: Record<string, unknown>;
  eventId: string;
  eventName: string;
  resourceId: string;
  resourceType: string;
  schemaVersion: string;
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
    tenantId: DEFAULT_TENANT_ID,
    traceId
  };
}
