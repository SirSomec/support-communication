import { createHash } from "node:crypto";
import {
  QUALITY_SCORING_PROVIDER_PORT_VERSION,
  type QualityScoringProvider,
  type QualityScoringProviderCheck,
  type QualityScoringProviderRequest,
  type QualityScoringProviderResult,
  type QualityScoringRepairAction
} from "./quality-scoring.provider.js";

export const DETERMINISTIC_QUALITY_SCORING_PROVIDER_ID = "deterministic-quality-scoring" as const;
export const DETERMINISTIC_QUALITY_SCORING_MODEL = "quality-deterministic/v1" as const;

const empathyPattern = /understand|sorry|apolog|help|check|verify/i;
const resolutionPattern = /check|verify|return|send|transfer|resolve|next|status/i;
const riskyPattern = /not our problem|your problem|impossible|cannot help|nothing we can do|blame/i;

export function createDeterministicQualityScoringProvider(): QualityScoringProvider {
  return {
    model: DETERMINISTIC_QUALITY_SCORING_MODEL,
    providerId: DETERMINISTIC_QUALITY_SCORING_PROVIDER_ID,
    async score(request) {
      if (request.portVersion !== QUALITY_SCORING_PROVIDER_PORT_VERSION) {
        throw new Error("quality_scoring_provider_port_version_mismatch");
      }

      const checks = getDeterministicChecks(request);
      const dangerCount = checks.filter((check) => check.tone === "danger").length;
      const warnCount = checks.filter((check) => check.tone === "warn").length;
      const requestFingerprint = fingerprintQualityRequest(request);
      const score = Math.max(0, 100 - dangerCount * 35 - warnCount * 15);

      return {
        checks,
        explainability: {
          modelVersion: DETERMINISTIC_QUALITY_SCORING_MODEL,
          reasons: checks.map((check) => `${check.id}:${check.tone}`)
        },
        portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
        providerId: DETERMINISTIC_QUALITY_SCORING_PROVIDER_ID,
        providerResultId: `quality_deterministic_${requestFingerprint.slice(0, 24)}`,
        repairActions: checks
          .filter((check) => check.tone !== "ok")
          .map((check): QualityScoringRepairAction => ({
            id: `repair-${check.id}`,
            label: check.label,
            severity: check.tone === "danger" ? "danger" : "warn"
          })),
        score,
        status: "ok",
        telemetry: {
          model: DETERMINISTIC_QUALITY_SCORING_MODEL,
          providerId: DETERMINISTIC_QUALITY_SCORING_PROVIDER_ID,
          requestFingerprint,
          usage: estimateUsage(request)
        }
      } satisfies QualityScoringProviderResult;
    }
  };
}

function getDeterministicChecks(request: QualityScoringProviderRequest): QualityScoringProviderCheck[] {
  const text = request.draft.text.trim();
  const attachments = request.draft.attachments ?? [];
  const isInternal = request.mode === "internal";
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

  const checks: QualityScoringProviderCheck[] = [];

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
      detail: request.context?.suggestions?.length
        ? "AI suggestions were checked and no critical risk remains."
        : "No critical risk remains before sending.",
      tone: "ok"
    });
  }

  return checks;
}

function fingerprintQualityRequest(request: QualityScoringProviderRequest): string {
  return createHash("sha256")
    .update(stableStringify({
      channel: request.channel,
      context: request.context ?? {},
      conversationId: request.conversationId,
      draft: request.draft,
      mode: request.mode,
      portVersion: request.portVersion,
      tenantId: request.tenantId
    }))
    .digest("hex");
}

function estimateUsage(request: QualityScoringProviderRequest): { inputTokens: number; outputTokens: number } {
  const inputText = [
    request.channel,
    request.conversationId,
    request.draft.text,
    ...(request.context?.suggestions ?? []).map((suggestion) => stableStringify(suggestion))
  ].join(" ");

  return {
    inputTokens: countTokens(inputText),
    outputTokens: Math.max(1, Math.ceil(countTokens(request.draft.text) / 3))
  };
}

function countTokens(value: string): number {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return Math.max(1, words.length);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
