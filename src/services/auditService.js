import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "auditService";

export const auditService = {
  async fetchAuditEvents(filters = {}) {
    return apiRequest("/service-admin/audit-events", {
      authMode: "service-admin",
      operation: "fetchAuditEvents",
      query: filters,
      service: SERVICE
    });
  },

  async exportAuditEvents(payload = {}) {
    return apiRequest("/service-admin/audit-events/exports", {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "exportAuditEvents",
      service: SERVICE
    });
  },

  async redactAuditEvent(eventId, payload = {}) {
    if (!hasRouteId(eventId)) {
      return missingIdEnvelope("redactAuditEvent", "Audit event id is required.");
    }

    return apiRequest(`/service-admin/audit-events/${encodeURIComponent(eventId)}/redactions`, {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "redactAuditEvent",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchAuditEvents", "exportAuditEvents", "redactAuditEvent"],
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
