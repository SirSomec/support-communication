import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
      period: "today"
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
