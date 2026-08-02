import { randomBytes } from "node:crypto";
import { InMemoryStore } from "@support-communication/database";
const EMPTY_STATE = {
    botConnections: [],
    chatChannels: [],
    conversationState: [],
    deliveries: [],
    webhookSubscriptions: []
};
const DELIVERY_JOURNAL_LIMIT = 2_000;
/** Fixed key for the single, workspace-global event-pump cursor row. */
const PUMP_CURSOR_ID = "default";
let defaultRepository = null;
export class OpenChannelRepository {
    store;
    prismaClient;
    constructor(store, prismaClient) {
        this.store = store;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (!defaultRepository) {
            defaultRepository = OpenChannelRepository.inMemory();
        }
        return defaultRepository;
    }
    static clearDefault() { defaultRepository = null; }
    static inMemory(seed = {}) {
        return new OpenChannelRepository(new InMemoryStore({ ...clone(EMPTY_STATE), ...clone(seed) }));
    }
    static prisma({ client }) {
        return new OpenChannelRepository(new InMemoryStore(clone(EMPTY_STATE)), client);
    }
    static useDefault(repository) { defaultRepository = repository; }
    // --- Chat API channels ---
    listChatChannels(tenantId) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.openChatChannel.findMany({
                orderBy: { createdAt: "asc" },
                ...(tenantId ? { where: { tenantId } } : {})
            })).then((rows) => rows.map(toChatChannelRecord));
        }
        return clone(this.state().chatChannels.filter((item) => !tenantId || item.tenantId === tenantId));
    }
    findChatChannelByToken(token) {
        const value = String(token ?? "").trim();
        if (!value)
            return undefined;
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.openChatChannel.findMany({ where: { token: value } }))
                .then((rows) => rows[0] ? toChatChannelRecord(rows[0]) : undefined);
        }
        const found = this.state().chatChannels.find((item) => item.token === value);
        return found ? clone(found) : undefined;
    }
    findChatChannel(tenantId, id) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.openChatChannel.findMany({ where: { id, tenantId } }))
                .then((rows) => rows[0] ? toChatChannelRecord(rows[0]) : undefined);
        }
        const found = this.state().chatChannels.find((item) => item.tenantId === tenantId && item.id === id);
        return found ? clone(found) : undefined;
    }
    saveChatChannel(record) {
        requireIdentity(record.tenantId, record.id, "open_chat_channel");
        if (this.prismaClient) {
            const create = toChatChannelCreateInput(record);
            const { id: _id, ...update } = create;
            return Promise.resolve(this.prismaClient.openChatChannel.upsert({ create, update, where: { id: record.id } }))
                .then(toChatChannelRecord);
        }
        this.store.update((state) => ({
            ...normalizeState(state),
            chatChannels: upsert(normalizeState(state).chatChannels, clone(record))
        }));
        return clone(record);
    }
    removeChatChannel(tenantId, id) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.openChatChannel.deleteMany({ where: { id, tenantId } }))
                .then((result) => result.count > 0);
        }
        return this.removeRecord("chatChannels", tenantId, id);
    }
    // --- Bot connections ---
    listBotConnections(tenantId) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.externalBotConnection.findMany({
                orderBy: { createdAt: "asc" },
                ...(tenantId ? { where: { tenantId } } : {})
            })).then((rows) => rows.map(toBotConnectionRecord));
        }
        return clone(this.state().botConnections.filter((item) => !tenantId || item.tenantId === tenantId));
    }
    findBotConnection(tenantId, id) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.externalBotConnection.findMany({ where: { id, tenantId } }))
                .then((rows) => rows[0] ? toBotConnectionRecord(rows[0]) : undefined);
        }
        const found = this.state().botConnections.find((item) => item.tenantId === tenantId && item.id === id);
        return found ? clone(found) : undefined;
    }
    findBotConnectionByIdAndToken(id, token) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.externalBotConnection.findMany({ where: { id, token } }))
                .then((rows) => rows[0] ? toBotConnectionRecord(rows[0]) : undefined);
        }
        const found = this.state().botConnections.find((item) => item.id === id && item.token === token);
        return found ? clone(found) : undefined;
    }
    findActiveBotConnectionForChannel(tenantId, channel) {
        const channelKey = String(channel ?? "").trim().toUpperCase();
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.externalBotConnection.findMany({ orderBy: { createdAt: "asc" }, where: { status: "active", tenantId } }))
                .then((rows) => rows.map(toBotConnectionRecord).find((item) => matchesChannel(item, channelKey)));
        }
        const found = this.state().botConnections.find((item) => item.tenantId === tenantId
            && item.status === "active"
            && (item.channels === null || item.channels.map((entry) => entry.toUpperCase()).includes(channelKey)));
        return found ? clone(found) : undefined;
    }
    saveBotConnection(record) {
        requireIdentity(record.tenantId, record.id, "external_bot_connection");
        if (this.prismaClient) {
            const create = toBotConnectionCreateInput(record);
            const { id: _id, ...update } = create;
            return Promise.resolve(this.prismaClient.externalBotConnection.upsert({ create, update, where: { id: record.id } }))
                .then(toBotConnectionRecord);
        }
        this.store.update((state) => ({
            ...normalizeState(state),
            botConnections: upsert(normalizeState(state).botConnections, clone(record))
        }));
        return clone(record);
    }
    removeBotConnection(tenantId, id) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.externalBotConnection.deleteMany({ where: { id, tenantId } }))
                .then((result) => result.count > 0);
        }
        return this.removeRecord("botConnections", tenantId, id);
    }
    // --- Webhook subscriptions ---
    listWebhookSubscriptions(tenantId) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.eventWebhookSubscription.findMany({
                orderBy: { createdAt: "asc" },
                ...(tenantId ? { where: { tenantId } } : {})
            })).then((rows) => rows.map(toWebhookSubscriptionRecord));
        }
        return clone(this.state().webhookSubscriptions.filter((item) => !tenantId || item.tenantId === tenantId));
    }
    listActiveWebhookSubscriptionsForEvent(tenantId, eventName) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.eventWebhookSubscription.findMany({ orderBy: { createdAt: "asc" }, where: { status: "active", tenantId } }))
                .then((rows) => rows.map(toWebhookSubscriptionRecord).filter((item) => item.events === null || item.events.includes(eventName)));
        }
        return clone(this.state().webhookSubscriptions.filter((item) => item.tenantId === tenantId
            && item.status === "active"
            && (item.events === null || item.events.includes(eventName))));
    }
    findWebhookSubscription(tenantId, id) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.eventWebhookSubscription.findMany({ where: { id, tenantId } }))
                .then((rows) => rows[0] ? toWebhookSubscriptionRecord(rows[0]) : undefined);
        }
        const found = this.state().webhookSubscriptions.find((item) => item.tenantId === tenantId && item.id === id);
        return found ? clone(found) : undefined;
    }
    saveWebhookSubscription(record) {
        requireIdentity(record.tenantId, record.id, "event_webhook_subscription");
        if (this.prismaClient) {
            const create = toWebhookSubscriptionCreateInput(record);
            const { id: _id, ...update } = create;
            return Promise.resolve(this.prismaClient.eventWebhookSubscription.upsert({ create, update, where: { id: record.id } }))
                .then(toWebhookSubscriptionRecord);
        }
        this.store.update((state) => ({
            ...normalizeState(state),
            webhookSubscriptions: upsert(normalizeState(state).webhookSubscriptions, clone(record))
        }));
        return clone(record);
    }
    removeWebhookSubscription(tenantId, id) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.eventWebhookSubscription.deleteMany({ where: { id, tenantId } }))
                .then((result) => result.count > 0);
        }
        return this.removeRecord("webhookSubscriptions", tenantId, id);
    }
    // --- Conversation state ---
    findConversationState(conversationId) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.openChannelConversationState.findMany({ where: { conversationId } }))
                .then((rows) => rows[0] ? toConversationStateRecord(rows[0]) : undefined);
        }
        const found = this.state().conversationState.find((item) => item.conversationId === conversationId);
        return found ? clone(found) : undefined;
    }
    listConversationStatesForTenant(tenantId) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.openChannelConversationState.findMany({ where: { tenantId } }))
                .then((rows) => rows.map(toConversationStateRecord));
        }
        return clone(this.state().conversationState.filter((item) => item.tenantId === tenantId));
    }
    mergeConversationState(input) {
        requireIdentity(input.tenantId, input.conversationId, "open_channel_conversation_state");
        if (this.prismaClient) {
            return this.mergeConversationStatePrisma(input);
        }
        let merged = null;
        this.store.update((state) => {
            const current = normalizeState(state);
            const existing = current.conversationState.find((item) => item.conversationId === input.conversationId);
            merged = {
                ...(existing ?? {}),
                ...clone(input),
                conversationId: input.conversationId,
                tenantId: input.tenantId,
                updatedAt: new Date().toISOString()
            };
            return {
                ...current,
                conversationState: [
                    ...current.conversationState.filter((item) => item.conversationId !== input.conversationId),
                    merged
                ]
            };
        });
        return clone(merged);
    }
    async mergeConversationStatePrisma(input) {
        const client = this.prismaClient;
        const rows = await Promise.resolve(client.openChannelConversationState.findMany({ where: { conversationId: input.conversationId } }));
        const existing = rows[0] ? toConversationStateRecord(rows[0]) : undefined;
        const merged = {
            ...(existing ?? {}),
            ...clone(input),
            conversationId: input.conversationId,
            tenantId: input.tenantId,
            updatedAt: new Date().toISOString()
        };
        const create = toConversationStateColumns(merged);
        const { conversationId: _cid, ...update } = create;
        const row = await Promise.resolve(client.openChannelConversationState.upsert({
            create,
            update,
            where: { conversationId: input.conversationId }
        }));
        return toConversationStateRecord(row);
    }
    // --- Delivery journal ---
    enqueueDelivery(input) {
        const now = new Date().toISOString();
        const record = {
            attempts: 0,
            body: clone(input.body),
            ...(input.conversationId ? { conversationId: input.conversationId } : {}),
            createdAt: now,
            eventName: input.eventName,
            id: input.id ?? `ocd_${randomBytes(9).toString("hex")}`,
            kind: input.kind,
            maxAttempts: input.maxAttempts,
            nextAttemptAt: input.nextAttemptAt ?? now,
            retryBackoffMs: input.retryBackoffMs,
            status: "pending",
            tenantId: input.tenantId,
            updatedAt: now,
            url: input.url
        };
        if (this.prismaClient) {
            // The journal cap is a JSON-store memory guard; Postgres keeps the full trail.
            return Promise.resolve(this.prismaClient.openChannelDelivery.create({ data: toDeliveryCreateInput(record) }))
                .then(toDeliveryRecord);
        }
        this.store.update((state) => {
            const current = normalizeState(state);
            return { ...current, deliveries: [...current.deliveries, record].slice(-DELIVERY_JOURNAL_LIMIT) };
        });
        return clone(record);
    }
    listDeliveries(filter = {}) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.openChannelDelivery.findMany({
                orderBy: { createdAt: "asc" },
                where: {
                    ...(filter.tenantId ? { tenantId: filter.tenantId } : {}),
                    ...(filter.kind ? { kind: filter.kind } : {}),
                    ...(filter.status ? { status: filter.status } : {})
                }
            })).then((rows) => rows.map(toDeliveryRecord));
        }
        return clone(this.state().deliveries.filter((item) => (!filter.tenantId || item.tenantId === filter.tenantId)
            && (!filter.kind || item.kind === filter.kind)
            && (!filter.status || item.status === filter.status)));
    }
    claimDueDeliveries(now, limit = 20) {
        if (this.prismaClient) {
            return this.claimDueDeliveriesPrisma(now, limit);
        }
        const due = [];
        this.store.update((state) => {
            const current = normalizeState(state);
            const deliveries = current.deliveries.map((item) => {
                if (due.length >= limit || !["pending", "in_flight"].includes(item.status) || item.nextAttemptAt > now)
                    return item;
                const claimed = {
                    ...item,
                    attempts: item.attempts + 1,
                    nextAttemptAt: deliveryLeaseUntil(now),
                    status: "in_flight",
                    updatedAt: now
                };
                due.push(clone(claimed));
                return claimed;
            });
            return { ...current, deliveries };
        });
        return due;
    }
    async claimDueDeliveriesPrisma(now, limit) {
        const client = this.prismaClient;
        const rows = await Promise.resolve(client.openChannelDelivery.findMany({
            orderBy: { createdAt: "asc" },
            take: limit,
            where: { nextAttemptAt: { lte: now }, status: { in: ["pending", "in_flight"] } }
        }));
        const claimed = [];
        for (const row of rows) {
            const current = toDeliveryRecord(row);
            const data = {
                attempts: current.attempts + 1,
                nextAttemptAt: deliveryLeaseUntil(now),
                status: "in_flight",
                updatedAt: now
            };
            const updated = await Promise.resolve(client.openChannelDelivery.updateMany({
                data,
                where: {
                    attempts: current.attempts,
                    id: current.id,
                    nextAttemptAt: { lte: now },
                    status: current.status
                }
            }));
            if (updated.count === 1) {
                claimed.push(toDeliveryRecord({ ...row, ...data }));
            }
        }
        return claimed;
    }
    resolveDelivery(id, outcome, claimToken) {
        if (this.prismaClient) {
            return this.resolveDeliveryPrisma(id, outcome, claimToken);
        }
        let resolved;
        this.store.update((state) => {
            const current = normalizeState(state);
            const deliveries = current.deliveries.map((item) => {
                if (item.id !== id || (claimToken && (item.status !== "in_flight" || item.updatedAt !== claimToken)))
                    return item;
                const nextAttemptAt = outcome.status === "pending"
                    ? new Date(Date.parse(item.updatedAt) + item.retryBackoffMs * Math.max(1, item.attempts)).toISOString()
                    : item.nextAttemptAt;
                resolved = {
                    ...item,
                    ...(outcome.error ? { lastError: outcome.error.slice(0, 500) } : {}),
                    ...(outcome.responseBody !== undefined ? { lastResponseBody: outcome.responseBody.slice(0, 2_000) } : {}),
                    ...(outcome.statusCode !== undefined ? { lastStatusCode: outcome.statusCode } : {}),
                    nextAttemptAt,
                    status: outcome.status,
                    updatedAt: new Date().toISOString()
                };
                return resolved;
            });
            return { ...current, deliveries };
        });
        return resolved ? clone(resolved) : undefined;
    }
    async resolveDeliveryPrisma(id, outcome, claimToken) {
        const client = this.prismaClient;
        const rows = await Promise.resolve(client.openChannelDelivery.findMany({ where: { id } }));
        const current = rows[0] ? toDeliveryRecord(rows[0]) : undefined;
        if (!current)
            return undefined;
        const nextAttemptAt = outcome.status === "pending"
            ? new Date(Date.parse(current.updatedAt) + current.retryBackoffMs * Math.max(1, current.attempts)).toISOString()
            : current.nextAttemptAt;
        const data = {
            ...(outcome.error ? { lastError: outcome.error.slice(0, 500) } : {}),
            ...(outcome.responseBody !== undefined ? { lastResponseBody: outcome.responseBody.slice(0, 2_000) } : {}),
            ...(outcome.statusCode !== undefined ? { lastStatusCode: outcome.statusCode } : {}),
            nextAttemptAt,
            status: outcome.status,
            updatedAt: new Date().toISOString()
        };
        if (claimToken) {
            const updated = await Promise.resolve(client.openChannelDelivery.updateMany({
                data,
                where: { id, status: "in_flight", updatedAt: claimToken }
            }));
            if (updated.count !== 1)
                return undefined;
            return toDeliveryRecord({ ...rows[0], ...data });
        }
        return toDeliveryRecord(await Promise.resolve(client.openChannelDelivery.update({ data, where: { id } })));
    }
    // --- Event pump cursor ---
    readPumpCursor() {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.openChannelPumpCursor.findMany({}))
                .then((rows) => rows[0] ? toPumpCursor(rows[0]) : { lastOccurredAt: "", seenEventIds: [] });
        }
        const cursor = this.state().pumpCursor;
        return cursor ? clone(cursor) : { lastOccurredAt: "", seenEventIds: [] };
    }
    savePumpCursor(cursor) {
        if (this.prismaClient) {
            const columns = {
                id: PUMP_CURSOR_ID,
                lastOccurredAt: cursor.lastOccurredAt,
                seenEventIds: cursor.seenEventIds.slice(-500)
            };
            const { id: _id, ...update } = columns;
            return Promise.resolve(this.prismaClient.openChannelPumpCursor.upsert({ create: columns, update, where: { id: PUMP_CURSOR_ID } }))
                .then(() => undefined);
        }
        this.store.update((state) => ({
            ...normalizeState(state),
            pumpCursor: { lastOccurredAt: cursor.lastOccurredAt, seenEventIds: cursor.seenEventIds.slice(-500) }
        }));
    }
    state() {
        return normalizeState(this.store.read());
    }
    removeRecord(collection, tenantId, id) {
        let removed = false;
        this.store.update((state) => {
            const current = normalizeState(state);
            const rows = current[collection].filter((item) => {
                const matches = item.tenantId === tenantId && item.id === id;
                removed ||= matches;
                return !matches;
            });
            return { ...current, [collection]: rows };
        });
        return removed;
    }
}
function deliveryLeaseUntil(now) {
    return new Date(Date.parse(now) + 60_000).toISOString();
}
export function createOpenChannelToken(prefix) {
    return `${prefix}_${randomBytes(18).toString("base64url")}`;
}
function upsert(rows, record) {
    const exists = rows.some((item) => item.tenantId === record.tenantId && item.id === record.id);
    return exists
        ? rows.map((item) => item.tenantId === record.tenantId && item.id === record.id ? record : item)
        : [...rows, record];
}
function requireIdentity(tenantId, id, code) {
    if (!String(tenantId ?? "").trim() || !String(id ?? "").trim()) {
        throw new Error(`${code}_identity_required`);
    }
}
function normalizeState(input) {
    return {
        botConnections: input?.botConnections ?? [],
        chatChannels: input?.chatChannels ?? [],
        conversationState: input?.conversationState ?? [],
        deliveries: input?.deliveries ?? [],
        ...(input?.pumpCursor ? { pumpCursor: input.pumpCursor } : {}),
        webhookSubscriptions: input?.webhookSubscriptions ?? []
    };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
// --- Prisma row <-> record mapping ---------------------------------------
function toIso(value) {
    return value instanceof Date ? value.toISOString() : String(value);
}
function matchesChannel(connection, channelKey) {
    return connection.channels === null || connection.channels.map((entry) => entry.toUpperCase()).includes(channelKey);
}
function toChatChannelRecord(row) {
    return {
        createdAt: toIso(row.createdAt),
        id: row.id,
        name: row.name,
        outboundUrl: row.outboundUrl,
        ...(row.routingQueueId ? { routingQueueId: row.routingQueueId } : {}),
        status: row.status,
        tenantId: row.tenantId,
        token: row.token,
        updatedAt: toIso(row.updatedAt)
    };
}
function toChatChannelCreateInput(record) {
    return {
        createdAt: record.createdAt,
        id: record.id,
        name: record.name,
        outboundUrl: record.outboundUrl,
        routingQueueId: record.routingQueueId ?? null,
        status: record.status,
        tenantId: record.tenantId,
        token: record.token,
        updatedAt: record.updatedAt
    };
}
function toBotConnectionRecord(row) {
    return {
        channels: row.channelsAll ? null : [...(Array.isArray(row.channels) ? row.channels : [])],
        createdAt: toIso(row.createdAt),
        id: row.id,
        name: row.name,
        providerUrl: row.providerUrl,
        status: row.status,
        tenantId: row.tenantId,
        token: row.token,
        updatedAt: toIso(row.updatedAt)
    };
}
function toBotConnectionCreateInput(record) {
    return {
        channels: record.channels === null ? [] : [...record.channels],
        channelsAll: record.channels === null,
        createdAt: record.createdAt,
        id: record.id,
        name: record.name,
        providerUrl: record.providerUrl,
        status: record.status,
        tenantId: record.tenantId,
        token: record.token,
        updatedAt: record.updatedAt
    };
}
function toWebhookSubscriptionRecord(row) {
    return {
        createdAt: toIso(row.createdAt),
        events: row.eventsAll ? null : [...(Array.isArray(row.events) ? row.events : [])],
        id: row.id,
        status: row.status,
        tenantId: row.tenantId,
        updatedAt: toIso(row.updatedAt),
        url: row.url
    };
}
function toWebhookSubscriptionCreateInput(record) {
    return {
        createdAt: record.createdAt,
        events: record.events === null ? [] : [...record.events],
        eventsAll: record.events === null,
        id: record.id,
        status: record.status,
        tenantId: record.tenantId,
        updatedAt: record.updatedAt,
        url: record.url
    };
}
function toConversationStateRecord(row) {
    return {
        conversationId: row.conversationId,
        tenantId: row.tenantId,
        updatedAt: toIso(row.updatedAt),
        ...(row.attributes != null ? { attributes: clone(row.attributes) } : {}),
        ...(row.botState ? { botState: row.botState } : {}),
        ...(row.chatChannelId ? { chatChannelId: row.chatChannelId } : {}),
        ...(row.clientId ? { clientId: row.clientId } : {}),
        ...(row.customData != null ? { customData: clone(row.customData) } : {}),
        ...(row.lastDeliveredAgentMessageId ? { lastDeliveredAgentMessageId: row.lastDeliveredAgentMessageId } : {}),
        ...(row.rateRequested != null ? { rateRequested: row.rateRequested } : {}),
        ...(row.userToken ? { userToken: row.userToken } : {})
    };
}
function toConversationStateColumns(record) {
    return {
        conversationId: record.conversationId,
        tenantId: record.tenantId,
        updatedAt: record.updatedAt,
        ...(record.attributes !== undefined ? { attributes: clone(record.attributes) } : {}),
        ...(record.botState !== undefined ? { botState: record.botState } : {}),
        ...(record.chatChannelId !== undefined ? { chatChannelId: record.chatChannelId } : {}),
        ...(record.clientId !== undefined ? { clientId: record.clientId } : {}),
        ...(record.customData !== undefined ? { customData: clone(record.customData) } : {}),
        ...(record.lastDeliveredAgentMessageId !== undefined ? { lastDeliveredAgentMessageId: record.lastDeliveredAgentMessageId } : {}),
        ...(record.rateRequested !== undefined ? { rateRequested: record.rateRequested } : {}),
        ...(record.userToken !== undefined ? { userToken: record.userToken } : {})
    };
}
function toDeliveryRecord(row) {
    return {
        attempts: row.attempts,
        body: clone(row.body),
        ...(row.conversationId ? { conversationId: row.conversationId } : {}),
        createdAt: toIso(row.createdAt),
        eventName: row.eventName,
        id: row.id,
        kind: row.kind,
        ...(row.lastError != null ? { lastError: row.lastError } : {}),
        ...(row.lastResponseBody != null ? { lastResponseBody: row.lastResponseBody } : {}),
        ...(row.lastStatusCode != null ? { lastStatusCode: row.lastStatusCode } : {}),
        maxAttempts: row.maxAttempts,
        nextAttemptAt: toIso(row.nextAttemptAt),
        retryBackoffMs: row.retryBackoffMs,
        status: row.status,
        tenantId: row.tenantId,
        updatedAt: toIso(row.updatedAt),
        url: row.url
    };
}
function toDeliveryCreateInput(record) {
    return {
        attempts: record.attempts,
        body: clone(record.body),
        conversationId: record.conversationId ?? null,
        createdAt: record.createdAt,
        eventName: record.eventName,
        id: record.id,
        kind: record.kind,
        lastError: record.lastError ?? null,
        lastResponseBody: record.lastResponseBody ?? null,
        lastStatusCode: record.lastStatusCode ?? null,
        maxAttempts: record.maxAttempts,
        nextAttemptAt: record.nextAttemptAt,
        retryBackoffMs: record.retryBackoffMs,
        status: record.status,
        tenantId: record.tenantId,
        updatedAt: record.updatedAt,
        url: record.url
    };
}
function toPumpCursor(row) {
    return {
        lastOccurredAt: String(row.lastOccurredAt ?? ""),
        seenEventIds: Array.isArray(row.seenEventIds) ? [...row.seenEventIds] : []
    };
}
//# sourceMappingURL=open-channel.repository.js.map