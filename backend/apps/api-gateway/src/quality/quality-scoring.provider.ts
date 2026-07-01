export const QUALITY_SCORING_PROVIDER_PORT_VERSION = "quality-scoring-provider/v1" as const;

export type QualityScoringCheckTone = "danger" | "ok" | "warn";
export type QualityScoringProviderStatus = "failed" | "ok";

export interface QualityScoringProviderAttachment {
  id?: string;
  status?: string;
}

export interface QualityScoringProviderDraft {
  attachments?: QualityScoringProviderAttachment[];
  text: string;
}

export interface QualityScoringProviderContext {
  locale?: string;
  operatorId?: string;
  suggestions?: Array<Record<string, unknown>>;
}

export interface QualityScoringProviderRequest {
  channel: string;
  context?: QualityScoringProviderContext;
  conversationId: string;
  draft: QualityScoringProviderDraft;
  mode: "internal" | "reply";
  portVersion: typeof QUALITY_SCORING_PROVIDER_PORT_VERSION;
  requestedAt: string;
  tenantId: string;
  traceId: string;
}

export interface QualityScoringProviderCheck {
  detail: string;
  id: string;
  label: string;
  tone: QualityScoringCheckTone;
}

export interface QualityScoringRepairAction {
  id: string;
  label: string;
  severity: Exclude<QualityScoringCheckTone, "ok">;
}

export interface QualityScoringExplainability {
  modelVersion: string;
  reasons: string[];
}

export interface QualityScoringProviderTelemetry {
  latencyMs?: number;
  model: string;
  providerId: string;
  requestFingerprint: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface QualityScoringProviderError {
  code: string;
  message: string;
  retryable: boolean;
}

interface QualityScoringProviderResultBase {
  checks: QualityScoringProviderCheck[];
  explainability: QualityScoringExplainability;
  portVersion: typeof QUALITY_SCORING_PROVIDER_PORT_VERSION;
  providerId: string;
  providerResultId: string;
  repairActions: QualityScoringRepairAction[];
  telemetry: QualityScoringProviderTelemetry;
}

export interface QualityScoringProviderSuccessResult extends QualityScoringProviderResultBase {
  error?: never;
  score: number;
  status: "ok";
}

export interface QualityScoringProviderFailureResult extends QualityScoringProviderResultBase {
  error: QualityScoringProviderError;
  score: null;
  status: "failed";
}

export type QualityScoringProviderResult = QualityScoringProviderSuccessResult | QualityScoringProviderFailureResult;
export type NormalizedQualityScoringProviderResult = QualityScoringProviderResult;

export interface QualityScoringProvider {
  model: string;
  providerId: string;
  score(request: QualityScoringProviderRequest): Promise<QualityScoringProviderResult>;
}

export function normalizeQualityScoringProviderResult(
  result: QualityScoringProviderResult
): NormalizedQualityScoringProviderResult {
  if (result.portVersion !== QUALITY_SCORING_PROVIDER_PORT_VERSION) {
    throw new Error("quality_scoring_provider_port_version_mismatch");
  }

  if (result.status === "failed") {
    return {
      checks: clone(result.checks),
      error: clone(result.error),
      explainability: clone(result.explainability),
      portVersion: result.portVersion,
      providerId: result.providerId,
      providerResultId: result.providerResultId,
      repairActions: clone(result.repairActions),
      score: null,
      status: "failed",
      telemetry: sanitizeTelemetry(result.telemetry)
    };
  }

  return {
    checks: clone(result.checks),
    explainability: clone(result.explainability),
    portVersion: result.portVersion,
    providerId: result.providerId,
    providerResultId: result.providerResultId,
    repairActions: clone(result.repairActions),
    score: result.score,
    status: "ok",
    telemetry: sanitizeTelemetry(result.telemetry)
  };
}

function sanitizeTelemetry(telemetry: QualityScoringProviderTelemetry): QualityScoringProviderTelemetry {
  const sanitized: QualityScoringProviderTelemetry = {
    model: telemetry.model,
    providerId: telemetry.providerId,
    requestFingerprint: telemetry.requestFingerprint
  };

  if (typeof telemetry.latencyMs === "number") {
    sanitized.latencyMs = telemetry.latencyMs;
  }

  if (telemetry.usage) {
    const usage: NonNullable<QualityScoringProviderTelemetry["usage"]> = {};

    if (typeof telemetry.usage.inputTokens === "number") {
      usage.inputTokens = telemetry.usage.inputTokens;
    }

    if (typeof telemetry.usage.outputTokens === "number") {
      usage.outputTokens = telemetry.usage.outputTokens;
    }

    sanitized.usage = usage;
  }

  return clone(sanitized);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
