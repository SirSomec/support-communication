import { createPrismaChannelDeliveryReceiptStore, InMemoryStore } from "@support-communication/database";
import { Prisma } from "@prisma/client";
const REALTIME_EVENT_BUFFER_LIMIT = 5_000;
export class ConversationAssignmentConflictError extends Error {
    code = "conversation_assignment_conflict";
    constructor(conversationId) {
        super(`Conversation ${conversationId} assignment changed before commit.`);
        this.name = "ConversationAssignmentConflictError";
    }
}
let defaultRepository = null;
export class ConversationRepository {
    adapter;
    constructor(adapter) {
        this.adapter = adapter;
    }
    static default() {
        defaultRepository ??= ConversationRepository.inMemory();
        return defaultRepository;
    }
    static useDefault(repository) {
        defaultRepository = repository;
    }
    static inMemory(seed = createEmptyConversationState()) {
        return new ConversationRepository(createDurableConversationRepository(new InMemoryStore(seed)));
    }
    static prisma({ client }) {
        return new ConversationRepository(new PrismaConversationRepository(client));
    }
    listConversations(filter) {
        return this.adapter.listConversations(filter);
    }
    listChannelCatalog() {
        return this.adapter.listChannelCatalog();
    }
    listOutboundDescriptors(filter = {}) {
        return this.adapter.listOutboundDescriptors(filter);
    }
    listOutboxEvents() {
        return this.adapter.listOutboxEvents();
    }
    findConversation(conversationId) {
        return this.adapter.findConversation(conversationId);
    }
    saveConversation(conversation) {
        return this.adapter.saveConversation(requireConversationTenant(conversation));
    }
    saveConversationMutation(input) {
        return this.adapter.saveConversationMutation({ ...input, conversation: requireConversationTenant(input.conversation) });
    }
    assignConversation(input) {
        return this.adapter.assignConversation({ ...input, conversation: requireConversationTenant(input.conversation) });
    }
    findInboundEvent(channel, eventId) {
        return this.adapter.findInboundEvent(channel, eventId);
    }
    findOutboundDescriptorByIdempotencyKey(idempotencyKey) {
        return this.adapter.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
    }
    listDeliveryReceipts(filter = {}) {
        return this.adapter.listDeliveryReceipts(filter);
    }
    recordDeliveryReceipt(receipt) {
        return this.adapter.recordDeliveryReceipt(receipt);
    }
    recordInboundEvent(event) {
        return this.adapter.recordInboundEvent(event);
    }
    recordInboundMessage(input) {
        return this.adapter.recordInboundMessage({ ...input, conversation: requireConversationTenant(input.conversation) });
    }
    appendRealtimeEvent(event) {
        return this.adapter.appendRealtimeEvent(event);
    }
    enqueueOutboxEvent(event) {
        return this.adapter.enqueueOutboxEvent(event);
    }
    queueOutboundMessageReply(input) {
        return this.adapter.queueOutboundMessageReply({ ...input, conversation: requireConversationTenant(input.conversation) });
    }
    recordOutboundDescriptor(input) {
        return this.adapter.recordOutboundDescriptor(input);
    }
    listRealtimeEvents(filter) {
        return this.adapter.listRealtimeEvents(filter);
    }
    pruneRealtimeEvents(filter) {
        return this.adapter.pruneRealtimeEvents(filter);
    }
    queueOutboundConversation(input) {
        return this.adapter.queueOutboundConversation({ ...input, conversation: requireConversationTenant(input.conversation) });
    }
    listLifecycleEvents(filter) {
        return this.adapter.listLifecycleEvents({ ...filter, tenantId: requireConversationTenantId(filter.tenantId) });
    }
}
async function savePrismaConversation(transaction, conversation) {
    const conversationData = toPrismaConversationUpsertData(conversation);
    await transaction.conversation.upsert({
        create: conversationData,
        update: conversationData,
        where: { id: conversation.id }
    });
    await appendPrismaConversationMessages(transaction, conversation);
    return clone(conversation);
}
async function appendPrismaConversationMessages(transaction, conversation) {
    const firstCreatedAt = new Date();
    const messages = conversation.messages.map((message, index) => toPrismaConversationMessageCreateInput(conversation.id, message, messageCreatedAtOrFallback(message.createdAt, new Date(firstCreatedAt.getTime() + index))));
    if (messages.length > 0) {
        await transaction.conversationMessage.createMany({ data: messages, skipDuplicates: true });
    }
}
async function appendPrismaRealtimeEvent(transaction, event) {
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
async function appendPrismaLifecycleEvent(transaction, event) {
    const row = await transaction.conversationLifecycleEvent.create({
        data: toPrismaConversationLifecycleEventCreateInput(event)
    });
    return toConversationLifecycleEvent(row);
}
async function recordPrismaOutboundDescriptor(transaction, descriptor, outbox) {
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
class PrismaConversationRepository {
    client;
    async enqueueOutboxEvent(event) {
        await this.client.outboxEvent.create({ data: toPrismaOutboxEventCreateInput(event) });
        return clone(event);
    }
    constructor(client) {
        this.client = client;
    }
    async listConversations(filter) {
        const rows = await this.client.conversation.findMany(conversationWithMessagesQuery(filter));
        return rows.map(toConversationRecord);
    }
    async listChannelCatalog() {
        return [];
    }
    async findConversation(conversationId) {
        const row = await this.client.conversation.findUnique({
            include: conversationMessagesInclude(),
            where: { id: conversationId }
        });
        return row ? toConversationRecord(row) : undefined;
    }
    saveConversation(conversation) {
        return this.client.$transaction((transaction) => savePrismaConversation(transaction, conversation));
    }
    saveConversationMutation(input) {
        return this.client.$transaction(async (transaction) => {
            const conversation = await savePrismaConversation(transaction, input.conversation);
            const lifecycleEvent = await appendPrismaLifecycleEvent(transaction, input.lifecycleEvent);
            const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
            return { conversation, lifecycleEvent, realtimeEvent };
        });
    }
    assignConversation(input) {
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
            await appendPrismaConversationMessages(transaction, input.conversation);
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
    async findInboundEvent(channel, eventId) {
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
    async findOutboundDescriptorByIdempotencyKey(idempotencyKey) {
        if (!idempotencyKey) {
            return undefined;
        }
        const row = await this.client.conversationOutboundDescriptor.findUnique({
            where: { idempotencyKey }
        });
        return row ? toConversationOutboundDescriptor(row) : undefined;
    }
    listDeliveryReceipts(filter = {}) {
        return createPrismaChannelDeliveryReceiptStore(this.client).listDeliveryReceipts(filter);
    }
    recordDeliveryReceipt(receipt) {
        return createPrismaChannelDeliveryReceiptStore(this.client).recordDeliveryReceipt(receipt);
    }
    async recordInboundEvent(event) {
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
        }
        catch (error) {
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
    async appendRealtimeEvent(event) {
        return appendPrismaRealtimeEvent(this.client, event);
    }
    async listRealtimeEvents(filter) {
        assertRealtimeEventScope(filter);
        const since = parseRealtimeSince(filter.since);
        const cursor = since ? undefined : realtimeEventCursor(filter.since);
        const ascending = Boolean(since || cursor);
        const query = {
            ...(cursor ? { cursor: { eventId: cursor }, skip: 1 } : {}),
            orderBy: [
                { occurredAt: ascending ? "asc" : "desc" },
                { eventId: ascending ? "asc" : "desc" }
            ],
            take: boundedTake(filter.take, 200, 500),
            ...((filter.tenantId || since) ? {
                where: {
                    ...(filter.tenantId ? { tenantId: requireConversationTenantId(filter.tenantId) } : {}),
                    ...(since ? { occurredAt: { gt: since } } : {})
                }
            } : {})
        };
        try {
            const rows = await this.client.conversationRealtimeEvent.findMany(query);
            const events = rows.map(toRealtimeEvent);
            return ascending ? events : events.reverse();
        }
        catch (error) {
            if (!cursor || !isPrismaCursorNotFoundError(error)) {
                throw error;
            }
            const rows = await this.client.conversationRealtimeEvent.findMany({
                orderBy: [{ occurredAt: "desc" }, { eventId: "desc" }],
                take: boundedTake(filter.take, 200, 500),
                ...(filter.tenantId ? { where: { tenantId: requireConversationTenantId(filter.tenantId) } } : {})
            });
            return rows.map(toRealtimeEvent).reverse();
        }
    }
    async pruneRealtimeEvents(filter) {
        const before = requireRetentionBoundary(filter.before);
        if (!this.client.conversationRealtimeEvent.deleteMany) {
            throw new Error("conversation_realtime_retention_delegate_required");
        }
        const result = await this.client.conversationRealtimeEvent.deleteMany({
            where: {
                occurredAt: { lt: before },
                ...(filter.tenantId ? { tenantId: requireConversationTenantId(filter.tenantId) } : {})
            }
        });
        return result.count;
    }
    async recordInboundMessage(input) {
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
    async listLifecycleEvents(filter) {
        const query = {
            ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
            orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
            take: lifecycleEventLimit(filter.limit),
            where: {
                tenantId: requireConversationTenantId(filter.tenantId),
                ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
                ...(filter.eventTypes?.length ? { eventType: { in: filter.eventTypes } } : {})
            }
        };
        try {
            const rows = await this.client.conversationLifecycleEvent.findMany(query);
            return rows.map(toConversationLifecycleEvent);
        }
        catch (error) {
            if (!filter.cursor || !isPrismaCursorNotFoundError(error)) {
                throw error;
            }
            const rows = await this.client.conversationLifecycleEvent.findMany({
                ...query,
                cursor: undefined,
                skip: undefined
            });
            return rows.map(toConversationLifecycleEvent);
        }
    }
    async queueOutboundMessageReply(input) {
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
        }
        catch (error) {
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
            }
            catch (mutationError) {
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
    async queueOutboundConversation(input) {
        try {
            return await this.client.$transaction(async (transaction) => {
                const conversation = await savePrismaConversation(transaction, input.conversation);
                const lifecycleEvent = await appendPrismaLifecycleEvent(transaction, input.lifecycleEvent);
                const realtimeEvent = await appendPrismaRealtimeEvent(transaction, input.realtimeEvent);
                const outbound = await recordPrismaOutboundDescriptor(transaction, input.descriptor, input.outbox);
                return { conversation, lifecycleEvent, realtimeEvent, ...outbound };
            });
        }
        catch (error) {
            const existing = await this.findExistingOutboundAfterUniqueError(error, input.descriptor.idempotencyKey);
            if (!existing)
                throw error;
            return {
                conversation: clone(input.conversation),
                descriptor: existing,
                lifecycleEvent: clone(input.lifecycleEvent),
                realtimeEvent: clone(input.realtimeEvent)
            };
        }
    }
    async recordOutboundDescriptor(input) {
        try {
            return await this.client.$transaction((transaction) => recordPrismaOutboundDescriptor(transaction, input.descriptor, input.outbox));
        }
        catch (error) {
            const existing = await this.findExistingOutboundAfterUniqueError(error, input.descriptor.idempotencyKey);
            if (!existing) {
                throw error;
            }
            return { descriptor: existing };
        }
    }
    async listOutboundDescriptors(filter = {}) {
        const rows = await this.client.conversationOutboundDescriptor.findMany({
            orderBy: { createdAt: "desc" },
            where: outboundDescriptorWhere(filter)
        });
        return rows.map(toConversationOutboundDescriptor);
    }
    async listOutboxEvents() {
        if (!this.client.outboxEvent.findMany) {
            return [];
        }
        const rows = await this.client.outboxEvent.findMany({ orderBy: { occurredAt: "asc" } });
        return rows.map(toOutboxEvent);
    }
    async findExistingOutboundAfterUniqueError(error, idempotencyKey) {
        if (!isUniqueConstraintError(error) || !idempotencyKey) {
            return undefined;
        }
        return this.findOutboundDescriptorByIdempotencyKey(idempotencyKey);
    }
}
function createDurableConversationRepository(store) {
    return {
        listConversations(filter) {
            const tenantId = requireConversationTenantId(filter?.tenantId);
            const messageTake = boundedTake(filter?.messageTake, 50, 200);
            const rows = store.read().conversations
                .filter((conversation) => conversation.tenantId === tenantId)
                .sort(compareConversationsForList);
            const cursorIndex = filter?.cursor ? rows.findIndex((conversation) => conversation.id === filter.cursor) : -1;
            const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
            return clone(rows.slice(start, start + boundedTake(filter?.take, 100, 500)).map((conversation) => ({
                ...conversation,
                messages: conversation.messages.slice(-messageTake)
            })));
        },
        listChannelCatalog() {
            return clone(store.read().channelCatalog ?? []);
        },
        listOutboundDescriptors(filter = {}) {
            return clone([...(store.read().outboundDescriptors ?? [])]
                .filter((descriptor) => outboundDescriptorMatches(descriptor, filter))
                .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()));
        },
        listOutboxEvents() {
            return clone(store.read().outboxEvents ?? []);
        },
        enqueueOutboxEvent(event) {
            store.update((state) => ({
                ...state,
                outboxEvents: (state.outboxEvents ?? []).some((item) => item.id === event.id)
                    ? state.outboxEvents ?? []
                    : [...(state.outboxEvents ?? []), clone(event)]
            }));
            return clone(event);
        },
        findConversation(conversationId) {
            return clone(store.read().conversations.find((conversation) => conversation.id === conversationId));
        },
        findOutboundDescriptorByIdempotencyKey(idempotencyKey) {
            if (!idempotencyKey) {
                return undefined;
            }
            return clone((store.read().outboundDescriptors ?? []).find((descriptor) => descriptor.idempotencyKey === idempotencyKey));
        },
        listDeliveryReceipts(filter = {}) {
            return clone([...(store.read().deliveryReceipts ?? [])]
                .filter((receipt) => deliveryReceiptMatches(receipt, filter))
                .sort((left, right) => {
                const receivedAtDelta = new Date(left.receivedAt).getTime() - new Date(right.receivedAt).getTime();
                return receivedAtDelta === 0 ? left.id.localeCompare(right.id) : receivedAtDelta;
            }));
        },
        recordDeliveryReceipt(receipt) {
            let persisted = null;
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
        saveConversation(conversation) {
            let persisted = null;
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
        saveConversationMutation(input) {
            let persisted = null;
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
                    realtimeEvents: realtimeEventsWithEvent(state.realtimeEvents ?? [], nextRealtimeEvent)
                };
            });
            if (!persisted)
                throw new Error(`Conversation mutation ${input.lifecycleEvent.id} was not persisted.`);
            return clone(persisted);
        },
        assignConversation(input) {
            let persisted = null;
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
                    realtimeEvents: realtimeEventsWithEvent(state.realtimeEvents ?? [], nextRealtimeEvent),
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
        queueOutboundMessageReply(input) {
            let persisted = null;
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
                const realtimeEvents = realtimeEventsWithEvent(state.realtimeEvents ?? [], nextRealtimeEvent);
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
        recordOutboundDescriptor(input) {
            let persisted = null;
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
        findInboundEvent(channel, eventId) {
            if (!channel || !eventId) {
                return undefined;
            }
            return clone(store.read().inboundEvents.find((event) => event.channel === channel && event.eventId === eventId));
        },
        recordInboundEvent(event) {
            let persisted = null;
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
        queueOutboundConversation(input) {
            let persisted = null;
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
            if (!persisted)
                throw new Error(`Outbound conversation ${input.descriptor.id} was not persisted.`);
            return clone(persisted);
        },
        recordInboundMessage(input) {
            let persisted = null;
            store.update((state) => {
                const existing = state.inboundEvents.find((event) => event.channel === input.inboundEvent.channel && event.eventId === input.inboundEvent.eventId);
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
                    realtimeEvents: realtimeEventsWithEvent(state.realtimeEvents ?? [], nextRealtimeEvent)
                };
            });
            if (!persisted)
                throw new Error(`Inbound message ${input.inboundEvent.channel}:${input.inboundEvent.eventId} was not persisted.`);
            return clone(persisted);
        },
        appendRealtimeEvent(event) {
            const nextEvent = clone(event);
            store.update((state) => ({
                ...state,
                realtimeEvents: realtimeEventsWithEvent(state.realtimeEvents, nextEvent)
            }));
            return clone(nextEvent);
        },
        listRealtimeEvents(filter) {
            assertRealtimeEventScope(filter);
            const since = parseRealtimeSince(filter.since);
            const cursor = since ? undefined : realtimeEventCursor(filter.since);
            const rows = (store.read().realtimeEvents ?? [])
                .filter((event) => !filter.tenantId || event.tenantId === filter.tenantId)
                .sort(compareRealtimeEventRows);
            const take = boundedTake(filter.take, 200, 500);
            if (since) {
                return clone(rows.filter((event) => new Date(event.occurredAt).getTime() > since.getTime()).slice(0, take));
            }
            if (cursor) {
                const cursorIndex = rows.findIndex((event) => event.eventId === cursor);
                return clone(cursorIndex >= 0 ? rows.slice(cursorIndex + 1, cursorIndex + 1 + take) : rows.slice(-take));
            }
            return clone(rows.slice(-take));
        },
        pruneRealtimeEvents(filter) {
            const before = requireRetentionBoundary(filter.before).getTime();
            let removed = 0;
            store.update((state) => ({
                ...state,
                realtimeEvents: (state.realtimeEvents ?? []).filter((event) => {
                    const expired = Date.parse(event.occurredAt) < before
                        && (!filter.tenantId || event.tenantId === filter.tenantId);
                    if (expired)
                        removed += 1;
                    return !expired;
                })
            }));
            return removed;
        },
        listLifecycleEvents(filter) {
            const rows = (store.read().lifecycleEvents ?? [])
                .filter((event) => event.tenantId === filter.tenantId)
                .filter((event) => !filter.conversationId || event.conversationId === filter.conversationId)
                .filter((event) => !filter.eventTypes?.length || filter.eventTypes.includes(event.eventType))
                .sort(compareLifecycleEvents);
            return clone(paginateLifecycleEvents(rows, filter));
        }
    };
}
function upsertConversationRows(conversations, conversation) {
    const exists = conversations.some((item) => item.id === conversation.id);
    return exists
        ? conversations.map((item) => item.id === conversation.id ? clone(conversation) : item)
        : [...conversations, clone(conversation)];
}
function recordOutboundDescriptorInState(state, descriptor, outbox) {
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
    const nextDescriptor = {
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
function findExistingOutboundDescriptor(state, descriptor) {
    return (state.outboundDescriptors ?? []).find((item) => {
        return item.id === descriptor.id
            || Boolean(descriptor.idempotencyKey && item.idempotencyKey === descriptor.idempotencyKey);
    });
}
function findOutboundDescriptorOutbox(state, descriptor) {
    return descriptor.outboxEventId
        ? (state.outboxEvents ?? []).find((event) => event.id === descriptor.outboxEventId)
        : undefined;
}
function outboundDescriptorMatches(descriptor, filter) {
    return (!filter.channel || descriptor.channel === filter.channel)
        && (!filter.conversationId || descriptor.conversationId === filter.conversationId)
        && (!filter.idempotencyKey || descriptor.idempotencyKey === filter.idempotencyKey)
        && (!filter.kind || descriptor.kind === filter.kind)
        && (!filter.status || descriptor.status === filter.status)
        && (!filter.tenantId || descriptor.tenantId === filter.tenantId);
}
function findExistingDeliveryReceipt(state, receipt) {
    return (state.deliveryReceipts ?? []).find((item) => {
        return item.id === receipt.id
            || Boolean(receipt.idempotencyKey && item.idempotencyKey === receipt.idempotencyKey)
            || (item.provider === receipt.provider && item.providerEventId === receipt.providerEventId);
    });
}
function deliveryReceiptMatches(receipt, filter) {
    return (!filter.channel || receipt.channel === filter.channel)
        && (!filter.messageId || receipt.messageId === filter.messageId)
        && (!filter.tenantId || receipt.tenantId === filter.tenantId);
}
function outboundDescriptorWhere(filter) {
    return Object.fromEntries(Object.entries({
        channel: filter.channel,
        conversationId: filter.conversationId,
        idempotencyKey: filter.idempotencyKey,
        kind: filter.kind,
        status: filter.status,
        tenantId: filter.tenantId
    }).filter((entry) => typeof entry[1] === "string" && entry[1].length > 0));
}
function conversationWithMessagesQuery(filter) {
    return {
        ...(filter?.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
        include: {
            messages: {
                orderBy: { createdAt: "desc" },
                take: boundedTake(filter?.messageTake, 50, 200)
            }
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: boundedTake(filter?.take, 100, 500),
        where: { tenantId: requireConversationTenantId(filter?.tenantId) }
    };
}
function conversationMessagesInclude() {
    return { messages: { orderBy: { createdAt: "asc" } } };
}
function toConversationRecord(row) {
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
        messages: (row.messages ?? [])
            .map(toConversationMessage)
            .sort((left, right) => Date.parse(String(left.createdAt ?? "")) - Date.parse(String(right.createdAt ?? ""))
            || String(left.id).localeCompare(String(right.id))),
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
function toConversationMessage(row) {
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
function toPrismaConversationUpsertData(conversation) {
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
function toPrismaConversationMessageCreateInput(conversationId, message, createdAt) {
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
function messageCreatedAtOrFallback(value, fallback) {
    if (!value) {
        return fallback;
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp) : fallback;
}
function toConversationInboundEvent(row) {
    return {
        channel: row.channel,
        conversationId: row.conversationId,
        eventId: row.eventId,
        messageId: row.messageId,
        receivedAt: toIso(row.receivedAt),
        traceId: row.traceId
    };
}
function toConversationOutboundDescriptor(row) {
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
function toPrismaConversationOutboundDescriptorCreateInput(descriptor) {
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
function toRealtimeEvent(row) {
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
function toPrismaOutboxEventCreateInput(event) {
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
function toOutboxEvent(row) {
    return {
        aggregateId: row.aggregateId,
        aggregateType: row.aggregateType,
        id: row.id,
        occurredAt: toIso(row.occurredAt),
        payload: toJsonRecord(row.payload),
        queue: row.queue,
        status: row.status,
        traceId: row.traceId,
        type: row.type
    };
}
function attachmentsFromJson(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    return value.filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}
function stringMatrixFromJson(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((row) => Array.isArray(row))
        .map((row) => row.filter((item) => typeof item === "string"));
}
function messageSideFromRow(side) {
    return side === "agent" || side === "client" ? side : undefined;
}
function messageTypeFromRow(type) {
    return type === "event" || type === "internal" || type === "csat_feedback" ? type : undefined;
}
function makePersistenceId(scope, ...parts) {
    return `${scope}_${parts.join("_")}`.replace(/[^a-z0-9._-]+/gi, "_");
}
function requireConversationTenantId(value) {
    const tenantId = String(value ?? "").trim();
    if (!tenantId) {
        throw new Error("conversation_tenant_id_required");
    }
    return tenantId;
}
function isUniqueConstraintError(error) {
    return error !== null
        && typeof error === "object"
        && "code" in error
        && error.code === "P2002";
}
function toJsonRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}
function toIso(value) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function parseLifecycleActorType(value) {
    if (value === "customer") {
        return "client";
    }
    if (value === "client" || value === "operator" || value === "service_admin" || value === "system" || value === "worker") {
        return value;
    }
    return "system";
}
function recordFromJson(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? { ...value }
        : undefined;
}
function appealMetadataFromJson(value) {
    const record = recordFromJson(value);
    if (!record) {
        return undefined;
    }
    const metadata = {};
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
    const csatFeedback = csatFeedbackStateFromJson(record.csatFeedback);
    if (csatFeedback) {
        metadata.csatFeedback = csatFeedback;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
}
function csatFeedbackStateFromJson(value) {
    const record = recordFromJson(value);
    if (!record) {
        return undefined;
    }
    const state = String(record.state ?? "").trim();
    if (state !== "awaiting" && state !== "received" && state !== "declined") {
        return undefined;
    }
    return {
        offeredAt: String(record.offeredAt ?? "").trim(),
        ratingId: String(record.ratingId ?? "").trim(),
        state
    };
}
function lifecycleEventIdentityMatches(left, right) {
    return left.tenantId === right.tenantId && left.source === right.source && left.sourceEventId === right.sourceEventId;
}
function lifecycleEventsWithEvent(events, event) {
    return events.some((item) => lifecycleEventIdentityMatches(item, event)) ? events : [...events, event];
}
function lifecycleRealtimeEventsWithEvent(events, event) {
    return realtimeEventsWithEvent(events, event);
}
function realtimeEventsWithEvent(events, event) {
    if (events.some((item) => item.eventId === event.eventId)) {
        return events.slice(-REALTIME_EVENT_BUFFER_LIMIT);
    }
    return [...events, event].slice(-REALTIME_EVENT_BUFFER_LIMIT);
}
function compareConversationsForList(left, right) {
    const updatedAt = Date.parse(String(right.updatedAt ?? "")) - Date.parse(String(left.updatedAt ?? ""));
    return updatedAt === 0 ? right.id.localeCompare(left.id) : updatedAt;
}
function compareRealtimeEventRows(left, right) {
    const occurredAt = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    return occurredAt === 0 ? left.eventId.localeCompare(right.eventId) : occurredAt;
}
function boundedTake(value, fallback, maximum) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.min(maximum, Math.trunc(parsed))) : fallback;
}
function requireRetentionBoundary(value) {
    const boundary = new Date(String(value ?? ""));
    if (Number.isNaN(boundary.getTime())) {
        throw new Error("conversation_realtime_retention_boundary_invalid");
    }
    return boundary;
}
function assertRealtimeEventScope(filter) {
    if (filter?.tenantId) {
        requireConversationTenantId(filter.tenantId);
        return;
    }
    if (filter?.allTenants === true) {
        return;
    }
    throw new Error("conversation_realtime_event_scope_required");
}
function parseRealtimeSince(value) {
    const cursor = String(value ?? "").trim();
    if (!cursor || !cursor.includes("-") || /^rt[_-]/i.test(cursor)) {
        return undefined;
    }
    const relative = /^now-(\d+)([smhd])$/.exec(cursor);
    if (relative) {
        const amount = Number(relative[1]);
        const unitMs = relative[2] === "s" ? 1_000 : relative[2] === "m" ? 60_000 : relative[2] === "h" ? 3_600_000 : 86_400_000;
        return new Date(Date.now() - amount * unitMs);
    }
    const parsed = new Date(cursor);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
function realtimeEventCursor(value) {
    const cursor = String(value ?? "").trim();
    return cursor && !parseRealtimeSince(cursor) ? cursor : undefined;
}
function isPrismaCursorNotFoundError(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2025");
}
function compareLifecycleEvents(left, right) {
    const occurred = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
    return occurred === 0 ? left.id.localeCompare(right.id) : occurred;
}
function paginateLifecycleEvents(rows, filter) {
    const cursorIndex = filter.cursor ? rows.findIndex((event) => event.id === filter.cursor) : -1;
    const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const limit = lifecycleEventLimit(filter.limit);
    return rows.slice(start, start + limit);
}
function lifecycleEventLimit(value) {
    return Math.max(1, Math.min(200, Number.isFinite(value) ? Number(value) : 50));
}
export function createEmptyConversationState() {
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
function toPrismaConversationLifecycleEventCreateInput(event) {
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
function toConversationLifecycleEvent(row) {
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
function requireConversationTenant(conversation) {
    return {
        ...conversation,
        tenantId: requireConversationTenantId(conversation.tenantId)
    };
}
function resolveNullableOperatorId(value) {
    return value ?? null;
}
function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
//# sourceMappingURL=conversation.repository.js.map