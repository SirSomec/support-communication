import { apiRequest } from "./apiClient.js";

const SERVICE = "shiftService";

/** Current support-shift roster, shared by everyone in the tenant. */
export const shiftService = {
  async fetchCurrent(options = {}) {
    return apiRequest("/shifts/current", {
      operation: "fetchCurrentShift",
      signal: options.signal,
      service: SERVICE
    });
  },

  async saveCurrent(payload = {}) {
    return apiRequest("/shifts/current", {
      body: {
        endsAt: String(payload.endsAt ?? "").trim(),
        name: String(payload.name ?? "").trim(),
        operatorIds: Array.isArray(payload.operatorIds) ? payload.operatorIds.filter(Boolean) : [],
        startsAt: String(payload.startsAt ?? "").trim()
      },
      method: "PUT",
      operation: "saveCurrentShift",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      note: "Current support-shift roster is persisted by the API Gateway.",
      operations: ["fetchCurrentShift", "saveCurrentShift"],
      states: ["loading", "empty", "error", "partial"],
      status: "ready",
      traceId: `trc_${SERVICE}_ready`
    };
  }
};
