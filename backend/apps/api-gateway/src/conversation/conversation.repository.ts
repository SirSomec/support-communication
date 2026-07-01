import {
  type ChannelDeliveryReceipt,
  type ChannelDeliveryReceiptListQuery,
  createPrismaChannelDeliveryReceiptStore,
  type DurableStore,
  InMemoryStore,
  JsonFileStore
} from "@support-communication/database";
import { type OutboxEvent } from "@support-communication/events";
import { conversationFixtures, type ConversationMessage, type ConversationRecord } from "./conversation.fixtures.js";

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
  realtimeEvent: RealtimeEvent;
}

export interface ConversationOutboundMessageReplyRecord extends ConversationOutboundDescriptorRecord {
  conversation: ConversationRecord;
  realtimeEvent: RealtimeEvent;
}

export interface ConversationState {
  conversations: ConversationRecord[];
  deliveryReceipts: ConversationDeliveryReceipt[];
  inboundEvents: ConversationInboundEvent[];
  outboundDescriptors: ConversationOutboundDescriptor[];
  outboxEvents: OutboxEvent[];
  realtimeEvents: RealtimeEvent[];
}

export interface ConversationRepositoryPort {
  appendRealtimeEvent(event: RealtimeEvent): MaybePromise<RealtimeEvent>;
  findConversation(conversationId: string): MaybePromise<ConversationRecord | undefined>;
  findInboundEvent(channel: string, eventId: string): MaybePromise<ConversationInboundEvent | undefined>;
  findOutboundDescriptorByIdempotencyKey(idempotencyKey: string): MaybePromise<ConversationOutboundDescriptor | undefined>;
  listDeliveryReceipts(filter?: ConversationDeliveryReceiptFilter): MaybePromise<ConversationDeliveryReceipt[]>;
  listConversations(): MaybePromise<ConversationRecord[]>;
  listOutboundDescriptors(filter?: ConversationOutboundDescriptorFilter): MaybePromise<ConversationOutboundDescriptor[]>;
  listOutboxEvents(): MaybePromise<OutboxEvent[]>;
  listRealtimeEvents(filter?: ConversationRealtimeEventFilter): MaybePromise<RealtimeEvent[]>;
  queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): MaybePromise<ConversationOutboundMessageReplyRecord>;
  recordDeliveryReceipt(receipt: ConversationDeliveryReceipt): MaybePromise<ConversationDeliveryReceipt>;
  recordOutboundDescriptor(input: ConversationOutboundDescriptorRecordInput): MaybePromise<ConversationOutboundDescriptorRecord>;
  recordInboundEvent(event: ConversationInboundEvent): MaybePromise<ConversationInboundEvent>;
  saveConversation(conversation: ConversationRecord): MaybePromise<ConversationRecord>;
}

interface ConversationRepositoryOptions {
  filePath: string;
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

  static inMemory(): ConversationRepository {
    return new ConversationRepository(createDurableConversationRepository(new InMemoryStore(seedConversationState())));
  }

  static open({ filePath }: ConversationRepositoryOptions): ConversationRepository {
    return new ConversationRepository(createDurableConversationRepository(new JsonFileStore({ filePath, seed: seedConversationState() })));
  }

  static prisma({ client }: PrismaConversationRepositoryOptions): ConversationRepository {
    return new ConversationRepository(new PrismaConversationRepository(client));
  }

  listConversations(): MaybePromise<ConversationRecord[]> {
    return this.adapter.listConversations();
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
    return this.adapter.saveConversation(conversation);
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

  appendRealtimeEvent(event: RealtimeEvent): MaybePromise<RealtimeEvent> {
    return this.adapter.appendRealtimeEvent(event);
  }

  queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): MaybePromise<ConversationOutboundMessageReplyRecord> {
    return this.adapter.queueOutboundMessageReply(input);
  }

  recordOutboundDescriptor(input: ConversationOutboundDescriptorRecordInput): MaybePromise<ConversationOutboundDescriptorRecord> {
    return this.adapter.recordOutboundDescriptor(input);
  }

  listRealtimeEvents(filter: ConversationRealtimeEventFilter = {}): MaybePromise<RealtimeEvent[]> {
    return this.adapter.listRealtimeEvents(filter);
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
    upsert(input: PrismaConversationUpsertInput): Promise<PrismaConversationRow>;
  };
  conversationInboundEvent: {
    create(input: { data: PrismaConversationInboundEventCreateInput }): Promise<PrismaConversationInboundEventRow>;
    findUnique(input: PrismaConversationInboundEventFindUniqueInput): Promise<PrismaConversationInboundEventRow | null>;
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
  clientSince: string;
  device: string;
  entry: string;
  id: string;
  initials: string;
  language: string;
  name: string;
  phone: string;
  preview: string;
  previous: unknown;
  sla: string;
  slaTone: string;
  status: string;
  tags: string[];
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

async function savePrismaConversation(transaction: PrismaConversationTransactionalClient, conversation: ConversationRecord): Promise<ConversationRecord> {
  const conversationData = toPrismaConversationUpsertData(conversation);
  await transaction.conversation.upsert({
    create: conversationData,
    update: conversationData,
    where: { id: conversation.id }
  });
  await transaction.conversationMessage.deleteMany({ where: { conversationId: conversation.id } });
  const firstCreatedAt = new Date();
  const messages = conversation.messages.map((message, index) => toPrismaConversationMessageCreateInput(
    conversation.id,
    message,
    new Date(firstCreatedAt.getTime() + index)
  ));
  if (messages.length > 0) {
    await transaction.conversationMessage.createMany({ data: messages });
  }

  return clone(conversation);
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
  constructor(private readonly client: PrismaConversationClient) {}

  async listConversations(): Promise<ConversationRecord[]> {
    const rows = await this.client.conversation.findMany(conversationWithMessagesQuery());
    return rows.map(toConversationRecord);
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

  async queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): Promise<ConversationOutboundMessageReplyRecord> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const conversation = await savePrismaConversation(transaction, input.conversation);
        const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
        const outbound = await recordPrismaOutboundDescriptor(transaction, input.descriptor, input.outbox);

        return {
          conversation,
          realtimeEvent,
          ...outbound
        };
      });
    } catch (error) {
      const existing = await this.findExistingOutboundAfterUniqueError(error, input.descriptor.idempotencyKey);
      if (!existing) {
        throw error;
      }

      return {
        conversation: clone(input.conversation),
        realtimeEvent: clone(input.realtimeEvent),
        descriptor: existing
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

    queueOutboundMessageReply(input: ConversationOutboundMessageReplyInput): ConversationOutboundMessageReplyRecord {
      let persisted: ConversationOutboundMessageReplyRecord | null = null;
      store.update((state) => {
        const existing = findExistingOutboundDescriptor(state, input.descriptor);
        if (existing) {
          const existingOutbox = findOutboundDescriptorOutbox(state, existing);
          persisted = {
            conversation: clone(input.conversation),
            realtimeEvent: clone(input.realtimeEvent),
            descriptor: clone(existing),
            ...(existingOutbox ? { outbox: clone(existingOutbox) } : {})
          };
          return state;
        }

        const nextConversation = clone(input.conversation);
        const nextRealtimeEvent = clone(input.realtimeEvent);
        const conversations = upsertConversationRows(state.conversations, nextConversation);
        const realtimeEvents = (state.realtimeEvents ?? []).some((event) => event.eventId === nextRealtimeEvent.eventId)
          ? state.realtimeEvents
          : [...(state.realtimeEvents ?? []), nextRealtimeEvent];
        const recorded = recordOutboundDescriptorInState({
          ...state,
          conversations,
          realtimeEvents
        }, input.descriptor, input.outbox);

        persisted = {
          conversation: nextConversation,
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
    clientSince: row.clientSince,
    device: row.device,
    entry: row.entry,
    id: row.id,
    initials: row.initials,
    language: row.language,
    messages: (row.messages ?? []).map(toConversationMessage),
    name: row.name,
    phone: row.phone,
    preview: row.preview,
    previous: stringMatrixFromJson(row.previous),
    sla: row.sla,
    slaTone: row.slaTone,
    status: row.status,
    tags: [...row.tags],
    tenantId: row.tenantId,
    time: row.time,
    topic: row.topic,
    ...(row.unread === null ? {} : { unread: row.unread })
  };
}

function toConversationMessage(row: PrismaConversationMessageRow): ConversationMessage {
  return {
    ...(attachmentsFromJson(row.attachments) ? { attachments: attachmentsFromJson(row.attachments) } : {}),
    ...(row.author ? { author: row.author } : {}),
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
    clientSince: conversation.clientSince,
    device: conversation.device,
    entry: conversation.entry,
    id: conversation.id,
    initials: conversation.initials,
    language: conversation.language,
    name: conversation.name,
    phone: conversation.phone,
    preview: conversation.preview,
    previous: conversation.previous,
    sla: conversation.sla,
    slaTone: conversation.slaTone,
    status: conversation.status,
    tags: [...conversation.tags],
    tenantId: conversation.tenantId ?? "tenant-volga",
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

function seedConversationState(): ConversationState {
  return {
    conversations: clone(conversationFixtures),
    deliveryReceipts: [],
    inboundEvents: [],
    outboundDescriptors: [],
    outboxEvents: [],
    realtimeEvents: []
  };
}

function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
