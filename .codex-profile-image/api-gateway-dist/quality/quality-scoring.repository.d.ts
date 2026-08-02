import { type QualityScoringRequestTelemetry, type QualityScoringResponseTelemetry } from "./quality-scoring.adapter.js";
import { QUALITY_SCORING_PROVIDER_PORT_VERSION } from "./quality-scoring.provider.js";
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
        create(input: {
            data: PrismaQualityScoringRequestTelemetryRow;
        }): Promise<PrismaQualityScoringRequestTelemetryRow>;
        findMany(input: {
            orderBy?: Array<Record<string, "asc" | "desc">>;
            where: {
                tenantId?: string;
            };
        }): Promise<PrismaQualityScoringRequestTelemetryRow[]>;
        findUnique(input: {
            where: {
                tenantId_telemetryId: {
                    telemetryId: string;
                    tenantId: string;
                };
            };
        }): Promise<PrismaQualityScoringRequestTelemetryRow | null>;
    };
    qualityScoringResponseTelemetry: {
        create(input: {
            data: PrismaQualityScoringResponseTelemetryRow;
        }): Promise<PrismaQualityScoringResponseTelemetryRow>;
        findMany(input: {
            orderBy?: Array<Record<string, "asc" | "desc">>;
            where: {
                conversationId?: string | null;
                status?: string;
                tenantId?: string;
            };
        }): Promise<PrismaQualityScoringResponseTelemetryRow[]>;
        findUnique(input: {
            where: {
                tenantId_telemetryId: {
                    telemetryId: string;
                    tenantId: string;
                };
            };
        }): Promise<PrismaQualityScoringResponseTelemetryRow | null>;
    };
    qualityScoringFailureEnvelope: {
        create(input: {
            data: PrismaQualityScoringFailureEnvelopeRow;
        }): Promise<PrismaQualityScoringFailureEnvelopeRow>;
        findMany(input: {
            orderBy?: Array<Record<string, "asc" | "desc">>;
            where: {
                errorCode?: string;
                tenantId?: string;
            };
        }): Promise<PrismaQualityScoringFailureEnvelopeRow[]>;
        findUnique(input: {
            where: {
                tenantId_failureId: {
                    failureId: string;
                    tenantId: string;
                };
            };
        }): Promise<PrismaQualityScoringFailureEnvelopeRow | null>;
    };
}
export declare class QualityScoringRepository implements QualityScoringRepositoryPort {
    private readonly store;
    private constructor();
    static default(): QualityScoringRepositoryPort;
    static useDefault(repository: QualityScoringRepositoryPort): void;
    static clearDefault(): void;
    static inMemory(seed?: QualityScoringState): QualityScoringRepository;
    static prisma({ client }: PrismaQualityScoringRepositoryOptions): PrismaQualityScoringRepository;
    readState(): QualityScoringState;
    listRequestTelemetry(filter?: QualityScoringTelemetryFilter): QualityScoringRequestTelemetryRecord[];
    listResponseTelemetry(filter?: QualityScoringResponseTelemetryFilter): QualityScoringResponseTelemetryRecord[];
    listFailureEnvelopes(filter?: QualityScoringFailureEnvelopeFilter): QualityScoringFailureEnvelopeRecord[];
    saveRequestTelemetry(record: QualityScoringRequestTelemetryRecordInput): QualityScoringRequestTelemetryRecord;
    saveResponseTelemetry(record: QualityScoringResponseTelemetryRecordInput): QualityScoringResponseTelemetryRecord;
    saveFailureEnvelope(record: QualityScoringFailureEnvelopeRecordInput): QualityScoringFailureEnvelopeRecord;
}
/**
 * Postgres-backed telemetry sink. Reuses the exact same redaction/normalization pipeline as the
 * in-memory store, then persists the sanitized record. Identity keys are first-write-wins.
 */
export declare class PrismaQualityScoringRepository implements QualityScoringRepositoryPort {
    private readonly client;
    constructor(client: PrismaQualityScoringClient);
    listRequestTelemetry(filter?: QualityScoringTelemetryFilter): Promise<QualityScoringRequestTelemetryRecord[]>;
    listResponseTelemetry(filter?: QualityScoringResponseTelemetryFilter): Promise<QualityScoringResponseTelemetryRecord[]>;
    listFailureEnvelopes(filter?: QualityScoringFailureEnvelopeFilter): Promise<QualityScoringFailureEnvelopeRecord[]>;
    saveRequestTelemetry(record: QualityScoringRequestTelemetryRecordInput): Promise<QualityScoringRequestTelemetryRecord>;
    saveResponseTelemetry(record: QualityScoringResponseTelemetryRecordInput): Promise<QualityScoringResponseTelemetryRecord>;
    saveFailureEnvelope(record: QualityScoringFailureEnvelopeRecordInput): Promise<QualityScoringFailureEnvelopeRecord>;
}
export {};
