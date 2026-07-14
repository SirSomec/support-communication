import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, ShieldCheck, Tag, ToggleLeft, ToggleRight } from "lucide-react";
import { ChannelList, SegmentedControl, ToolbarSearch } from "../../ui.jsx";
import { FieldHint, InlineHint, SettingsModal, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { settingsService } from "../../services/settingsService.js";

const topicStatusFilters = ["Все", "Активные", "Архив"];
const channelOptions = ["SDK", "Telegram", "MAX", "VK"];

export function TopicDirectoryPanel({ access, canEditSettings, onToast, onTopicOptionsChange, roleMode }) {
  const [topicDirectory, setTopicDirectory] = useState([]);
  const [topicTotals, setTopicTotals] = useState({ active: 0, archived: 0, total: 0 });
  const [topicQuery, setTopicQuery] = useState("");
  const [topicStatusFilter, setTopicStatusFilter] = useState("Все");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [isEditorOpen, setEditorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const canMutateTopics = canEditSettings && !error;

  const normalizedTopicQuery = topicQuery.trim().toLowerCase();

  useEffect(() => {
    let ignore = false;

    async function loadTopics() {
      setLoading(true);
      setError("");
      const response = await settingsService.fetchTopics();

      if (ignore) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить справочник тематик.");
        setTopicDirectory([]);
        setTopicTotals({ active: 0, archived: 0, total: 0 });
        setLoading(false);
        return;
      }

      applyTopicResponse(response.data);
      setLoading(false);
    }

    loadTopics();
    return () => {
      ignore = true;
    };
  }, []);

  const visibleTopicDirectory = useMemo(() => {
    function statusMatches(topic) {
      if (topicStatusFilter === "Активные") {
        return !topic.archived;
      }
      if (topicStatusFilter === "Архив") {
        return topic.archived;
      }
      return true;
    }

    return topicDirectory.map((group) => {
      const branches = group.branches.map((branch) => {
        const branchMatches = [group.name, group.owner, group.description, branch.name].join(" ").toLowerCase().includes(normalizedTopicQuery);
        const children = branch.children.filter((topic) => {
          const haystack = [
            group.name,
            group.owner,
            group.description,
            branch.name,
            topic.name,
            topic.routingTarget ?? topic.routing,
            topic.accessScope ?? topic.access,
            ...topic.channels
          ].join(" ").toLowerCase();
          return statusMatches(topic) && (!normalizedTopicQuery || branchMatches || haystack.includes(normalizedTopicQuery));
        });
        return { ...branch, children };
      }).filter((branch) => branch.children.length > 0);

      return branches.length ? { ...group, branches } : null;
    }).filter(Boolean);
  }, [normalizedTopicQuery, topicDirectory, topicStatusFilter]);

  function applyTopicResponse(data = {}) {
    const nextDirectory = Array.isArray(data.directory) ? data.directory : [];
    const nextTopics = Array.isArray(data.topics) ? data.topics.map(normalizeTopic) : flattenDirectory(nextDirectory);
    setTopicDirectory(nextDirectory);
    setTopicTotals(data.totals ?? countTopics(nextTopics));
    if (Array.isArray(data.activeOptions)) {
      onTopicOptionsChange?.(data.activeOptions);
    }
    setSelectedTopicId((current) => current && nextTopics.some((topic) => topic.id === current) ? current : "");
  }

  function handleNewTopic() {
    if (!canMutateTopics) {
      onToast(access.reason);
      return;
    }

    setSelectedTopicId("");
    setDraft(emptyDraft());
    setEditorOpen(true);
  }

  function handleTopicEdit(topic) {
    if (!canMutateTopics) {
      onToast(access.reason);
      return;
    }

    setSelectedTopicId(topic.id);
    setDraft({
      accessScope: topic.accessScope ?? topic.access ?? "admins",
      branchName: topic.branchName,
      channels: topic.channels,
      groupName: topic.groupName,
      name: topic.name,
      required: Boolean(topic.required),
      routingTarget: topic.routingTarget ?? topic.routing ?? "Line 1"
    });
    setEditorOpen(true);
  }

  async function handleTopicArchive(topic) {
    if (!canMutateTopics) {
      return;
    }

    const response = topic.archived
      ? await settingsService.restoreTopic({ topicId: topic.id, reason: "Restored from topic directory" })
      : await settingsService.archiveTopic({ topicId: topic.id, reason: "Archived from topic directory" });

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось изменить статус тематики.");
      return;
    }

    await refreshTopics();
    onToast(`${topic.groupName} / ${topic.name}: ${response.data?.topic?.archived ? "перемещена в архив" : "восстановлена"}. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function handleSaveTopic(event) {
    event.preventDefault();
    if (!canMutateTopics) {
      return;
    }

    setSaving(true);
    setError("");
    const payload = {
      ...draft,
      channels: draft.channels.length ? draft.channels : ["SDK"]
    };
    const response = selectedTopicId
      ? await settingsService.updateTopic({ topicId: selectedTopicId, ...payload })
      : await settingsService.createTopic(payload);
    setSaving(false);

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось сохранить тематику.");
      return;
    }

    setEditorOpen(false);
    await refreshTopics(response.data?.topic?.id);
    onToast(`${response.data?.topic?.groupName} / ${response.data?.topic?.name}: сохранено. Audit ${response.data?.auditEvent?.id ?? response.traceId}`);
  }

  async function refreshTopics(preferredTopicId = selectedTopicId) {
    const response = await settingsService.fetchTopics();
    if (response.status === "ok") {
      applyTopicResponse(response.data);
      if (preferredTopicId) {
        setSelectedTopicId(preferredTopicId);
      }
    }
  }

  function toggleDraftChannel(channelName) {
    setDraft((current) => ({
      ...current,
      channels: current.channels.includes(channelName)
        ? current.channels.filter((channel) => channel !== channelName)
        : [...current.channels, channelName]
    }));
  }

  return (
    <section className="settings-section topic-directory-panel">
      <SettingsSectionHeader
        title="Справочник тематик"
        meta={loading ? "загрузка" : `${topicTotals.active} активных / ${topicTotals.archived} архив`}
        hint="Тематики классифицируют обращения, управляют маршрутизацией и обязательны при закрытии диалога."
        actions={
          <button
            className="primary-action topic-add-button"
            disabled={!canMutateTopics}
            onClick={handleNewTopic}
            title={canMutateTopics ? "Создать тематику" : access.reason}
            type="button"
          >
            <Plus size={16} />
            Добавить тематику
          </button>
        }
      />

      <div className="settings-card topic-directory-card">
      <div className="topic-directory-toolbar">
        <ToolbarSearch
          ariaLabel="Поиск по справочнику тематик"
          className="topic-search"
          iconSize={17}
          placeholder="Поиск по теме, каналу, владельцу"
          value={topicQuery}
          onChange={setTopicQuery}
        />
        <SegmentedControl
          ariaLabel="Статус тематики"
          className="topic-filter"
          options={topicStatusFilters}
          value={topicStatusFilter}
          onChange={setTopicStatusFilter}
        />
      </div>

      {!canMutateTopics && !loading ? (
        <div className="topic-rights-note">
          <ShieldCheck size={17} />
          <span>{error ? "Справочник доступен только на чтение до восстановления backend." : `${roleMode}: просмотр справочника без изменения общих настроек.`}</span>
        </div>
      ) : null}
      {error ? <div className="settings-rule-error">{error}</div> : null}

      <div className="topic-tree-list settings-scroll">
        {loading ? (
          <div className="topic-empty">
            <Search size={18} />
            <strong>Загрузка тематик</strong>
            <span>Получаем актуальный справочник из backend.</span>
          </div>
        ) : null}
        {!loading && visibleTopicDirectory.map((group) => (
          <article className="topic-group" key={group.id}>
            <header>
              <div>
                <strong>{group.name}</strong>
                <span>{group.description}</span>
              </div>
              <div className="topic-group-meta">
                <span>{group.owner}</span>
                <b>{group.branches.reduce((sum, branch) => sum + branch.children.length, 0)} тем</b>
              </div>
            </header>
            {group.branches.map((branch) => (
              <div className="topic-branch" key={branch.id}>
                <div className="topic-branch-title">
                  <span>{branch.name}</span>
                  <small>{branch.children.length} видимых</small>
                </div>
                <div className="topic-row-list">
                  {branch.children.map((topic) => (
                    <div className={`topic-row ${topic.archived ? "archived" : ""}`} data-topic-id={topic.id} key={topic.id}>
                      <div className="topic-path">
                        <Tag size={16} />
                        <div>
                          <strong>{topic.name}</strong>
                          <span>{topic.groupName} / {topic.branchName} / {topic.name}</span>
                        </div>
                      </div>
                      <ChannelList channels={topic.channels} />
                      <div className="topic-state">
                        <span className={topic.archived ? "archived" : "active"}>{topic.archived ? "Архив" : "Активна"}</span>
                        <small>{topic.required ? "обязательная" : "необязательная"}</small>
                      </div>
                      <div className="topic-routing">
                        <strong>{topic.routingTarget ?? topic.routing}</strong>
                        <span>{topic.accessScope ?? topic.access}</span>
                      </div>
                      <div className="topic-actions">
                        <button
                          aria-label={`Редактировать: ${topic.groupName} / ${topic.name}`}
                          data-topic-action="edit"
                          disabled={!canMutateTopics}
                          onClick={() => handleTopicEdit(normalizeTopic(topic))}
                          title={canMutateTopics ? "Редактировать тематику" : access.reason}
                          type="button"
                        >
                          <Pencil size={15} />
                          Редактировать
                        </button>
                        <button
                          aria-label={`${topic.archived ? "Вернуть" : "В архив"}: ${topic.groupName} / ${topic.name}`}
                          aria-pressed={topic.archived}
                          data-topic-action="archive"
                          disabled={!canMutateTopics}
                          onClick={() => handleTopicArchive(normalizeTopic(topic))}
                          title={canMutateTopics ? (topic.archived ? "Вернуть тематику из архива" : "Скрыть тематику из выбора, история сохранится") : access.reason}
                          type="button"
                        >
                          {topic.archived ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                          {topic.archived ? "Вернуть" : "В архив"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </article>
        ))}
        {!loading && !visibleTopicDirectory.length && (
          <div className="topic-empty">
            <Search size={18} />
            <strong>Тематики не найдены</strong>
            <span>Измените запрос или фильтр статуса — либо добавьте новую тематику.</span>
          </div>
        )}
      </div>
      </div>

      {isEditorOpen ? (
        <SettingsModal
          eyebrow="Справочник тематик"
          footer={
            <>
              <button onClick={() => setEditorOpen(false)} type="button">Отмена</button>
              <button className="primary-action" disabled={!canMutateTopics || saving} form="topic-editor-form" type="submit">
                Сохранить тематику
              </button>
            </>
          }
          onClose={() => setEditorOpen(false)}
          title={selectedTopicId ? "Редактирование тематики" : "Новая тематика"}
          titleId="topic-editor-title"
        >
          <form className="topic-editor-form settings-form" id="topic-editor-form" onSubmit={handleSaveTopic}>
            <InlineHint>Справочник используется при закрытии диалогов, в отчетах и маршрутизации — изменения применяются сразу.</InlineHint>
            <div className="settings-form-grid">
              <label>
                <span>Группа</span>
                <input disabled={!canMutateTopics} placeholder="Оплата" value={draft.groupName} onChange={(event) => setDraft((current) => ({ ...current, groupName: event.target.value }))} />
                <FieldHint>Верхний уровень дерева тематик.</FieldHint>
              </label>
              <label>
                <span>Ветка</span>
                <input disabled={!canMutateTopics} placeholder="Возвраты" value={draft.branchName} onChange={(event) => setDraft((current) => ({ ...current, branchName: event.target.value }))} />
                <FieldHint>Подраздел внутри группы.</FieldHint>
              </label>
              <label>
                <span>Тема</span>
                <input disabled={!canMutateTopics} placeholder="Возврат за отмененный заказ" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label>
                <span>Маршрутизация</span>
                <input disabled={!canMutateTopics} placeholder="Line 1" value={draft.routingTarget} onChange={(event) => setDraft((current) => ({ ...current, routingTarget: event.target.value }))} />
                <FieldHint>Очередь или линия, куда попадает обращение.</FieldHint>
              </label>
              <label>
                <span>Доступ</span>
                <select disabled={!canMutateTopics} value={draft.accessScope} onChange={(event) => setDraft((current) => ({ ...current, accessScope: event.target.value }))}>
                  <option value="admins">Администраторы</option>
                  <option value="senior">Старшие сотрудники</option>
                  <option value="all">Все сотрудники</option>
                </select>
                <FieldHint>Кто может выбирать тематику в диалоге.</FieldHint>
              </label>
            </div>
            <label className="topic-required-toggle">
              <input disabled={!canMutateTopics} checked={draft.required} type="checkbox" onChange={(event) => setDraft((current) => ({ ...current, required: event.target.checked }))} />
              <span>Обязательная для закрытия диалога</span>
            </label>
            <div className="topic-channel-picker" aria-label="Каналы тематики">
              <span>Каналы</span>
              {channelOptions.map((channel) => (
                <label key={channel}>
                  <input disabled={!canMutateTopics} checked={draft.channels.includes(channel)} type="checkbox" onChange={() => toggleDraftChannel(channel)} />
                  <span>{channel}</span>
                </label>
              ))}
            </div>
            {error ? <div className="topic-error">{error}</div> : null}
          </form>
        </SettingsModal>
      ) : null}
    </section>
  );
}

function emptyDraft() {
  return {
    accessScope: "admins",
    branchName: "",
    channels: ["SDK"],
    groupName: "",
    name: "",
    required: true,
    routingTarget: "Line 1"
  };
}

function flattenDirectory(directory) {
  return directory.flatMap((group) => group.branches.flatMap((branch) => branch.children.map((topic) => normalizeTopic({
    ...topic,
    branchName: branch.name,
    groupName: group.name
  }))));
}

function normalizeTopic(topic) {
  return {
    id: topic.id,
    accessScope: topic.accessScope ?? topic.access ?? "admins",
    archived: Boolean(topic.archived),
    branchName: topic.branchName ?? "",
    channels: Array.isArray(topic.channels) ? topic.channels : ["SDK"],
    groupName: topic.groupName ?? "",
    name: topic.name ?? "",
    required: Boolean(topic.required),
    routingTarget: topic.routingTarget ?? topic.routing ?? "Line 1"
  };
}

function countTopics(items) {
  return items.reduce((totals, topic) => {
    totals.total += 1;
    if (topic.archived) {
      totals.archived += 1;
    } else {
      totals.active += 1;
    }
    return totals;
  }, { active: 0, archived: 0, total: 0 });
}
