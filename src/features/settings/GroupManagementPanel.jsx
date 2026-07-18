import React, { useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { ChannelBadge } from "../../ui.jsx";
import { FieldHint, InlineHint, SettingsModal, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { settingsService } from "../../services/settingsService.js";

const emptyDraft = { channels: ["SDK"], groupId: "", memberIds: [], name: "", scope: "" };

// Отдельная вкладка настроек: создание, редактирование, удаление групп и
// управление составом. Сотрудник всегда состоит ровно в одной группе, поэтому
// перенос в группу здесь автоматически убирает его из прежней.
export function GroupManagementPanel({ access, canEditSettings, onSummaryChange, onToast }) {
  const [employees, setEmployees] = useState([]);
  const [groups, setGroups] = useState([]);
  const [supportedChannels, setSupportedChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState("");

  const canEditGroups = canEditSettings && !error;
  const selectedGroup = groups.find((group) => group.id === draft.groupId) ?? null;

  useEffect(() => {
    let ignore = false;

    async function loadGroups() {
      setLoading(true);
      setError("");
      const response = await settingsService.fetchEmployees();

      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить группы.");
        setEmployees([]);
        setGroups([]);
        setSupportedChannels([]);
        setLoading(false);
        return;
      }

      setEmployees(response.data?.employees ?? []);
      setGroups(response.data?.groups ?? []);
      setSupportedChannels(response.data?.supportedChannels ?? []);
      setLoading(false);
    }

    loadGroups();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    onSummaryChange?.({ total: groups.length });
  }, [groups.length, onSummaryChange]);

  const membersByGroup = useMemo(() => {
    const byGroup = new Map();
    for (const employee of employees) {
      const list = byGroup.get(employee.groupId) ?? [];
      list.push(employee);
      byGroup.set(employee.groupId, list);
    }
    return byGroup;
  }, [employees]);

  function editGroup(group) {
    setFormError("");
    setDraft({
      channels: group.channels?.length ? [...group.channels] : ["SDK"],
      groupId: group.id,
      memberIds: (membersByGroup.get(group.id) ?? []).map((employee) => employee.id),
      name: group.name,
      scope: group.scope
    });
  }

  function startNewGroup() {
    setFormError("");
    setDraft({ ...emptyDraft, channels: ["SDK"], memberIds: [] });
  }

  function toggleDraftChannel(channelName) {
    setDraft((current) => ({
      ...current,
      channels: current.channels.includes(channelName)
        ? current.channels.filter((channel) => channel !== channelName)
        : [...current.channels, channelName]
    }));
  }

  function toggleDraftMember(employeeId) {
    setDraft((current) => ({
      ...current,
      memberIds: current.memberIds.includes(employeeId)
        ? current.memberIds.filter((memberId) => memberId !== employeeId)
        : [...current.memberIds, employeeId]
    }));
  }

  async function reloadEmployees() {
    const response = await settingsService.fetchEmployees();
    if (response.status === "ok") {
      setEmployees(response.data?.employees ?? []);
      setGroups(response.data?.groups ?? []);
    }
  }

  async function handleSaveGroup(event) {
    event.preventDefault();
    if (!canEditGroups || saving) {
      return;
    }

    const payload = {
      channels: draft.channels,
      memberIds: draft.memberIds,
      name: draft.name.trim(),
      scope: draft.scope.trim()
    };
    if (!payload.name || !payload.scope) {
      setFormError("Укажите название и зону ответственности группы.");
      return;
    }

    setSaving(true);
    setFormError("");
    const response = draft.groupId
      ? await settingsService.updateGroup({ groupId: draft.groupId, ...payload })
      : await settingsService.createGroup(payload);
    setSaving(false);

    if (response.status !== "ok") {
      setFormError(response.error?.message ?? "Не удалось сохранить группу.");
      return;
    }

    const savedGroup = response.data?.group;
    await reloadEmployees();
    setDraft((current) => ({ ...current, groupId: savedGroup?.id ?? current.groupId }));
    onToast(`${savedGroup?.name ?? payload.name}: группа сохранена. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleDeleteGroup() {
    const groupId = confirmDeleteGroupId;
    const group = groups.find((item) => item.id === groupId);
    setConfirmDeleteGroupId("");
    if (!group || !canEditGroups || saving) {
      return;
    }

    setSaving(true);
    const response = await settingsService.deleteGroup({ groupId, reason: "Deleted from group settings" }).finally(() => setSaving(false));

    if (response.status !== "ok") {
      setFormError(response.error?.message ?? "Не удалось удалить группу.");
      return;
    }

    await reloadEmployees();
    if (draft.groupId === groupId) {
      startNewGroup();
    }
    const movedCount = response.data?.movedEmployeeIds?.length ?? 0;
    const movedNote = movedCount ? ` Сотрудники (${movedCount}) переведены в другую группу.` : "";
    onToast(`${group.name}: группа удалена.${movedNote} Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  return (
    <section className="settings-section group-management-panel">
      <SettingsSectionHeader
        title="Группы"
        meta={loading ? "загрузка" : `${groups.length} групп`}
        hint="Группа объединяет сотрудников по зоне ответственности и каналам. Каждый сотрудник состоит ровно в одной группе."
        actions={
          <button
            className="primary-action settings-create-group"
            disabled={!canEditGroups}
            onClick={startNewGroup}
            title={canEditGroups ? "Создать новую группу" : access.reason}
            type="button"
          >
            <Plus size={16} />
            Новая группа
          </button>
        }
      />

      {error ? <div className="settings-form-error" role="alert">{error}</div> : null}

      <div className="employee-group-strip" aria-label="Группы сотрудников">
        {loading ? <div className="employee-empty">Загрузка групп...</div> : null}
        {!loading && groups.map((group) => (
          <button
            className={draft.groupId === group.id ? "selected" : ""}
            data-group-id={group.id}
            key={group.id}
            onClick={() => editGroup(group)}
            type="button"
          >
            <strong>{group.name}</strong>
            <span>{(membersByGroup.get(group.id) ?? []).length} сотрудников · {group.scope}</span>
          </button>
        ))}
        {!loading && !groups.length ? <div className="employee-empty">Групп пока нет — создайте первую.</div> : null}
      </div>

      <form className="employee-group-editor settings-form" onSubmit={handleSaveGroup}>
        <strong>{draft.groupId ? `Редактирование группы «${selectedGroup?.name ?? draft.name}»` : "Новая группа"}</strong>
        <div className="settings-form-grid">
          <label>
            <span>Название</span>
            <input
              disabled={!canEditGroups || saving}
              placeholder="VIP support"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            <span>Зона ответственности</span>
            <input
              disabled={!canEditGroups || saving}
              placeholder="Ключевые клиенты и эскалации"
              value={draft.scope}
              onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))}
            />
            <FieldHint>Короткое описание, за что отвечает группа.</FieldHint>
          </label>
        </div>

        <div className="employee-group-channel-picker" aria-label="Каналы группы">
          {supportedChannels.map((channelName) => (
            <label key={channelName}>
              <input
                checked={draft.channels.includes(channelName)}
                disabled={!canEditGroups || saving}
                onChange={() => toggleDraftChannel(channelName)}
                type="checkbox"
              />
              <ChannelBadge channel={channelName} />
            </label>
          ))}
        </div>

        <div className="group-member-picker" aria-label="Состав группы">
          <span className="employee-editor-caption">
            <UsersRound size={15} />
            Состав группы — {draft.memberIds.length} сотрудников
          </span>
          <InlineHint>
            Отметьте сотрудников, которые должны состоять в группе. Снятые с отметки сотрудники будут переведены в другую группу.
          </InlineHint>
          <div className="group-member-list settings-scroll">
            {employees.map((employee) => (
              <label key={employee.id}>
                <input
                  checked={draft.memberIds.includes(employee.id)}
                  disabled={!canEditGroups || saving}
                  onChange={() => toggleDraftMember(employee.id)}
                  type="checkbox"
                />
                <span className="group-member-name">{employee.employee ?? employee.name}</span>
                <span className="group-member-meta">{employee.role} · {employee.groupName ?? employee.group}</span>
              </label>
            ))}
            {!employees.length && !loading ? <div className="employee-empty">Сотрудников пока нет.</div> : null}
          </div>
        </div>

        {formError ? <div className="settings-form-error" role="alert">{formError}</div> : null}
        <div className="settings-form-actions">
          {draft.groupId ? (
            <button
              className="settings-danger-action"
              disabled={!canEditGroups || saving}
              onClick={() => setConfirmDeleteGroupId(draft.groupId)}
              title={canEditGroups ? "Удалить группу — сотрудники будут переведены в другую группу" : access.reason}
              type="button"
            >
              <Trash2 size={16} />
              Удалить группу
            </button>
          ) : null}
          <button className="primary-action" disabled={!canEditGroups || saving} type="submit">
            <ShieldCheck size={16} />
            {draft.groupId ? "Сохранить группу" : "Создать группу"}
          </button>
        </div>
      </form>

      {confirmDeleteGroupId ? (
        <SettingsModal
          eyebrow="Группы"
          footer={
            <>
              <button onClick={() => setConfirmDeleteGroupId("")} type="button">Отмена</button>
              <button className="primary-action settings-danger-action" onClick={handleDeleteGroup} type="button">
                <Trash2 size={16} />
                Удалить группу
              </button>
            </>
          }
          onClose={() => setConfirmDeleteGroupId("")}
          title="Удалить группу?"
          titleId="group-delete-title"
        >
          <InlineHint>
            Группа «{groups.find((group) => group.id === confirmDeleteGroupId)?.name ?? confirmDeleteGroupId}» будет удалена.
            Сотрудники из неё автоматически переедут в другую группу. Действие нельзя отменить.
          </InlineHint>
        </SettingsModal>
      ) : null}
    </section>
  );
}
