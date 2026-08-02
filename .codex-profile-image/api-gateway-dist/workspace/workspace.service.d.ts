import { type BackendEnvelope } from "@support-communication/envelope";
import { WorkspaceRepository } from "./workspace.repository.js";
export interface ObjectStorageSignUploadInput {
    contentType: string;
    fileId: string;
    fileName: string;
    objectKey: string;
    sizeBytes: number;
    tenantId: string;
}
export interface ObjectStorageSignDownloadInput {
    fileId: string;
    fileName: string;
    objectKey: string;
    tenantId: string;
}
export interface ObjectStorageMetadataInput {
    fileId: string;
    fileName: string;
    objectKey: string;
    tenantId: string;
}
export interface ObjectStorageObjectMetadata {
    checksum?: string;
    sizeBytes?: number;
}
export interface SignedObjectStorageUrl {
    expiresAt: string;
    headers?: Record<string, string>;
    method: "GET" | "PUT";
    url: string;
}
export interface ObjectStorageSigner {
    getObjectMetadata?(input: ObjectStorageMetadataInput): ObjectStorageObjectMetadata | undefined | Promise<ObjectStorageObjectMetadata | undefined>;
    signDownload(input: ObjectStorageSignDownloadInput): SignedObjectStorageUrl | Promise<SignedObjectStorageUrl>;
    signUpload(input: ObjectStorageSignUploadInput): SignedObjectStorageUrl | Promise<SignedObjectStorageUrl>;
}
export interface FileUploadQuotaCheckInput {
    channel: string;
    requestedBytes: number;
    resource: "storage";
    tenantId: string;
}
export interface FileUploadQuotaDecision {
    allowed: boolean;
    limitBytes?: number;
    remainingBytes?: number;
    usedBytes?: number;
}
export interface FileUploadQuotaChecker {
    checkFileUpload(input: FileUploadQuotaCheckInput): FileUploadQuotaDecision | Promise<FileUploadQuotaDecision>;
}
export interface WorkspaceServiceOptions {
    fileUploadQuota?: FileUploadQuotaChecker;
    objectStorage?: ObjectStorageSigner;
}
export interface WorkspaceRequestContext {
    operatorId?: string;
    permissions?: string[];
    tenantId?: string;
}
export type FileScanVerdict = "clean" | "error" | "infected";
export interface KnowledgeWorkflowPayload {
    actor?: string;
    articleId: string;
    draftId?: string;
    reason?: string;
}
export interface KnowledgeAttachmentPayload {
    actor?: string;
    articleId: string;
    attachment: Record<string, unknown>;
    reason?: string;
}
export interface KnowledgeAttachmentDeletePayload {
    actor?: string;
    articleId: string;
    attachmentId: string;
    reason?: string;
}
export declare class WorkspaceService {
    private readonly workspaceRepository;
    private readonly fileUploadQuota?;
    private readonly objectStorage;
    constructor(workspaceRepository?: WorkspaceRepository, options?: WorkspaceServiceOptions);
    fetchClientProfiles(filters?: {
        maskSensitive?: boolean | string;
        page?: number | string;
        pageSize?: number | string;
        segmentId?: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchClientSegments(context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    createClientExport(payload?: {
        format?: string;
        reason?: string;
        segmentId?: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    mergeClientProfiles(payload: {
        candidateProfileId: string;
        primaryProfileId: string;
        reason?: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    unmergeClientProfile(payload: {
        detachedProfileId: string;
        primaryProfileId: string;
        reason?: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    createUploadDescriptor(payload: {
        channel: string;
        fileName: string;
        mimeType?: string;
        sizeBytes?: number;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    finalizeUpload(payload: {
        checksum?: string;
        fileId: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    recordScanResult(payload: {
        checkedAt?: string;
        fileId: string;
        idempotencyKey?: string;
        reason?: string;
        scanner?: string;
        verdict: FileScanVerdict;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    getDownloadPolicy(fileId: string, context?: {
        canDownload?: boolean;
        tenantId?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchTemplates(filters?: {
        operatorId?: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    saveTemplate(template: {
        channel: string;
        id?: string;
        scope?: string;
        text: string;
        title: string;
        topic: string;
        version?: number;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchKnowledgeArticles(filters?: {
        visibility?: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchKnowledgeArticle(articleId: string, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    createKnowledgeArticle(payload: {
        body?: string;
        category?: string;
        channels?: string[];
        title?: string;
        topics?: string[];
        visibility?: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    saveKnowledgeArticleDraft(payload: {
        articleId: string;
        body: string;
        category?: string;
        channels?: string[];
        reason?: string;
        title?: string;
        topics?: string[];
        visibility?: string;
    }, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    submitKnowledgeArticleForReview(payload: KnowledgeWorkflowPayload, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    approveKnowledgeArticle(payload: KnowledgeWorkflowPayload, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    publishKnowledgeArticle(payload: KnowledgeWorkflowPayload, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    rejectKnowledgeArticle(payload: KnowledgeWorkflowPayload, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    archiveKnowledgeArticle(payload: KnowledgeWorkflowPayload, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    addKnowledgeArticleAttachment(payload: KnowledgeAttachmentPayload, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteKnowledgeArticleAttachment(payload: KnowledgeAttachmentDeletePayload, context?: WorkspaceRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private findArticle;
    private transitionKnowledgeArticle;
    private prepareKnowledgeWorkflow;
    private persistKnowledgeTransition;
    private detectConflict;
    private listClientProfiles;
    private listKnowledgeArticles;
    private listTemplates;
}
export declare function normalizeTemplateScope(value: unknown): "personal" | "team" | "global" | undefined;
export declare function hasSharedTemplateAccess(permissions?: string[]): boolean;
