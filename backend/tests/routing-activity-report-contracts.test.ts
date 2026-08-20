import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { IdentityTenantUser } from "../apps/api-gateway/src/identity/identity.types.ts";
import {
  ReportRepository,
  type PrismaReportClient,
  type RoutingActivityReportSourceRow
} from "../apps/api-gateway/src/reports/report.repository.ts";
import { ReportService } from "../apps/api-gateway/src/reports/report.service.ts";
import { bootstrapReportState } from "../apps/api-gateway/src/reports/seed.ts";

const NOW = new Date("2026-07-10T12:00:00.000Z");

describe("routing activity report contracts", () => {
  it("aggregates real assignment and transfer rows and excludes another tenant", async () => {
    const calls: Array<{ orderBy: { occurredAt: "asc" }; where: Record<string, unknown> }> = [];
    const repository = ReportRepository.prisma({
      client: prismaClientWithRoutingRows([
        routingRow("assignment-volga", "tenant-volga", "assignment", "2026-07-10T08:00:00.000Z", {
          channel: "Telegram",
          toOperatorId: "operator-a"
        }),
        routingRow("transfer-volga", "tenant-volga", "transfer", "2026-07-10T09:00:00.000Z", {
          channel: "Telegram",
          fromOperatorId: "operator-a",
          toOperatorId: "operator-b"
        }),
        routingRow("assignment-foreign", "tenant-ladoga", "assignment", "2026-07-10T10:00:00.000Z", {
          channel: "Telegram",
          toOperatorId: "operator-c"
        }),
        routingRow("assignment-old", "tenant-volga", "assignment", "2026-07-09T10:00:00.000Z", {
          channel: "Telegram",
          toOperatorId: "operator-a"
        })
      ], calls)
    });
    const service = new ReportService(repository, { now: () => NOW });

    const envelope = await service.fetchRoutingActivityReport(
      { period: "today" },
      { tenantId: "tenant-volga" }
    );

    assert.equal(envelope.status, "ok");
    assert.equal(envelope.data.source, "routing_analytics_rows");
    assert.equal(envelope.data.empty, false);
    assert.equal(envelope.data.hasActivity, true);
    assert.deepEqual(envelope.data.totals, {
      assignments: 1,
      operators: 2,
      totalEvents: 2,
      transfers: 1,
      unattributedEvents: 0
    });
    assert.deepEqual(envelope.data.rows, [
      {
        assignments: 1,
        operatorId: "operator-a",
        totalEvents: 2,
        transferEvents: 1,
        transfersFrom: 1,
        transfersTo: 0
      },
      {
        assignments: 0,
        operatorId: "operator-b",
        totalEvents: 1,
        transferEvents: 1,
        transfersFrom: 0,
        transfersTo: 1
      }
    ]);
    assert.deepEqual(calls[0], {
      orderBy: { occurredAt: "asc" },
      where: {
        eventKind: { in: ["assignment", "transfer"] },
        occurredAt: {
          gte: new Date("2026-07-10T00:00:00.000Z"),
          lt: new Date("2026-07-11T00:00:00.000Z")
        },
        tenantId: "tenant-volga"
      }
    });
  });

  it("applies channel, operator and event type filters without inventing performance metrics", async () => {
    const calls: Array<{ orderBy: { occurredAt: "asc" }; where: Record<string, unknown> }> = [];
    const repository = ReportRepository.prisma({
      client: prismaClientWithRoutingRows([
        routingRow("transfer-telegram", "tenant-volga", "transfer", "2026-07-10T08:00:00.000Z", {
          channel: "Telegram",
          fromOperatorId: "operator-a",
          toOperatorId: "operator-b"
        }),
        routingRow("transfer-email", "tenant-volga", "transfer", "2026-07-10T09:00:00.000Z", {
          channel: "Email",
          fromOperatorId: "operator-a",
          toOperatorId: "operator-b"
        }),
        routingRow("assignment-telegram", "tenant-volga", "assignment", "2026-07-10T10:00:00.000Z", {
          channel: "Telegram",
          toOperatorId: "operator-b"
        })
      ], calls)
    });
    const service = new ReportService(repository, { now: () => NOW });

    const envelope = await service.fetchRoutingActivityReport({
      channel: "Telegram",
      eventType: "transfer",
      operatorId: "operator-b",
      period: "today"
    }, { tenantId: "tenant-volga" });

    assert.deepEqual(envelope.data.filters, {
      channel: "Telegram",
      eventType: "transfer",
      operatorId: "operator-b",
      period: "today",
      queueId: "all",
      resolutionOutcome: "all",
      status: "all",
      teamId: "all",
      topic: "all"
    });
    assert.deepEqual(envelope.data.totals, {
      assignments: 0,
      operators: 1,
      totalEvents: 1,
      transfers: 1,
      unattributedEvents: 0
    });
    assert.deepEqual(envelope.data.rows, [{
      assignments: 0,
      operatorId: "operator-b",
      totalEvents: 1,
      transferEvents: 1,
      transfersFrom: 0,
      transfersTo: 1
    }]);
    assert.equal(Object.hasOwn(envelope.data, "performance"), false);
    assert.deepEqual(calls[0]?.where, {
      channel: "Telegram",
      eventKind: "transfer",
      occurredAt: {
        gte: new Date("2026-07-10T00:00:00.000Z"),
        lt: new Date("2026-07-11T00:00:00.000Z")
      },
      OR: [
        { fromOperatorId: "operator-b" },
        { toOperatorId: "operator-b" }
      ],
      tenantId: "tenant-volga"
    });
  });

  it("enriches routing-only rows with tenant employee names while leaving unknown ids untouched", async () => {
    const repository = ReportRepository.prisma({
      client: prismaClientWithRoutingRows([
        routingRow("assignment-known", "tenant-volga", "assignment", "2026-07-10T08:00:00.000Z", {
          toOperatorId: "operator-a"
        }),
        routingRow("assignment-unknown", "tenant-volga", "assignment", "2026-07-10T09:00:00.000Z", {
          toOperatorId: "operator-unknown"
        })
      ], [])
    });
    const service = new ReportService(repository, {
      identityRepository: {
        findTenantUsers: async (tenantId) => [
          tenantUser("operator-a", "Анна Соколова", tenantId),
          tenantUser("operator-foreign", "Не из этого tenant", "tenant-ladoga")
        ]
      },
      now: () => NOW
    });

    const envelope = await service.fetchRoutingActivityReport({ period: "today" }, { tenantId: "tenant-volga" });
    const rows = envelope.data.rows as Array<{ operatorId: string; operatorName?: string }>;

    assert.equal(rows.find((row) => row.operatorId === "operator-a")?.operatorName, "Анна Соколова");
    assert.equal(rows.find((row) => row.operatorId === "operator-unknown")?.operatorName, undefined);
  });

  it("applies a tenant-scoped custom date window with the request timezone", async () => {
    const calls: Array<{ orderBy: { occurredAt: "asc" }; where: Record<string, unknown> }> = [];
    const repository = ReportRepository.prisma({
      client: prismaClientWithRoutingRows([
        routingRow("custom-start", "tenant-volga", "assignment", "2026-07-07T21:30:00.000Z", {
          toOperatorId: "operator-a"
        }),
        routingRow("custom-end", "tenant-volga", "transfer", "2026-07-09T20:59:59.000Z", {
          fromOperatorId: "operator-a",
          toOperatorId: "operator-b"
        }),
        routingRow("outside-end", "tenant-volga", "assignment", "2026-07-09T21:00:00.000Z", {
          toOperatorId: "operator-a"
        }),
        routingRow("foreign-tenant", "tenant-ladoga", "assignment", "2026-07-08T12:00:00.000Z", {
          toOperatorId: "operator-c"
        })
      ], calls)
    });
    const service = new ReportService(repository, { now: () => NOW });

    const envelope = await service.fetchRoutingActivityReport({
      dateFrom: "2026-07-08",
      dateTo: "2026-07-09",
      period: "custom",
      timezoneOffsetMinutes: 180
    }, { tenantId: "tenant-volga" });

    assert.equal(envelope.status, "ok");
    assert.deepEqual(envelope.data.filters, {
      channel: "all",
      dateFrom: "2026-07-08",
      dateTo: "2026-07-09",
      eventType: "all",
      operatorId: "all",
      period: "custom",
      queueId: "all",
      resolutionOutcome: "all",
      status: "all",
      teamId: "all",
      timezoneOffsetMinutes: 180,
      topic: "all"
    });
    assert.equal(envelope.data.totals.totalEvents, 2);
    assert.deepEqual(envelope.data.windows, {
      current: {
        from: "2026-07-07T21:00:00.000Z",
        to: "2026-07-09T21:00:00.000Z"
      }
    });
    assert.deepEqual(calls[0]?.where, {
      eventKind: { in: ["assignment", "transfer"] },
      occurredAt: {
        gte: new Date("2026-07-07T21:00:00.000Z"),
        lt: new Date("2026-07-09T21:00:00.000Z")
      },
      tenantId: "tenant-volga"
    });
  });

  it("reconstructs routing dimensions before post-event changes using bounded tenant lifecycle history", async () => {
    const calls = {
      conversation: [] as Array<Record<string, any>>,
      lifecycle: [] as Array<Record<string, any>>,
      routing: [] as Array<Record<string, any>>
    };
    const repository = ReportRepository.prisma({
      client: prismaClientWithRoutingConversationDimensions(calls)
    });
    const service = new ReportService(repository, { now: () => NOW });

    const envelope = await service.fetchRoutingActivityReport({
      period: "today",
      queueId: "queue-a",
      resolutionOutcome: "resolved",
      status: "assigned",
      teamId: "team-a",
      topic: "Payments"
    }, { tenantId: "tenant-volga" });

    assert.equal(envelope.status, "ok");
    assert.deepEqual(envelope.data.filters, {
      channel: "all",
      eventType: "all",
      operatorId: "all",
      period: "today",
      queueId: "queue-a",
      resolutionOutcome: "resolved",
      status: "assigned",
      teamId: "team-a",
      topic: "Payments"
    });
    assert.deepEqual(envelope.data.totals, {
      assignments: 2,
      operators: 2,
      totalEvents: 2,
      transfers: 0,
      unattributedEvents: 0
    });
    assert.deepEqual(envelope.data.rows, [
      {
        assignments: 1,
        operatorId: "operator-a",
        totalEvents: 1,
        transferEvents: 0,
        transfersFrom: 0,
        transfersTo: 0
      },
      {
        assignments: 1,
        operatorId: "operator-r",
        totalEvents: 1,
        transferEvents: 0,
        transfersFrom: 0,
        transfersTo: 0
      }
    ]);

    const newStateEnvelope = await service.fetchRoutingActivityReport({
      period: "today",
      queueId: "queue-later",
      resolutionOutcome: "resolved",
      status: "closed",
      teamId: "team-later",
      topic: "Later topic"
    }, { tenantId: "tenant-volga" });
    assert.equal(newStateEnvelope.data.totals.totalEvents, 0);
    assert.deepEqual(newStateEnvelope.data.rows, []);

    const unrelatedStatusEnvelope = await service.fetchRoutingActivityReport({
      period: "today",
      queueId: "queue-a",
      resolutionOutcome: "resolved",
      status: "ok",
      teamId: "team-a",
      topic: "Payments"
    }, { tenantId: "tenant-volga" });
    assert.equal(unrelatedStatusEnvelope.data.totals.totalEvents, 0);
    assert.deepEqual(unrelatedStatusEnvelope.data.rows, []);

    assert.equal(calls.routing[0]?.where.tenantId, "tenant-volga");
    assert.equal(calls.conversation[0]?.where.tenantId, "tenant-volga");
    assert.ok(calls.lifecycle.length >= 1);
    assert.ok(calls.lifecycle.every((call) => call.where.tenantId === "tenant-volga"));
    const historyCall = calls.lifecycle.find((call) => call.where.occurredAt === undefined);
    assert.ok(historyCall);
    assert.deepEqual(historyCall.where, {
      conversationId: {
        in: ["conversation-match", "conversation-reverse", "conversation-mismatch"]
      },
      tenantId: "tenant-volga"
    });
  });

  it("returns an explicit empty state instead of seeded report fixtures", async () => {
    const service = new ReportService(ReportRepository.inMemory(bootstrapReportState()), {
      now: () => NOW
    });

    const envelope = await service.fetchRoutingActivityReport(
      { channel: "Все каналы", period: "today" },
      { tenantId: "tenant-volga" }
    );

    assert.equal(envelope.status, "ok");
    assert.equal(envelope.data.source, "routing_analytics_rows");
    assert.equal(envelope.data.empty, true);
    assert.equal(envelope.data.hasActivity, false);
    assert.deepEqual(envelope.data.rows, []);
    assert.deepEqual(envelope.data.totals, {
      assignments: 0,
      operators: 0,
      totalEvents: 0,
      transfers: 0,
      unattributedEvents: 0
    });
  });

  it("fails closed when tenant scope is missing", async () => {
    const service = new ReportService(ReportRepository.inMemory(bootstrapReportState()), {
      now: () => NOW
    });

    const envelope = await service.fetchRoutingActivityReport({ period: "today" });

    assert.equal(envelope.status, "denied");
    assert.equal(envelope.error?.code, "routing_activity_tenant_scope_required");
  });
});

function routingRow(
  id: string,
  tenantId: string,
  eventKind: "assignment" | "transfer",
  occurredAt: string,
  overrides: Partial<RoutingActivityReportSourceRow> = {}
): RoutingActivityReportSourceRow {
  return {
    channel: "Telegram",
    conversationId: `conversation-${id}`,
    eventKind,
    fromOperatorId: null,
    id,
    occurredAt,
    source: "api",
    tenantId,
    toOperatorId: null,
    ...overrides
  };
}

function prismaClientWithRoutingRows(
  rows: RoutingActivityReportSourceRow[],
  calls: Array<{ orderBy: { occurredAt: "asc" }; where: Record<string, unknown> }>
): PrismaReportClient {
  const unusedDelegate = {};
  return {
    metricDefinition: unusedDelegate,
    metricTenantOverride: unusedDelegate,
    metricVersion: unusedDelegate,
    reportExportJob: unusedDelegate,
    reportExportRetryAuditEvent: unusedDelegate,
    reportFileDescriptor: unusedDelegate,
    reportIdempotencyKey: unusedDelegate,
    reportNotificationDescriptor: unusedDelegate,
    reportQueryExecution: unusedDelegate,
    routingAnalyticsRow: {
      findMany(input) {
        calls.push(input);
        return Promise.resolve(rows.map((row) => ({
          ...row,
          fromOperatorId: row.fromOperatorId ?? null,
          occurredAt: new Date(row.occurredAt),
          toOperatorId: row.toOperatorId ?? null
        })));
      }
    },
    savedReportTemplate: unusedDelegate,
    scheduledDigestDescriptor: unusedDelegate,
    $transaction() {
      throw new Error("not_used");
    }
  } as unknown as PrismaReportClient;
}

function tenantUser(id: string, name: string, tenantId: string): IdentityTenantUser {
  return {
    device: "desktop",
    email: id + "@example.test",
    id,
    inviteStatus: "accepted",
    lastActiveAt: null,
    metadata: {},
    mfa: "disabled",
    name,
    risk: "low",
    role: "employee",
    sessions: 1,
    status: "active",
    supportNotes: "",
    tenantId
  };
}

function prismaClientWithRoutingConversationDimensions(calls: {
  conversation: Array<Record<string, any>>;
  lifecycle: Array<Record<string, any>>;
  routing: Array<Record<string, any>>;
}): PrismaReportClient {
  const conversations = [
    routingConversation("conversation-match", "tenant-volga", {
      // Persisted state has moved on; the last old-state observation is before
      // the report window and must still govern the later routing event.
      queueId: "queue-later",
      resolutionOutcome: "resolved",
      status: "closed",
      teamId: "team-later",
      topic: "Later topic"
    }),
    routingConversation("conversation-reverse", "tenant-volga", {
      // This row has no earlier observation. Its first post-event transition
      // carries from* provenance, which reconstructs the routing-time state.
      queueId: "queue-later",
      resolutionOutcome: "resolved",
      status: "closed",
      teamId: "team-later",
      topic: "Later topic"
    }),
    routingConversation("conversation-mismatch", "tenant-volga", {
      // The current row matches, but the event-time lifecycle facets do not.
      queueId: "queue-a",
      resolutionOutcome: "resolved",
      status: "assigned",
      teamId: "team-a",
      topic: "Payments"
    }),
    routingConversation("conversation-foreign", "tenant-ladoga", {
      queueId: "queue-a",
      resolutionOutcome: "resolved",
      status: "assigned",
      teamId: "team-a",
      topic: "Payments"
    })
  ];
  const lifecycle = [
    routingFacetLifecycle(conversations[0]!, "2026-07-09T20:00:00.000Z", {
      queueId: "queue-a",
      teamId: "team-a",
      toStatus: "assigned",
      toTopic: "Payments"
    }),
    // Generic status belongs to the event/provider payload, not to the
    // conversation lifecycle. It must not shadow the earlier toStatus.
    routingFacetLifecycle(conversations[0]!, "2026-07-10T07:30:00.000Z", {
      status: "ok"
    }),
    routingFacetLifecycle(conversations[0]!, "2026-07-10T10:00:00.000Z", {
      fromQueueId: "queue-a",
      fromStatus: "assigned",
      fromTeamId: "team-a",
      fromTopic: "Payments",
      toQueueId: "queue-later",
      toStatus: "closed",
      toTeamId: "team-later",
      toTopic: "Later topic"
    }),
    routingFacetLifecycle(conversations[1]!, "2026-07-10T10:30:00.000Z", {
      fromQueueId: "queue-a",
      fromStatus: "assigned",
      fromTeamId: "team-a",
      fromTopic: "Payments",
      toQueueId: "queue-later",
      toStatus: "closed",
      toTeamId: "team-later",
      toTopic: "Later topic"
    }),
    routingFacetLifecycle(conversations[2]!, "2026-07-09T19:00:00.000Z", {
      queueId: "queue-b",
      teamId: "team-b",
      toStatus: "queued",
      toTopic: "Refunds"
    }),
    routingFacetLifecycle(conversations[3]!, "2026-07-10T10:00:00.000Z", {
      queueId: "queue-a",
      teamId: "team-a",
      toStatus: "assigned",
      toTopic: "Payments"
    })
  ];
  const routing = [
    routingRow("match", "tenant-volga", "assignment", "2026-07-10T08:00:00.000Z", {
      conversationId: "conversation-match",
      toOperatorId: "operator-a"
    }),
    routingRow("reverse", "tenant-volga", "assignment", "2026-07-10T08:30:00.000Z", {
      conversationId: "conversation-reverse",
      toOperatorId: "operator-r"
    }),
    routingRow("mismatch", "tenant-volga", "assignment", "2026-07-10T09:00:00.000Z", {
      conversationId: "conversation-mismatch",
      toOperatorId: "operator-b"
    }),
    routingRow("foreign", "tenant-ladoga", "assignment", "2026-07-10T10:00:00.000Z", {
      conversationId: "conversation-foreign",
      toOperatorId: "operator-c"
    })
  ];
  const unusedDelegate = {};
  return {
    conversation: {
      findMany(input: Record<string, any>) {
        calls.conversation.push(input);
        const snapshotAt = input.include.messages.where.createdAt.lte as Date;
        return Promise.resolve(conversations
          .filter((row) => row.tenantId === input.where.tenantId)
          .map((row) => ({
            ...row,
            messages: row.messages.filter((message: Record<string, any>) => message.createdAt <= snapshotAt)
          })));
      }
    },
    conversationLifecycleEvent: {
      findMany(input: Record<string, any>) {
        calls.lifecycle.push(input);
        const occurredAt = input.where.occurredAt as { gte?: Date; lt?: Date } | undefined;
        const conversationIds = input.where.conversationId?.in as string[] | undefined;
        const eventTypes = input.where.eventType?.in as string[] | undefined;
        return Promise.resolve(lifecycle.filter((row) => row.tenantId === input.where.tenantId
          && (!occurredAt?.gte || row.occurredAt >= occurredAt.gte)
          && (!occurredAt?.lt || row.occurredAt < occurredAt.lt)
          && (!conversationIds || conversationIds.includes(row.conversationId))
          && (!eventTypes || eventTypes.includes(row.eventType))));
      }
    },
    metricDefinition: unusedDelegate,
    metricTenantOverride: unusedDelegate,
    metricVersion: unusedDelegate,
    qualityRating: { findMany: () => Promise.resolve([]) },
    reportExportJob: unusedDelegate,
    reportExportRetryAuditEvent: unusedDelegate,
    reportFileDescriptor: unusedDelegate,
    reportIdempotencyKey: unusedDelegate,
    reportNotificationDescriptor: unusedDelegate,
    reportQueryExecution: unusedDelegate,
    routingAnalyticsRow: {
      findMany(input: Record<string, any>) {
        calls.routing.push(input);
        const where = input.where as Record<string, any>;
        return Promise.resolve(routing
          .filter((row) => row.tenantId === where.tenantId
            && new Date(row.occurredAt) >= where.occurredAt.gte
            && new Date(row.occurredAt) < where.occurredAt.lt)
          .map((row) => ({
            ...row,
            occurredAt: new Date(row.occurredAt)
          })));
      }
    },
    savedReportTemplate: unusedDelegate,
    scheduledDigestDescriptor: unusedDelegate,
    $transaction() {
      throw new Error("not_used");
    }
  } as unknown as PrismaReportClient;
}

function routingConversation(
  id: string,
  tenantId: string,
  overrides: Record<string, unknown>
): Record<string, any> {
  return {
    channel: "Telegram",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    id,
    messages: [],
    operatorId: null,
    operatorName: null,
    queueId: null,
    resolutionOutcome: null,
    slaTone: "ok",
    status: "active",
    teamId: null,
    tenantId,
    topic: "General",
    updatedAt: new Date("2026-07-10T10:00:00.000Z"),
    ...overrides
  };
}

function routingFacetLifecycle(
  conversation: Record<string, any>,
  occurredAt: string,
  data: Record<string, unknown>
): Record<string, any> {
  return {
    conversation: {
      channel: conversation.channel,
      operatorId: conversation.operatorId,
      operatorName: conversation.operatorName,
      queueId: conversation.queueId,
      status: conversation.status,
      teamId: conversation.teamId,
      topic: conversation.topic
    },
    conversationId: conversation.id,
    data,
    eventType: "assignment.changed",
    id: `lifecycle-${conversation.id}-${occurredAt}`,
    ingestedAt: new Date(occurredAt),
    occurredAt: new Date(occurredAt),
    source: "routing-api",
    tenantId: conversation.tenantId
  };
}
