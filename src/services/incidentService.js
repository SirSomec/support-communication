import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "incidentService";

export const incidentService = {
  async fetchIncidents(filters = {}) {
    return apiRequest("/incidents", {
      operation: "fetchIncidents",
      query: filters,
      service: SERVICE
    });
  },

  async fetchIncidentDetail(incidentId) {
    if (!hasRouteId(incidentId)) {
      return missingIdEnvelope("fetchIncidentDetail", "Incident id is required.");
    }

    return apiRequest(`/incidents/${encodeURIComponent(incidentId)}`, {
      operation: "fetchIncidentDetail",
      service: SERVICE
    });
  },

  async addIncidentUpdate({ incidentId, ...payload } = {}) {
    if (!hasRouteId(incidentId)) {
      return missingIdEnvelope("addIncidentUpdate", "Incident id is required.");
    }

    return apiRequest(`/incidents/${encodeURIComponent(incidentId)}/updates`, {
      body: payload,
      method: "POST",
      operation: "addIncidentUpdate",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchIncidents", "fetchIncidentDetail", "addIncidentUpdate"],
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
