import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "auditService";

export const auditService = {
  async fetchAuditEvents(filters = {}) {
    return apiRequest("/service-admin/audit-events", {
      operation: "fetchAuditEvents",
      query: filters,
      service: SERVICE
    });
  },

  async exportAuditEvents() {
    return missingRouteEnvelope(
      "exportAuditEvents",
      "API Gateway does not expose an audit export route yet."
    );
  },

  async redactAuditEvent() {
    return missingRouteEnvelope(
      "redactAuditEvent",
      "API Gateway does not expose an audit event redaction route yet."
    );
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "partial",
      operations: ["fetchAuditEvents", "exportAuditEvents", "redactAuditEvent"],
      traceId: `trc_${SERVICE}_partial`,
      states: ["loading", "empty", "error", "partial"],
      note: "fetchAuditEvents is connected to API Gateway; audit export and redaction routes are not exposed yet.",
      backlog: ["audit_export_route", "audit_redaction_route"],
      meta: {
        source: "api-gateway",
        routeGaps: [
          "POST /service-admin/audit-events/exports",
          "POST /service-admin/audit-events/:eventId/redactions"
        ]
      }
    };
  }
};

function missingRouteEnvelope(operation, message) {
  return createApiErrorEnvelope({
    code: "api_route_missing",
    message,
    operation,
    service: SERVICE
  });
}
