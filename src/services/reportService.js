import { getTenantAccessToken } from "../app/sessionStore.js";
import { apiRequest, buildApiUrl, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "reportService";

export const reportService = {
  async fetchReportWorkspace(filters = {}) {
    return apiRequest("/reports/workspace", {
      operation: "fetchReportWorkspace",
      query: filters,
      service: SERVICE
    });
  },

  async fetchRoutingActivityReport(filters = {}) {
    return apiRequest("/reports/routing-activity", {
      operation: "fetchRoutingActivityReport",
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

  async downloadExportFile(job = {}) {
    const jobId = getJobId(job);
    if (!hasRouteId(jobId)) {
      return missingIdEnvelope("downloadExportFile", "Report export job id is required.");
    }

    const headers = {};
    const token = getTenantAccessToken();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(buildApiUrl(`/reports/exports/${encodeURIComponent(jobId)}/download`), {
        headers,
        method: "GET"
      });

      if (!response.ok) {
        return createApiErrorEnvelope({
          code: `http_${response.status}`,
          message: response.statusText || "Report export download failed.",
          operation: "downloadExportFile",
          service: SERVICE
        });
      }

      const blob = await response.blob();
      return {
        service: SERVICE,
        operation: "downloadExportFile",
        status: "ok",
        partial: false,
        traceId: `trc_${SERVICE}_downloadExportFile_api`,
        updatedAt: new Date().toISOString(),
        data: {
          blob,
          contentType: response.headers.get("content-type") || blob.type || "application/octet-stream",
          fileName: fileNameFromContentDisposition(response.headers.get("content-disposition")) || job.fileName || `${jobId}.xlsx`,
          sizeBytes: Number(response.headers.get("content-length") || blob.size || 0)
        },
        error: null,
        states: {
          loading: false,
          empty: false,
          error: false,
          partial: false
        },
        meta: {
          source: "api-gateway"
        }
      };
    } catch (error) {
      return createApiErrorEnvelope({
        code: "network_error",
        message: error instanceof Error ? error.message : "Report export download failed.",
        operation: "downloadExportFile",
        service: SERVICE
      });
    }
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchReportWorkspace", "fetchRoutingActivityReport", "requestReportExport", "retryReportExport", "getExportFileDescriptor", "downloadExportFile"],
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

function fileNameFromContentDisposition(value) {
  const disposition = String(value ?? "");
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
  }

  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1]?.trim() || "";
}
