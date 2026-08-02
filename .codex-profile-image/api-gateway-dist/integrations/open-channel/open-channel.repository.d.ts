/**
 * External integration layer storage: Open Channel chat channels,
 * bot-provider connections, event webhook subscriptions, per-conversation
 * client state and the outbound delivery journal.
 *
 * The layer runs on either a single JSON store (self-contained, keeps the
 * rest of the platform untouched while the surface is idle) or Prisma
 * (production-like runtime). The store choice is made in `bootstrap.ts` via
 * the `OPEN_CHANNEL_REPOSITORY` env, mirroring the other domain repositories;
 * read/write methods return `MaybePromise` so both branches share one API.
 */
export type OpenChannelRecordStatus = "active" | "disabled";
export interface OpenChatChannelRecord {
    createdAt: string;
    id: string;
    name: string;
    /** Customer server URL that receives events from us (may be empty until configured). */
    outboundUrl: string;
    routingQueueId?: string;
    status: OpenChannelRecordStatus;
    tenantId: string;
    /** Channel token — the path segment of the inbound URL. */
    token: string;
    updatedAt: string;
}
export interface ExternalBotConnectionRecord {
    /** Channel types the bot serves (upper-case, e.g. ["SDK", "CHATAPI"]); null = all channels. */
    channels: string[] | null;
    createdAt: string;
    id: string;
    name: string;
    /** Bot provider endpoint; events are POSTed to `${providerUrl}/${token}`. */
    providerUrl: string;
    status: OpenChannelRecordStatus;
    tenantId: string;
    /** Bot provider token; also authenticates provider → us calls. */
    token: string;
    updatedAt: string;
}
export interface EventWebhookSubscriptionRecord {
    createdAt: string;
    /** Event names (chat_accepted, chat_finished, ...); null = all supported events. */
    events: string[] | null;
    id: string;
    status: OpenChannelRecordStatus;
    tenantId: string;
    url: string;
    updatedAt: string;
}
export interface OpenChannelConversationStateRecord {
    attributes?: Record<string, unknown>;
    /** External bot dialog state: bot handles the dialog until an agent joins or the chat closes. */
    botState?: "active" | "closed";
    /** Chat API channel the conversation belongs to (channel token), if any. */
    chatChannelId?: string;
    /** Client id used by the external system (Chat API sender.id / SDK externalId). */
    clientId?: string;
    conversationId: string;
    customData?: Array<Record<string, unknown>>;
    /** Last delivered agent-side message id (Chat API outbound cursor). */
    lastDeliveredAgentMessageId?: string;
    rateRequested?: boolean;
    tenantId: string;
    updatedAt: string;
    /** Value from sw_api.setUserToken — echoed into every webhook payload. */
    userToken?: string;
}
export type OpenChannelDeliveryKind = "bot_event" | "chat_event" | "webhook";
export interface OpenChannelDeliveryRecord {
    attempts: number;
    body: Record<string, unknown>;
    conversationId?: string;
    createdAt: string;
    eventName: string;
    id: string;
    kind: OpenChannelDeliveryKind;
    lastError?: string;
    lastResponseBody?: string;
    lastStatusCode?: number;
    maxAttempts: number;
    nextAttemptAt: string;
    retryBackoffMs: number;
    status: "dead_lettered" | "delivered" | "in_flight" | "pending";
    tenantId: string;
    updatedAt: string;
    url: string;
}
export interface OpenChannelPumpCursor {
    lastOccurredAt: string;
    seenEventIds: string[];
}
interface OpenChannelState {
    botConnections: ExternalBotConnectionRecord[];
    chatChannels: OpenChatChannelRecord[];
    conversationState: OpenChannelConversationStateRecord[];
    deliveries: OpenChannelDeliveryRecord[];
    pumpCursor?: OpenChannelPumpCursor;
    webhookSubscriptions: EventWebhookSubscriptionRecord[];
}
type MaybePromise<T> = T | Promise<T>;
type PrismaTimestamp = Date | string;
type PrismaOrderBy = {
    createdAt?: "asc" | "desc";
    updatedAt?: "asc" | "desc";
};
export interface PrismaOpenChannelClient {
    openChatChannel: {
        findMany(input: {
            orderBy?: PrismaOrderBy;
            where?: PrismaChatChannelWhere;
        }): MaybePromise<PrismaChatChannelRow[]>;
        upsert(input: {
            create: PrismaChatChannelCreateInput;
            update: PrismaChatChannelUpdateInput;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaChatChannelRow>;
        deleteMany(input: {
            where: {
                id: string;
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
    };
    externalBotConnection: {
        findMany(input: {
            orderBy?: PrismaOrderBy;
            where?: PrismaBotConnectionWhere;
        }): MaybePromise<PrismaBotConnectionRow[]>;
        upsert(input: {
            create: PrismaBotConnectionCreateInput;
            update: PrismaBotConnectionUpdateInput;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaBotConnectionRow>;
        deleteMany(input: {
            where: {
                id: string;
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
    };
    eventWebhookSubscription: {
        findMany(input: {
            orderBy?: PrismaOrderBy;
            where?: PrismaWebhookSubscriptionWhere;
        }): MaybePromise<PrismaWebhookSubscriptionRow[]>;
        upsert(input: {
            create: PrismaWebhookSubscriptionCreateInput;
            update: PrismaWebhookSubscriptionUpdateInput;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaWebhookSubscriptionRow>;
        deleteMany(input: {
            where: {
                id: string;
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
    };
    openChannelConversationState: {
        findMany(input: {
            where?: PrismaConversationStateWhere;
        }): MaybePromise<PrismaConversationStateRow[]>;
        upsert(input: {
            create: PrismaConversationStateColumns;
            update: Partial<PrismaConversationStateColumns>;
            where: {
                conversationId: string;
            };
        }): MaybePromise<PrismaConversationStateRow>;
    };
    openChannelDelivery: {
        create(input: {
            data: PrismaDeliveryCreateInput;
        }): MaybePromise<PrismaDeliveryRow>;
        findMany(input: {
            orderBy?: PrismaOrderBy;
            take?: number;
            where?: PrismaDeliveryWhere;
        }): MaybePromise<PrismaDeliveryRow[]>;
        update(input: {
            data: PrismaDeliveryUpdateInput;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaDeliveryRow>;
        updateMany(input: {
            data: PrismaDeliveryUpdateInput;
            where: PrismaDeliveryWhere & {
                id: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
    };
    openChannelPumpCursor: {
        findMany(input: Record<string, never>): MaybePromise<PrismaPumpCursorRow[]>;
        upsert(input: {
            create: PrismaPumpCursorColumns;
            update: Partial<PrismaPumpCursorColumns>;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaPumpCursorRow>;
    };
}
interface PrismaChatChannelWhere {
    id?: string;
    tenantId?: string;
    token?: string;
}
interface PrismaChatChannelCreateInput {
    createdAt: string;
    id: string;
    name: string;
    outboundUrl: string;
    routingQueueId: string | null;
    status: string;
    tenantId: string;
    token: string;
    updatedAt: string;
}
type PrismaChatChannelUpdateInput = Omit<PrismaChatChannelCreateInput, "id">;
interface PrismaChatChannelRow {
    createdAt: PrismaTimestamp;
    id: string;
    name: string;
    outboundUrl: string;
    routingQueueId: string | null;
    status: string;
    tenantId: string;
    token: string;
    updatedAt: PrismaTimestamp;
}
interface PrismaBotConnectionWhere {
    id?: string;
    status?: string;
    tenantId?: string;
    token?: string;
}
interface PrismaBotConnectionCreateInput {
    channels: string[];
    channelsAll: boolean;
    createdAt: string;
    id: string;
    name: string;
    providerUrl: string;
    status: string;
    tenantId: string;
    token: string;
    updatedAt: string;
}
type PrismaBotConnectionUpdateInput = Omit<PrismaBotConnectionCreateInput, "id">;
interface PrismaBotConnectionRow {
    channels: string[];
    channelsAll: boolean;
    createdAt: PrismaTimestamp;
    id: string;
    name: string;
    providerUrl: string;
    status: string;
    tenantId: string;
    token: string;
    updatedAt: PrismaTimestamp;
}
interface PrismaWebhookSubscriptionWhere {
    id?: string;
    status?: string;
    tenantId?: string;
}
interface PrismaWebhookSubscriptionCreateInput {
    createdAt: string;
    events: string[];
    eventsAll: boolean;
    id: string;
    status: string;
    tenantId: string;
    updatedAt: string;
    url: string;
}
type PrismaWebhookSubscriptionUpdateInput = Omit<PrismaWebhookSubscriptionCreateInput, "id">;
interface PrismaWebhookSubscriptionRow {
    createdAt: PrismaTimestamp;
    events: string[];
    eventsAll: boolean;
    id: string;
    status: string;
    tenantId: string;
    updatedAt: PrismaTimestamp;
    url: string;
}
interface PrismaConversationStateWhere {
    conversationId?: string;
    tenantId?: string;
}
interface PrismaConversationStateColumns {
    attributes?: Record<string, unknown>;
    botState?: string | null;
    chatChannelId?: string | null;
    clientId?: string | null;
    conversationId: string;
    customData?: Array<Record<string, unknown>>;
    lastDeliveredAgentMessageId?: string | null;
    rateRequested?: boolean | null;
    tenantId: string;
    updatedAt: string;
    userToken?: string | null;
}
interface PrismaConversationStateRow {
    attributes: Record<string, unknown> | null;
    botState: string | null;
    chatChannelId: string | null;
    clientId: string | null;
    conversationId: string;
    customData: Array<Record<string, unknown>> | null;
    lastDeliveredAgentMessageId: string | null;
    rateRequested: boolean | null;
    tenantId: string;
    updatedAt: PrismaTimestamp;
    userToken: string | null;
}
interface PrismaDeliveryWhere {
    attempts?: number;
    id?: string;
    kind?: OpenChannelDeliveryKind;
    nextAttemptAt?: {
        lte: string;
    };
    status?: OpenChannelDeliveryRecord["status"] | {
        in: OpenChannelDeliveryRecord["status"][];
    };
    tenantId?: string;
    updatedAt?: string;
}
interface PrismaDeliveryCreateInput {
    attempts: number;
    body: Record<string, unknown>;
    conversationId: string | null;
    createdAt: string;
    eventName: string;
    id: string;
    kind: OpenChannelDeliveryKind;
    lastError: string | null;
    lastResponseBody: string | null;
    lastStatusCode: number | null;
    maxAttempts: number;
    nextAttemptAt: string;
    retryBackoffMs: number;
    status: OpenChannelDeliveryRecord["status"];
    tenantId: string;
    updatedAt: string;
    url: string;
}
interface PrismaDeliveryUpdateInput {
    attempts?: number;
    lastError?: string;
    lastResponseBody?: string;
    lastStatusCode?: number;
    nextAttemptAt?: string;
    status?: OpenChannelDeliveryRecord["status"];
    updatedAt?: string;
}
interface PrismaDeliveryRow {
    attempts: number;
    body: Record<string, unknown>;
    conversationId: string | null;
    createdAt: PrismaTimestamp;
    eventName: string;
    id: string;
    kind: OpenChannelDeliveryKind;
    lastError: string | null;
    lastResponseBody: string | null;
    lastStatusCode: number | null;
    maxAttempts: number;
    nextAttemptAt: PrismaTimestamp;
    retryBackoffMs: number;
    status: OpenChannelDeliveryRecord["status"];
    tenantId: string;
    updatedAt: PrismaTimestamp;
    url: string;
}
interface PrismaPumpCursorColumns {
    id: string;
    lastOccurredAt: string;
    seenEventIds: string[];
}
interface PrismaPumpCursorRow {
    id: string;
    lastOccurredAt: string;
    seenEventIds: unknown;
    updatedAt?: PrismaTimestamp;
}
export interface PrismaOpenChannelRepositoryOptions {
    client: PrismaOpenChannelClient;
}
export declare class OpenChannelRepository {
    private readonly store;
    private readonly prismaClient?;
    private constructor();
    static default(): OpenChannelRepository;
    static clearDefault(): void;
    static inMemory(seed?: Partial<OpenChannelState>): OpenChannelRepository;
    static prisma({ client }: PrismaOpenChannelRepositoryOptions): OpenChannelRepository;
    static useDefault(repository: OpenChannelRepository): void;
    listChatChannels(tenantId?: string): MaybePromise<OpenChatChannelRecord[]>;
    findChatChannelByToken(token: string): MaybePromise<OpenChatChannelRecord | undefined>;
    findChatChannel(tenantId: string, id: string): MaybePromise<OpenChatChannelRecord | undefined>;
    saveChatChannel(record: OpenChatChannelRecord): MaybePromise<OpenChatChannelRecord>;
    removeChatChannel(tenantId: string, id: string): MaybePromise<boolean>;
    listBotConnections(tenantId?: string): MaybePromise<ExternalBotConnectionRecord[]>;
    findBotConnection(tenantId: string, id: string): MaybePromise<ExternalBotConnectionRecord | undefined>;
    findBotConnectionByIdAndToken(id: string, token: string): MaybePromise<ExternalBotConnectionRecord | undefined>;
    findActiveBotConnectionForChannel(tenantId: string, channel: string): MaybePromise<ExternalBotConnectionRecord | undefined>;
    saveBotConnection(record: ExternalBotConnectionRecord): MaybePromise<ExternalBotConnectionRecord>;
    removeBotConnection(tenantId: string, id: string): MaybePromise<boolean>;
    listWebhookSubscriptions(tenantId?: string): MaybePromise<EventWebhookSubscriptionRecord[]>;
    listActiveWebhookSubscriptionsForEvent(tenantId: string, eventName: string): MaybePromise<EventWebhookSubscriptionRecord[]>;
    findWebhookSubscription(tenantId: string, id: string): MaybePromise<EventWebhookSubscriptionRecord | undefined>;
    saveWebhookSubscription(record: EventWebhookSubscriptionRecord): MaybePromise<EventWebhookSubscriptionRecord>;
    removeWebhookSubscription(tenantId: string, id: string): MaybePromise<boolean>;
    findConversationState(conversationId: string): MaybePromise<OpenChannelConversationStateRecord | undefined>;
    listConversationStatesForTenant(tenantId: string): MaybePromise<OpenChannelConversationStateRecord[]>;
    mergeConversationState(input: Partial<OpenChannelConversationStateRecord> & {
        conversationId: string;
        tenantId: string;
    }): MaybePromise<OpenChannelConversationStateRecord>;
    private mergeConversationStatePrisma;
    enqueueDelivery(input: Omit<OpenChannelDeliveryRecord, "attempts" | "createdAt" | "id" | "nextAttemptAt" | "status" | "updatedAt"> & {
        id?: string;
        nextAttemptAt?: string;
    }): MaybePromise<OpenChannelDeliveryRecord>;
    listDeliveries(filter?: {
        kind?: OpenChannelDeliveryKind;
        status?: OpenChannelDeliveryRecord["status"];
        tenantId?: string;
    }): MaybePromise<OpenChannelDeliveryRecord[]>;
    claimDueDeliveries(now: string, limit?: number): MaybePromise<OpenChannelDeliveryRecord[]>;
    private claimDueDeliveriesPrisma;
    resolveDelivery(id: string, outcome: {
        error?: string;
        responseBody?: string;
        status: "dead_lettered" | "delivered" | "pending";
        statusCode?: number;
    }, claimToken?: string): MaybePromise<OpenChannelDeliveryRecord | undefined>;
    private resolveDeliveryPrisma;
    readPumpCursor(): MaybePromise<OpenChannelPumpCursor>;
    savePumpCursor(cursor: OpenChannelPumpCursor): MaybePromise<void>;
    private state;
    private removeRecord;
}
export declare function createOpenChannelToken(prefix: string): string;
export {};
