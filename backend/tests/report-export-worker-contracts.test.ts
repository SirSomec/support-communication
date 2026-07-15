import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ReportRepository } from "../apps/api-gateway/src/reports/report.repository.ts";
import { bootstrapReportState } from "../apps/api-gateway/src/reports/seed.ts";
import { ReportService } from "../apps/api-gateway/src/reports/report.service.ts";
import { claimDueScheduledDigestDescriptors, queueScheduledDigestExportJob } from "../apps/api-gateway/src/reports/report-digest.worker.ts";
import type { ReportExportJob } from "../apps/api-gateway/src/reports/report.types.ts";
import {
  createDeterministicReportObjectStorageAdapter,
  createReportObjectStoragePort,
  createReportExportFileDescriptor,
  executeCsvReportExport,
  executeXlsxReportExport,
  executeJsonReportExport,
  executeReportExportWorkerOnce,
  serializeReportRowsAsCsv,
  serializeReportRowsAsXlsx,
  serializeReportRowsAsJson,
  writeReportExportObject
} from "../apps/api-gateway/src/reports/report-export.worker.ts";

describe("report export worker contracts", () => {
  it("exposes scheduled digest worker runtime scripts, compose service and release smoke", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const releaseChecklist = readFileSync(new URL("../scripts/release-checklist.mjs", import.meta.url), "utf8");
    const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");
    const main = readFileSync(new URL("../apps/api-gateway/src/reports/report-digest.main.ts", import.meta.url), "utf8");

    assert.match(packageJson.scripts["start:report-digest-worker"], /apps\/api-gateway\/dist\/reports\/report-digest\.main\.js/);
    assert.equal(packageJson.scripts["report-digest:worker:once"], "npm run build && node --env-file=.env.example scripts/report-digest-worker-smoke.mjs");
    assert.equal(existsSync(new URL("../scripts/report-digest-worker-smoke.mjs", import.meta.url)), true);
    const smoke = readFileSync(new URL("../scripts/report-digest-worker-smoke.mjs", import.meta.url), "utf8");
    assert.match(smoke, /scheduledDigestDescriptor\.create/);
    assert.match(smoke, /reportExportJob\.findFirst/);
    assert.match(smoke, /reportNotificationDescriptor\.findUnique/);
    assert.match(smoke, /result\.claimed !== 1/);
    assert.match(smoke, /result\.completed !== 1/);
    assert.match(smoke, /result\.failed !== 0/);
    assert.match(smoke, /status !== "completed"/);
    assert.match(releaseChecklist, /script: "report-digest:worker:once"/);
    assert.match(compose, /report-digest-worker:/);
    assert.match(compose, /command: \["node", "apps\/api-gateway\/dist\/reports\/report-digest\.main\.js"\]/);
    assert.match(compose, /REPORT_DIGEST_WORKER_INTERVAL_MS: 10000/);
    assert.match(compose, /REPORT_DIGEST_WORKER_LIMIT: 10/);
    assert.match(compose, /report-digest-worker:[\s\S]*REPORT_REPOSITORY: prisma/);
    assert.match(main, /runReportDigestWorkerFromEnv/);
    assert.match(main, /queueScheduledDigestExportJob/);
  });

  it("exposes report export worker runtime scripts and release smoke", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const releaseChecklist = readFileSync(new URL("../scripts/release-checklist.mjs", import.meta.url), "utf8");
    const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");

    assert.match(packageJson.scripts["start:report-export-worker"], /apps\/api-gateway\/dist\/reports\/report-export\.main\.js/);
    assert.equal(packageJson.scripts["report-export:worker:once"], "npm run build && node --env-file=.env.example scripts/report-export-worker-smoke.mjs");
    assert.equal(existsSync(new URL("../apps/api-gateway/src/reports/report-export.main.ts", import.meta.url)), true);
    assert.equal(existsSync(new URL("../scripts/report-export-worker-smoke.mjs", import.meta.url)), true);
    const main = readFileSync(new URL("../apps/api-gateway/src/reports/report-export.main.ts", import.meta.url), "utf8");
    const smoke = readFileSync(new URL("../scripts/report-export-worker-smoke.mjs", import.meta.url), "utf8");
    assert.match(main, /runReportExportWorkerFromEnv/);
    assert.match(main, /executeReportExportWorkerOnce/);
    assert.match(smoke, /reportExportJob\.create/);
    assert.match(smoke, /reportFileDescriptor\.findUnique/);
    assert.match(smoke, /REPORT_EXPORT_WORKER_QUEUE/);
    assert.match(smoke, /result\.scanned !== 1/);
    assert.match(smoke, /result\.ready !== 1/);
    assert.match(smoke, /result\.failed !== 0/);
    assert.match(smoke, /statusKey !== "ready"/);
    assert.match(releaseChecklist, /script: "report-export:worker:once"/);
    assert.match(compose, /report-export-worker:/);
    assert.match(compose, /command: \["node", "apps\/api-gateway\/dist\/reports\/report-export\.main\.js"\]/);
    assert.match(compose, /REPORT_EXPORT_WORKER_INTERVAL_MS: 10000/);
    assert.match(compose, /REPORT_EXPORT_WORKER_LIMIT: 10/);
    assert.match(compose, /REPORT_EXPORT_OBJECT_ROOT: \.runtime\/report-exports/);
    assert.match(compose, /report-export-worker:[\s\S]*REPORT_REPOSITORY: prisma/);
  });

  it("serializes report rows as deterministic CSV", () => {
    const csv = serializeReportRowsAsCsv({
      columns: [
        { id: "metric", label: "Metric" },
        { id: "today", label: "Today" },
        { id: "status", label: "Status" }
      ],
      rows: [
        {
          metric: "New conversations",
          status: "Growing, inspect",
          today: 486
        },
        {
          metric: "Quoted \"metric\"",
          status: "Line one\nLine two",
          today: "01:36"
        }
      ]
    });

    assert.equal(
      csv,
      [
        "Metric,Today,Status",
        "New conversations,486,\"Growing, inspect\"",
        "\"Quoted \"\"metric\"\"\",01:36,\"Line one\nLine two\""
      ].join("\r\n")
    );
  });

  it("serializes report rows as deterministic JSON", () => {
    const json = serializeReportRowsAsJson({
      columns: [
        { id: "metric", label: "Metric" },
        { id: "today", label: "Today" },
        { id: "status", label: "Status" }
      ],
      rows: [
        {
          metric: "New conversations",
          status: "Growing",
          today: 486,
          ignored: "not exported"
        },
        {
          metric: "First response",
          today: null
        }
      ]
    });

    assert.equal(
      json,
      JSON.stringify(
        {
          columns: [
            { id: "metric", label: "Metric" },
            { id: "today", label: "Today" },
            { id: "status", label: "Status" }
          ],
          rows: [
            {
              metric: "New conversations",
              today: 486,
              status: "Growing"
            },
            {
              metric: "First response",
              today: null,
              status: null
            }
          ]
        },
        null,
        2
      )
    );
  });

  it("serializes report rows as a deterministic XLSX workbook", () => {
    const workbook = serializeReportRowsAsXlsx({
      columns: [
        { id: "metric", label: "Metric" },
        { id: "today", label: "Today" }
      ],
      rows: [
        { metric: "New conversations", today: 486 },
        { metric: "Closed & saved", today: "<451>" }
      ]
    });
    const body = workbook.toString("utf8");

    assert.equal(workbook.subarray(0, 4).toString("binary"), "PK\u0003\u0004");
    assert.match(body, /xl\/worksheets\/sheet1\.xml/);
    assert.match(body, /New conversations/);
    assert.match(body, /Closed &amp; saved/);
    assert.match(body, /&lt;451&gt;/);
  });

  it("writes serialized report output through the object storage boundary", async () => {
    const writes: Array<Record<string, unknown>> = [];

    const descriptor = await writeReportExportObject({
      body: "{\"ok\":true}",
      contentType: "application/json",
      format: "json",
      jobId: "export-json-001",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-json-001/report.json",
      storage: {
        async putObject(input) {
          writes.push(input);
          return {
            checksum: "sha256-json-export",
            sizeBytes: 11,
            writtenAt: "2026-06-30T10:00:00.000Z"
          };
        }
      }
    });

    assert.deepEqual(writes, [
      {
        body: "{\"ok\":true}",
        contentType: "application/json",
        metadata: {
          format: "json",
          jobId: "export-json-001",
          metricDefinitionVersion: "metrics/v1"
        },
        objectKey: "reports/tenant-volga/export-json-001/report.json"
      }
    ]);
    assert.deepEqual(descriptor, {
      checksum: "sha256-json-export",
      contentType: "application/json",
      objectKey: "reports/tenant-volga/export-json-001/report.json",
      sizeBytes: 11,
      writtenAt: "2026-06-30T10:00:00.000Z"
    });
  });

  it("creates signed report export file descriptors without exposing object keys", async () => {
    const signerInputs: Array<Record<string, unknown>> = [];

    const descriptor = await createReportExportFileDescriptor({
      checksum: "sha256-json-export",
      contentType: "application/json",
      fileName: "conversation-report.json",
      jobId: "export-json-001",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-json-001/report.json",
      permissionRequired: "reports.export",
      signDownload: async (input) => {
        signerInputs.push(input);
        return {
          downloadUrl: "https://reports.local/download/export-json-001/conversation-report.json?signature=signed",
          expiresAt: "2026-06-30T11:00:00.000Z"
        };
      },
      sizeBytes: 11,
      writtenAt: "2026-06-30T10:00:00.000Z"
    });

    assert.deepEqual(signerInputs, [
      {
        contentType: "application/json",
        fileName: "conversation-report.json",
        jobId: "export-json-001",
        objectKey: "reports/tenant-volga/export-json-001/report.json"
      }
    ]);
    assert.deepEqual(descriptor, {
      checksum: "sha256-json-export",
      contentType: "application/json",
      downloadUrl: "https://reports.local/download/export-json-001/conversation-report.json?signature=signed",
      expiresAt: "2026-06-30T11:00:00.000Z",
      fileName: "conversation-report.json",
      jobId: "export-json-001",
      metricDefinitionVersion: "metrics/v1",
      objectKeyExposed: false,
      permissionRequired: "reports.export",
      sizeBytes: 11,
      writtenAt: "2026-06-30T10:00:00.000Z"
    });
    assert.equal(JSON.stringify(descriptor).includes("reports/tenant-volga/export-json-001/report.json"), false);
  });

  it("creates a fail-closed report object storage port for worker writes", async () => {
    assert.throws(
      () => createReportObjectStoragePort({}),
      /report_object_storage_put_required/
    );

    const writes: Array<Record<string, unknown>> = [];
    const port = createReportObjectStoragePort({
      async putObject(input) {
        writes.push(input);
        return {
          checksum: "sha256-port-write",
          sizeBytes: input.body.length,
          writtenAt: "2026-06-30T10:30:00.000Z"
        };
      }
    });

    const written = await port.putObject({
      body: "metric,today\r\nNew,486",
      contentType: "text/csv",
      metadata: {
        format: "csv",
        jobId: "export-csv-001",
        metricDefinitionVersion: "metrics/v1"
      },
      objectKey: "reports/tenant-volga/export-csv-001/report.csv"
    });

    assert.deepEqual(writes.map((write) => write.objectKey), ["reports/tenant-volga/export-csv-001/report.csv"]);
    assert.deepEqual(written, {
      checksum: "sha256-port-write",
      sizeBytes: 21,
      writtenAt: "2026-06-30T10:30:00.000Z"
    });
  });

  it("creates a deterministic report object storage adapter for worker tests", async () => {
    const adapter = createDeterministicReportObjectStorageAdapter({
      now: () => new Date("2026-06-30T10:45:00.000Z")
    });
    const port = createReportObjectStoragePort(adapter);

    const written = await port.putObject({
      body: "metric,today\r\nNew,486",
      contentType: "text/csv",
      metadata: {
        format: "csv",
        jobId: "export-csv-002",
        metricDefinitionVersion: "metrics/v1"
      },
      objectKey: "reports/tenant-volga/export-csv-002/report.csv"
    });

    assert.match(written.checksum, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(written, {
      checksum: adapter.readObject("reports/tenant-volga/export-csv-002/report.csv")?.checksum,
      sizeBytes: 21,
      writtenAt: "2026-06-30T10:45:00.000Z"
    });
    assert.deepEqual(adapter.listObjects(), [
      {
        body: "metric,today\r\nNew,486",
        checksum: written.checksum,
        contentType: "text/csv",
        metadata: {
          format: "csv",
          jobId: "export-csv-002",
          metricDefinitionVersion: "metrics/v1"
        },
        objectKey: "reports/tenant-volga/export-csv-002/report.csv",
        sizeBytes: 21,
        writtenAt: "2026-06-30T10:45:00.000Z"
      }
    ]);
    const stored = await adapter.getObject({ objectKey: "reports/tenant-volga/export-csv-002/report.csv" });
    assert.equal(stored?.contentType, "text/csv");
    assert.equal(stored?.body, "metric,today\r\nNew,486");
    assert.equal(await adapter.getObject({ objectKey: "reports/tenant-volga/missing.csv" }), undefined);
  });

  it("executes CSV report exports by writing serialized rows through object storage", async () => {
    const adapter = createDeterministicReportObjectStorageAdapter({
      now: () => new Date("2026-06-30T11:00:00.000Z")
    });

    const result = await executeCsvReportExport({
      columns: [
        { id: "metric", label: "Metric" },
        { id: "today", label: "Today" }
      ],
      jobId: "export-csv-003",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-csv-003/report.csv",
      rows: [
        { metric: "New conversations", today: 486 },
        { metric: "Closed conversations", today: 451 }
      ],
      storage: createReportObjectStoragePort(adapter)
    });

    const stored = adapter.readObject("reports/tenant-volga/export-csv-003/report.csv");
    assert.equal(stored?.body, "Metric,Today\r\nNew conversations,486\r\nClosed conversations,451");
    assert.equal(stored?.contentType, "text/csv");
    assert.deepEqual(stored?.metadata, {
      format: "csv",
      jobId: "export-csv-003",
      metricDefinitionVersion: "metrics/v1"
    });
    assert.deepEqual(result, {
      checksum: stored?.checksum,
      contentType: "text/csv",
      objectKey: "reports/tenant-volga/export-csv-003/report.csv",
      sizeBytes: 61,
      writtenAt: "2026-06-30T11:00:00.000Z"
    });
  });

  it("executes JSON report exports by writing serialized rows through object storage", async () => {
    const adapter = createDeterministicReportObjectStorageAdapter({
      now: () => new Date("2026-06-30T11:15:00.000Z")
    });
    const expectedBody = JSON.stringify(
      {
        columns: [
          { id: "metric", label: "Metric" },
          { id: "today", label: "Today" }
        ],
        rows: [
          { metric: "New conversations", today: 486 },
          { metric: "Closed conversations", today: 451 }
        ]
      },
      null,
      2
    );

    const result = await executeJsonReportExport({
      columns: [
        { id: "metric", label: "Metric" },
        { id: "today", label: "Today" }
      ],
      jobId: "export-json-004",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-json-004/report.json",
      rows: [
        { metric: "New conversations", today: 486 },
        { metric: "Closed conversations", today: 451 }
      ],
      storage: createReportObjectStoragePort(adapter)
    });

    const stored = adapter.readObject("reports/tenant-volga/export-json-004/report.json");
    assert.equal(stored?.body, expectedBody);
    assert.equal(stored?.contentType, "application/json");
    assert.deepEqual(stored?.metadata, {
      format: "json",
      jobId: "export-json-004",
      metricDefinitionVersion: "metrics/v1"
    });
    assert.deepEqual(result, {
      checksum: stored?.checksum,
      contentType: "application/json",
      objectKey: "reports/tenant-volga/export-json-004/report.json",
      sizeBytes: Buffer.byteLength(expectedBody),
      writtenAt: "2026-06-30T11:15:00.000Z"
    });
  });

  it("executes XLSX report exports by writing a workbook through object storage", async () => {
    const adapter = createDeterministicReportObjectStorageAdapter({
      now: () => new Date("2026-06-30T11:30:00.000Z")
    });

    const result = await executeXlsxReportExport({
      columns: [
        { id: "metric", label: "Metric" },
        { id: "today", label: "Today" }
      ],
      jobId: "export-xlsx-005",
      metricDefinitionVersion: "metrics/v1",
      objectKey: "reports/tenant-volga/export-xlsx-005/report.xlsx",
      rows: [
        { metric: "New conversations", today: 486 },
        { metric: "Closed conversations", today: 451 }
      ],
      storage: createReportObjectStoragePort(adapter)
    });

    const stored = adapter.readObject("reports/tenant-volga/export-xlsx-005/report.xlsx");
    assert.ok(Buffer.isBuffer(stored?.body));
    assert.equal(stored?.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.deepEqual(stored?.metadata, {
      format: "xlsx",
      jobId: "export-xlsx-005",
      metricDefinitionVersion: "metrics/v1"
    });
    assert.deepEqual(result, {
      checksum: stored?.checksum,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      objectKey: "reports/tenant-volga/export-xlsx-005/report.xlsx",
      sizeBytes: stored?.sizeBytes,
      writtenAt: "2026-06-30T11:30:00.000Z"
    });
  });

  it("claims queued report export jobs from an explicitly configured queue", async () => {
    const repository = ReportRepository.inMemory(bootstrapReportState({ exportJobs: [] }));
    repository.saveExportJob(reportExportJob({
      createdAt: "2026-07-04T08:00:00.000Z",
      id: "export-default-queue",
      queue: "report-export"
    }));
    repository.saveExportJob(reportExportJob({
      createdAt: "2026-07-04T08:01:00.000Z",
      id: "export-smoke-queue",
      queue: "report-export-smoke"
    }));

    const claimed = await repository.claimQueuedExportJobsAsync({
      limit: 5,
      now: new Date("2026-07-04T08:05:00.000Z"),
      queue: "report-export-smoke"
    });
    const jobs = repository.listExportJobs();

    assert.deepEqual(claimed.map((job: ReportExportJob) => job.id), ["export-smoke-queue"]);
    assert.equal(jobs.find((job) => job.id === "export-smoke-queue")?.statusKey, "running");
    assert.equal(jobs.find((job) => job.id === "export-smoke-queue")?.status, "Running");
    assert.equal(jobs.find((job) => job.id === "export-smoke-queue")?.progress, 20);
    assert.equal(jobs.find((job) => job.id === "export-default-queue")?.statusKey, "queued");
  });

  it("executes one claimed report export job into a persisted file descriptor", async () => {
    const repository = ReportRepository.inMemory(bootstrapReportState({
      exportJobs: [],
      reportFileDescriptors: []
    }));
    repository.saveExportJob(reportExportJob({
      columns: ["metric", "today"],
      createdAt: "2026-07-04T08:10:00.000Z",
      filters: { tenantId: "tenant-volga" },
      format: "XLSX",
      id: "export-worker-runtime",
      queue: "report-export-smoke"
    }));
    const storageAdapter = createDeterministicReportObjectStorageAdapter({
      now: () => new Date("2026-07-04T08:15:00.000Z")
    });

    const result = await executeReportExportWorkerOnce({
      limit: 1,
      now: new Date("2026-07-04T08:15:00.000Z"),
      queue: "report-export-smoke",
      reportRepository: repository,
      storage: createReportObjectStoragePort(storageAdapter)
    });
    const job = repository.listExportJobs().find((item) => item.id === "export-worker-runtime");
    const descriptor = repository.findReportFileDescriptor("export-worker-runtime");
    const object = storageAdapter.listObjects()[0];

    assert.deepEqual(result, {
      failed: 0,
      ready: 1,
      scanned: 1
    });
    assert.equal(job?.statusKey, "ready");
    assert.equal(job?.status, "Ready");
    assert.equal(job?.progress, 100);
    assert.equal(job?.rows, 4);
    assert.equal(job?.fileName, "export-worker-runtime.xlsx");
    assert.equal(job?.filters?.eventWatermark, null);
    assert.equal(object.objectKey, "reports/tenant-volga/export-worker-runtime/export-worker-runtime.xlsx");
    assert.equal(object.contentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(descriptor?.jobId, "export-worker-runtime");
    assert.equal(descriptor?.objectKey, object.objectKey);
    assert.equal(descriptor?.checksum, object.checksum);
    assert.equal(descriptor?.sizeBytes, object.sizeBytes);
    assert.equal(descriptor?.tenantId, "tenant-volga");
  });

  it("regenerates a failed export after retry", async () => {
    const repository = ReportRepository.inMemory(bootstrapReportState({
      exportJobs: [],
      reportFileDescriptors: []
    }));
    repository.saveExportJob(reportExportJob({
      columns: ["metric", "today"],
      filters: { tenantId: "tenant-volga" },
      format: "XLSX",
      id: "export-worker-retry",
      progress: 100,
      queue: "report-export",
      status: "Failed",
      statusKey: "error"
    }));

    const retry = await new ReportService(repository).retryReportExport({
      jobId: "export-worker-retry",
      reason: "Retry failed export"
    }, { tenantId: "tenant-volga" });
    assert.equal(retry.data.job.statusKey, "queued");

    const result = await executeReportExportWorkerOnce({
      limit: 1,
      queue: "report-export",
      reportRepository: repository,
      storage: createReportObjectStoragePort(createDeterministicReportObjectStorageAdapter())
    });
    const job = repository.listExportJobs().find((item) => item.id === "export-worker-retry");

    assert.deepEqual(result, { failed: 0, ready: 1, scanned: 1 });
    assert.equal(job?.statusKey, "ready");
    assert.ok(repository.findReportFileDescriptor("export-worker-retry"));
  });

  it("marks persisted export jobs without a tenant as corrupt instead of assigning a default tenant", async () => {
    const repository = ReportRepository.inMemory();
    const corrupt = reportExportJob({
      columns: ["metric"],
      id: "export-worker-missing-tenant",
      queue: "report-export-smoke"
    });
    delete corrupt.tenantId;
    corrupt.filters = {};
    repository.saveExportJob(corrupt);
    const storage = createDeterministicReportObjectStorageAdapter();

    const result = await executeReportExportWorkerOnce({
      queue: "report-export-smoke",
      reportRepository: repository,
      storage
    });
    const failed = repository.listExportJobs().find((job) => job.id === corrupt.id);

    assert.deepEqual(result, { failed: 1, ready: 0, scanned: 1 });
    assert.equal(failed?.statusKey, "error");
    assert.equal(failed?.failureMessage, "report_export_job_tenant_id_required");
    assert.deepEqual(storage.listObjects(), []);
    assert.equal(repository.findReportFileDescriptor(corrupt.id), undefined);
  });

  it("claims due scheduled digest descriptors as running without claiming future or completed periods", () => {
    const repository = ReportRepository.inMemory();
    repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-06-30T14:00:00.000Z",
      id: "digest-volga-due",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T12:00:00.000Z"
    });
    repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:05:00.000Z",
      dueAt: "2026-06-30T18:00:00.000Z",
      id: "digest-volga-future",
      periodKey: "2026-07-01",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T12:05:00.000Z"
    });
    repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:10:00.000Z",
      dueAt: "2026-06-30T13:00:00.000Z",
      id: "digest-volga-completed",
      periodKey: "2026-06-29",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "completed",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T12:10:00.000Z"
    });

    const result = claimDueScheduledDigestDescriptors({
      now: new Date("2026-06-30T15:00:00.000Z"),
      reportRepository: repository,
      tenantId: "tenant-volga"
    });

    assert.deepEqual(result.claimed.map((descriptor) => ({
      id: descriptor.id,
      status: descriptor.status,
      updatedAt: descriptor.updatedAt
    })), [
      {
        id: "digest-volga-due",
        status: "running",
        updatedAt: "2026-06-30T15:00:00.000Z"
      }
    ]);
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-due")?.status, "running");
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-future")?.status, "due");
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-completed")?.status, "completed");
  });

  it("queues one report export job for one claimed scheduled digest period", async () => {
    const repository = ReportRepository.inMemory();
    const reportService = new ReportService(repository);
    const due = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-06-30T14:00:00.000Z",
      id: "digest-volga-due",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T12:00:00.000Z"
    });
    const claimed = repository.saveScheduledDigestDescriptor({
      ...due,
      status: "running",
      updatedAt: "2026-06-30T15:00:00.000Z"
    });

    const first = await queueScheduledDigestExportJob({
      descriptor: claimed,
      now: new Date("2026-06-30T15:05:00.000Z"),
      reportRepository: repository,
      reportService
    });
    const duplicate = await queueScheduledDigestExportJob({
      descriptor: claimed,
      now: new Date("2026-06-30T15:06:00.000Z"),
      reportRepository: repository,
      reportService: new ReportService(repository)
    });

    assert.equal(first.exportEnvelope.status, "ok");
    assert.equal(first.exportEnvelope.data.duplicate, false);
    assert.equal(first.exportEnvelope.data.job.statusKey, "queued");
    assert.equal(first.exportEnvelope.data.job.queue, "report-export");
    assert.equal(first.exportEnvelope.data.job.period, "2026-06-30");
    assert.equal(first.exportEnvelope.data.job.reportType, undefined);
    assert.deepEqual(first.exportEnvelope.data.job.columns, ["metric", "today", "previous", "delta", "status"]);
    const { snapshotAt, ...persistedFilters } = first.exportEnvelope.data.job.filters;
    assert.ok(Number.isFinite(Date.parse(snapshotAt)));
    assert.deepEqual(persistedFilters, {
      channel: "Все каналы",
      periodKey: "2026-06-30",
      scheduleId: "digest-volga-daily",
      scheduledDigest: true,
      tenantId: "tenant-volga"
    });
    assert.equal(duplicate.exportEnvelope.status, "ok");
    assert.equal(duplicate.exportEnvelope.data.duplicate, true);
    assert.equal(duplicate.exportEnvelope.data.job.id, first.exportEnvelope.data.job.id);
    assert.equal(repository.readState().exportJobs.filter((job) => job.id === first.exportEnvelope.data.job.id).length, 1);
    assert.ok(repository.readState().idempotencyKeys.some((item) =>
      item.key === "scheduled-digest-export:tenant-volga:digest-volga-daily:2026-06-30" &&
      item.jobId === first.exportEnvelope.data.job.id
    ));

    const concurrentDue = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-07-01T14:00:00.000Z",
      id: "digest-volga-concurrent",
      periodKey: "2026-07-01",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-01T15:00:00.000Z"
    });
    const [left, right] = await Promise.all([
      queueScheduledDigestExportJob({
        descriptor: concurrentDue,
        now: new Date("2026-07-01T15:05:00.000Z"),
        reportRepository: repository,
        reportService: new ReportService(repository)
      }),
      queueScheduledDigestExportJob({
        descriptor: concurrentDue,
        now: new Date("2026-07-01T15:05:00.000Z"),
        reportRepository: repository,
        reportService: new ReportService(repository)
      })
    ]);
    const concurrentJobIds = [left.exportEnvelope.data.job.id, right.exportEnvelope.data.job.id];
    assert.equal(concurrentJobIds[0], concurrentJobIds[1]);
    assert.deepEqual([left.exportEnvelope.data.duplicate, right.exportEnvelope.data.duplicate].sort(), [false, true]);
    assert.equal(repository.readState().exportJobs.filter((job) => job.id === concurrentJobIds[0]).length, 1);
  });

  it("persists scheduled digest run status after export queue outcomes", async () => {
    const repository = ReportRepository.inMemory();
    const reportService = new ReportService(repository);
    const running = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-07-02T14:00:00.000Z",
      id: "digest-volga-run-success",
      periodKey: "2026-07-02",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-02T15:00:00.000Z"
    });

    const success = await queueScheduledDigestExportJob({
      descriptor: running,
      now: new Date("2026-07-02T15:05:00.000Z"),
      reportRepository: repository,
      reportService
    });

    assert.equal(success.exportEnvelope.status, "ok");
    assert.equal(success.descriptor.status, "completed");
    assert.equal(success.descriptor.updatedAt, "2026-07-02T15:05:00.000Z");
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-run-success")?.status, "completed");

    await reportService.requestReportExport({
      columns: ["metric"],
      idempotencyKey: "scheduled-digest-export:tenant-volga:digest-volga-daily:2026-07-03",
      period: "2026-07-03",
      reportType: "daily_support_digest"
    }, { tenantId: "tenant-volga" });
    const conflictRunning = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-07-03T14:00:00.000Z",
      id: "digest-volga-run-conflict",
      periodKey: "2026-07-03",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-03T15:00:00.000Z"
    });

    const conflict = await queueScheduledDigestExportJob({
      descriptor: conflictRunning,
      now: new Date("2026-07-03T15:05:00.000Z"),
      reportRepository: repository,
      reportService
    });

    assert.equal(conflict.exportEnvelope.status, "conflict");
    assert.equal(conflict.descriptor.status, "failed");
    assert.equal(conflict.descriptor.updatedAt, "2026-07-03T15:05:00.000Z");
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-run-conflict")?.status, "failed");
  });

  it("emits idempotent scheduled digest export notification descriptors", async () => {
    const repository = ReportRepository.inMemory();
    const running = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-07-04T14:00:00.000Z",
      id: "digest-volga-notify",
      periodKey: "2026-07-04",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-04T15:00:00.000Z"
    });

    const first = await queueScheduledDigestExportJob({
      descriptor: running,
      now: new Date("2026-07-04T15:05:00.000Z"),
      reportRepository: repository,
      reportService: new ReportService(repository)
    });
    const replay = await queueScheduledDigestExportJob({
      descriptor: running,
      now: new Date("2026-07-04T15:06:00.000Z"),
      reportRepository: repository,
      reportService: new ReportService(repository)
    });
    const descriptors = repository.listReportNotificationDescriptors();

    assert.equal(first.exportEnvelope.status, "ok");
    assert.equal(replay.exportEnvelope.status, "ok");
    assert.equal(descriptors.length, 1);
    assert.deepEqual(descriptors[0], {
      createdAt: "2026-07-04T15:05:00.000Z",
      eventType: "export.ready",
      exportJobId: first.exportEnvelope.data.job.id,
      id: "report-notification-tenant-volga-digest-volga-daily-2026-07-04",
      idempotencyKey: "scheduled-digest-notification:tenant-volga:digest-volga-daily:2026-07-04",
      payload: {
        periodKey: "2026-07-04",
        reportType: "daily_support_digest",
        scheduleId: "digest-volga-daily"
      },
      status: "queued",
      tenantId: "tenant-volga"
    });
  });

  it("replays duplicate scheduled digest periods without duplicating worker outputs", async () => {
    const repository = ReportRepository.inMemory();
    const first = repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-07-05T14:00:00.000Z",
      id: "digest-volga-duplicate-first",
      periodKey: "2026-07-05",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-05T15:00:00.000Z"
    });
    const replay = {
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-07-05T14:00:00.000Z",
      id: "digest-volga-duplicate-replay",
      periodKey: "2026-07-05",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-05T15:00:00.000Z"
    } as const;

    const firstResult = await queueScheduledDigestExportJob({
      descriptor: first,
      now: new Date("2026-07-05T15:05:00.000Z"),
      reportRepository: repository,
      reportService: new ReportService(repository)
    });
    const replayResult = await queueScheduledDigestExportJob({
      descriptor: replay,
      now: new Date("2026-07-05T15:06:00.000Z"),
      reportRepository: repository,
      reportService: new ReportService(repository)
    });

    assert.equal(replay.id, "digest-volga-duplicate-replay");
    assert.equal(firstResult.exportEnvelope.data.job.id, replayResult.exportEnvelope.data.job.id);
    assert.equal(replayResult.exportEnvelope.data.duplicate, true);
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-duplicate-first")?.status, "completed");
    assert.equal(repository.listScheduledDigestDescriptors({
      dueBefore: "2026-07-05T16:00:00.000Z",
      tenantId: "tenant-volga"
    }).length, 1);
    assert.equal(repository.readState().exportJobs.filter((job) =>
      job.filters?.periodKey === "2026-07-05" &&
      job.filters?.scheduleId === "digest-volga-daily" &&
      job.filters?.tenantId === "tenant-volga"
    ).length, 1);
    assert.equal(repository.listReportNotificationDescriptors().filter((descriptor) =>
      descriptor.idempotencyKey === "scheduled-digest-notification:tenant-volga:digest-volga-daily:2026-07-05"
    ).length, 1);

    const rawReplayRepository = ReportRepository.inMemory();
    rawReplayRepository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-07-06T14:00:00.000Z",
      id: "digest-volga-raw-canonical",
      periodKey: "2026-07-06",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-06T15:00:00.000Z"
    });

    const rawReplayResult = await queueScheduledDigestExportJob({
      descriptor: {
        createdAt: "2026-06-30T12:00:00.000Z",
        dueAt: "2026-07-06T14:00:00.000Z",
        id: "digest-volga-raw-replay",
        periodKey: "2026-07-06",
        reportType: "daily_support_digest",
        scheduleId: "digest-volga-daily",
        status: "running",
        tenantId: "tenant-volga",
        updatedAt: "2026-07-06T15:00:00.000Z"
      },
      now: new Date("2026-07-06T15:05:00.000Z"),
      reportRepository: rawReplayRepository,
      reportService: new ReportService(rawReplayRepository)
    });

    assert.equal(rawReplayResult.exportEnvelope.status, "ok");
    assert.equal(rawReplayResult.descriptor.id, "digest-volga-raw-canonical");
    assert.equal(rawReplayResult.descriptor.status, "completed");
    assert.equal(rawReplayRepository.findScheduledDigestDescriptor("digest-volga-raw-canonical")?.status, "completed");
  });

  it("rejects conflicting scheduled digest period replays before worker outputs", async () => {
    const repository = ReportRepository.inMemory(bootstrapReportState({ exportJobs: [] }));
    repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-07-07T14:00:00.000Z",
      id: "digest-volga-conflict-first",
      periodKey: "2026-07-07",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "running",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-07T15:00:00.000Z"
    });

    assert.throws(
      () => repository.saveScheduledDigestDescriptor({
        createdAt: "2026-06-30T12:00:00.000Z",
        dueAt: "2026-07-07T16:00:00.000Z",
        id: "digest-volga-conflict-replay",
        periodKey: "2026-07-07",
        reportType: "weekly_support_digest",
        scheduleId: "digest-volga-daily",
        status: "running",
        tenantId: "tenant-volga",
        updatedAt: "2026-07-07T15:10:00.000Z"
      }),
      /scheduled_digest_period_conflict/
    );
    await assert.rejects(
      () => queueScheduledDigestExportJob({
        descriptor: {
          createdAt: "2026-06-30T12:00:00.000Z",
          dueAt: "2026-07-07T16:00:00.000Z",
          id: "digest-volga-conflict-worker",
          periodKey: "2026-07-07",
          reportType: "weekly_support_digest",
          scheduleId: "digest-volga-daily",
          status: "running",
          tenantId: "tenant-volga",
          updatedAt: "2026-07-07T15:10:00.000Z"
        },
        now: new Date("2026-07-07T15:15:00.000Z"),
        reportRepository: repository,
        reportService: new ReportService(repository)
      }),
      /scheduled_digest_period_conflict/
    );
    assert.equal(repository.readState().exportJobs.length, 0);
    assert.equal(repository.listReportNotificationDescriptors().length, 0);
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-conflict-first")?.status, "running");

    assert.throws(
      () => repository.saveScheduledDigestDescriptor({
        createdAt: "2026-06-30T12:00:00.000Z",
        dueAt: "2026-07-07T18:00:00.000Z",
        id: "digest-volga-conflict-first",
        periodKey: "2026-07-07",
        reportType: "weekly_support_digest",
        scheduleId: "digest-volga-daily",
        status: "completed",
        tenantId: "tenant-volga",
        updatedAt: "2026-07-07T15:20:00.000Z"
      }),
      /scheduled_digest_period_conflict/
    );
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-conflict-first")?.dueAt, "2026-07-07T14:00:00.000Z");
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-conflict-first")?.reportType, "daily_support_digest");
    assert.throws(
      () => repository.saveScheduledDigestDescriptor({
        createdAt: "2026-06-30T12:00:00.000Z",
        dueAt: "2026-07-07T14:00:00.000Z",
        id: "digest-volga-conflict-first",
        periodKey: "2026-07-08",
        reportType: "daily_support_digest",
        scheduleId: "digest-volga-weekly",
        status: "completed",
        tenantId: "tenant-ladoga",
        updatedAt: "2026-07-07T15:30:00.000Z"
      }),
      /scheduled_digest_period_conflict/
    );
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-conflict-first")?.tenantId, "tenant-volga");
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-conflict-first")?.scheduleId, "digest-volga-daily");
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-conflict-first")?.periodKey, "2026-07-07");
  });

  it("fails closed for unsafe scheduled digest claim inputs", () => {
    const repository = ReportRepository.inMemory();
    repository.saveScheduledDigestDescriptor({
      createdAt: "2026-06-30T12:00:00.000Z",
      dueAt: "2026-06-30T14:00:00.000Z",
      id: "digest-volga-due",
      periodKey: "2026-06-30",
      reportType: "daily_support_digest",
      scheduleId: "digest-volga-daily",
      status: "due",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-30T12:00:00.000Z"
    });

    const emptyTenantClaim = claimDueScheduledDigestDescriptors({
      now: new Date("2026-06-30T15:00:00.000Z"),
      reportRepository: repository,
      tenantId: ""
    });

    assert.deepEqual(emptyTenantClaim.claimed, []);
    assert.equal(repository.findScheduledDigestDescriptor("digest-volga-due")?.status, "due");
    assert.throws(
      () => claimDueScheduledDigestDescriptors({
        limit: -1,
        now: new Date("2026-06-30T15:00:00.000Z"),
        reportRepository: repository,
        tenantId: "tenant-volga"
      }),
      /scheduled_digest_claim_limit_invalid/
    );
    assert.throws(
      () => claimDueScheduledDigestDescriptors({
        limit: 1.5,
        now: new Date("2026-06-30T15:00:00.000Z"),
        reportRepository: repository,
        tenantId: "tenant-volga"
      }),
      /scheduled_digest_claim_limit_invalid/
    );
    assert.throws(
      () => repository.saveScheduledDigestDescriptor({
        createdAt: "2026-06-30T12:00:00.000Z",
        dueAt: "not-a-date",
        id: "digest-invalid",
        periodKey: "2026-06-30",
        reportType: "daily_support_digest",
        scheduleId: "digest-invalid",
        status: "due",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-30T12:00:00.000Z"
      }),
      /scheduled_digest_due_at_invalid/
    );
    assert.throws(
      () => repository.saveScheduledDigestDescriptor({
        createdAt: "2026-06-30T12:00:00.000Z",
        dueAt: "2026-02-30T00:00:00.000Z",
        id: "digest-invalid-calendar-date",
        periodKey: "2026-02-30",
        reportType: "daily_support_digest",
        scheduleId: "digest-invalid-calendar-date",
        status: "due",
        tenantId: "tenant-volga",
        updatedAt: "2026-06-30T12:00:00.000Z"
      }),
      /scheduled_digest_due_at_invalid/
    );
  });
});

function reportExportJob(overrides: Partial<ReportExportJob> = {}): ReportExportJob {
  return {
    auditId: "audit-report-export-worker",
    backendQueueId: "queue-report-export-worker",
    columns: ["metric", "today"],
    createdAt: "2026-07-04T08:00:00.000Z",
    filters: {},
    format: "CSV",
    id: "export-report-worker",
    metricDefinitionVersion: "metrics/v1",
    name: "Report worker export",
    period: "today",
    progress: 8,
    queue: "report-export",
    requestedBy: "operator-report-worker",
    rows: 0,
    status: "Queued",
    statusKey: "queued",
    tenantId: "tenant-volga",
    ...overrides
  };
}
