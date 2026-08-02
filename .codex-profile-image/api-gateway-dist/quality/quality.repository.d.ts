import type { ConversationLifecycleEvent } from "../conversation/conversation.repository.js";
export type QualityRatingScale = "CSAT" | "CSI" | "QA";
export interface QualityRatingRecord {
    auditId: string;
    channel: string;
    clientId: string | null;
    conversationId: string;
    createdAt: string;
    operator: string;
    ratingId: string;
    realtimeEventId: string;
    scale: QualityRatingScale;
    score: number | null;
    tenantId: string;
    topic: string | null;
}
export interface QualityRatingFilter {
    conversationId?: string;
    tenantId?: string;
}
export interface ManualQaReviewRecord {
    auditId: string;
    conversationId: string;
    createdAt: string;
    criteria: Record<string, number>;
    overrideReason: string | null;
    reviewId: string;
    reviewer: string;
    score: number | null;
    tenantId: string;
}
export interface ManualQaReviewFilter {
    conversationId?: string;
    tenantId?: string;
}
export type AiScoringAuditStatus = "failed" | "ok" | "pending";
export interface AiScoringAuditRecord {
    auditId: string;
    conversationId: string;
    createdAt: string;
    providerId: string;
    providerResultId: string | null;
    queue: string;
    requestFingerprint?: string | null;
    resultSnapshot?: Record<string, unknown> | null;
    score: number | null;
    status: AiScoringAuditStatus;
    tenantId: string;
    traceId: string;
    updatedAt?: string;
}
export interface AiScoringAuditClaimResult {
    claimed: boolean;
    record: AiScoringAuditRecord;
}
export interface AiScoringAuditFilter {
    conversationId?: string;
    tenantId?: string;
}
export type AiSuggestionDecisionAction = "accept" | "edit" | "reject";
export interface AiSuggestionDecisionRecord {
    action: AiSuggestionDecisionAction;
    conversationId: string;
    createdAt: string;
    decisionId: string;
    finalText: string | null;
    finalTextHash: string | null;
    operatorId: string;
    operatorName: string | null;
    originalText: string;
    originalTextHash: string;
    providerId: string | null;
    providerResultId: string | null;
    scoringAuditId: string | null;
    suggestionId: string;
    tenantId: string;
}
export interface AiSuggestionDecisionFilter {
    conversationId?: string;
    tenantId?: string;
}
export interface QualityWorkspaceSnapshot {
    aiCoachingQueue: Array<Record<string, unknown>>;
    aiEffectivenessMetrics: Array<Record<string, unknown>>;
    aiRealtimeChecks: Array<Record<string, unknown>>;
    aiSuggestions: Array<Record<string, unknown>>;
    knowledgeArticles: Array<Record<string, unknown>>;
    qualityMetrics: Array<Record<string, unknown>>;
    tenantId?: string | null;
}
export interface QualityState {
    aiSuggestionDecisions: AiSuggestionDecisionRecord[];
    aiScoringAudits: AiScoringAuditRecord[];
    lifecycleEvents?: ConversationLifecycleEvent[];
    manualQaReviews: ManualQaReviewRecord[];
    ratings: QualityRatingRecord[];
    workspace: QualityWorkspaceSnapshot;
}
type MaybePromise<T> = T | Promise<T>;
export interface QualityRepositoryPort {
    claimAiScoringAudit(record: AiScoringAuditRecord): MaybePromise<AiScoringAuditClaimResult>;
    completeAiScoringAudit(record: AiScoringAuditRecord, lifecycleEvent?: ConversationLifecycleEvent): MaybePromise<AiScoringAuditRecord>;
    listAiSuggestionDecisions(filter?: AiSuggestionDecisionFilter): MaybePromise<AiSuggestionDecisionRecord[]>;
    listAiScoringAudits(filter?: AiScoringAuditFilter): MaybePromise<AiScoringAuditRecord[]>;
    listManualQaReviews(filter?: ManualQaReviewFilter): MaybePromise<ManualQaReviewRecord[]>;
    listQualityRatings(filter?: QualityRatingFilter): MaybePromise<QualityRatingRecord[]>;
    readWorkspace(filter?: {
        tenantId?: string;
    }): MaybePromise<QualityWorkspaceSnapshot>;
    saveAiScoringAudit(record: AiScoringAuditRecord, lifecycleEvent?: ConversationLifecycleEvent): MaybePromise<AiScoringAuditRecord>;
    saveManualQaReview(record: ManualQaReviewRecord, lifecycleEvent?: ConversationLifecycleEvent): MaybePromise<ManualQaReviewRecord>;
    saveQualityRating(record: QualityRatingRecord, lifecycleEvent?: ConversationLifecycleEvent): MaybePromise<QualityRatingRecord>;
    saveAiSuggestionDecision(record: AiSuggestionDecisionRecord, lifecycleEvent: ConversationLifecycleEvent): MaybePromise<AiSuggestionDecisionRecord>;
}
export interface PrismaQualityRepositoryOptions {
    client: PrismaQualityClient;
    fallback?: QualityRepository;
}
export interface PrismaQualityClient {
    $transaction<TResult>(operation: (client: PrismaQualityTransactionalClient) => Promise<TResult>): Promise<TResult>;
    aiScoringAudit: {
        create(input: {
            data: PrismaAiScoringAuditCreateInput;
        }): Promise<PrismaAiScoringAuditRow>;
        findMany(input: PrismaAiScoringAuditFindManyInput): Promise<PrismaAiScoringAuditRow[]>;
        findUnique(input: PrismaAiScoringAuditFindUniqueInput): Promise<PrismaAiScoringAuditRow | null>;
        update(input: {
            data: PrismaAiScoringAuditCreateInput;
            where: PrismaAiScoringAuditFindUniqueInput["where"];
        }): Promise<PrismaAiScoringAuditRow>;
    };
    manualQaReview: {
        create(input: {
            data: PrismaManualQaReviewCreateInput;
        }): Promise<PrismaManualQaReviewRow>;
        findMany(input: PrismaManualQaReviewFindManyInput): Promise<PrismaManualQaReviewRow[]>;
        findUnique(input: PrismaManualQaReviewFindUniqueInput): Promise<PrismaManualQaReviewRow | null>;
    };
    qualityRating: {
        create(input: {
            data: PrismaQualityRatingCreateInput;
        }): Promise<PrismaQualityRatingRow>;
        findMany(input: PrismaQualityRatingFindManyInput): Promise<PrismaQualityRatingRow[]>;
        findUnique(input: PrismaQualityRatingFindUniqueInput): Promise<PrismaQualityRatingRow | null>;
    };
    aiSuggestionDecision: {
        create(input: {
            data: PrismaAiSuggestionDecisionCreateInput;
        }): Promise<PrismaAiSuggestionDecisionRow>;
        findMany(input: PrismaAiSuggestionDecisionFindManyInput): Promise<PrismaAiSuggestionDecisionRow[]>;
        findUnique(input: PrismaAiSuggestionDecisionFindUniqueInput): Promise<PrismaAiSuggestionDecisionRow | null>;
    };
    conversationLifecycleEvent: {
        create(input: {
            data: PrismaConversationLifecycleEventCreateInput;
        }): Promise<unknown>;
    };
}
type PrismaQualityTransactionalClient = Omit<PrismaQualityClient, "$transaction">;
interface PrismaAiSuggestionDecisionCreateInput extends Omit<AiSuggestionDecisionRecord, "createdAt"> {
    createdAt: Date;
}
interface PrismaAiSuggestionDecisionRow extends PrismaAiSuggestionDecisionCreateInput {
}
interface PrismaAiSuggestionDecisionFindManyInput {
    orderBy: {
        createdAt: "desc";
    };
    where: {
        conversationId?: string;
        tenantId: string;
    };
}
interface PrismaAiSuggestionDecisionFindUniqueInput {
    where: {
        tenantId_suggestionId: {
            suggestionId: string;
            tenantId: string;
        };
    };
}
interface PrismaConversationLifecycleEventCreateInput {
    actorId: string | null;
    actorName: string | null;
    actorType: string;
    conversationId: string;
    data: Record<string, unknown>;
    eventType: string;
    id: string;
    ingestedAt: Date;
    occurredAt: Date;
    reason: string | null;
    schemaVersion: string;
    source: string;
    sourceEventId: string;
    tenantId: string;
    traceId: string;
}
interface PrismaAiScoringAuditCreateInput {
    auditId: string;
    conversationId: string;
    createdAt: Date;
    providerId: string;
    providerResultId: string | null;
    queue: string;
    requestFingerprint: string | null;
    resultSnapshot: Record<string, unknown> | null;
    score: number | null;
    status: AiScoringAuditStatus;
    tenantId: string;
    traceId: string;
    updatedAt: Date;
}
interface PrismaAiScoringAuditFindManyInput {
    orderBy: {
        createdAt: "desc";
    };
    where: {
        conversationId?: string;
        tenantId: string;
    };
}
interface PrismaAiScoringAuditFindUniqueInput {
    where: {
        tenantId_auditId: {
            auditId: string;
            tenantId: string;
        };
    };
}
interface PrismaAiScoringAuditRow extends PrismaAiScoringAuditCreateInput {
}
interface PrismaManualQaReviewCreateInput {
    auditId: string;
    conversationId: string;
    createdAt: Date;
    criteria: Record<string, number>;
    overrideReason: string | null;
    reviewId: string;
    reviewer: string;
    score: number | null;
    tenantId: string;
}
interface PrismaManualQaReviewFindManyInput {
    orderBy: {
        createdAt: "desc";
    };
    where: {
        conversationId?: string;
        tenantId: string;
    };
}
interface PrismaManualQaReviewFindUniqueInput {
    where: {
        tenantId_reviewId: {
            reviewId: string;
            tenantId: string;
        };
    };
}
interface PrismaManualQaReviewRow extends PrismaManualQaReviewCreateInput {
}
interface PrismaQualityRatingCreateInput {
    auditId: string;
    channel: string;
    clientId: string | null;
    conversationId: string;
    createdAt: Date;
    operator: string;
    ratingId: string;
    realtimeEventId: string;
    scale: QualityRatingScale;
    score: number | null;
    tenantId: string;
    topic: string | null;
}
interface PrismaQualityRatingFindManyInput {
    orderBy: {
        createdAt: "desc";
    };
    where: {
        conversationId?: string;
        tenantId: string;
    };
}
interface PrismaQualityRatingFindUniqueInput {
    where: {
        tenantId_ratingId: {
            ratingId: string;
            tenantId: string;
        };
    };
}
interface PrismaQualityRatingRow extends PrismaQualityRatingCreateInput {
}
export declare class QualityRepository {
    private readonly store;
    private constructor();
    static default(): QualityRepositoryPort;
    static useDefault(repository: QualityRepositoryPort): void;
    static clearDefault(): void;
    static inMemory(seed?: Partial<QualityState>): QualityRepository;
    static prisma({ client, fallback }: PrismaQualityRepositoryOptions): PrismaQualityRepository;
    readState(): QualityState;
    readWorkspace(filter?: {
        tenantId?: string;
    }): QualityWorkspaceSnapshot;
    listQualityRatings(filter?: QualityRatingFilter): QualityRatingRecord[];
    listManualQaReviews(filter?: ManualQaReviewFilter): ManualQaReviewRecord[];
    listAiScoringAudits(filter?: AiScoringAuditFilter): AiScoringAuditRecord[];
    listAiSuggestionDecisions(filter?: AiSuggestionDecisionFilter): AiSuggestionDecisionRecord[];
    saveQualityRating(record: QualityRatingRecord, lifecycleEvent?: ConversationLifecycleEvent): QualityRatingRecord;
    saveManualQaReview(record: ManualQaReviewRecord, lifecycleEvent?: ConversationLifecycleEvent): ManualQaReviewRecord;
    claimAiScoringAudit(record: AiScoringAuditRecord): AiScoringAuditClaimResult;
    completeAiScoringAudit(record: AiScoringAuditRecord, lifecycleEvent?: ConversationLifecycleEvent): AiScoringAuditRecord;
    saveAiScoringAudit(record: AiScoringAuditRecord, lifecycleEvent?: ConversationLifecycleEvent): AiScoringAuditRecord;
    saveAiSuggestionDecision(record: AiSuggestionDecisionRecord, lifecycleEvent: ConversationLifecycleEvent): AiSuggestionDecisionRecord;
}
export declare class PrismaQualityRepository {
    private readonly client;
    private readonly fallback;
    constructor(client: PrismaQualityClient, fallback: QualityRepository);
    readState(): QualityState;
    readWorkspace(filter?: {
        tenantId?: string;
    }): QualityWorkspaceSnapshot;
    listQualityRatings(filter?: QualityRatingFilter): Promise<QualityRatingRecord[]>;
    listManualQaReviews(filter?: ManualQaReviewFilter): Promise<ManualQaReviewRecord[]>;
    listAiScoringAudits(filter?: AiScoringAuditFilter): Promise<AiScoringAuditRecord[]>;
    listAiSuggestionDecisions(filter?: AiSuggestionDecisionFilter): Promise<AiSuggestionDecisionRecord[]>;
    saveQualityRating(record: QualityRatingRecord, lifecycleEvent?: ConversationLifecycleEvent): Promise<QualityRatingRecord>;
    saveManualQaReview(record: ManualQaReviewRecord, lifecycleEvent?: ConversationLifecycleEvent): Promise<ManualQaReviewRecord>;
    claimAiScoringAudit(record: AiScoringAuditRecord): Promise<AiScoringAuditClaimResult>;
    completeAiScoringAudit(record: AiScoringAuditRecord, lifecycleEvent?: ConversationLifecycleEvent): Promise<AiScoringAuditRecord>;
    saveAiScoringAudit(record: AiScoringAuditRecord, lifecycleEvent?: ConversationLifecycleEvent): Promise<AiScoringAuditRecord>;
    saveAiSuggestionDecision(record: AiSuggestionDecisionRecord, lifecycleEvent: ConversationLifecycleEvent): Promise<AiSuggestionDecisionRecord>;
}
export {};
