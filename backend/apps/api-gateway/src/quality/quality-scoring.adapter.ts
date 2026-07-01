import { createHash } from "node:crypto";
import {
  QUALITY_SCORING_PROVIDER_PORT_VERSION,
  normalizeQualityScoringProviderResult,
  type QualityScoringExplainability,
  type QualityScoringProviderAttachment,
  type QualityScoringProviderCheck,
  type QualityScoringProviderContext,
  type QualityScoringProviderError,
  type QualityScoringProviderRequest,
  type QualityScoringProviderResult,
  type QualityScoringProviderTelemetry,
  type QualityScoringRepairAction
} from "./quality-scoring.provider.js";

const DEFAULT_CHANNEL = "SDK";
const DEFAULT_CONVERSATION_ID = "draft";
const DEFAULT_TENANT_ID = "tenant-demo";
const allowedTelemetryChannels = new Set(["Email", "MAX", "SDK", "Telegram", "VK"]);

export interface QualityScoringProviderRequestContext {
  requestedAt: string;
  traceId: string;
}

export interface QualityDraftScoringPayload {
  attachments?: Array<Record<string, unknown>>;
  channel?: unknown;
  conversationId?: unknown;
  locale?: unknown;
  mode?: unknown;
  operatorId?: unknown;
  suggestions?: unknown;
  tenantId?: unknown;
  text?: unknown;
}

export interface QualityScoringResponseContext {
  conversationId: string | null;
}

export interface QualityScoringResponseData {
  checks: QualityScoringProviderCheck[];
  conversationId: string | null;
  error?: QualityScoringProviderError;
  explainability: QualityScoringExplainability;
  provider: {
    providerId: string;
    providerResultId: string;
  };
  repairActions: QualityScoringRepairAction[];
  score: number | null;
  status: QualityScoringProviderResult["status"];
  telemetry: QualityScoringProviderTelemetry;
}

export interface QualityScoringRequestTelemetry {
  channel: string;
  context: {
    hasLocale: boolean;
    hasOperatorId: boolean;
    suggestionCount: number;
  };
  conversationId: string;
  direction: "request";
  draft: {
    attachmentCount: number;
    attachmentStatuses: string[];
    textLength: number;
  };
  mode: QualityScoringProviderRequest["mode"];
  providerPortVersion: typeof QUALITY_SCORING_PROVIDER_PORT_VERSION;
  requestFingerprint: string;
  requestedAt: string;
  tenantId: string;
  traceId: string;
}

export interface QualityScoringResponseTelemetry {
  checks: {
    danger: number;
    ok: number;
    total: number;
    warn: number;
  };
  conversationId: string | null;
  direction: "response";
  error?: {
    code: string;
    retryable: boolean;
  };
  provider: {
    model: string;
    providerId: string;
    providerResultStored: boolean;
  };
  providerPortVersion: typeof QUALITY_SCORING_PROVIDER_PORT_VERSION;
  repairActionCount: number;
  responseFingerprint: string;
  score: number | null;
  status: QualityScoringProviderResult["status"];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export function createQualityScoringProviderRequest(
  payload: QualityDraftScoringPayload,
  context: QualityScoringProviderRequestContext
): QualityScoringProviderRequest {
  return {
    channel: stringOrDefault(payload.channel, DEFAULT_CHANNEL),
    context: createProviderContext(payload),
    conversationId: stringOrDefault(payload.conversationId, DEFAULT_CONVERSATION_ID),
    draft: {
      attachments: mapAttachments(payload.attachments),
      text: stringOrDefault(payload.text, "")
    },
    mode: stringOrUndefined(payload.mode) === "internal" ? "internal" : "reply",
    portVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
    requestedAt: context.requestedAt,
    tenantId: stringOrDefault(payload.tenantId, DEFAULT_TENANT_ID),
    traceId: context.traceId
  };
}

export function createQualityScoringResponseData(
  result: QualityScoringProviderResult,
  context: QualityScoringResponseContext
): QualityScoringResponseData {
  const normalized = normalizeQualityScoringProviderResult(result);
  const response: QualityScoringResponseData = {
    checks: clone(normalized.checks),
    conversationId: context.conversationId,
    explainability: clone(normalized.explainability),
    provider: {
      providerId: normalized.providerId,
      providerResultId: normalized.providerResultId
    },
    repairActions: clone(normalized.repairActions),
    score: normalized.score,
    status: normalized.status,
    telemetry: clone(normalized.telemetry)
  };

  if (normalized.status === "failed") {
    response.error = clone(normalized.error);
  }

  return response;
}

export function createQualityScoringRequestTelemetry(request: QualityScoringProviderRequest): QualityScoringRequestTelemetry {
  const telemetry: Omit<QualityScoringRequestTelemetry, "requestFingerprint"> = {
    channel: bucketQualityScoringTelemetryChannel(request.channel),
    context: {
      hasLocale: Boolean(request.context?.locale),
      hasOperatorId: Boolean(request.context?.operatorId),
      suggestionCount: request.context?.suggestions?.length ?? 0
    },
    conversationId: bucketQualityScoringTelemetryIdentifier(request.conversationId),
    direction: "request",
    draft: {
      attachmentCount: request.draft.attachments?.length ?? 0,
      attachmentStatuses: (request.draft.attachments ?? [])
        .map((attachment) => attachment.status)
        .filter((status): status is string => Boolean(status)),
      textLength: request.draft.text.length
    },
    mode: request.mode,
    providerPortVersion: request.portVersion,
    requestedAt: request.requestedAt,
    tenantId: bucketQualityScoringTelemetryIdentifier(request.tenantId),
    traceId: bucketQualityScoringTelemetryIdentifier(request.traceId)
  };

  telemetry.draft.attachmentStatuses = telemetry.draft.attachmentStatuses.map(bucketQualityScoringAttachmentStatus);

  return {
    ...telemetry,
    requestFingerprint: fingerprintQualityScoringRequestTelemetry(telemetry)
  };
}

export function createQualityScoringResponseTelemetry(
  result: QualityScoringProviderResult,
  context: QualityScoringResponseContext
): QualityScoringResponseTelemetry {
  const normalized = normalizeQualityScoringProviderResult(result);
  const telemetry: Omit<QualityScoringResponseTelemetry, "responseFingerprint"> = {
    checks: countChecks(normalized.checks),
    conversationId: context.conversationId ? bucketQualityScoringTelemetryIdentifier(context.conversationId) : null,
    direction: "response",
    provider: {
      model: normalized.telemetry.model,
      providerId: normalized.providerId,
      providerResultStored: Boolean(normalized.providerResultId)
    },
    providerPortVersion: normalized.portVersion,
    repairActionCount: normalized.repairActions.length,
    score: normalized.score,
    status: normalized.status,
    usage: normalized.telemetry.usage ? clone(normalized.telemetry.usage) : undefined
  };

  if (normalized.status === "failed") {
    telemetry.error = {
      code: normalized.error.code,
      retryable: normalized.error.retryable
    };
  }

  return {
    ...telemetry,
    responseFingerprint: fingerprintQualityScoringResponseTelemetry(telemetry)
  };
}

function createProviderContext(payload: QualityDraftScoringPayload): QualityScoringProviderContext {
  const context: QualityScoringProviderContext = {};
  const locale = stringOrUndefined(payload.locale);
  const operatorId = stringOrUndefined(payload.operatorId);
  const suggestions = mapSuggestions(payload.suggestions);

  if (locale) {
    context.locale = locale;
  }

  if (operatorId) {
    context.operatorId = operatorId;
  }

  if (suggestions.length) {
    context.suggestions = suggestions;
  }

  return context;
}

function mapAttachments(attachments: Array<Record<string, unknown>> | undefined): QualityScoringProviderAttachment[] {
  return (attachments ?? [])
    .filter((attachment) => attachment && typeof attachment === "object" && !Array.isArray(attachment))
    .map((attachment) => {
      const mapped: QualityScoringProviderAttachment = {};
      const id = stringOrUndefined(attachment.id);
      const status = stringOrUndefined(attachment.status);

      if (id) {
        mapped.id = id;
      }

      if (status) {
        mapped.status = status;
      }

      return mapped;
    })
    .filter((attachment) => Object.keys(attachment).length > 0);
}

function mapSuggestions(suggestions: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(suggestions)) {
    return [];
  }

  return suggestions
    .filter((suggestion) => suggestion && typeof suggestion === "object" && !Array.isArray(suggestion))
    .map((suggestion) => {
      const source = suggestion as Record<string, unknown>;
      const mapped: Record<string, unknown> = {};
      const id = stringOrUndefined(source.id);
      const label = stringOrUndefined(source.label);

      if (id) {
        mapped.id = id;
      }

      if (label) {
        mapped.label = label;
      }

      return mapped;
    })
    .filter((suggestion) => Object.keys(suggestion).length > 0);
}

function stringOrDefault(value: unknown, fallback: string): string {
  return stringOrUndefined(value) ?? fallback;
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function bucketQualityScoringAttachmentStatus(status: string): string {
  return ["blocked", "failed", "pending", "ready", "uploading"].includes(status) ? status : "other";
}

export function bucketQualityScoringTelemetryChannel(channel: string): string {
  return allowedTelemetryChannels.has(channel) ? channel : "other";
}

export function bucketQualityScoringTelemetryIdentifier(value: string): string {
  if (/bearer|token|secret|password|credential|api[_-]?key|sk-/i.test(value)) {
    return "redacted";
  }

  if ((value.match(/\./g) ?? []).length >= 2) {
    return "redacted";
  }

  if (/[a-zA-Z0-9_-]{24,}/.test(value)) {
    return "redacted";
  }

  return /^(conv-|draft$|req_|tenant-|test-|trc_)[a-zA-Z0-9_.:-]*$/.test(value) ? value : "redacted";
}

export function bucketQualityScoringTelemetryFingerprint(value: string): string {
  return /^[a-f0-9]{64}$/.test(value) ? value : "redacted";
}

function countChecks(checks: QualityScoringProviderCheck[]): QualityScoringResponseTelemetry["checks"] {
  return checks.reduce<QualityScoringResponseTelemetry["checks"]>(
    (counts, check) => ({
      ...counts,
      [check.tone]: counts[check.tone] + 1,
      total: counts.total + 1
    }),
    { danger: 0, ok: 0, total: 0, warn: 0 }
  );
}

function fingerprintQualityScoringRequestTelemetry(
  telemetry: Omit<QualityScoringRequestTelemetry, "requestFingerprint" | "requestedAt" | "traceId">
    & Pick<QualityScoringRequestTelemetry, "requestedAt" | "traceId">
): string {
  return createHash("sha256")
    .update(stableStringify({
      channel: telemetry.channel,
      context: telemetry.context,
      direction: telemetry.direction,
      draft: telemetry.draft,
      mode: telemetry.mode,
      providerPortVersion: telemetry.providerPortVersion
    }))
    .digest("hex");
}

function fingerprintQualityScoringResponseTelemetry(
  telemetry: Omit<QualityScoringResponseTelemetry, "responseFingerprint">
): string {
  return createHash("sha256")
    .update(stableStringify({
      checks: telemetry.checks,
      direction: telemetry.direction,
      error: telemetry.error ?? null,
      provider: {
        model: telemetry.provider.model,
        providerId: telemetry.provider.providerId
      },
      providerPortVersion: telemetry.providerPortVersion,
      repairActionCount: telemetry.repairActionCount,
      score: telemetry.score,
      status: telemetry.status,
      usage: telemetry.usage ?? null
    }))
    .digest("hex");
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
