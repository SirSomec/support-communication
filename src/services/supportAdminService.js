import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "supportAdminService";

export const supportAdminService = {
  async fetchSupportUsers(filters = {}) {
    return apiRequest("/service-admin/users", {
      authMode: "service-admin",
      operation: "fetchSupportUsers",
      query: filters,
      service: SERVICE
    });
  },

  async resetTwoFactor({ userId, ...payload } = {}) {
    return userActionRequest({
      operation: "resetTwoFactor",
      payload,
      route: "mfa/reset",
      userId
    });
  },

  async forceLogout({ userId, ...payload } = {}) {
    return userActionRequest({
      operation: "forceLogout",
      payload,
      route: "sessions/logout",
      userId
    });
  },

  async blockUser({ userId, ...payload } = {}) {
    return userActionRequest({
      operation: "blockUser",
      payload,
      route: "block",
      userId
    });
  },

  async resendInvite({ userId, ...payload } = {}) {
    return userActionRequest({
      operation: "resendInvite",
      payload,
      route: "invite/resend",
      userId
    });
  },

  async startImpersonation(payload = {}) {
    return apiRequest("/service-admin/impersonations", {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "startImpersonation",
      service: SERVICE
    });
  },

  async stopImpersonation({ impersonationId, ...payload } = {}) {
    if (!hasRouteId(impersonationId)) {
      return missingIdEnvelope("stopImpersonation", "Impersonation id is required.");
    }

    return apiRequest(`/service-admin/impersonations/${encodeURIComponent(impersonationId)}/stop`, {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "stopImpersonation",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [
        "fetchSupportUsers",
        "resetTwoFactor",
        "forceLogout",
        "blockUser",
        "resendInvite",
        "startImpersonation",
        "stopImpersonation"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "invalid"],
      note: "Connected to API Gateway routes."
    };
  }
};

function userActionRequest({ operation, payload, route, userId }) {
  if (!hasRouteId(userId)) {
    return missingIdEnvelope(operation, "User id is required.");
  }

  return apiRequest(`/service-admin/users/${encodeURIComponent(userId)}/${route}`, {
    authMode: "service-admin",
    body: payload,
    method: "POST",
    operation,
    service: SERVICE
  });
}

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
