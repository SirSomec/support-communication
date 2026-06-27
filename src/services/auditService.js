import { auditLogEvents, auditRetentionPolicies } from "../data.js";
import { createEnvelope } from "./mockBackend.js";

const SERVICE = "auditService";

export const auditService = {
  async fetchAuditEvents(filters = {}) {
    const source = filters.source;
    const events = source
      ? auditLogEvents.filter((event) => String(event.source).toLowerCase().includes(String(source).toLowerCase()))
      : auditLogEvents;

    return createEnvelope({
      service: SERVICE,
      operation: "fetchAuditEvents",
      data: {
        events,
        retentionPolicies: auditRetentionPolicies,
        serverSideFilters: true
      },
      partial: true,
      meta: { filters }
    });
  },

  async exportAuditEvents({ format = "CSV", source = "all" } = {}) {
    const extension = format.toLowerCase();
    const normalizedSource = String(source).toLowerCase().replace(/[^a-z0-9]+/g, "-") || "all";
    const immutableEventIds = auditLogEvents
      .filter((event) => normalizedSource === "all" || String(event.source).toLowerCase().includes(normalizedSource))
      .map((event) => event.eventId);

    return createEnvelope({
      service: SERVICE,
      operation: "exportAuditEvents",
      data: {
        fileName: `audit-${normalizedSource}.${extension}`,
        immutableEventIds: immutableEventIds.length ? immutableEventIds : auditLogEvents.map((event) => event.eventId),
        retention: auditRetentionPolicies,
        redactionState: "not_redacted"
      }
    });
  },

  async redactAuditEvent(eventId, { reason }) {
    return createEnvelope({
      service: SERVICE,
      operation: "redactAuditEvent",
      data: {
        eventId,
        reason,
        immutable: true,
        redactionId: `redact_${eventId}_${Date.now().toString(36)}`,
        scope: "sensitive_fields_only"
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchAuditEvents", "exportAuditEvents", "redactAuditEvent"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Audit events expose immutable ids, retention and redaction metadata."
    };
  }
};
