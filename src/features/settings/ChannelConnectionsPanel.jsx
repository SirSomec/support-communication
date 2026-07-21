import React, { useEffect, useMemo, useRef, useState } from "react";
import { Inbox, ListTree, PauseCircle, PlayCircle, PlugZap, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { ChannelBadge, ConfirmDialog } from "../../ui.jsx";
import { FieldHint, InlineHint, SettingsModal, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { submitSettingsChannelStatusToggle } from "../../app/settingsChannelActions.js";
import { integrationService } from "../../services/integrationService.js";
import { routingService } from "../../services/routingService.js";
import { settingsService } from "../../services/settingsService.js";

const typeLabels = {
  max: "MAX",
  sdk: "SDK",
  telegram: "Telegram",
  vk: "VK"
};

const initialForm = {
  chatLimit: 8,
  credentials: "",
  environment: "production",
  name: "",
  routingQueueId: "queue-support",
  type: "telegram",
  webhookUrl: ""
};

const tokenManagedTypes = new Set(["telegram", "max"]);

const detailTabs = [
  { id: "overview", label: "Параметры" },
  { id: "test", label: "Тест" },
  { id: "log", label: "Журнал" }
];

export function ChannelConnectionsPanel({ access, canEditSettings, focusChannelType = "", focusConnectionId = "", onSummaryChange, onToast }) {
  const [connections, setConnections] = useState([]);
  const [queues, setQueues] = useState([]);
  const [newQueueName, setNewQueueName] = useState("");
  const [newQueueTeamId, setNewQueueTeamId] = useState("");
  const [teams, setTeams] = useState([]);
  const [availableTypes, setAvailableTypes] = useState(["sdk", "telegram", "max", "vk"]);
  const [selectedType, setSelectedType] = useState("all");
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [events, setEvents] = useState([]);
  const [eventSeverity, setEventSeverity] = useState("all");
  const [eventWindow, setEventWindow] = useState("all");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [queueError, setQueueError] = useState("");
  const [detailTab, setDetailTab] = useState("overview");
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isQueueManagerOpen, setQueueManagerOpen] = useState(false);
  const canMutateConnections = canEditSettings && !error;
  const isTokenManagedType = tokenManagedTypes.has(form.type);
  const [testPayload, setTestPayload] = useState({
    message: "Тестовое сообщение из панели подключений",
    mode: "receive",
    recipient: "+7 999 000-00-00"
  });
  const [testResult, setTestResult] = useState(null);
  const [connectionToDelete, setConnectionToDelete] = useState(null);
  const normalizedFocusChannelType = typeof focusChannelType === "string" ? focusChannelType.trim() : "";
  const normalizedFocusConnectionId = typeof focusConnectionId === "string" ? focusConnectionId.trim() : "";
  const focusNavigationKey = [normalizedFocusChannelType, normalizedFocusConnectionId].filter(Boolean).join(":");
  const consumedFocusRef = useRef("");

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    if (queues.length && !queues.some((queue) => queue.id === form.routingQueueId)) {
      setForm((current) => ({ ...current, routingQueueId: queues[0].id }));
    }
  }, [form.routingQueueId, queues]);

  const filteredConnections = useMemo(() => {
    return connections.filter((connection) => selectedType === "all" || connection.type === selectedType);
  }, [connections, selectedType]);

  const selectedConnection = filteredConnections.find((connection) => connection.id === selectedConnectionId) ?? filteredConnections[0] ?? connections[0] ?? null;

  useEffect(() => {
    if (selectedConnection?.id && selectedConnection.id !== selectedConnectionId) {
      setSelectedConnectionId(selectedConnection.id);
    }
  }, [selectedConnection, selectedConnectionId]);

  useEffect(() => {
    if (!focusNavigationKey || consumedFocusRef.current === focusNavigationKey || loading) {
      return;
    }

    if (normalizedFocusConnectionId) {
      const focusedConnection = connections.find((connection) => connection.id === normalizedFocusConnectionId);
      if (focusedConnection) {
        setSelectedConnectionId(focusedConnection.id);
        setSelectedType(focusedConnection.type);
        consumedFocusRef.current = focusNavigationKey;
        return;
      }
    }

    if (normalizedFocusChannelType && availableTypes.includes(normalizedFocusChannelType)) {
      setSelectedType(normalizedFocusChannelType);
      const focusedConnection = connections.find((connection) => connection.type === normalizedFocusChannelType);
      if (focusedConnection) {
        setSelectedConnectionId(focusedConnection.id);
      }
    }
    consumedFocusRef.current = focusNavigationKey;
  }, [availableTypes, connections, focusNavigationKey, loading, normalizedFocusChannelType, normalizedFocusConnectionId]);

  useEffect(() => {
    if (!selectedConnection?.id) {
      setEvents([]);
      return;
    }

    loadEvents(selectedConnection.id);
  }, [selectedConnection?.id]);

  const visibleEvents = useMemo(() => {
    return events
      .filter((event) => eventSeverity === "all" || event.severity === eventSeverity)
      .filter((event) => isInsideWindow(event.time ?? event.createdAt, eventWindow));
  }, [eventSeverity, eventWindow, events]);

  const totals = useMemo(() => {
    return {
      active: connections.filter((connection) => connection.status === "active").length,
      total: connections.length
    };
  }, [connections]);

  // Агрегатный статус по типу канала: быстрый выключатель всего канала
  // без удаления отдельных подключений.
  const channelAggregates = useMemo(() => {
    return availableTypes.map((type) => {
      const typeConnections = connections.filter((connection) => connection.type === type);
      const activeConnections = typeConnections.filter((connection) => connection.status === "active");

      return {
        enabled: activeConnections.length > 0,
        hasConnections: typeConnections.length > 0,
        limit: typeConnections[0]?.chatLimit ?? 5,
        name: typeLabels[type] ?? type,
        staff: activeConnections.length,
        total: typeConnections.length,
        type
      };
    });
  }, [availableTypes, connections]);

  async function loadConnections() {
    setLoading(true);
    setError("");
    const [response, queueResponse, employeeResponse] = await Promise.all([
      integrationService.fetchChannelConnections(),
      routingService.fetchQueues({ status: "active" }),
      settingsService.fetchEmployees()
    ]);
    if (response.status === "ok" && queueResponse.status === "ok" && employeeResponse.status === "ok") {
      const nextConnections = response.data.connections ?? [];
      setQueues(queueResponse.data.queues ?? []);
      setTeams(employeeResponse.data.groups ?? []);
      setConnections(nextConnections);
      setAvailableTypes(response.data.availableTypes ?? availableTypes);
      onSummaryChange?.({
        active: nextConnections.filter((connection) => connection.status === "active").length,
        total: nextConnections.length
      });
    } else {
      setError(response.error?.message ?? "Не удалось загрузить подключения.");
      setConnections([]);
      setQueues([]);
      setTeams([]);
      onSummaryChange?.({ unavailable: true });
    }
    setLoading(false);
  }

  async function loadEvents(connectionId) {
    const response = await integrationService.fetchChannelConnectionEvents(connectionId);
    if (response.status === "ok") {
      setEvents(response.data.events ?? []);
    } else {
      setEvents([]);
    }
  }

  async function toggleChannelAggregate(channel) {
    if (!canMutateConnections || busy || !channel.hasConnections) {
      return;
    }

    const nextEnabled = !channel.enabled;
    setBusy(`aggregate:${channel.type}`);
    setError("");
    const result = await submitSettingsChannelStatusToggle({
      enabled: nextEnabled,
      reason: `Settings aggregate channel ${nextEnabled ? "enabled" : "disabled"}`,
      type: channel.type
    }, integrationService);
    setBusy("");

    if (!result.ok) {
      setError(result.message);
      onToast?.(result.message);
      return;
    }

    await loadConnections();
    onToast?.(`${channel.name}: ${nextEnabled ? "включен" : "отключен"} через backend, audit ${result.auditId}.`);
  }

  async function createQueue() {
    const name = newQueueName.trim();
    if (!name || !canMutateConnections) return;
    setBusy("create-queue");
    setQueueError("");
    const selectedTeam = teams.find((team) => team.id === newQueueTeamId);
    const response = await routingService.createQueue({
      ...(selectedTeam ? { defaultTeamId: selectedTeam.id, memberIds: selectedTeam.memberIds ?? [] } : {}),
      name
    });
    setBusy("");
    if (response.status !== "ok") {
      setQueueError(response.error?.message ?? "Не удалось создать очередь.");
      return;
    }
    setNewQueueName("");
    await loadConnections();
    setForm((current) => ({ ...current, routingQueueId: response.data.queue.id }));
    onToast?.(`${response.data.queue.name}: очередь создана.`);
  }

  async function updateQueueTeam(queue, teamId) {
    const team = teams.find((item) => item.id === teamId);
    setBusy(`queue:${queue.id}`);
    setQueueError("");
    const response = await routingService.updateQueue(queue.id, {
      defaultTeamId: team?.id ?? null,
      memberIds: team?.memberIds ?? []
    });
    setBusy("");
    if (response.status !== "ok") {
      setQueueError(response.error?.message ?? "Не удалось изменить команду очереди.");
      return;
    }
    await loadConnections();
    onToast?.(`${queue.name}: команда очереди изменена.`);
  }

  async function createConnection(event) {
    event.preventDefault();
    if (!canMutateConnections) {
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setFormError("Укажите название подключения.");
      return;
    }

    setBusy("create");
    setFormError("");
    const payload = {
      chatLimit: Number(form.chatLimit),
      credentials: form.credentials.trim() ? { token: form.credentials.trim() } : undefined,
      environment: form.environment,
      name,
      routingQueueId: form.routingQueueId.trim(),
      type: form.type
    };
    if (!isTokenManagedType) {
      payload.webhookUrl = form.webhookUrl.trim();
    }
    const response = await integrationService.createChannelConnection(payload);
    setBusy("");

    if (response.status !== "ok") {
      setFormError(response.error?.message ?? "Не удалось создать подключение.");
      return;
    }

    setForm({ ...initialForm, type: form.type });
    setCreateOpen(false);
    await loadConnections();
    setSelectedConnectionId(response.data.connection.id);
    onToast?.(`${response.data.connection.name}: подключение создано. Аудит ${response.data.auditId}.`);
  }

  async function updateConnection(connection, payload) {
    if (!connection || !canMutateConnections) {
      return;
    }

    setBusy(connection.id);
    setError("");
    const response = await integrationService.updateChannelConnection({
      connectionId: connection.id,
      ...payload
    });
    setBusy("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось изменить подключение.");
      return;
    }

    await loadConnections();
    await loadEvents(connection.id);
    onToast?.(`${response.data.connection.name}: изменения сохранены. Аудит ${response.data.auditId}.`);
  }

  function deleteConnection(connection) {
    if (!connection || !canMutateConnections) {
      return;
    }

    setConnectionToDelete(connection);
  }

  async function confirmDeleteConnection() {
    const connection = connectionToDelete;
    setConnectionToDelete(null);
    if (!connection) {
      return;
    }

    setBusy(connection.id);
    setError("");
    const response = await integrationService.deleteChannelConnection({
      connectionId: connection.id,
      reason: "Deleted from settings"
    });
    setBusy("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось удалить подключение.");
      return;
    }

    await loadConnections();
    onToast?.(`${connection.name}: подключение удалено. Аудит ${response.data.auditId}.`);
  }

  async function runConnectionTest(connection) {
    if (!connection || !canMutateConnections) {
      return;
    }

    setBusy(`test:${connection.id}`);
    setTestResult(null);
    setError("");
    const response = await integrationService.testChannelConnectionInstance({
      connectionId: connection.id,
      message: testPayload.message.trim(),
      mode: testPayload.mode,
      recipient: testPayload.recipient.trim()
    });
    setBusy("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось выполнить тест подключения.");
      return;
    }

    setTestResult(response.data.delivery);
    setDetailTab("test");
    await loadEvents(connection.id);
    onToast?.(`${connection.name}: тест выполнен. Аудит ${response.data.auditId}.`);
  }

  function openCreateModal() {
    if (!canMutateConnections) {
      onToast?.(access.reason);
      return;
    }

    setFormError("");
    setCreateOpen(true);
  }

  return (
    <section className="settings-section channel-connections-panel">
      <SettingsSectionHeader
        title="Подключения"
        meta={loading ? "загрузка" : `${totals.active} из ${totals.total} активны`}
        hint="Каналы, по которым клиенты пишут в поддержку. Новые обращения попадают в выбранную очередь."
        actions={
          <>
            <button className="settings-ghost-action" onClick={() => { setQueueError(""); setQueueManagerOpen(true); }} title="Очереди приема и команды, которые их разбирают" type="button">
              <ListTree size={16} />
              Очереди
            </button>
            <button
              className="primary-action settings-create-connection"
              disabled={!canMutateConnections}
              onClick={openCreateModal}
              title={canMutateConnections ? "Подключить новый канал" : access.reason}
              type="button"
            >
              <Plus size={16} />
              Новое подключение
            </button>
          </>
        }
      />

      {error ? <div className="settings-rule-error">{error}</div> : null}

      <div className="channel-settings" aria-label="Статус каналов">
        {channelAggregates.map((channel) => (
          <article key={channel.type}>
            <button
              aria-label={`Переключить ${channel.name}`}
              aria-pressed={channel.enabled}
              className="toggle-button"
              disabled={!canMutateConnections || Boolean(busy) || !channel.hasConnections}
              onClick={() => void toggleChannelAggregate(channel)}
              title={channel.hasConnections ? `Включить или выключить все подключения ${channel.name}` : "Канал появится здесь после первого подключения."}
              type="button"
            >
              {channel.enabled ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}
            </button>
            <div>
              <ChannelBadge channel={channel.name} />
              <span>{channel.hasConnections ? `${channel.staff} из ${channel.total} активны · лимит ${channel.limit}` : "нет подключений"}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="channel-workspace">
        <aside className="channel-list-pane">
          <div className="channel-type-toolbar" aria-label="Фильтр по типу канала">
            <button className={selectedType === "all" ? "selected" : ""} onClick={() => setSelectedType("all")} type="button">
              Все
            </button>
            {availableTypes.map((type) => (
              <button className={selectedType === type ? "selected" : ""} key={type} onClick={() => setSelectedType(type)} type="button">
                {typeLabels[type] ?? type}
              </button>
            ))}
          </div>
          <div className="channel-instance-list settings-scroll">
            {loading ? <div className="channel-log-empty">Загружаем подключения.</div> : null}
            {!loading && !filteredConnections.length ? (
              <div className="channel-log-empty">
                Подключений по фильтру нет. Нажмите «Новое подключение», чтобы добавить канал.
              </div>
            ) : null}
            {filteredConnections.map((connection) => (
              <button
                aria-pressed={selectedConnection?.id === connection.id}
                className={`connection-row connection-picker ${connection.status} ${selectedConnection?.id === connection.id ? "selected" : ""}`}
                key={connection.id}
                onClick={() => setSelectedConnectionId(connection.id)}
                type="button"
              >
                <div>
                  <strong>{connection.name}</strong>
                  <span>{connection.environment} · {connection.routingQueueId}</span>
                </div>
                <ChannelBadge channel={typeLabels[connection.type] ?? connection.type} />
                <b>{connection.status}</b>
              </button>
            ))}
          </div>
        </aside>

        <div className="channel-detail-pane">
          {selectedConnection ? (
            <div className="channel-detail-surface">
              <header className="channel-detail-head">
                <div>
                  <ChannelBadge channel={typeLabels[selectedConnection.type] ?? selectedConnection.type} />
                  <strong>{selectedConnection.name}</strong>
                  <span>{selectedConnection.status} · синхронизация {formatDate(selectedConnection.lastSyncAt)}</span>
                </div>
                <button
                  disabled={!canMutateConnections || busy === `test:${selectedConnection.id}`}
                  onClick={() => runConnectionTest(selectedConnection)}
                  title={canMutateConnections ? "Отправить тестовое сообщение и проверить связь" : access.reason}
                  type="button"
                >
                  <PlayCircle size={16} />
                  Проверить
                </button>
              </header>

              <div className="channel-detail-tabs" role="tablist" aria-label="Разделы подключения">
                {detailTabs.map((tab) => (
                  <button
                    aria-selected={detailTab === tab.id}
                    className={detailTab === tab.id ? "active" : ""}
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    role="tab"
                    type="button"
                  >
                    {tab.label}
                    {tab.id === "log" ? <em>{visibleEvents.length}</em> : null}
                  </button>
                ))}
              </div>

              {detailTab === "overview" ? (
                <div className="channel-detail-body settings-scroll">
                  <div className="channel-detail-grid">
                    <label>
                      <span>Название</span>
                      <input
                        disabled={!canMutateConnections || busy === selectedConnection.id}
                        defaultValue={selectedConnection.name}
                        key={`name-${selectedConnection.id}`}
                        onBlur={(event) => event.target.value !== selectedConnection.name && updateConnection(selectedConnection, { name: event.target.value, reason: "Connection name changed" })}
                      />
                      <FieldHint>Сохраняется при выходе из поля.</FieldHint>
                    </label>
                    <label>
                      <span>Очередь приема</span>
                      <select
                        disabled={!canMutateConnections || busy === selectedConnection.id}
                        value={selectedConnection.routingQueueId}
                        onChange={(event) => updateConnection(selectedConnection, { routingQueueId: event.target.value, reason: "Routing queue changed" })}
                      >
                        {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                      </select>
                      <FieldHint>Куда попадают новые обращения канала.</FieldHint>
                    </label>
                    <label>
                      <span>Лимит чатов</span>
                      <input
                        disabled={!canMutateConnections || busy === selectedConnection.id}
                        defaultValue={selectedConnection.chatLimit}
                        key={`limit-${selectedConnection.id}`}
                        min="1"
                        onBlur={(event) => Number(event.target.value) !== Number(selectedConnection.chatLimit) && updateConnection(selectedConnection, { chatLimit: Number(event.target.value), reason: "Chat limit changed" })}
                        type="number"
                      />
                      <FieldHint>Одновременных диалогов на оператора.</FieldHint>
                    </label>
                    <div>
                      <span>Секреты</span>
                      <strong>{selectedConnection.credentialsMasked ? "замаскированы" : "не заданы"}</strong>
                      <FieldHint>Токены хранятся в backend и не показываются.</FieldHint>
                    </div>
                  </div>

                  <div className="channel-action-row">
                    <button disabled={!canMutateConnections || busy === selectedConnection.id} onClick={() => updateConnection(selectedConnection, { status: "active", reason: "Connection resumed" })} title="Возобновить прием сообщений" type="button">
                      <RefreshCw size={16} />
                      Возобновить
                    </button>
                    <button disabled={!canMutateConnections || busy === selectedConnection.id} onClick={() => updateConnection(selectedConnection, { status: "paused", reason: "Connection paused" })} title="Приостановить прием без удаления" type="button">
                      <PauseCircle size={16} />
                      Пауза
                    </button>
                    <button className="danger" disabled={!canMutateConnections || busy === selectedConnection.id} onClick={() => deleteConnection(selectedConnection)} title="Навсегда удалить настройки и секреты этого подключения" type="button">
                      <Trash2 size={16} />
                      Удалить
                    </button>
                  </div>
                </div>
              ) : null}

              {detailTab === "test" ? (
                <div className="channel-test-panel settings-scroll">
                  <InlineHint>Проверка не затрагивает клиентов: сообщение проходит через тестовый стенд и попадает в журнал.</InlineHint>
                  <div className="channel-test-grid">
                    <label>
                      <span>Направление</span>
                      <select disabled={!canMutateConnections} value={testPayload.mode} onChange={(event) => setTestPayload({ ...testPayload, mode: event.target.value })}>
                        <option value="receive">Прием</option>
                        <option value="send">Отправка</option>
                      </select>
                    </label>
                    <label>
                      <span>Адресат</span>
                      <input disabled={!canMutateConnections} value={testPayload.recipient} onChange={(event) => setTestPayload({ ...testPayload, recipient: event.target.value })} />
                    </label>
                    <label className="channel-test-message">
                      <span>Сообщение</span>
                      <textarea disabled={!canMutateConnections} value={testPayload.message} onChange={(event) => setTestPayload({ ...testPayload, message: event.target.value })} />
                    </label>
                    <button disabled={!canMutateConnections || busy === `test:${selectedConnection.id}`} onClick={() => runConnectionTest(selectedConnection)} title={canMutateConnections ? "Запустить тест подключения" : access.reason} type="button">
                      <PlugZap size={16} />
                      Запустить
                    </button>
                  </div>
                  {testResult ? (
                    <div className="channel-test-result success">
                      <strong>{testResult.status}</strong>
                      <code>{JSON.stringify(testResult, null, 2)}</code>
                    </div>
                  ) : (
                    <div className="channel-test-empty">Результат теста появится после запуска.</div>
                  )}
                </div>
              ) : null}

              {detailTab === "log" ? (
                <div className="channel-log-panel">
                  <div className="channel-log-toolbar">
                    <select aria-label="Фильтр по уровню" value={eventSeverity} onChange={(event) => setEventSeverity(event.target.value)}>
                      <option value="all">Все уровни</option>
                      <option value="info">Info</option>
                      <option value="warn">Warn</option>
                      <option value="error">Error</option>
                    </select>
                    <select aria-label="Фильтр по времени" value={eventWindow} onChange={(event) => setEventWindow(event.target.value)}>
                      <option value="all">Все время</option>
                      <option value="24h">24 часа</option>
                      <option value="1h">1 час</option>
                    </select>
                  </div>
                  <div className="channel-log-list settings-scroll">
                    {visibleEvents.map((event) => (
                      <div className={`channel-log-row ${event.severity}`} key={event.id}>
                        <time>{formatDate(event.time ?? event.createdAt)}</time>
                        <b>{event.severity}</b>
                        <span>{event.type ?? event.action}</span>
                        <strong>{event.message}</strong>
                        <code>{event.traceId}</code>
                      </div>
                    ))}
                    {!visibleEvents.length ? <div className="channel-log-empty">По выбранным фильтрам событий нет.</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="settings-empty-state">
              <Inbox size={22} />
              <strong>{loading ? "Загружаем подключения" : "Каналы пока не настроены"}</strong>
              <span>{loading ? "Получаем список подключений из backend." : "Подключите Telegram, MAX, VK или SDK — и обращения клиентов появятся в диалогах."}</span>
              {!loading ? (
                <button className="primary-action" disabled={!canMutateConnections} onClick={openCreateModal} type="button">
                  <Plus size={16} />
                  Новое подключение
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {isCreateOpen ? (
        <SettingsModal
          eyebrow="Подключения"
          footer={
            <>
              <button onClick={() => setCreateOpen(false)} type="button">Отмена</button>
              <button
                className="primary-action"
                disabled={!canMutateConnections || busy === "create" || !form.routingQueueId}
                form="channel-create-form"
                title={canMutateConnections ? "Создать подключение" : access.reason}
                type="submit"
              >
                <Plus size={16} />
                Создать
              </button>
            </>
          }
          onClose={() => setCreateOpen(false)}
          title="Новое подключение"
          titleId="channel-create-title"
        >
          <form className="channel-create-form settings-form" id="channel-create-form" onSubmit={createConnection}>
            <InlineHint>Один канал может иметь несколько подключений — например, отдельные боты для VIP и общей линии.</InlineHint>
            <div className="settings-form-grid">
              <label>
                <span>Тип</span>
                <select disabled={busy === "create"} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
                  {availableTypes.map((type) => <option key={type} value={type}>{typeLabels[type] ?? type}</option>)}
                </select>
                <FieldHint>Мессенджер или SDK виджет в приложении.</FieldHint>
              </label>
              <label>
                <span>Название</span>
                <input disabled={busy === "create"} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Telegram VIP" />
                <FieldHint>Видно операторам в списке и отчетах.</FieldHint>
              </label>
              <label>
                <span>Среда</span>
                <select disabled={busy === "create"} value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}>
                  <option value="production">production</option>
                  <option value="sandbox">sandbox</option>
                </select>
                <FieldHint>Sandbox — для проверки без клиентов.</FieldHint>
              </label>
              <label>
                <span>Очередь</span>
                <select disabled={busy === "create" || !queues.length} value={form.routingQueueId} onChange={(event) => setForm({ ...form, routingQueueId: event.target.value })}>
                  {!queues.length ? <option value="">Нет доступных очередей</option> : null}
                  {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                </select>
                <FieldHint>Куда направлять новые обращения.</FieldHint>
              </label>
              <label>
                <span>Лимит чатов</span>
                <input disabled={busy === "create"} min="1" type="number" value={form.chatLimit} onChange={(event) => setForm({ ...form, chatLimit: event.target.value })} />
                <FieldHint>Одновременных диалогов на оператора.</FieldHint>
              </label>
              {!isTokenManagedType ? (
                <label>
                  <span>Webhook URL</span>
                  <input disabled={busy === "create"} value={form.webhookUrl} onChange={(event) => setForm({ ...form, webhookUrl: event.target.value })} placeholder="https://example.com/webhook" />
                  <FieldHint>Адрес, куда канал доставляет события.</FieldHint>
                </label>
              ) : null}
              <label>
                <span>Секрет или token</span>
                <input disabled={busy === "create"} value={form.credentials} onChange={(event) => setForm({ ...form, credentials: event.target.value })} type="password" />
                <FieldHint>{form.type === "telegram" ? "Токен бота из @BotFather." : "Ключ доступа канала. Хранится только в backend."}</FieldHint>
              </label>
            </div>
            {formError ? <div className="settings-form-error" role="alert">{formError}</div> : null}
          </form>
        </SettingsModal>
      ) : null}

      {isQueueManagerOpen ? (
        <SettingsModal
          eyebrow="Подключения"
          onClose={() => setQueueManagerOpen(false)}
          size="wide"
          title="Очереди приема"
          titleId="queue-manager-title"
        >
          <div className="queue-manager">
            <InlineHint>Очередь определяет, какая команда разбирает обращения. Подключение всегда направляет сообщения в одну очередь.</InlineHint>
            {queueError ? <div className="settings-form-error" role="alert">{queueError}</div> : null}
            <div className="queue-manager-list settings-scroll" aria-label="Список очередей">
              {queues.map((queue) => (
                <div className="connection-row queue-row" key={queue.id}>
                  <div>
                    <strong>{queue.name}</strong>
                    <span>{queue.memberCounts?.queue ?? 0} участников</span>
                  </div>
                  <select
                    aria-label={`Команда очереди ${queue.name}`}
                    disabled={!canMutateConnections || busy === `queue:${queue.id}`}
                    onChange={(event) => updateQueueTeam(queue, event.target.value)}
                    value={queue.defaultTeamId ?? ""}
                  >
                    <option value="">Без команды</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </div>
              ))}
              {!queues.length ? <div className="channel-log-empty">Очередей пока нет — создайте первую ниже.</div> : null}
            </div>
            <div className="queue-manager-create" aria-label="Создание очереди">
              <label>
                <span>Новая очередь</span>
                <input
                  aria-label="Название новой очереди"
                  disabled={!canMutateConnections || busy === "create-queue"}
                  onChange={(event) => setNewQueueName(event.target.value)}
                  placeholder="Например, VIP поддержка"
                  value={newQueueName}
                />
              </label>
              <label>
                <span>Команда</span>
                <select aria-label="Команда новой очереди" disabled={!canMutateConnections || busy === "create-queue"} onChange={(event) => setNewQueueTeamId(event.target.value)} value={newQueueTeamId}>
                  <option value="">Без команды</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
              <button disabled={!newQueueName.trim() || !canMutateConnections || busy === "create-queue"} onClick={createQueue} type="button">
                <Plus size={16} /> Создать очередь
              </button>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {connectionToDelete ? (
        <ConfirmDialog
          confirmLabel="Удалить"
          danger
          description={`Удалить ${connectionToDelete.name} навсегда? Секреты и настройки канала будут стёрты. История диалогов сохранится, но будет отвязана от канала.`}
          eyebrow="Подключение канала"
          onCancel={() => setConnectionToDelete(null)}
          onConfirm={confirmDeleteConnection}
          title="Удалить подключение?"
        />
      ) : null}
    </section>
  );
}

function formatDate(value) {
  if (!value) {
    return "нет данных";
  }

  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function isInsideWindow(value, windowKey) {
  if (windowKey === "all" || !value) {
    return true;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return true;
  }

  const ageMs = Date.now() - timestamp;
  return windowKey === "1h" ? ageMs <= 60 * 60 * 1000 : ageMs <= 24 * 60 * 60 * 1000;
}
