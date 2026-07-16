import { createHash } from "node:crypto";
import { type DurableStore, InMemoryStore } from "@support-communication/database";
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

type MaybePromise<T> = T | Promise<T>;

/**
 * Observability sink for AI quality-scoring telemetry. Every field is bucketed/redacted by the
 * adapter before it reaches storage, so records are safe to persist durably (Postgres) rather than
 * held in an ephemeral buffer. Writes are first-write-wins per identity key.
 */
export interface QualityScoringRepositoryPort {
  listRequestTelemetry(filter?: QualityScoringTelemetryFilter): MaybePromise<QualityScoringRequestTelemetryRecord[]>;
  listResponseTelemetry(filter?: QualityScoringResponseTelemetryFilter): MaybePromise<QualityScoringResponseTelemetryRecord[]>;
  listFailureEnvelopes(filter?: QualityScoringFailureEnvelopeFilter): MaybePromise<QualityScoringFailureEnvelopeRecord[]>;
  saveRequestTelemetry(record: QualityScoringRequestTelemetryRecordInput): MaybePromise<QualityScoringRequestTelemetryRecord>;
  saveResponseTelemetry(record: QualityScoringResponseTelemetryRecordInput): MaybePromise<QualityScoringResponseTelemetryRecord>;
  saveFailureEnvelope(record: QualityScoringFailureEnvelopeRecordInput): MaybePromise<QualityScoringFailureEnvelopeRecord>;
}

export interface PrismaQualityScoringRepositoryOptions {
  client: PrismaQualityScoringClient;
}

interface PrismaQualityScoringRequestTelemetryRow {
  recordedAt: Date | string;
  telemetry: QualityScoringRequestTelemetry;
  telemetryId: string;
  tenantId: string;
}

interface PrismaQualityScoringResponseTelemetryRow {
  conversationId: string | null;
  recordedAt: Date | string;
  status: QualityScoringResponseTelemetry["status"];
  telemetry: QualityScoringResponseTelemetry;
  telemetryId: string;
  tenantId: string;
}

interface PrismaQualityScoringFailureEnvelopeRow {
  envelope: QualityScoringFailureEnvelope;
  errorCode: string;
  failureId: string;
  recordedAt: Date | string;
  tenantId: string;
}

export interface PrismaQualityScoringClient {
  qualityScoringRequestTelemetry: {
    create(input: { data: PrismaQualityScoringRequestTelemetryRow }): Promise<PrismaQualityScoringRequestTelemetryRow>;
    findMany(input: {
      orderBy?: Array<Record<string, "asc" | "desc">>;
      where: { tenantId?: string };
    }): Promise<PrismaQualityScoringRequestTelemetryRow[]>;
    findUnique(input: {
      where: { tenantId_telemetryId: { telemetryId: string; tenantId: string } };
    }): Promise<PrismaQualityScoringRequestTelemetryRow | null>;
  };
  qualityScoringResponseTelemetry: {
    create(input: { data: PrismaQualityScoringResponseTelemetryRow }): Promise<PrismaQualityScoringResponseTelemetryRow>;
    findMany(input: {
      orderBy?: Array<Record<string, "asc" | "desc">>;
      where: { conversationId?: string | null; status?: string; tenantId?: string };
    }): Promise<PrismaQualityScoringResponseTelemetryRow[]>;
    findUnique(input: {
      where: { tenantId_telemetryId: { telemetryId: string; tenantId: string } };
    }): Promise<PrismaQualityScoringResponseTelemetryRow | null>;
  };
  qualityScoringFailureEnvelope: {
    create(input: { data: PrismaQualityScoringFailureEnvelopeRow }): Promise<PrismaQualityScoringFailureEnvelopeRow>;
    findMany(input: {
      orderBy?: Array<Record<string, "asc" | "desc">>;
      where: { errorCode?: string; tenantId?: string };
    }): Promise<PrismaQualityScoringFailureEnvelopeRow[]>;
    findUnique(input: {
      where: { tenantId_failureId: { failureId: string; tenantId: string } };
    }): Promise<PrismaQualityScoringFailureEnvelopeRow | null>;
  };
}

let defaultQualityScoringRepository: QualityScoringRepositoryPort | null = null;

export class QualityScoringRepository implements QualityScoringRepositoryPort {
  private constructor(private readonly store: DurableStore<QualityScoringState>) {}

  static default(): QualityScoringRepositoryPort {
    return defaultQualityScoringRepository ?? QualityScoringRepository.inMemory();
  }

  static useDefault(repository: QualityScoringRepositoryPort): void {
    defaultQualityScoringRepository = repository;
  }

  static clearDefault(): void {
    defaultQualityScoringRepository = null;
  }

  static inMemory(seed: QualityScoringState = seedQualityScoringState()): QualityScoringRepository {
    return new QualityScoringRepository(new InMemoryStore(seed));
  }

  static prisma({ client }: PrismaQualityScoringRepositoryOptions): PrismaQualityScoringRepository {
    return new PrismaQualityScoringRepository(client);
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

/**
 * Postgres-backed telemetry sink. Reuses the exact same redaction/normalization pipeline as the
 * in-memory store, then persists the sanitized record. Identity keys are first-write-wins.
 */
export class PrismaQualityScoringRepository implements QualityScoringRepositoryPort {
  constructor(private readonly client: PrismaQualityScoringClient) {}

  async listRequestTelemetry(
    filter: QualityScoringTelemetryFilter = {}
  ): Promise<QualityScoringRequestTelemetryRecord[]> {
    const rows = await this.client.qualityScoringRequestTelemetry.findMany({
      orderBy: [{ recordedAt: "asc" }],
      where: filter.tenantId ? { tenantId: filter.tenantId } : {}
    });

    return rows.map(toRequestTelemetryRecord);
  }

  async listResponseTelemetry(
    filter: QualityScoringResponseTelemetryFilter = {}
  ): Promise<QualityScoringResponseTelemetryRecord[]> {
    const rows = await this.client.qualityScoringResponseTelemetry.findMany({
      orderBy: [{ recordedAt: "asc" }],
      where: {
        ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
        ...(filter.status === undefined ? {} : { status: filter.status }),
        ...(filter.conversationId === undefined ? {} : { conversationId: filter.conversationId })
      }
    });

    return rows.map(toResponseTelemetryRecord);
  }

  async listFailureEnvelopes(
    filter: QualityScoringFailureEnvelopeFilter = {}
  ): Promise<QualityScoringFailureEnvelopeRecord[]> {
    const rows = await this.client.qualityScoringFailureEnvelope.findMany({
      orderBy: [{ recordedAt: "asc" }],
      where: {
        ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
        ...(filter.errorCode ? { errorCode: filter.errorCode } : {})
      }
    });

    return rows.map(toFailureEnvelopeRecord);
  }

  async saveRequestTelemetry(
    record: QualityScoringRequestTelemetryRecordInput
  ): Promise<QualityScoringRequestTelemetryRecord> {
    const persisted = normalizeRequestTelemetryRecord(record);
    const where = {
      tenantId_telemetryId: { telemetryId: persisted.telemetryId, tenantId: persisted.telemetry.tenantId }
    };

    const existing = await this.client.qualityScoringRequestTelemetry.findUnique({ where });
    if (existing) {
      return toRequestTelemetryRecord(existing);
    }

    let row: PrismaQualityScoringRequestTelemetryRow;
    try {
      row = await this.client.qualityScoringRequestTelemetry.create({
        data: {
          recordedAt: new Date(persisted.recordedAt),
          telemetry: clone(persisted.telemetry),
          telemetryId: persisted.telemetryId,
          tenantId: persisted.telemetry.tenantId
        }
      });
    } catch (error) {
      const concurrent = await this.client.qualityScoringRequestTelemetry.findUnique({ where });
      if (!concurrent) throw error;
      row = concurrent;
    }

    return toRequestTelemetryRecord(row);
  }

  async saveResponseTelemetry(
    record: QualityScoringResponseTelemetryRecordInput
  ): Promise<QualityScoringResponseTelemetryRecord> {
    const persisted = normalizeResponseTelemetryRecord(record);
    const where = {
      tenantId_telemetryId: { telemetryId: persisted.telemetryId, tenantId: persisted.tenantId }
    };

    const existing = await this.client.qualityScoringResponseTelemetry.findUnique({ where });
    if (existing) {
      return toResponseTelemetryRecord(existing);
    }

    let row: PrismaQualityScoringResponseTelemetryRow;
    try {
      row = await this.client.qualityScoringResponseTelemetry.create({
        data: {
          conversationId: persisted.telemetry.conversationId,
          recordedAt: new Date(persisted.recordedAt),
          status: persisted.telemetry.status,
          telemetry: clone(persisted.telemetry),
          telemetryId: persisted.telemetryId,
          tenantId: persisted.tenantId
        }
      });
    } catch (error) {
      const concurrent = await this.client.qualityScoringResponseTelemetry.findUnique({ where });
      if (!concurrent) throw error;
      row = concurrent;
    }

    return toResponseTelemetryRecord(row);
  }

  async saveFailureEnvelope(
    record: QualityScoringFailureEnvelopeRecordInput
  ): Promise<QualityScoringFailureEnvelopeRecord> {
    const persisted = normalizeFailureEnvelopeRecord(record);
    const where = {
      tenantId_failureId: { failureId: persisted.failureId, tenantId: persisted.tenantId }
    };

    const existing = await this.client.qualityScoringFailureEnvelope.findUnique({ where });
    if (existing) {
      return toFailureEnvelopeRecord(existing);
    }

    let row: PrismaQualityScoringFailureEnvelopeRow;
    try {
      row = await this.client.qualityScoringFailureEnvelope.create({
        data: {
          envelope: clone(persisted.envelope),
          errorCode: persisted.envelope.error.code,
          failureId: persisted.failureId,
          recordedAt: new Date(persisted.recordedAt),
          tenantId: persisted.tenantId
        }
      });
    } catch (error) {
      const concurrent = await this.client.qualityScoringFailureEnvelope.findUnique({ where });
      if (!concurrent) throw error;
      row = concurrent;
    }

    return toFailureEnvelopeRecord(row);
  }
}

function toRequestTelemetryRecord(
  row: PrismaQualityScoringRequestTelemetryRow
): QualityScoringRequestTelemetryRecord {
  return normalizeRequestTelemetryRecord({
    recordedAt: toIsoString(row.recordedAt),
    telemetry: row.telemetry,
    telemetryId: row.telemetryId
  }, { preserveInternalKeys: true });
}

function toResponseTelemetryRecord(
  row: PrismaQualityScoringResponseTelemetryRow
): QualityScoringResponseTelemetryRecord {
  return normalizeResponseTelemetryRecord({
    recordedAt: toIsoString(row.recordedAt),
    telemetry: row.telemetry,
    telemetryId: row.telemetryId,
    tenantId: row.tenantId
  }, { preserveInternalKeys: true });
}

function toFailureEnvelopeRecord(
  row: PrismaQualityScoringFailureEnvelopeRow
): QualityScoringFailureEnvelopeRecord {
  return normalizeFailureEnvelopeRecord({
    envelope: row.envelope,
    failureId: row.failureId,
    recordedAt: toIsoString(row.recordedAt),
    tenantId: row.tenantId
  }, { preserveInternalKeys: true });
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
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
    tenantId: bucketTenantId(requireTenantId(record.tenantId), options),
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

function requireTenantId(tenantId: string): string {
  const normalized = tenantId?.trim();
  if (!normalized) {
    throw new Error("quality_scoring_tenant_required");
  }
  return normalized;
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
