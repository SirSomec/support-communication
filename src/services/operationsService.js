import { apiRequest } from "./apiClient.js";

const SERVICE = "operationsService";

export const operationsService = {
  async fetchReadinessDashboard(filters = {}) {
    return apiRequest("/operations/readiness", {
      authMode: "service-admin",
      operation: "fetchReadinessDashboard",
      query: filters,
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchReadinessDashboard"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};
