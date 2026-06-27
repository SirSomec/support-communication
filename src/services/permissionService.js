import { createEnvelope, makeAuditId } from "./mockBackend.js";

const SERVICE = "permissionService";

const permissionMatrix = {
  employee: new Set(["dialogs.read", "templates.read", "templates.write", "clients.read"]),
  senior: new Set([
    "dialogs.read",
    "dialogs.manage",
    "templates.read",
    "templates.write",
    "clients.read",
    "clients.merge",
    "reports.export",
    "settings.read",
    "employees.passwordReset",
    "outbound.start"
  ]),
  admin: new Set(["*"])
};

export const permissionService = {
  async validatePermission({ action, resource, roleMode }) {
    const role = normalizeRole(roleMode);
    const allowed = permissionMatrix[role]?.has("*") || permissionMatrix[role]?.has(action);
    const auditEvent = {
      id: makeAuditId("perm"),
      action,
      resource,
      role,
      result: allowed ? "allowed" : "denied",
      immutable: true
    };

    return createEnvelope({
      service: SERVICE,
      operation: "validatePermission",
      status: allowed ? "ok" : "denied",
      error: allowed ? null : { code: "permission_denied", message: `${role} cannot perform ${action}` },
      data: {
        allowed: Boolean(allowed),
        action,
        resource,
        role,
        serverValidated: true,
        groupIds: role === "admin" ? ["admins"] : role === "senior" ? ["senior-shifts"] : ["line-1"],
        auditEvent
      }
    });
  },

  async fetchPermissionModel() {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchPermissionModel",
      data: {
        roles: Object.keys(permissionMatrix),
        actions: Array.from(new Set(Object.values(permissionMatrix).flatMap((permissions) => Array.from(permissions)))),
        serverValidation: true,
        denialAudit: true,
        groups: ["line-1", "senior-shifts", "finance", "admins"]
      },
      partial: true
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["validatePermission", "fetchPermissionModel"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error"],
      note: "Permission checks return server validation and denial audit metadata."
    };
  }
};

function normalizeRole(roleMode) {
  const value = String(roleMode ?? "").toLowerCase();

  if (value.includes("admin") || value.includes("administrator") || value.includes("админ") || value.includes("рђрґ")) {
    return "admin";
  }

  if (value.includes("senior") || value.includes("lead") || value.includes("стар") || value.includes("рўс‚") || value.includes("рў")) {
    return "senior";
  }

  return "employee";
}
