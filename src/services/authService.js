import { serviceAdminSession } from "../data/serviceAdmin.js";
import { addMinutes, createEnvelope, makeAuditId } from "./mockBackend.js";

const SERVICE = "authService";

export const authService = {
  async getAuthState() {
    return createEnvelope({
      service: SERVICE,
      operation: "getAuthState",
      data: {
        authenticated: true,
        session: serviceAdminSession,
        states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
        impersonating: false
      }
    });
  },

  async login({ email, otp, password } = {}) {
    const hasPassword = Boolean(password);
    const hasOtp = Boolean(otp);

    if (!hasPassword) {
      return createEnvelope({
        service: SERVICE,
        operation: "login",
        status: "invalid",
        data: {
          authenticated: false,
          authState: "anonymous",
          nextStep: "password"
        },
        error: { code: "password_required", message: "Password is required for mock login." }
      });
    }

    if (!hasOtp) {
      return createEnvelope({
        service: SERVICE,
        operation: "login",
        partial: true,
        data: {
          authenticated: false,
          authState: "mfa_required",
          email,
          mfaChallengeId: `mfa_${Date.now().toString(36)}`,
          nextStep: "otp"
        }
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "login",
      data: {
        authenticated: true,
        authState: "mfa_verified",
        session: {
          ...serviceAdminSession,
          adminEmail: email ?? "service-admin@example.com",
          mfaVerifiedAt: new Date().toISOString(),
          expiresAt: addMinutes(new Date(), 240).toISOString()
        },
        auditEvent: {
          id: makeAuditId("auth"),
          action: "service_admin.login",
          immutable: true,
          result: "ok"
        }
      }
    });
  },

  async logout({ reason = "Service admin signed out" } = {}) {
    return createEnvelope({
      service: SERVICE,
      operation: "logout",
      data: {
        authenticated: false,
        authState: "anonymous",
        reason,
        auditEvent: {
          id: makeAuditId("auth_logout"),
          action: "service_admin.logout",
          immutable: true,
          reason
        }
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["getAuthState", "login", "logout"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["anonymous", "password_verified", "mfa_required", "mfa_verified"],
      note: "Mock service-admin auth states use the shared backend envelope."
    };
  }
};
