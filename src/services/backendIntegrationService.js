import { apiRequest } from "./apiClient.js";

const SERVICE = "backendIntegrationService";
const OPERATION = "fetchBackendIntegrationSnapshot";

export const backendIntegrationService = {
  async fetchBackendIntegrationSnapshot() {
    return apiRequest("/integrations/capabilities", {
      operation: OPERATION,
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [OPERATION],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};
