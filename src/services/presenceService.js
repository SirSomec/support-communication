import { apiRequest } from "./apiClient.js";

const SERVICE = "presenceService";

export const presenceService = {
  async fetchMyPresence() {
    return apiRequest("/presence/me", {
      operation: "fetchMyPresence",
      service: SERVICE
    });
  },

  async setMyPresence(status) {
    return apiRequest("/presence/me", {
      body: { status },
      method: "PUT",
      operation: "setMyPresence",
      service: SERVICE
    });
  },

  async markMyPresenceUnavailableIfOnline({ keepalive = false } = {}) {
    return apiRequest("/presence/me/disconnect", {
      keepalive,
      method: "POST",
      operation: "markMyPresenceUnavailableIfOnline",
      service: SERVICE
    });
  },

  async fetchTeamPresence(filters = {}) {
    return apiRequest("/presence/team", {
      operation: "fetchTeamPresence",
      query: filters,
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchMyPresence", "setMyPresence", "markMyPresenceUnavailableIfOnline", "fetchTeamPresence"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};
