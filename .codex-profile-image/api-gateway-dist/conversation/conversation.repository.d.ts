import { type ChannelDeliveryReceipt, type ChannelDeliveryReceiptListQuery, createPrismaChannelDeliveryReceiptStore } from "@support-communication/database";
import { type OutboxEvent } from "@support-communication/events";
import { type ConversationRecord } from "./conversation.types.js";
export interface RealtimeEvent {
    eventId: string;
    eventName: string;
    occurredAt: string;
    resourceId: string;
    resourceType: string;
    schemaVersion: string;
    tenantId: string;
    traceId: string;
    data: Record<string, unknown>;
}
export type ConversationLifecycleEventType = "assignment.changed" | "conversation.created" | "internal_comment.created" | "message.received" | "message.sent" | "status.changed" | "tags.changed" | "topic.changed";
export interface ConversationLifecycleEvent {
    actorId: string | null;
    actorName: string | null;
    actorType: "client" | "operator" | "service_admin" | "system" | "worker";
    conversationId: string;
    data: Record<string, unknown>;
    eventType: ConversationLifecycleEventType | string;
    id: string;
    ingestedAt: string;
    occurredAt: string;
    reason: string | null;
    schemaVersion: "conversation-lifecycle/v1";
    source: string;
    sourceEventId: string;
    tenantId: string;
    traceId: string;
}
export interface ConversationLifecycleEventFilter {
    conversationId?: string;
    cursor?: string;
    eventTypes?: string[];
    limit?: number;
    tenantId: string;
}
export interface ConversationInboundEvent {
    channel: string;
    conversationId: string;
    eventId: string;
    messageId: string;
    receivedAt: string;
    traceId: string;
}
export type ConversationDeliveryReceipt = ChannelDeliveryReceipt;
export type ConversationDeliveryReceiptFilter = ChannelDeliveryReceiptListQuery;
export type ConversationOutboundDescriptorKind = "attachment_upload" | "message_delivery" | "outbound_conversation";
export interface ConversationOutboundDescriptor {
    auditId: string | null;
    channel: string;
    conversationId: string | null;
    createdAt: string;
    deliveryState: string | null;
    id: string;
    idempotencyKey: string | null;
    kind: ConversationOutboundDescriptorKind;
    messageId: string | null;
    outboxEventId: string | null;
    payload: Record<string, unknown>;
    requestFingerprint: string | null;
    retryable: boolean;
    status: string;
    tenantId: string;
    traceId: string;
}
export interface ConversationOutboundDescriptorFilter {
    channel?: string;
    conversationId?: string;
    idempotencyKey?: string;
    kind?: ConversationOutboundDescriptorKind;
    status?: string;
    tenantId?: string;
}
export interface ConversationRealtimeEventFilter {
    allTenants?: boolean;
    since?: string;
    take?: number;
    tenantId?: string;
}
export interface ConversationRealtimeRetentionFilter {
    before: string;
    tenantId?: string;
}
export interface ConversationListFilter {
    cursor?: string;
    messageTake?: number;
    take?: number;
    tenantId: string;
}
export interface ConversationOutboundDescriptorRecordInput {
    descriptor: ConversationOutboundDescriptor;
    outbox?: OutboxEvent;
}
export interface ConversationOutboundDescriptorRecord {
    descriptor: ConversationOutboundDescriptor;
    outbox?: OutboxEvent;
}
export interface ConversationOutboundMessageReplyInput extends ConversationOutboundDescriptorRecordInput {
    conversation: ConversationRecord;
    lifecycleEvent: ConversationLifecycleEvent;
    realtimeEvent: RealtimeEvent;
}
export interface ConversationOutboundMessageReplyRecord extends ConversationOutboundDescriptorRecord {
    conversation: ConversationRecord;
    lifecycleEvent: ConversationLifecycleEvent;
    realtimeEvent: RealtimeEvent;
}
export interface ConversationOutboundConversationInput extends ConversationOutboundDescriptorRecordInput, ConversationMutationRecordInput {
}
export interface ConversationOutboundConversationRecord extends ConversationOutboundDescriptorRecord, ConversationMutationRecord {
}
export interface ConversationMutationRecordInput {
    conversation: ConversationRecord;
    lifecycleEvent: ConversationLifecycleEvent;
    realtimeEvent: RealtimeEvent;
}
export interface ConversationMutationRecord extends ConversationMutationRecordInput {
}
export interface ConversationInboundMessageRecordInput extends ConversationMutationRecordInput {
    inboundEvent: ConversationInboundEvent;
}
export interface ConversationInboundMessageRecord extends ConversationMutationRecord {
    inboundEvent: ConversationInboundEvent;
}
export interface ConversationAssignmentAnalyticsRow {
    channel: string;
    conversationId: string;
    eventKind: "assignment" | "transfer";
    fromOperatorId: string | null;
    id: string;
    occurredAt: string;
    source: "dialog-interface";
    tenantId: string;
    toOperatorId: string;
}
export interface ConversationAssignmentRecordInput {
    analyticsRow: ConversationAssignmentAnalyticsRow;
    conversation: ConversationRecord;
    lifecycleEvent: ConversationLifecycleEvent;
    realtimeEvent: RealtimeEvent;
}
export interface ConversationAssignmentRecord extends ConversationAssignmentRecordInput {
}
export declare class ConversationAssignmentConflictError extends Error {
    readonly code = "conversation_assignment_conflict";
    constructor(conversationId: string);
}
export interface ConversationState {
    channelCatalog: Array<Record<string, unknown>>;
    conversations: ConversationRecord[];
    deliveryReceipts: ConversationDeliveryReceipt[];
    inboundEvents: ConversationInboundEvent[];
    lifecycleEvents?: ConversationLifecycleEvent[];
    outboundDescriptors: ConversationOutboundDescriptor[];
    outboxEvents: OutboxEvent[];
    realtimeEvents: RealtimeEvent[];
    routingAnalyticsRows?: ConversationAssignmentAnalyticsRow[];
}
export interface ConversationRepositoryPort {
    assignConversation(input: ConversationAssignmentRecordInput): MaybePromise<ConversationAssignmentRecord>;
    appendRealtimeEvent(event: RealtimeEvent): MaybePromise<RealtimeEvent>;
    enqueueOutboxEvent(event: OutboxEvent): MaybePromise<OutboxEvent>;
    findConversation(conversationId: string): MaybePromise<ConversationRecord | undefined>;
    findInboundEvent(channel: string, eventId: string): MaybePromise<ConversationInboundEvent | undefined>;
    findOutboundDescriptorByIdempotencyKey(idempotencyKey: string): MaybePromise<ConversationOutboundDescriptor | undefined>;
    listDeliveryReceipts(filter?: ConversationDeliveryReceiptFilter): MaybePromise<ConversationDeliveryReceipt[]>;
    listConversations(filter: ConversationListFilter): MaybePromise<ConversationRecord[]>;
    listLifecycleEvents(filter: ConversationLifecycleEventFilter): MaybePromise<ConversationLifecycleEvent[]>;
    listChannelCatalog(): MaybePromise<Array<Record<string, unknown>>>;
    listOutboundDescriptors(filter?: ConversationOutboundDescriptorFilter): MaybePromise<ConversationOutboundDescriptor[]>;
    listOutboxEvents(): MaybePromise<OutboxEvent[]>;
    listRealtimeEvents(filter: ConversationRealtimeEventFilter): MaybePromise<RealtimeEvent[]>;
    pruneRealtimeEvents(filter: ConversationRealtimeRetentionFilter): MaybePromise<number>;
    queueOutboundConversation(input: ConversationOutboundConversationInput): MaybePromise<ConversationOutboundConversationRecord>;
    queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): MaybePromise<ConversationOutboundMessageReplyRecord>;
    recordDeliveryReceipt(receipt: ConversationDeliveryReceipt): MaybePromise<ConversationDeliveryReceipt>;
    recordOutboundDescriptor(input: ConversationOutboundDescriptorRecordInput): MaybePromise<ConversationOutboundDescriptorRecord>;
    recordInboundEvent(event: ConversationInboundEvent): MaybePromise<ConversationInboundEvent>;
    recordInboundMessage(input: ConversationInboundMessageRecordInput): MaybePromise<ConversationInboundMessageRecord>;
    saveConversation(conversation: ConversationRecord): MaybePromise<ConversationRecord>;
    saveConversationMutation(input: ConversationMutationRecordInput): MaybePromise<ConversationMutationRecord>;
}
type MaybePromise<T> = T | Promise<T>;
export declare class ConversationRepository implements ConversationRepositoryPort {
    private readonly adapter;
    private constructor();
    static default(): ConversationRepository;
    static useDefault(repository: ConversationRepository): void;
    static inMemory(seed?: ConversationState): ConversationRepository;
    static prisma({ client }: PrismaConversationRepositoryOptions): ConversationRepository;
    listConversations(filter: ConversationListFilter): MaybePromise<ConversationRecord[]>;
    listChannelCatalog(): MaybePromise<Array<Record<string, unknown>>>;
    listOutboundDescriptors(filter?: ConversationOutboundDescriptorFilter): MaybePromise<ConversationOutboundDescriptor[]>;
    listOutboxEvents(): MaybePromise<OutboxEvent[]>;
    findConversation(conversationId: string): MaybePromise<ConversationRecord | undefined>;
    saveConversation(conversation: ConversationRecord): MaybePromise<ConversationRecord>;
    saveConversationMutation(input: ConversationMutationRecordInput): MaybePromise<ConversationMutationRecord>;
    assignConversation(input: ConversationAssignmentRecordInput): MaybePromise<ConversationAssignmentRecord>;
    findInboundEvent(channel: string, eventId: string): MaybePromise<ConversationInboundEvent | undefined>;
    findOutboundDescriptorByIdempotencyKey(idempotencyKey: string): MaybePromise<ConversationOutboundDescriptor | undefined>;
    listDeliveryReceipts(filter?: ConversationDeliveryReceiptFilter): MaybePromise<ConversationDeliveryReceipt[]>;
    recordDeliveryReceipt(receipt: ConversationDeliveryReceipt): MaybePromise<ConversationDeliveryReceipt>;
    recordInboundEvent(event: ConversationInboundEvent): MaybePromise<ConversationInboundEvent>;
    recordInboundMessage(input: ConversationInboundMessageRecordInput): MaybePromise<ConversationInboundMessageRecord>;
    appendRealtimeEvent(event: RealtimeEvent): MaybePromise<RealtimeEvent>;
    enqueueOutboxEvent(event: OutboxEvent): MaybePromise<OutboxEvent>;
    queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): MaybePromise<ConversationOutboundMessageReplyRecord>;
    recordOutboundDescriptor(input: ConversationOutboundDescriptorRecordInput): MaybePromise<ConversationOutboundDescriptorRecord>;
    listRealtimeEvents(filter: ConversationRealtimeEventFilter): MaybePromise<RealtimeEvent[]>;
    pruneRealtimeEvents(filter: ConversationRealtimeRetentionFilter): MaybePromise<number>;
    queueOutboundConversation(input: ConversationOutboundConversationInput): MaybePromise<ConversationOutboundConversationRecord>;
    listLifecycleEvents(filter: ConversationLifecycleEventFilter): MaybePromise<ConversationLifecycleEvent[]>;
}
export interface PrismaConversationRepositoryOptions {
    client: PrismaConversationClient;
}
export interface PrismaConversationClient extends PrismaConversationDelegates {
    $transaction<TResult>(operation: (client: PrismaConversationTransactionalClient) => Promise<TResult>): Promise<TResult>;
}
type PrismaConversationTransactionalClient = PrismaConversationDelegates;
interface PrismaConversationDelegates {
    channelDeliveryReceipt: Parameters<typeof createPrismaChannelDeliveryReceiptStore>[0]["channelDeliveryReceipt"];
    conversation: {
        findMany(input: PrismaConversationFindManyInput): Promise<PrismaConversationRow[]>;
        findUnique(input: PrismaConversationFindUniqueInput): Promise<PrismaConversationRow | null>;
        updateMany(input: PrismaConversationUpdateManyInput): Promise<{
            count: number;
        }>;
        upsert(input: PrismaConversationUpsertInput): Promise<PrismaConversationRow>;
    };
    conversationInboundEvent: {
        create(input: {
            data: PrismaConversationInboundEventCreateInput;
        }): Promise<PrismaConversationInboundEventRow>;
        findUnique(input: PrismaConversationInboundEventFindUniqueInput): Promise<PrismaConversationInboundEventRow | null>;
    };
    conversationLifecycleEvent: {
        create(input: {
            data: PrismaConversationLifecycleEventCreateInput;
        }): Promise<PrismaConversationLifecycleEventRow>;
        findMany(input: PrismaConversationLifecycleEventFindManyInput): Promise<PrismaConversationLifecycleEventRow[]>;
        findUnique(input: PrismaConversationLifecycleEventFindUniqueInput): Promise<PrismaConversationLifecycleEventRow | null>;
    };
    conversationMessage: {
        createMany(input: {
            data: PrismaConversationMessageCreateInput[];
            skipDuplicates: true;
        }): Promise<{
            count: number;
        }>;
    };
    conversationOutboundDescriptor: {
        create(input: {
            data: PrismaConversationOutboundDescriptorCreateInput;
        }): Promise<PrismaConversationOutboundDescriptorRow>;
        findMany(input: PrismaConversationOutboundDescriptorFindManyInput): Promise<PrismaConversationOutboundDescriptorRow[]>;
        findUnique(input: PrismaConversationOutboundDescriptorFindUniqueInput): Promise<PrismaConversationOutboundDescriptorRow | null>;
    };
    conversationRealtimeEvent: {
        create(input: {
            data: PrismaConversationRealtimeEventCreateInput;
        }): Promise<PrismaConversationRealtimeEventRow>;
        deleteMany?(input: {
            where: {
                occurredAt: {
                    lt: Date;
                };
                tenantId?: string;
            };
        }): Promise<{
            count: number;
        }>;
        findMany(input: {
            cursor?: {
                eventId: string;
            };
            orderBy: Array<{
                occurredAt: "asc" | "desc";
            } | {
                eventId: "asc" | "desc";
            }>;
            skip?: number;
            take: number;
            where?: {
                occurredAt?: {
                    gt: Date;
                };
                tenantId?: string;
            };
        }): Promise<PrismaConversationRealtimeEventRow[]>;
    };
    outboxEvent: {
        create(input: {
            data: PrismaOutboxEventCreateInput;
        }): Promise<PrismaOutboxEventRow>;
        findMany?(input: {
            orderBy: {
                occurredAt: "asc";
            };
        }): Promise<PrismaOutboxEventRow[]>;
    };
    routingAnalyticsRow: {
        create(input: {
            data: PrismaRoutingAnalyticsRowCreateInput;
        }): Promise<PrismaRoutingAnalyticsRow>;
    };
}
interface PrismaConversationFindManyInput {
    cursor?: {
        id: string;
    };
    include: {
        messages: {
            orderBy: {
                createdAt: "desc";
            };
            take: number;
        };
    };
    orderBy: Array<{
        updatedAt: "desc";
    } | {
        id: "desc";
    }>;
    skip?: number;
    take: number;
    where: {
        tenantId: string;
    };
}
interface PrismaConversationFindUniqueInput {
    include: {
        messages: {
            orderBy: {
                createdAt: "asc";
            };
        };
    };
    where: {
        id: string;
    };
}
interface PrismaConversationInboundEventFindUniqueInput {
    where: {
        channel_eventId: {
            channel: string;
            eventId: string;
        };
    };
}
interface PrismaConversationOutboundDescriptorFindManyInput {
    orderBy: {
        createdAt: "desc";
    };
    where: Partial<Record<"channel" | "conversationId" | "idempotencyKey" | "kind" | "status" | "tenantId", string>>;
}
interface PrismaConversationOutboundDescriptorFindUniqueInput {
    where: {
        idempotencyKey: string;
    };
}
interface PrismaConversationUpsertInput {
    create: PrismaConversationUpsertData;
    update: PrismaConversationUpsertData;
    where: {
        id: string;
    };
}
interface PrismaConversationRow extends PrismaConversationUpsertData {
    createdAt: Date | string;
    messages?: PrismaConversationMessageRow[];
    updatedAt: Date | string;
}
interface PrismaConversationUpsertData {
    avatar: string | null;
    channel: string;
    channelConnectionId: string | null;
    clientSince: string;
    device: string;
    entry: string;
    id: string;
    initials: string;
    language: string;
    metadata: unknown;
    name: string;
    operatorId: string | null;
    operatorName: string | null;
    phone: string;
    preview: string;
    previous: unknown;
    providerConversationId: string | null;
    providerUserId: string | null;
    queueId: string | null;
    rescueState: unknown;
    resolutionOutcome: string | null;
    sla: string;
    slaTone: string;
    status: string;
    tags: string[];
    teamId: string | null;
    tenantId: string;
    time: string;
    topic: string;
    unread: boolean;
}
interface PrismaConversationMessageRow {
    attachments: unknown;
    author: string | null;
    conversationId: string;
    createdAt: Date | string;
    id: string;
    side: string | null;
    text: string;
    time: string;
    type: string | null;
}
interface PrismaConversationMessageCreateInput {
    attachments: unknown;
    author: string | null;
    conversationId: string;
    createdAt: Date;
    id: string;
    side: string | null;
    text: string;
    time: string;
    type: string | null;
}
interface PrismaConversationInboundEventRow {
    channel: string;
    conversationId: string;
    eventId: string;
    id: string;
    messageId: string;
    payload?: unknown;
    receivedAt: Date | string;
    traceId: string;
}
interface PrismaConversationInboundEventCreateInput {
    channel: string;
    conversationId: string;
    eventId: string;
    id: string;
    messageId: string;
    payload: Record<string, unknown> | null;
    receivedAt: Date;
    traceId: string;
}
interface PrismaConversationOutboundDescriptorCreateInput {
    auditId: string | null;
    channel: string;
    conversationId: string | null;
    createdAt: Date;
    deliveryState: string | null;
    id: string;
    idempotencyKey: string | null;
    kind: ConversationOutboundDescriptorKind;
    messageId: string | null;
    outboxEventId: string | null;
    payload: Record<string, unknown>;
    requestFingerprint: string | null;
    retryable: boolean;
    status: string;
    tenantId: string;
    traceId: string;
}
interface PrismaConversationOutboundDescriptorRow extends PrismaConversationOutboundDescriptorCreateInput {
    updatedAt?: Date | string;
}
interface PrismaConversationRealtimeEventRow {
    data: unknown;
    eventId: string;
    eventName: string;
    id: string;
    occurredAt: Date | string;
    resourceId: string;
    resourceType: string;
    schemaVersion: string;
    tenantId: string;
    traceId: string;
}
interface PrismaOutboxEventCreateInput {
    aggregateId: string;
    aggregateType: string;
    id: string;
    occurredAt: Date;
    payload: Record<string, unknown>;
    queue: string;
    status: OutboxEvent["status"];
    traceId: string;
    type: string;
}
interface PrismaOutboxEventRow extends Omit<PrismaOutboxEventCreateInput, "status"> {
    status: string;
}
interface PrismaConversationRealtimeEventCreateInput {
    data: Record<string, unknown>;
    eventId: string;
    eventName: string;
    id: string;
    occurredAt: Date;
    resourceId: string;
    resourceType: string;
    schemaVersion: string;
    tenantId: string;
    traceId: string;
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
interface PrismaConversationLifecycleEventRow extends PrismaConversationLifecycleEventCreateInput {
}
interface PrismaConversationLifecycleEventFindManyInput {
    cursor?: {
        id: string;
    };
    orderBy: Array<{
        occurredAt: "asc";
    } | {
        id: "asc";
    }>;
    skip?: number;
    take: number;
    where: {
        conversationId?: string;
        eventType?: {
            in: string[];
        };
        tenantId: string;
    };
}
interface PrismaConversationLifecycleEventFindUniqueInput {
    where: {
        tenantId_source_sourceEventId: {
            source: string;
            sourceEventId: string;
            tenantId: string;
        };
    };
}
interface PrismaConversationUpdateManyInput {
    data: PrismaConversationUpsertData;
    where: {
        id: string;
        operatorId: string | null;
        tenantId: string;
    };
}
interface PrismaRoutingAnalyticsRowCreateInput {
    channel: string;
    conversationId: string;
    eventKind: "assignment" | "transfer";
    fromOperatorId: string | null;
    id: string;
    occurredAt: Date;
    source: string;
    tenantId: string;
    toOperatorId: string;
}
interface PrismaRoutingAnalyticsRow extends PrismaRoutingAnalyticsRowCreateInput {
    createdAt?: Date | string;
}
export declare function createEmptyConversationState(): ConversationState;
export {};
