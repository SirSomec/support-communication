import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OpenChannelRepository,
  type PrismaOpenChannelClient
} from "../apps/api-gateway/dist/integrations/open-channel/open-channel.repository.js";

/**
 * Exercises the Prisma branch of the Open Channel repository against an
 * in-memory Map-backed mock of the thin PrismaOpenChannelClient. The same
 * assertions hold for the real Postgres delegate; the mock keeps the contract
 * hermetic (no database) while proving every method routes through Prisma.
 */

const TENANT = "tenant-open-channel";
const OTHER_TENANT = "tenant-other";
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface MockTable {
  create(input: { data: Record<string, unknown> }): Record<string, unknown>;
  deleteMany(input: { where: Record<string, unknown> }): { count: number };
  findMany(input?: { orderBy?: Record<string, "asc" | "desc">; take?: number; where?: Record<string, unknown> }): Record<string, unknown>[];
  rows: Map<string, Record<string, unknown>>;
  update(input: { data: Record<string, unknown>; where: Record<string, unknown> }): Record<string, unknown>;
  updateMany(input: { data: Record<string, unknown>; where: Record<string, unknown> }): { count: number };
  upsert(input: { create: Record<string, unknown>; update: Record<string, unknown>; where: Record<string, unknown> }): Record<string, unknown>;
}

function whereKey(where: Record<string, unknown>): string {
  return String(where.id ?? where.conversationId);
}

function matchesWhere(row: Record<string, unknown>, where?: Record<string, unknown>): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition && typeof condition === "object" && "lte" in (condition as Record<string, unknown>)) {
      return String(row[key]) <= String((condition as { lte: unknown }).lte);
    }
    if (condition && typeof condition === "object" && "in" in (condition as Record<string, unknown>)) {
      return (condition as { in: unknown[] }).in.includes(row[key]);
    }
    return row[key] === condition;
  });
}

function makeTable(idKey: string): MockTable {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    findMany(input = {}) {
      let list = [...rows.values()].filter((row) => matchesWhere(row, input.where));
      const orderBy = input.orderBy;
      if (orderBy) {
        const [field, direction] = Object.entries(orderBy)[0]!;
        list = [...list].sort((left, right) => {
          const compared = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
          return direction === "desc" ? -compared : compared;
        });
      }
      if (typeof input.take === "number") list = list.slice(0, input.take);
      return list.map(clone);
    },
    create({ data }) {
      rows.set(String(data[idKey]), clone(data));
      return clone(data);
    },
    update({ where, data }) {
      const key = whereKey(where);
      const existing = rows.get(key);
      if (!existing) throw new Error(`open_channel_mock_row_not_found:${key}`);
      const next = { ...existing, ...clone(data) };
      rows.set(key, next);
      return clone(next);
    },
    updateMany({ where, data }) {
      let count = 0;
      for (const [key, row] of rows.entries()) {
        if (!matchesWhere(row, where)) continue;
        rows.set(key, { ...row, ...clone(data) });
        count += 1;
      }
      return { count };
    },
    upsert({ where, create, update }) {
      const key = whereKey(where);
      const existing = rows.get(key);
      const next = existing ? { ...existing, ...clone(update) } : clone(create);
      rows.set(key, next);
      return clone(next);
    },
    deleteMany({ where }) {
      let count = 0;
      for (const [key, row] of [...rows.entries()]) {
        if (matchesWhere(row, where)) { rows.delete(key); count += 1; }
      }
      return { count };
    }
  };
}

function createPrismaMock() {
  const openChatChannel = makeTable("id");
  const externalBotConnection = makeTable("id");
  const eventWebhookSubscription = makeTable("id");
  const openChannelConversationState = makeTable("conversationId");
  const openChannelDelivery = makeTable("id");
  const openChannelPumpCursor = makeTable("id");
  const client = {
    openChatChannel, externalBotConnection, eventWebhookSubscription,
    openChannelConversationState, openChannelDelivery, openChannelPumpCursor
  } as unknown as PrismaOpenChannelClient;
  return { client, tables: { openChatChannel, externalBotConnection, eventWebhookSubscription, openChannelConversationState, openChannelDelivery, openChannelPumpCursor } };
}

function prismaRepository() {
  const mock = createPrismaMock();
  return { mock, repository: OpenChannelRepository.prisma({ client: mock.client }) };
}

const isoAt = (minute: number) => new Date(Date.UTC(2026, 6, 15, 12, minute, 0)).toISOString();

describe("open channel repository (Prisma branch)", () => {
  it("persists chat channels, isolates tenants and resolves by token", async () => {
    const { mock, repository } = prismaRepository();
    await repository.saveChatChannel({
      createdAt: isoAt(1), id: "och-1", name: "Alpha", outboundUrl: "https://a.example/e",
      routingQueueId: "queue-a", status: "active", tenantId: TENANT, token: "oc_alpha", updatedAt: isoAt(1)
    });
    await repository.saveChatChannel({
      createdAt: isoAt(2), id: "och-2", name: "Beta", outboundUrl: "", status: "disabled",
      tenantId: OTHER_TENANT, token: "oc_beta", updatedAt: isoAt(2)
    });

    // The rows really landed in the Prisma delegate, not a JSON store.
    assert.equal(mock.tables.openChatChannel.rows.size, 2);

    const mine = await repository.listChatChannels(TENANT);
    assert.equal(mine.length, 1);
    assert.equal(mine[0].id, "och-1");
    assert.equal(mine[0].routingQueueId, "queue-a");

    const byToken = await repository.findChatChannelByToken("oc_alpha");
    assert.equal(byToken?.id, "och-1");
    assert.equal(await repository.findChatChannelByToken("nope"), undefined);

    // Tenant scoping: other tenant's id is invisible.
    assert.equal(await repository.findChatChannel(TENANT, "och-2"), undefined);
    assert.equal((await repository.findChatChannel(OTHER_TENANT, "och-2"))?.name, "Beta");

    // Update (upsert) keeps a single row and re-reads through Prisma.
    await repository.saveChatChannel({
      createdAt: isoAt(1), id: "och-1", name: "Alpha renamed", outboundUrl: "https://a.example/e",
      status: "active", tenantId: TENANT, token: "oc_alpha", updatedAt: isoAt(5)
    });
    assert.equal(mock.tables.openChatChannel.rows.size, 2);
    const renamed = await repository.findChatChannel(TENANT, "och-1");
    assert.equal(renamed?.name, "Alpha renamed");
    assert.equal(renamed?.routingQueueId, undefined);

    assert.equal(await repository.removeChatChannel(TENANT, "och-1"), true);
    assert.equal(await repository.removeChatChannel(TENANT, "och-1"), false);
    assert.equal(mock.tables.openChatChannel.rows.size, 1);
  });

  it("stores bot connections and matches active connections by channel (null = all)", async () => {
    const { repository } = prismaRepository();
    await repository.saveBotConnection({
      channels: ["SDK"], createdAt: isoAt(1), id: "xbc-sdk", name: "SDK bot",
      providerUrl: "https://bot.example/hooks", status: "active", tenantId: TENANT, token: "xb_sdk", updatedAt: isoAt(1)
    });
    await repository.saveBotConnection({
      channels: null, createdAt: isoAt(2), id: "xbc-all", name: "All bot",
      providerUrl: "https://bot.example/all", status: "disabled", tenantId: TENANT, token: "xb_all", updatedAt: isoAt(2)
    });

    const list = await repository.listBotConnections(TENANT);
    assert.equal(list.length, 2);
    assert.deepEqual(list.find((item) => item.id === "xbc-sdk")?.channels, ["SDK"]);
    assert.equal(list.find((item) => item.id === "xbc-all")?.channels, null);

    // Only the active SDK connection serves CHATAPI? No — SDK connection lists SDK only.
    assert.equal(await repository.findActiveBotConnectionForChannel(TENANT, "CHATAPI"), undefined);
    assert.equal((await repository.findActiveBotConnectionForChannel(TENANT, "sdk"))?.id, "xbc-sdk");

    // Activate the "all channels" connection; it now matches any channel.
    await repository.saveBotConnection({
      channels: null, createdAt: isoAt(2), id: "xbc-all", name: "All bot",
      providerUrl: "https://bot.example/all", status: "active", tenantId: TENANT, token: "xb_all", updatedAt: isoAt(9)
    });
    assert.ok(await repository.findActiveBotConnectionForChannel(TENANT, "CHATAPI"));

    assert.equal((await repository.findBotConnectionByIdAndToken("xbc-sdk", "xb_sdk"))?.name, "SDK bot");
    assert.equal(await repository.findBotConnectionByIdAndToken("xbc-sdk", "wrong"), undefined);
    assert.equal(await repository.removeBotConnection(TENANT, "xbc-sdk"), true);
  });

  it("filters active webhook subscriptions by event name (null = all events)", async () => {
    const { repository } = prismaRepository();
    await repository.saveWebhookSubscription({
      createdAt: isoAt(1), events: ["chat_finished"], id: "owh-1", status: "active",
      tenantId: TENANT, updatedAt: isoAt(1), url: "https://c.example/finished"
    });
    await repository.saveWebhookSubscription({
      createdAt: isoAt(2), events: null, id: "owh-2", status: "active",
      tenantId: TENANT, updatedAt: isoAt(2), url: "https://c.example/all"
    });
    await repository.saveWebhookSubscription({
      createdAt: isoAt(3), events: ["chat_finished"], id: "owh-3", status: "disabled",
      tenantId: TENANT, updatedAt: isoAt(3), url: "https://c.example/disabled"
    });

    const forFinished = await repository.listActiveWebhookSubscriptionsForEvent(TENANT, "chat_finished");
    assert.deepEqual(new Set(forFinished.map((item) => item.id)), new Set(["owh-1", "owh-2"]));

    const forAccepted = await repository.listActiveWebhookSubscriptionsForEvent(TENANT, "chat_accepted");
    assert.deepEqual(forAccepted.map((item) => item.id), ["owh-2"]);

    assert.equal((await repository.listWebhookSubscriptions(OTHER_TENANT)).length, 0);
    assert.equal(await repository.removeWebhookSubscription(TENANT, "owh-2"), true);
  });

  it("merges conversation state additively and scopes it to the tenant", async () => {
    const { repository } = prismaRepository();
    const first = await repository.mergeConversationState({
      botState: "active", clientId: "client-1", conversationId: "conv-1", tenantId: TENANT
    });
    assert.equal(first.botState, "active");
    assert.equal(first.clientId, "client-1");

    const merged = await repository.mergeConversationState({
      attributes: { Vozrast: 42 }, conversationId: "conv-1", tenantId: TENANT, userToken: "tok-1"
    });
    // Prior fields survive the merge; new ones are added.
    assert.equal(merged.botState, "active");
    assert.equal(merged.clientId, "client-1");
    assert.deepEqual(merged.attributes, { Vozrast: 42 });
    assert.equal(merged.userToken, "tok-1");

    const closed = await repository.mergeConversationState({ botState: "closed", conversationId: "conv-1", tenantId: TENANT });
    assert.equal(closed.botState, "closed");
    assert.equal(closed.clientId, "client-1");

    const found = await repository.findConversationState("conv-1");
    assert.equal(found?.botState, "closed");
    assert.equal(await repository.findConversationState("missing"), undefined);

    await repository.mergeConversationState({ conversationId: "conv-2", tenantId: OTHER_TENANT });
    assert.deepEqual((await repository.listConversationStatesForTenant(TENANT)).map((item) => item.conversationId), ["conv-1"]);
  });

  it("runs the delivery journal lifecycle: enqueue, claim due, retry backoff and dead-letter", async () => {
    const { repository } = prismaRepository();
    const enqueued = await repository.enqueueDelivery({
      body: { event: "CLIENT_MESSAGE" }, conversationId: "conv-1", eventName: "CLIENT_MESSAGE",
      kind: "bot_event", maxAttempts: 2, nextAttemptAt: isoAt(1), retryBackoffMs: 60_000, tenantId: TENANT, url: "https://bot.example/hooks/token"
    });
    assert.equal(enqueued.status, "pending");
    assert.equal(enqueued.attempts, 0);

    // Not yet due.
    assert.equal((await repository.claimDueDeliveries(isoAt(0))).length, 0);

    const claimed = await repository.claimDueDeliveries(isoAt(2));
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].attempts, 1);
    assert.equal(claimed[0].status, "in_flight");
    assert.equal(claimed[0].updatedAt, isoAt(2));
    assert.equal((await repository.claimDueDeliveries(isoAt(2))).length, 0);

    // Transient failure → pending with a backed-off nextAttemptAt.
    const retried = await repository.resolveDelivery(claimed[0].id, { error: "boom", status: "pending", statusCode: 503 });
    assert.equal(retried?.status, "pending");
    assert.equal(retried?.lastError, "boom");
    assert.equal(retried?.lastStatusCode, 503);
    assert.ok(retried!.nextAttemptAt > isoAt(2), "nextAttemptAt must be pushed into the future");

    // Second (final) attempt, then dead-letter.
    const claimedAgain = await repository.claimDueDeliveries(isoAt(30));
    assert.equal(claimedAgain.length, 1);
    assert.equal(claimedAgain[0].attempts, 2);
    const dead = await repository.resolveDelivery(claimedAgain[0].id, { error: "gone", status: "dead_lettered", statusCode: 500 });
    assert.equal(dead?.status, "dead_lettered");

    assert.equal((await repository.listDeliveries({ status: "dead_lettered", tenantId: TENANT })).length, 1);
    assert.equal((await repository.listDeliveries({ status: "pending" })).length, 0);
    assert.equal(await repository.resolveDelivery("missing", { status: "delivered" }), undefined);
  });

  it("reads and persists the singleton event-pump cursor", async () => {
    const { mock, repository } = prismaRepository();
    assert.deepEqual(await repository.readPumpCursor(), { lastOccurredAt: "", seenEventIds: [] });

    await repository.savePumpCursor({ lastOccurredAt: isoAt(4), seenEventIds: ["e1", "e2"] });
    await repository.savePumpCursor({ lastOccurredAt: isoAt(6), seenEventIds: ["e1", "e2", "e3"] });

    // Upsert keeps exactly one cursor row.
    assert.equal(mock.tables.openChannelPumpCursor.rows.size, 1);
    const cursor = await repository.readPumpCursor();
    assert.equal(cursor.lastOccurredAt, isoAt(6));
    assert.deepEqual(cursor.seenEventIds, ["e1", "e2", "e3"]);
  });

  it("returns promises from the Prisma branch", () => {
    const { repository } = prismaRepository();
    const result = repository.listChatChannels(TENANT);
    assert.equal(typeof (result as Promise<unknown>).then, "function");
  });
});
