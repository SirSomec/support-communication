import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ReportRepository, type ConversationReportSourceRow } from "../apps/api-gateway/src/reports/report.repository.ts";
import { ReportService } from "../apps/api-gateway/src/reports/report.service.ts";
import type { SupportOperationsWorkspace } from "../apps/api-gateway/src/reports/support-operations-workspace.ts";

const SNAPSHOT_AT = new Date("2026-08-18T12:00:00.000Z");

describe("support operations report service integration", () => {
  it("adds support-ops/v2 to the legacy workspace using one tenant-scoped snapshot and all conversation filters", async () => {
    const repository = ReportRepository.inMemory();
    const sourceQueries: Array<{ from: Date; snapshotAt: Date; tenantId: string; to: Date }> = [];
    repository.listSupportOperationsSourceRowsAsync = async (input) => {
      sourceQueries.push(input);
      return sourceRows();
    };
    const service = new ReportService(repository, { now: () => SNAPSHOT_AT });

    const response = await service.fetchReportWorkspace({
      channel: "SDK",
      operatorId: "operator-1",
      period: "today",
      teamId: "team-1",
      timezoneOffsetMinutes: 0,
      topic: "Payment"
    }, { tenantId: "tenant-volga" });

    assert.equal(response.status, "ok");
    assert.deepEqual(sourceQueries, [{
      from: new Date("2026-08-17T00:00:00.000Z"),
      snapshotAt: SNAPSHOT_AT,
      tenantId: "tenant-volga",
      to: SNAPSHOT_AT
    }]);

    const operations = response.data.operations as SupportOperationsWorkspace;
    assert.equal(operations.version, "support-ops/v2");
    assert.deepEqual(operations.period.current, {
      from: "2026-08-18T00:00:00.000Z",
      to: SNAPSHOT_AT.toISOString()
    });
    assert.deepEqual(operations.period.previous, {
      from: "2026-08-17T00:00:00.000Z",
      to: "2026-08-17T12:00:00.000Z"
    });
    assert.equal(operations.source.rowCount, 3);
    assert.equal(operations.metrics.current.incoming, 1);
    assert.equal(operations.metrics.current.resolved, 1);
    assert.equal(operations.metrics.current.backlog, 1);
    assert.equal(operations.metrics.current.waiting, 1);
    assert.equal(operations.metrics.current.firstResponseMedianSeconds, 60);
    assert.equal(operations.metrics.current.slaAttainmentPercent, 100);
    assert.equal(operations.metrics.previous.incoming, 1);
    assert.equal(operations.metrics.previous.resolved, 1);
    assert.equal(operations.metricDefinitions.length, Object.keys(operations.metrics.current).length);

    // The old contract remains available while clients migrate to operations.
    assert.equal(Array.isArray(response.data.rows), true);
    assert.equal((response.data.rows as unknown[]).length, 4);
    assert.deepEqual(response.data.windows, {
      current: {
        from: "2026-08-18T00:00:00.000Z",
        to: "2026-08-19T00:00:00.000Z"
      },
      previous: {
        from: "2026-08-17T00:00:00.000Z",
        to: "2026-08-18T00:00:00.000Z"
      }
    });
  });

  it("uses custom tenant-local boundaries for the canonical repository query", async () => {
    const repository = ReportRepository.inMemory();
    const sourceQueries: Array<{ from: Date; snapshotAt: Date; tenantId: string; to: Date }> = [];
    repository.listSupportOperationsSourceRowsAsync = async (input) => {
      sourceQueries.push(input);
      return [];
    };
    const service = new ReportService(repository, { now: () => SNAPSHOT_AT });

    const response = await service.fetchReportWorkspace({
      dateFrom: "2026-07-01",
      dateTo: "2026-07-03",
      period: "custom",
      timezoneOffsetMinutes: 180
    }, { tenantId: "tenant-volga" });

    assert.equal(response.status, "ok");
    assert.deepEqual(sourceQueries, [{
      from: new Date("2026-06-27T21:00:00.000Z"),
      snapshotAt: SNAPSHOT_AT,
      tenantId: "tenant-volga",
      to: new Date("2026-07-03T21:00:00.000Z")
    }]);
    const operations = response.data.operations as SupportOperationsWorkspace;
    assert.equal(operations.period.timezoneOffsetMinutes, 180);
    assert.deepEqual(operations.period.current, {
      from: "2026-06-30T21:00:00.000Z",
      to: "2026-07-03T21:00:00.000Z"
    });
  });

  it("honors persisted resolution outcomes and historical operator participation after reassignment", async () => {
    const repository = ReportRepository.inMemory();
    repository.listSupportOperationsSourceRowsAsync = async () => [
      row("reassigned", "2026-08-18T08:00:00.000Z", "2026-08-18T09:00:00.000Z", {
        lifecycleEvents: [lifecycle("assignment.changed", "2026-08-18T08:10:00.000Z", {
          toOperatorId: "operator-original"
        })],
        operatorId: "operator-current",
        operatorName: "Current operator",
        resolutionOutcome: "resolved"
      }),
      row("other-outcome", "2026-08-18T09:00:00.000Z", "2026-08-18T09:00:00.000Z", {
        resolutionOutcome: "escalated"
      })
    ];
    const service = new ReportService(repository, { now: () => SNAPSHOT_AT });

    const response = await service.fetchReportWorkspace({
      operatorId: "operator-original",
      period: "today",
      resolutionOutcome: "resolved"
    }, { tenantId: "tenant-volga" });
    const operations = response.data.operations as SupportOperationsWorkspace;

    assert.equal(response.status, "ok");
    assert.equal(operations.source.rowCount, 1);
    assert.equal(operations.metrics.current.incoming, 1);
  });

  it("materializes a missing ready JSON file from the same support-ops/v2 snapshot", async () => {
    const repository = ReportRepository.inMemory();
    repository.listSupportOperationsSourceRowsAsync = async () => [];
    repository.saveExportJob({
      auditId: "evt_support_ops_lazy_json",
      backendQueueId: "queue_support_ops_lazy_json",
      columns: ["key", "current", "workspaceVersion"],
      createdAt: SNAPSHOT_AT.toISOString(),
      filters: { snapshotAt: SNAPSHOT_AT.toISOString(), tenantId: "tenant-volga" },
      format: "JSON",
      id: "export-support-ops-lazy-json",
      metricDefinitionVersion: "metrics/v1",
      name: "Support operations",
      period: "today",
      progress: 100,
      queue: "report-export",
      requestedBy: "operator-1",
      rows: 33,
      status: "Ready",
      statusKey: "ready",
      tenantId: "tenant-volga"
    });
    const objects = new Map<string, { body: string | Buffer; contentType: string; sizeBytes: number }>();
    const service = new ReportService(repository, {
      objectStorage: {
        async getObject({ objectKey }) {
          return objects.get(objectKey);
        },
        async putObject(input) {
          const stored = {
            body: input.body,
            contentType: input.contentType,
            sizeBytes: Buffer.byteLength(input.body)
          };
          objects.set(input.objectKey, stored);
          return {
            checksum: "sha256:support-ops-lazy-json",
            sizeBytes: stored.sizeBytes,
            writtenAt: "2026-08-18T12:01:00.000Z"
          };
        }
      }
    });

    const download = await service.getExportFileDownload("export-support-ops-lazy-json", {
      canDownload: true,
      tenantId: "tenant-volga"
    });
    const payload = JSON.parse((download.data.body as Buffer).toString("utf8"));

    assert.equal(download.status, "ok");
    assert.equal(download.data.contentType, "application/json");
    assert.equal(payload.rows.length, 33);
    assert.deepEqual(payload.rows[0], {
      current: 0,
      key: "incoming",
      workspaceVersion: "support-ops/v2"
    });
    assert.deepEqual(payload.rows.find((row: Record<string, unknown>) => row.key === "firstResponseMedianSeconds"), {
      current: null,
      key: "firstResponseMedianSeconds",
      workspaceVersion: "support-ops/v2"
    });
  });
});

function sourceRows(): ConversationReportSourceRow[] {
  return [
    row("current", "2026-08-18T08:00:00.000Z", "2026-08-18T09:00:00.000Z", {
      lifecycleEvents: [
        lifecycle("conversation.created", "2026-08-18T08:00:00.000Z"),
        lifecycle("sla.met", "2026-08-18T08:01:00.000Z"),
        lifecycle("status.changed", "2026-08-18T09:00:00.000Z", { toStatus: "closed" })
      ],
      messages: [
        message("current-client", "2026-08-18T08:00:00.000Z", "client"),
        message("current-agent", "2026-08-18T08:01:00.000Z", "agent")
      ],
      status: "closed"
    }),
    row("previous", "2026-08-17T08:00:00.000Z", "2026-08-17T09:00:00.000Z", {
      lifecycleEvents: [
        lifecycle("conversation.created", "2026-08-17T08:00:00.000Z"),
        lifecycle("status.changed", "2026-08-17T09:00:00.000Z", { toStatus: "closed" })
      ],
      messages: [
        message("previous-client", "2026-08-17T08:00:00.000Z", "client"),
        message("previous-agent", "2026-08-17T08:02:00.000Z", "agent")
      ],
      status: "closed"
    }),
    row("backlog", "2026-08-01T08:00:00.000Z", "2026-08-18T10:00:00.000Z", {
      messages: [message("backlog-client", "2026-08-18T10:00:00.000Z", "client")]
    }),
    row("other-team", "2026-08-18T10:00:00.000Z", "2026-08-18T10:00:00.000Z", {
      teamId: "team-2"
    })
  ];
}

function row(
  id: string,
  createdAt: string,
  updatedAt: string,
  overrides: Partial<ConversationReportSourceRow> = {}
): ConversationReportSourceRow {
  return {
    channel: "SDK",
    createdAt,
    id,
    messages: [],
    operatorId: "operator-1",
    operatorName: "Alex",
    queueId: "queue-1",
    resolutionOutcome: "resolved",
    slaTone: "unknown",
    status: "active",
    teamId: "team-1",
    topic: "Payment",
    updatedAt,
    ...overrides
  };
}

function message(id: string, createdAt: string, side: "agent" | "client"): ConversationReportSourceRow["messages"][number] {
  return { createdAt, id, side, text: id, time: createdAt };
}

function lifecycle(
  eventType: string,
  occurredAt: string,
  data: Record<string, unknown> = {}
): NonNullable<ConversationReportSourceRow["lifecycleEvents"]>[number] {
  return { data, eventType, id: `${eventType}-${occurredAt}`, occurredAt, source: "test" };
}
