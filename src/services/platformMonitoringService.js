import {
  serviceAdminIncidents,
  serviceAdminPlatformComponents,
  serviceAdminTenants
} from "../data/serviceAdmin.js";
import { createBackendErrorEnvelope, createEnvelope, createInvalidEnvelope, hasAuditReason, makeAuditId } from "./mockBackend.js";

const SERVICE = "platformMonitoringService";

export const platformMonitoringService = {
  async fetchPlatformSnapshot(filters = {}) {
    const components = serviceAdminPlatformComponents.filter((component) => {
      const statusMatches = !filters.status || filters.status === "all" || component.status === filters.status;
      const regionMatches = !filters.region || filters.region === "all" || component.region === filters.region || component.region === "global";

      return statusMatches && regionMatches;
    });

    return createEnvelope({
      service: SERVICE,
      operation: "fetchPlatformSnapshot",
      data: {
        components,
        incidents: serviceAdminIncidents,
        summary: {
          degraded: serviceAdminPlatformComponents.filter((component) => component.status !== "operational").length,
          affectedTenants: new Set(serviceAdminIncidents.flatMap((incident) => incident.affectedTenantIds)).size,
          globalUptime: 99.61,
          openIncidents: serviceAdminIncidents.filter((incident) => incident.status !== "resolved").length
        }
      },
      partial: true,
      meta: { filters }
    });
  },

  async fetchComponentDrilldown(componentId) {
    const component = serviceAdminPlatformComponents.find((item) => item.id === componentId);

    if (!component) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "fetchComponentDrilldown",
        code: "component_not_found",
        message: `Component ${componentId} was not found.`
      });
    }

    const incidents = serviceAdminIncidents.filter((incident) => incident.componentId === component.id);
    const affectedTenants = serviceAdminTenants.filter((tenant) => (
      incidents.some((incident) => incident.affectedTenantIds.includes(tenant.id))
    ));

    return createEnvelope({
      service: SERVICE,
      operation: "fetchComponentDrilldown",
      data: {
        component,
        incidents,
        affectedTenants,
        runbooks: [
          `${component.ownerTeam} on-call escalation`,
          "Customer status note review",
          "Audit stream integrity check"
        ]
      }
    });
  },

  async acknowledgeComponentAlert({ componentId, confirmed = false, reason }) {
    if (!hasAuditReason(reason)) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "acknowledgeComponentAlert",
        code: "reason_required",
        message: "A service-admin reason of at least 8 characters is required.",
        data: { componentId, reason }
      });
    }

    if (!confirmed) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "acknowledgeComponentAlert",
        code: "confirmation_required",
        message: "Explicit confirmation is required to acknowledge platform alerts.",
        data: {
          componentId,
          confirmation: { required: true },
          reason
        }
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "acknowledgeComponentAlert",
      data: {
        componentId,
        reason,
        acknowledgedAt: new Date().toISOString(),
        auditEvent: {
          id: makeAuditId("platform_component"),
          action: "platform.alert.acknowledge",
          target: componentId,
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
      operations: ["fetchPlatformSnapshot", "fetchComponentDrilldown", "acknowledgeComponentAlert"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Platform monitoring exposes health snapshot and component drilldown for service-admin views."
    };
  }
};
