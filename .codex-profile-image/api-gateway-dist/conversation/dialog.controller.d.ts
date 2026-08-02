import { StreamableFile } from "@nestjs/common";
import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { ConversationService } from "./conversation.service.js";
import { OperatorAiSuggestionService } from "./operator-ai-suggestion.service.js";
export declare class DialogController {
    private readonly conversationService;
    private readonly operatorAiSuggestionService;
    private readonly conversationRepository;
    private readonly integrationRepository;
    constructor(conversationService: ConversationService, operatorAiSuggestionService: OperatorAiSuggestionService);
    fetchDialogs(filters: {
        channel?: string;
        page?: string;
        pageSize?: string;
        query?: string;
        queueId?: string;
        savedPresetId?: string;
        status?: string;
        teamId?: string;
        topic?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<{
        items: import("./conversation.types.js").ConversationRecord[];
        pagination: {
            mode: string;
            page: number;
            pageSize: number;
            total: number;
        };
        savedPresetId: string | null;
    }>>;
    uploadAttachment(payload: {
        channel: string;
        fileName: string;
        mimeType?: string;
        sizeBytes?: number;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    finalizeAttachmentUpload(fileId: string, payload: {
        checksum?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchAttachmentUploadStatus(fileId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createOutboundConversationRequest(payload: {
        channel: string;
        clientName?: string;
        message: string;
        phone: string;
        topic: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchAssignees(request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchConversationTimeline(conversationId: string, filters: {
        cursor?: string;
        limit?: string;
        types?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchDialogDetail(conversationId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    downloadInboundTelegramAttachment(conversationId: string, messageId: string, attachmentId: string, request: TenantOperatorRequest & ServiceAdminRequest, response: {
        setHeader(name: string, value: string): void;
    }): Promise<StreamableFile>;
    assignConversation(conversationId: string, payload: {
        operatorId?: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateConversationTags(conversationId: string, payload: {
        tags?: string[];
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateConversationClientPhone(conversationId: string, payload: {
        phone?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    transitionConversationStatus(conversationId: string, payload: {
        nextStatus?: string;
        reason?: string;
        resolutionOutcome?: string;
        roleMode?: string;
        topic?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    fetchAiReplySuggestions(conversationId: string, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    appendMessage(conversationId: string, payload: {
        attachments?: Array<Record<string, unknown>>;
        mode?: "internal" | "reply";
        text?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
