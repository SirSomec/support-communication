import {
  serviceAdminAuditEvents,
  serviceAdminFeatureFlags,
  serviceAdminIncidents,
  serviceAdminTariffs,
  serviceAdminTenants,
  serviceAdminUsers
} from "../data/serviceAdmin.js";
import { createBackendErrorEnvelope, createEnvelope, createInvalidEnvelope, hasAuditReason, makeAuditId } from "./mockBackend.js";

const SERVICE = "tenantService";

export const tenantService = {
  async fetchTenants(filters = {}) {
    const tenants = serviceAdminTenants.filter((tenant) => {
      const statusMatches = !filters.status || filters.status === "all" || tenant.status === filters.status;
      const regionMatches = !filters.region || filters.region === "all" || tenant.region === filters.region;
      const query = String(filters.query ?? "").trim().toLowerCase();
      const queryMatches = !query || [tenant.name, tenant.legalName, tenant.owner, tenant.ownerEmail]
        .some((value) => String(value).toLowerCase().includes(query));

      return statusMatches && regionMatches && queryMatches;
    });

    return createEnvelope({
      service: SERVICE,
      operation: "fetchTenants",
      data: {
        items: tenants,
        filters,
        totals: {
          all: serviceAdminTenants.length,
          active: serviceAdminTenants.filter((tenant) => tenant.status === "active").length,
          watch: serviceAdminTenants.filter((tenant) => tenant.status === "watch").length,
          restricted: serviceAdminTenants.filter((tenant) => tenant.status === "restricted").length
        }
      },
      partial: true,
      meta: { filters }
    });
  },

  async fetchTenantDetail(tenantId) {
    const tenant = findTenant(tenantId);

    if (!tenant) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "fetchTenantDetail",
        code: "tenant_not_found",
        message: `Tenant ${tenantId} was not found.`
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "fetchTenantDetail",
      data: buildTenantDetail(tenant)
    });
  },

  async updateTenantStatus({ confirmed = false, reason, status, tenantId }) {
    const tenant = findTenant(tenantId);

    if (!tenant) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "updateTenantStatus",
        code: "tenant_not_found",
        message: `Tenant ${tenantId} was not found.`
      });
    }

    if (!hasAuditReason(reason)) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "updateTenantStatus",
        code: "reason_required",
        message: "A service-admin reason of at least 8 characters is required.",
        data: { reason, status, tenantId }
      });
    }

    if (!confirmed) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "updateTenantStatus",
        code: "confirmation_required",
        message: "Explicit confirmation is required for tenant status changes.",
        data: {
          confirmation: { required: true },
          reason,
          status,
          tenantId
        }
      });
    }

    const auditEvent = {
      id: makeAuditId("tenant_status"),
      action: "tenant.status.change",
      target: tenant.id,
      reason,
      from: tenant.status,
      to: status,
      immutable: true
    };

    return createEnvelope({
      service: SERVICE,
      operation: "updateTenantStatus",
      data: {
        tenant: { ...tenant, status },
        auditEvent,
        confirmationRequired: true
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchTenants", "fetchTenantDetail", "updateTenantStatus"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Tenant list and detail adapters include users, billing, incidents, flags and audit context."
    };
  }
};

function buildTenantDetail(tenant) {
  return {
    tenant,
    users: serviceAdminUsers.filter((user) => user.tenantId === tenant.id),
    tariff: serviceAdminTariffs.find((tariff) => tariff.id === tenant.planId),
    incidents: serviceAdminIncidents.filter((incident) => incident.affectedTenantIds.includes(tenant.id)),
    flags: serviceAdminFeatureFlags.filter((flag) => flag.enabledTenantIds.includes(tenant.id)),
    auditEvents: serviceAdminAuditEvents.filter((event) => event.tenantId === tenant.id)
  };
}

function findTenant(tenantId) {
  return serviceAdminTenants.find((tenant) => tenant.id === tenantId);
}
