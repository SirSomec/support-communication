import React, { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, MailPlus, RefreshCcw, ShieldCheck, Smartphone, Trash2, UserPlus, UserX, UsersRound } from "lucide-react";
import { ChannelBadge, ChannelList, ToolbarSearch } from "../../ui.jsx";
import { FieldHint, InlineHint, SettingsModal, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { RoleMatrixModal } from "./RoleMatrixModal.jsx";
import { settingsService } from "../../services/settingsService.js";

const STATUS_LABELS = {
  active: "Активен",
  blocked: "Заблокирован",
  deactivated: "Отключён",
  inactive: "Неактивен",
  invited: "Приглашён"
};

const MFA_LABELS = {
  enabled: "Включена — код на почту при входе",
  reset_pending: "Сброшена — подтвердится при следующем входе"
};

const PASSWORD_LABELS = {
  active: "Задан",
  invite_pending: "Ожидает принятия приглашения",
  reset_sent: "Отправлена ссылка для смены"
};

// Поля карточки, которые редактируются и сохраняются кнопкой «Сохранить».
const EDITABLE_FIELDS = ["canOverride", "channels", "chatLimit", "groupId", "roleKey", "sensitiveData"];

export function EmployeeManagementPanel({ access, canEditSettings, canResetEmployeePassword, onOpenGroups, onToast, roleMode }) {
  const [employees, setEmployees] = useState([]);
  const [baseline, setBaseline] = useState({});
  const [groups, setGroups] = useState([]);
  const [roles, setRoles] = useState([]);
  const [supportedChannels, setSupportedChannels] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [inviteDraft, setInviteDraft] = useState({ email: "", name: "", roleKey: "employee", groupId: "" });
  const [inviteError, setInviteError] = useState("");
  const [inviteResult, setInviteResult] = useState(null);
  const [isInviteOpen, setInviteOpen] = useState(false);
  const [isRoleMatrixOpen, setRoleMatrixOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const canEditEmployeeDirectory = canEditSettings && !error;
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? employees[0] ?? null;
  const selectedIsDirty = useMemo(() => {
    if (!selectedEmployee) {
      return false;
    }
    const base = baseline[selectedEmployee.id];
    if (!base) {
      return false;
    }
    return EDITABLE_FIELDS.some((field) => JSON.stringify(selectedEmployee[field]) !== JSON.stringify(base[field]));
  }, [baseline, selectedEmployee]);

  useEffect(() => {
    let ignore = false;

    async function loadEmployees() {
      setLoading(true);
      setError("");
      const response = await settingsService.fetchEmployees();

      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить сотрудников.");
        setEmployees([]);
        setGroups([]);
        setRoles([]);
        setSupportedChannels([]);
        setLoading(false);
        return;
      }

      const nextEmployees = normalizeEmployees(response.data?.employees ?? [], response.data?.roles ?? [], response.data?.groups ?? []);
      setEmployees(nextEmployees);
      setBaseline(buildBaseline(nextEmployees));
      setGroups(response.data?.groups ?? []);
      setRoles(response.data?.roles ?? []);
      setSupportedChannels(response.data?.supportedChannels ?? []);
      setSelectedEmployeeId((current) => current && nextEmployees.some((employee) => employee.id === current)
        ? current
        : nextEmployees[0]?.id ?? "");
      setLoading(false);
    }

    loadEmployees();
    return () => {
      ignore = true;
    };
  }, []);

  const visibleEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    return employees
      .filter((employee) => statusFilter === "all" || employee.status === statusFilter)
      .filter((employee) => roleFilter === "all" || employee.roleKey === roleFilter)
      .filter((employee) => groupFilter === "all" || employee.groupId === groupFilter)
      .filter((employee) => channelFilter === "all" || employee.channels.includes(channelFilter))
      .filter((employee) => !query || [
        employee.employee,
        employee.email,
        employee.role,
        employee.group,
        employee.passwordStatus,
        employee.mfaStatus,
        ...employee.channels
      ].join(" ").toLowerCase().includes(query));
  }, [channelFilter, employeeQuery, employees, groupFilter, roleFilter, statusFilter]);

  function applySavedEmployee(saved) {
    setEmployees((current) => current.map((employee) => employee.id === saved.id ? saved : employee));
    setBaseline((current) => ({ ...current, [saved.id]: snapshotEmployee(saved) }));
  }

  function patchSelectedEmployee(patch) {
    if (!selectedEmployee || !canEditEmployeeDirectory) {
      return;
    }

    setEmployees((current) => current.map((employee) => employee.id === selectedEmployee.id ? { ...employee, ...patch } : employee));
  }

  function toggleSelectedEmployeeChannel(channelName) {
    if (!selectedEmployee || !canEditEmployeeDirectory) {
      return;
    }

    const channels = selectedEmployee.channels.includes(channelName)
      ? selectedEmployee.channels.filter((channel) => channel !== channelName)
      : [...selectedEmployee.channels, channelName];
    patchSelectedEmployee({ channels });
  }

  async function handleSaveEmployee() {
    if (!selectedEmployee || !canEditEmployeeDirectory) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await settingsService.updateEmployee({
      employeeId: selectedEmployee.id,
      canOverride: selectedEmployee.canOverride,
      channels: selectedEmployee.channels,
      chatLimit: selectedEmployee.chatLimit,
      groupId: selectedEmployee.groupId,
      roleKey: selectedEmployee.roleKey,
      sensitiveData: selectedEmployee.sensitiveData
    });
    setSaving(false);

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось сохранить сотрудника.");
      return;
    }

    const saved = normalizeEmployee(response.data?.employee, roles, groups);
    applySavedEmployee(saved);
    onToast(`${saved.employee}: настройки сохранены. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handlePasswordReset() {
    if (!selectedEmployee || !canResetEmployeePassword || saving) {
      return;
    }

    setSaving(true);
    const response = await settingsService.resetEmployeePassword({
      employeeId: selectedEmployee.id,
      reason: "Reset requested from employee settings"
    }).finally(() => setSaving(false));

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось отправить сброс пароля.");
      return;
    }

    const saved = normalizeEmployee(response.data?.employee, roles, groups);
    applySavedEmployee(saved);
    onToast(`${saved.employee}: ссылка для смены пароля отправлена. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleMfaReset() {
    if (!selectedEmployee || !canResetEmployeePassword || saving) {
      return;
    }

    setSaving(true);
    const response = await settingsService.resetEmployeeMfa({
      employeeId: selectedEmployee.id,
      reason: "MFA reset requested from employee settings"
    }).finally(() => setSaving(false));

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось сбросить MFA.");
      return;
    }

    const saved = normalizeEmployee(response.data?.employee, roles, groups);
    applySavedEmployee(saved);
    onToast(`${saved.employee}: MFA сброшена — подтвердится при следующем входе. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleDeactivateEmployee() {
    const target = confirmAction?.employee;
    setConfirmAction(null);
    if (!target || !canEditEmployeeDirectory || saving) {
      return;
    }

    setSaving(true);
    const response = await settingsService.deactivateEmployee({
      employeeId: target.id,
      reason: "Deactivated from employee settings"
    }).finally(() => setSaving(false));

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось отключить сотрудника.");
      return;
    }

    const saved = normalizeEmployee(response.data?.employee, roles, groups);
    applySavedEmployee(saved);
    onToast(`${saved.employee}: доступ отключён. Пригласить заново можно с той же почтой. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleDeleteEmployee() {
    const target = confirmAction?.employee;
    setConfirmAction(null);
    if (!target || !canEditEmployeeDirectory || saving) {
      return;
    }

    setSaving(true);
    const response = await settingsService.deleteEmployee({
      employeeId: target.id,
      reason: "Deleted from employee settings"
    }).finally(() => setSaving(false));

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось удалить сотрудника.");
      return;
    }

    setEmployees((current) => current.filter((employee) => employee.id !== target.id));
    setBaseline((current) => {
      const next = { ...current };
      delete next[target.id];
      return next;
    });
    setSelectedEmployeeId((current) => current === target.id ? "" : current);
    onToast(`${target.employee}: учётная запись удалена. Почту ${target.email} можно использовать для нового приглашения. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleResendInvite() {
    if (!selectedEmployee || !canEditEmployeeDirectory || saving) {
      return;
    }

    setSaving(true);
    const response = await settingsService.resendEmployeeInvite({
      employeeId: selectedEmployee.id,
      reason: "Invite resent from employee settings"
    }).finally(() => setSaving(false));

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось отправить приглашение повторно.");
      return;
    }

    const saved = normalizeEmployee(response.data?.employee, roles, groups);
    applySavedEmployee(saved);
    setInviteResult({
      code: response.data?.inviteDescriptor?.code ?? "",
      deliveryState: response.data?.inviteDescriptor?.deliveryState ?? "sent",
      email: saved.email,
      employee: saved.employee
    });
    onToast(`${saved.employee}: приглашение отправлено повторно.`);
  }

  async function handleInviteEmployee(event) {
    event.preventDefault();
    if (!canEditEmployeeDirectory) {
      return;
    }

    setSaving(true);
    setInviteError("");
    const response = await settingsService.inviteEmployee({
      ...inviteDraft,
      groupId: inviteDraft.groupId || groups[0]?.id || ""
    });
    setSaving(false);

    if (response.status !== "ok") {
      setInviteError(response.error?.message ?? "Не удалось отправить приглашение.");
      return;
    }

    const invited = normalizeEmployee(response.data?.employee, roles, groups);
    setEmployees((current) => [invited, ...current.filter((employee) => employee.id !== invited.id)]);
    setBaseline((current) => ({ ...current, [invited.id]: snapshotEmployee(invited) }));
    setSelectedEmployeeId(invited.id);
    setInviteDraft({ email: "", name: "", roleKey: "employee", groupId: "" });
    setInviteOpen(false);
    setInviteResult({
      code: response.data?.inviteDescriptor?.code ?? "",
      deliveryState: response.data?.inviteDescriptor?.deliveryState ?? "sent",
      email: invited.email,
      employee: invited.employee
    });
    const inviteDeliveryFailed = response.data?.inviteDescriptor?.deliveryState === "failed";
    const deliveryNote = inviteDeliveryFailed
      ? "приглашение создано, но письмо не ушло — передайте код вручную"
      : "приглашение отправлено";
    onToast(`${invited.employee}: ${deliveryNote}. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function copyInviteCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      onToast("Код приглашения скопирован.");
    } catch {
      onToast("Не удалось скопировать код — выделите его вручную.");
    }
  }

  function openInviteModal() {
    if (!canEditEmployeeDirectory) {
      onToast(access.reason);
      return;
    }

    setInviteError("");
    setInviteOpen(true);
  }

  return (
    <section className="settings-section employee-rules-panel">
      <SettingsSectionHeader
        title="Сотрудники и роли"
        meta={loading ? "загрузка" : `${employees.length} сотрудников`}
        hint="Роль определяет доступы, группа — зону ответственности, лимит — нагрузку оператора."
        actions={
          <>
            <button className="settings-ghost-action" onClick={() => setRoleMatrixOpen(true)} title="Справочник: какие права дает каждая роль" type="button">
              <ShieldCheck size={16} />
              Права ролей
            </button>
            <button className="settings-ghost-action" onClick={() => onOpenGroups?.()} title="Перейти к управлению группами" type="button">
              <UsersRound size={16} />
              Группы
            </button>
            <button
              className="primary-action settings-invite-employee"
              disabled={!canEditEmployeeDirectory}
              onClick={openInviteModal}
              title={canEditEmployeeDirectory ? "Отправить приглашение по email" : access.reason}
              type="button"
            >
              <UserPlus size={16} />
              Пригласить
            </button>
          </>
        }
      />

      <div className="employee-management">
        <div className="employee-directory">
          <div className="employee-directory-toolbar">
            <ToolbarSearch
              ariaLabel="Поиск сотрудника"
              className="employee-search"
              iconSize={17}
              placeholder="Имя, email, роль, группа, канал"
              value={employeeQuery}
              onChange={setEmployeeQuery}
            />
            <div className="employee-filter-row" aria-label="Фильтры сотрудников">
              <select aria-label="Фильтр по статусу" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Все статусы</option>
                <option value="active">Активные</option>
                <option value="invited">Приглашены</option>
                <option value="blocked">Заблокированы</option>
                <option value="deactivated">Отключены</option>
              </select>
              <select aria-label="Фильтр по роли" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">Все роли</option>
                {roles.map((role) => <option value={role.key} key={role.key}>{role.name}</option>)}
              </select>
              <select aria-label="Фильтр по группе" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                <option value="all">Все группы</option>
                {groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
              </select>
              <select aria-label="Фильтр по каналу" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                <option value="all">Все каналы</option>
                {supportedChannels.map((channelName) => <option value={channelName} key={channelName}>{channelName}</option>)}
              </select>
            </div>
          </div>
          <div className="employee-selector-list settings-scroll">
            {loading ? <div className="employee-empty">Загрузка сотрудников...</div> : null}
            {!loading && visibleEmployees.map((employee) => (
              <button
                aria-pressed={selectedEmployee?.id === employee.id}
                className={selectedEmployee?.id === employee.id ? "selected" : ""}
                data-employee-id={employee.id}
                key={employee.id}
                onClick={() => setSelectedEmployeeId(employee.id)}
                type="button"
              >
                <strong>{employee.employee}</strong>
                <span>
                  {employee.role} · {employee.group}
                  <em className={`employee-status-badge status-${employee.status}`}>{statusLabel(employee.status)}</em>
                </span>
                <ChannelList channels={employee.channels} />
              </button>
            ))}
            {!loading && !visibleEmployees.length ? (
              <div className="employee-empty">Сотрудники не найдены. Измените фильтры или пригласите нового сотрудника.</div>
            ) : null}
          </div>
        </div>

        <div className="employee-editor">
          {selectedEmployee ? (
            <>
              <header>
                <div>
                  <strong>{selectedEmployee.employee}</strong>
                  <span>{selectedEmployee.email} · {statusLabel(selectedEmployee.status)} · вход: {formatLastLogin(selectedEmployee.lastLogin)}</span>
                </div>
                <button
                  disabled={!canResetEmployeePassword || saving}
                  onClick={handlePasswordReset}
                  title={canResetEmployeePassword ? "Отправить сотруднику ссылку для смены пароля" : access.reason}
                  type="button"
                >
                  <KeyRound size={16} />
                  Сбросить пароль
                </button>
                <button
                  disabled={!canResetEmployeePassword || saving}
                  onClick={handleMfaReset}
                  title={canResetEmployeePassword ? "Сбросить второй фактор — подтвердится при следующем входе сотрудника" : access.reason}
                  type="button"
                >
                  <Smartphone size={16} />
                  Сбросить MFA
                </button>
              </header>
              <div className="employee-editor-body settings-scroll">
                {selectedEmployee.status === "invited" ? (
                  <InlineHint>
                    Сотрудник ещё не принял приглашение и не может войти в систему. Если письмо не дошло —
                    отправьте приглашение повторно или передайте код вручную.
                  </InlineHint>
                ) : null}
                {selectedEmployee.status === "deactivated" ? (
                  <InlineHint>
                    Доступ отключён: сотрудник не может войти. Можно пригласить его заново с той же почтой
                    через кнопку «Пригласить» или удалить учётную запись насовсем.
                  </InlineHint>
                ) : null}
                <div className="employee-editor-grid">
                  <label>
                    <span>Роль</span>
                    <select
                      disabled={!canEditEmployeeDirectory}
                      value={selectedEmployee.roleKey}
                      onChange={(event) => patchSelectedEmployee({ roleKey: event.target.value, role: roleName(roles, event.target.value) })}
                      title={roleDescription(roles, selectedEmployee.roleKey) || (canEditEmployeeDirectory ? "Изменить роль" : access.reason)}
                    >
                      {roles.map((role) => <option value={role.key} key={role.key}>{role.name}</option>)}
                    </select>
                    <FieldHint>{roleDescription(roles, selectedEmployee.roleKey)}</FieldHint>
                  </label>
                  <label>
                    <span>Группа</span>
                    <select disabled={!canEditEmployeeDirectory} value={selectedEmployee.groupId} onChange={(event) => patchSelectedEmployee({ groupId: event.target.value, group: groupName(groups, event.target.value) })} title={canEditEmployeeDirectory ? "Назначить группу" : access.reason}>
                      {groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Лимит чатов</span>
                    <input disabled={!canEditEmployeeDirectory} min="1" max="30" type="number" value={selectedEmployee.chatLimit} onChange={(event) => patchSelectedEmployee({ chatLimit: Number(event.target.value) })} title={canEditEmployeeDirectory ? "Одновременных диалогов на сотрудника" : access.reason} />
                  </label>
                  <div>
                    <span>Пароль</span>
                    <strong>{passwordLabel(selectedEmployee.passwordStatus)}</strong>
                  </div>
                  <div>
                    <span>MFA</span>
                    <strong>{mfaLabel(selectedEmployee.mfaStatus)}</strong>
                  </div>
                </div>
                <div className="employee-channel-editor" aria-label="Каналы сотрудника">
                  <span className="employee-editor-caption">Каналы, в которых сотрудник принимает обращения</span>
                  <div>
                    {supportedChannels.map((channelName) => (
                      <label key={channelName}>
                        <input
                          checked={selectedEmployee.channels.includes(channelName)}
                          disabled={!canEditEmployeeDirectory}
                          onChange={() => toggleSelectedEmployeeChannel(channelName)}
                          title={canEditEmployeeDirectory ? `Переключить канал ${channelName}` : access.reason}
                          type="checkbox"
                        />
                        <ChannelBadge channel={channelName} />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="employee-permission-toggles">
                  <label>
                    <input
                      checked={selectedEmployee.canOverride}
                      disabled={!canEditEmployeeDirectory}
                      onChange={(event) => patchSelectedEmployee({ canOverride: event.target.checked })}
                      title="Разрешает назначать сотруднику диалоги даже при заполненном лимите одновременных чатов"
                      type="checkbox"
                    />
                    <span className="employee-toggle-text">
                      Назначение сверх лимита
                      <small>Диалог можно назначить вручную, даже если лимит чатов уже заполнен</small>
                    </span>
                  </label>
                  <label>
                    <input
                      checked={selectedEmployee.sensitiveData}
                      disabled={!canEditEmployeeDirectory}
                      onChange={(event) => patchSelectedEmployee({ sensitiveData: event.target.checked })}
                      title={canEditEmployeeDirectory ? "Видит телефоны и персональные данные клиентов" : access.reason}
                      type="checkbox"
                    />
                    <span className="employee-toggle-text">
                      Чувствительные данные
                      <small>Видит телефоны и персональные данные клиентов без маскировки</small>
                    </span>
                  </label>
                </div>
                <div className="employee-danger-zone" aria-label="Управление учетной записью">
                  {selectedEmployee.status === "invited" ? (
                    <button
                      disabled={!canEditEmployeeDirectory || saving}
                      onClick={handleResendInvite}
                      title="Создать новый код и отправить письмо-приглашение ещё раз"
                      type="button"
                    >
                      <MailPlus size={16} />
                      Отправить приглашение снова
                    </button>
                  ) : null}
                  {selectedEmployee.status !== "deactivated" ? (
                    <button
                      className="settings-danger-action"
                      disabled={!canEditEmployeeDirectory || saving}
                      onClick={() => setConfirmAction({ employee: selectedEmployee, type: "deactivate" })}
                      title="Сотрудник потеряет доступ, но учётная запись и история сохранятся"
                      type="button"
                    >
                      <UserX size={16} />
                      Отключить доступ
                    </button>
                  ) : null}
                  <button
                    className="settings-danger-action"
                    disabled={!canEditEmployeeDirectory || saving}
                    onClick={() => setConfirmAction({ employee: selectedEmployee, type: "delete" })}
                    title="Удалить учётную запись насовсем — почту можно будет использовать для нового приглашения"
                    type="button"
                  >
                    <Trash2 size={16} />
                    Удалить учётную запись
                  </button>
                </div>
                {error ? <div className="employee-error">{error}</div> : null}
              </div>
              <footer>
                <span>
                  {canEditEmployeeDirectory
                    ? selectedIsDirty
                      ? "Есть несохранённые изменения — нажмите «Сохранить»."
                      : "Изменения сохраняются в backend и попадают в audit."
                    : `${roleMode}: можно смотреть карточку сотрудника${canResetEmployeePassword ? " и сбрасывать пароль/MFA." : "."}`}
                </span>
                <button
                  disabled={!canEditEmployeeDirectory || saving || !selectedIsDirty}
                  onClick={handleSaveEmployee}
                  title={canEditEmployeeDirectory ? (selectedIsDirty ? "Сохранить сотрудника" : "Нет изменений для сохранения") : access.reason}
                  type="button"
                >
                  {saving ? <RefreshCcw size={16} /> : <ShieldCheck size={16} />}
                  Сохранить
                </button>
              </footer>
            </>
          ) : (
            <div className="employee-empty">{loading ? "Загрузка сотрудников..." : "Выберите сотрудника из списка слева."}</div>
          )}
        </div>
      </div>

      {isInviteOpen ? (
        <SettingsModal
          eyebrow="Сотрудники и роли"
          footer={
            <>
              <button onClick={() => setInviteOpen(false)} type="button">Отмена</button>
              <button
                className="primary-action"
                disabled={!canEditEmployeeDirectory || saving}
                form="employee-invite-form"
                title={canEditEmployeeDirectory ? "Отправить приглашение" : access.reason}
                type="submit"
              >
                <UserPlus size={16} />
                Пригласить
              </button>
            </>
          }
          onClose={() => setInviteOpen(false)}
          title="Пригласить сотрудника"
          titleId="employee-invite-title"
        >
          <form className="employee-invite-form settings-form" id="employee-invite-form" onSubmit={handleInviteEmployee}>
            <InlineHint>
              Сотрудник получит письмо с кодом приглашения: задаст пароль и сразу попадёт в рабочее пространство.
              Если учётная запись с этой почтой была отключена, приглашение активирует её заново.
            </InlineHint>
            <div className="settings-form-grid">
              <label>
                <span>Имя</span>
                <input
                  disabled={!canEditEmployeeDirectory}
                  placeholder="Анна Смирнова"
                  value={inviteDraft.name}
                  onChange={(event) => setInviteDraft((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
              <label>
                <span>Email</span>
                <input
                  disabled={!canEditEmployeeDirectory}
                  placeholder="email@company.ru"
                  type="email"
                  value={inviteDraft.email}
                  onChange={(event) => setInviteDraft((current) => ({ ...current, email: event.target.value }))}
                />
                <FieldHint>На этот адрес придет приглашение.</FieldHint>
              </label>
              <label>
                <span>Роль</span>
                <select
                  disabled={!canEditEmployeeDirectory}
                  value={inviteDraft.roleKey}
                  onChange={(event) => setInviteDraft((current) => ({ ...current, roleKey: event.target.value }))}
                >
                  {roles.map((role) => <option value={role.key} key={role.key}>{role.name}</option>)}
                </select>
                <FieldHint>{roleDescription(roles, inviteDraft.roleKey) || "Определяет доступы. Можно изменить позже."}</FieldHint>
              </label>
              <label>
                <span>Группа</span>
                <select
                  disabled={!canEditEmployeeDirectory}
                  value={inviteDraft.groupId || groups[0]?.id || ""}
                  onChange={(event) => setInviteDraft((current) => ({ ...current, groupId: event.target.value }))}
                >
                  {groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}
                </select>
                <FieldHint>Зона ответственности сотрудника.</FieldHint>
              </label>
            </div>
            {inviteError ? <div className="settings-form-error" role="alert">{inviteError}</div> : null}
          </form>
        </SettingsModal>
      ) : null}

      {inviteResult ? (
        <SettingsModal
          eyebrow="Сотрудники и роли"
          footer={
            <button className="primary-action" onClick={() => setInviteResult(null)} type="button">Готово</button>
          }
          onClose={() => setInviteResult(null)}
          title="Приглашение создано"
          titleId="employee-invite-result-title"
        >
          <InlineHint>
            {inviteResult.deliveryState === "failed"
              ? `Письмо на ${inviteResult.email} не отправилось — передайте сотруднику код вручную. Он вводится на странице входа во вкладке «Invite».`
              : `Письмо с кодом отправлено на ${inviteResult.email}. Код можно передать и вручную — он вводится на странице входа во вкладке «Invite».`}
          </InlineHint>
          <div className="employee-invite-code" aria-label="Код приглашения">
            <code>{inviteResult.code || "код недоступен"}</code>
            {inviteResult.code ? (
              <button onClick={() => copyInviteCode(inviteResult.code)} title="Скопировать код приглашения" type="button">
                <Copy size={15} />
                Скопировать
              </button>
            ) : null}
          </div>
        </SettingsModal>
      ) : null}

      {confirmAction ? (
        <SettingsModal
          eyebrow="Сотрудники и роли"
          footer={
            <>
              <button onClick={() => setConfirmAction(null)} type="button">Отмена</button>
              <button
                className="primary-action settings-danger-action"
                onClick={confirmAction.type === "delete" ? handleDeleteEmployee : handleDeactivateEmployee}
                type="button"
              >
                {confirmAction.type === "delete" ? <Trash2 size={16} /> : <UserX size={16} />}
                {confirmAction.type === "delete" ? "Удалить" : "Отключить"}
              </button>
            </>
          }
          onClose={() => setConfirmAction(null)}
          title={confirmAction.type === "delete" ? "Удалить учётную запись?" : "Отключить доступ?"}
          titleId="employee-confirm-title"
        >
          <InlineHint>
            {confirmAction.type === "delete"
              ? `Учётная запись «${confirmAction.employee.employee}» (${confirmAction.employee.email}) будет удалена насовсем: активные сессии завершатся, а почту можно будет использовать для нового приглашения. Действие нельзя отменить.`
              : `Сотрудник «${confirmAction.employee.employee}» потеряет доступ к рабочему пространству, но учётная запись и история сохранятся. Позже его можно пригласить заново с той же почтой.`}
          </InlineHint>
        </SettingsModal>
      ) : null}

      {isRoleMatrixOpen ? <RoleMatrixModal onClose={() => setRoleMatrixOpen(false)} /> : null}
    </section>
  );
}

function normalizeEmployees(items, roles = [], groups = []) {
  return items.map((employee) => normalizeEmployee(employee, roles, groups)).filter(Boolean);
}

function normalizeEmployee(employee, roles = [], groups = []) {
  if (!employee?.id) {
    return null;
  }

  return {
    id: employee.id,
    employee: employee.employee ?? employee.name ?? employee.email ?? employee.id,
    email: employee.email ?? "",
    role: employee.role ?? roleName(roles, employee.roleKey),
    roleKey: employee.roleKey ?? "employee",
    group: employee.group ?? employee.groupName ?? groupName(groups, employee.groupId),
    groupId: employee.groupId ?? "group-line-1",
    status: employee.status ?? "active",
    channels: Array.isArray(employee.channels) ? employee.channels : ["SDK"],
    chatLimit: Number(employee.chatLimit ?? 8),
    canOverride: Boolean(employee.canOverride),
    sensitiveData: Boolean(employee.sensitiveData),
    passwordStatus: employee.passwordStatus ?? employee.credentials?.passwordStatus ?? "active",
    mfaStatus: employee.mfaStatus ?? "enabled",
    lastLogin: employee.lastLogin ?? employee.lastActiveAt ?? "Never",
    exceptions: Array.isArray(employee.exceptions) ? employee.exceptions : []
  };
}

function snapshotEmployee(employee) {
  return Object.fromEntries(EDITABLE_FIELDS.map((field) => [field, employee[field]]));
}

function buildBaseline(employees) {
  return Object.fromEntries(employees.map((employee) => [employee.id, snapshotEmployee(employee)]));
}

function roleName(roles, roleKey) {
  return roles.find((role) => role.key === roleKey)?.name ?? roleKey;
}

function roleDescription(roles, roleKey) {
  return roles.find((role) => role.key === roleKey)?.description ?? "";
}

function groupName(groups, groupId) {
  return groups.find((group) => group.id === groupId)?.name ?? groupId;
}

function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

function mfaLabel(mfaStatus) {
  return MFA_LABELS[mfaStatus] ?? MFA_LABELS.enabled;
}

function passwordLabel(passwordStatus) {
  return PASSWORD_LABELS[passwordStatus] ?? passwordStatus;
}

function formatLastLogin(value) {
  if (!value || value === "Never") {
    return "ещё не входил";
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  return new Date(parsed).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
