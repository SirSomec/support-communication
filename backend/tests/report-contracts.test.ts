import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it } from "node:test";
import { resolveReportStoreFile } from "../apps/api-gateway/src/reports/bootstrap.ts";
import { ReportRepository } from "../apps/api-gateway/src/reports/report.repository.ts";
import { ReportService } from "../apps/api-gateway/src/reports/report.service.ts";
import { bootstrapReportState, exportJobFixtures } from "../apps/api-gateway/src/reports/seed.ts";

describe("phase 5 reports, exports and metric definition backend contracts", () => {
  it("persists tenant-scoped metric definitions through the report repository", () => {
    const repository = ReportRepository.inMemory();

    const saved = repository.saveMetricDefinition({
      createdAt: "2026-06-30T08:00:00.000Z",
      description: "Median time until the first operator response.",
      id: "metric_first_response",
      key: "first_response_seconds",
      name: "First response time",
      source: "conversation",
      tenantId: "tenant-volga",
      unit: "seconds",
      updatedAt: "2026-06-30T08:00:00.000Z"
    });
    repository.saveMetricDefinition({
      createdAt: "2026-06-30T08:05:00.000Z",
      description: "Foreign tenant metric",
      id: "metric_foreign",
      key: "first_response_seconds",
      name: "Foreign first response",
      source: "conversation",
      tenantId: "tenant-ladoga",
      unit: "seconds",
      updatedAt: "2026-06-30T08:05:00.000Z"
    });

    const rows = repository.listMetricDefinitions({
      key: "first_response_seconds",
      tenantId: "tenant-volga"
    });
    rows[0].name = "Mutated outside repository";

    assert.equal(saved.key, "first_response_seconds");
    assert.equal(saved.tenantId, "tenant-volga");
    assert.deepEqual(repository.listMetricDefinitions({
      key: "first_response_seconds",
      tenantId: "tenant-volga"
    }).map((metric) => metric.id), ["metric_first_response"]);
    assert.equal(repository.findMetricDefinition("metric_first_response", { tenantId: "tenant-volga" })?.name, "First response time");
    assert.equal(repository.findMetricDefinition("metric_first_response", { tenantId: "tenant-ladoga" }), undefined);
  });

  it("persists metric definitions through the JSON report repository", () => {
    const workspace = mkdtempSync(join(tmpdir(), "report-metric-definitions-"));
    try {
      const filePath = join(workspace, "reports.json");
      const first = ReportRepository.open({ filePath });

      first.saveMetricDefinition({
        createdAt: "2026-06-30T09:00:00.000Z",
        description: "Median time until the first operator response.",
        id: "metric_json_first_response",
        key: "first_response_seconds",
        name: "First response time",
        source: "conversation",
        tenantId: "tenant-volga",
        unit: "seconds",
        updatedAt: "2026-06-30T09:00:00.000Z"
      });

      const second = ReportRepository.open({ filePath });

      assert.deepEqual(second.listMetricDefinitions({
        key: "first_response_seconds",
        tenantId: "tenant-volga"
      }).map((metric) => metric.id), ["metric_json_first_response"]);
      assert.equal(second.findMetricDefinition("metric_json_first_response", { tenantId: "tenant-volga" })?.unit, "seconds");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists tenant-scoped metric versions through the report repository", () => {
    const repository = ReportRepository.inMemory();

    const saved = repository.saveMetricVersion({
      createdAt: "2026-06-30T08:10:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_v1",
      queryKey: "conversation.first_response_seconds",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:10:00.000Z",
      version: "v1"
    });
    repository.saveMetricVersion({
      createdAt: "2026-06-30T08:15:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_foreign_v1",
      queryKey: "conversation.first_response_seconds",
      status: "active",
      tenantId: "tenant-ladoga",
      updatedAt: "2026-06-30T08:15:00.000Z",
      version: "v1"
    });

    const rows = repository.listMetricVersions({
      definitionId: "metric_first_response",
      tenantId: "tenant-volga"
    });
    rows[0].status = "retired";

    assert.equal(saved.version, "v1");
    assert.equal(saved.status, "active");
    assert.deepEqual(repository.listMetricVersions({
      definitionId: "metric_first_response",
      tenantId: "tenant-volga"
    }).map((version) => version.id), ["metric_first_response_v1"]);
    assert.equal(repository.findMetricVersion("metric_first_response_v1", { tenantId: "tenant-volga" })?.status, "active");
    assert.equal(repository.findMetricVersion("metric_first_response_v1", { tenantId: "tenant-ladoga" }), undefined);
  });

  it("selects the latest active tenant-scoped metric version", async () => {
    const repository = ReportRepository.inMemory();
    repository.saveMetricVersion({
      createdAt: "2026-06-30T08:00:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_draft",
      queryKey: "conversation.first_response_seconds.draft",
      status: "draft",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:30:00.000Z",
      version: "v3"
    });
    repository.saveMetricVersion({
      createdAt: "2026-06-30T08:00:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_active_old",
      queryKey: "conversation.first_response_seconds.v1",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:10:00.000Z",
      version: "v1"
    });
    repository.saveMetricVersion({
      createdAt: "2026-06-30T08:00:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_active_new",
      queryKey: "conversation.first_response_seconds.v2",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:20:00.000Z",
      version: "v2"
    });
    repository.saveMetricVersion({
      createdAt: "2026-06-30T08:00:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_active_tie",
      queryKey: "conversation.first_response_seconds.v10",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:20:00.000Z",
      version: "v10"
    });
    repository.saveMetricVersion({
      createdAt: "2026-06-30T08:00:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_foreign_active",
      queryKey: "conversation.first_response_seconds.foreign",
      status: "active",
      tenantId: "tenant-ladoga",
      updatedAt: "2026-06-30T08:40:00.000Z",
      version: "v9"
    });

    const selected = await repository.findActiveMetricVersion("tenant-volga", "metric_first_response");
    const missing = await repository.findActiveMetricVersion("tenant-volga", "metric_missing");

    assert.equal(selected?.id, "metric_first_response_active_tie");
    assert.equal(selected?.queryKey, "conversation.first_response_seconds.v10");
    assert.equal(missing, undefined);
  });

  it("resolves tenant metric overrides before active metric versions", async () => {
    const repository = ReportRepository.inMemory();
    repository.saveMetricVersion({
      createdAt: "2026-06-30T08:00:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_active",
      queryKey: "conversation.first_response_seconds.default",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:20:00.000Z",
      version: "v1"
    });
    repository.saveMetricVersion({
      createdAt: "2026-06-30T08:00:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_override_version",
      queryKey: "conversation.first_response_seconds.override",
      status: "draft",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:40:00.000Z",
      version: "v2"
    });
    repository.saveMetricTenantOverride({
      createdAt: "2026-06-30T08:45:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_override",
      metricVersionId: "metric_first_response_override_version",
      reason: "Tenant-specific cutoff",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:45:00.000Z"
    });
    repository.saveMetricTenantOverride({
      createdAt: "2026-06-30T08:50:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_foreign_override",
      metricVersionId: "metric_first_response_foreign_version",
      reason: "Foreign tenant override",
      tenantId: "tenant-ladoga",
      updatedAt: "2026-06-30T08:50:00.000Z"
    });

    const selected = await repository.resolveMetricVersion("tenant-volga", "metric_first_response");
    const fallback = await repository.resolveMetricVersion("tenant-volga", "metric_missing");

    assert.equal(selected?.id, "metric_first_response_override_version");
    assert.equal(selected?.queryKey, "conversation.first_response_seconds.override");
    assert.equal(fallback, undefined);
  });

  it("fails closed before persisting malformed metric records", () => {
    const repository = ReportRepository.inMemory();

    assert.throws(
      () => repository.saveMetricDefinition({
        createdAt: "2026-06-30T08:00:00.000Z",
        description: "Missing key",
        id: "metric_malformed_definition",
        key: " ",
        name: "Malformed metric",
        source: "conversation",
        tenantId: "tenant-volga",
        unit: "seconds",
        updatedAt: "2026-06-30T08:00:00.000Z"
      }),
      /metric_definition_key_required/
    );
    assert.throws(
      () => repository.saveMetricVersion({
        createdAt: "2026-06-30T08:00:00.000Z",
        definitionId: "metric_first_response",
        id: "metric_malformed_version",
        queryKey: " ",
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-30T08:00:00.000Z",
        version: "v1"
      }),
      /metric_version_query_key_required/
    );
    assert.throws(
      () => repository.saveMetricTenantOverride({
        createdAt: "2026-06-30T08:00:00.000Z",
        definitionId: "metric_first_response",
        id: "metric_malformed_override",
        metricVersionId: " ",
        reason: "Malformed override",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-30T08:00:00.000Z"
      }),
      /metric_tenant_override_metric_version_required/
    );
  });

  it("persists metric versions through the JSON report repository", () => {
    const workspace = mkdtempSync(join(tmpdir(), "report-metric-versions-"));
    try {
      const filePath = join(workspace, "reports.json");
      const first = ReportRepository.open({ filePath });

      first.saveMetricVersion({
        createdAt: "2026-06-30T09:10:00.000Z",
        definitionId: "metric_first_response",
        id: "metric_json_first_response_v1",
        queryKey: "conversation.first_response_seconds",
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-30T09:10:00.000Z",
        version: "v1"
      });

      const second = ReportRepository.open({ filePath });

      assert.deepEqual(second.listMetricVersions({
        definitionId: "metric_first_response",
        tenantId: "tenant-volga"
      }).map((version) => version.id), ["metric_json_first_response_v1"]);
      assert.equal(second.findMetricVersion("metric_json_first_response_v1", { tenantId: "tenant-volga" })?.queryKey, "conversation.first_response_seconds");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists tenant-scoped metric version overrides through the report repository", () => {
    const repository = ReportRepository.inMemory();

    const saved = repository.saveMetricTenantOverride({
      createdAt: "2026-06-30T08:20:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_tenant_override",
      metricVersionId: "metric_first_response_v2",
      reason: "Tenant-specific reporting cutoff",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T08:20:00.000Z"
    });
    repository.saveMetricTenantOverride({
      createdAt: "2026-06-30T08:25:00.000Z",
      definitionId: "metric_first_response",
      id: "metric_first_response_foreign_override",
      metricVersionId: "metric_first_response_ladoga_v2",
      reason: "Foreign override",
      tenantId: "tenant-ladoga",
      updatedAt: "2026-06-30T08:25:00.000Z"
    });

    const rows = repository.listMetricTenantOverrides({
      definitionId: "metric_first_response",
      tenantId: "tenant-volga"
    });
    rows[0].reason = "Mutated outside repository";

    assert.equal(saved.metricVersionId, "metric_first_response_v2");
    assert.equal(saved.tenantId, "tenant-volga");
    assert.deepEqual(repository.listMetricTenantOverrides({
      definitionId: "metric_first_response",
      tenantId: "tenant-volga"
    }).map((override) => override.id), ["metric_first_response_tenant_override"]);
    assert.equal(repository.findMetricTenantOverride("metric_first_response_tenant_override", { tenantId: "tenant-volga" })?.reason, "Tenant-specific reporting cutoff");
    assert.equal(repository.findMetricTenantOverride("metric_first_response_tenant_override", { tenantId: "tenant-ladoga" }), undefined);
  });

  it("persists metric tenant overrides through the JSON report repository", () => {
    const workspace = mkdtempSync(join(tmpdir(), "report-metric-overrides-"));
    try {
      const filePath = join(workspace, "reports.json");
      const first = ReportRepository.open({ filePath });

      first.saveMetricTenantOverride({
        createdAt: "2026-06-30T09:20:00.000Z",
        definitionId: "metric_first_response",
        id: "metric_json_first_response_override",
        metricVersionId: "metric_json_first_response_v2",
        reason: "Tenant-specific reporting cutoff",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-30T09:20:00.000Z"
      });

      const second = ReportRepository.open({ filePath });

      assert.deepEqual(second.listMetricTenantOverrides({
        definitionId: "metric_first_response",
        tenantId: "tenant-volga"
      }).map((override) => override.id), ["metric_json_first_response_override"]);
      assert.equal(second.findMetricTenantOverride("metric_json_first_response_override", { tenantId: "tenant-volga" })?.metricVersionId, "metric_json_first_response_v2");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("returns an honest empty live workspace when no persisted tenant conversations exist", async () => {
    const reports = new ReportService();

    const workspace = await reports.fetchReportWorkspace({
      channel: "VK",
      period: "today",
      reportType: "SLA"
    });

    assert.equal(workspace.service, "reportService");
    assert.equal(workspace.status, "ok");
    assert.equal(workspace.partial, false);
    assert.equal(workspace.meta.source, "api");
    assert.equal(workspace.data.metricDefinitionVersion, "metrics/v1");
    assert.deepEqual(workspace.data.filters, { channel: "VK", period: "today", reportType: "SLA" });
    assert.equal(workspace.data.source, "tenant_conversations");
    assert.equal(workspace.data.rows.length, 4);
    assert.equal(workspace.data.rows.every((row) => ["0", "00:00", "0%"].includes(row.today)), true);
    assert.deepEqual(workspace.data.bars, []);
    assert.equal(workspace.data.chartBlocks.some((chart) => chart.id === "operator-load"), false);
    assert.ok(workspace.data.columnOptions.some((column) => column.id === "metric" && column.locked));
    assert.deepEqual(workspace.data.rescueOutcomeSummary, []);
    assert.deepEqual(workspace.data.rescueReportRows, []);
    assert.deepEqual(workspace.data.exportJobs, []);
  });

  it("executes current rescue report metrics as a deterministic query", async () => {
    const reports = new ReportService();

    const execution = await reports.executeReportQuery({
      metricKey: "rescue.current",
      parameters: {
        channel: "all",
        period: "today"
      },
      tenantId: "tenant-volga"
    });

    assert.equal(execution.service, "reportService");
    assert.equal(execution.status, "ok");
    assert.equal(execution.data.execution.status, "completed");
    assert.equal(execution.data.metric.key, "rescue.current");
    assert.deepEqual(execution.data.parameters, {
      channel: "all",
      period: "today",
      tenantId: "tenant-volga"
    });
    assert.deepEqual(execution.data.rows, [
      { key: "rescue.total", label: "Total rescue cases", value: 3, unit: "cases" },
      { key: "rescue.saved", label: "Saved rescue cases", value: 2, unit: "cases" },
      { key: "rescue.missed", label: "Missed rescue cases", value: 1, unit: "cases" },
      { key: "rescue.average_timer_seconds", label: "Average rescue timer", value: 40, unit: "seconds" }
    ]);
  });

  it("executes current conversation report metrics as a deterministic query", async () => {
    const reports = new ReportService();

    const execution = await reports.executeReportQuery({
      metricKey: "conversation.current",
      parameters: {
        channel: "all",
        period: "today"
      },
      tenantId: "tenant-volga"
    });

    assert.equal(execution.service, "reportService");
    assert.equal(execution.status, "ok");
    assert.equal(execution.data.execution.status, "completed");
    assert.equal(execution.data.metric.key, "conversation.current");
    assert.deepEqual(execution.data.parameters, {
      channel: "all",
      period: "today",
      tenantId: "tenant-volga"
    });
    assert.deepEqual(execution.data.rows, [
      { key: "conversation.new", label: "New conversations", value: 486, unit: "conversations" },
      { key: "conversation.closed", label: "Closed conversations", value: 451, unit: "conversations" },
      { key: "conversation.first_response_seconds", label: "First response time", value: 96, unit: "seconds" },
      { key: "conversation.sla_met_percent", label: "SLA met", value: 91, unit: "percent" }
    ]);
  });

  it("persists report query execution status in the JSON report repository", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "report-query-status-"));
    try {
      const filePath = join(workspace, "reports.json");
      const repository = ReportRepository.open({ filePath });
      const reports = new ReportService(repository);

      const execution = await reports.executeReportQuery({
        metricKey: "rescue.current",
        parameters: {
          channel: "all",
          period: "today"
        },
        tenantId: "tenant-volga"
      });
      const second = ReportRepository.open({ filePath });

      assert.equal(execution.data.execution.status, "completed");
      assert.deepEqual(second.listReportQueryExecutions().map((item) => ({
        id: item.id,
        metricKey: item.metricKey,
        parameters: item.parameters,
        status: item.status
      })), [{
        id: execution.data.execution.id,
        metricKey: "rescue.current",
        parameters: {
          channel: "all",
          period: "today",
          tenantId: "tenant-volga"
        },
        status: "completed"
      }]);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("fails closed for unsupported report metric queries", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "report-query-failures-"));
    try {
      const filePath = join(workspace, "reports.json");
      const repository = ReportRepository.open({ filePath });
      const reports = new ReportService(repository);

      const execution = await reports.executeReportQuery({
        metricKey: "unknown.current",
        parameters: {
          channel: "all",
          period: "today"
        },
        tenantId: "tenant-volga"
      });
      const second = ReportRepository.open({ filePath });

      assert.equal(execution.status, "invalid");
      assert.equal(execution.error?.code, "report_metric_query_unsupported");
      assert.deepEqual(execution.data, {
        metricKey: "unknown.current"
      });
      assert.deepEqual(second.listReportQueryExecutions().map((item) => ({
        failureEnvelope: item.failureEnvelope,
        metricKey: item.metricKey,
        status: item.status
      })), [{
        failureEnvelope: {
          code: "report_metric_query_unsupported",
          message: "Report metric query is not supported."
        },
        metricKey: "unknown.current",
        status: "failed"
      }]);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("queues report exports with audit, metric version and idempotency metadata", async () => {
    const reports = new ReportService();

    const missingColumns = await reports.requestReportExport({
      channel: "VK",
      columns: [],
      period: "today",
      reportType: "SLA"
    });
    assert.equal(missingColumns.status, "invalid");
    assert.equal(missingColumns.error?.code, "report_columns_required");

    const queued = await reports.requestReportExport({
      channel: "VK",
      columns: ["metric", "today", "status"],
      filters: { sla: "overdue" },
      idempotencyKey: "report-export-vk-today",
      period: "today",
      reportType: "SLA"
    });
    assert.equal(queued.status, "ok");
    assert.equal(queued.data.job.statusKey, "queued");
    assert.equal(queued.data.job.queue, "report-export");
    assert.match(queued.data.job.backendQueueId, /^report_/);
    assert.match(queued.data.job.auditId, /^evt_report_/);
    assert.equal(queued.data.job.metricDefinitionVersion, "metrics/v1");
    assert.equal(queued.data.job.permissionRequired, "reports.export");
    assert.equal(queued.data.exportReadyEvent, null);

    const duplicate = await reports.requestReportExport({
      channel: "VK",
      columns: ["metric", "today", "status"],
      filters: { sla: "overdue" },
      idempotencyKey: "report-export-vk-today",
      period: "today",
      reportType: "SLA"
    });
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.job.id, queued.data.job.id);
    assert.equal(duplicate.data.job.permissionRequired, "reports.export");

    const reusedKeyWithDifferentPayload = await reports.requestReportExport({
      channel: "VK",
      columns: ["metric", "previous"],
      filters: { sla: "overdue" },
      idempotencyKey: "report-export-vk-today",
      period: "today",
      reportType: "SLA"
    });
    assert.equal(reusedKeyWithDifferentPayload.status, "conflict");
    assert.equal(reusedKeyWithDifferentPayload.error?.code, "idempotency_key_reused");
  });

  it("merges durable export writes from co-existing report service instances", async () => {
    const repository = ReportRepository.inMemory();
    const first = new ReportService(repository);
    const second = new ReportService(repository);

    const firstQueued = await first.requestReportExport({
      channel: "VK",
      columns: ["metric", "today"],
      idempotencyKey: "coexisting-report-a",
      period: "today",
      reportType: "SLA"
    });
    const secondQueued = await second.requestReportExport({
      channel: "Telegram",
      columns: ["metric", "status"],
      idempotencyKey: "coexisting-report-b",
      period: "today",
      reportType: "Load"
    });

    const state = repository.readState();
    assert.ok(state.exportJobs.some((job) => job.id === firstQueued.data.job.id));
    assert.ok(state.exportJobs.some((job) => job.id === secondQueued.data.job.id));
    assert.ok(state.idempotencyKeys.some((item) => item.key === "coexisting-report-a" && item.jobId === firstQueued.data.job.id));
    assert.ok(state.idempotencyKeys.some((item) => item.key === "coexisting-report-b" && item.jobId === secondQueued.data.job.id));

    const duplicateFromFreshInstance = await new ReportService(repository).requestReportExport({
      channel: "VK",
      columns: ["metric", "today"],
      idempotencyKey: "coexisting-report-a",
      period: "today",
      reportType: "SLA"
    });
    assert.equal(duplicateFromFreshInstance.data.duplicate, true);
    assert.equal(duplicateFromFreshInstance.data.job.id, firstQueued.data.job.id);
  });

  it("isolates default report store files by service, environment and port", () => {
    const first = resolveReportStoreFile({
      NODE_ENV: "test",
      PORT: "5101",
      SERVICE_NAME: "api-gateway"
    });
    const second = resolveReportStoreFile({
      NODE_ENV: "test",
      PORT: "5102",
      SERVICE_NAME: "api-gateway"
    });

    assert.notEqual(first, second);
    assert.match(first, /api-gateway-test-5101-reports\.json$/);
    assert.match(second, /api-gateway-test-5102-reports\.json$/);
  });

  it("retries export jobs and exposes permission-aware file descriptors", async () => {
    const reports = new ReportService(reportRepositoryWithExportFixtures());

    const running = await reports.retryReportExport({
      jobId: "export-2420",
      reason: "Manual retry after transport issue"
    });
    assert.equal(running.status, "ok");
    assert.equal(running.data.job.statusKey, "running");
    assert.equal(running.data.job.progress, 28);
    assert.equal(running.data.job.metricDefinitionVersion, "metrics/v1");
    assert.match(running.data.job.backendQueueId, /^report_/);
    assert.equal(running.data.auditEvent.action, "report.export.retry");

    const expiredRetry = await reports.retryReportExport({
      jobId: "export-2421",
      reason: "Expired signed file should be regenerated"
    });
    assert.equal(expiredRetry.status, "ok");
    assert.equal(expiredRetry.data.job.statusKey, "running");

    const readyRetry = await reports.retryReportExport({
      jobId: "export-2418",
      reason: "Ready exports must not be replayed"
    });
    assert.equal(readyRetry.status, "conflict");
    assert.equal(readyRetry.error?.code, "report_export_retry_not_allowed");
    assert.equal(readyRetry.data.statusKey, "ready");

    const alreadyRunningRetry = await reports.retryReportExport({
      jobId: "export-2419",
      reason: "Already running"
    });
    assert.equal(alreadyRunningRetry.status, "conflict");
    assert.equal(alreadyRunningRetry.error?.code, "report_export_retry_not_allowed");
    assert.equal(alreadyRunningRetry.data.statusKey, "running");

    const missing = await reports.getExportFileDescriptor("export-missing");
    assert.equal(missing.status, "not_found");
    assert.equal(missing.error?.code, "report_export_not_found");

    const notReady = await reports.getExportFileDescriptor("export-2419");
    assert.equal(notReady.status, "denied");
    assert.equal(notReady.error?.code, "report_export_not_ready");

    const descriptor = await reports.getExportFileDescriptor("export-2418", { canDownload: true });
    assert.equal(descriptor.status, "ok");
    assert.equal(descriptor.data.jobId, "export-2418");
    assert.equal(descriptor.data.objectKeyExposed, false);
    assert.equal(descriptor.data.permissionRequired, "reports.export");
    assert.equal(descriptor.data.metricDefinitionVersion, "metrics/v1");
    assert.match(descriptor.data.fileName, /\.xlsx$/);
    assert.match(descriptor.data.downloadUrl, /^https:\/\/reports\.local\/download\//);

    const denied = await reports.getExportFileDescriptor("export-2418");
    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "report_export_download_denied");
  });

  it("persists immutable report export retry audit events for failed and expired descriptors", async () => {
    const repository = reportRepositoryWithExportFixtures();
    const reports = new ReportService(repository);

    const failedRetry = await reports.retryReportExport({
      jobId: "export-2420",
      reason: "Manual retry after transport issue https://reports.local/download/secret objectKey=reports/raw.csv"
    });
    const expiredRetry = await reports.retryReportExport({
      jobId: "export-2421",
      reason: "Expired signed file should be regenerated"
    });
    const readyRetry = await reports.retryReportExport({
      jobId: "export-2418",
      reason: "Ready exports must not be replayed"
    });
    const runningRetry = await reports.retryReportExport({
      jobId: "export-2419",
      reason: "Already running"
    });
    const missingRetry = await reports.retryReportExport({
      jobId: "export-missing",
      reason: "Missing export"
    });

    const state = repository.readState();
    const auditEvents = state.exportRetryAuditEvents;

    assert.equal(failedRetry.status, "ok");
    assert.equal(expiredRetry.status, "ok");
    assert.equal(readyRetry.status, "conflict");
    assert.equal(runningRetry.status, "conflict");
    assert.equal(missingRetry.status, "not_found");
    assert.equal(auditEvents.length, 2);
    assert.deepEqual(auditEvents.map((event) => event.action), ["report.export.retry", "report.export.retry"]);
    assert.deepEqual(auditEvents.map((event) => event.immutable), [true, true]);
    assert.deepEqual(auditEvents.map((event) => event.previousStatusKey), ["error", "expired"]);
    assert.deepEqual(auditEvents.map((event) => event.nextStatusKey), ["running", "running"]);
    assert.equal(failedRetry.data.auditEvent.reasonCode, "operator_requested");
    assert.equal("reason" in failedRetry.data.auditEvent, false);
    assert.equal(JSON.stringify(failedRetry.data.auditEvent).includes("reports.local"), false);
    assert.equal(JSON.stringify(failedRetry.data.auditEvent).includes("objectKey"), false);
    assert.equal(auditEvents[0].jobId, "export-2420");
    assert.equal(auditEvents[0].auditId, failedRetry.data.auditEvent.id);
    assert.equal(auditEvents[1].jobId, "export-2421");
    assert.equal(auditEvents[1].auditId, expiredRetry.data.auditEvent.id);
    assert.equal(JSON.stringify(auditEvents).includes("downloadUrl"), false);
    assert.equal(JSON.stringify(auditEvents).includes("objectKey"), false);
    assert.equal(JSON.stringify(auditEvents).includes("reports.local"), false);
    assert.equal(JSON.stringify(auditEvents).includes("Manual retry after transport issue"), false);
  });

  it("persists report file descriptors after successful object writes", () => {
    const workspace = mkdtempSync(join(tmpdir(), "report-file-descriptors-"));
    try {
      const filePath = join(workspace, "reports.json");
      const first = ReportRepository.open({ filePath });

      first.saveReportFileDescriptor({
        checksum: "sha256-json-export",
        contentType: "application/json",
        createdAt: "2026-06-30T11:30:00.000Z",
      fileName: "conversation-report.json",
      format: "json",
      id: "filedesc-export-json-005",
      jobId: "export-json-005",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-json-005/report.json",
      sizeBytes: 128,
      tenantId: "tenant-volga",
      writtenAt: "2026-06-30T11:30:00.000Z"
    });

      const second = ReportRepository.open({ filePath });
      const stored = second.findReportFileDescriptor("export-json-005");
      if (stored) {
        stored.fileName = "mutated.json";
      }

      assert.equal(second.findReportFileDescriptor("export-json-005")?.fileName, "conversation-report.json");
      assert.equal(second.findReportFileDescriptor("export-json-005")?.objectKey, "reports/tenant-volga/export-json-005/report.json");
      assert.equal(second.findReportFileDescriptor("missing-export"), undefined);
      assert.equal(JSON.stringify(second.findReportFileDescriptor("export-json-005")).includes("downloadUrl"), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("attaches signed download policy to persisted report file descriptors", async () => {
    const repository = ReportRepository.inMemory();
    repository.saveExportJob({
      auditId: "evt_report_json_006",
      backendQueueId: "report_queue_json_006",
      columns: ["metric", "today"],
      createdAt: "2026-06-30T11:45:00.000Z",
      fileName: "conversation-report.json",
      filters: {},
      format: "CSV",
      id: "export-json-006",
      metricDefinitionVersion: "metrics/v1",
      name: "Conversation report",
      period: "today",
      progress: 100,
      queue: "report-export",
      requestedBy: "operator-anna",
      rows: 2,
      status: "Ready",
      statusKey: "ready"
    });
    repository.saveReportFileDescriptor({
      checksum: "sha256-json-export-006",
      contentType: "application/json",
      createdAt: "2026-06-30T11:45:00.000Z",
      fileName: "conversation-report.json",
      format: "json",
      id: "filedesc-export-json-006",
      jobId: "export-json-006",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-json-006/report.json",
      sizeBytes: 128,
      tenantId: "tenant-volga",
      writtenAt: "2026-06-30T11:45:00.000Z"
    });

    const descriptor = await new ReportService(repository).getExportFileDescriptor("export-json-006", { canDownload: true });

    assert.equal(descriptor.status, "ok");
    assert.equal(descriptor.data.jobId, "export-json-006");
    assert.equal(descriptor.data.fileName, "conversation-report.json");
    assert.equal(descriptor.data.checksum, "sha256-json-export-006");
    assert.equal(descriptor.data.contentType, "application/json");
    assert.equal(descriptor.data.sizeBytes, 128);
    assert.equal(descriptor.data.writtenAt, "2026-06-30T11:45:00.000Z");
    assert.equal(descriptor.data.objectKeyExposed, false);
    assert.equal(descriptor.data.permissionRequired, "reports.export");
    assert.match(String(descriptor.data.downloadUrl), /^https:\/\/reports\.local\/download\/export-json-006\/conversation-report\.json/);
    assert.equal(JSON.stringify(descriptor.data).includes("reports/tenant-volga/export-json-006/report.json"), false);
  });

  it("returns downloadable report export file bytes from server-owned object storage", async () => {
    const repository = ReportRepository.inMemory();
    repository.saveExportJob({
      auditId: "evt_report_download_runtime",
      backendQueueId: "report_queue_download_runtime",
      columns: ["metric", "today"],
      createdAt: "2026-07-04T09:00:00.000Z",
      filters: { tenantId: "tenant-volga" },
      format: "CSV",
      id: "export-download-runtime",
      metricDefinitionVersion: "metrics/v1",
      name: "Download runtime",
      period: "today",
      progress: 100,
      queue: "report-export",
      requestedBy: "operator-anna",
      rows: 2,
      status: "Ready",
      statusKey: "ready"
    });
    repository.saveReportFileDescriptor({
      checksum: "sha256:download-runtime",
      contentType: "text/csv",
      createdAt: "2026-07-04T09:01:00.000Z",
      fileName: "download-runtime.csv",
      format: "CSV",
      id: "file-export-download-runtime",
      jobId: "export-download-runtime",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-download-runtime/download-runtime.csv",
      sizeBytes: 20,
      tenantId: "tenant-volga",
      writtenAt: "2026-07-04T09:01:00.000Z"
    });
    const reports = new ReportService(repository, {
      objectStorage: {
        async getObject(input) {
          assert.deepEqual(input, {
            objectKey: "reports/tenant-volga/export-download-runtime/download-runtime.csv"
          });
          return {
            body: "metric,today\r\nNew,486",
            contentType: "text/csv",
            sizeBytes: 20
          };
        }
      }
    });

    const download = await reports.getExportFileDownload("export-download-runtime", {
      canDownload: true,
      tenantId: "tenant-volga"
    });

    assert.equal(download.status, "ok");
    assert.equal(download.data.fileName, "download-runtime.csv");
    assert.equal(download.data.contentType, "text/csv");
    assert.equal(download.data.sizeBytes, 20);
    assert.equal(download.data.objectKeyExposed, false);
    assert.equal(Buffer.isBuffer(download.data.body), true);
    assert.equal(download.data.body.toString("utf8"), "metric,today\r\nNew,486");
    assert.equal(JSON.stringify(download.data).includes("reports/tenant-volga"), false);
  });

  it("materializes ready report export downloads when the file descriptor is missing", async () => {
    const repository = ReportRepository.inMemory();
    repository.saveExportJob({
      auditId: "evt_report_lazy_download",
      backendQueueId: "report_queue_lazy_download",
      columns: ["metric", "today"],
      createdAt: "2026-07-04T09:15:00.000Z",
      filters: { tenantId: "tenant-volga" },
      format: "XLSX",
      id: "export-lazy-download",
      metricDefinitionVersion: "metrics/v1",
      name: "Lazy download",
      period: "today",
      progress: 100,
      queue: "report-export",
      requestedBy: "operator-anna",
      rows: 5,
      status: "Ready",
      statusKey: "ready"
    });
    const objects = new Map();
    const reports = new ReportService(repository, {
      objectStorage: {
        async getObject(input) {
          return objects.get(input.objectKey);
        },
        async putObject(input) {
          const stored = {
            body: input.body,
            contentType: input.contentType,
            sizeBytes: Buffer.byteLength(input.body)
          };
          objects.set(input.objectKey, stored);
          return {
            checksum: "sha256:lazy-download",
            sizeBytes: stored.sizeBytes,
            writtenAt: "2026-07-04T09:16:00.000Z"
          };
        }
      }
    });

    const download = await reports.getExportFileDownload("export-lazy-download", {
      canDownload: true,
      tenantId: "tenant-volga"
    });
    const descriptor = repository.findReportFileDescriptor("export-lazy-download");

    assert.equal(download.status, "ok");
    assert.equal(download.data.fileName, "export-lazy-download.xlsx");
    assert.equal(download.data.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(Buffer.isBuffer(download.data.body), true);
    assert.equal(descriptor?.objectKey, "reports/tenant-volga/export-lazy-download/export-lazy-download.xlsx");
    assert.equal(descriptor?.checksum, "sha256:lazy-download");
    assert.equal(descriptor?.tenantId, "tenant-volga");
    assert.equal(JSON.stringify(download.data).includes("reports/tenant-volga"), false);
  });

  it("clears stale report file descriptors when retrying failed exports", async () => {
    const repository = ReportRepository.inMemory();
    repository.saveExportJob({
      auditId: "evt_report_json_007",
      backendQueueId: "report_queue_json_007",
      columns: ["metric", "today"],
      createdAt: "2026-06-30T12:00:00.000Z",
      fileName: "conversation-report.json",
      filters: {},
      format: "CSV",
      id: "export-json-007",
      metricDefinitionVersion: "metrics/v1",
      name: "Conversation retry report",
      period: "today",
      progress: 0,
      queue: "report-export",
      requestedBy: "operator-anna",
      rows: 0,
      status: "Error",
      statusKey: "error"
    });
    repository.saveReportFileDescriptor({
      checksum: "sha256-stale-json-export-007",
      contentType: "application/json",
      createdAt: "2026-06-30T12:00:00.000Z",
      fileName: "conversation-report.json",
      format: "json",
      id: "filedesc-export-json-007",
      jobId: "export-json-007",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-json-007/stale-report.json",
      sizeBytes: 128,
      tenantId: "tenant-volga",
      writtenAt: "2026-06-30T12:00:00.000Z"
    });

    const retry = await new ReportService(repository).retryReportExport({
      jobId: "export-json-007",
      reason: "retry stale descriptor"
    });

    assert.equal(retry.status, "ok");
    assert.equal(retry.data.job.statusKey, "running");
    assert.equal(repository.findReportFileDescriptor("export-json-007"), undefined);
  });

  it("dead-letters report exports after worker failures and clears stale descriptors", async () => {
    const repository = ReportRepository.inMemory();
    repository.saveExportJob({
      auditId: "evt_report_json_008",
      backendQueueId: "report_queue_json_008",
      columns: ["metric", "today"],
      createdAt: "2026-06-30T12:15:00.000Z",
      fileName: "conversation-report.json",
      filters: {},
      format: "CSV",
      id: "export-json-008",
      metricDefinitionVersion: "metrics/v1",
      name: "Conversation dead letter report",
      period: "today",
      progress: 71,
      queue: "report-export",
      requestedBy: "operator-anna",
      rows: 2,
      status: "Running",
      statusKey: "running"
    });
    repository.saveReportFileDescriptor({
      checksum: "sha256-stale-json-export-008",
      contentType: "application/json",
      createdAt: "2026-06-30T12:15:00.000Z",
      fileName: "conversation-report.json",
      format: "json",
      id: "filedesc-export-json-008",
      jobId: "export-json-008",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-json-008/stale-report.json",
      sizeBytes: 128,
      tenantId: "tenant-volga",
      writtenAt: "2026-06-30T12:15:00.000Z"
    });

    const deadLetter = await new ReportService(repository).deadLetterReportExport({
      failureCode: "object_storage_put_failed",
      failureMessage: "Object storage write failed.",
      jobId: "export-json-008"
    });

    assert.equal(deadLetter.status, "ok");
    assert.equal(deadLetter.data.job.statusKey, "error");
    assert.equal(deadLetter.data.job.status, "Dead letter");
    assert.equal(deadLetter.data.job.failureCode, "object_storage_put_failed");
    assert.equal(deadLetter.data.job.failureMessage, "Object storage write failed.");
    assert.match(String(deadLetter.data.job.deadLetteredAt), /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(repository.findReportFileDescriptor("export-json-008"), undefined);
  });

  it("scopes persisted report file descriptor downloads to the descriptor tenant", async () => {
    const repository = ReportRepository.inMemory();
    repository.saveExportJob({
      auditId: "evt_report_json_009",
      backendQueueId: "report_queue_json_009",
      columns: ["metric", "today"],
      createdAt: "2026-06-30T12:30:00.000Z",
      fileName: "conversation-report.json",
      filters: {},
      format: "CSV",
      id: "export-json-009",
      metricDefinitionVersion: "metrics/v1",
      name: "Conversation tenant scoped report",
      period: "today",
      progress: 100,
      queue: "report-export",
      requestedBy: "operator-anna",
      rows: 2,
      status: "Ready",
      statusKey: "ready"
    });
    repository.saveReportFileDescriptor({
      checksum: "sha256-json-export-009",
      contentType: "application/json",
      createdAt: "2026-06-30T12:30:00.000Z",
      fileName: "conversation-report.json",
      format: "json",
      id: "filedesc-export-json-009",
      jobId: "export-json-009",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-json-009/report.json",
      sizeBytes: 128,
      tenantId: "tenant-volga",
      writtenAt: "2026-06-30T12:30:00.000Z"
    });
    const reports = new ReportService(repository);

    const sameTenant = await reports.getExportFileDescriptor("export-json-009", {
      canDownload: true,
      tenantId: "tenant-volga"
    });
    const foreignTenant = await reports.getExportFileDescriptor("export-json-009", {
      canDownload: true,
      tenantId: "tenant-ladoga"
    });

    assert.equal(sameTenant.status, "ok");
    assert.equal(sameTenant.data.fileName, "conversation-report.json");
    assert.equal(foreignTenant.status, "not_found");
    assert.equal(foreignTenant.error?.code, "report_export_not_found");
    assert.equal(JSON.stringify(foreignTenant).includes("reports.local/download"), false);
  });

  it("persists tenant-scoped saved report templates through the report repository", () => {
    const repository = ReportRepository.inMemory();

    const saved = repository.saveSavedReportTemplate({
      columns: ["metric", "today", "status"],
      createdAt: "2026-06-30T13:00:00.000Z",
      filters: {
        channel: "Telegram",
        period: "today"
      },
      id: "template-conversation-today",
      name: "Conversation today",
      ownerUserId: "operator-anna",
      reportType: "conversation",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T13:00:00.000Z"
    });
    repository.saveSavedReportTemplate({
      columns: ["metric"],
      createdAt: "2026-06-30T13:05:00.000Z",
      filters: {},
      id: "template-foreign",
      name: "Foreign report",
      ownerUserId: "operator-oleg",
      reportType: "conversation",
      tenantId: "tenant-ladoga",
      updatedAt: "2026-06-30T13:05:00.000Z"
    });

    const listed = repository.listSavedReportTemplates({ tenantId: "tenant-volga" });
    listed[0].name = "Mutated outside repository";

    assert.equal(saved.id, "template-conversation-today");
    assert.deepEqual(repository.listSavedReportTemplates({ tenantId: "tenant-volga" }).map((template) => template.id), ["template-conversation-today"]);
    assert.equal(repository.findSavedReportTemplate("template-conversation-today", { tenantId: "tenant-volga" })?.name, "Conversation today");
    assert.equal(repository.findSavedReportTemplate("template-conversation-today", { tenantId: "tenant-ladoga" }), undefined);
  });

  it("routes saved report template creation through the report controller", () => {
    const controller = readFileSync(new URL("../apps/api-gateway/src/reports/report.controller.ts", import.meta.url), "utf8");

    assert.match(controller, /@Post\("templates"\)/);
    assert.match(controller, /saveSavedReportTemplate\(@Body\(\) payload:/);
    assert.match(controller, /@Req\(\) request: TenantOperatorRequest & ServiceAdminRequest/);
    assert.match(controller, /return this\.reportService\.saveSavedReportTemplate\(payload, reportContextFromServiceAdminRequest\(request\)\);/);
  });

  it("routes report file descriptors with server-owned download context", () => {
    const controller = readFileSync(new URL("../apps/api-gateway/src/reports/report.controller.ts", import.meta.url), "utf8");

    assert.match(controller, /getExportFileDescriptor\(@Param\("jobId"\) jobId: string, @Req\(\) request: TenantOperatorRequest & ServiceAdminRequest\)/);
    assert.match(controller, /return this\.reportService\.getExportFileDescriptor\(jobId, \{ canDownload: true, \.\.\.reportContextFromServiceAdminRequest\(request\) \}\);/);
  });

  it("routes report export downloads through server-owned object storage context", () => {
    const controller = readFileSync(new URL("../apps/api-gateway/src/reports/report.controller.ts", import.meta.url), "utf8");

    assert.match(controller, /@Get\("exports\/:jobId\/download"\)/);
    assert.match(controller, /getExportFileDownload\(jobId, \{ canDownload: true, \.\.\.reportContextFromServiceAdminRequest\(request\) \}\)/);
    assert.match(controller, /Content-Disposition/);
    assert.match(controller, /new StreamableFile\(envelope\.data\.body as Buffer\)/);
  });

  it("routes saved report template reads through server-owned visibility context", () => {
    const controller = readFileSync(new URL("../apps/api-gateway/src/reports/report.controller.ts", import.meta.url), "utf8");

    assert.match(controller, /@Get\("templates\/:templateId"\)/);
    assert.match(controller, /getSavedReportTemplate\(@Param\("templateId"\) templateId: string, @Req\(\) request: TenantOperatorRequest & ServiceAdminRequest\)/);
    assert.match(controller, /return this\.reportService\.getSavedReportTemplate\(templateId, reportContextFromServiceAdminRequest\(request\)\);/);
  });

  it("applies saved report template visibility rules inside a tenant", () => {
    const repository = ReportRepository.inMemory();

    repository.saveSavedReportTemplate({
      columns: ["metric"],
      createdAt: "2026-06-30T13:10:00.000Z",
      filters: {},
      id: "template-private",
      name: "Private report",
      ownerUserId: "operator-anna",
      reportType: "conversation",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T13:10:00.000Z",
      visibility: {
        scope: "private"
      }
    });
    repository.saveSavedReportTemplate({
      columns: ["metric"],
      createdAt: "2026-06-30T13:11:00.000Z",
      filters: {},
      id: "template-supervisor",
      name: "Supervisor report",
      ownerUserId: "operator-anna",
      reportType: "conversation",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T13:11:00.000Z",
      visibility: {
        roles: ["supervisor"],
        scope: "roles"
      }
    });
    repository.saveSavedReportTemplate({
      columns: ["metric"],
      createdAt: "2026-06-30T13:12:00.000Z",
      filters: {},
      id: "template-exporters",
      name: "Exporters report",
      ownerUserId: "operator-anna",
      reportType: "conversation",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T13:12:00.000Z",
      visibility: {
        permissions: ["reports.export"],
        scope: "permissions"
      }
    });

    assert.deepEqual(repository.listSavedReportTemplates({
      requesterPermissions: [],
      requesterRoles: [],
      requesterUserId: "operator-anna",
      tenantId: "tenant-volga"
    }).map((template) => template.id), ["template-private"]);
    assert.deepEqual(repository.listSavedReportTemplates({
      requesterPermissions: [],
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    }).map((template) => template.id), ["template-supervisor"]);
    assert.deepEqual(repository.listSavedReportTemplates({
      requesterPermissions: ["reports.export"],
      requesterRoles: [],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    }).map((template) => template.id), ["template-exporters"]);
    assert.equal(repository.findSavedReportTemplate("template-private", {
      requesterPermissions: ["reports.export"],
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    }), undefined);
    assert.equal(repository.findSavedReportTemplate("template-supervisor", {
      requesterPermissions: [],
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-ladoga"
    }), undefined);
  });

  it("persists scheduled digest descriptors and selects due tenant periods", () => {
    const repository = ReportRepository.inMemory();

    const due = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:00:00.000Z",
      dueAt: "2026-06-30T15:00:00.000Z",
      id: "digest-volga-daily-2026-06-30",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T14:00:00.000Z"
    });
    repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:05:00.000Z",
      dueAt: "2026-07-01T15:00:00.000Z",
      id: "digest-volga-daily-2026-07-01",
      periodKey: "2026-07-01",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T14:05:00.000Z"
    });
    repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:10:00.000Z",
      dueAt: "2026-06-30T15:00:00.000Z",
      id: "digest-ladoga-daily-2026-06-30",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-ladoga-daily",
      status: "due",
      tenantId: "tenant-ladoga",
      updatedAt: "2026-06-30T14:10:00.000Z"
    });
    repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:15:00.000Z",
      dueAt: "2026-06-30T15:00:00.000Z",
      id: "digest-volga-weekly-2026-W27",
      periodKey: "2026-W27",
      reportType: "weekly_support_digest",
      scheduleId: "digest-volga-weekly",
      status: "completed",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T14:15:00.000Z"
    });

    const dueForVolga = repository.listScheduledDigestDescriptors({
      dueBefore: "2026-06-30T16:00:00.000Z",
      status: "due",
      tenantId: "tenant-volga"
    });
    dueForVolga[0].periodKey = "mutated";

    assert.equal(due.id, "digest-volga-daily-2026-06-30");
    assert.deepEqual(repository.listScheduledDigestDescriptors({
      dueBefore: "2026-06-30T16:00:00.000Z",
      status: "due",
      tenantId: "tenant-volga"
    }).map((descriptor) => descriptor.id), ["digest-volga-daily-2026-06-30"]);
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-daily-2026-06-30", { tenantId: "tenant-volga" })?.periodKey, "2026-06-30");
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-daily-2026-06-30", { tenantId: "tenant-ladoga" }), undefined);
  });

  it("keeps scheduled digest descriptors idempotent by tenant schedule and period key", () => {
    const repository = ReportRepository.inMemory();

    const first = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:00:00.000Z",
      dueAt: "2026-06-30T15:00:00.000Z",
      id: "digest-volga-daily-first",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T14:00:00.000Z"
    });
    const replay = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:00:00.000Z",
      dueAt: "2026-06-30T15:00:00.000Z",
      id: "digest-volga-daily-replay",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T14:00:00.000Z"
    });
    const updated = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:00:00.000Z",
      dueAt: "2026-06-30T15:00:00.000Z",
      id: "digest-volga-daily-first",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T14:20:00.000Z"
    });
    const otherSchedule = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:10:00.000Z",
      dueAt: "2026-06-30T16:00:00.000Z",
      id: "digest-volga-weekly-first",
      periodKey: "2026-06-30",
      reportType: "weekly_support_digest",
      scheduleId: "digest-volga-weekly",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T14:10:00.000Z"
    });
    const otherTenant = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T14:15:00.000Z",
      dueAt: "2026-06-30T15:00:00.000Z",
      id: "digest-ladoga-daily-first",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-ladoga",
      updatedAt: "2026-06-30T14:15:00.000Z"
    });

    assert.equal(replay.id, first.id);
    assert.equal(replay.dueAt, "2026-06-30T15:00:00.000Z");
    assert.equal(updated.id, first.id);
    assert.equal(updated.status, "running");
    assert.equal(otherSchedule.id, "digest-volga-weekly-first");
    assert.equal(otherTenant.id, "digest-ladoga-daily-first");
    assert.deepEqual(repository.listScheduledDigestDescriptors({
      dueBefore: "2026-06-30T17:00:00.000Z",
      status: "running"
    }).map((descriptor) => descriptor.id), [
      "digest-volga-daily-first"
    ]);
    assert.deepEqual(repository.listScheduledDigestDescriptors({
      dueBefore: "2026-06-30T17:00:00.000Z",
      status: "due"
    }).map((descriptor) => descriptor.id), [
      "digest-ladoga-daily-first",
      "digest-volga-weekly-first"
    ]);
  });
});

function reportRepositoryWithExportFixtures(): ReportRepository {
  return ReportRepository.inMemory(bootstrapReportState({
    exportJobs: structuredClone(exportJobFixtures)
  }));
}
