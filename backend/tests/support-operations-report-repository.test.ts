import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ReportRepository,
  type PrismaReportClient
} from "../apps/api-gateway/src/reports/report.repository.ts";
import { buildSupportOperationsWorkspace } from "../apps/api-gateway/src/reports/support-operations-workspace.ts";

describe("support operations report repository", () => {
  it("loads tenant-scoped activity and open backlog, then merges lifecycle events and the latest rating", async () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-15T00:00:00.000Z");
    const snapshotAt = new Date("2026-08-15T12:00:00.000Z");
    const { calls, client } = createSupportOperationsPrismaClient();
    const repository = ReportRepository.prisma({ client });

    const rows = await repository.listSupportOperationsSourceRowsAsync({
      from,
      snapshotAt,
      tenantId: "tenant-volga",
      to
    });

    assert.deepEqual(rows.map((row) => row.id), [
      "conversation-delayed-close",
      "conversation-activity",
      "conversation-old-reopened",
      "conversation-backlog",
      "conversation-bot-reply"
    ]);
    const activity = rows.find((row) => row.id === "conversation-activity");
    assert.deepEqual(activity?.lifecycleEvents, [{
      data: { fromStatus: "active", resolutionOutcome: "resolved", toStatus: "closed" },
      eventType: "status.changed",
      id: "event-closed",
      ingestedAt: "2026-08-10T10:00:01.000Z",
      occurredAt: "2026-08-10T10:00:00.000Z",
      source: "conversation-service"
    }]);
    assert.deepEqual(activity?.rating, {
      createdAt: "2026-08-12T09:00:00.000Z",
      scale: "five_star",
      score: 4
    });
    assert.deepEqual(activity?.ratings, [
      { createdAt: "2026-08-11T09:00:00.000Z", scale: "five_star", score: 2 },
      { createdAt: "2026-08-12T09:00:00.000Z", scale: "five_star", score: 4 }
    ]);
    assert.equal(activity?.resolutionOutcome, "resolved");
    assert.deepEqual(activity?.messages.map((message) => message.id), ["message-before-snapshot"]);
    assert.equal(rows.find((row) => row.id === "conversation-backlog")?.status, "active");
    assert.equal(rows.find((row) => row.id === "conversation-backlog")?.lifecycleEvents, undefined);

    assert.deepEqual(calls.lifecycle[0]?.where, {
      occurredAt: { gte: from, lt: to },
      tenantId: "tenant-volga"
    });
    assert.deepEqual(calls.conversation[0]?.where, {
      OR: [
        { createdAt: { gte: from, lt: to } },
        { createdAt: { lte: snapshotAt }, updatedAt: { gte: from } },
        { id: { in: ["conversation-bot-reply", "conversation-activity"] } },
        { createdAt: { lte: snapshotAt }, status: { not: "closed" } }
      ],
      tenantId: "tenant-volga"
    });
    assert.deepEqual(calls.conversation[0]?.include, {
      messages: {
        orderBy: { createdAt: "asc" },
        where: { createdAt: { lte: snapshotAt } }
      }
    });
    assert.deepEqual(calls.lifecycle[1]?.where, {
      conversationId: { in: [
        "conversation-delayed-close",
        "conversation-activity",
        "conversation-old-reopened",
        "conversation-backlog",
        "conversation-bot-reply"
      ] },
      eventType: { in: [
        "conversation.closed",
        "conversation_closed",
        "conversation.reopened",
        "conversation_reopened",
        "conversation.resolved",
        "conversation_resolved",
        "resolution.recorded",
        "resolution_recorded",
        "resolution.reopened",
        "resolution_reopened",
        "status.changed",
        "status_changed"
      ] },
      occurredAt: { gte: from },
      tenantId: "tenant-volga"
    });
    assert.deepEqual(calls.rating[0]?.where, {
      conversationId: { in: [
        "conversation-delayed-close",
        "conversation-activity",
        "conversation-old-reopened",
        "conversation-backlog",
        "conversation-bot-reply"
      ] },
      createdAt: { lte: snapshotAt },
      tenantId: "tenant-volga"
    });
  });

  it("includes an old conversation that was open at the snapshot and closed after a delayed report materialization", async () => {
    const repository = ReportRepository.prisma({ client: createSupportOperationsPrismaClient().client });
    const snapshotAt = new Date("2026-08-15T12:00:00.000Z");

    const rows = await repository.listSupportOperationsSourceRowsAsync({
      from: new Date("2026-08-01T00:00:00.000Z"),
      snapshotAt,
      tenantId: "tenant-volga",
      // Deliberately extends beyond the snapshot and the later persisted close.
      // Public facts must still stop at snapshotAt while baseline replay sees
      // the close in order to reconstruct the earlier open state.
      to: new Date("2026-08-17T00:00:00.000Z")
    });
    const delayed = rows.find((row) => row.id === "conversation-delayed-close");
    const workspace = buildSupportOperationsWorkspace(delayed ? [delayed] : [], {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-15",
      now: snapshotAt,
      period: "custom"
    });

    assert.ok(delayed);
    assert.equal(delayed.status, "closed");
    assert.equal(delayed.updatedAt, "2026-08-16T09:00:00.000Z");
    assert.equal(delayed.lifecycleEvents, undefined);
    assert.deepEqual(delayed.statusBaseline, { at: "2026-08-01T00:00:00.000Z", closed: false });
    assert.equal(workspace.metrics.current.backlog, 1);
    assert.equal(workspace.metrics.current.waiting, 1);
  });

  it("reconstructs a pre-window closed baseline from a later reopen without scanning old lifecycle history", async () => {
    const repository = ReportRepository.prisma({ client: createSupportOperationsPrismaClient().client });
    const snapshotAt = new Date("2026-08-15T12:00:00.000Z");
    const rows = await repository.listSupportOperationsSourceRowsAsync({
      from: new Date("2026-08-14T00:00:00.000Z"),
      snapshotAt,
      tenantId: "tenant-volga",
      to: snapshotAt
    });
    const reopened = rows.find((row) => row.id === "conversation-old-reopened");
    const workspace = buildSupportOperationsWorkspace(reopened ? [reopened] : [], {
      now: snapshotAt,
      period: "today"
    });

    assert.ok(reopened);
    assert.deepEqual(reopened.statusBaseline, { at: "2026-08-14T00:00:00.000Z", closed: true });
    assert.deepEqual(reopened.lifecycleEvents?.map((event) => event.id), ["event-old-reopened"]);
    assert.equal(workspace.metrics.previous.backlog, 0);
    assert.equal(workspace.metrics.current.backlog, 1);
  });

  it("preserves persisted bot authors and excludes bot replies from every human-support message KPI", async () => {
    const repository = ReportRepository.prisma({ client: createSupportOperationsPrismaClient().client });
    const snapshotAt = new Date("2026-08-15T12:00:00.000Z");
    const rows = await repository.listSupportOperationsSourceRowsAsync({
      from: new Date("2026-08-01T00:00:00.000Z"),
      snapshotAt,
      tenantId: "tenant-volga",
      to: new Date("2026-08-15T00:00:00.000Z")
    });
    const botConversation = rows.find((row) => row.id === "conversation-bot-reply");
    const delayed = rows.find((row) => row.id === "conversation-delayed-close");
    const workspace = buildSupportOperationsWorkspace(
      [botConversation, delayed].filter((row): row is NonNullable<typeof row> => !!row),
      { dateFrom: "2026-08-01", dateTo: "2026-08-15", now: snapshotAt, period: "custom" }
    );

    assert.equal(botConversation?.messages[1]?.author, "Бот «Триаж»");
    assert.equal(delayed?.messages[1]?.author, "Бот");
    assert.equal(workspace.metrics.current.firstResponseSamples, 0);
    assert.equal(workspace.metrics.current.firstResponseMedianSeconds, null);
    assert.equal(workspace.metrics.current.agentTouches, 0);
    assert.equal(workspace.metrics.current.oneTouchResolutionCount, 0);
    assert.equal(workspace.metrics.current.waiting, 1);
  });

  it("falls back safely when canonical conversation storage is unavailable", async () => {
    const prisma = createSupportOperationsPrismaClient();
    delete (prisma.client as { conversation?: unknown }).conversation;
    const repository = ReportRepository.prisma({ client: prisma.client });
    const input = {
      from: new Date("2026-08-01T00:00:00.000Z"),
      snapshotAt: new Date("2026-08-15T12:00:00.000Z"),
      tenantId: "tenant-volga",
      to: new Date("2026-08-15T00:00:00.000Z")
    };

    assert.deepEqual(await repository.listSupportOperationsSourceRowsAsync(input), []);
    assert.equal(prisma.calls.lifecycle.length, 0);
    assert.deepEqual(await ReportRepository.inMemory().listSupportOperationsSourceRowsAsync(input), []);
  });
});

function createSupportOperationsPrismaClient(): {
  calls: {
    conversation: Array<Record<string, any>>;
    lifecycle: Array<Record<string, any>>;
    rating: Array<Record<string, any>>;
  };
  client: PrismaReportClient;
} {
  const conversations = [
    conversationRow({
      createdAt: new Date("2026-01-05T10:00:00.000Z"),
      id: "conversation-delayed-close",
      messages: [
        messageRow("delayed-client", "2026-08-14T09:00:00.000Z"),
        messageRow("delayed-bot", "2026-08-14T09:01:00.000Z", { author: "Бот", side: "agent" })
      ],
      status: "closed",
      tenantId: "tenant-volga",
      updatedAt: new Date("2026-08-16T09:00:00.000Z")
    }),
    conversationRow({
      createdAt: new Date("2026-01-10T10:00:00.000Z"),
      id: "conversation-activity",
      messages: [
        messageRow("message-before-snapshot", "2026-08-10T09:00:00.000Z"),
        messageRow("message-after-snapshot", "2026-08-16T09:00:00.000Z")
      ],
      resolutionOutcome: "resolved",
      status: "closed",
      tenantId: "tenant-volga",
      updatedAt: new Date("2026-08-16T09:00:00.000Z")
    }),
    conversationRow({
      createdAt: new Date("2026-01-15T10:00:00.000Z"),
      id: "conversation-old-reopened",
      messages: [messageRow("reopened-client", "2026-08-15T08:05:00.000Z")],
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: new Date("2026-08-15T08:00:00.000Z")
    }),
    conversationRow({
      createdAt: new Date("2026-02-10T10:00:00.000Z"),
      id: "conversation-backlog",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: new Date("2026-02-10T10:00:00.000Z")
    }),
    conversationRow({
      createdAt: new Date("2026-08-10T08:00:00.000Z"),
      id: "conversation-bot-reply",
      messages: [
        messageRow("bot-client", "2026-08-10T08:00:00.000Z"),
        messageRow("bot-agent", "2026-08-10T08:01:00.000Z", { author: "Бот «Триаж»", side: "agent" })
      ],
      status: "closed",
      tenantId: "tenant-volga",
      updatedAt: new Date("2026-08-10T09:00:00.000Z")
    }),
    conversationRow({
      createdAt: new Date("2026-08-16T10:00:00.000Z"),
      id: "conversation-future-backlog",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: new Date("2026-08-16T10:00:00.000Z")
    }),
    conversationRow({
      createdAt: new Date("2026-02-10T10:00:00.000Z"),
      id: "conversation-other-tenant",
      status: "active",
      tenantId: "tenant-ladoga",
      updatedAt: new Date("2026-08-10T10:00:00.000Z")
    })
  ];
  const lifecycleEvents = [
    {
      conversation: conversationRelation(conversations[1]!),
      conversationId: "conversation-activity",
      data: { fromStatus: "active", resolutionOutcome: "resolved", toStatus: "closed" },
      eventType: "status.changed",
      id: "event-closed",
      ingestedAt: new Date("2026-08-10T10:00:01.000Z"),
      occurredAt: new Date("2026-08-10T10:00:00.000Z"),
      source: "conversation-service",
      tenantId: "tenant-volga"
    },
    {
      conversation: conversationRelation(conversations[4]!),
      conversationId: "conversation-bot-reply",
      data: { toStatus: "closed" },
      eventType: "status.changed",
      id: "event-bot-closed",
      ingestedAt: new Date("2026-08-10T09:00:01.000Z"),
      occurredAt: new Date("2026-08-10T09:00:00.000Z"),
      source: "conversation-service",
      tenantId: "tenant-volga"
    },
    {
      conversation: conversationRelation(conversations[0]!),
      conversationId: "conversation-delayed-close",
      data: { fromStatus: "active", toStatus: "closed" },
      eventType: "status.changed",
      id: "event-delayed-closed",
      ingestedAt: new Date("2026-08-16T09:00:01.000Z"),
      occurredAt: new Date("2026-08-16T09:00:00.000Z"),
      source: "conversation-service",
      tenantId: "tenant-volga"
    },
    {
      conversation: conversationRelation(conversations[2]!),
      conversationId: "conversation-old-reopened",
      data: { fromStatus: "active", toStatus: "closed" },
      eventType: "status.changed",
      id: "event-old-closed",
      ingestedAt: new Date("2026-07-01T09:00:01.000Z"),
      occurredAt: new Date("2026-07-01T09:00:00.000Z"),
      source: "conversation-service",
      tenantId: "tenant-volga"
    },
    {
      conversation: conversationRelation(conversations[2]!),
      conversationId: "conversation-old-reopened",
      data: { fromStatus: "closed", toStatus: "active" },
      eventType: "status.changed",
      id: "event-old-reopened",
      ingestedAt: new Date("2026-08-15T08:00:01.000Z"),
      occurredAt: new Date("2026-08-15T08:00:00.000Z"),
      source: "conversation-service",
      tenantId: "tenant-volga"
    },
    {
      conversation: conversationRelation(conversations[6]!),
      conversationId: "conversation-other-tenant",
      data: {},
      eventType: "message.received",
      id: "event-other-tenant",
      ingestedAt: new Date("2026-08-10T10:00:01.000Z"),
      occurredAt: new Date("2026-08-10T10:00:00.000Z"),
      source: "conversation-service",
      tenantId: "tenant-ladoga"
    }
  ];
  const ratings = [
    { conversationId: "conversation-activity", createdAt: new Date("2026-08-11T09:00:00.000Z"), scale: "five_star", score: 2, tenantId: "tenant-volga" },
    { conversationId: "conversation-activity", createdAt: new Date("2026-08-12T09:00:00.000Z"), scale: "five_star", score: 4, tenantId: "tenant-volga" },
    { conversationId: "conversation-activity", createdAt: new Date("2026-08-16T09:00:00.000Z"), scale: "five_star", score: 1, tenantId: "tenant-volga" },
    { conversationId: "conversation-activity", createdAt: new Date("2026-08-12T09:00:00.000Z"), scale: "five_star", score: 1, tenantId: "tenant-ladoga" }
  ];
  const calls = {
    conversation: [] as Array<Record<string, any>>,
    lifecycle: [] as Array<Record<string, any>>,
    rating: [] as Array<Record<string, any>>
  };

  const client: Record<string, any> = {
    conversation: {
      findMany(input: Record<string, any>) {
        calls.conversation.push(input);
        const snapshotAt = input.include.messages.where.createdAt.lte as Date;
        return Promise.resolve(conversations
          .filter((row) => row.tenantId === input.where.tenantId && input.where.OR.some((clause: Record<string, any>) => matchesConversationClause(row, clause)))
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
          .map((row) => ({
            ...row,
            messages: row.messages.filter((message: Record<string, any>) => message.createdAt <= snapshotAt)
          })));
      }
    },
    conversationLifecycleEvent: {
      findMany(input: Record<string, any>) {
        calls.lifecycle.push(input);
        const { gte, lt } = input.where.occurredAt as { gte: Date; lt?: Date };
        const conversationIds = input.where.conversationId?.in as string[] | undefined;
        const eventTypes = input.where.eventType?.in as string[] | undefined;
        return Promise.resolve(lifecycleEvents
          .filter((row) => row.tenantId === input.where.tenantId
            && row.occurredAt >= gte
            && (!lt || row.occurredAt < lt)
            && (!conversationIds || conversationIds.includes(row.conversationId))
            && (!eventTypes || eventTypes.includes(row.eventType)))
          .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()));
      }
    },
    qualityRating: {
      findMany(input: Record<string, any>) {
        calls.rating.push(input);
        const ids = input.where.conversationId.in as string[];
        const snapshotAt = input.where.createdAt.lte as Date;
        return Promise.resolve(ratings
          .filter((row) => row.tenantId === input.where.tenantId && ids.includes(row.conversationId) && row.createdAt <= snapshotAt)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()));
      }
    },
    metricDefinition: requiredDelegate(),
    metricTenantOverride: requiredDelegate(),
    metricVersion: requiredDelegate(),
    reportExportJob: requiredDelegate(),
    reportExportRetryAuditEvent: requiredDelegate(),
    reportFileDescriptor: requiredDelegate(),
    reportIdempotencyKey: requiredDelegate(),
    reportNotificationDescriptor: requiredDelegate(),
    reportQueryExecution: requiredDelegate(),
    savedReportTemplate: requiredDelegate(),
    scheduledDigestDescriptor: requiredDelegate()
  };
  client.$transaction = (callback: (transaction: Record<string, any>) => unknown) => Promise.resolve(callback(client));

  return { calls, client: client as PrismaReportClient };
}

function conversationRow(overrides: Record<string, any>): Record<string, any> {
  return {
    channel: "Telegram",
    createdAt: new Date("2026-08-10T08:00:00.000Z"),
    id: "conversation",
    messages: [],
    operatorId: "operator-anna",
    operatorName: "Anna",
    queueId: "queue-support",
    resolutionOutcome: null,
    slaTone: "ok",
    status: "active",
    teamId: "team-support",
    tenantId: "tenant-volga",
    topic: "payments",
    updatedAt: new Date("2026-08-10T08:00:00.000Z"),
    ...overrides
  };
}

function conversationRelation(row: Record<string, any>): Record<string, any> {
  return {
    channel: row.channel,
    operatorId: row.operatorId,
    operatorName: row.operatorName,
    queueId: row.queueId,
    status: row.status,
    teamId: row.teamId,
    topic: row.topic
  };
}

function matchesConversationClause(row: Record<string, any>, clause: Record<string, any>): boolean {
  if (clause.id) {
    return clause.id.in.includes(row.id);
  }
  if (clause.updatedAt) {
    return row.createdAt <= clause.createdAt.lte && row.updatedAt >= clause.updatedAt.gte;
  }
  if (clause.status) {
    return row.status !== clause.status.not && row.createdAt <= clause.createdAt.lte;
  }
  return row.createdAt >= clause.createdAt.gte && row.createdAt < clause.createdAt.lt;
}

function messageRow(id: string, createdAt: string, overrides: Record<string, any> = {}): Record<string, any> {
  return {
    author: null,
    createdAt: new Date(createdAt),
    id,
    side: "client",
    text: id,
    time: "12:00",
    type: "text",
    ...overrides
  };
}

function requiredDelegate(): Record<string, (...args: any[]) => Promise<any>> {
  const empty = () => Promise.resolve([]);
  const missing = () => Promise.resolve(null);
  const unchanged = (input: Record<string, any>) => Promise.resolve(input.create ?? input.data ?? { count: 0 });
  return {
    create: unchanged,
    deleteMany: () => Promise.resolve({ count: 0 }),
    findMany: empty,
    findUnique: missing,
    updateMany: () => Promise.resolve({ count: 0 }),
    upsert: unchanged
  };
}
