import { apiRequest } from "./apiClient.js";

const SERVICE = "permissionService";

export const permissionService = {
  async validatePermission(payload = {}) {
    return apiRequest("/permissions/validate", {
      body: payload,
      method: "POST",
      operation: "validatePermission",
      service: SERVICE
    });
  },

  async fetchPermissionModel() {
    return apiRequest("/permissions/model", {
      operation: "fetchPermissionModel",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["validatePermission", "fetchPermissionModel"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error"],
      note: "Connected to API Gateway routes."
    };
  }
};
