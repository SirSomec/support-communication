import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { WorkspaceService } from "./workspace.service.js";
export declare class KnowledgeController {
    private readonly workspaceService;
    constructor(workspaceService: WorkspaceService);
    createKnowledgeArticle(payload: {
        body?: string;
        category?: string;
        channels?: string[];
        title?: string;
        topics?: string[];
        visibility?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    fetchKnowledgeArticles(filters: {
        visibility?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    fetchKnowledgeArticle(articleId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    saveKnowledgeArticleDraft(articleId: string, payload: {
        body: string;
        category?: string;
        channels?: string[];
        reason?: string;
        title?: string;
        topics?: string[];
        visibility?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    submitKnowledgeArticleForReview(articleId: string, payload: {
        actor?: string;
        draftId?: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    approveKnowledgeArticle(articleId: string, payload: {
        actor?: string;
        draftId?: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    publishKnowledgeArticle(articleId: string, payload: {
        actor?: string;
        draftId?: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    rejectKnowledgeArticle(articleId: string, payload: {
        actor?: string;
        draftId?: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    archiveKnowledgeArticle(articleId: string, payload: {
        actor?: string;
        draftId?: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    addKnowledgeArticleAttachment(articleId: string, payload: {
        actor?: string;
        attachment?: Record<string, unknown>;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    deleteKnowledgeArticleAttachment(articleId: string, attachmentId: string, payload: {
        actor?: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
}
