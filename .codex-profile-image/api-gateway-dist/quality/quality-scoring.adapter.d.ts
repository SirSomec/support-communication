import { QUALITY_SCORING_PROVIDER_PORT_VERSION, type QualityScoringExplainability, type QualityScoringProviderCheck, type QualityScoringProviderError, type QualityScoringProviderRequest, type QualityScoringProviderResult, type QualityScoringProviderTelemetry, type QualityScoringRepairAction } from "./quality-scoring.provider.js";
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
export declare function createQualityScoringProviderRequest(payload: QualityDraftScoringPayload, context: QualityScoringProviderRequestContext): QualityScoringProviderRequest;
export declare function createQualityScoringResponseData(result: QualityScoringProviderResult, context: QualityScoringResponseContext): QualityScoringResponseData;
export declare function createQualityScoringRequestTelemetry(request: QualityScoringProviderRequest): QualityScoringRequestTelemetry;
export declare function createQualityScoringResponseTelemetry(result: QualityScoringProviderResult, context: QualityScoringResponseContext): QualityScoringResponseTelemetry;
export declare function bucketQualityScoringAttachmentStatus(status: string): string;
export declare function bucketQualityScoringTelemetryChannel(channel: string): string;
export declare function bucketQualityScoringTelemetryIdentifier(value: string): string;
export declare function bucketQualityScoringTelemetryFingerprint(value: string): string;
