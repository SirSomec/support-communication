import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "featureFlagService";

export const featureFlagService = {
  async fetchFeatureFlags(filters = {}) {
    return apiRequest("/feature-flags", {
      authMode: "service-admin",
      operation: "fetchFeatureFlags",
      query: filters,
      service: SERVICE
    });
  },

  async previewFlagChange({ flagId, ...payload } = {}) {
    if (!hasRouteId(flagId)) {
      return missingIdEnvelope("previewFlagChange", "Feature flag id is required.");
    }

    return apiRequest(`/feature-flags/${encodeURIComponent(flagId)}/preview`, {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "previewFlagChange",
      service: SERVICE
    });
  },

  async updateFeatureFlag({ flagId, ...payload } = {}) {
    if (!hasRouteId(flagId)) {
      return missingIdEnvelope("updateFeatureFlag", "Feature flag id is required.");
    }

    return apiRequest(`/feature-flags/${encodeURIComponent(flagId)}`, {
      authMode: "service-admin",
      body: payload,
      method: "PATCH",
      operation: "updateFeatureFlag",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchFeatureFlags", "previewFlagChange", "updateFeatureFlag"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "invalid", "partial"],
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
