import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "reportService";

export const reportService = {
  async fetchReportWorkspace(filters = {}) {
    return apiRequest("/reports/workspace", {
      operation: "fetchReportWorkspace",
      query: filters,
      service: SERVICE
    });
  },

  async requestReportExport(payload = {}) {
    return apiRequest("/reports/exports", {
      body: payload,
      method: "POST",
      operation: "requestReportExport",
      service: SERVICE
    });
  },

  async retryReportExport(job = {}) {
    const jobId = getJobId(job);
    if (!hasRouteId(jobId)) {
      return missingIdEnvelope("retryReportExport", "Report export job id is required.");
    }

    return apiRequest(`/reports/exports/${encodeURIComponent(jobId)}/retry`, {
      body: { reason: job.reason },
      method: "POST",
      operation: "retryReportExport",
      service: SERVICE
    });
  },

  async getExportFileDescriptor(job = {}) {
    const jobId = getJobId(job);
    if (!hasRouteId(jobId)) {
      return missingIdEnvelope("getExportFileDescriptor", "Report export job id is required.");
    }

    return apiRequest(`/reports/exports/${encodeURIComponent(jobId)}/file`, {
      operation: "getExportFileDescriptor",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchReportWorkspace", "requestReportExport", "retryReportExport", "getExportFileDescriptor"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function getJobId(job) {
  return job.jobId ?? job.id;
}

function hasRouteId(value) {
  return String(value ?? "").trim().length > 0;
}

function missingIdEnvelope(operation, message) {
  return createApiErrorEnvelope({
    code: "missing_id",
    message,
    operation,
    service: SERVICE
  });
}
