import {
  exportJobs,
  reportBars,
  reportChartBlocks,
  reportColumnOptions,
  reportRows,
  rescueOutcomeSummary,
  rescueReportRows
} from "../data.js";
import { createEnvelope, makeAuditId, makeQueueId, slugify } from "./mockBackend.js";

const SERVICE = "reportService";
const METRIC_DEFINITION_VERSION = "metrics/v1";

export const reportService = {
  async fetchReportWorkspace(filters = {}) {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchReportWorkspace",
      data: {
        rows: reportRows,
        bars: reportBars,
        chartBlocks: reportChartBlocks,
        columnOptions: reportColumnOptions,
        rescueOutcomeSummary,
        rescueReportRows,
        exportJobs,
        metricDefinitionVersion: METRIC_DEFINITION_VERSION
      },
      partial: true,
      meta: { filters }
    });
  },

  async requestReportExport({ channel, columns = [], filters = {}, period, reportType }) {
    const format = "XLSX";
    const job = {
      id: `export-${Date.now().toString(36)}`,
      name: `${reportType}: ${channel}`,
      format,
      period,
      statusKey: "queued",
      status: "Queued",
      progress: 8,
      requestedBy: "Current operator",
      createdAt: "now",
      rows: 0,
      columns,
      filters,
      backendQueueId: makeQueueId("report"),
      auditId: makeAuditId("report"),
      metricDefinitionVersion: METRIC_DEFINITION_VERSION
    };

    return createEnvelope({
      service: SERVICE,
      operation: "requestReportExport",
      data: { job }
    });
  },

  async retryReportExport(job) {
    return createEnvelope({
      service: SERVICE,
      operation: "retryReportExport",
      data: {
        job: {
          ...job,
          statusKey: "running",
          status: "Retry running",
          progress: 28,
          rows: job.rows || 486,
          backendQueueId: makeQueueId("report"),
          auditId: job.auditId ?? makeAuditId("report"),
          metricDefinitionVersion: job.metricDefinitionVersion ?? METRIC_DEFINITION_VERSION
        }
      }
    });
  },

  async getExportFileDescriptor(job) {
    const format = (job.format ?? "XLSX").toLowerCase();

    return createEnvelope({
      service: SERVICE,
      operation: "getExportFileDescriptor",
      data: {
        jobId: job.id,
        fileName: `${slugify(job.name)}.${format}`,
        downloadUrl: `mock://exports/${job.id}/${slugify(job.name)}.${format}`,
        expiresIn: "24h",
        auditId: job.auditId ?? makeAuditId("report")
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchReportWorkspace", "requestReportExport", "retryReportExport", "getExportFileDescriptor"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Exports now expose queue ids, file descriptors and metric definition version."
    };
  }
};
