import {
  type ChannelDeliveryReceipt,
  type ChannelDeliveryReceiptListQuery,
  createPrismaChannelDeliveryReceiptStore,
  type DurableStore,
  InMemoryStore
} from "@support-communication/database";
import { type OutboxEvent } from "@support-communication/events";
import { Prisma } from "@prisma/client";
import { type ConversationMessage, type ConversationAppealMetadata, type ConversationRecord } from "./conversation.types.js";

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

export type ConversationLifecycleEventType =
  | "assignment.changed"
  | "conversation.created"
  | "internal_comment.created"
  | "message.received"
  | "message.sent"
  | "status.changed"
  | "tags.changed"
  | "topic.changed";

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
  tenantId?: string;
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

export interface ConversationOutboundConversationInput extends ConversationOutboundDescriptorRecordInput, ConversationMutationRecordInput {}

export interface ConversationOutboundConversationRecord extends ConversationOutboundDescriptorRecord, ConversationMutationRecord {}

export interface ConversationMutationRecordInput {
  conversation: ConversationRecord;
  lifecycleEvent: ConversationLifecycleEvent;
  realtimeEvent: RealtimeEvent;
}

export interface ConversationMutationRecord extends ConversationMutationRecordInput {}

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

export interface ConversationAssignmentRecord extends ConversationAssignmentRecordInput {}

export class ConversationAssignmentConflictError extends Error {
  readonly code = "conversation_assignment_conflict";

  constructor(conversationId: string) {
    super(`Conversation ${conversationId} assignment changed before commit.`);
    this.name = "ConversationAssignmentConflictError";
  }
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
  listConversations(): MaybePromise<ConversationRecord[]>;
  listLifecycleEvents(filter: ConversationLifecycleEventFilter): MaybePromise<ConversationLifecycleEvent[]>;
  listChannelCatalog(): MaybePromise<Array<Record<string, unknown>>>;
  listOutboundDescriptors(filter?: ConversationOutboundDescriptorFilter): MaybePromise<ConversationOutboundDescriptor[]>;
  listOutboxEvents(): MaybePromise<OutboxEvent[]>;
  listRealtimeEvents(filter?: ConversationRealtimeEventFilter): MaybePromise<RealtimeEvent[]>;
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
let defaultRepository: ConversationRepository | null = null;

export class ConversationRepository implements ConversationRepositoryPort {
  private constructor(private readonly adapter: ConversationRepositoryPort) {}

  static default(): ConversationRepository {
    defaultRepository ??= ConversationRepository.inMemory();
    return defaultRepository;
  }

  static useDefault(repository: ConversationRepository): void {
    defaultRepository = repository;
  }

  static inMemory(seed: ConversationState = createEmptyConversationState()): ConversationRepository {
    return new ConversationRepository(createDurableConversationRepository(new InMemoryStore(seed)));
  }

  static prisma({ client }: PrismaConversationRepositoryOptions): ConversationRepository {
    return new ConversationRepository(new PrismaConversationRepository(client));
  }

  listConversations(): MaybePromise<ConversationRecord[]> {
    return this.adapter.listConversations();
  }

  listChannelCatalog(): MaybePromise<Array<Record<string, unknown>>> {
    return this.adapter.listChannelCatalog();
  }

  listOutboundDescriptors(filter: ConversationOutboundDescriptorFilter = {}): MaybePromise<ConversationOutboundDescriptor[]> {
    return this.adapter.listOutboundDescriptors(filter);
  }

  listOutboxEvents(): MaybePromise<OutboxEvent[]> {
    return this.adapter.listOutboxEvents();
  }

  findConversation(conversationId: string): MaybePromise<ConversationRecord | undefined> {
    return this.adapter.findConversation(conversationId);
  }

  saveConversation(conversation: ConversationRecord): MaybePromise<ConversationRecord> {
    return this.adapter.saveConversation(requireConversationTenant(conversation));
  }

  saveConversationMutation(input: ConversationMutationRecordInput): MaybePromise<ConversationMutationRecord> {
    return this.adapter.saveConversationMutation({ ...input, conversation: requireConversationTenant(input.conversation) });
  }

  assignConversation(input: ConversationAssignmentRecordInput): MaybePromise<ConversationAssignmentRecord> {
    return this.adapter.assignConversation({ ...input, conversation: requireConversationTenant(input.conversation) });
  }

  findInboundEvent(channel: string, eventId: string): MaybePromise<ConversationInboundEvent | undefined> {
    return this.adapter.findInboundEvent(channel, eventId);
  }

  findOutboundDescriptorByIdempotencyKey(idempotencyKey: string): MaybePromise<ConversationOutboundDescriptor | undefined> {
    return this.adapter.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
  }

  listDeliveryReceipts(filter: ConversationDeliveryReceiptFilter = {}): MaybePromise<ConversationDeliveryReceipt[]> {
    return this.adapter.listDeliveryReceipts(filter);
  }

  recordDeliveryReceipt(receipt: ConversationDeliveryReceipt): MaybePromise<ConversationDeliveryReceipt> {
    return this.adapter.recordDeliveryReceipt(receipt);
  }

  recordInboundEvent(event: ConversationInboundEvent): MaybePromise<ConversationInboundEvent> {
    return this.adapter.recordInboundEvent(event);
  }

  recordInboundMessage(input: ConversationInboundMessageRecordInput): MaybePromise<ConversationInboundMessageRecord> {
    return this.adapter.recordInboundMessage({ ...input, conversation: requireConversationTenant(input.conversation) });
  }

  appendRealtimeEvent(event: RealtimeEvent): MaybePromise<RealtimeEvent> {
    return this.adapter.appendRealtimeEvent(event);
  }

  enqueueOutboxEvent(event: OutboxEvent): MaybePromise<OutboxEvent> {
    return this.adapter.enqueueOutboxEvent(event);
  }

  queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): MaybePromise<ConversationOutboundMessageReplyRecord> {
    return this.adapter.queueOutboundMessageReply({ ...input, conversation: requireConversationTenant(input.conversation) });
  }

  recordOutboundDescriptor(input: ConversationOutboundDescriptorRecordInput): MaybePromise<ConversationOutboundDescriptorRecord> {
    return this.adapter.recordOutboundDescriptor(input);
  }

  listRealtimeEvents(filter: ConversationRealtimeEventFilter = {}): MaybePromise<RealtimeEvent[]> {
    return this.adapter.listRealtimeEvents(filter);
  }

  queueOutboundConversation(input: ConversationOutboundConversationInput): MaybePromise<ConversationOutboundConversationRecord> {
    return this.adapter.queueOutboundConversation({ ...input, conversation: requireConversationTenant(input.conversation) });
  }

  listLifecycleEvents(filter: ConversationLifecycleEventFilter): MaybePromise<ConversationLifecycleEvent[]> {
    return this.adapter.listLifecycleEvents({ ...filter, tenantId: requireConversationTenantId(filter.tenantId) });
  }
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
    updateMany(input: PrismaConversationUpdateManyInput): Promise<{ count: number }>;
    upsert(input: PrismaConversationUpsertInput): Promise<PrismaConversationRow>;
  };
  conversationInboundEvent: {
    create(input: { data: PrismaConversationInboundEventCreateInput }): Promise<PrismaConversationInboundEventRow>;
    findUnique(input: PrismaConversationInboundEventFindUniqueInput): Promise<PrismaConversationInboundEventRow | null>;
  };
  conversationLifecycleEvent: {
    create(input: { data: PrismaConversationLifecycleEventCreateInput }): Promise<PrismaConversationLifecycleEventRow>;
    findMany(input: PrismaConversationLifecycleEventFindManyInput): Promise<PrismaConversationLifecycleEventRow[]>;
    findUnique(input: PrismaConversationLifecycleEventFindUniqueInput): Promise<PrismaConversationLifecycleEventRow | null>;
  };
  conversationMessage: {
    createMany(input: { data: PrismaConversationMessageCreateInput[] }): Promise<{ count: number }>;
    deleteMany(input: { where: { conversationId: string } }): Promise<{ count: number }>;
  };
  conversationOutboundDescriptor: {
    create(input: { data: PrismaConversationOutboundDescriptorCreateInput }): Promise<PrismaConversationOutboundDescriptorRow>;
    findMany(input: PrismaConversationOutboundDescriptorFindManyInput): Promise<PrismaConversationOutboundDescriptorRow[]>;
    findUnique(input: PrismaConversationOutboundDescriptorFindUniqueInput): Promise<PrismaConversationOutboundDescriptorRow | null>;
  };
  conversationRealtimeEvent: {
    create(input: { data: PrismaConversationRealtimeEventCreateInput }): Promise<PrismaConversationRealtimeEventRow>;
    findMany(input: {
      orderBy: Array<{ occurredAt: "asc" } | { eventId: "asc" }>;
      where?: { tenantId?: string };
    }): Promise<PrismaConversationRealtimeEventRow[]>;
  };
  outboxEvent: {
    create(input: { data: PrismaOutboxEventCreateInput }): Promise<PrismaOutboxEventRow>;
    findMany?(input: { orderBy: { occurredAt: "asc" } }): Promise<PrismaOutboxEventRow[]>;
  };
  routingAnalyticsRow: {
    create(input: { data: PrismaRoutingAnalyticsRowCreateInput }): Promise<PrismaRoutingAnalyticsRow>;
  };
}

interface PrismaConversationFindManyInput {
  include: { messages: { orderBy: { createdAt: "asc" } } };
  orderBy: { updatedAt: "desc" };
}

interface PrismaConversationFindUniqueInput {
  include: { messages: { orderBy: { createdAt: "asc" } } };
  where: { id: string };
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
  orderBy: { createdAt: "desc" };
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
  where: { id: string };
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

interface PrismaConversationLifecycleEventRow extends PrismaConversationLifecycleEventCreateInput {}

interface PrismaConversationLifecycleEventFindManyInput {
  orderBy: Array<{ occurredAt: "asc" } | { id: "asc" }>;
  where: {
    conversationId?: string;
    eventType?: { in: string[] };
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

async function savePrismaConversation(transaction: PrismaConversationTransactionalClient, conversation: ConversationRecord): Promise<ConversationRecord> {
  const conversationData = toPrismaConversationUpsertData(conversation);
  await transaction.conversation.upsert({
    create: conversationData,
    update: conversationData,
    where: { id: conversation.id }
  });
  await replacePrismaConversationMessages(transaction, conversation);

  return clone(conversation);
}

async function replacePrismaConversationMessages(
  transaction: PrismaConversationTransactionalClient,
  conversation: ConversationRecord
): Promise<void> {
  await transaction.conversationMessage.deleteMany({ where: { conversationId: conversation.id } });
  const firstCreatedAt = new Date();
  const messages = conversation.messages.map((message, index) => toPrismaConversationMessageCreateInput(
    conversation.id,
    message,
    messageCreatedAtOrFallback(message.createdAt, new Date(firstCreatedAt.getTime() + index))
  ));
  if (messages.length > 0) {
    await transaction.conversationMessage.createMany({ data: messages });
  }
}

async function appendPrismaRealtimeEvent(transaction: PrismaConversationTransactionalClient, event: RealtimeEvent): Promise<RealtimeEvent> {
  const row = await transaction.conversationRealtimeEvent.create({
    data: {
      data: event.data,
      eventId: event.eventId,
      eventName: event.eventName,
      id: event.eventId,
      occurredAt: new Date(event.occurredAt),
      resourceId: event.resourceId,
      resourceType: event.resourceType,
      schemaVersion: event.schemaVersion,
      tenantId: event.tenantId,
      traceId: event.traceId
    }
  });

  return toRealtimeEvent(row);
}

async function appendPrismaLifecycleEvent(
  transaction: PrismaConversationTransactionalClient,
  event: ConversationLifecycleEvent
): Promise<ConversationLifecycleEvent> {
  const row = await transaction.conversationLifecycleEvent.create({
    data: toPrismaConversationLifecycleEventCreateInput(event)
  });
  return toConversationLifecycleEvent(row);
}

async function recordPrismaOutboundDescriptor(
  transaction: PrismaConversationTransactionalClient,
  descriptor: ConversationOutboundDescriptor,
  outbox?: OutboxEvent
): Promise<ConversationOutboundDescriptorRecord> {
  if (outbox) {
    await transaction.outboxEvent.create({ data: toPrismaOutboxEventCreateInput(outbox) });
  }

  const row = await transaction.conversationOutboundDescriptor.create({
    data: toPrismaConversationOutboundDescriptorCreateInput({
      ...descriptor,
      outboxEventId: outbox?.id ?? descriptor.outboxEventId
    })
  });

  return {
    descriptor: toConversationOutboundDescriptor(row),
    ...(outbox ? { outbox: clone(outbox) } : {})
  };
}

class PrismaConversationRepository implements ConversationRepositoryPort {
  async enqueueOutboxEvent(event: OutboxEvent): Promise<OutboxEvent> {
    await this.client.outboxEvent.create({ data: toPrismaOutboxEventCreateInput(event) });
    return clone(event);
  }
  constructor(private readonly client: PrismaConversationClient) {}

  async listConversations(): Promise<ConversationRecord[]> {
    const rows = await this.client.conversation.findMany(conversationWithMessagesQuery());
    return rows.map(toConversationRecord);
  }

  async listChannelCatalog(): Promise<Array<Record<string, unknown>>> {
    return [];
  }

  async findConversation(conversationId: string): Promise<ConversationRecord | undefined> {
    const row = await this.client.conversation.findUnique({
      include: conversationMessagesInclude(),
      where: { id: conversationId }
    });

    return row ? toConversationRecord(row) : undefined;
  }

  saveConversation(conversation: ConversationRecord): Promise<ConversationRecord> {
    return this.client.$transaction((transaction) => savePrismaConversation(transaction, conversation));
  }

  saveConversationMutation(input: ConversationMutationRecordInput): Promise<ConversationMutationRecord> {
    return this.client.$transaction(async (transaction) => {
      const conversation = await savePrismaConversation(transaction, input.conversation);
      const lifecycleEvent = await appendPrismaLifecycleEvent(transaction, input.lifecycleEvent);
      const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
      return { conversation, lifecycleEvent, realtimeEvent };
    });
  }

  assignConversation(input: ConversationAssignmentRecordInput): Promise<ConversationAssignmentRecord> {
    return this.client.$transaction(async (transaction) => {
      const conversationData = toPrismaConversationUpsertData(input.conversation);
      const updated = await transaction.conversation.updateMany({
        data: conversationData,
        where: {
          id: input.conversation.id,
          operatorId: input.analyticsRow.fromOperatorId,
          tenantId: input.analyticsRow.tenantId
        }
      });
      if (updated.count !== 1) {
        throw new ConversationAssignmentConflictError(input.conversation.id);
      }
      await replacePrismaConversationMessages(transaction, input.conversation);
      const conversation = clone(input.conversation);
      const lifecycleEvent = await appendPrismaLifecycleEvent(transaction, input.lifecycleEvent);
      const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
      await transaction.routingAnalyticsRow.create({
        data: {
          ...input.analyticsRow,
          occurredAt: new Date(input.analyticsRow.occurredAt)
        }
      });

      return {
        analyticsRow: clone(input.analyticsRow),
        conversation,
        lifecycleEvent,
        realtimeEvent
      };
    });
  }

  async findInboundEvent(channel: string, eventId: string): Promise<ConversationInboundEvent | undefined> {
    if (!channel || !eventId) {
      return undefined;
    }

    const row = await this.client.conversationInboundEvent.findUnique({
      where: {
        channel_eventId: {
          channel,
          eventId
        }
      }
    });

    return row ? toConversationInboundEvent(row) : undefined;
  }

  async findOutboundDescriptorByIdempotencyKey(idempotencyKey: string): Promise<ConversationOutboundDescriptor | undefined> {
    if (!idempotencyKey) {
      return undefined;
    }

    const row = await this.client.conversationOutboundDescriptor.findUnique({
      where: { idempotencyKey }
    });

    return row ? toConversationOutboundDescriptor(row) : undefined;
  }

  listDeliveryReceipts(filter: ConversationDeliveryReceiptFilter = {}): Promise<ConversationDeliveryReceipt[]> {
    return createPrismaChannelDeliveryReceiptStore(this.client).listDeliveryReceipts(filter);
  }

  recordDeliveryReceipt(receipt: ConversationDeliveryReceipt): Promise<ConversationDeliveryReceipt> {
    return createPrismaChannelDeliveryReceiptStore(this.client).recordDeliveryReceipt(receipt);
  }

  async recordInboundEvent(event: ConversationInboundEvent): Promise<ConversationInboundEvent> {
    const existing = await this.findInboundEvent(event.channel, event.eventId);
    if (existing) {
      return existing;
    }

    try {
      const row = await this.client.conversationInboundEvent.create({
        data: {
          channel: event.channel,
          conversationId: event.conversationId,
          eventId: event.eventId,
          id: makePersistenceId("inbound", event.channel, event.eventId),
          messageId: event.messageId,
          payload: null,
          receivedAt: new Date(event.receivedAt),
          traceId: event.traceId
        }
      });

      return toConversationInboundEvent(row);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const raced = await this.findInboundEvent(event.channel, event.eventId);
      if (!raced) {
        throw error;
      }

      return raced;
    }
  }

  async appendRealtimeEvent(event: RealtimeEvent): Promise<RealtimeEvent> {
    return appendPrismaRealtimeEvent(this.client, event);
  }

  async listRealtimeEvents(filter: ConversationRealtimeEventFilter = {}): Promise<RealtimeEvent[]> {
    const rows = await this.client.conversationRealtimeEvent.findMany({
      orderBy: [{ occurredAt: "asc" }, { eventId: "asc" }],
      ...(filter.tenantId ? { where: { tenantId: filter.tenantId } } : {})
    });
    return rows.map(toRealtimeEvent);
  }

  async recordInboundMessage(input: ConversationInboundMessageRecordInput): Promise<ConversationInboundMessageRecord> {
    return this.client.$transaction(async (transaction) => {
      const conversation = await savePrismaConversation(transaction, input.conversation);
      const lifecycleEvent = await appendPrismaLifecycleEvent(transaction, input.lifecycleEvent);
      const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
      const row = await transaction.conversationInboundEvent.create({
        data: {
          channel: input.inboundEvent.channel,
          conversationId: input.inboundEvent.conversationId,
          eventId: input.inboundEvent.eventId,
          id: makePersistenceId("inbound", input.inboundEvent.channel, input.inboundEvent.eventId),
          messageId: input.inboundEvent.messageId,
          payload: null,
          receivedAt: new Date(input.inboundEvent.receivedAt),
          traceId: input.inboundEvent.traceId
        }
      });
      return {
        conversation,
        inboundEvent: toConversationInboundEvent(row),
        lifecycleEvent,
        realtimeEvent
      };
    });
  }

  async listLifecycleEvents(filter: ConversationLifecycleEventFilter): Promise<ConversationLifecycleEvent[]> {
    const rows = await this.client.conversationLifecycleEvent.findMany({
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      where: {
        tenantId: requireConversationTenantId(filter.tenantId),
        ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
        ...(filter.eventTypes?.length ? { eventType: { in: filter.eventTypes } } : {})
      }
    });
    return paginateLifecycleEvents(rows.map(toConversationLifecycleEvent), filter);
  }

  async queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): Promise<ConversationOutboundMessageReplyRecord> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const conversation = await savePrismaConversation(transaction, input.conversation);
        const lifecycleEvent = await appendPrismaLifecycleEvent(transaction, input.lifecycleEvent);
        const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
        const outbound = await recordPrismaOutboundDescriptor(transaction, input.descriptor, input.outbox);

        return {
          conversation,
          lifecycleEvent,
          realtimeEvent,
          ...outbound
        };
      });
    } catch (error) {
      const existing = await this.findExistingOutboundAfterUniqueError(error, input.descriptor.idempotencyKey);
      if (!existing) {
        throw error;
      }

      // The descriptor collision rolled the whole transaction back. Deduplicate the
      // delivery, but persist the conversation mutation — otherwise the state change
      // (e.g. a repeat close after reopen) is silently lost.
      try {
        return await this.client.$transaction(async (transaction) => {
          const conversation = await savePrismaConversation(transaction, input.conversation);
          const lifecycleEvent = await appendPrismaLifecycleEvent(transaction, input.lifecycleEvent);
          const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
          return { conversation, lifecycleEvent, realtimeEvent, descriptor: existing };
        });
      } catch (mutationError) {
        if (!isUniqueConstraintError(mutationError)) {
          throw mutationError;
        }

        // True replay: the original attempt already recorded these exact events.
        return {
          conversation: clone(input.conversation),
          lifecycleEvent: clone(input.lifecycleEvent),
          realtimeEvent: clone(input.realtimeEvent),
          descriptor: existing
        };
      }
    }
  }

  async queueOutboundConversation(input: ConversationOutboundConversationInput): Promise<ConversationOutboundConversationRecord> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const conversation = await savePrismaConversation(transaction, input.conversation);
        const lifecycleEvent = await appendPrismaLifecycleEvent(transaction, input.lifecycleEvent);
        const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
        const outbound = await recordPrismaOutboundDescriptor(transaction, input.descriptor, input.outbox);
        return { conversation, lifecycleEvent, realtimeEvent, ...outbound };
      });
    } catch (error) {
      const existing = await this.findExistingOutboundAfterUniqueError(error, input.descriptor.idempotencyKey);
      if (!existing) throw error;
      return {
        conversation: clone(input.conversation),
        descriptor: existing,
        lifecycleEvent: clone(input.lifecycleEvent),
        realtimeEvent: clone(input.realtimeEvent)
      };
    }
  }

  async recordOutboundDescriptor(input: ConversationOutboundDescriptorRecordInput): Promise<ConversationOutboundDescriptorRecord> {
    try {
      return await this.client.$transaction((transaction) => recordPrismaOutboundDescriptor(transaction, input.descriptor, input.outbox));
    } catch (error) {
      const existing = await this.findExistingOutboundAfterUniqueError(error, input.descriptor.idempotencyKey);
      if (!existing) {
        throw error;
      }

      return { descriptor: existing };
    }
  }

  async listOutboundDescriptors(filter: ConversationOutboundDescriptorFilter = {}): Promise<ConversationOutboundDescriptor[]> {
    const rows = await this.client.conversationOutboundDescriptor.findMany({
      orderBy: { createdAt: "desc" },
      where: outboundDescriptorWhere(filter)
    });

    return rows.map(toConversationOutboundDescriptor);
  }

  async listOutboxEvents(): Promise<OutboxEvent[]> {
    if (!this.client.outboxEvent.findMany) {
      return [];
    }

    const rows = await this.client.outboxEvent.findMany({ orderBy: { occurredAt: "asc" } });
    return rows.map(toOutboxEvent);
  }

  private async findExistingOutboundAfterUniqueError(error: unknown, idempotencyKey: string | null): Promise<ConversationOutboundDescriptor | undefined> {
    if (!isUniqueConstraintError(error) || !idempotencyKey) {
      return undefined;
    }

    return this.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
  }
}

function createDurableConversationRepository(store: DurableStore<ConversationState>): ConversationRepositoryPort {
  return {
    listConversations(): ConversationRecord[] {
      return clone(store.read().conversations);
    },

    listChannelCatalog(): Array<Record<string, unknown>> {
      return clone(store.read().channelCatalog ?? []);
    },

    listOutboundDescriptors(filter: ConversationOutboundDescriptorFilter = {}): ConversationOutboundDescriptor[] {
      return clone(
        [...(store.read().outboundDescriptors ?? [])]
          .filter((descriptor) => outboundDescriptorMatches(descriptor, filter))
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      );
    },

    listOutboxEvents(): OutboxEvent[] {
      return clone(store.read().outboxEvents ?? []);
    },

    enqueueOutboxEvent(event: OutboxEvent): OutboxEvent {
      store.update((state) => ({
        ...state,
        outboxEvents: (state.outboxEvents ?? []).some((item) => item.id === event.id)
          ? state.outboxEvents ?? []
          : [...(state.outboxEvents ?? []), clone(event)]
      }));
      return clone(event);
    },

    findConversation(conversationId: string): ConversationRecord | undefined {
      return clone(store.read().conversations.find((conversation) => conversation.id === conversationId));
    },

    findOutboundDescriptorByIdempotencyKey(idempotencyKey: string): ConversationOutboundDescriptor | undefined {
      if (!idempotencyKey) {
        return undefined;
      }

      return clone((store.read().outboundDescriptors ?? []).find((descriptor) => descriptor.idempotencyKey === idempotencyKey));
    },

    listDeliveryReceipts(filter: ConversationDeliveryReceiptFilter = {}): ConversationDeliveryReceipt[] {
      return clone(
        [...(store.read().deliveryReceipts ?? [])]
          .filter((receipt) => deliveryReceiptMatches(receipt, filter))
          .sort((left, right) => {
            const receivedAtDelta = new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime();
            return receivedAtDelta === 0 ? left.id.localeCompare(right.id) : receivedAtDelta;
          })
      );
    },

    recordDeliveryReceipt(receipt: ConversationDeliveryReceipt): ConversationDeliveryReceipt {
      let persisted: ConversationDeliveryReceipt | null = null;
      store.update((state) => {
        const existing = findExistingDeliveryReceipt(state, receipt);
        if (existing) {
          persisted = existing;
          return state;
        }

        const nextReceipt = clone(receipt);
        persisted = nextReceipt;
        return {
          ...state,
          deliveryReceipts: [...(state.deliveryReceipts ?? []), nextReceipt]
        };
      });

      if (!persisted) {
        throw new Error(`Delivery receipt ${receipt.provider}:${receipt.providerEventId} was not persisted.`);
      }

      return clone(persisted);
    },

    saveConversation(conversation: ConversationRecord): ConversationRecord {
      let persisted: ConversationRecord | null = null;
      store.update((state) => {
        const nextConversation = clone(conversation);
        persisted = nextConversation;
        const exists = state.conversations.some((item) => item.id === nextConversation.id);

        return {
          ...state,
          conversations: exists
            ? state.conversations.map((item) => item.id === nextConversation.id ? nextConversation : item)
            : [...state.conversations, nextConversation]
        };
      });

      if (!persisted) {
        throw new Error(`Conversation ${conversation.id} was not persisted.`);
      }

      return clone(persisted);
    },

    saveConversationMutation(input: ConversationMutationRecordInput): ConversationMutationRecord {
      let persisted: ConversationMutationRecord | null = null;
      store.update((state) => {
        const lifecycleEvents = state.lifecycleEvents ?? [];
        const duplicate = lifecycleEvents.find((event) => lifecycleEventIdentityMatches(event, input.lifecycleEvent));
        if (duplicate) {
          persisted = {
            conversation: clone(input.conversation),
            lifecycleEvent: clone(duplicate),
            realtimeEvent: clone(input.realtimeEvent)
          };
          return state;
        }
        const nextConversation = clone(input.conversation);
        const nextLifecycleEvent = clone(input.lifecycleEvent);
        const nextRealtimeEvent = clone(input.realtimeEvent);
        persisted = { conversation: nextConversation, lifecycleEvent: nextLifecycleEvent, realtimeEvent: nextRealtimeEvent };
        return {
          ...state,
          conversations: upsertConversationRows(state.conversations, nextConversation),
          lifecycleEvents: [...lifecycleEvents, nextLifecycleEvent],
          realtimeEvents: (state.realtimeEvents ?? []).some((event) => event.eventId === nextRealtimeEvent.eventId)
            ? state.realtimeEvents
            : [...(state.realtimeEvents ?? []), nextRealtimeEvent]
        };
      });
      if (!persisted) throw new Error(`Conversation mutation ${input.lifecycleEvent.id} was not persisted.`);
      return clone(persisted);
    },

    assignConversation(input: ConversationAssignmentRecordInput): ConversationAssignmentRecord {
      let persisted: ConversationAssignmentRecord | null = null;
      store.update((state) => {
        const currentConversation = state.conversations.find((item) => item.id === input.conversation.id);
        if (!currentConversation
          || resolveNullableOperatorId(currentConversation.operatorId) !== input.analyticsRow.fromOperatorId
          || currentConversation.tenantId !== input.analyticsRow.tenantId) {
          throw new ConversationAssignmentConflictError(input.conversation.id);
        }
        const nextConversation = clone(input.conversation);
        const nextLifecycleEvent = clone(input.lifecycleEvent);
        const nextRealtimeEvent = clone(input.realtimeEvent);
        const nextAnalyticsRow = clone(input.analyticsRow);
        persisted = {
          analyticsRow: nextAnalyticsRow,
          conversation: nextConversation,
          lifecycleEvent: nextLifecycleEvent,
          realtimeEvent: nextRealtimeEvent
        };

        return {
          ...state,
          conversations: upsertConversationRows(state.conversations, nextConversation),
          lifecycleEvents: lifecycleEventsWithEvent(state.lifecycleEvents ?? [], nextLifecycleEvent),
          realtimeEvents: (state.realtimeEvents ?? []).some((event) => event.eventId === nextRealtimeEvent.eventId)
            ? state.realtimeEvents
            : [...(state.realtimeEvents ?? []), nextRealtimeEvent],
          routingAnalyticsRows: (state.routingAnalyticsRows ?? []).some((row) => row.id === nextAnalyticsRow.id)
            ? state.routingAnalyticsRows
            : [...(state.routingAnalyticsRows ?? []), nextAnalyticsRow]
        };
      });

      if (!persisted) {
        throw new Error(`Assignment for conversation ${input.conversation.id} was not persisted.`);
      }

      return clone(persisted);
    },

    queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): ConversationOutboundMessageReplyRecord {
      let persisted: ConversationOutboundMessageReplyRecord | null = null;
      store.update((state) => {
        const existing = findExistingOutboundDescriptor(state, input.descriptor);
        if (existing) {
          const existingOutbox = findOutboundDescriptorOutbox(state, existing);
          const replayedLifecycleEvent = (state.lifecycleEvents ?? [])
            .find((event) => lifecycleEventIdentityMatches(event, input.lifecycleEvent));
          if (replayedLifecycleEvent) {
            persisted = {
              conversation: clone(input.conversation),
              lifecycleEvent: clone(replayedLifecycleEvent),
              realtimeEvent: clone(input.realtimeEvent),
              descriptor: clone(existing),
              ...(existingOutbox ? { outbox: clone(existingOutbox) } : {})
            };
            return state;
          }

          // Deduplicate the delivery, but persist the conversation mutation —
          // otherwise the state change behind it (e.g. a repeat close) is lost.
          const nextConversation = clone(input.conversation);
          const nextLifecycleEvent = clone(input.lifecycleEvent);
          const nextRealtimeEvent = clone(input.realtimeEvent);
          persisted = {
            conversation: nextConversation,
            lifecycleEvent: nextLifecycleEvent,
            realtimeEvent: nextRealtimeEvent,
            descriptor: clone(existing),
            ...(existingOutbox ? { outbox: clone(existingOutbox) } : {})
          };
          return {
            ...state,
            conversations: upsertConversationRows(state.conversations, nextConversation),
            lifecycleEvents: [...(state.lifecycleEvents ?? []), nextLifecycleEvent],
            realtimeEvents: lifecycleRealtimeEventsWithEvent(state.realtimeEvents ?? [], nextRealtimeEvent)
          };
        }

        const nextConversation = clone(input.conversation);
        const nextLifecycleEvent = clone(input.lifecycleEvent);
        const nextRealtimeEvent = clone(input.realtimeEvent);
        const conversations = upsertConversationRows(state.conversations, nextConversation);
        const realtimeEvents = (state.realtimeEvents ?? []).some((event) => event.eventId === nextRealtimeEvent.eventId)
          ? state.realtimeEvents
          : [...(state.realtimeEvents ?? []), nextRealtimeEvent];
        const recorded = recordOutboundDescriptorInState({
          ...state,
          conversations,
          lifecycleEvents: lifecycleEventsWithEvent(state.lifecycleEvents ?? [], nextLifecycleEvent),
          realtimeEvents
        }, input.descriptor, input.outbox);

        persisted = {
          conversation: nextConversation,
          lifecycleEvent: nextLifecycleEvent,
          realtimeEvent: nextRealtimeEvent,
          descriptor: recorded.descriptor,
          ...(recorded.outbox ? { outbox: recorded.outbox } : {})
        };
        return recorded.state;
      });

      if (!persisted) {
        throw new Error(`Outbound reply for conversation ${input.conversation.id} was not persisted.`);
      }

      return clone(persisted);
    },

    recordOutboundDescriptor(input: ConversationOutboundDescriptorRecordInput): ConversationOutboundDescriptorRecord {
      let persisted: ConversationOutboundDescriptorRecord | null = null;
      store.update((state) => {
        const recorded = recordOutboundDescriptorInState(state, input.descriptor, input.outbox);
        persisted = {
          descriptor: recorded.descriptor,
          ...(recorded.outbox ? { outbox: recorded.outbox } : {})
        };
        return recorded.state;
      });

      if (!persisted) {
        throw new Error(`Outbound descriptor ${input.descriptor.id} was not persisted.`);
      }

      return clone(persisted);
    },

    findInboundEvent(channel: string, eventId: string): ConversationInboundEvent | undefined {
      if (!channel || !eventId) {
        return undefined;
      }

      return clone(store.read().inboundEvents.find((event) => event.channel === channel && event.eventId === eventId));
    },

    recordInboundEvent(event: ConversationInboundEvent): ConversationInboundEvent {
      let persisted: ConversationInboundEvent | null = null;
      store.update((state) => {
        const existing = state.inboundEvents.find((item) => item.channel === event.channel && item.eventId === event.eventId);
        if (existing) {
          persisted = existing;
          return state;
        }

        const nextEvent = clone(event);
        persisted = nextEvent;
        return {
          ...state,
          inboundEvents: [...state.inboundEvents, nextEvent]
        };
      });

      if (!persisted) {
        throw new Error(`Inbound event ${event.channel}:${event.eventId} was not persisted.`);
      }

      return clone(persisted);
    },

    queueOutboundConversation(input: ConversationOutboundConversationInput): ConversationOutboundConversationRecord {
      let persisted: ConversationOutboundConversationRecord | null = null;
      store.update((state) => {
        const existing = findExistingOutboundDescriptor(state, input.descriptor);
        if (existing) {
          const existingOutbox = findOutboundDescriptorOutbox(state, existing);
          persisted = {
            conversation: clone(input.conversation),
            descriptor: clone(existing),
            lifecycleEvent: clone(input.lifecycleEvent),
            realtimeEvent: clone(input.realtimeEvent),
            ...(existingOutbox ? { outbox: clone(existingOutbox) } : {})
          };
          return state;
        }
        const nextConversation = clone(input.conversation);
        const nextLifecycleEvent = clone(input.lifecycleEvent);
        const nextRealtimeEvent = clone(input.realtimeEvent);
        const recorded = recordOutboundDescriptorInState({
          ...state,
          conversations: upsertConversationRows(state.conversations, nextConversation),
          lifecycleEvents: lifecycleEventsWithEvent(state.lifecycleEvents ?? [], nextLifecycleEvent),
          realtimeEvents: lifecycleRealtimeEventsWithEvent(state.realtimeEvents ?? [], nextRealtimeEvent)
        }, input.descriptor, input.outbox);
        persisted = {
          conversation: nextConversation,
          descriptor: recorded.descriptor,
          lifecycleEvent: nextLifecycleEvent,
          realtimeEvent: nextRealtimeEvent,
          ...(recorded.outbox ? { outbox: recorded.outbox } : {})
        };
        return recorded.state;
      });
      if (!persisted) throw new Error(`Outbound conversation ${input.descriptor.id} was not persisted.`);
      return clone(persisted);
    },

    recordInboundMessage(input: ConversationInboundMessageRecordInput): ConversationInboundMessageRecord {
      let persisted: ConversationInboundMessageRecord | null = null;
      store.update((state) => {
        const existing = state.inboundEvents.find((event) =>
          event.channel === input.inboundEvent.channel && event.eventId === input.inboundEvent.eventId
        );
        if (existing) {
          persisted = {
            conversation: clone(input.conversation),
            inboundEvent: clone(existing),
            lifecycleEvent: clone(input.lifecycleEvent),
            realtimeEvent: clone(input.realtimeEvent)
          };
          return state;
        }
        const nextConversation = clone(input.conversation);
        const nextInboundEvent = clone(input.inboundEvent);
        const nextLifecycleEvent = clone(input.lifecycleEvent);
        const nextRealtimeEvent = clone(input.realtimeEvent);
        persisted = {
          conversation: nextConversation,
          inboundEvent: nextInboundEvent,
          lifecycleEvent: nextLifecycleEvent,
          realtimeEvent: nextRealtimeEvent
        };
        return {
          ...state,
          conversations: upsertConversationRows(state.conversations, nextConversation),
          inboundEvents: [...state.inboundEvents, nextInboundEvent],
          lifecycleEvents: lifecycleEventsWithEvent(state.lifecycleEvents ?? [], nextLifecycleEvent),
          realtimeEvents: (state.realtimeEvents ?? []).some((event) => event.eventId === nextRealtimeEvent.eventId)
            ? state.realtimeEvents
            : [...(state.realtimeEvents ?? []), nextRealtimeEvent]
        };
      });
      if (!persisted) throw new Error(`Inbound message ${input.inboundEvent.channel}:${input.inboundEvent.eventId} was not persisted.`);
      return clone(persisted);
    },

    appendRealtimeEvent(event: RealtimeEvent): RealtimeEvent {
      const nextEvent = clone(event);
      store.update((state) => ({
        ...state,
        realtimeEvents: [...state.realtimeEvents, nextEvent]
      }));

      return clone(nextEvent);
    },

    listRealtimeEvents(filter: ConversationRealtimeEventFilter = {}): RealtimeEvent[] {
      return clone((store.read().realtimeEvents ?? [])
        .filter((event) => !filter.tenantId || event.tenantId === filter.tenantId));
    },

    listLifecycleEvents(filter: ConversationLifecycleEventFilter): ConversationLifecycleEvent[] {
      const rows = (store.read().lifecycleEvents ?? [])
        .filter((event) => event.tenantId === filter.tenantId)
        .filter((event) => !filter.conversationId || event.conversationId === filter.conversationId)
        .filter((event) => !filter.eventTypes?.length || filter.eventTypes.includes(event.eventType))
        .sort(compareLifecycleEvents);
      return clone(paginateLifecycleEvents(rows, filter));
    }
  };
}

function upsertConversationRows(conversations: ConversationRecord[], conversation: ConversationRecord): ConversationRecord[] {
  const exists = conversations.some((item) => item.id === conversation.id);
  return exists
    ? conversations.map((item) => item.id === conversation.id ? clone(conversation) : item)
    : [...conversations, clone(conversation)];
}

function recordOutboundDescriptorInState(
  state: ConversationState,
  descriptor: ConversationOutboundDescriptor,
  outbox?: OutboxEvent
): { descriptor: ConversationOutboundDescriptor; outbox?: OutboxEvent; state: ConversationState } {
  const outboundDescriptors = state.outboundDescriptors ?? [];
  const outboxEvents = state.outboxEvents ?? [];
  const existing = findExistingOutboundDescriptor(state, descriptor);

  if (existing) {
    const existingOutbox = findOutboundDescriptorOutbox(state, existing);

    return {
      descriptor: clone(existing),
      ...(existingOutbox ? { outbox: clone(existingOutbox) } : {}),
      state
    };
  }

  const nextOutbox = outbox ? clone(outbox) : undefined;
  const nextDescriptor: ConversationOutboundDescriptor = {
    ...clone(descriptor),
    outboxEventId: nextOutbox?.id ?? descriptor.outboxEventId
  };
  const nextOutboxEvents = nextOutbox && !outboxEvents.some((event) => event.id === nextOutbox.id)
    ? [...outboxEvents, nextOutbox]
    : outboxEvents;

  return {
    descriptor: clone(nextDescriptor),
    ...(nextOutbox ? { outbox: clone(nextOutbox) } : {}),
    state: {
      ...state,
      outboundDescriptors: [...outboundDescriptors, nextDescriptor],
      outboxEvents: nextOutboxEvents
    }
  };
}

function findExistingOutboundDescriptor(state: ConversationState, descriptor: ConversationOutboundDescriptor): ConversationOutboundDescriptor | undefined {
  return (state.outboundDescriptors ?? []).find((item) => {
    return item.id === descriptor.id
      || Boolean(descriptor.idempotencyKey && item.idempotencyKey === descriptor.idempotencyKey);
  });
}

function findOutboundDescriptorOutbox(state: ConversationState, descriptor: ConversationOutboundDescriptor): OutboxEvent | undefined {
  return descriptor.outboxEventId
    ? (state.outboxEvents ?? []).find((event) => event.id === descriptor.outboxEventId)
    : undefined;
}

function outboundDescriptorMatches(descriptor: ConversationOutboundDescriptor, filter: ConversationOutboundDescriptorFilter): boolean {
  return (!filter.channel || descriptor.channel === filter.channel)
    && (!filter.conversationId || descriptor.conversationId === filter.conversationId)
    && (!filter.idempotencyKey || descriptor.idempotencyKey === filter.idempotencyKey)
    && (!filter.kind || descriptor.kind === filter.kind)
    && (!filter.status || descriptor.status === filter.status)
    && (!filter.tenantId || descriptor.tenantId === filter.tenantId);
}

function findExistingDeliveryReceipt(state: ConversationState, receipt: ConversationDeliveryReceipt): ConversationDeliveryReceipt | undefined {
  return (state.deliveryReceipts ?? []).find((item) => {
    return item.id === receipt.id
      || Boolean(receipt.idempotencyKey && item.idempotencyKey === receipt.idempotencyKey)
      || (item.provider === receipt.provider && item.providerEventId === receipt.providerEventId);
  });
}

function deliveryReceiptMatches(receipt: ConversationDeliveryReceipt, filter: ConversationDeliveryReceiptFilter): boolean {
  return (!filter.channel || receipt.channel === filter.channel)
    && (!filter.messageId || receipt.messageId === filter.messageId)
    && (!filter.tenantId || receipt.tenantId === filter.tenantId);
}

function outboundDescriptorWhere(filter: ConversationOutboundDescriptorFilter): Partial<Record<"channel" | "conversationId" | "idempotencyKey" | "kind" | "status" | "tenantId", string>> {
  return Object.fromEntries(
    Object.entries({
      channel: filter.channel,
      conversationId: filter.conversationId,
      idempotencyKey: filter.idempotencyKey,
      kind: filter.kind,
      status: filter.status,
      tenantId: filter.tenantId
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0)
  ) as Partial<Record<"channel" | "conversationId" | "idempotencyKey" | "kind" | "status" | "tenantId", string>>;
}

function conversationWithMessagesQuery(): PrismaConversationFindManyInput {
  return {
    include: conversationMessagesInclude(),
    orderBy: { updatedAt: "desc" }
  };
}

function conversationMessagesInclude(): { messages: { orderBy: { createdAt: "asc" } } } {
  return { messages: { orderBy: { createdAt: "asc" } } };
}

function toConversationRecord(row: PrismaConversationRow): ConversationRecord {
  return {
    ...(row.avatar ? { avatar: row.avatar } : {}),
    channel: row.channel,
    ...(row.channelConnectionId ? { channelConnectionId: row.channelConnectionId } : {}),
    clientSince: row.clientSince,
    device: row.device,
    entry: row.entry,
    id: row.id,
    initials: row.initials,
    language: row.language,
    messages: (row.messages ?? []).map(toConversationMessage),
    name: row.name,
    ...(row.operatorId ? { operatorId: row.operatorId } : {}),
    ...(row.operatorName ? { operatorName: row.operatorName } : {}),
    phone: row.phone,
    preview: row.preview,
    previous: stringMatrixFromJson(row.previous),
    ...(row.providerConversationId ? { providerConversationId: row.providerConversationId } : {}),
    ...(row.providerUserId ? { providerUserId: row.providerUserId } : {}),
    ...(row.queueId ? { queueId: row.queueId } : {}),
    ...(recordFromJson(row.rescueState) ? { rescueState: recordFromJson(row.rescueState) } : {}),
    ...(row.resolutionOutcome ? { resolutionOutcome: row.resolutionOutcome } : {}),
    ...(appealMetadataFromJson(row.metadata) ? { metadata: appealMetadataFromJson(row.metadata) } : {}),
    sla: row.sla,
    slaTone: row.slaTone,
    status: row.status,
    tags: [...row.tags],
    ...(row.teamId ? { teamId: row.teamId } : {}),
    tenantId: row.tenantId,
    time: row.time,
    topic: row.topic,
    ...(row.unread === null ? {} : { unread: row.unread }),
    updatedAt: toIso(row.updatedAt)
  };
}

function toConversationMessage(row: PrismaConversationMessageRow): ConversationMessage {
  return {
    ...(attachmentsFromJson(row.attachments) ? { attachments: attachmentsFromJson(row.attachments) } : {}),
    ...(row.author ? { author: row.author } : {}),
    createdAt: toIso(row.createdAt),
    id: row.id,
    ...(messageSideFromRow(row.side) ? { side: messageSideFromRow(row.side) } : {}),
    text: row.text,
    time: row.time,
    ...(messageTypeFromRow(row.type) ? { type: messageTypeFromRow(row.type) } : {})
  };
}

function toPrismaConversationUpsertData(conversation: ConversationRecord): PrismaConversationUpsertData {
  return {
    avatar: conversation.avatar ?? null,
    channel: conversation.channel,
    channelConnectionId: conversation.channelConnectionId ?? null,
    clientSince: conversation.clientSince,
    device: conversation.device,
    entry: conversation.entry,
    id: conversation.id,
    initials: conversation.initials,
    language: conversation.language,
    metadata: conversation.metadata ?? null,
    name: conversation.name,
    operatorId: conversation.operatorId ?? null,
    operatorName: conversation.operatorName ?? null,
    phone: conversation.phone,
    preview: conversation.preview,
    previous: conversation.previous,
    providerConversationId: conversation.providerConversationId ?? null,
    providerUserId: conversation.providerUserId ?? null,
    queueId: conversation.queueId ?? null,
    rescueState: conversation.rescueState ?? Prisma.JsonNull,
    resolutionOutcome: conversation.resolutionOutcome ?? null,
    sla: conversation.sla,
    slaTone: conversation.slaTone,
    status: conversation.status,
    tags: [...conversation.tags],
    teamId: conversation.teamId ?? null,
    tenantId: requireConversationTenantId(conversation.tenantId),
    time: conversation.time,
    topic: conversation.topic,
    unread: conversation.unread ?? false
  };
}

function toPrismaConversationMessageCreateInput(conversationId: string, message: ConversationMessage, createdAt: Date): PrismaConversationMessageCreateInput {
  return {
    attachments: message.attachments ?? null,
    author: message.author ?? null,
    conversationId,
    createdAt,
    id: String(message.id),
    side: message.side ?? null,
    text: message.text,
    time: message.time,
    type: message.type ?? null
  };
}

function messageCreatedAtOrFallback(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : fallback;
}

function toConversationInboundEvent(row: PrismaConversationInboundEventRow): ConversationInboundEvent {
  return {
    channel: row.channel,
    conversationId: row.conversationId,
    eventId: row.eventId,
    messageId: row.messageId,
    receivedAt: toIso(row.receivedAt),
    traceId: row.traceId
  };
}

function toConversationOutboundDescriptor(row: PrismaConversationOutboundDescriptorRow): ConversationOutboundDescriptor {
  return {
    auditId: row.auditId,
    channel: row.channel,
    conversationId: row.conversationId,
    createdAt: toIso(row.createdAt),
    deliveryState: row.deliveryState,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    kind: row.kind,
    messageId: row.messageId,
    outboxEventId: row.outboxEventId,
    payload: toJsonRecord(row.payload),
    requestFingerprint: row.requestFingerprint,
    retryable: row.retryable,
    status: row.status,
    tenantId: row.tenantId,
    traceId: row.traceId
  };
}

function toPrismaConversationOutboundDescriptorCreateInput(descriptor: ConversationOutboundDescriptor): PrismaConversationOutboundDescriptorCreateInput {
  return {
    auditId: descriptor.auditId,
    channel: descriptor.channel,
    conversationId: descriptor.conversationId,
    createdAt: new Date(descriptor.createdAt),
    deliveryState: descriptor.deliveryState,
    id: descriptor.id,
    idempotencyKey: descriptor.idempotencyKey,
    kind: descriptor.kind,
    messageId: descriptor.messageId,
    outboxEventId: descriptor.outboxEventId,
    payload: descriptor.payload,
    requestFingerprint: descriptor.requestFingerprint,
    retryable: descriptor.retryable,
    status: descriptor.status,
    tenantId: descriptor.tenantId,
    traceId: descriptor.traceId
  };
}

function toRealtimeEvent(row: PrismaConversationRealtimeEventRow): RealtimeEvent {
  return {
    data: toJsonRecord(row.data),
    eventId: row.eventId,
    eventName: row.eventName,
    occurredAt: toIso(row.occurredAt),
    resourceId: row.resourceId,
    resourceType: row.resourceType,
    schemaVersion: row.schemaVersion,
    tenantId: row.tenantId,
    traceId: row.traceId
  };
}

function toPrismaOutboxEventCreateInput(event: OutboxEvent): PrismaOutboxEventCreateInput {
  return {
    aggregateId: event.aggregateId,
    aggregateType: event.aggregateType,
    id: event.id,
    occurredAt: new Date(event.occurredAt),
    payload: event.payload,
    queue: event.queue,
    status: event.status,
    traceId: event.traceId,
    type: event.type
  };
}

function toOutboxEvent(row: PrismaOutboxEventRow): OutboxEvent {
  return {
    aggregateId: row.aggregateId,
    aggregateType: row.aggregateType,
    id: row.id,
    occurredAt: toIso(row.occurredAt),
    payload: toJsonRecord(row.payload),
    queue: row.queue,
    status: row.status as OutboxEvent["status"],
    traceId: row.traceId,
    type: row.type
  };
}

function attachmentsFromJson(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

function stringMatrixFromJson(value: unknown): string[][] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.filter((item): item is string => typeof item === "string"));
}

function messageSideFromRow(side: string | null): ConversationMessage["side"] | undefined {
  return side === "agent" || side === "client" ? side : undefined;
}

function messageTypeFromRow(type: string | null): ConversationMessage["type"] | undefined {
  return type === "event" || type === "internal" ? type : undefined;
}

function makePersistenceId(scope: string, ...parts: string[]): string {
  return `${scope}_${parts.join("_")}`.replace(/[^a-z0-9._-]+/gi, "_");
}

function requireConversationTenantId(value: unknown): string {
  const tenantId = String(value ?? "").trim();
  if (!tenantId) {
    throw new Error("conversation_tenant_id_required");
  }
  return tenantId;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "P2002";
}

function toJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value as Record<string, unknown> } : {};
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseLifecycleActorType(value: string): ConversationLifecycleEvent["actorType"] {
  if (value === "customer") {
    return "client";
  }
  if (value === "client" || value === "operator" || value === "service_admin" || value === "system" || value === "worker") {
    return value;
  }
  return "system";
}

function recordFromJson(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : undefined;
}

function appealMetadataFromJson(value: unknown): ConversationAppealMetadata | undefined {
  const record = recordFromJson(value);
  if (!record) {
    return undefined;
  }

  const metadata: ConversationAppealMetadata = {};
  if (typeof record.anchorId === "string" && record.anchorId.trim()) {
    metadata.anchorId = record.anchorId.trim();
  }
  if (typeof record.closedAt === "string" && record.closedAt.trim()) {
    metadata.closedAt = record.closedAt.trim();
  }
  if (typeof record.parentConversationId === "string" && record.parentConversationId.trim()) {
    metadata.parentConversationId = record.parentConversationId.trim();
  }
  if (typeof record.isRepeatAppeal === "boolean") {
    metadata.isRepeatAppeal = record.isRepeatAppeal;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function lifecycleEventIdentityMatches(left: ConversationLifecycleEvent, right: ConversationLifecycleEvent): boolean {
  return left.tenantId === right.tenantId && left.source === right.source && left.sourceEventId === right.sourceEventId;
}

function lifecycleEventsWithEvent(
  events: ConversationLifecycleEvent[],
  event: ConversationLifecycleEvent
): ConversationLifecycleEvent[] {
  return events.some((item) => lifecycleEventIdentityMatches(item, event)) ? events : [...events, event];
}

function lifecycleRealtimeEventsWithEvent(events: RealtimeEvent[], event: RealtimeEvent): RealtimeEvent[] {
  return events.some((item) => item.eventId === event.eventId) ? events : [...events, event];
}

function compareLifecycleEvents(left: ConversationLifecycleEvent, right: ConversationLifecycleEvent): number {
  const occurred = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  return occurred === 0 ? left.id.localeCompare(right.id) : occurred;
}

function paginateLifecycleEvents(
  rows: ConversationLifecycleEvent[],
  filter: ConversationLifecycleEventFilter
): ConversationLifecycleEvent[] {
  const cursorIndex = filter.cursor ? rows.findIndex((event) => event.id === filter.cursor) : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const limit = Math.max(1, Math.min(200, Number.isFinite(filter.limit) ? Number(filter.limit) : 50));
  return rows.slice(start, start + limit);
}

export function createEmptyConversationState(): ConversationState {
  return {
    channelCatalog: [],
    conversations: [],
    deliveryReceipts: [],
    inboundEvents: [],
    lifecycleEvents: [],
    outboundDescriptors: [],
    outboxEvents: [],
    realtimeEvents: [],
    routingAnalyticsRows: []
  };
}

function toPrismaConversationLifecycleEventCreateInput(
  event: ConversationLifecycleEvent
): PrismaConversationLifecycleEventCreateInput {
  return {
    actorId: event.actorId,
    actorName: event.actorName,
    actorType: event.actorType,
    conversationId: event.conversationId,
    data: clone(event.data),
    eventType: event.eventType,
    id: event.id,
    ingestedAt: new Date(event.ingestedAt),
    occurredAt: new Date(event.occurredAt),
    reason: event.reason,
    schemaVersion: event.schemaVersion,
    source: event.source,
    sourceEventId: event.sourceEventId,
    tenantId: requireConversationTenantId(event.tenantId),
    traceId: event.traceId
  };
}

function toConversationLifecycleEvent(row: PrismaConversationLifecycleEventRow): ConversationLifecycleEvent {
  return {
    actorId: row.actorId,
    actorName: row.actorName,
    actorType: parseLifecycleActorType(row.actorType),
    conversationId: row.conversationId,
    data: toJsonRecord(row.data),
    eventType: row.eventType,
    id: row.id,
    ingestedAt: toIso(row.ingestedAt),
    occurredAt: toIso(row.occurredAt),
    reason: row.reason,
    schemaVersion: "conversation-lifecycle/v1",
    source: row.source,
    sourceEventId: row.sourceEventId,
    tenantId: row.tenantId,
    traceId: row.traceId
  };
}

function requireConversationTenant(conversation: ConversationRecord): ConversationRecord {
  return {
    ...conversation,
    tenantId: requireConversationTenantId(conversation.tenantId)
  };
}

function resolveNullableOperatorId(value: string | undefined): string | null {
  return value ?? null;
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
