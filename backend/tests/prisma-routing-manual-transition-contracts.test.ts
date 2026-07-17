import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RoutingRepository,
  type PrismaRoutingClient,
  type RoutingBatchTransitionInput,
  type RoutingLifecycleEvent,
  type RoutingManualTransitionInput,
  type RoutingState
} from "../apps/api-gateway/src/routing/routing.repository.ts";

describe("Prisma manual routing transition contracts", () => {
  it("updates the canonical conversation, routing state, side tables, lifecycle, and realtime atomically", async () => {
    const fake = createManualTransitionPrisma();
    const repository = RoutingRepository.prisma({ client: fake.client });
    await repository.hydrateStateSnapshot();

    const input = transitionInput();
    const saved = await repository.saveManualRoutingTransition(input);

    const { rescueState: _rescueState, ...persistedConversation } = fake.conversations.get(CONVERSATION_ID)!;
    assert.deepEqual(persistedConversation, {
      id: CONVERSATION_ID,
      operatorId: "operator-next",
      operatorName: "Next Operator",
      queueId: "support",
      slaTone: "ok",
      status: "assigned",
      tenantId: TENANT_ID,
      updatedAt: new Date(OCCURRED_AT)
    });
    assert.equal(fake.snapshots.get("default")?.version, 2);
    assert.equal(fake.snapshots.get("default")?.conversations[0]?.operatorId, "operator-next");
    assert.equal(fake.jobs.has("job-manual-assign"), true);
    assert.equal(fake.analytics.has("analytics-manual-assign"), true);
    assert.equal(fake.lifecycleEvents.has("lifecycle-manual-assign"), true);
    assert.equal(fake.realtimeEvents.has("realtime-manual-assign"), true);
    assert.equal(saved.conversations[0]?.operatorId, "operator-next");
  });

  it("leaves no job, event, analytics, or snapshot change on canonical conversation CAS conflict", async () => {
    const fake = createManualTransitionPrisma();
    const repository = RoutingRepository.prisma({ client: fake.client });
    await repository.hydrateStateSnapshot();
    fake.conversations.get(CONVERSATION_ID)!.status = "paused";

    await assert.rejects(
      () => repository.saveManualRoutingTransition(transitionInput()),
      /routing_conversation_cas_conflict/
    );

    assert.equal(fake.snapshots.get("default")?.version, 1);
    assert.equal(fake.jobs.size, 0);
    assert.equal(fake.analytics.size, 0);
    assert.equal(fake.lifecycleEvents.size, 0);
    assert.equal(fake.realtimeEvents.size, 0);
  });

  it("retries one transient routing snapshot version conflict inside the transaction", async () => {
    const fake = createManualTransitionPrisma();
    const repository = RoutingRepository.prisma({ client: fake.client });
    await repository.hydrateStateSnapshot();
    fake.forceSnapshotConflict();

    const saved = await repository.saveManualRoutingTransition(transitionInput());

    assert.equal(fake.conversations.get(CONVERSATION_ID)?.operatorId, "operator-next");
    assert.equal(fake.snapshots.get("default")?.version, 2);
    assert.equal(fake.jobs.size, 1);
    assert.equal(fake.analytics.size, 1);
    assert.equal(fake.lifecycleEvents.size, 1);
    assert.equal(fake.realtimeEvents.size, 1);
    assert.equal(saved.conversations[0]?.operatorId, "operator-next");
  });

  it("commits every canonical redistribution conversation or rolls the whole batch back", async () => {
    const fake = createManualTransitionPrisma();
    const secondId = `${CONVERSATION_ID}-second`;
    fake.conversations.set(secondId, { ...canonicalConversation(), id: secondId });
    const repository = RoutingRepository.prisma({ client: fake.client });
    await repository.hydrateStateSnapshot();

    const input = batchTransitionInput(secondId);
    await repository.saveBatchRoutingTransition(input);
    assert.equal(fake.conversations.get(CONVERSATION_ID)?.operatorId, "operator-next");
    assert.equal(fake.conversations.get(secondId)?.operatorId, "operator-next");

    fake.conversations.set(CONVERSATION_ID, canonicalConversation());
    fake.conversations.set(secondId, { ...canonicalConversation(), id: secondId, status: "closed" });
    await assert.rejects(() => repository.saveBatchRoutingTransition(input), /routing_batch_conversation_cas_conflict/);
    assert.deepEqual(fake.conversations.get(CONVERSATION_ID), canonicalConversation());
  });
});

const TENANT_ID = "tenant-manual-routing";
const CONVERSATION_ID = "conversation-manual-routing";
const EXPECTED_UPDATED_AT = "2026-07-11T10:00:00.000Z";
const OCCURRED_AT = "2026-07-11T10:01:00.000Z";

function transitionInput(): RoutingManualTransitionInput {
  const lifecycleEvent: RoutingLifecycleEvent = {
    actorId: "operator-admin",
    actorName: "Admin",
    actorType: "operator",
    conversationId: CONVERSATION_ID,
    data: {
      action: "assign",
      fromOperatorId: null,
      fromStatus: "queued",
      queueId: "support",
      toOperatorId: "operator-next",
      toStatus: "assigned"
    },
    eventType: "assignment.changed",
    id: "lifecycle-manual-assign",
    ingestedAt: OCCURRED_AT,
    occurredAt: OCCURRED_AT,
    reason: "Manual assignment contract",
    schemaVersion: "conversation-lifecycle/v1",
    source: "routing-api",
    sourceEventId: "manual-assign",
    tenantId: TENANT_ID,
    traceId: "trace-manual-assign"
  };
  return {
    action: "assign",
    conversationId: CONVERSATION_ID,
    expectedOperatorId: null,
    expectedStatus: "queued",
    expectedUpdatedAt: EXPECTED_UPDATED_AT,
    lifecycleEvents: [lifecycleEvent],
    operatorName: "Next Operator",
    realtimeEvent: {
      data: lifecycleEvent.data,
      eventId: "realtime-manual-assign",
      eventName: "routing.assignment.updated",
      occurredAt: OCCURRED_AT,
      resourceId: CONVERSATION_ID,
      resourceType: "conversation",
      schemaVersion: "v1",
      tenantId: TENANT_ID,
      traceId: lifecycleEvent.traceId
    },
    state: nextRoutingState(),
    tenantId: TENANT_ID
  };
}

function batchTransitionInput(secondId: string): RoutingBatchTransitionInput {
  const state = nextRoutingState();
  state.conversations = [state.conversations[0]!, { ...state.conversations[0]!, id: secondId }];
  const ids = [CONVERSATION_ID, secondId];
  return {
    lifecycleEvents: ids.map((conversationId) => ({
      ...transitionInput().lifecycleEvents[0]!,
      conversationId,
      id: `lifecycle-${conversationId}`,
      sourceEventId: `batch-${conversationId}`
    })),
    realtimeEvents: ids.map((conversationId) => ({
      ...transitionInput().realtimeEvent,
      eventId: `realtime-${conversationId}`,
      resourceId: conversationId
    })),
    state,
    tenantId: TENANT_ID,
    transitions: ids.map((conversationId) => ({
      conversationId,
      expectedOperatorId: null,
      expectedStatus: "queued",
      operatorId: "operator-next",
      operatorName: "Next Operator",
      slaTone: "ok",
      status: "assigned"
    }))
  };
}

function nextRoutingState(): RoutingState {
  return {
    conversations: [{
      channel: "support",
      client: "Manual routing client",
      id: CONVERSATION_ID,
      operatorId: "operator-next",
      slaTone: "ok",
      status: "assigned",
      tenantId: TENANT_ID
    }],
    jobs: [{
      action: "assignment.commit",
      conversationId: CONVERSATION_ID,
      id: "job-manual-assign",
      queue: "routing-assignments",
      status: "queued",
      tenantId: TENANT_ID
    }],
    operatorCapacities: [],
    operators: [],
    queueMemberships: [],
    queues: [],
    routingAnalyticsRows: [{
      channel: "support",
      conversationId: CONVERSATION_ID,
      eventKind: "assignment",
      fromOperatorId: null,
      id: "analytics-manual-assign",
      occurredAt: OCCURRED_AT,
      source: "api",
      tenantId: TENANT_ID,
      toOperatorId: "operator-next"
    }],
    rescueReportRows: [],
    routingRules: []
  };
}

function initialRoutingState(): RoutingState {
  return {
    ...nextRoutingState(),
    conversations: [{
      channel: "support",
      client: "Manual routing client",
      id: CONVERSATION_ID,
      slaTone: "hold",
      status: "queued",
      tenantId: TENANT_ID
    }],
    jobs: [],
    routingAnalyticsRows: []
  };
}

function canonicalConversation() {
  return {
    id: CONVERSATION_ID,
    operatorId: null as string | null,
    queueId: "support",
    slaTone: "hold",
    status: "queued",
    tenantId: TENANT_ID,
    updatedAt: new Date(EXPECTED_UPDATED_AT)
  };
}

function createManualTransitionPrisma() {
  const conversations = new Map([[CONVERSATION_ID, canonicalConversation()]]);
  const snapshots = new Map([["default", snapshotRow(initialRoutingState(), 1)]]);
  const jobs = new Map<string, Record<string, any>>();
  const analytics = new Map<string, Record<string, any>>();
  const lifecycleEvents = new Map<string, Record<string, any>>();
  const realtimeEvents = new Map<string, Record<string, any>>();
  let conflictSnapshot = false;

  const client = {
    async $transaction<T>(callback: (transaction: typeof client) => Promise<T>): Promise<T> {
      const before = {
        analytics: cloneMap(analytics),
        conversations: cloneMap(conversations),
        jobs: cloneMap(jobs),
        lifecycleEvents: cloneMap(lifecycleEvents),
        realtimeEvents: cloneMap(realtimeEvents),
        snapshots: cloneMap(snapshots)
      };
      try {
        return await callback(client);
      } catch (error) {
        restoreMap(analytics, before.analytics);
        restoreMap(conversations, before.conversations);
        restoreMap(jobs, before.jobs);
        restoreMap(lifecycleEvents, before.lifecycleEvents);
        restoreMap(realtimeEvents, before.realtimeEvents);
        restoreMap(snapshots, before.snapshots);
        throw error;
      }
    },
    conversation: {
      updateMany({ data, where }: any) {
        const current = conversations.get(where.id);
        const matches = current
          && current.tenantId === where.tenantId
          && current.operatorId === where.operatorId
          && current.status === where.status
          && (where.updatedAt === undefined || current.updatedAt.getTime() === where.updatedAt.getTime());
        if (!matches) return Promise.resolve({ count: 0 });
        conversations.set(where.id, { ...current, ...data });
        return Promise.resolve({ count: 1 });
      }
    },
    conversationLifecycleEvent: {
      create({ data }: any) {
        lifecycleEvents.set(data.id, data);
        return Promise.resolve(data);
      }
    },
    conversationRealtimeEvent: {
      create({ data }: any) {
        realtimeEvents.set(data.id, data);
        return Promise.resolve(data);
      }
    },
    routingStateSnapshot: {
      create({ data }: any) {
        const row = snapshotRow(data, data.version);
        snapshots.set(data.id, row);
        return Promise.resolve(row);
      },
      findUnique({ where }: any) {
        return Promise.resolve(snapshots.get(where.id) ?? null);
      },
      updateMany({ data, where }: any) {
        const current = snapshots.get(where.id);
        if (conflictSnapshot || !current || current.version !== where.version) {
          conflictSnapshot = false;
          return Promise.resolve({ count: 0 });
        }
        snapshots.set(where.id, { ...current, ...structuredClone(data), updatedAt: new Date(OCCURRED_AT) });
        return Promise.resolve({ count: 1 });
      }
    },
    routingJob: {
      findMany: () => Promise.resolve(Array.from(jobs.values())),
      findUnique: ({ where }: any) => Promise.resolve(jobs.get(where.id) ?? null),
      updateMany: () => Promise.resolve({ count: 0 }),
      upsert({ create, update, where }: any) {
        const row = { ...create, ...update, createdAt: new Date(OCCURRED_AT), id: where.id, updatedAt: new Date(OCCURRED_AT) };
        jobs.set(where.id, row);
        return Promise.resolve(row);
      }
    },
    routingAnalyticsRow: {
      findMany: () => Promise.resolve(Array.from(analytics.values())),
      upsert({ create, update, where }: any) {
        const row = { ...create, ...update, createdAt: new Date(OCCURRED_AT), id: where.id };
        analytics.set(where.id, row);
        return Promise.resolve(row);
      }
    },
    operatorCapacity: emptyDelegate("updatedAt"),
    queueMembership: emptyDelegate("updatedAt"),
    routingRule: emptyDelegate("updatedAt")
  };

  return {
    analytics,
    client: client as unknown as PrismaRoutingClient,
    conversations,
    forceSnapshotConflict() {
      conflictSnapshot = true;
    },
    jobs,
    lifecycleEvents,
    realtimeEvents,
    snapshots
  };
}

function snapshotRow(state: RoutingState, version: number) {
  return {
    conversations: structuredClone(state.conversations),
    id: "default",
    operators: structuredClone(state.operators),
    queues: structuredClone(state.queues),
    rescueReportRows: structuredClone(state.rescueReportRows),
    updatedAt: new Date(EXPECTED_UPDATED_AT),
    version
  };
}

function emptyDelegate(orderField: string) {
  void orderField;
  return {
    findFirst: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    upsert: ({ create }: any) => Promise.resolve(create)
  };
}

function cloneMap<K, V>(source: Map<K, V>): Map<K, V> {
  return new Map(Array.from(source, ([key, value]) => [key, structuredClone(value)]));
}

function restoreMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  target.clear();
  for (const [key, value] of source) target.set(key, value);
}
