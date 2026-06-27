import React, { useMemo, useState } from "react";
import { Ban, KeyRound, LogOut, Send, ShieldAlert, UserCog } from "lucide-react";
import { SectionTitle, StatusBadge, ToolbarSearch } from "../../ui.jsx";
import { serviceAdminTenants, serviceAdminUsers } from "../../data/serviceAdmin.js";
import { supportAdminService } from "../../services/supportAdminService.js";
import { formatDateTime, formatLabel, formatRole, getStatusTone } from "./serviceAdminUtils.js";

const actionConfigs = {
  reset2fa: {
    icon: KeyRound,
    label: "Сбросить 2FA",
    confirm: "Личность клиента проверена перед сбросом 2FA.",
    run: (user, reason, confirmed) => supportAdminService.resetTwoFactor({ confirmed, reason, userId: user.id })
  },
  logout: {
    icon: LogOut,
    label: "Завершить сессии",
    confirm: "Все активные сессии пользователя будут закрыты.",
    run: (user, reason, confirmed) => supportAdminService.forceLogout({ confirmed, reason, userId: user.id })
  },
  block: {
    icon: Ban,
    label: "Заблокировать",
    confirm: "Доступ пользователя будет заблокирован до обратного действия администратора.",
    run: (user, reason, confirmed) => supportAdminService.blockUser({ confirmed, reason, userId: user.id })
  },
  invite: {
    icon: Send,
    label: "Повторить приглашение",
    confirm: "Новое письмо-приглашение отменит старую ссылку.",
    run: (user, reason, confirmed) => supportAdminService.resendInvite({ confirmed, reason, userId: user.id })
  },
  impersonate: {
    icon: UserCog,
    label: "Войти от имени",
    confirm: "Сессия только для чтения начнется с заметным баннером и таймером.",
    run: (user, reason, confirmed) => supportAdminService.startImpersonation({
      confirmed,
      durationMinutes: 15,
      reason,
      tenantId: user.tenantId,
      userId: user.id
    })
  }
};

const userStatusOptions = ["all", "active", "blocked", "invited"];

export function ServiceUserSupportWorkspace({ onAudit, onImpersonationStart }) {
  const [query, setQuery] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState(serviceAdminUsers[0].id);
  const [selectedAction, setSelectedAction] = useState("reset2fa");
  const [reason, setReason] = useState("Личность клиента подтверждена в тикете поддержки");
  const [confirmed, setConfirmed] = useState(false);
  const [userOverrides, setUserOverrides] = useState({});

  const users = useMemo(() => (
    serviceAdminUsers.map((user) => ({ ...user, ...(userOverrides[user.id] ?? {}) }))
  ), [userOverrides]);
  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      const tenantMatches = tenantFilter === "all" || user.tenantId === tenantFilter;
      const statusMatches = statusFilter === "all" || user.status === statusFilter;
      const queryMatches = !normalizedQuery || [user.name, user.email, user.role]
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      return tenantMatches && statusMatches && queryMatches;
    });
  }, [query, statusFilter, tenantFilter, users]);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0];
  const selectedTenant = serviceAdminTenants.find((tenant) => tenant.id === selectedUser.tenantId);
  const actionConfig = actionConfigs[selectedAction];
  const ActionIcon = actionConfig.icon;
  const actionDisabled = reason.trim().length < 8 || !confirmed;

  async function handleRunAction() {
    const envelope = await actionConfig.run(selectedUser, reason, confirmed);

    if (envelope.status !== "ok") {
      onAudit(envelope, { action: `support.${selectedAction}`, target: selectedUser.id, severity: "warn" });
      return;
    }

    if (selectedAction === "impersonate") {
      onImpersonationStart(envelope);
    } else {
      setUserOverrides((current) => ({ ...current, [selectedUser.id]: envelope.data.user }));
      onAudit(envelope, { action: `support.${selectedAction}`, target: selectedUser.id });
    }

    setConfirmed(false);
  }

  return (
    <div className="service-admin-workspace-grid user-support-workspace">
      <section className="service-admin-list-panel">
        <header className="service-admin-panel-toolbar">
          <ToolbarSearch
            ariaLabel="Поиск пользователей"
            iconSize={17}
            onChange={setQuery}
            placeholder="Пользователь или email"
            value={query}
          />
          <select
            aria-label="Фильтр по организации"
            className="inline-select"
            onChange={(event) => setTenantFilter(event.target.value)}
            value={tenantFilter}
          >
            <option value="all">все организации</option>
            {serviceAdminTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
          </select>
          <select
            aria-label="Фильтр пользователей по статусу"
            className="inline-select"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            {userStatusOptions.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
          </select>
        </header>

        <div className="service-admin-user-list">
          {visibleUsers.map((user) => (
            <button
              className={user.id === selectedUser.id ? "selected" : ""}
              key={user.id}
              onClick={() => setSelectedUserId(user.id)}
              type="button"
            >
              <UserCog size={18} />
              <span>
                <strong>{user.name}</strong>
                <small>{user.email} - {formatRole(user.role)}</small>
              </span>
              <StatusBadge tone={getStatusTone(user.status)}>{formatLabel(user.status)}</StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Поддержка учетной записи" action={selectedTenant?.name ?? selectedUser.tenantId} />
        <div className="service-admin-detail-head">
          <div>
            <span>{selectedUser.email}</span>
            <h3>{selectedUser.name}</h3>
            <p>{selectedUser.supportNotes}</p>
          </div>
          <StatusBadge tone={getStatusTone(selectedUser.risk)}>{formatLabel(selectedUser.risk)}</StatusBadge>
        </div>

        <div className="service-admin-stat-grid">
          <span><b>{formatRole(selectedUser.role)}</b> роль</span>
          <span><b>{formatLabel(selectedUser.mfa)}</b> 2FA</span>
          <span><b>{selectedUser.sessions}</b> сессий</span>
          <span><b>{formatDateTime(selectedUser.lastActiveAt)}</b> последняя активность</span>
        </div>

        <div className="service-admin-action-picker" role="group" aria-label="Действия поддержки учетной записи">
          {Object.entries(actionConfigs).map(([key, config]) => {
            const Icon = config.icon;

            return (
              <button
                aria-pressed={selectedAction === key}
                className={selectedAction === key ? "selected" : ""}
                key={key}
                onClick={() => setSelectedAction(key)}
                type="button"
              >
                <Icon size={17} />
                {config.label}
              </button>
            );
          })}
        </div>

        <div className="service-admin-action-box">
          <header>
            <ShieldAlert size={18} />
            <div>
              <strong>{actionConfig.label}</strong>
              <span>{actionConfig.confirm}</span>
            </div>
          </header>
          <label className="service-admin-reason-field">
            <span>Причина</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
          </label>
          <label className="service-admin-confirm">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>Подтверждаю, что действие согласовано и должно попасть в аудит.</span>
          </label>
          <footer>
            <span>{actionDisabled ? "Нужны причина и подтверждение" : `Готово: ${selectedUser.name}`}</span>
            <button disabled={actionDisabled} onClick={handleRunAction} type="button">
              <ActionIcon size={17} />
              Выполнить
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}
