import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "platformMonitoringService";

export const platformMonitoringService = {
  async fetchPlatformSnapshot(filters = {}) {
    return apiRequest("/platform-monitoring/snapshot", {
      authMode: "service-admin",
      operation: "fetchPlatformSnapshot",
      query: filters,
      service: SERVICE
    });
  },

  async fetchComponentDrilldown(componentId) {
    if (!hasRouteId(componentId)) {
      return missingIdEnvelope("fetchComponentDrilldown", "Component id is required.");
    }

    return apiRequest(`/platform-monitoring/components/${encodeURIComponent(componentId)}`, {
      authMode: "service-admin",
      operation: "fetchComponentDrilldown",
      service: SERVICE
    });
  },

  async acknowledgeComponentAlert({ componentId, ...payload } = {}) {
    if (!hasRouteId(componentId)) {
      return missingIdEnvelope("acknowledgeComponentAlert", "Component id is required.");
    }

    return apiRequest(`/platform-monitoring/components/${encodeURIComponent(componentId)}/acknowledgements`, {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "acknowledgeComponentAlert",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchPlatformSnapshot", "fetchComponentDrilldown", "acknowledgeComponentAlert"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

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
