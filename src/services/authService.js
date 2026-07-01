import { apiRequest } from "./apiClient.js";

const SERVICE = "authService";

export const authService = {
  async getAuthState() {
    return apiRequest("/auth/state", {
      operation: "getAuthState",
      service: SERVICE
    });
  },

  async login(payload = {}) {
    return apiRequest("/auth/login", {
      body: payload,
      method: "POST",
      operation: "login",
      service: SERVICE
    });
  },

  async logout(payload = {}) {
    return apiRequest("/auth/logout", {
      body: payload,
      method: "POST",
      operation: "logout",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["getAuthState", "login", "logout"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
      note: "Connected to API Gateway auth routes."
    };
  }
};
