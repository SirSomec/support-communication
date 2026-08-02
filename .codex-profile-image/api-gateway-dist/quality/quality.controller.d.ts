import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { QualityService } from "./quality.service.js";
export declare class QualityController {
    private readonly qualityService;
    constructor(qualityService: QualityService);
    fetchQualityWorkspace(request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    scoreDraftResponse(payload: {
        aiConsent?: boolean;
        attachments?: Array<{
            id?: string;
            status?: string;
        }>;
        channel?: string;
        conversationId?: string;
        idempotencyKey?: string;
        locale?: string;
        mode?: string;
        operatorId?: string;
        suggestions?: Array<Record<string, unknown>>;
        text?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    scoreDraftResponseAlias(payload: {
        aiConsent?: boolean;
        attachments?: Array<{
            id?: string;
            status?: string;
        }>;
        channel?: string;
        conversationId?: string;
        idempotencyKey?: string;
        locale?: string;
        mode?: string;
        operatorId?: string;
        suggestions?: Array<Record<string, unknown>>;
        text?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    recordClientQualityRating(payload: {
        channel?: string;
        clientId?: string;
        conversationId?: string;
        idempotencyKey?: string;
        operator?: string;
        scale?: "CSAT" | "CSI" | "QA";
        score?: number;
        topic?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    recordManualQaReview(payload: {
        conversationId?: string;
        criteria?: Record<string, number>;
        idempotencyKey?: string;
        overrideReason?: string;
        reviewer?: string;
        score?: number;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    recordAiSuggestionDecision(payload: {
        action?: "accept" | "edit" | "reject";
        conversationId?: string;
        finalText?: string;
        originalText?: string;
        providerId?: string;
        providerResultId?: string;
        scoringAuditId?: string;
        suggestionId?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
