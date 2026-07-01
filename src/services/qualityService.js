import { apiRequest } from "./apiClient.js";

const SERVICE = "qualityService";

export const qualityService = {
  async fetchQualityWorkspace() {
    return apiRequest("/quality/workspace", {
      operation: "fetchQualityWorkspace",
      service: SERVICE
    });
  },

  async scoreDraftResponse(payload = {}) {
    return apiRequest("/quality/draft-score", {
      body: payload,
      method: "POST",
      operation: "scoreDraftResponse",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchQualityWorkspace", "scoreDraftResponse"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};
