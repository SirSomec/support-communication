import { apiRequest } from "./apiClient.js";
import { setServiceAdminSession, setTenantSession } from "../app/sessionStore.js";

const SERVICE = "authService";

const AUTH_ERROR_MODES = {
  invite_expired: "expired",
  multi_tenant_membership: "organizationSelect",
  tenant_blocked: "blocked",
  tenant_maintenance: "maintenance",
  tenant_operator_blocked: "blocked",
  tenant_operator_mfa_required: "twoFactor"
};

export function mapAuthErrorToMode(errorCode) {
  return AUTH_ERROR_MODES[errorCode] ?? null;
}

export const authService = {
  async getAuthState() {
    return apiRequest("/auth/state", {
      authMode: "service-admin",
      operation: "getAuthState",
      service: SERVICE
    });
  },

  async login(payload = {}) {
    const response = await apiRequest("/auth/login", {
      authMode: "public",
      body: payload,
      method: "POST",
      operation: "login",
      service: SERVICE
    });

    if (response.status === "ok" && response.data?.accessToken) {
      setServiceAdminSession({ accessToken: response.data.accessToken });
    }

    return response;
  },

  async logout(payload = {}) {
    return apiRequest("/auth/logout", {
      authMode: "service-admin",
      body: payload,
      method: "POST",
      operation: "logout",
      service: SERVICE
    });
  },

  async loginTenantOperator(payload = {}) {
    return apiRequest("/auth/tenant/login", {
      authMode: "public",
      body: payload,
      method: "POST",
      operation: "loginTenantOperator",
      service: SERVICE
    });
  },

  async getTenantOperatorState() {
    return apiRequest("/auth/tenant/state", {
      operation: "getTenantOperatorState",
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

  async startOidcLogin(payload = {}) {
    return apiRequest("/auth/oidc/start", {
      authMode: "public",
      body: payload,
      method: "POST",
      operation: "startOidcLogin",
      service: SERVICE
    });
  },

  async completeOidcCallback(query = {}) {
    return apiRequest("/auth/oidc/callback", {
      authMode: "public",
      operation: "completeOidcCallback",
      query,
      service: SERVICE
    });
  },

  async completeSamlAcs(payload = {}) {
    return apiRequest("/auth/saml/acs", {
      authMode: "public",
      body: payload,
      method: "POST",
      operation: "completeSamlAcs",
      service: SERVICE
    });
  },

  async acceptInvite(payload = {}) {
    return apiRequest("/auth/invites/accept", {
      authMode: "public",
      body: payload,
      method: "POST",
      operation: "acceptInvite",
      service: SERVICE
    });
  },

  async requestRecovery(payload = {}) {
    return apiRequest("/auth/recovery/request", {
      authMode: "public",
      body: payload,
      method: "POST",
      operation: "requestRecovery",
      service: SERVICE
    });
  },

  async completeRecovery(payload = {}) {
    return apiRequest("/auth/recovery/complete", {
      authMode: "public",
      body: payload,
      method: "POST",
      operation: "completeRecovery",
      service: SERVICE
    });
  },

  async selectTenant(payload = {}) {
    return apiRequest("/auth/tenant/select", {
      authMode: "public",
      body: payload,
      method: "POST",
      operation: "selectTenant",
      service: SERVICE
    });
  },

  persistTenantLogin(response) {
    if (response.status !== "ok" || !response.data?.accessToken) {
      return false;
    }

    setTenantSession({
      accessToken: response.data.accessToken,
      tenantId: response.data.tenantId,
      operator: response.data.operator
    });
    return true;
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [
        "getAuthState",
        "login",
        "logout",
        "loginTenantOperator",
        "getTenantOperatorState",
        "logoutTenant",
        "startOidcLogin",
        "completeOidcCallback",
        "completeSamlAcs",
        "acceptInvite",
        "requestRecovery",
        "completeRecovery",
        "selectTenant"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
      note: "Connected to API Gateway auth routes."
    };
  }
};
