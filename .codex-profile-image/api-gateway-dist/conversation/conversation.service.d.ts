import { type BackendEnvelope } from "@support-communication/envelope";
import type { ConversationRecord } from "./conversation.types.js";
import { ConversationRepository, type ConversationLifecycleEvent, type RealtimeEvent } from "./conversation.repository.js";
import { type RealtimeFanoutAdapter } from "./realtime.fanout.js";
import type { ObjectStorageSigner } from "../workspace/workspace.service.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { IdentityRepository } from "../identity/identity.repository.js";
import { TeamDirectoryRepository } from "../identity/team-directory.repository.js";
import { AutomationRepository } from "../automation/automation.repository.js";
import { QualityRepository } from "../quality/quality.repository.js";
interface DialogFilters {
    channel?: string;
    page?: number | string;
    pageSize?: number | string;
    query?: string;
    queueId?: string;
    savedPresetId?: string;
    status?: string;
    teamId?: string;
    topic?: string;
}
interface StatusPayload {
    conversationId: string;
    nextStatus?: string;
    resolutionOutcome?: string;
    roleMode?: string;
    reason?: string;
    topic?: string;
}
interface AssignmentPayload {
    conversationId: string;
    operatorId?: string;
    reason?: string;
}
interface TagsPayload {
    conversationId: string;
    tags?: unknown;
}
interface ClientPhonePayload {
    conversationId: string;
    phone?: unknown;
}
interface AppendMessagePayload {
    attachments?: Array<Record<string, unknown>>;
    conversationId: string;
    idempotencyKey?: string;
    mode?: "internal" | "reply";
    text?: string;
}
interface UploadPayload {
    channel: string;
    fileName: string;
    idempotencyKey?: string;
    mimeType?: string;
    sizeBytes?: number;
}
interface OutboundPayload {
    channel: string;
    clientName?: string;
    idempotencyKey?: string;
    message: string;
    phone: string;
    topic: string;
}
interface InboundPayload {
    attachments?: Array<Record<string, unknown>>;
    conversationId?: string;
    csatFeedback?: boolean;
    eventId?: string;
    text?: string;
}
interface DeliveryReceiptPayload {
    conversationId?: string;
    idempotencyKey?: string;
    messageId?: string;
    payload?: Record<string, unknown>;
    provider?: string;
    providerEventId?: string;
    receivedAt?: string;
    status?: string;
    tenantId?: string;
    traceId?: string;
}
export interface OutboundMessageDispatchRequest {
    channel: string;
    channelConnectionId?: string;
    chatId: string;
    conversationId: string;
    descriptorId: string;
    idempotencyKey: string;
    messageId: string;
    outboxEventId?: string | null;
    tenantId: string;
    text: string;
    traceId: string;
}
export interface OutboundMessageDispatchResult {
    providerMessageId?: string;
    providerStatus?: number;
    reason?: string;
    status: "delivered" | "failed" | "skipped";
}
export interface OutboundMessageDispatcher {
    deliverMessage(request: OutboundMessageDispatchRequest): Promise<OutboundMessageDispatchResult | void> | OutboundMessageDispatchResult | void;
}
interface ConversationServiceOptions {
    attachmentStorage?: ConversationAttachmentStorage;
    automationRepository?: Pick<AutomationRepository, "listBotRuntimeInstancesAsync">;
    identityRepository?: Pick<IdentityRepository, "findTenantUsers">;
    qualityRepository?: Pick<QualityRepository, "listQualityRatings">;
    teamDirectoryRepository?: Pick<TeamDirectoryRepository, "findActiveTeamId">;
    outboundMessageDispatcher?: OutboundMessageDispatcher;
    realtimeFanout?: RealtimeFanoutAdapter;
}
interface ConversationAttachmentStorage {
    objectStorage: ObjectStorageSigner;
    workspaceRepository: Pick<WorkspaceRepository, "findFile" | "saveFile">;
}
interface TenantScope {
    actorId?: string;
    actorName?: string;
    actorType?: ConversationLifecycleEvent["actorType"];
    canViewSensitive?: boolean;
    tenantId?: string;
}
export declare class ConversationService {
    private readonly conversationRepository;
    private readonly attachmentStorage;
    private readonly automationRepository?;
    private readonly qualityRepository?;
    private readonly identityRepository;
    private readonly teamDirectoryRepository;
    private lastRealtimeOccurredAtMs;
    private readonly liveRealtimeEvents;
    private readonly outboundMessageDispatcher;
    private readonly realtimeFanout;
    constructor(conversationRepository?: ConversationRepository, options?: ConversationServiceOptions);
    static useDefaultRealtimeFanout(adapter: RealtimeFanoutAdapter): void;
    static useDefaultOutboundMessageDispatcher(dispatcher: OutboundMessageDispatcher): void;
    private decorateInboxConversations;
    fetchDialogs(filters?: DialogFilters, scope?: TenantScope): Promise<BackendEnvelope<{
        items: ConversationRecord[];
        pagination: {
            mode: string;
            page: number;
            pageSize: number;
            total: number;
        };
        savedPresetId: string | null;
    }>>;
    fetchDialogDetail(conversationId: string, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchConversationTimeline(conversationId: string, filters: {
        cursor?: string;
        limit?: number | string;
        types?: string;
    }, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchAssignees(scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    assignConversation(payload: AssignmentPayload, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    transitionConversationStatus(payload: StatusPayload, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateConversationTags(payload: TagsPayload, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateConversationClientPhone(payload: ClientPhonePayload, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    resolvePublicDeliveryAttachments(attachments: Array<Record<string, unknown>>, tenantId: string): Promise<Array<Record<string, unknown>>>;
    appendMessage(payload: AppendMessagePayload, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    uploadAttachment(payload: UploadPayload, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    finalizeAttachmentUpload(payload: {
        checksum?: string;
        fileId: string;
    }, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    private resolveMessageAuthorName;
    fetchAttachmentUploadStatus(fileId: string, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    createOutboundConversationRequest(payload: OutboundPayload, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchChannels(): Promise<BackendEnvelope<{
        items: Array<Record<string, unknown>>;
    }>>;
    normalizeInboundEvent(channel: string, payload: InboundPayload): Promise<BackendEnvelope<Record<string, unknown>>>;
    recordDeliveryReceipt(channel: string, payload: DeliveryReceiptPayload, scope?: TenantScope): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchRealtimeEvents(filters?: {
        limit?: number | string;
        since?: string;
    }, scope?: TenantScope): Promise<BackendEnvelope<{
        events: RealtimeEvent[];
        filters: {
            limit?: number | string;
            since?: string;
        };
    }>>;
    private recordRealtimeEvent;
    private dispatchOutboundMessageReply;
    private findAttachmentUploadFile;
    private appendAndPublishRealtimeEvent;
    private publishRealtimeEvent;
    private createRealtimeEvent;
    private createLifecycleEvent;
}
export {};
