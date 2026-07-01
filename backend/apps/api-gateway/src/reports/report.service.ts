import { randomUUID } from "node:crypto";
import { createEnvelope, redactExportedDescriptor, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import {
  exportJobFixtures,
  METRIC_DEFINITION_VERSION,
  reportBars,
  reportChartBlocks,
  reportColumnOptions,
  reportRows,
  rescueOutcomeSummary,
  rescueReportRows,
  type ReportExportJob
} from "./report.fixtures.js";
import { ReportRepository, type ExportRetryAuditEvent, type SavedReportTemplateRecord } from "./report.repository.js";

const REPORT_SERVICE = "reportService";

interface ReportWorkspaceFilters {
  channel?: string;
  period?: string;
  reportType?: string;
}

interface RequestReportExportPayload {
  channel?: string;
  columns?: string[];
  filters?: Record<string, unknown>;
  idempotencyKey?: string;
  period?: string;
  reportType?: string;
}

interface SaveSavedReportTemplatePayload {
  columns?: string[];
  filters?: Record<string, unknown>;
  idempotencyKey?: string;
  name?: string;
  reportType?: string;
  visibility?: {
    permissions?: string[];
    roles?: string[];
    scope: "private" | "roles" | "permissions";
  };
}

export interface ReportRequestContext {
  requesterPermissions?: string[];
  requesterRoles?: string[];
  requesterUserId?: string;
  tenantId?: string;
}

interface RetryExportPayload {
  jobId: string;
  reason?: string;
}

interface DeadLetterExportPayload {
  failureCode: string;
  failureMessage: string;
  jobId: string;
}

interface ReportQueryPayload {
  metricKey?: string;
  parameters?: {
    channel?: string;
    period?: string;
  };
  tenantId?: string;
}

export class ReportService {
  private readonly exportJobs: ReportExportJob[];
  private readonly idempotencyIndex: Map<string, { fingerprint: string; jobId: string }>;

  constructor(private readonly reportRepository: ReportRepository = ReportRepository.default()) {
    const state = this.reportRepository.readState();
    this.exportJobs = clone(exportJobFixtures);
    this.idempotencyIndex = new Map(state.idempotencyKeys.map((item) => [item.key, { fingerprint: item.fingerprint, jobId: item.jobId }]));
  }

  async fetchReportWorkspace(filters: ReportWorkspaceFilters = {}, context: ReportRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId ?? "tenant-volga";
    const requesterUserId = context.requesterUserId ?? "current-operator";
    const requesterPermissions = normalizeStringList(context.requesterPermissions);
    const requesterRoles = normalizeStringList(context.requesterRoles);

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "fetchReportWorkspace",
      traceId: reportTraceId("fetchReportWorkspace"),
      partial: true,
      meta: apiMeta({ filters }),
      data: {
        rows: clone(reportRows),
        bars: clone(reportBars),
        chartBlocks: clone(reportChartBlocks),
        columnOptions: clone(reportColumnOptions),
        rescueOutcomeSummary: clone(rescueOutcomeSummary),
        rescueReportRows: clone(rescueReportRows),
        exportJobs: clone(await this.currentExportJobs()),
        savedReportTemplates: await this.reportRepository.listSavedReportTemplates({ requesterPermissions, requesterRoles, requesterUserId, tenantId }),
        filters,
        metricDefinitionVersion: METRIC_DEFINITION_VERSION,
        source: "report_read_model"
      }
    });
  }

  async executeReportQuery(payload: ReportQueryPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (payload.metricKey !== "rescue.current" && payload.metricKey !== "conversation.current") {
      this.reportRepository.saveReportQueryExecution({
        failureEnvelope: {
          code: "report_metric_query_unsupported",
          message: "Report metric query is not supported."
        },
        id: makeQueueId("report_query"),
        metricKey: payload.metricKey ?? "unknown",
        status: "failed"
      });

      return invalidEnvelope("executeReportQuery", "report_metric_query_unsupported", "Report metric query is not supported.", {
        metricKey: payload.metricKey ?? null
      });
    }

    const parameters = {
      channel: payload.parameters?.channel ?? "all",
      period: payload.parameters?.period ?? "today",
      tenantId: payload.tenantId ?? "default"
    };
    const executionRecord = this.reportRepository.saveReportQueryExecution({
      id: makeQueueId("report_query"),
      metricKey: payload.metricKey,
      parameters,
      status: "completed"
    });

    if (payload.metricKey === "conversation.current") {
      return createEnvelope({
        service: REPORT_SERVICE,
        operation: "executeReportQuery",
        traceId: reportTraceId("executeReportQuery"),
        meta: apiMeta({ metricKey: payload.metricKey }),
        data: {
          execution: {
            id: executionRecord.id,
            status: "completed",
            metricDefinitionVersion: METRIC_DEFINITION_VERSION
          },
          metric: {
            key: "conversation.current",
            source: "report_rows"
          },
          parameters,
          rows: currentConversationMetricRows()
        }
      });
    }

    const rows = rescueRowsForChannel(rescueReportRows, parameters.channel);
    const missed = rows.filter(isMissedRescueRow).length;
    const total = rows.length;
    const saved = total - missed;
    const averageTimerSeconds = total
      ? Math.round(rows.reduce((sum, row) => sum + parseTimerSeconds(String(row.timer ?? "00:00")), 0) / total)
      : 0;

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "executeReportQuery",
      traceId: reportTraceId("executeReportQuery"),
      meta: apiMeta({ metricKey: payload.metricKey }),
      data: {
        execution: {
          id: executionRecord.id,
          status: "completed",
          metricDefinitionVersion: METRIC_DEFINITION_VERSION
        },
        metric: {
          key: "rescue.current",
          source: "rescue_report_rows"
        },
        parameters,
        rows: [
          { key: "rescue.total", label: "Total rescue cases", value: total, unit: "cases" },
          { key: "rescue.saved", label: "Saved rescue cases", value: saved, unit: "cases" },
          { key: "rescue.missed", label: "Missed rescue cases", value: missed, unit: "cases" },
          { key: "rescue.average_timer_seconds", label: "Average rescue timer", value: averageTimerSeconds, unit: "seconds" }
        ]
      }
    });
  }

  async saveSavedReportTemplate(payload: SaveSavedReportTemplatePayload, context: ReportRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const columns = payload.columns ?? [];
    if (!columns.length) {
      return invalidEnvelope("saveSavedReportTemplate", "report_template_columns_required", "At least one report template column must be selected.", {
        reportType: payload.reportType
      });
    }

    const tenantId = context.tenantId ?? "tenant-volga";
    const requesterUserId = context.requesterUserId ?? "current-operator";
    const idempotencyKey = payload.idempotencyKey?.trim();
    const fingerprint = savedTemplateFingerprint({ ...payload, columns }, { requesterUserId, tenantId });
    const idempotencyStoreKey = idempotencyKey ? reportIdempotencyKey("saveSavedReportTemplate", idempotencyKey) : undefined;
    const existingRequest = idempotencyStoreKey ? await this.findIdempotencyRequest(idempotencyStoreKey) : undefined;

    if (existingRequest) {
      if (existingRequest.fingerprint !== fingerprint) {
        return conflictEnvelope("saveSavedReportTemplate", "idempotency_key_reused", "Idempotency key was already used for a different saved report template request.", {
          idempotencyKey,
          requestFingerprint: fingerprint
        });
      }

      const existingTemplate = await this.reportRepository.findSavedReportTemplate(existingRequest.jobId, {
        tenantId
      });
      if (existingTemplate) {
        return createEnvelope({
          service: REPORT_SERVICE,
          operation: "saveSavedReportTemplate",
          traceId: reportTraceId("saveSavedReportTemplate"),
          meta: apiMeta({ idempotencyKey, tenantId }),
          data: {
            duplicate: true,
            template: clone(existingTemplate)
          }
        });
      }
    }

    const now = new Date().toISOString();
    const template: SavedReportTemplateRecord = await this.reportRepository.saveSavedReportTemplate({
      columns,
      createdAt: now,
      filters: clone(payload.filters ?? {}),
      id: `report-template-${randomUUID().slice(0, 8)}`,
      name: payload.name ?? `${payload.reportType ?? "Report"} template`,
      ownerUserId: requesterUserId,
      reportType: payload.reportType ?? "report",
      tenantId,
      updatedAt: now,
      visibility: normalizeRuntimeTemplateVisibility(payload.visibility)
    });
    if (idempotencyKey) {
      const storeKey = reportIdempotencyKey("saveSavedReportTemplate", idempotencyKey);
      this.idempotencyIndex.set(storeKey, { fingerprint, jobId: template.id });
      await this.reportRepository.saveIdempotencyKey({ key: storeKey, fingerprint, jobId: template.id });
    }

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "saveSavedReportTemplate",
      traceId: reportTraceId("saveSavedReportTemplate"),
      meta: apiMeta({ idempotencyKey: idempotencyKey ?? null, tenantId: template.tenantId }),
      data: {
        duplicate: false,
        template: clone(template)
      }
    });
  }

  async getSavedReportTemplate(templateId: string, context: ReportRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId ?? "tenant-volga";
    const template = await this.reportRepository.findSavedReportTemplate(templateId, {
      requesterPermissions: normalizeStringList(context.requesterPermissions),
      requesterRoles: normalizeStringList(context.requesterRoles),
      requesterUserId: context.requesterUserId ?? "current-operator",
      tenantId
    });

    if (!template) {
      return notFoundEnvelope("getSavedReportTemplate", "saved_report_template_not_found", `Saved report template ${templateId} was not found.`, {
        templateId
      });
    }

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "getSavedReportTemplate",
      traceId: reportTraceId("getSavedReportTemplate"),
      meta: apiMeta({ tenantId }),
      data: {
        template: clone(template)
      }
    });
  }

  async requestReportExport(payload: RequestReportExportPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const columns = payload.columns ?? [];

    if (!columns.length) {
      return invalidEnvelope("requestReportExport", "report_columns_required", "At least one report column must be selected.", {
        channel: payload.channel,
        period: payload.period,
        reportType: payload.reportType
      });
    }

    const idempotencyKey = payload.idempotencyKey?.trim();
    const fingerprint = requestFingerprint({ ...payload, columns });
    const existingRequest = idempotencyKey ? await this.findIdempotencyRequest(idempotencyKey) : undefined;

    if (existingRequest) {
      if (existingRequest.fingerprint !== fingerprint) {
        return conflictEnvelope("requestReportExport", "idempotency_key_reused", "Idempotency key was already used for a different report export request.", {
          idempotencyKey,
          requestFingerprint: fingerprint
        });
      }

      const existingJob = await this.findExportJob(existingRequest.jobId);
      if (existingJob) {
        return createEnvelope({
          service: REPORT_SERVICE,
          operation: "requestReportExport",
          traceId: reportTraceId("requestReportExport"),
          meta: apiMeta({ idempotencyKey }),
          data: {
            duplicate: true,
            exportReadyEvent: null,
            job: exportJobPayload(existingJob)
          }
        });
      }
    }

    const job: ReportExportJob = {
      id: `export-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      name: `${payload.reportType ?? "Report"}: ${payload.channel ?? "all"}`,
      format: "XLSX",
      period: payload.period ?? "today",
      statusKey: "queued",
      status: "Queued",
      progress: 8,
      requestedBy: "current-operator",
      createdAt: new Date().toISOString(),
      rows: 0,
      columns: clone(columns),
      filters: clone(payload.filters ?? {}),
      backendQueueId: makeQueueId("report"),
      auditId: makeAuditId("report"),
      metricDefinitionVersion: METRIC_DEFINITION_VERSION,
      queue: "report-export"
    };

    if (idempotencyKey) {
      const writeResult = await this.reportRepository.saveExportJobWithIdempotency(job, { key: idempotencyKey, fingerprint, jobId: job.id });
      if (writeResult.status === "conflict") {
        return conflictEnvelope("requestReportExport", "idempotency_key_reused", "Idempotency key was already used for a different report export request.", {
          idempotencyKey,
          requestFingerprint: fingerprint
        });
      }

      this.idempotencyIndex.set(idempotencyKey, { fingerprint, jobId: writeResult.job.id });
      return createEnvelope({
        service: REPORT_SERVICE,
        operation: "requestReportExport",
        traceId: reportTraceId("requestReportExport"),
        meta: apiMeta({ idempotencyKey }),
        data: {
          duplicate: writeResult.status === "duplicate",
          exportReadyEvent: null,
          job: exportJobPayload(writeResult.job)
        }
      });
    }

    this.exportJobs.unshift(job);
    await this.reportRepository.saveExportJobAsync(job);

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "requestReportExport",
      traceId: reportTraceId("requestReportExport"),
      meta: apiMeta({ idempotencyKey: idempotencyKey ?? null }),
      data: {
        duplicate: false,
        exportReadyEvent: null,
        job: exportJobPayload(job)
      }
    });
  }

  async retryReportExport(payload: RetryExportPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const job = await this.findExportJob(payload.jobId);

    if (!job) {
      return notFoundEnvelope("retryReportExport", "report_export_not_found", `Report export ${payload.jobId} was not found.`, {
        jobId: payload.jobId
      });
    }

    if (!["error", "expired"].includes(job.statusKey)) {
      return conflictEnvelope("retryReportExport", "report_export_retry_not_allowed", "Only failed or expired report exports can be retried.", {
        jobId: job.id,
        statusKey: job.statusKey
      });
    }

    const previousStatusKey = job.statusKey;
    const retryAuditEvent = auditEvent("report.export.retry");
    job.statusKey = "running";
    job.status = "Retry running";
    job.progress = 28;
    job.rows = job.rows || 486;
    job.backendQueueId = makeQueueId("report");
    job.metricDefinitionVersion = METRIC_DEFINITION_VERSION;
    job.queue = "report-export";
    await this.reportRepository.saveRetriedExportJobAsync(job, createExportRetryAuditEvent({
      auditEvent: retryAuditEvent,
      job,
      previousStatusKey
    }));
    this.reportRepository.deleteReportFileDescriptor(job.id);

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "retryReportExport",
      traceId: reportTraceId("retryReportExport"),
      meta: apiMeta({ jobId: job.id }),
      data: {
        auditEvent: retryAuditEvent,
        exportReadyEvent: null,
        job: clone(job)
      }
    });
  }

  async deadLetterReportExport(payload: DeadLetterExportPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const job = await this.findExportJob(payload.jobId);

    if (!job) {
      return notFoundEnvelope("deadLetterReportExport", "report_export_not_found", `Report export ${payload.jobId} was not found.`, {
        jobId: payload.jobId
      });
    }

    job.statusKey = "error";
    job.status = "Dead letter";
    job.progress = 0;
    job.failureCode = payload.failureCode;
    job.failureMessage = payload.failureMessage;
    job.deadLetteredAt = new Date().toISOString();
    await this.reportRepository.saveExportJobAsync(job);
    this.reportRepository.deleteReportFileDescriptor(job.id);

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "deadLetterReportExport",
      traceId: reportTraceId("deadLetterReportExport"),
      meta: apiMeta({ jobId: job.id }),
      data: {
        job: clone(job)
      }
    });
  }

  async getExportFileDescriptor(jobId: string, context: { canDownload?: boolean; tenantId?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const job = await this.findExportJob(jobId);

    if (!job) {
      return notFoundEnvelope("getExportFileDescriptor", "report_export_not_found", `Report export ${jobId} was not found.`, { jobId });
    }

    if (job.statusKey !== "ready") {
      return deniedEnvelope("getExportFileDescriptor", "report_export_not_ready", "Report export file is not ready for download.", {
        jobId,
        statusKey: job.statusKey
      });
    }

    if (!context.canDownload) {
      return deniedEnvelope("getExportFileDescriptor", "report_export_download_denied", "Current role cannot download this report export.", {
        jobId,
        permissionRequired: "reports.export"
      });
    }

    const persistedDescriptor = this.reportRepository.findReportFileDescriptor(job.id);
    if (persistedDescriptor) {
      if (context.tenantId && persistedDescriptor.tenantId !== context.tenantId) {
        return notFoundEnvelope("getExportFileDescriptor", "report_export_file_descriptor_not_found", `Report export file descriptor ${jobId} was not found.`, {
          jobId
        });
      }

      return createEnvelope({
        service: REPORT_SERVICE,
        operation: "getExportFileDescriptor",
        traceId: reportTraceId("getExportFileDescriptor"),
        meta: apiMeta({ jobId }),
        data: {
          ...redactExportedDescriptor({
            checksum: persistedDescriptor.checksum,
            contentType: persistedDescriptor.contentType,
            downloadUrl: `https://reports.local/download/${job.id}/${persistedDescriptor.fileName}`,
            expiresIn: "24h",
            fileName: persistedDescriptor.fileName,
            jobId: job.id,
            metricDefinitionVersion: persistedDescriptor.metricDefinitionVersion,
            objectKeyExposed: false,
            permissionRequired: "reports.export",
            sizeBytes: persistedDescriptor.sizeBytes,
            writtenAt: persistedDescriptor.writtenAt
          })
        }
      });
    }

    const extension = job.format.toLowerCase();
    const fileName = `${slugify(job.name)}.${extension}`;

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "getExportFileDescriptor",
      traceId: reportTraceId("getExportFileDescriptor"),
      meta: apiMeta({ jobId }),
      data: {
        ...redactExportedDescriptor({
          auditId: job.auditId,
          downloadUrl: `https://reports.local/download/${job.id}/${fileName}`,
          expiresIn: "24h",
          fileName,
          jobId: job.id,
          metricDefinitionVersion: job.metricDefinitionVersion ?? METRIC_DEFINITION_VERSION,
          objectKeyExposed: false,
          permissionRequired: "reports.export"
        })
      }
    });
  }

  private async findExportJob(jobId: string): Promise<ReportExportJob | undefined> {
    return (await this.currentExportJobs()).find((job) => job.id === jobId);
  }

  private async findIdempotencyRequest(key: string): Promise<{ fingerprint: string; jobId: string } | undefined> {
    const record = await this.reportRepository.findIdempotencyKey(key);
    if (record) {
      return { fingerprint: record.fingerprint, jobId: record.jobId };
    }

    return this.idempotencyIndex.get(key);
  }

  private async currentExportJobs(): Promise<ReportExportJob[]> {
    const persisted = await this.reportRepository.listExportJobsAsync();
    if (!persisted.length) {
      return this.exportJobs;
    }

    const persistedIds = new Set(persisted.map((job) => job.id));
    return [...persisted, ...this.exportJobs.filter((job) => !persistedIds.has(job.id))];
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function auditEvent(action: string): Record<string, unknown> {
  return {
    id: makeAuditId("report"),
    action,
    immutable: true,
    reasonCode: "operator_requested"
  };
}

function createExportRetryAuditEvent({
  auditEvent,
  job,
  previousStatusKey
}: {
  auditEvent: Record<string, unknown>;
  job: ReportExportJob;
  previousStatusKey: string;
}): ExportRetryAuditEvent {
  return {
    action: "report.export.retry",
    at: new Date().toISOString(),
    auditId: String(auditEvent.id),
    backendQueueId: job.backendQueueId ?? "",
    format: job.format,
    immutable: true,
    jobId: job.id,
    metricDefinitionVersion: job.metricDefinitionVersion ?? METRIC_DEFINITION_VERSION,
    nextStatusKey: job.statusKey,
    previousStatusKey,
    queue: job.queue ?? "report-export",
    reasonCode: "operator_requested"
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deniedEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: REPORT_SERVICE,
    operation,
    traceId: reportTraceId(operation),
    status: "denied",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: REPORT_SERVICE,
    operation,
    traceId: reportTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: REPORT_SERVICE,
    operation,
    traceId: reportTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function notFoundEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: REPORT_SERVICE,
    operation,
    traceId: reportTraceId(operation),
    status: "not_found",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeQueueId(scope: string): string {
  return `${scope}_${randomUUID()}`;
}

function reportTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(REPORT_SERVICE, operation);
}

function normalizeRuntimeTemplateVisibility(visibility: SaveSavedReportTemplatePayload["visibility"]): SavedReportTemplateRecord["visibility"] {
  if (visibility?.scope === "roles") {
    return {
      roles: normalizeStringList(visibility.roles),
      scope: "roles"
    };
  }

  if (visibility?.scope === "permissions") {
    return {
      permissions: normalizeStringList(visibility.permissions),
      scope: "permissions"
    };
  }

  return { scope: "private" };
}

function normalizeStringList(value?: string[] | string): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

function exportJobPayload(job: ReportExportJob): Record<string, unknown> {
  return {
    ...clone(job),
    permissionRequired: "reports.export"
  };
}

function requestFingerprint(payload: RequestReportExportPayload): string {
  return stableStringify({
    channel: payload.channel ?? null,
    columns: payload.columns ?? [],
    filters: payload.filters ?? {},
    period: payload.period ?? null,
    reportType: payload.reportType ?? null
  });
}

function reportIdempotencyKey(operation: "saveSavedReportTemplate", key: string): string {
  return `${operation}:${key}`;
}

function savedTemplateFingerprint(payload: SaveSavedReportTemplatePayload, context: { requesterUserId: string; tenantId: string }): string {
  return stableStringify({
    columns: payload.columns ?? [],
    filters: payload.filters ?? {},
    name: payload.name ?? null,
    ownerUserId: context.requesterUserId,
    reportType: payload.reportType ?? null,
    tenantId: context.tenantId,
    visibility: normalizeRuntimeTemplateVisibility(payload.visibility)
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function rescueRowsForChannel(rows: Array<Record<string, unknown>>, channel: string): Array<Record<string, unknown>> {
  if (channel === "all") {
    return clone(rows);
  }

  return clone(rows.filter((row) => row.channel === channel));
}

function currentConversationMetricRows(): Array<Record<string, unknown>> {
  const [newConversations, closedConversations, firstResponse, slaMet] = reportRows;
  return [
    {
      key: "conversation.new",
      label: "New conversations",
      value: parseIntegerMetric(newConversations?.today),
      unit: "conversations"
    },
    {
      key: "conversation.closed",
      label: "Closed conversations",
      value: parseIntegerMetric(closedConversations?.today),
      unit: "conversations"
    },
    {
      key: "conversation.first_response_seconds",
      label: "First response time",
      value: parseTimerSeconds(String(firstResponse?.today ?? "00:00")),
      unit: "seconds"
    },
    {
      key: "conversation.sla_met_percent",
      label: "SLA met",
      value: parsePercentMetric(slaMet?.today),
      unit: "percent"
    }
  ];
}

function isMissedRescueRow(row: Record<string, unknown>): boolean {
  const outcome = String(row.outcome ?? "").toLowerCase();
  return outcome.includes("проп") || outcome.includes("рџсђрѕрї");
}

function parseIntegerMetric(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "0").replace(/\D+/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePercentMetric(value: unknown): number {
  return parseIntegerMetric(value);
}

function parseTimerSeconds(value: string): number {
  const [minutes, seconds] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return 0;
  }

  return minutes * 60 + seconds;
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/giu, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "report-export";
}
