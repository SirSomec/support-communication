import React, { useEffect, useState } from "react";
import { Permission } from "../../ui.jsx";
import { InlineHint, SettingsModal } from "./SettingsPrimitives.jsx";
import { permissionService } from "../../services/permissionService.js";

// Справочная матрица прав: какие возможности дает каждая роль.
// Проверка прав всегда выполняется на сервере, матрица только объясняет модель.
export function RoleMatrixModal({ onClose }) {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    permissionService.fetchPermissionModel().then((response) => {
      if (cancelled) {
        return;
      }

      // Платформенная роль service_admin не назначается сотрудникам организации —
      // в справочной матрице она только путает.
      setRoles(response.status === "ok"
        ? (response.data?.roles ?? []).filter(Boolean).filter((role) => (role.key ?? role.id) !== "service_admin").map(toRoleRow)
        : []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsModal
      eyebrow="Сотрудники и роли"
      onClose={onClose}
      size="wide"
      title="Права ролей"
      titleId="role-matrix-title"
    >
      <InlineHint>Роль назначается в карточке сотрудника. Права проверяются сервером при каждом действии.</InlineHint>
      {loading ? <div className="employee-empty">Загрузка матрицы доступа...</div> : null}
      {!loading ? (
        <div className="role-table">
          <div className="role-head">
            <span>Роль</span>
            <span>Панель</span>
            <span>Настройки</span>
            <span>Пароли</span>
            <span>Отчеты</span>
          </div>
          {roles.map((role) => (
            <div className="role-row" key={role.id}>
              <strong>{role.name}</strong>
              <Permission enabled={role.panel} />
              <Permission enabled={role.settings} />
              <Permission enabled={role.reset} />
              <span>{role.reports}</span>
            </div>
          ))}
          {!roles.length ? <div className="employee-empty">Не удалось загрузить роли.</div> : null}
        </div>
      ) : null}
    </SettingsModal>
  );
}

function toRoleRow(role) {
  const actions = Array.isArray(role.actions) ? role.actions : [];
  const hasWildcard = actions.includes("*");
  const roleKey = role.key ?? role.id ?? role.name;
  return {
    id: roleKey,
    name: role.label ?? role.displayName ?? role.name ?? formatRoleName(roleKey),
    panel: hasWildcard || actions.includes("panel.read"),
    reports: hasWildcard ? "Все" : actions.includes("reports.export") ? "export" : "read",
    reset: hasWildcard || actions.includes("employees.passwordReset"),
    settings: hasWildcard || actions.some((action) => action.startsWith("settings."))
  };
}

function formatRoleName(roleKey) {
  switch (roleKey) {
    case "admin":
      return "Администратор";
    case "employee":
      return "Сотрудник";
    case "senior":
      return "Старший сотрудник";
    case "service_admin":
      return "Администратор сервиса";
    default:
      return roleKey ?? "Роль";
  }
}
