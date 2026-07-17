import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ReportRepository,
  type ExportRetryAuditEvent,
  type MetricDefinitionRecord,
  type MetricTenantOverrideRecord,
  type MetricVersionRecord,
  type ReportFileDescriptorRecord,
  type ReportIdempotencyRecord,
  type ReportNotificationDescriptorRecord,
  type ReportQueryExecutionRecord,
  type ScheduledDigestDescriptorRecord,
  type SavedReportTemplateRecord
} from "../apps/api-gateway/src/reports/report.repository.ts";
import { configureReportRepository } from "../apps/api-gateway/src/reports/bootstrap.ts";
import type { ReportExportJob } from "../apps/api-gateway/src/reports/report.types.ts";

describe("Prisma-backed report repository contracts", () => {
  it("atomically claims scheduled digests and recovers an expired running lease", async () => {
    const { client } = createFakePrismaReportClient();
    const firstRepository = ReportRepository.prisma({ client });
    const secondRepository = ReportRepository.prisma({ client });
    await firstRepository.saveScheduledDigestDescriptorAsync({
      createdAt: "2026-07-04T10:00:00.000Z",
      dueAt: "2026-07-04T10:00:00.000Z",
      id: "digest-prisma-claim",
      periodKey: "2026-07-04",
      reportType: "daily_support_digest",
      scheduleId: "digest-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-04T10:00:00.000Z"
    });

    const concurrent = await Promise.all([
      firstRepository.claimScheduledDigestDescriptorsAsync({
        leaseMs: 60_000,
        now: new Date("2026-07-04T10:01:00.000Z")
      }),
      secondRepository.claimScheduledDigestDescriptorsAsync({
        leaseMs: 60_000,
        now: new Date("2026-07-04T10:01:00.000Z")
      })
    ]);

    assert.equal(concurrent.flat().length, 1);
    assert.equal(concurrent.flat()[0]?.status, "running");
    assert.deepEqual(await secondRepository.claimScheduledDigestDescriptorsAsync({
      leaseMs: 60_000,
      now: new Date("2026-07-04T10:01:30.000Z")
    }), []);

    const recovered = await secondRepository.claimScheduledDigestDescriptorsAsync({
      leaseMs: 60_000,
      now: new Date("2026-07-04T10:02:01.000Z")
    });
    assert.equal(recovered.length, 1);
    assert.equal(recovered[0]?.updatedAt, "2026-07-04T10:02:01.000Z");
  });

  it("atomically claims queued exports and recovers an expired running lease", async () => {
    const { client } = createFakePrismaReportClient();
    const firstRepository = ReportRepository.prisma({ client });
    const secondRepository = ReportRepository.prisma({ client });
    await firstRepository.saveExportJobAsync(reportExportJob({
      createdAt: "2026-07-04T10:00:00.000Z",
      id: "export-prisma-claim"
    }));

    const concurrent = await Promise.all([
      firstRepository.claimQueuedExportJobsAsync({
        leaseMs: 60_000,
        now: new Date("2026-07-04T10:01:00.000Z")
      }),
      secondRepository.claimQueuedExportJobsAsync({
        leaseMs: 60_000,
        now: new Date("2026-07-04T10:01:00.000Z")
      })
    ]);
    const firstClaim = concurrent.flat();

    assert.equal(firstClaim.length, 1);
    assert.equal(firstClaim[0]?.statusKey, "running");
    assert.match(String(firstClaim[0]?.filters?.workerClaimToken), /^report_claim_/);

    const recovered = await secondRepository.claimQueuedExportJobsAsync({
      leaseMs: 60_000,
      now: new Date("2026-07-04T10:02:01.000Z")
    });
    assert.equal(recovered.length, 1);
    assert.notEqual(recovered[0]?.filters?.workerClaimToken, firstClaim[0]?.filters?.workerClaimToken);
  });

  it("fails closed when Prisma report delegates are incomplete", () => {
    const { client } = createFakePrismaReportClient();
    delete (client as { metricVersion?: unknown }).metricVersion;

    assert.throws(
      () => ReportRepository.prisma({ client }),
      /prisma_report_metric_version_delegate_required/
    );
  });

  it("bootstraps the default report repository from a Prisma client factory", async () => {
    const { calls, client } = createFakePrismaReportClient();
    let datasourceUrl: string | undefined;

    try {
      const repository = configureReportRepository({
        DATABASE_URL: "postgresql://reports:secret@127.0.0.1:5432/support",
        NODE_ENV: "test"
      }, {
        prismaClientFactory(options) {
          datasourceUrl = options.datasourceUrl;
          return client;
        }
      });

      await repository.saveMetricDefinition({
        createdAt: "2026-06-30T10:00:00.000Z",
        description: "Report bootstrap metric",
        id: "metric_report_bootstrap",
        key: "report_bootstrap",
        name: "Report bootstrap",
        source: "reports",
        tenantId: "tenant-volga",
        unit: "count",
        updatedAt: "2026-06-30T10:05:00.000Z"
      });

      const refetched = await ReportRepository.default().findMetricDefinition("metric_report_bootstrap", { tenantId: "tenant-volga" });

      assert.equal(datasourceUrl, "postgresql://reports:secret@127.0.0.1:5432/support");
      assert.equal(refetched?.id, "metric_report_bootstrap");
      assert.equal(calls.metricDefinitionUpserts.length, 1);
    } finally {
      ReportRepository.clearDefault();
    }
  });

  it("reads tenant report facts from immutable lifecycle events", async () => {
    const { calls, client, seedConversationLifecycleEvent } = createFakePrismaReportClient();
    seedConversationLifecycleEvent({
      conversation: {
        channel: "Telegram",
        operatorId: "operator-anna",
        operatorName: "Anna",
        status: "closed",
        topic: "payment"
      },
      conversationId: "conversation-report-journal",
      data: { toStatus: "closed" },
      eventType: "status.changed",
      id: "evt-report-status-closed",
      ingestedAt: new Date("2026-07-11T09:00:01.000Z"),
      occurredAt: new Date("2026-07-11T09:00:00.000Z"),
      source: "conversation-service",
      tenantId: "tenant-volga"
    });
    const repository = ReportRepository.prisma({ client });

    const rows = await repository.listConversationReportSourceRowsAsync({
      from: new Date("2026-07-11T00:00:00.000Z"),
      tenantId: "tenant-volga",
      to: new Date("2026-07-12T00:00:00.000Z")
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].channel, "Telegram");
    assert.deepEqual(rows[0].lifecycleEvents, [{
      data: { toStatus: "closed" },
      eventType: "status.changed",
      id: "evt-report-status-closed",
      ingestedAt: "2026-07-11T09:00:01.000Z",
      occurredAt: "2026-07-11T09:00:00.000Z",
      source: "conversation-service"
    }]);
    assert.equal(calls.conversationLifecycleEventFindMany.length, 1);
    assert.equal(calls.conversationLifecycleEventFindMany[0].where.tenantId, "tenant-volga");
  });

  it("persists metric definitions through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const metric: MetricDefinitionRecord = {
      createdAt: "2026-06-30T10:00:00.000Z",
      description: " Median time until the first operator response. ",
      id: "metric_prisma_first_response",
      key: " first_response_seconds ",
      name: " First response time ",
      source: " conversation ",
      tenantId: "tenant-volga",
      unit: " seconds ",
      updatedAt: "2026-06-30T10:05:00.000Z"
    };

    const saved = await repository.saveMetricDefinition(metric);
    const refetched = await repository.findMetricDefinition("metric_prisma_first_response", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findMetricDefinition("metric_prisma_first_response", { tenantId: "tenant-ladoga" });
    const rows = await repository.listMetricDefinitions({
      key: "first_response_seconds",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.description, "Median time until the first operator response.");
    assert.equal(saved.key, "first_response_seconds");
    assert.equal(refetched?.unit, "seconds");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(rows.map((row) => row.id), ["metric_prisma_first_response"]);
    assert.deepEqual(calls.metricDefinitionUpserts[0], {
      create: {
        createdAt: new Date("2026-06-30T10:00:00.000Z"),
        description: "Median time until the first operator response.",
        id: "metric_prisma_first_response",
        key: "first_response_seconds",
        name: "First response time",
        source: "conversation",
        tenantId: "tenant-volga",
        unit: "seconds",
        updatedAt: new Date("2026-06-30T10:05:00.000Z")
      },
      update: {
        description: "Median time until the first operator response.",
        key: "first_response_seconds",
        name: "First response time",
        source: "conversation",
        tenantId: "tenant-volga",
        unit: "seconds",
        updatedAt: new Date("2026-06-30T10:05:00.000Z")
      },
      where: { id: "metric_prisma_first_response" }
    });
  });

  it("persists metric versions through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const version: MetricVersionRecord = {
      createdAt: "2026-06-30T10:10:00.000Z",
      definitionId: "metric_prisma_first_response",
      id: "metric_prisma_first_response_v1",
      queryKey: " conversation.first_response_seconds ",
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T10:15:00.000Z",
      version: " v1 "
    };

    const saved = await repository.saveMetricVersion(version);
    const refetched = await repository.findMetricVersion("metric_prisma_first_response_v1", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findMetricVersion("metric_prisma_first_response_v1", { tenantId: "tenant-ladoga" });
    const rows = await repository.listMetricVersions({
      definitionId: "metric_prisma_first_response",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.queryKey, "conversation.first_response_seconds");
    assert.equal(saved.version, "v1");
    assert.equal(refetched?.status, "active");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(rows.map((row) => row.id), ["metric_prisma_first_response_v1"]);
    assert.deepEqual(calls.metricVersionUpserts[0], {
      create: {
        createdAt: new Date("2026-06-30T10:10:00.000Z"),
        definitionId: "metric_prisma_first_response",
        id: "metric_prisma_first_response_v1",
        queryKey: "conversation.first_response_seconds",
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T10:15:00.000Z"),
        version: "v1"
      },
      update: {
        definitionId: "metric_prisma_first_response",
        queryKey: "conversation.first_response_seconds",
        status: "active",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T10:15:00.000Z"),
        version: "v1"
      },
      where: { id: "metric_prisma_first_response_v1" }
    });
  });

  it("fails closed when Prisma metric version rows contain malformed statuses", async () => {
    const { client, seedMetricVersion } = createFakePrismaReportClient();
    seedMetricVersion({
      createdAt: new Date("2026-06-30T10:10:00.000Z"),
      definitionId: "metric_prisma_first_response",
      id: "metric_prisma_first_response_malformed",
      queryKey: "conversation.first_response_seconds",
      status: "paused",
      tenantId: "tenant-volga",
      updatedAt: new Date("2026-06-30T10:15:00.000Z"),
      version: "v1"
    });
    const repository = ReportRepository.prisma({ client });

    await assert.rejects(
      () => repository.findMetricVersion("metric_prisma_first_response_malformed", { tenantId: "tenant-volga" }),
      /Unsupported metric version status: paused/
    );
  });

  it("persists metric tenant overrides through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const override: MetricTenantOverrideRecord = {
      createdAt: "2026-06-30T10:20:00.000Z",
      definitionId: "metric_prisma_first_response",
      id: "metric_prisma_first_response_override",
      metricVersionId: "metric_prisma_first_response_v2",
      reason: " Tenant-specific reporting cutoff ",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T10:25:00.000Z"
    };

    const saved = await repository.saveMetricTenantOverride(override);
    const refetched = await repository.findMetricTenantOverride("metric_prisma_first_response_override", { tenantId: "tenant-volga" });
    const crossTenant = await repository.findMetricTenantOverride("metric_prisma_first_response_override", { tenantId: "tenant-ladoga" });
    const rows = await repository.listMetricTenantOverrides({
      definitionId: "metric_prisma_first_response",
      tenantId: "tenant-volga"
    });

    assert.equal(saved.reason, "Tenant-specific reporting cutoff");
    assert.equal(refetched?.metricVersionId, "metric_prisma_first_response_v2");
    assert.equal(crossTenant, undefined);
    assert.deepEqual(rows.map((row) => row.id), ["metric_prisma_first_response_override"]);
    assert.deepEqual(calls.metricTenantOverrideUpserts[0], {
      create: {
        createdAt: new Date("2026-06-30T10:20:00.000Z"),
        definitionId: "metric_prisma_first_response",
        id: "metric_prisma_first_response_override",
        metricVersionId: "metric_prisma_first_response_v2",
        reason: "Tenant-specific reporting cutoff",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T10:25:00.000Z")
      },
      update: {
        definitionId: "metric_prisma_first_response",
        metricVersionId: "metric_prisma_first_response_v2",
        reason: "Tenant-specific reporting cutoff",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T10:25:00.000Z")
      },
      where: { id: "metric_prisma_first_response_override" }
    });
  });

  it("persists saved report templates and idempotency keys through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const template: SavedReportTemplateRecord = {
      columns: ["metric", "today"],
      createdAt: "2026-06-30T13:30:00.000Z",
      filters: {
        channel: "VK",
        period: "today"
      },
      id: "template_prisma_saved",
      name: " Prisma saved report ",
      ownerUserId: "operator-anna",
      reportType: "SLA",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T13:35:00.000Z",
      visibility: {
        roles: ["supervisor"],
        scope: "roles"
      }
    };

    const saved = await repository.saveSavedReportTemplate(template);
    await repository.saveIdempotencyKey({
      fingerprint: "fingerprint-template-prisma",
      jobId: saved.id,
      key: "saveSavedReportTemplate:template-prisma-key",
      tenantId: "tenant-volga"
    });
    const refetched = await repository.findSavedReportTemplate("template_prisma_saved", {
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    });
    const hidden = await repository.findSavedReportTemplate("template_prisma_saved", {
      requesterRoles: ["operator"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    });
    const crossTenant = await repository.findSavedReportTemplate("template_prisma_saved", {
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-ladoga"
    });
    const listed = await repository.listSavedReportTemplates({
      requesterRoles: ["supervisor"],
      requesterUserId: "operator-boris",
      tenantId: "tenant-volga"
    });
    const idempotency = await repository.findIdempotencyKey("tenant-volga", "saveSavedReportTemplate:template-prisma-key");

    assert.equal(saved.name, "Prisma saved report");
    assert.equal(refetched?.id, "template_prisma_saved");
    assert.equal(hidden, undefined);
    assert.equal(crossTenant, undefined);
    assert.deepEqual(listed.map((row) => row.id), ["template_prisma_saved"]);
    assert.deepEqual(idempotency, {
      fingerprint: "fingerprint-template-prisma",
      jobId: "template_prisma_saved",
      key: "saveSavedReportTemplate:template-prisma-key",
      tenantId: "tenant-volga"
    });
    assert.deepEqual(calls.savedReportTemplateUpserts[0], {
      create: {
        columns: ["metric", "today"],
        createdAt: new Date("2026-06-30T13:30:00.000Z"),
        filters: {
          channel: "VK",
          period: "today"
        },
        id: "template_prisma_saved",
        name: "Prisma saved report",
        ownerUserId: "operator-anna",
        reportType: "SLA",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T13:35:00.000Z"),
        visibilityPermissions: [],
        visibilityRoles: ["supervisor"],
        visibilityScope: "roles"
      },
      update: {
        columns: ["metric", "today"],
        filters: {
          channel: "VK",
          period: "today"
        },
        name: "Prisma saved report",
        ownerUserId: "operator-anna",
        reportType: "SLA",
        tenantId: "tenant-volga",
        updatedAt: new Date("2026-06-30T13:35:00.000Z"),
        visibilityPermissions: [],
        visibilityRoles: ["supervisor"],
        visibilityScope: "roles"
      },
      where: { id: "template_prisma_saved" }
    });
    assert.deepEqual(calls.reportIdempotencyKeyUpserts[0], {
      create: {
        fingerprint: "fingerprint-template-prisma",
        jobId: "template_prisma_saved",
        key: "saveSavedReportTemplate:template-prisma-key",
        tenantId: "tenant-volga"
      },
      update: {
        fingerprint: "fingerprint-template-prisma",
        jobId: "template_prisma_saved"
      },
      where: {
        tenantId_key: {
          key: "saveSavedReportTemplate:template-prisma-key",
          tenantId: "tenant-volga"
        }
      }
    });
  });

  it("persists report export jobs and idempotency atomically through Prisma delegates", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const firstRepository = ReportRepository.prisma({ client });
    const secondRepository = ReportRepository.prisma({ client });
    const idempotencyKey: ReportIdempotencyRecord = {
      fingerprint: "digest-export-fingerprint",
      jobId: "export-prisma-first",
      key: "scheduled-digest-export:tenant-volga:digest-volga-daily:2026-07-01",
      tenantId: "tenant-volga"
    };

    const first = await firstRepository.saveExportJobWithIdempotency(reportExportJob({
      id: "export-prisma-first"
    }), idempotencyKey);
    const duplicate = await secondRepository.saveExportJobWithIdempotency(reportExportJob({
      id: "export-prisma-second"
    }), {
      ...idempotencyKey,
      jobId: "export-prisma-second"
    });
    const conflict = await secondRepository.saveExportJobWithIdempotency(reportExportJob({
      columns: ["metric", "previous"],
      id: "export-prisma-conflict"
    }), {
      fingerprint: "different-fingerprint",
      jobId: "export-prisma-conflict",
      key: idempotencyKey.key,
      tenantId: "tenant-volga"
    });
    const otherTenant = await secondRepository.saveExportJobWithIdempotency(reportExportJob({
      auditId: "evt_report_prisma_export_ladoga",
      id: "export-prisma-ladoga",
      tenantId: "tenant-ladoga"
    }), {
      fingerprint: "ladoga-fingerprint",
      jobId: "export-prisma-ladoga",
      key: idempotencyKey.key,
      tenantId: "tenant-ladoga"
    });
    const jobs = await secondRepository.listExportJobsAsync();

    assert.equal(first.status, "created");
    assert.equal(first.job.id, "export-prisma-first");
    assert.equal(duplicate.status, "duplicate");
    assert.equal(duplicate.job.id, "export-prisma-first");
    assert.equal(conflict.status, "conflict");
    assert.equal(otherTenant.status, "created");
    assert.deepEqual(jobs.map((job) => job.id), ["export-prisma-first", "export-prisma-ladoga"]);
    assert.equal(calls.reportExportJobUpserts.length, 2);
    assert.equal(calls.reportIdempotencyKeyCreates.length, 2);
    assert.equal(calls.transactions.length, 4);
  });

  it("persists report runtime descriptors through Prisma delegates without JSON fallback", async () => {
    const { calls, client } = createFakePrismaReportClient();
    const repository = ReportRepository.prisma({ client });
    const secondRepository = ReportRepository.prisma({ client });
    const queryExecution: ReportQueryExecutionRecord = {
      id: "query_prisma_runtime",
      metricKey: "conversation.current",
      parameters: {
        channel: "VK",
        period: "today"
      },
      status: "completed"
    };
    const fileDescriptor: ReportFileDescriptorRecord = {
      checksum: "sha256:report-runtime",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      createdAt: "2026-07-01T10:10:00.000Z",
      fileName: "runtime-report.xlsx",
      format: "XLSX",
      id: "file_prisma_runtime",
      jobId: "export-prisma-runtime",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-prisma-runtime.xlsx",
      sizeBytes: 2048,
      tenantId: "tenant-volga",
      writtenAt: "2026-07-01T10:11:00.000Z"
    };
    const notificationDescriptor: ReportNotificationDescriptorRecord = {
      createdAt: "2026-07-01T10:12:00.000Z",
      eventType: "export.ready",
      exportJobId: "export-prisma-runtime",
      id: "notification_prisma_runtime",
      idempotencyKey: "notification-prisma-runtime",
      payload: {
        jobId: "export-prisma-runtime"
      },
      status: "queued",
      tenantId: "tenant-volga"
    };
    const scheduledDigest: ScheduledDigestDescriptorRecord = {
      createdAt: "2026-07-01T10:13:00.000Z",
      dueAt: "2026-07-02T10:00:00.000Z",
      id: "digest_prisma_runtime",
      periodKey: "2026-07-02",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-01T10:13:00.000Z"
    };
    const retryAudit: ExportRetryAuditEvent = {
      action: "report.export.retry",
      at: "2026-07-01T10:14:00.000Z",
      auditId: "audit_prisma_retry",
      backendQueueId: "queue-report-runtime",
      format: "XLSX",
      immutable: true,
      jobId: "export-prisma-runtime",
      metricDefinitionVersion: "metrics/v1",
      nextStatusKey: "running",
      previousStatusKey: "error",
      queue: "report-export",
      reasonCode: "operator_requested"
    };

    await repository.saveReportQueryExecutionAsync(queryExecution);
    await repository.saveReportFileDescriptorAsync(fileDescriptor);
    await repository.saveReportNotificationDescriptorAsync(notificationDescriptor);
    await repository.saveScheduledDigestDescriptorAsync(scheduledDigest);
    await repository.saveRetriedExportJobAsync(reportExportJob({
      id: "export-prisma-runtime",
      statusKey: "running"
    }), retryAudit);

    const queryRows = await secondRepository.listReportQueryExecutionsAsync();
    const fileRows = await secondRepository.listReportFileDescriptorsAsync();
    const notificationRows = await secondRepository.listReportNotificationDescriptorsAsync();
    const digestRows = await secondRepository.listScheduledDigestDescriptorsAsync({ tenantId: "tenant-volga" });
    const retryAuditRows = await secondRepository.listExportRetryAuditEventsAsync();
    const duplicateNotification = await secondRepository.saveReportNotificationDescriptorAsync({
      ...notificationDescriptor,
      id: "notification_prisma_runtime_replay"
    });

    assert.deepEqual(queryRows.map((row) => row.id), ["query_prisma_runtime"]);
    assert.equal(fileRows[0]?.objectKey, "reports/tenant-volga/export-prisma-runtime.xlsx");
    assert.equal((await secondRepository.findReportFileDescriptorAsync("export-prisma-runtime"))?.id, "file_prisma_runtime");
    assert.equal(notificationRows[0]?.idempotencyKey, "notification-prisma-runtime");
    assert.equal(duplicateNotification.id, "notification_prisma_runtime");
    assert.deepEqual(digestRows.map((row) => row.id), ["digest_prisma_runtime"]);
    assert.equal((await secondRepository.findScheduledDigestDescriptorAsync("digest_prisma_runtime", { tenantId: "tenant-volga" }))?.periodKey, "2026-07-02");
    assert.equal(retryAuditRows[0]?.auditId, "audit_prisma_retry");

    await secondRepository.deleteReportFileDescriptorAsync("export-prisma-runtime");
    assert.equal(await secondRepository.findReportFileDescriptorAsync("export-prisma-runtime"), undefined);
    assert.equal(calls.reportQueryExecutionUpserts.length, 1);
    assert.equal(calls.reportFileDescriptorUpserts.length, 1);
    assert.equal(calls.reportNotificationDescriptorUpserts.length, 1);
    assert.equal(calls.scheduledDigestDescriptorUpserts.length, 1);
    assert.equal(calls.reportExportRetryAuditEventUpserts.length, 1);
  });
});

function createFakePrismaReportClient() {
  const conversationLifecycleEvents: FakeConversationLifecycleEvent[] = [];
  const metricDefinitions = new Map<string, FakeMetricDefinitionCreateInput>();
  const metricTenantOverrides = new Map<string, FakeMetricTenantOverrideCreateInput>();
  const metricVersions = new Map<string, FakeMetricVersionCreateInput>();
  const reportExportJobs = new Map<string, FakeReportExportJobRow>();
  const reportIdempotencyKeys = new Map<string, FakeReportIdempotencyKeyCreateInput>();
  const savedReportTemplates = new Map<string, FakeSavedReportTemplateCreateInput>();
  const reportQueryExecutions = new Map<string, FakeReportQueryExecutionCreateInput>();
  const reportFileDescriptors = new Map<string, FakeReportFileDescriptorCreateInput>();
  const reportNotificationDescriptors = new Map<string, FakeReportNotificationDescriptorCreateInput>();
  const scheduledDigestDescriptors = new Map<string, FakeScheduledDigestDescriptorCreateInput>();
  const reportExportRetryAuditEvents = new Map<string, FakeReportExportRetryAuditEventCreateInput>();
  const calls = {
    conversationLifecycleEventFindMany: [] as Array<Record<string, any>>,
    metricDefinitionFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    metricDefinitionFindUnique: [] as Array<{ where: { id: string } }>,
    metricDefinitionUpserts: [] as Array<{
      create: FakeMetricDefinitionCreateInput;
      update: FakeMetricDefinitionUpdateInput;
      where: { id: string };
    }>,
    metricVersionFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    metricVersionFindUnique: [] as Array<{ where: { id: string } }>,
    metricVersionUpserts: [] as Array<{
      create: FakeMetricVersionCreateInput;
      update: FakeMetricVersionUpdateInput;
      where: { id: string };
    }>,
    metricTenantOverrideFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    metricTenantOverrideFindUnique: [] as Array<{ where: { id: string } }>,
    metricTenantOverrideUpserts: [] as Array<{
      create: FakeMetricTenantOverrideCreateInput;
      update: FakeMetricTenantOverrideUpdateInput;
      where: { id: string };
    }>,
    reportIdempotencyKeyFindUnique: [] as Array<{ where: FakeReportIdempotencyKeyWhereUniqueInput }>,
    reportIdempotencyKeyCreates: [] as Array<{ data: FakeReportIdempotencyKeyCreateInput }>,
    reportIdempotencyKeyUpserts: [] as Array<{
      create: FakeReportIdempotencyKeyCreateInput;
      update: FakeReportIdempotencyKeyUpdateInput;
      where: FakeReportIdempotencyKeyWhereUniqueInput;
    }>,
    reportExportJobFindMany: [] as Array<{
      orderBy: { createdAt: "asc" | "desc" };
      take?: number;
      where?: Record<string, unknown>;
    }>,
    reportExportJobFindUnique: [] as Array<{ where: { id: string } }>,
    reportExportJobUpserts: [] as Array<{
      create: FakeReportExportJobCreateInput;
      update: FakeReportExportJobUpdateInput;
      where: { id: string };
    }>,
    savedReportTemplateFindMany: [] as Array<{ orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }>,
    savedReportTemplateFindUnique: [] as Array<{ where: { id: string } }>,
    savedReportTemplateUpserts: [] as Array<{
      create: FakeSavedReportTemplateCreateInput;
      update: FakeSavedReportTemplateUpdateInput;
      where: { id: string };
    }>,
    reportQueryExecutionUpserts: [] as Array<{
      create: FakeReportQueryExecutionCreateInput;
      update: FakeReportQueryExecutionUpdateInput;
      where: { id: string };
    }>,
    reportFileDescriptorUpserts: [] as Array<{
      create: FakeReportFileDescriptorCreateInput;
      update: FakeReportFileDescriptorUpdateInput;
      where: { jobId: string };
    }>,
    reportNotificationDescriptorUpserts: [] as Array<{
      create: FakeReportNotificationDescriptorCreateInput;
      update: FakeReportNotificationDescriptorUpdateInput;
      where: { idempotencyKey: string };
    }>,
    scheduledDigestDescriptorUpserts: [] as Array<{
      create: FakeScheduledDigestDescriptorCreateInput;
      update: FakeScheduledDigestDescriptorUpdateInput;
      where: { id: string };
    }>,
    reportExportRetryAuditEventUpserts: [] as Array<{
      create: FakeReportExportRetryAuditEventCreateInput;
      update: FakeReportExportRetryAuditEventUpdateInput;
      where: { auditId: string };
    }>,
    transactions: [] as Array<{ isolationLevel?: "Serializable" }>
  };

  return {
    calls,
    seedConversationLifecycleEvent(row: FakeConversationLifecycleEvent) {
      conversationLifecycleEvents.push(row);
    },
    seedMetricVersion(row: FakeMetricVersionCreateInput) {
      metricVersions.set(row.id, row);
    },
    client: {
      conversationLifecycleEvent: {
        findMany(input: Record<string, any>) {
          calls.conversationLifecycleEventFindMany.push(input);
          const { gte, lt } = input.where.occurredAt as { gte: Date; lt: Date };
          return Promise.resolve(conversationLifecycleEvents
            .filter((row) => row.tenantId === input.where.tenantId && row.occurredAt >= gte && row.occurredAt < lt)
            .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime()));
        }
      },
      metricDefinition: {
        findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
          calls.metricDefinitionFindMany.push(input);
          return Promise.resolve(Array.from(metricDefinitions.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.metricDefinitionFindUnique.push(input);
          return Promise.resolve(metricDefinitions.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeMetricDefinitionCreateInput;
          update: FakeMetricDefinitionUpdateInput;
          where: { id: string };
        }) {
          calls.metricDefinitionUpserts.push(input);
          const current = metricDefinitions.get(input.where.id);
          const next: FakeMetricDefinitionCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          metricDefinitions.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      metricVersion: {
        findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
          calls.metricVersionFindMany.push(input);
          return Promise.resolve(Array.from(metricVersions.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.metricVersionFindUnique.push(input);
          return Promise.resolve(metricVersions.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeMetricVersionCreateInput;
          update: FakeMetricVersionUpdateInput;
          where: { id: string };
        }) {
          calls.metricVersionUpserts.push(input);
          const current = metricVersions.get(input.where.id);
          const next: FakeMetricVersionCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          metricVersions.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      metricTenantOverride: {
        findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
          calls.metricTenantOverrideFindMany.push(input);
          return Promise.resolve(Array.from(metricTenantOverrides.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.metricTenantOverrideFindUnique.push(input);
          return Promise.resolve(metricTenantOverrides.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeMetricTenantOverrideCreateInput;
          update: FakeMetricTenantOverrideUpdateInput;
          where: { id: string };
        }) {
          calls.metricTenantOverrideUpserts.push(input);
          const current = metricTenantOverrides.get(input.where.id);
          const next: FakeMetricTenantOverrideCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          metricTenantOverrides.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      reportIdempotencyKey: {
        create(input: { data: FakeReportIdempotencyKeyCreateInput }) {
          calls.reportIdempotencyKeyCreates.push(input);
          const mapKey = fakeReportIdempotencyMapKey(input.data.tenantId, input.data.key);
          if (reportIdempotencyKeys.has(mapKey)) {
            const error = new Error("Unique constraint failed on the fields: (`tenant_id`,`key`)") as Error & { code?: string };
            error.code = "P2002";
            return Promise.reject(error);
          }

          reportIdempotencyKeys.set(mapKey, input.data);
          return Promise.resolve(input.data);
        },
        findUnique(input: { where: FakeReportIdempotencyKeyWhereUniqueInput }) {
          calls.reportIdempotencyKeyFindUnique.push(input);
          const { key, tenantId } = input.where.tenantId_key;
          return Promise.resolve(reportIdempotencyKeys.get(fakeReportIdempotencyMapKey(tenantId, key)) ?? null);
        },
        upsert(input: {
          create: FakeReportIdempotencyKeyCreateInput;
          update: FakeReportIdempotencyKeyUpdateInput;
          where: FakeReportIdempotencyKeyWhereUniqueInput;
        }) {
          calls.reportIdempotencyKeyUpserts.push(input);
          const { key, tenantId } = input.where.tenantId_key;
          const mapKey = fakeReportIdempotencyMapKey(tenantId, key);
          const current = reportIdempotencyKeys.get(mapKey);
          const next: FakeReportIdempotencyKeyCreateInput = current
            ? { ...current, ...input.update, key: current.key, tenantId: current.tenantId }
            : input.create;
          reportIdempotencyKeys.set(mapKey, next);
          return Promise.resolve(next);
        }
      },
      reportExportJob: {
        findMany(input: { orderBy: { createdAt: "asc" | "desc" }; take?: number; where?: Record<string, unknown> }) {
          calls.reportExportJobFindMany.push(input);
          const direction = input.orderBy.createdAt === "asc" ? 1 : -1;
          const rows = Array.from(reportExportJobs.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => direction * (left.createdAt.getTime() - right.createdAt.getTime()));
          return Promise.resolve(Number.isInteger(input.take) ? rows.slice(0, input.take) : rows);
        },
        findUnique(input: { where: { id: string } }) {
          calls.reportExportJobFindUnique.push(input);
          return Promise.resolve(reportExportJobs.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeReportExportJobCreateInput;
          update: FakeReportExportJobUpdateInput;
          where: { id: string };
        }) {
          calls.reportExportJobUpserts.push(input);
          const current = reportExportJobs.get(input.where.id);
          const next: FakeReportExportJobRow = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : { ...input.create, updatedAt: input.create.updatedAt ?? input.create.createdAt };
          reportExportJobs.set(input.where.id, next);
          return Promise.resolve(next);
        },
        updateMany(input: {
          data: Partial<FakeReportExportJobUpdateInput> & { updatedAt?: Date };
          where: Record<string, unknown>;
        }) {
          let count = 0;
          for (const [id, row] of reportExportJobs) {
            if (!matchesWhere(row, input.where)) {
              continue;
            }
            reportExportJobs.set(id, { ...row, ...input.data, updatedAt: input.data.updatedAt ?? row.updatedAt });
            count += 1;
          }
          return Promise.resolve({ count });
        }
      },
      savedReportTemplate: {
        findMany(input: { orderBy: { updatedAt: "desc" }; where?: Record<string, unknown> }) {
          calls.savedReportTemplateFindMany.push(input);
          return Promise.resolve(Array.from(savedReportTemplates.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          calls.savedReportTemplateFindUnique.push(input);
          return Promise.resolve(savedReportTemplates.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeSavedReportTemplateCreateInput;
          update: FakeSavedReportTemplateUpdateInput;
          where: { id: string };
        }) {
          calls.savedReportTemplateUpserts.push(input);
          const current = savedReportTemplates.get(input.where.id);
          const next: FakeSavedReportTemplateCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          savedReportTemplates.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      reportQueryExecution: {
        findMany(_input: { orderBy: { createdAt: "desc" } }) {
          return Promise.resolve(Array.from(reportQueryExecutions.values())
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()));
        },
        upsert(input: {
          create: FakeReportQueryExecutionCreateInput;
          update: FakeReportQueryExecutionUpdateInput;
          where: { id: string };
        }) {
          calls.reportQueryExecutionUpserts.push(input);
          const current = reportQueryExecutions.get(input.where.id);
          const next: FakeReportQueryExecutionCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          reportQueryExecutions.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      reportFileDescriptor: {
        deleteMany(input: { where: { jobId: string } }) {
          const deleted = reportFileDescriptors.delete(input.where.jobId);
          return Promise.resolve({ count: deleted ? 1 : 0 });
        },
        findMany(_input: { orderBy: { createdAt: "desc" } }) {
          return Promise.resolve(Array.from(reportFileDescriptors.values())
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()));
        },
        findUnique(input: { where: { jobId: string } }) {
          return Promise.resolve(reportFileDescriptors.get(input.where.jobId) ?? null);
        },
        upsert(input: {
          create: FakeReportFileDescriptorCreateInput;
          update: FakeReportFileDescriptorUpdateInput;
          where: { jobId: string };
        }) {
          calls.reportFileDescriptorUpserts.push(input);
          const current = reportFileDescriptors.get(input.where.jobId);
          const next: FakeReportFileDescriptorCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          reportFileDescriptors.set(input.where.jobId, next);
          return Promise.resolve(next);
        }
      },
      reportNotificationDescriptor: {
        findMany(_input: { orderBy: { createdAt: "desc" } }) {
          return Promise.resolve(Array.from(reportNotificationDescriptors.values())
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()));
        },
        findUnique(input: { where: { idempotencyKey: string } }) {
          return Promise.resolve(reportNotificationDescriptors.get(input.where.idempotencyKey) ?? null);
        },
        upsert(input: {
          create: FakeReportNotificationDescriptorCreateInput;
          update: FakeReportNotificationDescriptorUpdateInput;
          where: { idempotencyKey: string };
        }) {
          calls.reportNotificationDescriptorUpserts.push(input);
          const current = reportNotificationDescriptors.get(input.where.idempotencyKey);
          const next: FakeReportNotificationDescriptorCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          reportNotificationDescriptors.set(input.where.idempotencyKey, next);
          return Promise.resolve(next);
        }
      },
      scheduledDigestDescriptor: {
        findMany(input: { orderBy: { dueAt: "asc" }; where?: Record<string, unknown> }) {
          return Promise.resolve(Array.from(scheduledDigestDescriptors.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          return Promise.resolve(scheduledDigestDescriptors.get(input.where.id) ?? null);
        },
        updateMany(input: {
          data: { status: string; updatedAt: Date };
          where: Record<string, unknown>;
        }) {
          const current = typeof input.where.id === "string"
            ? scheduledDigestDescriptors.get(input.where.id)
            : undefined;
          if (!current || !matchesWhere(current, input.where)) {
            return Promise.resolve({ count: 0 });
          }
          scheduledDigestDescriptors.set(current.id, {
            ...current,
            ...input.data
          });
          return Promise.resolve({ count: 1 });
        },
        upsert(input: {
          create: FakeScheduledDigestDescriptorCreateInput;
          update: FakeScheduledDigestDescriptorUpdateInput;
          where: { id: string };
        }) {
          calls.scheduledDigestDescriptorUpserts.push(input);
          const current = scheduledDigestDescriptors.get(input.where.id);
          const next: FakeScheduledDigestDescriptorCreateInput = current
            ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt }
            : input.create;
          scheduledDigestDescriptors.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      reportExportRetryAuditEvent: {
        findMany(_input: { orderBy: { at: "desc" } }) {
          return Promise.resolve(Array.from(reportExportRetryAuditEvents.values())
            .sort((left, right) => right.at.getTime() - left.at.getTime()));
        },
        upsert(input: {
          create: FakeReportExportRetryAuditEventCreateInput;
          update: FakeReportExportRetryAuditEventUpdateInput;
          where: { auditId: string };
        }) {
          calls.reportExportRetryAuditEventUpserts.push(input);
          const current = reportExportRetryAuditEvents.get(input.where.auditId);
          const next: FakeReportExportRetryAuditEventCreateInput = current
            ? { ...current, ...input.update, auditId: current.auditId, createdAt: current.createdAt }
            : input.create;
          reportExportRetryAuditEvents.set(input.where.auditId, next);
          return Promise.resolve(next);
        }
      },
      $transaction<T>(callback: (transaction: unknown) => Promise<T>, options?: { isolationLevel?: "Serializable" }) {
        calls.transactions.push({ isolationLevel: options?.isolationLevel });
        return callback(this);
      }
    }
  };
}

interface FakeMetricDefinitionCreateInput {
  createdAt: Date;
  description: string;
  id: string;
  key: string;
  name: string;
  source: string;
  tenantId: string;
  unit: string;
  updatedAt: Date;
}

type FakeMetricDefinitionUpdateInput = Omit<FakeMetricDefinitionCreateInput, "createdAt" | "id">;

interface FakeMetricVersionCreateInput {
  createdAt: Date;
  definitionId: string;
  id: string;
  queryKey: string;
  status: string;
  tenantId: string;
  updatedAt: Date;
  version: string;
}

type FakeMetricVersionUpdateInput = Omit<FakeMetricVersionCreateInput, "createdAt" | "id">;

interface FakeMetricTenantOverrideCreateInput {
  createdAt: Date;
  definitionId: string;
  id: string;
  metricVersionId: string;
  reason: string;
  tenantId: string;
  updatedAt: Date;
}

type FakeMetricTenantOverrideUpdateInput = Omit<FakeMetricTenantOverrideCreateInput, "createdAt" | "id">;

interface FakeReportIdempotencyKeyCreateInput {
  fingerprint: string;
  jobId: string;
  key: string;
  tenantId: string;
}

type FakeReportIdempotencyKeyUpdateInput = Omit<FakeReportIdempotencyKeyCreateInput, "key" | "tenantId">;

interface FakeReportIdempotencyKeyWhereUniqueInput {
  tenantId_key: {
    key: string;
    tenantId: string;
  };
}

function fakeReportIdempotencyMapKey(tenantId: string, key: string): string {
  return `${tenantId}\u0000${key}`;
}

interface FakeReportExportJobCreateInput {
  auditId: string;
  backendQueueId: string | null;
  columns: string[];
  createdAt: Date;
  deadLetteredAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
  fileName: string | null;
  filters: Record<string, unknown>;
  format: string;
  id: string;
  metricDefinitionVersion: string | null;
  name: string;
  period: string;
  progress: number;
  queue: string | null;
  requestedBy: string;
  rows: number;
  status: string;
  statusKey: string;
  updatedAt?: Date;
}

type FakeReportExportJobUpdateInput = Omit<FakeReportExportJobCreateInput, "createdAt" | "id">;
type FakeReportExportJobRow = Omit<FakeReportExportJobCreateInput, "updatedAt"> & { updatedAt: Date };

interface FakeSavedReportTemplateCreateInput {
  columns: string[];
  createdAt: Date;
  filters: Record<string, unknown>;
  id: string;
  name: string;
  ownerUserId: string;
  reportType: string;
  tenantId: string;
  updatedAt: Date;
  visibilityPermissions: string[];
  visibilityRoles: string[];
  visibilityScope: string;
}

type FakeSavedReportTemplateUpdateInput = Omit<FakeSavedReportTemplateCreateInput, "createdAt" | "id">;

interface FakeReportQueryExecutionCreateInput {
  createdAt: Date;
  failureCode: string | null;
  failureMessage: string | null;
  id: string;
  metricKey: string;
  parameters: Record<string, unknown> | null;
  status: string;
  updatedAt: Date;
}

type FakeReportQueryExecutionUpdateInput = Omit<FakeReportQueryExecutionCreateInput, "createdAt" | "id">;

interface FakeReportFileDescriptorCreateInput {
  checksum: string;
  contentType: string;
  createdAt: Date;
  fileName: string;
  format: string;
  id: string;
  jobId: string;
  metricDefinitionVersion: string;
  objectKey: string;
  sizeBytes: number;
  tenantId: string;
  updatedAt: Date;
  writtenAt: Date;
}

type FakeReportFileDescriptorUpdateInput = Omit<FakeReportFileDescriptorCreateInput, "createdAt" | "id">;

interface FakeReportNotificationDescriptorCreateInput {
  createdAt: Date;
  eventType: string;
  exportJobId: string;
  id: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  status: string;
  tenantId: string;
  updatedAt: Date;
}

type FakeReportNotificationDescriptorUpdateInput = Omit<FakeReportNotificationDescriptorCreateInput, "createdAt" | "id">;

interface FakeScheduledDigestDescriptorCreateInput {
  createdAt: Date;
  dueAt: Date;
  id: string;
  periodKey: string;
  reportType: string;
  scheduleId: string;
  status: string;
  tenantId: string;
  updatedAt: Date;
}

type FakeScheduledDigestDescriptorUpdateInput = Omit<FakeScheduledDigestDescriptorCreateInput, "createdAt" | "id">;

interface FakeReportExportRetryAuditEventCreateInput {
  action: string;
  at: Date;
  auditId: string;
  backendQueueId: string;
  createdAt: Date;
  format: string;
  immutable: boolean;
  jobId: string;
  metricDefinitionVersion: string;
  nextStatusKey: string;
  previousStatusKey: string;
  queue: string;
  reasonCode: string;
}

type FakeReportExportRetryAuditEventUpdateInput = Omit<FakeReportExportRetryAuditEventCreateInput, "auditId" | "createdAt">;

interface FakeConversationLifecycleEvent {
  conversation: {
    channel: string;
    operatorId: string | null;
    operatorName: string | null;
    status: string;
    topic: string;
  };
  conversationId: string;
  data: Record<string, unknown>;
  eventType: string;
  id: string;
  ingestedAt: Date;
  occurredAt: Date;
  source: string;
  tenantId: string;
}

function reportExportJob(overrides: Partial<ReportExportJob> = {}): ReportExportJob {
  return {
    auditId: "evt_report_prisma_export",
    backendQueueId: "report_prisma_export",
    columns: ["metric", "today"],
    createdAt: "2026-06-30T15:00:00.000Z",
    filters: {
      periodKey: "2026-07-01",
      scheduleId: "digest-volga-daily",
      tenantId: "tenant-volga"
    },
    format: "XLSX",
    id: "export-prisma-first",
    metricDefinitionVersion: "metrics/v1",
    name: "daily_support_digest: all",
    period: "2026-07-01",
    progress: 8,
    queue: "report-export",
    requestedBy: "current-operator",
    rows: 0,
    status: "Queued",
    statusKey: "queued",
    tenantId: "tenant-volga",
    ...overrides
  };
}

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, value]) => {
    const rowValue = row[key];
    if (value && typeof value === "object" && "lte" in value) {
      const limit = (value as { lte: unknown }).lte;
      return rowValue instanceof Date && limit instanceof Date && rowValue.getTime() <= limit.getTime();
    }
    if (value && typeof value === "object" && "in" in value) {
      const allowed = (value as { in: unknown }).in;
      return Array.isArray(allowed) && allowed.includes(rowValue);
    }
    if (value instanceof Date && rowValue instanceof Date) {
      return value.getTime() === rowValue.getTime();
    }

    return rowValue === value;
  });
}
