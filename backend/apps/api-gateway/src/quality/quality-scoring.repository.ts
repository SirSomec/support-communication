import { createHash } from "node:crypto";
import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import {
  bucketQualityScoringAttachmentStatus,
  bucketQualityScoringTelemetryChannel,
  bucketQualityScoringTelemetryFingerprint,
  bucketQualityScoringTelemetryIdentifier,
  type QualityScoringRequestTelemetry,
  type QualityScoringResponseTelemetry
} from "./quality-scoring.adapter.js";
import { QUALITY_SCORING_PROVIDER_PORT_VERSION } from "./quality-scoring.provider.js";

const allowedProviderErrorCodes = new Set([
  "invalid_response",
  "provider_error",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unavailable"
]);

export interface QualityScoringRequestTelemetryRecord {
  recordedAt: string;
  telemetry: QualityScoringRequestTelemetry;
  telemetryId: string;
}

export interface QualityScoringRequestTelemetryRecordInput {
  recordedAt: string;
  telemetry: QualityScoringRequestTelemetry;
  telemetryId: string;
}

export interface QualityScoringResponseTelemetryRecord {
  recordedAt: string;
  tenantId: string;
  telemetry: QualityScoringResponseTelemetry;
  telemetryId: string;
}

export interface QualityScoringResponseTelemetryRecordInput {
  recordedAt: string;
  tenantId: string;
  telemetry: QualityScoringResponseTelemetry;
  telemetryId: string;
}

export interface QualityScoringFailureEnvelope {
  conversationId: string | null;
  error: {
    code: string;
    retryable: boolean;
  };
  provider: {
    model: string;
    providerId: string;
    providerResultStored: boolean;
  };
  providerPortVersion: typeof QUALITY_SCORING_PROVIDER_PORT_VERSION;
  responseFingerprint: string;
  status: "failed";
}

export interface QualityScoringFailureEnvelopeRecord {
  envelope: QualityScoringFailureEnvelope;
  failureId: string;
  recordedAt: string;
  tenantId: string;
}

export interface QualityScoringFailureEnvelopeRecordInput {
  envelope: QualityScoringFailureEnvelope;
  failureId: string;
  recordedAt: string;
  tenantId: string;
}

export interface QualityScoringTelemetryFilter {
  tenantId?: string;
}

export interface QualityScoringResponseTelemetryFilter {
  conversationId?: string | null;
  status?: QualityScoringResponseTelemetry["status"];
  tenantId?: string;
}

export interface QualityScoringFailureEnvelopeFilter {
  errorCode?: string;
  tenantId?: string;
}

export interface QualityScoringState {
  failureEnvelopes: QualityScoringFailureEnvelopeRecord[];
  requestTelemetry: QualityScoringRequestTelemetryRecord[];
  responseTelemetry: QualityScoringResponseTelemetryRecord[];
}

export interface QualityScoringRepositoryOptions {
  filePath: string;
}

export class QualityScoringRepository {
  private constructor(private readonly store: DurableStore<QualityScoringState>) {}

  static inMemory(seed: QualityScoringState = seedQualityScoringState()): QualityScoringRepository {
    return new QualityScoringRepository(new InMemoryStore(seed));
  }

  static open({ filePath }: QualityScoringRepositoryOptions): QualityScoringRepository {
    return new QualityScoringRepository(new JsonFileStore({ filePath, seed: seedQualityScoringState() }));
  }

  readState(): QualityScoringState {
    return normalizeState(this.store.read());
  }

  listRequestTelemetry(filter: QualityScoringTelemetryFilter = {}): QualityScoringRequestTelemetryRecord[] {
    return clone(this.readState().requestTelemetry.filter((record) =>
      !filter.tenantId || record.telemetry.tenantId === filter.tenantId
    ));
  }

  listResponseTelemetry(filter: QualityScoringResponseTelemetryFilter = {}): QualityScoringResponseTelemetryRecord[] {
    return clone(this.readState().responseTelemetry.filter((record) =>
      (filter.status === undefined || record.telemetry.status === filter.status)
        && (!filter.tenantId || record.tenantId === filter.tenantId)
        && (filter.conversationId === undefined || record.telemetry.conversationId === filter.conversationId)
    ));
  }

  listFailureEnvelopes(filter: QualityScoringFailureEnvelopeFilter = {}): QualityScoringFailureEnvelopeRecord[] {
    return clone(this.readState().failureEnvelopes.filter((record) =>
      (!filter.tenantId || record.tenantId === filter.tenantId)
        && (!filter.errorCode || record.envelope.error.code === filter.errorCode)
    ));
  }

  saveRequestTelemetry(record: QualityScoringRequestTelemetryRecordInput): QualityScoringRequestTelemetryRecord {
    const persisted = normalizeRequestTelemetryRecord(record);
    let saved = persisted;

    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.requestTelemetry.find((item) =>
        item.telemetry.tenantId === persisted.telemetry.tenantId && item.telemetryId === persisted.telemetryId
      );

      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        requestTelemetry: [...current.requestTelemetry, persisted]
      };
    });

    return clone(saved);
  }

  saveResponseTelemetry(record: QualityScoringResponseTelemetryRecordInput): QualityScoringResponseTelemetryRecord {
    const persisted = normalizeResponseTelemetryRecord(record);
    let saved = persisted;

    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.responseTelemetry.find((item) =>
        item.tenantId === persisted.tenantId && item.telemetryId === persisted.telemetryId
      );

      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        responseTelemetry: [...current.responseTelemetry, persisted]
      };
    });

    return clone(saved);
  }

  saveFailureEnvelope(record: QualityScoringFailureEnvelopeRecordInput): QualityScoringFailureEnvelopeRecord {
    const persisted = normalizeFailureEnvelopeRecord(record);
    let saved = persisted;

    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.failureEnvelopes.find((item) =>
        item.tenantId === persisted.tenantId && item.failureId === persisted.failureId
      );

      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        failureEnvelopes: [...current.failureEnvelopes, persisted]
      };
    });

    return clone(saved);
  }
}

function seedQualityScoringState(): QualityScoringState {
  return {
    failureEnvelopes: [],
    requestTelemetry: [],
    responseTelemetry: []
  };
}

function normalizeState(state: Partial<QualityScoringState>): QualityScoringState {
  return {
    failureEnvelopes: (state.failureEnvelopes ?? []).map((record) =>
      normalizeFailureEnvelopeRecord(record, { preserveInternalKeys: true })
    ),
    requestTelemetry: (state.requestTelemetry ?? []).map((record) =>
      normalizeRequestTelemetryRecord(record, { preserveInternalKeys: true })
    ),
    responseTelemetry: (state.responseTelemetry ?? []).map((record) =>
      normalizeResponseTelemetryRecord(record, { preserveInternalKeys: true })
    )
  };
}

function normalizeRequestTelemetryRecord(
  record: QualityScoringRequestTelemetryRecordInput,
  options: { preserveInternalKeys?: boolean } = {}
): QualityScoringRequestTelemetryRecord {
  return {
    recordedAt: record.recordedAt,
    telemetry: normalizeRequestTelemetry(record.telemetry, options),
    telemetryId: bucketRequestTelemetryId(record.telemetryId, options)
  };
}

function normalizeResponseTelemetryRecord(
  record: QualityScoringResponseTelemetryRecordInput,
  options: { preserveInternalKeys?: boolean } = {}
): QualityScoringResponseTelemetryRecord {
  return {
    recordedAt: record.recordedAt,
    tenantId: bucketTenantId(record.tenantId ?? "tenant-demo", options),
    telemetry: normalizeResponseTelemetry(record.telemetry),
    telemetryId: bucketResponseTelemetryId(record.telemetryId, options)
  };
}

function normalizeFailureEnvelopeRecord(
  record: QualityScoringFailureEnvelopeRecordInput,
  options: { preserveInternalKeys?: boolean } = {}
): QualityScoringFailureEnvelopeRecord {
  return {
    envelope: normalizeFailureEnvelope(record.envelope),
    failureId: bucketFailureEnvelopeId(record.failureId, options),
    recordedAt: record.recordedAt,
    tenantId: bucketTenantId(record.tenantId, options)
  };
}

function bucketRequestTelemetryId(
  telemetryId: string,
  options: { preserveInternalKeys?: boolean } = {}
): string {
  if (options.preserveInternalKeys && /^quality-request-telemetry-redacted:[a-f0-9]{16}$/.test(telemetryId)) {
    return telemetryId;
  }

  if (containsSensitiveMarker(telemetryId)) {
    return `quality-request-telemetry-redacted:${hashUnsafeIdentifier(telemetryId)}`;
  }

  return /^quality-request-telemetry-(?!redacted-)[a-z0-9-]+$/.test(telemetryId)
    ? telemetryId
    : `quality-request-telemetry-redacted:${hashUnsafeIdentifier(telemetryId)}`;
}

function bucketResponseTelemetryId(
  telemetryId: string,
  options: { preserveInternalKeys?: boolean } = {}
): string {
  if (options.preserveInternalKeys && /^quality-response-telemetry-redacted:[a-f0-9]{16}$/.test(telemetryId)) {
    return telemetryId;
  }

  if (/bearer|token|secret|password|credential|api[_-]?key|sk-/i.test(telemetryId)) {
    return `quality-response-telemetry-redacted:${hashUnsafeIdentifier(telemetryId)}`;
  }

  return /^quality-response-telemetry-(?!redacted-)[a-z0-9-]+$/.test(telemetryId)
    ? telemetryId
    : `quality-response-telemetry-redacted:${hashUnsafeIdentifier(telemetryId)}`;
}

function bucketFailureEnvelopeId(
  failureId: string,
  options: { preserveInternalKeys?: boolean } = {}
): string {
  if (options.preserveInternalKeys && /^quality-failure-envelope-redacted:[a-f0-9]{16}$/.test(failureId)) {
    return failureId;
  }

  if (containsSensitiveMarker(failureId)) {
    return `quality-failure-envelope-redacted:${hashUnsafeIdentifier(failureId)}`;
  }

  return /^quality-failure-envelope-(?!redacted-)[a-z0-9-]+$/.test(failureId)
    ? failureId
    : `quality-failure-envelope-redacted:${hashUnsafeIdentifier(failureId)}`;
}

function bucketTenantId(
  tenantId: string,
  options: { preserveInternalKeys?: boolean } = {}
): string {
  if (options.preserveInternalKeys && /^tenant-redacted:[a-f0-9]{16}$/.test(tenantId)) {
    return tenantId;
  }

  if (/^tenant-(?!redacted(?:[:-]|$))[a-zA-Z0-9_.:-]+$/.test(tenantId) && !containsSensitiveMarker(tenantId)) {
    return tenantId;
  }

  return `tenant-redacted:${hashUnsafeIdentifier(tenantId)}`;
}

function normalizeRequestTelemetry(
  telemetry: QualityScoringRequestTelemetry,
  options: { preserveInternalKeys?: boolean } = {}
): QualityScoringRequestTelemetry {
  return {
    channel: bucketQualityScoringTelemetryChannel(telemetry.channel),
    context: {
      hasLocale: Boolean(telemetry.context.hasLocale),
      hasOperatorId: Boolean(telemetry.context.hasOperatorId),
      suggestionCount: telemetry.context.suggestionCount
    },
    conversationId: bucketQualityScoringTelemetryIdentifier(telemetry.conversationId),
    direction: "request",
    draft: {
      attachmentCount: telemetry.draft.attachmentCount,
      attachmentStatuses: telemetry.draft.attachmentStatuses.map(bucketQualityScoringAttachmentStatus),
      textLength: telemetry.draft.textLength
    },
    mode: telemetry.mode,
    providerPortVersion: telemetry.providerPortVersion,
    requestFingerprint: bucketQualityScoringTelemetryFingerprint(telemetry.requestFingerprint),
    requestedAt: telemetry.requestedAt,
    tenantId: bucketTenantId(telemetry.tenantId, options),
    traceId: bucketQualityScoringTelemetryIdentifier(telemetry.traceId)
  };
}

function normalizeResponseTelemetry(telemetry: QualityScoringResponseTelemetry): QualityScoringResponseTelemetry {
  const normalized: QualityScoringResponseTelemetry = {
    checks: {
      danger: safeCount(telemetry.checks.danger),
      ok: safeCount(telemetry.checks.ok),
      total: safeCount(telemetry.checks.total),
      warn: safeCount(telemetry.checks.warn)
    },
    conversationId: telemetry.conversationId === null
      ? null
      : bucketQualityScoringTelemetryIdentifier(telemetry.conversationId),
    direction: "response",
    provider: {
      model: bucketProviderModel(telemetry.provider.model),
      providerId: bucketProviderId(telemetry.provider.providerId),
      providerResultStored: Boolean(telemetry.provider.providerResultStored)
    },
    providerPortVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
    repairActionCount: safeCount(telemetry.repairActionCount),
    responseFingerprint: bucketQualityScoringTelemetryFingerprint(telemetry.responseFingerprint),
    score: typeof telemetry.score === "number" && Number.isFinite(telemetry.score) ? telemetry.score : null,
    status: telemetry.status === "failed" ? "failed" : "ok",
    usage: normalizeResponseUsage(telemetry.usage)
  };

  if (telemetry.error) {
    normalized.error = {
      code: bucketProviderErrorCode(telemetry.error.code),
      retryable: Boolean(telemetry.error.retryable)
    };
  }

  return normalized;
}

function normalizeFailureEnvelope(envelope: QualityScoringFailureEnvelope): QualityScoringFailureEnvelope {
  return {
    conversationId: envelope.conversationId === null
      ? null
      : bucketQualityScoringTelemetryIdentifier(envelope.conversationId),
    error: {
      code: bucketProviderErrorCode(envelope.error.code),
      retryable: Boolean(envelope.error.retryable)
    },
    provider: {
      model: bucketProviderModel(envelope.provider.model),
      providerId: bucketProviderId(envelope.provider.providerId),
      providerResultStored: Boolean(envelope.provider.providerResultStored)
    },
    providerPortVersion: QUALITY_SCORING_PROVIDER_PORT_VERSION,
    responseFingerprint: bucketQualityScoringTelemetryFingerprint(envelope.responseFingerprint),
    status: "failed"
  };
}

function normalizeResponseUsage(usage: QualityScoringResponseTelemetry["usage"]): QualityScoringResponseTelemetry["usage"] {
  if (!usage) {
    return undefined;
  }

  const normalized: NonNullable<QualityScoringResponseTelemetry["usage"]> = {};

  if (typeof usage.inputTokens === "number" && Number.isFinite(usage.inputTokens)) {
    normalized.inputTokens = usage.inputTokens;
  }

  if (typeof usage.outputTokens === "number" && Number.isFinite(usage.outputTokens)) {
    normalized.outputTokens = usage.outputTokens;
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function bucketProviderId(providerId: string): string {
  if (containsSensitiveMarker(providerId)) {
    return "redacted";
  }

  return /^[a-z0-9-]+$/.test(providerId) ? providerId : "redacted";
}

function bucketProviderModel(model: string): string {
  if (containsSensitiveMarker(model)) {
    return "redacted";
  }

  return /^[a-z0-9-]+\/v\d+$/.test(model) ? model : "redacted";
}

function bucketProviderErrorCode(code: string): string {
  if (containsSensitiveMarker(code)) {
    return "redacted";
  }

  return allowedProviderErrorCodes.has(code) ? code : "redacted";
}

function containsSensitiveMarker(value: string): boolean {
  return /bearer|token|secret|password|credential|api[_-]?key|sk-/i.test(value);
}

function safeCount(value: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function hashUnsafeIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
