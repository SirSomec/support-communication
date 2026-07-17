import { randomUUID } from "node:crypto";
import { createEnvelope, redactExportedDescriptor, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import {
  executeCsvReportExport,
  executeXlsxReportExport,
  reportSnapshotAt,
  type ReportCsvColumn,
  type ReportObjectStorageBody,
  type ReportObjectStorageReader,
  type ReportObjectStorageWriter
} from "./report-export.worker.js";
import { createSharedReportObjectStorage, type ReportObjectStorageDownloadSigner } from "./report-object-storage.js";
import type { ReportExportJob } from "./report.types.js";
import {
  ReportRepository,
  type ExportRetryAuditEvent,
  type ReportFileDescriptorRecord,
  type ReportWorkspaceCatalog,
  type RoutingActivityEventType,
  type RoutingActivityReportSourceRow,
  type SavedReportTemplateRecord
} from "./report.repository.js";
import { buildLiveReportWorkspace, type LiveReportConversation, type LiveReportWorkspace, type LiveReportWorkspaceOptions } from "./report-live-workspace.js";
import {
  REPORT_COLUMN_OPTIONS as defaultReportColumnOptions,
  REPORT_METRIC_DEFINITION_VERSION
} from "./report-definition.js";
import {
  buildConversationReportDataQuality,
  buildConversationReportFilterOptions,
  filterReportConversations,
  type ConversationReportFilters
} from "./report-conversation-filters.js";

const REPORT_SERVICE = "reportService";

interface ReportWorkspaceFilters extends ConversationReportFilters {
  channel?: string;
  period?: string;
  reportType?: string;
  timezoneOffsetMinutes?: number | string;
}

export interface RoutingActivityReportFilters {
  channel?: string;
  eventType?: string;
  operatorId?: string;
  period?: string;
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
    timezoneOffsetMinutes?: number | string;
  };
  tenantId?: string;
}

interface ReportServiceOptions {
  now?: () => Date;
  objectStorage?: ReportObjectStorageReader & Partial<ReportObjectStorageWriter & ReportObjectStorageDownloadSigner>;
}

export class ReportService {
  private readonly idempotencyIndex: Map<string, { fingerprint: string; jobId: string }>;
  private readonly now: () => Date;
  private readonly objectStorage: ReportObjectStorageReader & Partial<ReportObjectStorageWriter & ReportObjectStorageDownloadSigner>;

  constructor(
    private readonly reportRepository: ReportRepository = ReportRepository.default(),
    options: ReportServiceOptions = {}
  ) {
    const state = this.reportRepository.readState();
    this.idempotencyIndex = new Map(state.idempotencyKeys.map((item) => [
      reportTenantIdempotencyKey(item.tenantId, item.key),
      { fingerprint: item.fingerprint, jobId: item.jobId }
    ]));
    this.now = options.now ?? (() => new Date());
    this.objectStorage = options.objectStorage ?? createSharedReportObjectStorage(process.env);
  }

  private readWorkspaceCatalog(): ReportWorkspaceCatalog {
    return withReportWorkspaceDefaults(this.reportRepository.readWorkspaceCatalog());
  }

  private metricDefinitionVersion(): string {
    return this.readWorkspaceCatalog().metricDefinitionVersion;
  }

  async fetchRoutingActivityReport(
    filters: RoutingActivityReportFilters = {},
    context: ReportRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return deniedEnvelope(
        "fetchRoutingActivityReport",
        "routing_activity_tenant_scope_required",
        "Routing activity report requires an explicit tenant scope.",
        {}
      );
    }
    const eventType = normalizeRoutingActivityEventType(filters.eventType);
    if (eventType === "invalid") {
      return invalidEnvelope(
        "fetchRoutingActivityReport",
        "routing_activity_event_type_invalid",
        "Routing activity event type must be assignment, transfer or all.",
        { eventType: filters.eventType ?? null }
      );
    }

    let workspace: LiveReportWorkspace;
    try {
      workspace = buildLiveReportWorkspace([], {
        now: this.now(),
        period: filters.period as LiveReportWorkspaceOptions["period"]
      });
    } catch {
      return invalidEnvelope(
        "fetchRoutingActivityReport",
        "routing_activity_period_invalid",
        "Routing activity report period is not supported.",
        { period: filters.period ?? null }
      );
    }

    const channel = normalizeRoutingActivityFilter(filters.channel);
    const operatorId = normalizeRoutingActivityFilter(filters.operatorId);
    const from = new Date(workspace.windows.current.from);
    const to = new Date(workspace.windows.current.to);
    const sourceRows = await this.reportRepository.listRoutingActivityReportSourceRowsAsync({
      from,
      tenantId,
      to,
      ...(channel ? { channel } : {}),
      ...(eventType ? { eventType } : {}),
      ...(operatorId ? { operatorId } : {})
    });
    const rows = sourceRows.filter((row) => isRoutingActivityRowInScope(row, {
      channel,
      eventType,
      from: from.getTime(),
      operatorId,
      tenantId,
      to: to.getTime()
    }));
    const aggregates = aggregateRoutingActivityByOperator(rows, operatorId);

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "fetchRoutingActivityReport",
      traceId: reportTraceId("fetchRoutingActivityReport"),
      partial: false,
      meta: apiMeta({ filters }),
      data: {
        empty: rows.length === 0,
        filters: {
          channel: channel ?? "all",
          eventType: eventType ?? "all",
          operatorId: operatorId ?? "all",
          period: workspace.period
        },
        hasActivity: rows.length > 0,
        periodLabel: workspace.periodLabel,
        rows: aggregates.rows,
        source: "routing_analytics_rows",
        totals: {
          assignments: rows.filter((row) => row.eventKind === "assignment").length,
          operators: aggregates.rows.length,
          totalEvents: rows.length,
          transfers: rows.filter((row) => row.eventKind === "transfer").length,
          unattributedEvents: aggregates.unattributedEvents
        },
        windows: {
          current: workspace.windows.current
        }
      }
    });
  }

  async fetchReportWorkspace(filters: ReportWorkspaceFilters = {}, context: ReportRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("fetchReportWorkspace");
    }
    const requesterUserId = context.requesterUserId ?? "current-operator";
    const requesterPermissions = normalizeStringList(context.requesterPermissions);
    const requesterRoles = normalizeStringList(context.requesterRoles);
    const workspace = this.readWorkspaceCatalog();
    const snapshotAt = this.now();
    let reportSource: Awaited<ReturnType<typeof this.buildTenantConversationWorkspace>>;
    try {
      reportSource = await this.buildTenantConversationWorkspace(tenantId, filters, snapshotAt);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return invalidEnvelope(
        "fetchReportWorkspace",
        "report_workspace_filters_invalid",
        "Report workspace filters are invalid.",
        {
          period: filters.period ?? null,
          timezoneOffsetMinutes: filters.timezoneOffsetMinutes ?? null
        }
      );
    }
    const liveWorkspace = reportSource.workspace;
    const hasConversationActivity = liveWorkspace.current.newConversations > 0
      || liveWorkspace.previous.newConversations > 0
      || liveWorkspace.current.closedConversations > 0
      || liveWorkspace.previous.closedConversations > 0;
    const reportRows = liveWorkspace.rows.map((row) => ({
      delta: row.delta,
      metric: row.metric,
      previous: row.previous,
      status: row.status,
      today: row.current
    }));

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "fetchReportWorkspace",
      traceId: reportTraceId("fetchReportWorkspace"),
      partial: false,
      meta: apiMeta({ filters }),
      data: {
        rows: reportRows,
        bars: clone(liveWorkspace.bars),
        chartBlocks: hasConversationActivity ? clone(liveWorkspace.chartBlocks) : [],
        columnOptions: clone(workspace.reportColumnOptions),
        rescueOutcomeSummary: [],
        rescueReportRows: [],
        exportJobs: clone(await this.currentExportJobs(tenantId)),
        hasActivity: hasConversationActivity,
        metrics: [
          metricTileFromRow(liveWorkspace, "newConversations", "Новых"),
          metricTileFromRow(liveWorkspace, "closedConversations", "Закрыто"),
          metricTileFromRow(liveWorkspace, "firstResponseSeconds", "Первый ответ"),
          metricTileFromRow(liveWorkspace, "slaPercent", "SLA без нарушения")
        ],
        operators: [],
        filterOptions: {
          ...buildConversationReportFilterOptions(reportSource.sourceRows),
          channels: [...new Set(reportSource.sourceRows.map((row) => row.channel).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right, "ru"))
        },
        savedReportTemplates: await this.reportRepository.listSavedReportTemplates({ requesterPermissions, requesterRoles, requesterUserId, tenantId }),
        filters,
        metricDefinitionVersion: this.metricDefinitionVersion(),
        snapshotAt: snapshotAt.toISOString(),
        source: "conversation_lifecycle_events",
        dataQuality: {
          ...buildConversationReportDataQuality(reportSource.filteredRows, snapshotAt),
          historicalLimitations: [
            "Status transitions and SLA breaches before lifecycle journaling are unavailable",
            "Conversation creation and message timestamps were backfilled from persisted records"
          ],
          metricDefinitionVersion: this.metricDefinitionVersion(),
          source: "conversation_lifecycle_events"
        },
        windows: liveWorkspace.windows
      }
    });
  }

  private async buildTenantConversationWorkspace(
    tenantId: string,
    filters: ReportWorkspaceFilters,
    snapshotAt = this.now()
  ): Promise<{
    filteredRows: Awaited<ReturnType<ReportRepository["listConversationReportSourceRowsAsync"]>>;
    sourceRows: Awaited<ReturnType<ReportRepository["listConversationReportSourceRowsAsync"]>>;
    workspace: LiveReportWorkspace;
  }> {
    const options: LiveReportWorkspaceOptions = {
      channel: filters.channel,
      now: snapshotAt,
      period: filters.period as LiveReportWorkspaceOptions["period"],
      timezoneOffsetMinutes: normalizeTimezoneOffset(filters.timezoneOffsetMinutes)
    };
    const emptyWorkspace = buildLiveReportWorkspace([], options);
    const sourceRows = await this.reportRepository.listConversationReportSourceRowsAsync({
      from: new Date(emptyWorkspace.windows.previous.from),
      tenantId,
      to: new Date(emptyWorkspace.windows.current.to)
    });

    const conversations = filterReportConversations(sourceRows, filters);
    return {
      filteredRows: conversations,
      sourceRows,
      workspace: buildLiveReportWorkspace(conversations as LiveReportConversation[], options)
    };
  }

  async executeReportQuery(payload: ReportQueryPayload): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = payload.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("executeReportQuery");
    }

    if (payload.metricKey !== "rescue.current" && payload.metricKey !== "conversation.current") {
      await this.reportRepository.saveReportQueryExecutionAsync({
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
      timezoneOffsetMinutes: normalizeTimezoneOffset(payload.parameters?.timezoneOffsetMinutes),
      tenantId
    };
    const executionRecord = await this.reportRepository.saveReportQueryExecutionAsync({
      id: makeQueueId("report_query"),
      metricKey: payload.metricKey,
      parameters,
      status: "completed"
    });

    if (payload.metricKey === "conversation.current") {
      const liveWorkspace = await this.buildTenantConversationWorkspace(tenantId, parameters);
      return createEnvelope({
        service: REPORT_SERVICE,
        operation: "executeReportQuery",
        traceId: reportTraceId("executeReportQuery"),
        meta: apiMeta({ metricKey: payload.metricKey }),
        data: {
          execution: {
            id: executionRecord.id,
            status: "completed",
            metricDefinitionVersion: this.metricDefinitionVersion()
          },
          metric: {
            key: "conversation.current",
            source: "report_rows"
          },
          parameters,
          rows: currentConversationMetricRows(liveWorkspace.workspace.rows.map((row) => ({ today: row.current })))
        }
      });
    }

    const emptyWorkspace = buildLiveReportWorkspace([], {
      channel: parameters.channel,
      period: parameters.period as LiveReportWorkspaceOptions["period"],
      timezoneOffsetMinutes: parameters.timezoneOffsetMinutes
    });
    const conversations = await this.reportRepository.listConversationReportSourceRowsAsync({
      from: new Date(emptyWorkspace.windows.current.from),
      tenantId,
      to: new Date(emptyWorkspace.windows.current.to)
    });
    const rescueEvents = conversations
      .filter((conversation) => parameters.channel === "all" || conversation.channel.toLowerCase() === parameters.channel.toLowerCase())
      .flatMap((conversation) => conversation.lifecycleEvents ?? [])
      .filter((event) => event.eventType === "rescue.resolved" || event.eventType === "rescue.auto_returned");
    const missed = rescueEvents.filter((event) => event.eventType === "rescue.auto_returned" || event.data?.outcome === "missed").length;
    const total = rescueEvents.length;
    const saved = total - missed;
    const startedDurations = conversations
      .flatMap((conversation) => conversation.lifecycleEvents ?? [])
      .filter((event) => event.eventType === "rescue.started")
      .map((event) => Number(event.data?.durationSeconds))
      .filter(Number.isFinite);
    const averageTimerSeconds = startedDurations.length
      ? Math.round(startedDurations.reduce((sum, value) => sum + value, 0) / startedDurations.length)
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
          metricDefinitionVersion: this.metricDefinitionVersion()
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
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("saveSavedReportTemplate");
    }

    const columns = payload.columns ?? [];
    if (!columns.length) {
      return invalidEnvelope("saveSavedReportTemplate", "report_template_columns_required", "At least one report template column must be selected.", {
        reportType: payload.reportType
      });
    }

    const requesterUserId = context.requesterUserId ?? "current-operator";
    const idempotencyKey = payload.idempotencyKey?.trim();
    const fingerprint = savedTemplateFingerprint({ ...payload, columns }, { requesterUserId, tenantId });
    const idempotencyStoreKey = idempotencyKey ? reportIdempotencyKey("saveSavedReportTemplate", idempotencyKey) : undefined;
    const existingRequest = idempotencyStoreKey ? await this.findIdempotencyRequest(tenantId, idempotencyStoreKey) : undefined;

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
      this.idempotencyIndex.set(reportTenantIdempotencyKey(tenantId, storeKey), { fingerprint, jobId: template.id });
      await this.reportRepository.saveIdempotencyKey({ key: storeKey, fingerprint, jobId: template.id, tenantId });
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
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("getSavedReportTemplate");
    }
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

  async requestReportExport(payload: RequestReportExportPayload, context: ReportRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("requestReportExport");
    }
    const columns = payload.columns ?? [];

    if (!columns.length) {
      return invalidEnvelope("requestReportExport", "report_columns_required", "At least one report column must be selected.", {
        channel: payload.channel,
        period: payload.period,
        reportType: payload.reportType
      });
    }

    const idempotencyKey = payload.idempotencyKey?.trim();
    const fingerprint = requestFingerprint({ ...payload, columns }, tenantId);
    const existingRequest = idempotencyKey ? await this.findIdempotencyRequest(tenantId, idempotencyKey) : undefined;

    if (existingRequest) {
      if (existingRequest.fingerprint !== fingerprint) {
        return conflictEnvelope("requestReportExport", "idempotency_key_reused", "Idempotency key was already used for a different report export request.", {
          idempotencyKey,
          requestFingerprint: fingerprint
        });
      }

      const existingJob = await this.findExportJob(existingRequest.jobId, tenantId);
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

    const createdAt = this.now().toISOString();
    const requestedSnapshotAt = typeof payload.filters?.snapshotAt === "string"
      ? payload.filters.snapshotAt
      : createdAt;
    const job: ReportExportJob = {
      id: `export-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      name: `${payload.reportType ?? "Report"}: ${payload.channel ?? "all"}`,
      format: "XLSX",
      period: payload.period ?? "today",
      statusKey: "queued",
      status: "Queued",
      progress: 8,
      requestedBy: "current-operator",
      createdAt,
      rows: 0,
      columns: clone(columns),
      backendQueueId: makeQueueId("report"),
      auditId: makeAuditId("report"),
      metricDefinitionVersion: this.metricDefinitionVersion(),
      queue: "report-export",
      tenantId,
      filters: {
        ...clone(payload.filters ?? {}),
        snapshotAt: requestedSnapshotAt,
        channel: payload.channel ?? "Все каналы",
        tenantId
      }
    };

    if (idempotencyKey) {
      const writeResult = await this.reportRepository.saveExportJobWithIdempotency(job, {
        key: idempotencyKey,
        fingerprint,
        jobId: job.id,
        tenantId
      });
      if (writeResult.status === "conflict") {
        return conflictEnvelope("requestReportExport", "idempotency_key_reused", "Idempotency key was already used for a different report export request.", {
          idempotencyKey,
          requestFingerprint: fingerprint
        });
      }

      this.idempotencyIndex.set(reportTenantIdempotencyKey(tenantId, idempotencyKey), {
        fingerprint,
        jobId: writeResult.job.id
      });
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

  async retryReportExport(payload: RetryExportPayload, context: ReportRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("retryReportExport");
    }
    const job = await this.findExportJob(payload.jobId, tenantId);

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
    job.statusKey = "queued";
    job.status = "Retry queued";
    job.progress = 0;
    job.rows = 0;
    job.backendQueueId = makeQueueId("report");
    job.metricDefinitionVersion = this.metricDefinitionVersion();
    job.queue = "report-export";
    await this.reportRepository.saveRetriedExportJobAsync(job, createExportRetryAuditEvent({
      auditEvent: retryAuditEvent,
      job,
      previousStatusKey
    }));
    await this.reportRepository.deleteReportFileDescriptorAsync(job.id);

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

  async deadLetterReportExport(payload: DeadLetterExportPayload, context: ReportRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("deadLetterReportExport");
    }
    const job = await this.findExportJob(payload.jobId, tenantId);

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
    await this.reportRepository.deleteReportFileDescriptorAsync(job.id);

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
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("getExportFileDescriptor");
    }
    const job = await this.findExportJob(jobId, tenantId);

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

    let persistedDescriptor = await this.reportRepository.findReportFileDescriptorAsync(job.id);
    if (!persistedDescriptor && tenantId === reportExportTenantId(job)) {
      persistedDescriptor = await this.materializeReadyExportFile(job);
    }
    if (persistedDescriptor) {
      if (persistedDescriptor.tenantId !== tenantId) {
        return notFoundEnvelope("getExportFileDescriptor", "report_export_file_descriptor_not_found", `Report export file descriptor ${jobId} was not found.`, {
          jobId
        });
      }

      const signedDownload = await this.signReportDownload({
        fileName: persistedDescriptor.fileName,
        jobId: job.id,
        objectKey: persistedDescriptor.objectKey,
        tenantId
      });
      return createEnvelope({
        service: REPORT_SERVICE,
        operation: "getExportFileDescriptor",
        traceId: reportTraceId("getExportFileDescriptor"),
        meta: apiMeta({ jobId }),
        data: {
          ...redactExportedDescriptor({
            checksum: persistedDescriptor.checksum,
            contentType: persistedDescriptor.contentType,
            downloadUrl: signedDownload.downloadUrl,
            expiresAt: signedDownload.expiresAt,
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

    return notFoundEnvelope("getExportFileDescriptor", "report_export_file_descriptor_not_found", `Report export file descriptor ${jobId} was not found.`, { jobId });
  }

  async getExportFileDownload(jobId: string, context: { canDownload?: boolean; tenantId?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId?.trim();
    if (!tenantId) {
      return tenantScopeRequiredEnvelope("getExportFileDownload");
    }
    const job = await this.findExportJob(jobId, tenantId);

    if (!job) {
      return notFoundEnvelope("getExportFileDownload", "report_export_not_found", `Report export ${jobId} was not found.`, { jobId });
    }

    if (job.statusKey !== "ready") {
      return deniedEnvelope("getExportFileDownload", "report_export_not_ready", "Report export file is not ready for download.", {
        jobId,
        statusKey: job.statusKey
      });
    }

    if (!context.canDownload) {
      return deniedEnvelope("getExportFileDownload", "report_export_download_denied", "Current role cannot download this report export.", {
        jobId,
        permissionRequired: "reports.export"
      });
    }

    let descriptor = await this.reportRepository.findReportFileDescriptorAsync(job.id);
    if (!descriptor && tenantId === reportExportTenantId(job)) {
      descriptor = await this.materializeReadyExportFile(job);
    }
    if (!descriptor || descriptor.tenantId !== tenantId) {
      return notFoundEnvelope("getExportFileDownload", "report_export_file_descriptor_not_found", `Report export file descriptor ${jobId} was not found.`, {
        jobId
      });
    }

    const object = await this.objectStorage.getObject({ objectKey: descriptor.objectKey });
    if (!object) {
      return notFoundEnvelope("getExportFileDownload", "report_export_object_not_found", `Report export object ${jobId} was not found.`, {
        jobId
      });
    }

    return createEnvelope({
      service: REPORT_SERVICE,
      operation: "getExportFileDownload",
      traceId: reportTraceId("getExportFileDownload"),
      meta: apiMeta({ jobId }),
      data: {
        body: reportDownloadBodyBuffer(object.body),
        checksum: descriptor.checksum,
        contentType: descriptor.contentType,
        fileName: descriptor.fileName,
        jobId: job.id,
        metricDefinitionVersion: descriptor.metricDefinitionVersion,
        objectKeyExposed: false,
        permissionRequired: "reports.export",
        sizeBytes: descriptor.sizeBytes,
        writtenAt: descriptor.writtenAt
      }
    });
  }

  private async materializeReadyExportFile(job: ReportExportJob): Promise<ReportFileDescriptorRecord | undefined> {
    if (job.format !== "CSV" && job.format !== "XLSX") {
      return undefined;
    }

    if (!isReportObjectStorageWriter(this.objectStorage)) {
      return undefined;
    }

    const tenantId = reportExportTenantId(job);
    const fileName = reportExportFileName(job);
    const objectKey = `reports/${tenantId}/${job.id}/${fileName}`;
    const liveWorkspace = await this.buildTenantConversationWorkspace(tenantId, {
      channel: typeof job.filters?.channel === "string" ? job.filters.channel : undefined,
      operatorId: typeof job.filters?.operatorId === "string" ? job.filters.operatorId : undefined,
      outcome: typeof job.filters?.outcome === "string" ? job.filters.outcome : undefined,
      period: job.period,
      queueId: typeof job.filters?.queueId === "string" ? job.filters.queueId : undefined,
      resolutionOutcome: typeof job.filters?.resolutionOutcome === "string" ? job.filters.resolutionOutcome : undefined,
      status: typeof job.filters?.status === "string" ? job.filters.status : undefined,
      teamId: typeof job.filters?.teamId === "string" ? job.filters.teamId : undefined,
      timezoneOffsetMinutes: job.filters?.timezoneOffsetMinutes as number | string | undefined,
      topic: typeof job.filters?.topic === "string" ? job.filters.topic : undefined
    }, reportSnapshotAt(job));
    const rows = liveWorkspace.workspace.rows.map((row) => ({
      delta: row.delta,
      metric: row.metric,
      previous: row.previous,
      status: row.status,
      today: row.current
    }));
    const exportInput = {
      columns: reportExportColumns(job, this.readWorkspaceCatalog()),
      jobId: job.id,
      metricDefinitionVersion: job.metricDefinitionVersion ?? this.metricDefinitionVersion(),
      objectKey,
      rows: clone(rows),
      storage: this.objectStorage
    };
    const object = job.format === "CSV"
      ? await executeCsvReportExport(exportInput)
      : await executeXlsxReportExport(exportInput);

    return this.reportRepository.saveReportFileDescriptorAsync({
      checksum: object.checksum,
      contentType: object.contentType,
      createdAt: object.writtenAt,
      fileName,
      format: job.format,
      id: `file_${job.id}`,
      jobId: job.id,
      metricDefinitionVersion: job.metricDefinitionVersion ?? this.metricDefinitionVersion(),
      objectKey: object.objectKey,
      sizeBytes: object.sizeBytes,
      tenantId,
      writtenAt: object.writtenAt
    });
  }

  private async findExportJob(jobId: string, tenantId?: string): Promise<ReportExportJob | undefined> {
    return (await this.currentExportJobs(tenantId)).find((job) => job.id === jobId);
  }

  private async findIdempotencyRequest(tenantId: string, key: string): Promise<{ fingerprint: string; jobId: string } | undefined> {
    const record = await this.reportRepository.findIdempotencyKey(tenantId, key);
    if (record) {
      return { fingerprint: record.fingerprint, jobId: record.jobId };
    }

    return this.idempotencyIndex.get(reportTenantIdempotencyKey(tenantId, key));
  }

  private async currentExportJobs(tenantId?: string): Promise<ReportExportJob[]> {
    return this.reportRepository.listExportJobsAsync({ tenantId });
  }

  private async signReportDownload(input: { fileName: string; jobId: string; objectKey: string; tenantId: string }): Promise<{ downloadUrl: string; expiresAt: string }> {
    if (typeof this.objectStorage.signDownload !== "function") {
      throw new Error("report_object_storage_download_sign_required");
    }
    return this.objectStorage.signDownload(input);
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function normalizeTimezoneOffset(value: number | string | undefined): number {
  if (value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > 14 * 60) {
    throw new RangeError("timezoneOffsetMinutes must be between -840 and 840.");
  }
  return parsed;
}

function reportTenantIdempotencyKey(tenantId: string, key: string): string {
  return `${tenantId}\u0000${key}`;
}

function metricTileFromRow(workspace: LiveReportWorkspace, key: LiveReportWorkspace["rows"][number]["key"], label: string) {
  const row = workspace.rows.find((item) => item.key === key);
  return {
    detail: row ? `${row.delta} · ${row.status}` : "Нет данных",
    label,
    value: row?.current ?? "0"
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
    metricDefinitionVersion: job.metricDefinitionVersion ?? REPORT_METRIC_DEFINITION_VERSION,
    nextStatusKey: job.statusKey,
    previousStatusKey,
    queue: job.queue ?? "report-export",
    reasonCode: "operator_requested"
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withReportWorkspaceDefaults(workspace: ReportWorkspaceCatalog): ReportWorkspaceCatalog {
  return {
    metricDefinitionVersion: workspace.metricDefinitionVersion || REPORT_METRIC_DEFINITION_VERSION,
    reportBars: clone(workspace.reportBars ?? []),
    reportChartBlocks: clone(workspace.reportChartBlocks ?? []),
    reportColumnOptions: withDefaultList(workspace.reportColumnOptions, defaultReportColumnOptions),
    reportRows: clone(workspace.reportRows ?? []),
    rescueOutcomeSummary: clone(workspace.rescueOutcomeSummary ?? []),
    rescueReportRows: clone(workspace.rescueReportRows ?? [])
  };
}

function withDefaultList<T>(value: T[] | undefined, fallback: readonly T[]): T[] {
  return Array.isArray(value) && value.length ? value : clone([...fallback]);
}

function tenantScopeRequiredEnvelope(operation: string): BackendEnvelope<Record<string, unknown>> {
  return deniedEnvelope(
    operation,
    "report_tenant_scope_required",
    "Report operation requires an explicit tenant scope.",
    {}
  );
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

function requestFingerprint(payload: RequestReportExportPayload, tenantId: string): string {
  return stableStringify({
    channel: payload.channel ?? null,
    columns: payload.columns ?? [],
    filters: payload.filters ?? {},
    period: payload.period ?? null,
    reportType: payload.reportType ?? null,
    tenantId
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

function reportDownloadBodyBuffer(body: ReportObjectStorageBody): Buffer {
  return Buffer.isBuffer(body) ? Buffer.from(body) : Buffer.from(body, "utf8");
}

function isReportObjectStorageWriter(
  storage: ReportObjectStorageReader & Partial<ReportObjectStorageWriter>
): storage is ReportObjectStorageReader & ReportObjectStorageWriter {
  return typeof storage.putObject === "function";
}

function reportExportColumns(job: ReportExportJob, catalog: ReportWorkspaceCatalog): ReportCsvColumn[] {
  const options = catalog.reportColumnOptions as Array<{ id?: string; label?: string }>;
  const requested = job.columns?.length
    ? job.columns
    : options.map((column) => column.id).filter((id): id is string => typeof id === "string" && id.length > 0);

  return requested.map((id) => {
    const option = options.find((column) => column.id === id);
    return {
      id,
      label: option?.label ?? id
    };
  });
}

function reportExportTenantId(job: ReportExportJob): string {
  const resolved = job.tenantId?.trim();
  if (!resolved) {
    throw new Error("report_export_job_tenant_id_required");
  }
  return resolved;
}

function reportExportFileName(job: ReportExportJob): string {
  const extension = job.format === "CSV" ? "csv" : job.format.toLowerCase();
  return `${job.id}.${extension}`;
}

function normalizeRoutingActivityEventType(value: string | undefined): RoutingActivityEventType | "invalid" | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === "all") {
    return undefined;
  }

  return normalized === "assignment" || normalized === "transfer" ? normalized : "invalid";
}

function normalizeRoutingActivityFilter(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  const lowered = normalized?.toLocaleLowerCase("ru-RU");
  return !normalized || lowered === "all" || lowered === "все каналы" || lowered === "все операторы"
    ? undefined
    : normalized;
}

function isRoutingActivityRowInScope(
  row: RoutingActivityReportSourceRow,
  filters: {
    channel?: string;
    eventType?: RoutingActivityEventType;
    from: number;
    operatorId?: string;
    tenantId: string;
    to: number;
  }
): boolean {
  const occurredAt = Date.parse(row.occurredAt);
  return row.tenantId === filters.tenantId
    && (row.eventKind === "assignment" || row.eventKind === "transfer")
    && (!filters.eventType || row.eventKind === filters.eventType)
    && (!filters.channel || row.channel.trim().toLowerCase() === filters.channel.toLowerCase())
    && (!filters.operatorId || (row.eventKind === "assignment"
      ? row.toOperatorId === filters.operatorId
      : row.fromOperatorId === filters.operatorId || row.toOperatorId === filters.operatorId))
    && Number.isFinite(occurredAt)
    && occurredAt >= filters.from
    && occurredAt < filters.to;
}

function aggregateRoutingActivityByOperator(rows: RoutingActivityReportSourceRow[], selectedOperatorId?: string): {
  rows: Array<{
    assignments: number;
    operatorId: string;
    totalEvents: number;
    transferEvents: number;
    transfersFrom: number;
    transfersTo: number;
  }>;
  unattributedEvents: number;
} {
  const aggregates = new Map<string, {
    assignmentEventIds: Set<string>;
    transferEventIds: Set<string>;
    transfersFrom: number;
    transfersTo: number;
  }>();
  let unattributedEvents = 0;
  const forOperator = (operatorId: string) => {
    const existing = aggregates.get(operatorId);
    if (existing) return existing;
    const created = {
      assignmentEventIds: new Set<string>(),
      transferEventIds: new Set<string>(),
      transfersFrom: 0,
      transfersTo: 0
    };
    aggregates.set(operatorId, created);
    return created;
  };

  for (const row of rows) {
    if (row.eventKind === "assignment") {
      if (!row.toOperatorId || (selectedOperatorId && row.toOperatorId !== selectedOperatorId)) {
        unattributedEvents += 1;
        continue;
      }
      forOperator(row.toOperatorId).assignmentEventIds.add(row.id);
      continue;
    }

    const involvedOperators = new Set<string>();
    if (row.fromOperatorId && (!selectedOperatorId || row.fromOperatorId === selectedOperatorId)) {
      const aggregate = forOperator(row.fromOperatorId);
      aggregate.transfersFrom += 1;
      involvedOperators.add(row.fromOperatorId);
    }
    if (row.toOperatorId && (!selectedOperatorId || row.toOperatorId === selectedOperatorId)) {
      const aggregate = forOperator(row.toOperatorId);
      aggregate.transfersTo += 1;
      involvedOperators.add(row.toOperatorId);
    }
    if (involvedOperators.size === 0) {
      unattributedEvents += 1;
    }
    for (const operatorId of involvedOperators) {
      forOperator(operatorId).transferEventIds.add(row.id);
    }
  }

  return {
    rows: [...aggregates.entries()]
      .map(([operatorId, aggregate]) => ({
        assignments: aggregate.assignmentEventIds.size,
        operatorId,
        totalEvents: aggregate.assignmentEventIds.size + aggregate.transferEventIds.size,
        transferEvents: aggregate.transferEventIds.size,
        transfersFrom: aggregate.transfersFrom,
        transfersTo: aggregate.transfersTo
      }))
      .sort((left, right) => right.totalEvents - left.totalEvents || left.operatorId.localeCompare(right.operatorId)),
    unattributedEvents
  };
}

function currentConversationMetricRows(reportRows: unknown[]): Array<Record<string, unknown>> {
  const rows = reportRows as Array<Record<string, unknown>>;
  const [newConversations, closedConversations, firstResponse, slaMet] = rows;
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
