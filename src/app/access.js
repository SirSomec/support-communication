import { navItems } from "../data.js";

export const serviceAdminRole = "Администратор сервиса";
export const roleModes = ["Сотрудник", "Старший сотрудник", "Администратор"];

export const roleAccessProfiles = {
  "Сотрудник": {
    sections: ["dialogs", "clients", "templates"],
    canOutbound: false,
    canManageDialogs: false,
    canViewSensitive: false,
    canManageSettings: false,
    canResetPasswords: false,
    canExportReports: false,
    canRedistribute: false,
    canServiceAdmin: false,
    reason: "Доступно старшему сотруднику или администратору"
  },
  "Старший сотрудник": {
    sections: ["dialogs", "panel", "clients", "templates", "visitors", "reports", "quality", "settings"],
    canOutbound: true,
    canManageDialogs: true,
    canViewSensitive: true,
    canManageSettings: false,
    canResetPasswords: true,
    canExportReports: true,
    canRedistribute: true,
    canServiceAdmin: false,
    reason: "Глобальные настройки доступны только администратору"
  },
  "Администратор": {
    sections: navItems.map((item) => item.key),
    canOutbound: true,
    canManageDialogs: true,
    canViewSensitive: true,
    canManageSettings: true,
    canResetPasswords: true,
    canExportReports: true,
    canRedistribute: true,
    canServiceAdmin: false,
    reason: "Полный доступ"
  },
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
  reason: "Внутренний service-admin доступ отделен от ролей организации"
};
