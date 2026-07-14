import { randomBytes } from "node:crypto";
import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";

/**
 * External integration layer storage: Open Channel chat channels,
 * bot-provider connections, event webhook subscriptions, per-conversation
 * client state and the outbound delivery journal. One JSON store keeps the
 * layer self-contained — the rest of the platform is untouched while the
 * integration surface is idle.
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

let defaultRepository: OpenChannelRepository | null = null;

export class OpenChannelRepository {
  constructor(private readonly store: DurableStore<OpenChannelState>) {}

  static default(): OpenChannelRepository {
    if (!defaultRepository) {
      defaultRepository = OpenChannelRepository.open(process.env.OPEN_CHANNEL_STORE_FILE ?? ".runtime/open-channel.json");
    }
    return defaultRepository;
  }

  static clearDefault(): void { defaultRepository = null; }

  static inMemory(seed: Partial<OpenChannelState> = {}): OpenChannelRepository {
    return new OpenChannelRepository(new InMemoryStore({ ...clone(EMPTY_STATE), ...clone(seed) } as OpenChannelState));
  }

  static open(filePath: string): OpenChannelRepository {
    return new OpenChannelRepository(new JsonFileStore({ filePath, seed: clone(EMPTY_STATE) }));
  }

  static useDefault(repository: OpenChannelRepository): void { defaultRepository = repository; }

  // --- Chat API channels ---

  listChatChannels(tenantId?: string): OpenChatChannelRecord[] {
    return clone(this.state().chatChannels.filter((item) => !tenantId || item.tenantId === tenantId));
  }

  findChatChannelByToken(token: string): OpenChatChannelRecord | undefined {
    const value = String(token ?? "").trim();
    if (!value) return undefined;
    const found = this.state().chatChannels.find((item) => item.token === value);
    return found ? clone(found) : undefined;
  }

  findChatChannel(tenantId: string, id: string): OpenChatChannelRecord | undefined {
    const found = this.state().chatChannels.find((item) => item.tenantId === tenantId && item.id === id);
    return found ? clone(found) : undefined;
  }

  saveChatChannel(record: OpenChatChannelRecord): OpenChatChannelRecord {
    requireIdentity(record.tenantId, record.id, "open_chat_channel");
    this.store.update((state) => ({
      ...normalizeState(state),
      chatChannels: upsert(normalizeState(state).chatChannels, clone(record))
    }));
    return clone(record);
  }

  removeChatChannel(tenantId: string, id: string): boolean {
    return this.removeRecord("chatChannels", tenantId, id);
  }

  // --- Bot connections ---

  listBotConnections(tenantId?: string): ExternalBotConnectionRecord[] {
    return clone(this.state().botConnections.filter((item) => !tenantId || item.tenantId === tenantId));
  }

  findBotConnection(tenantId: string, id: string): ExternalBotConnectionRecord | undefined {
    const found = this.state().botConnections.find((item) => item.tenantId === tenantId && item.id === id);
    return found ? clone(found) : undefined;
  }

  findBotConnectionByIdAndToken(id: string, token: string): ExternalBotConnectionRecord | undefined {
    const found = this.state().botConnections.find((item) => item.id === id && item.token === token);
    return found ? clone(found) : undefined;
  }

  findActiveBotConnectionForChannel(tenantId: string, channel: string): ExternalBotConnectionRecord | undefined {
    const channelKey = String(channel ?? "").trim().toUpperCase();
    const found = this.state().botConnections.find((item) => item.tenantId === tenantId
      && item.status === "active"
      && (item.channels === null || item.channels.map((entry) => entry.toUpperCase()).includes(channelKey)));
    return found ? clone(found) : undefined;
  }

  saveBotConnection(record: ExternalBotConnectionRecord): ExternalBotConnectionRecord {
    requireIdentity(record.tenantId, record.id, "external_bot_connection");
    this.store.update((state) => ({
      ...normalizeState(state),
      botConnections: upsert(normalizeState(state).botConnections, clone(record))
    }));
    return clone(record);
  }

  removeBotConnection(tenantId: string, id: string): boolean {
    return this.removeRecord("botConnections", tenantId, id);
  }

  // --- Webhook subscriptions ---

  listWebhookSubscriptions(tenantId?: string): EventWebhookSubscriptionRecord[] {
    return clone(this.state().webhookSubscriptions.filter((item) => !tenantId || item.tenantId === tenantId));
  }

  listActiveWebhookSubscriptionsForEvent(tenantId: string, eventName: string): EventWebhookSubscriptionRecord[] {
    return clone(this.state().webhookSubscriptions.filter((item) => item.tenantId === tenantId
      && item.status === "active"
      && (item.events === null || item.events.includes(eventName))));
  }

  findWebhookSubscription(tenantId: string, id: string): EventWebhookSubscriptionRecord | undefined {
    const found = this.state().webhookSubscriptions.find((item) => item.tenantId === tenantId && item.id === id);
    return found ? clone(found) : undefined;
  }

  saveWebhookSubscription(record: EventWebhookSubscriptionRecord): EventWebhookSubscriptionRecord {
    requireIdentity(record.tenantId, record.id, "event_webhook_subscription");
    this.store.update((state) => ({
      ...normalizeState(state),
      webhookSubscriptions: upsert(normalizeState(state).webhookSubscriptions, clone(record))
    }));
    return clone(record);
  }

  removeWebhookSubscription(tenantId: string, id: string): boolean {
    return this.removeRecord("webhookSubscriptions", tenantId, id);
  }

  // --- Conversation state ---

  findConversationState(conversationId: string): OpenChannelConversationStateRecord | undefined {
    const found = this.state().conversationState.find((item) => item.conversationId === conversationId);
    return found ? clone(found) : undefined;
  }

  listConversationStatesForTenant(tenantId: string): OpenChannelConversationStateRecord[] {
    return clone(this.state().conversationState.filter((item) => item.tenantId === tenantId));
  }

  mergeConversationState(input: Partial<OpenChannelConversationStateRecord> & { conversationId: string; tenantId: string }): OpenChannelConversationStateRecord {
    requireIdentity(input.tenantId, input.conversationId, "open_channel_conversation_state");
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

  // --- Delivery journal ---

  enqueueDelivery(input: Omit<OpenChannelDeliveryRecord, "attempts" | "createdAt" | "id" | "nextAttemptAt" | "status" | "updatedAt"> & {
    id?: string;
    nextAttemptAt?: string;
  }): OpenChannelDeliveryRecord {
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
    this.store.update((state) => {
      const current = normalizeState(state);
      return { ...current, deliveries: [...current.deliveries, record].slice(-DELIVERY_JOURNAL_LIMIT) };
    });
    return clone(record);
  }

  listDeliveries(filter: { kind?: OpenChannelDeliveryKind; status?: OpenChannelDeliveryRecord["status"]; tenantId?: string } = {}): OpenChannelDeliveryRecord[] {
    return clone(this.state().deliveries.filter((item) => (!filter.tenantId || item.tenantId === filter.tenantId)
      && (!filter.kind || item.kind === filter.kind)
      && (!filter.status || item.status === filter.status)));
  }

  claimDueDeliveries(now: string, limit = 20): OpenChannelDeliveryRecord[] {
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

  resolveDelivery(id: string, outcome: {
    error?: string;
    responseBody?: string;
    status: "dead_lettered" | "delivered" | "pending";
    statusCode?: number;
  }): OpenChannelDeliveryRecord | undefined {
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

  // --- Event pump cursor ---

  readPumpCursor(): OpenChannelPumpCursor {
    const cursor = this.state().pumpCursor;
    return cursor ? clone(cursor) : { lastOccurredAt: "", seenEventIds: [] };
  }

  savePumpCursor(cursor: OpenChannelPumpCursor): void {
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
