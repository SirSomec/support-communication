import { navItems } from "../data.js";

export const roleModes = ["Сотрудник", "Старший сотрудник", "Администратор"];

export const roleAccessProfiles = {
  "Сотрудник": {
    sections: ["dialogs", "clients", "templates"],
    canOutbound: false,
    canManageDialogs: false,
    canViewSensitive: false,
    canManageSettings: false,
    canExportReports: false,
    canRedistribute: false,
    reason: "Доступно старшему сотруднику или администратору"
  },
  "Старший сотрудник": {
    sections: ["dialogs", "panel", "clients", "templates", "visitors", "reports", "quality", "settings"],
    canOutbound: true,
    canManageDialogs: true,
    canViewSensitive: true,
    canManageSettings: false,
    canExportReports: true,
    canRedistribute: true,
    reason: "Глобальные настройки доступны только администратору"
  },
  "Администратор": {
    sections: navItems.map((item) => item.key),
    canOutbound: true,
    canManageDialogs: true,
    canViewSensitive: true,
    canManageSettings: true,
    canExportReports: true,
    canRedistribute: true,
    reason: "Полный доступ"
  }
};
