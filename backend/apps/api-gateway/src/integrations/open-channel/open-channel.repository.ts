import { randomBytes } from "node:crypto";
import { type DurableStore, InMemoryStore } from "@support-communication/database";

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
  status: "dead_lettered" | "delivered" | "pending";
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

const EMPTY_STATE: OpenChannelState = {
  botConnections: [],
  chatChannels: [],
  conversationState: [],
  deliveries: [],
  webhookSubscriptions: []
};

const DELIVERY_JOURNAL_LIMIT = 2_000;

/** Fixed key for the single, workspace-global event-pump cursor row. */
const PUMP_CURSOR_ID = "default";

type MaybePromise<T> = T | Promise<T>;

// --- Prisma client (thin interface) --------------------------------------
// A minimal structural interface over the Prisma delegates this repository
// touches. The real PrismaClient is cast to it in `bootstrap.ts`; the
// contract tests supply an in-memory Map-backed mock. Timestamps flow as ISO
// strings into writes (Prisma coerces) and come back as Date or string.

type PrismaTimestamp = Date | string;
type PrismaOrderBy = { createdAt?: "asc" | "desc"; updatedAt?: "asc" | "desc" };

export interface PrismaOpenChannelClient {
  openChatChannel: {
    findMany(input: { orderBy?: PrismaOrderBy; where?: PrismaChatChannelWhere }): MaybePromise<PrismaChatChannelRow[]>;
    upsert(input: { create: PrismaChatChannelCreateInput; update: PrismaChatChannelUpdateInput; where: { id: string } }): MaybePromise<PrismaChatChannelRow>;
    deleteMany(input: { where: { id: string; tenantId: string } }): MaybePromise<{ count: number }>;
  };
  externalBotConnection: {
    findMany(input: { orderBy?: PrismaOrderBy; where?: PrismaBotConnectionWhere }): MaybePromise<PrismaBotConnectionRow[]>;
    upsert(input: { create: PrismaBotConnectionCreateInput; update: PrismaBotConnectionUpdateInput; where: { id: string } }): MaybePromise<PrismaBotConnectionRow>;
    deleteMany(input: { where: { id: string; tenantId: string } }): MaybePromise<{ count: number }>;
  };
  eventWebhookSubscription: {
    findMany(input: { orderBy?: PrismaOrderBy; where?: PrismaWebhookSubscriptionWhere }): MaybePromise<PrismaWebhookSubscriptionRow[]>;
    upsert(input: { create: PrismaWebhookSubscriptionCreateInput; update: PrismaWebhookSubscriptionUpdateInput; where: { id: string } }): MaybePromise<PrismaWebhookSubscriptionRow>;
    deleteMany(input: { where: { id: string; tenantId: string } }): MaybePromise<{ count: number }>;
  };
  openChannelConversationState: {
    findMany(input: { where?: PrismaConversationStateWhere }): MaybePromise<PrismaConversationStateRow[]>;
    upsert(input: { create: PrismaConversationStateColumns; update: Partial<PrismaConversationStateColumns>; where: { conversationId: string } }): MaybePromise<PrismaConversationStateRow>;
  };
  openChannelDelivery: {
    create(input: { data: PrismaDeliveryCreateInput }): MaybePromise<PrismaDeliveryRow>;
    findMany(input: { orderBy?: PrismaOrderBy; take?: number; where?: PrismaDeliveryWhere }): MaybePromise<PrismaDeliveryRow[]>;
    update(input: { data: PrismaDeliveryUpdateInput; where: { id: string } }): MaybePromise<PrismaDeliveryRow>;
  };
  openChannelPumpCursor: {
    findMany(input: Record<string, never>): MaybePromise<PrismaPumpCursorRow[]>;
    upsert(input: { create: PrismaPumpCursorColumns; update: Partial<PrismaPumpCursorColumns>; where: { id: string } }): MaybePromise<PrismaPumpCursorRow>;
  };
}

interface PrismaChatChannelWhere { id?: string; tenantId?: string; token?: string; }
interface PrismaChatChannelCreateInput {
  createdAt: string; id: string; name: string; outboundUrl: string;
  routingQueueId: string | null; status: string; tenantId: string; token: string; updatedAt: string;
}
type PrismaChatChannelUpdateInput = Omit<PrismaChatChannelCreateInput, "id">;
interface PrismaChatChannelRow {
  createdAt: PrismaTimestamp; id: string; name: string; outboundUrl: string;
  routingQueueId: string | null; status: string; tenantId: string; token: string; updatedAt: PrismaTimestamp;
}

interface PrismaBotConnectionWhere { id?: string; status?: string; tenantId?: string; token?: string; }
interface PrismaBotConnectionCreateInput {
  channels: string[]; channelsAll: boolean; createdAt: string; id: string; name: string;
  providerUrl: string; status: string; tenantId: string; token: string; updatedAt: string;
}
type PrismaBotConnectionUpdateInput = Omit<PrismaBotConnectionCreateInput, "id">;
interface PrismaBotConnectionRow {
  channels: string[]; channelsAll: boolean; createdAt: PrismaTimestamp; id: string; name: string;
  providerUrl: string; status: string; tenantId: string; token: string; updatedAt: PrismaTimestamp;
}

interface PrismaWebhookSubscriptionWhere { id?: string; status?: string; tenantId?: string; }
interface PrismaWebhookSubscriptionCreateInput {
  createdAt: string; events: string[]; eventsAll: boolean; id: string;
  status: string; tenantId: string; updatedAt: string; url: string;
}
type PrismaWebhookSubscriptionUpdateInput = Omit<PrismaWebhookSubscriptionCreateInput, "id">;
interface PrismaWebhookSubscriptionRow {
  createdAt: PrismaTimestamp; events: string[]; eventsAll: boolean; id: string;
  status: string; tenantId: string; updatedAt: PrismaTimestamp; url: string;
}

interface PrismaConversationStateWhere { conversationId?: string; tenantId?: string; }
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
  id?: string;
  kind?: OpenChannelDeliveryKind;
  nextAttemptAt?: { lte: string };
  status?: OpenChannelDeliveryRecord["status"];
  tenantId?: string;
}
interface PrismaDeliveryCreateInput {
  attempts: number; body: Record<string, unknown>; conversationId: string | null; createdAt: string;
  eventName: string; id: string; kind: OpenChannelDeliveryKind; lastError: string | null;
  lastResponseBody: string | null; lastStatusCode: number | null; maxAttempts: number;
  nextAttemptAt: string; retryBackoffMs: number; status: OpenChannelDeliveryRecord["status"];
  tenantId: string; updatedAt: string; url: string;
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
  attempts: number; body: Record<string, unknown>; conversationId: string | null; createdAt: PrismaTimestamp;
  eventName: string; id: string; kind: OpenChannelDeliveryKind; lastError: string | null;
  lastResponseBody: string | null; lastStatusCode: number | null; maxAttempts: number;
  nextAttemptAt: PrismaTimestamp; retryBackoffMs: number; status: OpenChannelDeliveryRecord["status"];
  tenantId: string; updatedAt: PrismaTimestamp; url: string;
}

interface PrismaPumpCursorColumns { id: string; lastOccurredAt: string; seenEventIds: string[]; }
interface PrismaPumpCursorRow { id: string; lastOccurredAt: string; seenEventIds: unknown; updatedAt?: PrismaTimestamp; }

export interface PrismaOpenChannelRepositoryOptions {
  client: PrismaOpenChannelClient;
}

let defaultRepository: OpenChannelRepository | null = null;

export class OpenChannelRepository {
  private constructor(
    private readonly store: DurableStore<OpenChannelState>,
    private readonly prismaClient?: PrismaOpenChannelClient
  ) {}

  static default(): OpenChannelRepository {
    if (!defaultRepository) {
      defaultRepository = OpenChannelRepository.inMemory();
    }
    return defaultRepository;
  }

  static clearDefault(): void { defaultRepository = null; }

  static inMemory(seed: Partial<OpenChannelState> = {}): OpenChannelRepository {
    return new OpenChannelRepository(new InMemoryStore({ ...clone(EMPTY_STATE), ...clone(seed) } as OpenChannelState));
  }

  static prisma({ client }: PrismaOpenChannelRepositoryOptions): OpenChannelRepository {
    return new OpenChannelRepository(new InMemoryStore(clone(EMPTY_STATE)), client);
  }

  static useDefault(repository: OpenChannelRepository): void { defaultRepository = repository; }

  // --- Chat API channels ---

  listChatChannels(tenantId?: string): MaybePromise<OpenChatChannelRecord[]> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.openChatChannel.findMany({
        orderBy: { createdAt: "asc" },
        ...(tenantId ? { where: { tenantId } } : {})
      })).then((rows) => rows.map(toChatChannelRecord));
    }
    return clone(this.state().chatChannels.filter((item) => !tenantId || item.tenantId === tenantId));
  }

  findChatChannelByToken(token: string): MaybePromise<OpenChatChannelRecord | undefined> {
    const value = String(token ?? "").trim();
    if (!value) return undefined;
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.openChatChannel.findMany({ where: { token: value } }))
        .then((rows) => rows[0] ? toChatChannelRecord(rows[0]) : undefined);
    }
    const found = this.state().chatChannels.find((item) => item.token === value);
    return found ? clone(found) : undefined;
  }

  findChatChannel(tenantId: string, id: string): MaybePromise<OpenChatChannelRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.openChatChannel.findMany({ where: { id, tenantId } }))
        .then((rows) => rows[0] ? toChatChannelRecord(rows[0]) : undefined);
    }
    const found = this.state().chatChannels.find((item) => item.tenantId === tenantId && item.id === id);
    return found ? clone(found) : undefined;
  }

  saveChatChannel(record: OpenChatChannelRecord): MaybePromise<OpenChatChannelRecord> {
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

  removeChatChannel(tenantId: string, id: string): MaybePromise<boolean> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.openChatChannel.deleteMany({ where: { id, tenantId } }))
        .then((result) => result.count > 0);
    }
    return this.removeRecord("chatChannels", tenantId, id);
  }

  // --- Bot connections ---

  listBotConnections(tenantId?: string): MaybePromise<ExternalBotConnectionRecord[]> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.externalBotConnection.findMany({
        orderBy: { createdAt: "asc" },
        ...(tenantId ? { where: { tenantId } } : {})
      })).then((rows) => rows.map(toBotConnectionRecord));
    }
    return clone(this.state().botConnections.filter((item) => !tenantId || item.tenantId === tenantId));
  }

  findBotConnection(tenantId: string, id: string): MaybePromise<ExternalBotConnectionRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.externalBotConnection.findMany({ where: { id, tenantId } }))
        .then((rows) => rows[0] ? toBotConnectionRecord(rows[0]) : undefined);
    }
    const found = this.state().botConnections.find((item) => item.tenantId === tenantId && item.id === id);
    return found ? clone(found) : undefined;
  }

  findBotConnectionByIdAndToken(id: string, token: string): MaybePromise<ExternalBotConnectionRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.externalBotConnection.findMany({ where: { id, token } }))
        .then((rows) => rows[0] ? toBotConnectionRecord(rows[0]) : undefined);
    }
    const found = this.state().botConnections.find((item) => item.id === id && item.token === token);
    return found ? clone(found) : undefined;
  }

  findActiveBotConnectionForChannel(tenantId: string, channel: string): MaybePromise<ExternalBotConnectionRecord | undefined> {
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

  saveBotConnection(record: ExternalBotConnectionRecord): MaybePromise<ExternalBotConnectionRecord> {
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

  removeBotConnection(tenantId: string, id: string): MaybePromise<boolean> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.externalBotConnection.deleteMany({ where: { id, tenantId } }))
        .then((result) => result.count > 0);
    }
    return this.removeRecord("botConnections", tenantId, id);
  }

  // --- Webhook subscriptions ---

  listWebhookSubscriptions(tenantId?: string): MaybePromise<EventWebhookSubscriptionRecord[]> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.eventWebhookSubscription.findMany({
        orderBy: { createdAt: "asc" },
        ...(tenantId ? { where: { tenantId } } : {})
      })).then((rows) => rows.map(toWebhookSubscriptionRecord));
    }
    return clone(this.state().webhookSubscriptions.filter((item) => !tenantId || item.tenantId === tenantId));
  }

  listActiveWebhookSubscriptionsForEvent(tenantId: string, eventName: string): MaybePromise<EventWebhookSubscriptionRecord[]> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.eventWebhookSubscription.findMany({ orderBy: { createdAt: "asc" }, where: { status: "active", tenantId } }))
        .then((rows) => rows.map(toWebhookSubscriptionRecord).filter((item) => item.events === null || item.events.includes(eventName)));
    }
    return clone(this.state().webhookSubscriptions.filter((item) => item.tenantId === tenantId
      && item.status === "active"
      && (item.events === null || item.events.includes(eventName))));
  }

  findWebhookSubscription(tenantId: string, id: string): MaybePromise<EventWebhookSubscriptionRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.eventWebhookSubscription.findMany({ where: { id, tenantId } }))
        .then((rows) => rows[0] ? toWebhookSubscriptionRecord(rows[0]) : undefined);
    }
    const found = this.state().webhookSubscriptions.find((item) => item.tenantId === tenantId && item.id === id);
    return found ? clone(found) : undefined;
  }

  saveWebhookSubscription(record: EventWebhookSubscriptionRecord): MaybePromise<EventWebhookSubscriptionRecord> {
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

  removeWebhookSubscription(tenantId: string, id: string): MaybePromise<boolean> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.eventWebhookSubscription.deleteMany({ where: { id, tenantId } }))
        .then((result) => result.count > 0);
    }
    return this.removeRecord("webhookSubscriptions", tenantId, id);
  }

  // --- Conversation state ---

  findConversationState(conversationId: string): MaybePromise<OpenChannelConversationStateRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.openChannelConversationState.findMany({ where: { conversationId } }))
        .then((rows) => rows[0] ? toConversationStateRecord(rows[0]) : undefined);
    }
    const found = this.state().conversationState.find((item) => item.conversationId === conversationId);
    return found ? clone(found) : undefined;
  }

  listConversationStatesForTenant(tenantId: string): MaybePromise<OpenChannelConversationStateRecord[]> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.openChannelConversationState.findMany({ where: { tenantId } }))
        .then((rows) => rows.map(toConversationStateRecord));
    }
    return clone(this.state().conversationState.filter((item) => item.tenantId === tenantId));
  }

  mergeConversationState(input: Partial<OpenChannelConversationStateRecord> & { conversationId: string; tenantId: string }): MaybePromise<OpenChannelConversationStateRecord> {
    requireIdentity(input.tenantId, input.conversationId, "open_channel_conversation_state");
    if (this.prismaClient) {
      return this.mergeConversationStatePrisma(input);
    }
    let merged: OpenChannelConversationStateRecord | null = null;
    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.conversationState.find((item) => item.conversationId === input.conversationId);
      merged = {
        ...(existing ?? {}),
        ...clone(input),
        conversationId: input.conversationId,
        tenantId: input.tenantId,
        updatedAt: new Date().toISOString()
      } as OpenChannelConversationStateRecord;
      return {
        ...current,
        conversationState: [
          ...current.conversationState.filter((item) => item.conversationId !== input.conversationId),
          merged
        ]
      };
    });
    return clone(merged!) as OpenChannelConversationStateRecord;
  }

  private async mergeConversationStatePrisma(
    input: Partial<OpenChannelConversationStateRecord> & { conversationId: string; tenantId: string }
  ): Promise<OpenChannelConversationStateRecord> {
    const client = this.prismaClient!;
    const rows = await Promise.resolve(client.openChannelConversationState.findMany({ where: { conversationId: input.conversationId } }));
    const existing = rows[0] ? toConversationStateRecord(rows[0]) : undefined;
    const merged = {
      ...(existing ?? {}),
      ...clone(input),
      conversationId: input.conversationId,
      tenantId: input.tenantId,
      updatedAt: new Date().toISOString()
    } as OpenChannelConversationStateRecord;
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

  enqueueDelivery(input: Omit<OpenChannelDeliveryRecord, "attempts" | "createdAt" | "id" | "nextAttemptAt" | "status" | "updatedAt"> & {
    id?: string;
    nextAttemptAt?: string;
  }): MaybePromise<OpenChannelDeliveryRecord> {
    const now = new Date().toISOString();
    const record: OpenChannelDeliveryRecord = {
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

  listDeliveries(filter: { kind?: OpenChannelDeliveryKind; status?: OpenChannelDeliveryRecord["status"]; tenantId?: string } = {}): MaybePromise<OpenChannelDeliveryRecord[]> {
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

  claimDueDeliveries(now: string, limit = 20): MaybePromise<OpenChannelDeliveryRecord[]> {
    if (this.prismaClient) {
      return this.claimDueDeliveriesPrisma(now, limit);
    }
    const due: OpenChannelDeliveryRecord[] = [];
    this.store.update((state) => {
      const current = normalizeState(state);
      const deliveries = current.deliveries.map((item) => {
        if (due.length >= limit || item.status !== "pending" || item.nextAttemptAt > now) return item;
        const claimed: OpenChannelDeliveryRecord = { ...item, attempts: item.attempts + 1, updatedAt: now };
        due.push(clone(claimed));
        return claimed;
      });
      return { ...current, deliveries };
    });
    return due;
  }

  private async claimDueDeliveriesPrisma(now: string, limit: number): Promise<OpenChannelDeliveryRecord[]> {
    const client = this.prismaClient!;
    const rows = await Promise.resolve(client.openChannelDelivery.findMany({
      orderBy: { createdAt: "asc" },
      take: limit,
      where: { nextAttemptAt: { lte: now }, status: "pending" }
    }));
    const claimed: OpenChannelDeliveryRecord[] = [];
    for (const row of rows) {
      const current = toDeliveryRecord(row);
      const updated = await Promise.resolve(client.openChannelDelivery.update({
        data: { attempts: current.attempts + 1, updatedAt: now },
        where: { id: current.id }
      }));
      claimed.push(toDeliveryRecord(updated));
    }
    return claimed;
  }

  resolveDelivery(id: string, outcome: {
    error?: string;
    responseBody?: string;
    status: "dead_lettered" | "delivered" | "pending";
    statusCode?: number;
  }): MaybePromise<OpenChannelDeliveryRecord | undefined> {
    if (this.prismaClient) {
      return this.resolveDeliveryPrisma(id, outcome);
    }
    let resolved: OpenChannelDeliveryRecord | undefined;
    this.store.update((state) => {
      const current = normalizeState(state);
      const deliveries = current.deliveries.map((item) => {
        if (item.id !== id) return item;
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

  private async resolveDeliveryPrisma(id: string, outcome: {
    error?: string;
    responseBody?: string;
    status: "dead_lettered" | "delivered" | "pending";
    statusCode?: number;
  }): Promise<OpenChannelDeliveryRecord | undefined> {
    const client = this.prismaClient!;
    const rows = await Promise.resolve(client.openChannelDelivery.findMany({ where: { id } }));
    const current = rows[0] ? toDeliveryRecord(rows[0]) : undefined;
    if (!current) return undefined;
    const nextAttemptAt = outcome.status === "pending"
      ? new Date(Date.parse(current.updatedAt) + current.retryBackoffMs * Math.max(1, current.attempts)).toISOString()
      : current.nextAttemptAt;
    const updated = await Promise.resolve(client.openChannelDelivery.update({
      data: {
        ...(outcome.error ? { lastError: outcome.error.slice(0, 500) } : {}),
        ...(outcome.responseBody !== undefined ? { lastResponseBody: outcome.responseBody.slice(0, 2_000) } : {}),
        ...(outcome.statusCode !== undefined ? { lastStatusCode: outcome.statusCode } : {}),
        nextAttemptAt,
        status: outcome.status,
        updatedAt: new Date().toISOString()
      },
      where: { id }
    }));
    return toDeliveryRecord(updated);
  }

  // --- Event pump cursor ---

  readPumpCursor(): MaybePromise<OpenChannelPumpCursor> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.openChannelPumpCursor.findMany({}))
        .then((rows) => rows[0] ? toPumpCursor(rows[0]) : { lastOccurredAt: "", seenEventIds: [] });
    }
    const cursor = this.state().pumpCursor;
    return cursor ? clone(cursor) : { lastOccurredAt: "", seenEventIds: [] };
  }

  savePumpCursor(cursor: OpenChannelPumpCursor): MaybePromise<void> {
    if (this.prismaClient) {
      const columns: PrismaPumpCursorColumns = {
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

  private state(): OpenChannelState {
    return normalizeState(this.store.read());
  }

  private removeRecord(collection: "botConnections" | "chatChannels" | "webhookSubscriptions", tenantId: string, id: string): boolean {
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

export function createOpenChannelToken(prefix: string): string {
  return `${prefix}_${randomBytes(18).toString("base64url")}`;
}

function upsert<T extends { id: string; tenantId: string }>(rows: T[], record: T): T[] {
  const exists = rows.some((item) => item.tenantId === record.tenantId && item.id === record.id);
  return exists
    ? rows.map((item) => item.tenantId === record.tenantId && item.id === record.id ? record : item)
    : [...rows, record];
}

function requireIdentity(tenantId: string, id: string, code: string): void {
  if (!String(tenantId ?? "").trim() || !String(id ?? "").trim()) {
    throw new Error(`${code}_identity_required`);
  }
}

function normalizeState(input: Partial<OpenChannelState> | undefined): OpenChannelState {
  return {
    botConnections: input?.botConnections ?? [],
    chatChannels: input?.chatChannels ?? [],
    conversationState: input?.conversationState ?? [],
    deliveries: input?.deliveries ?? [],
    ...(input?.pumpCursor ? { pumpCursor: input.pumpCursor } : {}),
    webhookSubscriptions: input?.webhookSubscriptions ?? []
  };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

// --- Prisma row <-> record mapping ---------------------------------------

function toIso(value: PrismaTimestamp): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function matchesChannel(connection: ExternalBotConnectionRecord, channelKey: string): boolean {
  return connection.channels === null || connection.channels.map((entry) => entry.toUpperCase()).includes(channelKey);
}

function toChatChannelRecord(row: PrismaChatChannelRow): OpenChatChannelRecord {
  return {
    createdAt: toIso(row.createdAt),
    id: row.id,
    name: row.name,
    outboundUrl: row.outboundUrl,
    ...(row.routingQueueId ? { routingQueueId: row.routingQueueId } : {}),
    status: row.status as OpenChannelRecordStatus,
    tenantId: row.tenantId,
    token: row.token,
    updatedAt: toIso(row.updatedAt)
  };
}

function toChatChannelCreateInput(record: OpenChatChannelRecord): PrismaChatChannelCreateInput {
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

function toBotConnectionRecord(row: PrismaBotConnectionRow): ExternalBotConnectionRecord {
  return {
    channels: row.channelsAll ? null : [...(Array.isArray(row.channels) ? row.channels : [])],
    createdAt: toIso(row.createdAt),
    id: row.id,
    name: row.name,
    providerUrl: row.providerUrl,
    status: row.status as OpenChannelRecordStatus,
    tenantId: row.tenantId,
    token: row.token,
    updatedAt: toIso(row.updatedAt)
  };
}

function toBotConnectionCreateInput(record: ExternalBotConnectionRecord): PrismaBotConnectionCreateInput {
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

function toWebhookSubscriptionRecord(row: PrismaWebhookSubscriptionRow): EventWebhookSubscriptionRecord {
  return {
    createdAt: toIso(row.createdAt),
    events: row.eventsAll ? null : [...(Array.isArray(row.events) ? row.events : [])],
    id: row.id,
    status: row.status as OpenChannelRecordStatus,
    tenantId: row.tenantId,
    updatedAt: toIso(row.updatedAt),
    url: row.url
  };
}

function toWebhookSubscriptionCreateInput(record: EventWebhookSubscriptionRecord): PrismaWebhookSubscriptionCreateInput {
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

function toConversationStateRecord(row: PrismaConversationStateRow): OpenChannelConversationStateRecord {
  return {
    conversationId: row.conversationId,
    tenantId: row.tenantId,
    updatedAt: toIso(row.updatedAt),
    ...(row.attributes != null ? { attributes: clone(row.attributes) } : {}),
    ...(row.botState ? { botState: row.botState as "active" | "closed" } : {}),
    ...(row.chatChannelId ? { chatChannelId: row.chatChannelId } : {}),
    ...(row.clientId ? { clientId: row.clientId } : {}),
    ...(row.customData != null ? { customData: clone(row.customData) } : {}),
    ...(row.lastDeliveredAgentMessageId ? { lastDeliveredAgentMessageId: row.lastDeliveredAgentMessageId } : {}),
    ...(row.rateRequested != null ? { rateRequested: row.rateRequested } : {}),
    ...(row.userToken ? { userToken: row.userToken } : {})
  };
}

function toConversationStateColumns(record: OpenChannelConversationStateRecord): PrismaConversationStateColumns {
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

function toDeliveryRecord(row: PrismaDeliveryRow): OpenChannelDeliveryRecord {
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

function toDeliveryCreateInput(record: OpenChannelDeliveryRecord): PrismaDeliveryCreateInput {
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

function toPumpCursor(row: PrismaPumpCursorRow): OpenChannelPumpCursor {
  return {
    lastOccurredAt: String(row.lastOccurredAt ?? ""),
    seenEventIds: Array.isArray(row.seenEventIds) ? [...(row.seenEventIds as string[])] : []
  };
}
