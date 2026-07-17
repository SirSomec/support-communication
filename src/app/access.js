import { navigationItems } from "./navigationModel.js";

export const serviceAdminRole = "Администратор сервиса";
export const roleModes = ["Сотрудник", "Старший сотрудник", "Администратор"];

export const ACTION_TO_SECTION = {
  "dialogs.read": "dialogs",
  "dialogs.manage": "dialogs",
  "panel.read": "panel",
  "presence.read": "panel",
  "routing.read": "panel",
  "clients.read": "clients",
  "clients.merge": "clients",
  "templates.read": "templates",
  "templates.write": "templates",
  "visitors.read": "visitors",
  "automation.proactive.read": "visitors",
  "reports.read": "reports",
  "reports.export": "reports",
  "quality.read": "quality",
  "knowledge.read": "knowledge",
  "knowledge.write": "knowledge",
  "automation.read": "automation",
  "audit.read": "audit",
  "settings.read": "settings",
  "settings.write": "settings",
  "settings.manage": "settings",
  "settings.integrations.read": "settings",
  "settings.integrations.write": "settings",
  "settings.integrations.manage": "settings"
};

const ROLE_MODE_TO_KEY = {
  "Сотрудник": "employee",
  "Старший сотрудник": "senior",
  "Администратор": "admin"
};

export const serviceAdminAccessProfile = {
  sections: [],
  canOutbound: false,
  canManageDialogs: false,
  canViewSensitive: false,
  canManageSettings: true,
  canResetPasswords: false,
  canExportReports: true,
  canRedistribute: false,
  canServiceAdmin: true,
  reason: "Внутренний доступ администратора сервиса отделен от ролей организации"
};

export function resolveRoleActions(roleMode, permissionModel) {
  const roleKey = ROLE_MODE_TO_KEY[roleMode];
  const roles = permissionModel?.roles ?? [];
  const matched = roles.find((role) => role.key === roleKey);
  return matched?.actions ?? [];
}

export function resolveRolePermissions(roleMode, permissionModel) {
  const actions = resolveRoleActions(roleMode, permissionModel);
  return actions.length ? actions : fallbackActionsForRoleMode(roleMode);
}

export function constrainPermissionsForRoleMode(sessionPermissions = [], roleMode, permissionModel = null) {
  const normalizedSession = normalizePermissions(sessionPermissions);
  const rolePermissions = resolveRolePermissions(roleMode, permissionModel);

  if (normalizedSession.includes("*")) {
    return rolePermissions;
  }

  if (rolePermissions.includes("*")) {
    return normalizedSession;
  }

  return rolePermissions.filter((permission) => normalizedSession.includes(permission));
}

export function buildAccessProfile(permissions = [], permissionModel = null) {
  const normalized = normalizePermissions(permissions);
  const hasWildcard = normalized.includes("*");
  const sections = hasWildcard
    ? navigationItems.map((item) => item.key)
    : [...new Set(
      normalized
        .map((action) => ACTION_TO_SECTION[action])
        .filter(Boolean)
    )];

  if (!sections.includes("dialogs") && (hasWildcard || normalized.some((action) => action.startsWith("dialogs.")))) {
    sections.unshift("dialogs");
  }

  const canManageSettings = hasWildcard || normalized.some((action) =>
    ["settings.write", "settings.manage", "settings.integrations.write", "settings.integrations.manage"].includes(action)
  );
  const canExportReports = hasWildcard || normalized.includes("reports.export");
  const canRedistribute = hasWildcard || normalized.includes("routing.redistribute") || normalized.includes("panel.write");
  const canOutbound = hasWildcard || normalized.includes("outbound.start");
  const canManageDialogs = hasWildcard || normalized.includes("dialogs.manage");
  const canViewSensitive = hasWildcard || normalized.includes("clients.merge") || canManageDialogs;
  const canResetPasswords = hasWildcard || normalized.includes("employees.passwordReset");
  const canReviewQuality = hasWildcard || normalized.includes("quality.manual-reviews.write");
  const canScoreQuality = hasWildcard || normalized.includes("quality.scoring-audits.write");
  const canManageKnowledge = hasWildcard || normalized.includes("knowledge.write");

  let reason = "Доступ ограничен политикой организации";
  if (hasWildcard) {
    reason = "Полный доступ";
  } else if (canManageSettings) {
    reason = "Глобальные настройки доступны администратору";
  } else if (canExportReports || canRedistribute) {
    reason = "Глобальные настройки доступны только администратору";
  } else {
    reason = "Доступно старшему сотруднику или администратору";
  }

  return {
    sections,
    canOutbound,
    canManageDialogs,
    canViewSensitive,
    canManageSettings,
    canResetPasswords,
    canReviewQuality,
    canScoreQuality,
    canManageKnowledge,
    canExportReports,
    canRedistribute,
    canServiceAdmin: false,
    reason,
    permissionModel
  };
}

export function buildAccessProfileForRoleMode(roleMode, permissionModel) {
  return buildAccessProfile(resolveRolePermissions(roleMode, permissionModel), permissionModel);
}

function normalizePermissions(permissions) {
  return Array.isArray(permissions) ? permissions.filter(Boolean) : [];
}

function fallbackActionsForRoleMode(roleMode) {
  if (roleMode === "Администратор") {
    return ["*"];
  }

  if (roleMode === "Старший сотрудник") {
    return [
      "dialogs.read",
      "dialogs.manage",
      "panel.read",
      "presence.read",
      "presence.write",
      "clients.read",
      "templates.read",
      "templates.write",
      "visitors.read",
      "reports.read",
      "reports.export",
      "quality.read",
      "quality.manual-reviews.write",
      "quality.scoring-audits.write",
      "knowledge.read",
      "knowledge.write",
      "settings.read",
      "outbound.start",
      "employees.passwordReset",
      "routing.redistribute"
    ];
  }

  return ["dialogs.read", "clients.read", "templates.read", "templates.write", "presence.write"];
}
