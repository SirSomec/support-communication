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

  async loginTenantOperator(payload = {}) {
    return apiRequest("/auth/tenant/login", {
      body: payload,
      method: "POST",
      operation: "loginTenantOperator",
      service: SERVICE
    });
  },

  async getTenantAuthState() {
    return apiRequest("/auth/tenant/state", {
      operation: "getTenantAuthState",
      service: SERVICE
    });
  },

  async logoutTenant(payload = {}) {
    return apiRequest("/auth/tenant/logout", {
      body: payload,
      method: "POST",
      operation: "logoutTenant",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["getAuthState", "login", "logout", "loginTenantOperator", "getTenantAuthState", "logoutTenant"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
      note: "Connected to API Gateway auth routes."
    };
  }
};
