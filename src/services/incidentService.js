import {
  serviceAdminIncidents,
  serviceAdminPlatformComponents,
  serviceAdminTenants
} from "../data/serviceAdmin.js";
import { createBackendErrorEnvelope, createEnvelope, createInvalidEnvelope, hasAuditReason, makeAuditId } from "./mockBackend.js";

const SERVICE = "incidentService";

export const incidentService = {
  async fetchIncidents(filters = {}) {
    const incidents = serviceAdminIncidents.filter((incident) => {
      const statusMatches = !filters.status || filters.status === "all" || incident.status === filters.status;
      const severityMatches = !filters.severity || filters.severity === "all" || incident.severity === filters.severity;
      const componentMatches = !filters.componentId || filters.componentId === "all" || incident.componentId === filters.componentId;

      return statusMatches && severityMatches && componentMatches;
    });

    return createEnvelope({
      service: SERVICE,
      operation: "fetchIncidents",
      data: {
        items: incidents,
        components: serviceAdminPlatformComponents.map(({ id, name, status }) => ({ id, name, status })),
        filters
      },
      partial: true,
      meta: { filters }
    });
  },

  async fetchIncidentDetail(incidentId) {
    const incident = serviceAdminIncidents.find((item) => item.id === incidentId);

    if (!incident) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "fetchIncidentDetail",
        code: "incident_not_found",
        message: `Incident ${incidentId} was not found.`
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "fetchIncidentDetail",
      data: {
        incident,
        component: serviceAdminPlatformComponents.find((component) => component.id === incident.componentId),
        affectedTenants: serviceAdminTenants.filter((tenant) => incident.affectedTenantIds.includes(tenant.id))
      }
    });
  },

  async addIncidentUpdate({ confirmed = false, incidentId, message, reason, status }) {
    const incident = serviceAdminIncidents.find((item) => item.id === incidentId);

    if (!incident) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "addIncidentUpdate",
        code: "incident_not_found",
        message: `Incident ${incidentId} was not found.`
      });
    }

    if (!hasAuditReason(reason)) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "addIncidentUpdate",
        code: "reason_required",
        message: "A service-admin reason of at least 8 characters is required.",
        data: { incidentId, reason }
      });
    }

    if (String(message ?? "").trim().length < 10) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "addIncidentUpdate",
        code: "message_required",
        message: "Incident updates require a customer-visible message of at least 10 characters.",
        data: { incidentId, message }
      });
    }

    if (!confirmed) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "addIncidentUpdate",
        code: "confirmation_required",
        message: "Explicit confirmation is required for incident timeline updates.",
        data: {
          confirmation: { required: true },
          incidentId,
          reason
        }
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "addIncidentUpdate",
      data: {
        incident: {
          ...incident,
          status: status || incident.status,
          updatedAt: new Date().toISOString(),
          updates: [
            { at: "now", author: "service-admin", text: message },
            ...incident.updates
          ]
        },
        reason,
        auditEvent: {
          id: makeAuditId("incident"),
          action: "incident.update",
          target: incident.id,
          reason,
          immutable: true
        }
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchIncidents", "fetchIncidentDetail", "addIncidentUpdate"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Incident adapter returns active incidents, drilldown and audited updates."
    };
  }
};
