import { serviceAdminTenants, serviceAdminUsers } from "../data/serviceAdmin.js";
import { addMinutes, createBackendErrorEnvelope, createEnvelope, createInvalidEnvelope, hasAuditReason, makeAuditId } from "./mockBackend.js";

const SERVICE = "supportAdminService";

export const supportAdminService = {
  async fetchSupportUsers(filters = {}) {
    const users = serviceAdminUsers.filter((user) => {
      const tenantMatches = !filters.tenantId || filters.tenantId === "all" || user.tenantId === filters.tenantId;
      const statusMatches = !filters.status || filters.status === "all" || user.status === filters.status;
      const query = String(filters.query ?? "").trim().toLowerCase();
      const queryMatches = !query || [user.name, user.email, user.role]
        .some((value) => String(value).toLowerCase().includes(query));

      return tenantMatches && statusMatches && queryMatches;
    });

    return createEnvelope({
      service: SERVICE,
      operation: "fetchSupportUsers",
      data: {
        items: users,
        tenants: serviceAdminTenants.map(({ id, name }) => ({ id, name })),
        filters
      },
      partial: true,
      meta: { filters }
    });
  },

  async resetTwoFactor({ confirmed = false, reason, userId }) {
    return buildUserActionEnvelope({
      action: "user.mfa.reset",
      confirmed,
      operation: "resetTwoFactor",
      reason,
      statusPatch: { mfa: "reset_pending" },
      userId
    });
  },

  async forceLogout({ confirmed = false, reason, userId }) {
    return buildUserActionEnvelope({
      action: "user.sessions.logout",
      confirmed,
      operation: "forceLogout",
      reason,
      statusPatch: { sessions: 0 },
      userId
    });
  },

  async blockUser({ confirmed = false, reason, userId }) {
    return buildUserActionEnvelope({
      action: "user.block",
      confirmed,
      operation: "blockUser",
      reason,
      statusPatch: { status: "blocked", sessions: 0 },
      userId
    });
  },

  async resendInvite({ confirmed = false, reason, userId }) {
    return buildUserActionEnvelope({
      action: "user.invite.resend",
      confirmed,
      operation: "resendInvite",
      reason,
      statusPatch: { inviteStatus: "sent" },
      userId
    });
  },

  async startImpersonation({ confirmed = false, durationMinutes = 15, reason, tenantId, userId }) {
    const validation = validatePrivilegedAction({
      action: "impersonation.start",
      confirmed,
      operation: "startImpersonation",
      reason,
      target: tenantId
    });

    if (validation) {
      return validation;
    }

    const tenant = serviceAdminTenants.find((item) => item.id === tenantId);
    const user = userId ? serviceAdminUsers.find((item) => item.id === userId) : null;

    if (!tenant) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "startImpersonation",
        code: "tenant_not_found",
        message: `Tenant ${tenantId} was not found.`
      });
    }

    const startedAt = new Date();
    const expiresAt = addMinutes(startedAt, durationMinutes);

    return createEnvelope({
      service: SERVICE,
      operation: "startImpersonation",
      data: {
        impersonation: {
          id: `imp_${tenant.id}_${Date.now().toString(36)}`,
          tenantId: tenant.id,
          tenantName: tenant.name,
          userId: user?.id ?? null,
          userName: user?.name ?? "Tenant workspace",
          mode: "read_only_by_default",
          startedAt: startedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          durationMinutes,
          banner: `Impersonating ${tenant.name}. Reason: ${reason}`
        },
        auditEvent: {
          id: makeAuditId("impersonation"),
          action: "impersonation.start",
          target: tenant.id,
          reason,
          immutable: true
        }
      }
    });
  },

  async stopImpersonation({ impersonationId, reason = "Exited by service admin" }) {
    if (!hasAuditReason(reason)) {
      return createInvalidEnvelope({
        service: SERVICE,
        operation: "stopImpersonation",
        code: "reason_required",
        message: "A service-admin reason of at least 8 characters is required.",
        data: { impersonationId, reason }
      });
    }

    return createEnvelope({
      service: SERVICE,
      operation: "stopImpersonation",
      data: {
        impersonationId,
        stoppedAt: new Date().toISOString(),
        reason,
        auditEvent: {
          id: makeAuditId("impersonation_exit"),
          action: "impersonation.stop",
          target: impersonationId,
          reason,
          immutable: true
        }
      }
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
      note: "Support admin adapter covers account actions and safe impersonation lifecycle."
    };
  }
};

function buildUserActionEnvelope({ action, confirmed, operation, reason, statusPatch, userId }) {
  const validation = validatePrivilegedAction({
    action,
    confirmed,
    operation,
    reason,
    target: userId
  });

  if (validation) {
    return validation;
  }

  const user = serviceAdminUsers.find((item) => item.id === userId);

  if (!user) {
    return createBackendErrorEnvelope({
      service: SERVICE,
      operation,
      code: "user_not_found",
      message: `User ${userId} was not found.`
    });
  }

  return createEnvelope({
    service: SERVICE,
    operation,
    data: {
      user: { ...user, ...statusPatch },
      reason,
      confirmationRequired: ["user.block", "user.mfa.reset"].includes(action),
      auditEvent: {
        id: makeAuditId("support_user"),
        action,
        target: user.id,
        tenantId: user.tenantId,
        reason,
        immutable: true
      }
    }
  });
}

function validatePrivilegedAction({ action, confirmed, operation, reason, target }) {
  if (!hasAuditReason(reason)) {
    return createInvalidEnvelope({
      service: SERVICE,
      operation,
      code: "reason_required",
      message: "A service-admin reason of at least 8 characters is required.",
      data: { action, target, reason }
    });
  }

  if (!confirmed) {
    return createInvalidEnvelope({
      service: SERVICE,
      operation,
      code: "confirmation_required",
      message: "Explicit confirmation is required for this service-admin action.",
      data: {
        action,
        confirmation: { required: true },
        reason,
        target
      }
    });
  }

  return null;
}
