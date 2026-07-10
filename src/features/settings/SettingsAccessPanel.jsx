import React, { useEffect, useState } from "react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { submitSettingsChannelStatusToggle } from "../../app/settingsChannelActions.js";
import { ChannelBadge, Permission, SectionTitle, SegmentedControl } from "../../ui.jsx";
import { integrationService } from "../../services/integrationService.js";
import { permissionService } from "../../services/permissionService.js";

const roleOptions = ["Сотрудник", "Старший сотрудник", "Администратор"];

export function SettingsAccessPanel({ canEditSettings, onRoleMode, onToast, roleMode }) {
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyChannelType, setBusyChannelType] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAccessData() {
      setLoading(true);
      setError("");
      const [permissionResponse, integrationResponse, connectionResponse] = await Promise.all([
        permissionService.fetchPermissionModel(),
        integrationService.fetchIntegrationWorkspace(),
        integrationService.fetchChannelConnections()
      ]);

      if (cancelled) {
        return;
      }

      if (permissionResponse.status === "ok") {
        setRoles((permissionResponse.data?.roles ?? []).filter(Boolean).map(toRoleRow));
      } else {
        setRoles([]);
      }

      if (integrationResponse.status === "ok" && connectionResponse.status === "ok") {
        const channelDetails = integrationResponse.data?.channelDetails ?? [];
        const channelConnections = connectionResponse.data?.connections ?? [];
        setChannels(buildChannelRows(channelDetails, channelConnections));
      } else {
        setChannels([]);
        setError("Не удалось загрузить статусы каналов.");
      }

      setLoading(false);
    }

    loadAccessData();

    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleChannelStatus(channel) {
    if (!canEditSettings || busyChannelType || !channel.hasConnections) {
      return;
    }

    const nextEnabled = !channel.enabled;
    setBusyChannelType(channel.type);
    setError("");
    const result = await submitSettingsChannelStatusToggle({
      enabled: nextEnabled,
      reason: `Settings aggregate channel ${nextEnabled ? "enabled" : "disabled"}`,
      type: channel.type
    }, integrationService);
    setBusyChannelType("");

    if (!result.ok) {
      setError(result.message);
      onToast?.(result.message);
      return;
    }

    setChannels((current) => current.map((item) => item.type === channel.type
      ? mergeChannelAggregate(item, result.channel)
      : item
    ));
    onToast?.(`${channel.name}: ${nextEnabled ? "включен" : "отключен"} через backend, audit ${result.auditId}.`);
  }

  if (loading) {
    return <div>Загрузка матрицы доступа...</div>;
  }

  return (
    <>
      <div className="role-mode-panel">
        <div>
          <strong>Проверка интерфейса по роли</strong>
          <span>{canEditSettings ? "Полный доступ к общим настройкам" : "Общие настройки доступны только на чтение"}</span>
        </div>
        <SegmentedControl
          ariaLabel="Текущая роль"
          options={roleOptions}
          value={roleMode}
          onChange={onRoleMode}
        />
      </div>

      <div className="settings-layout">
        <section className="work-panel">
          <SectionTitle title="Матрица ролей" action="Серверная проверка прав" />
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
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Каналы и лимиты" action="На одного оператора" />
          {error ? <div className="settings-rule-error">{error}</div> : null}
          <div className="channel-settings">
            {channels.map((channel) => (
              <article key={channel.type}>
                <button
                  aria-label={`Переключить ${channel.name}`}
                  aria-pressed={channel.enabled}
                  className="toggle-button"
                  disabled={!canEditSettings || busyChannelType === channel.type || !channel.hasConnections}
                  onClick={() => void toggleChannelStatus(channel)}
                  title={channel.hasConnections ? "Изменить агрегированный статус канала" : "Нет backend connection records для агрегированного статуса."}
                  type="button"
                >
                  {channel.enabled ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
                </button>
                <ChannelBadge channel={channel.name} />
                <span>{channel.staff} сотрудников</span>
                <label>
                  <span>Лимит</span>
                  <input
                    disabled
                    max="30"
                    min="1"
                    title="Лимит канала меняется в панели подключений, где есть backend connection id."
                    type="number"
                    value={channel.limit}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
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

function buildChannelRows(channelDetails, channelConnections) {
  const connectionsByType = new Map();
  channelConnections.filter(Boolean).forEach((connection) => {
    const type = normalizeChannelType(connection.type ?? connection.channel ?? connection.id);
    if (!type) {
      return;
    }

    connectionsByType.set(type, [...(connectionsByType.get(type) ?? []), connection]);
  });

  const catalogRows = channelDetails.filter(Boolean).map((channel) => {
    const type = normalizeChannelType(channel.id ?? channel.channel ?? channel.name);
    const connections = connectionsByType.get(type) ?? [];
    connectionsByType.delete(type);

    return buildChannelRow({
      fallbackLimit: parseChannelLimit(channel.limit),
      name: channel.channel ?? channel.name ?? channel.id ?? "Канал",
      type,
      connections
    });
  });

  const extraRows = Array.from(connectionsByType.entries()).map(([type, connections]) => buildChannelRow({
    fallbackLimit: connections[0]?.chatLimit ?? 5,
    name: formatChannelName(type),
    type,
    connections
  }));

  return [...catalogRows, ...extraRows].filter((channel) => channel.type);
}

function buildChannelRow({ connections, fallbackLimit, name, type }) {
  const activeConnections = connections.filter((connection) => connection.status === "active");
  const firstConnection = connections[0];

  return {
    enabled: activeConnections.length > 0,
    hasConnections: connections.length > 0,
    limit: firstConnection?.chatLimit ?? fallbackLimit ?? 5,
    name,
    staff: activeConnections.length,
    total: connections.length,
    type
  };
}

function mergeChannelAggregate(channel, aggregate) {
  return {
    ...channel,
    enabled: Boolean(aggregate.enabled),
    hasConnections: Number(aggregate.total ?? channel.total) > 0,
    limit: aggregate.limit ?? channel.limit,
    staff: aggregate.activeCount ?? channel.staff,
    total: aggregate.total ?? channel.total
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

function normalizeChannelType(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseChannelLimit(value) {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : 5;
}

function formatChannelName(type) {
  switch (type) {
    case "max":
      return "MAX";
    case "sdk":
      return "SDK";
    case "telegram":
      return "Telegram";
    case "vk":
      return "VK";
    case "webhook":
      return "Webhook";
    default:
      return type || "Канал";
  }
}
