import { type BackendEnvelope } from "@support-communication/envelope";
import { ConversationRepository, type ConversationLifecycleEvent } from "../conversation/conversation.repository.js";
import { IdentityRepository } from "../identity/identity.repository.js";
import { type QualityAiProviderConfiguration } from "./quality-scoring.openai-provider.js";
import { type QualityRepositoryPort } from "./quality.repository.js";
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
export declare class QualityService {
    private readonly qualityRepository;
    private readonly rulesProvider;
    private readonly aiProvider;
    private readonly directorySources;
    constructor(qualityRepository?: QualityRepositoryPort, aiProvider?: QualityAiProviderConfiguration, directorySources?: QualityDirectorySources);
    fetchQualityWorkspace(context?: QualityRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private loadQualityDirectory;
    scoreDraftResponse(payload: ScoreDraftPayload | null | undefined, context?: QualityRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    recordClientQualityRating(payload: ClientRatingPayload | null | undefined, context?: QualityRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    recordManualQaReview(payload: ManualQaPayload | null | undefined, context?: QualityRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    recordAiSuggestionDecision(payload: AiSuggestionDecisionPayload | null | undefined, context?: QualityRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
}
export {};
