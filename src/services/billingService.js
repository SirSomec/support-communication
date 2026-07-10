import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "billingService";

export const billingService = {
  async fetchTariffs() {
    return apiRequest("/billing/tariffs", {
      authMode: "service-admin",
      operation: "fetchTariffs",
      service: SERVICE
    });
  },

  async previewTariffChange({ tenantId, ...payload } = {}) {
    if (!hasRouteId(tenantId)) {
      return missingIdEnvelope("previewTariffChange", "Tenant id is required.");
    }

    return apiRequest(`/billing/tenants/${encodeURIComponent(tenantId)}/tariff-change/preview`, {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "previewTariffChange",
      service: SERVICE
    });
  },

  async changeTenantTariff({ tenantId, ...payload } = {}) {
    if (!hasRouteId(tenantId)) {
      return missingIdEnvelope("changeTenantTariff", "Tenant id is required.");
    }

    return apiRequest(`/billing/tenants/${encodeURIComponent(tenantId)}/tariff-change`, {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "changeTenantTariff",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchTariffs", "previewTariffChange", "changeTenantTariff"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "invalid"],
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
