import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "tenantService";

export const tenantService = {
  async fetchTenants(filters = {}) {
    return apiRequest("/tenants", {
      operation: "fetchTenants",
      query: filters,
      service: SERVICE
    });
  },

  async fetchTenantDetail(tenantId) {
    if (!hasRouteId(tenantId)) {
      return missingIdEnvelope("fetchTenantDetail", "Tenant id is required.");
    }

    return apiRequest(`/tenants/${encodeURIComponent(tenantId)}`, {
      operation: "fetchTenantDetail",
      service: SERVICE
    });
  },

  async updateTenantStatus({ tenantId, ...payload } = {}) {
    if (!hasRouteId(tenantId)) {
      return missingIdEnvelope("updateTenantStatus", "Tenant id is required.");
    }

    return apiRequest(`/tenants/${encodeURIComponent(tenantId)}/status`, {
      body: payload,
      method: "PATCH",
      operation: "updateTenantStatus",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchTenants", "fetchTenantDetail", "updateTenantStatus"],
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
