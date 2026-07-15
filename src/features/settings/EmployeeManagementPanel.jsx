import React, { useEffect, useMemo, useState } from "react";
import { KeyRound, RefreshCcw, ShieldCheck, Smartphone, UserPlus, UsersRound } from "lucide-react";
import { ChannelBadge, ChannelList, ToolbarSearch } from "../../ui.jsx";
import { FieldHint, InlineHint, SettingsModal, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { RoleMatrixModal } from "./RoleMatrixModal.jsx";
import { settingsService } from "../../services/settingsService.js";

export function EmployeeManagementPanel({ access, canEditSettings, canResetEmployeePassword, onToast, roleMode }) {
  const [employees, setEmployees] = useState([]);
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
  const [inviteDraft, setInviteDraft] = useState({ email: "", name: "", roleKey: "employee", groupId: "group-line-1" });
  const [groupDraft, setGroupDraft] = useState({ channels: ["SDK"], groupId: "", name: "", scope: "" });
  const [inviteError, setInviteError] = useState("");
  const [groupError, setGroupError] = useState("");
  const [isInviteOpen, setInviteOpen] = useState(false);
  const [isGroupsOpen, setGroupsOpen] = useState(false);
  const [isRoleMatrixOpen, setRoleMatrixOpen] = useState(false);

  const canEditEmployeeDirectory = canEditSettings && !error;
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) ?? employees[0] ?? null;

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

    const saved = normalizeEmployee(response.data?.employee);
    setEmployees((current) => current.map((employee) => employee.id === saved.id ? saved : employee));
    onToast(`${saved.employee}: настройки сохранены. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handlePasswordReset() {
    if (!selectedEmployee || !canResetEmployeePassword) {
      return;
    }

    const response = await settingsService.resetEmployeePassword({
      employeeId: selectedEmployee.id,
      reason: "Reset requested from employee settings"
    });

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось отправить сброс пароля.");
      return;
    }

    const saved = normalizeEmployee(response.data?.employee);
    setEmployees((current) => current.map((employee) => employee.id === saved.id ? saved : employee));
    onToast(`${saved.employee}: ссылка для смены пароля отправлена. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleMfaReset() {
    if (!selectedEmployee || !canResetEmployeePassword) {
      return;
    }

    const response = await settingsService.resetEmployeeMfa({
      employeeId: selectedEmployee.id,
      reason: "MFA reset requested from employee settings"
    });

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось сбросить MFA.");
      return;
    }

    const saved = normalizeEmployee(response.data?.employee);
    setEmployees((current) => current.map((employee) => employee.id === saved.id ? saved : employee));
    onToast(`${saved.employee}: MFA переведена в сброс. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleInviteEmployee(event) {
    event.preventDefault();
    if (!canEditEmployeeDirectory) {
      return;
    }

    setSaving(true);
    setInviteError("");
    const response = await settingsService.inviteEmployee(inviteDraft);
    setSaving(false);

    if (response.status !== "ok") {
      setInviteError(response.error?.message ?? "Не удалось отправить приглашение.");
      return;
    }

    const invited = normalizeEmployee(response.data?.employee);
    setEmployees((current) => [invited, ...current]);
    setSelectedEmployeeId(invited.id);
    setInviteDraft({ email: "", name: "", roleKey: "employee", groupId: "group-line-1" });
    setInviteOpen(false);
    onToast(`${invited.employee}: приглашение отправлено. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleSaveGroup(event) {
    event.preventDefault();
    if (!canEditEmployeeDirectory) {
      return;
    }

    const payload = {
      channels: groupDraft.channels,
      name: groupDraft.name.trim(),
      scope: groupDraft.scope.trim()
    };
    if (!payload.name || !payload.scope) {
      setGroupError("Укажите название и область ответственности группы.");
      return;
    }

    setSaving(true);
    setGroupError("");
    const response = groupDraft.groupId
      ? await settingsService.updateGroup({ groupId: groupDraft.groupId, ...payload })
      : await settingsService.createGroup(payload);
    setSaving(false);

    if (response.status !== "ok") {
      setGroupError(response.error?.message ?? "Не удалось сохранить группу.");
      return;
    }

    const savedGroup = response.data?.group;
    setGroups((current) => groupDraft.groupId
      ? current.map((group) => group.id === savedGroup.id ? savedGroup : group)
      : [...current, savedGroup]);
    setGroupDraft({ channels: ["SDK"], groupId: "", name: "", scope: "" });
    onToast(`${savedGroup.name}: группа сохранена. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  function openInviteModal() {
    if (!canEditEmployeeDirectory) {
      onToast(access.reason);
      return;
    }

    setInviteError("");
    setInviteOpen(true);
  }

  function editGroup(group) {
    setGroupDraft({
      channels: group.channels?.length ? group.channels : ["SDK"],
      groupId: group.id,
      name: group.name,
      scope: group.scope
    });
  }

  function toggleGroupChannel(channelName) {
    setGroupDraft((current) => ({
      ...current,
      channels: current.channels.includes(channelName)
        ? current.channels.filter((channel) => channel !== channelName)
        : [...current.channels, channelName]
    }));
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
            <button className="settings-ghost-action" onClick={() => setGroupsOpen(true)} title="Группы сотрудников и их каналы" type="button">
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
                <span>{employee.role} · {employee.group} · {employee.status}</span>
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
                  <span>{selectedEmployee.role} · {selectedEmployee.lastLogin}</span>
                </div>
                <button
                  disabled={!canResetEmployeePassword}
                  onClick={handlePasswordReset}
                  title={canResetEmployeePassword ? "Отправить сотруднику ссылку для смены пароля" : access.reason}
                  type="button"
                >
                  <KeyRound size={16} />
                  Сбросить пароль
                </button>
                <button
                  disabled={!canResetEmployeePassword}
                  onClick={handleMfaReset}
                  title={canResetEmployeePassword ? "Сбросить второй фактор — сотрудник настроит его заново" : access.reason}
                  type="button"
                >
                  <Smartphone size={16} />
                  Сбросить MFA
                </button>
              </header>
              <div className="employee-editor-body settings-scroll">
                <div className="employee-editor-grid">
                  <label>
                    <span>Роль</span>
                    <select disabled={!canEditEmployeeDirectory} value={selectedEmployee.roleKey} onChange={(event) => patchSelectedEmployee({ roleKey: event.target.value, role: roleName(roles, event.target.value) })} title={canEditEmployeeDirectory ? "Изменить роль" : access.reason}>
                      {roles.map((role) => <option value={role.key} key={role.key}>{role.name}</option>)}
                    </select>
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
                    <strong>{selectedEmployee.passwordStatus}</strong>
                  </div>
                  <div>
                    <span>MFA</span>
                    <strong>{selectedEmployee.mfaStatus}</strong>
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
                      title={canEditEmployeeDirectory ? "Может брать диалоги вне очереди" : access.reason}
                      type="checkbox"
                    />
                    <span>Override очереди</span>
                  </label>
                  <label>
                    <input
                      checked={selectedEmployee.sensitiveData}
                      disabled={!canEditEmployeeDirectory}
                      onChange={(event) => patchSelectedEmployee({ sensitiveData: event.target.checked })}
                      title={canEditEmployeeDirectory ? "Видит телефоны и персональные данные клиентов" : access.reason}
                      type="checkbox"
                    />
                    <span>Чувствительные данные</span>
                  </label>
                </div>
                {error ? <div className="employee-error">{error}</div> : null}
              </div>
              <footer>
                <span>{canEditEmployeeDirectory ? "Изменения сохраняются в backend и попадают в audit." : `${roleMode}: можно смотреть карточку сотрудника${canResetEmployeePassword ? " и сбрасывать пароль/MFA." : "."}`}</span>
                <button
                  disabled={!canEditEmployeeDirectory || saving}
                  onClick={handleSaveEmployee}
                  title={canEditEmployeeDirectory ? "Сохранить сотрудника" : access.reason}
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
            <InlineHint>Сотрудник получит письмо со ссылкой: задаст пароль и сразу попадет в рабочее пространство.</InlineHint>
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
                <FieldHint>Определяет доступы. Можно изменить позже.</FieldHint>
              </label>
              <label>
                <span>Группа</span>
                <select
                  disabled={!canEditEmployeeDirectory}
                  value={inviteDraft.groupId}
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

      {isGroupsOpen ? (
        <SettingsModal
          eyebrow="Сотрудники и роли"
          onClose={() => setGroupsOpen(false)}
          size="wide"
          title="Группы сотрудников"
          titleId="employee-groups-title"
        >
          <InlineHint>Группа объединяет сотрудников по зоне ответственности и набору каналов. Выберите группу, чтобы отредактировать ее.</InlineHint>
          <div className="employee-group-strip" aria-label="Группы сотрудников">
            {groups.map((group) => (
              <button className={groupDraft.groupId === group.id ? "selected" : ""} key={group.id} onClick={() => editGroup(group)} type="button">
                <strong>{group.name}</strong>
                <span>{group.memberIds?.length ?? 0} сотрудников · {group.scope}</span>
              </button>
            ))}
            {!groups.length ? <div className="employee-empty">Групп пока нет — создайте первую ниже.</div> : null}
          </div>
          <form className="employee-group-editor settings-form" onSubmit={handleSaveGroup}>
            <strong>{groupDraft.groupId ? "Редактирование группы" : "Новая группа"}</strong>
            <div className="settings-form-grid">
              <label>
                <span>Группа</span>
                <input disabled={!canEditEmployeeDirectory || saving} placeholder="VIP support" value={groupDraft.name} onChange={(event) => setGroupDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>Область ответственности</span>
                <input disabled={!canEditEmployeeDirectory || saving} placeholder="Ключевые клиенты и эскалации" value={groupDraft.scope} onChange={(event) => setGroupDraft((current) => ({ ...current, scope: event.target.value }))} />
              </label>
            </div>
            <div className="employee-group-channel-picker" aria-label="Каналы группы">
              {supportedChannels.map((channelName) => (
                <label key={channelName}>
                  <input checked={groupDraft.channels.includes(channelName)} disabled={!canEditEmployeeDirectory || saving} onChange={() => toggleGroupChannel(channelName)} type="checkbox" />
                  <ChannelBadge channel={channelName} />
                </label>
              ))}
            </div>
            {groupError ? <div className="settings-form-error" role="alert">{groupError}</div> : null}
            <div className="settings-form-actions">
              {groupDraft.groupId ? (
                <button onClick={() => setGroupDraft({ channels: ["SDK"], groupId: "", name: "", scope: "" })} type="button">
                  Новая группа
                </button>
              ) : null}
              <button className="primary-action" disabled={!canEditEmployeeDirectory || saving} type="submit">
                {groupDraft.groupId ? "Сохранить группу" : "Создать группу"}
              </button>
            </div>
          </form>
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
    mfaStatus: employee.mfaStatus ?? "unknown",
    lastLogin: employee.lastLogin ?? employee.lastActiveAt ?? "Never",
    exceptions: Array.isArray(employee.exceptions) ? employee.exceptions : []
  };
}

function roleName(roles, roleKey) {
  return roles.find((role) => role.key === roleKey)?.name ?? roleKey;
}

function groupName(groups, groupId) {
  return groups.find((group) => group.id === groupId)?.name ?? groupId;
}
