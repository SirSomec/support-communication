import React, { useEffect, useMemo, useState } from "react";
import { PauseCircle, PlayCircle, PlugZap, Plus, RefreshCw, Trash2 } from "lucide-react";
import { ChannelBadge, SectionTitle } from "../../ui.jsx";
import { integrationService } from "../../services/integrationService.js";

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

export function ChannelConnectionsPanel({ access, canEditSettings, focusChannelType = "", focusConnectionId = "", onSummaryChange, onToast }) {
  const [connections, setConnections] = useState([]);
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
  const canMutateConnections = canEditSettings && !error;
  const isTokenManagedType = tokenManagedTypes.has(form.type);
  const [testPayload, setTestPayload] = useState({
    message: "Тестовое сообщение из панели подключений",
    mode: "receive",
    recipient: "+7 999 000-00-00"
  });
  const [testResult, setTestResult] = useState(null);
  const normalizedFocusChannelType = typeof focusChannelType === "string" ? focusChannelType.trim() : "";
  const normalizedFocusConnectionId = typeof focusConnectionId === "string" ? focusConnectionId.trim() : "";

  useEffect(() => {
    loadConnections();
  }, []);

  useEffect(() => {
    if (normalizedFocusChannelType && availableTypes.includes(normalizedFocusChannelType) && selectedType !== normalizedFocusChannelType) {
      setSelectedType(normalizedFocusChannelType);
    }
  }, [availableTypes, normalizedFocusChannelType, selectedType]);

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
    if (normalizedFocusConnectionId) {
      const focusedConnection = connections.find((connection) => connection.id === normalizedFocusConnectionId);
      if (focusedConnection) {
        setSelectedConnectionId(focusedConnection.id);
        setSelectedType(focusedConnection.type);
        return;
      }
    }

    if (normalizedFocusChannelType) {
      const focusedConnection = connections.find((connection) => connection.type === normalizedFocusChannelType);
      if (focusedConnection) {
        setSelectedConnectionId(focusedConnection.id);
      }
    }
  }, [connections, normalizedFocusChannelType, normalizedFocusConnectionId]);

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
      disabled: connections.filter((connection) => connection.status === "disabled").length,
      errors: events.filter((event) => event.severity === "error").length,
      total: connections.length
    };
  }, [connections, events]);

  async function loadConnections() {
    setLoading(true);
    setError("");
    const response = await integrationService.fetchChannelConnections();
    if (response.status === "ok") {
      const nextConnections = response.data.connections ?? [];
      setConnections(nextConnections);
      setAvailableTypes(response.data.availableTypes ?? availableTypes);
      onSummaryChange?.({
        active: nextConnections.filter((connection) => connection.status === "active").length,
        total: nextConnections.length
      });
    } else {
      setError(response.error?.message ?? "Не удалось загрузить подключения.");
      setConnections([]);
      onSummaryChange?.({ active: 0, total: 0 });
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

  async function createConnection(event) {
    event.preventDefault();
    if (!canMutateConnections) {
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setError("Укажите название подключения.");
      return;
    }

    setBusy("create");
    setError("");
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
      setError(response.error?.message ?? "Не удалось создать подключение.");
      return;
    }

    setForm({ ...initialForm, type: form.type });
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

  async function disableConnection(connection) {
    if (!connection || !canMutateConnections) {
      return;
    }

    const confirmed = window.confirm(`Отключить ${connection.name}? Входящие события перестанут приниматься этим инстансом.`);
    if (!confirmed) {
      return;
    }

    setBusy(connection.id);
    setError("");
    const response = await integrationService.deleteChannelConnection({
      connectionId: connection.id,
      reason: "Disabled from settings"
    });
    setBusy("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось отключить подключение.");
      return;
    }

    await loadConnections();
    await loadEvents(connection.id);
    onToast?.(`${connection.name}: подключение отключено. Аудит ${response.data.auditId}.`);
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
    await loadEvents(connection.id);
    onToast?.(`${connection.name}: тест выполнен. Аудит ${response.data.auditId}.`);
  }

  return (
    <section className="work-panel channel-connections-panel">
      <SectionTitle title="Подключения" action={`${totals.total} подключений, ${totals.active} активных`} />

      {error ? <div className="settings-rule-error">{error}</div> : null}

      <div className="channel-type-toolbar">
        <button className={selectedType === "all" ? "selected" : ""} onClick={() => setSelectedType("all")} type="button">
          Все
        </button>
        {availableTypes.map((type) => (
          <button className={selectedType === type ? "selected" : ""} key={type} onClick={() => setSelectedType(type)} type="button">
            {typeLabels[type] ?? type}
          </button>
        ))}
      </div>

      <div className="channel-instance-layout">
        <div className="channel-instance-list">
          {loading ? <div className="channel-log-empty">Загружаем подключения.</div> : null}
          {!loading && !filteredConnections.length ? <div className="channel-log-empty">Подключений по фильтру нет.</div> : null}
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
              <span>{connection.health ?? 0}% · {connection.traffic}</span>
            </button>
          ))}
        </div>

        <form className="channel-create-form" onSubmit={createConnection}>
          <div className="section-title compact-title">
            <h3>Новое подключение</h3>
            <span>несколько инстансов одного канала</span>
          </div>
          <label>
            <span>Тип</span>
            <select disabled={!canMutateConnections || busy === "create"} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {availableTypes.map((type) => <option key={type} value={type}>{typeLabels[type] ?? type}</option>)}
            </select>
          </label>
          <label>
            <span>Название</span>
            <input disabled={!canMutateConnections || busy === "create"} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Telegram VIP" />
          </label>
          <label>
            <span>Среда</span>
            <select disabled={!canMutateConnections || busy === "create"} value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}>
              <option value="production">production</option>
              <option value="sandbox">sandbox</option>
            </select>
          </label>
          <label>
            <span>Очередь</span>
            <input disabled={!canMutateConnections || busy === "create"} value={form.routingQueueId} onChange={(event) => setForm({ ...form, routingQueueId: event.target.value })} />
          </label>
          <label>
            <span>Лимит чатов</span>
            <input disabled={!canMutateConnections || busy === "create"} min="1" type="number" value={form.chatLimit} onChange={(event) => setForm({ ...form, chatLimit: event.target.value })} />
          </label>
          {!isTokenManagedType ? (
            <label>
              <span>Webhook URL</span>
              <input disabled={!canMutateConnections || busy === "create"} value={form.webhookUrl} onChange={(event) => setForm({ ...form, webhookUrl: event.target.value })} />
            </label>
          ) : null}
          <label>
            <span>Секрет или token</span>
            <input disabled={!canMutateConnections || busy === "create"} value={form.credentials} onChange={(event) => setForm({ ...form, credentials: event.target.value })} type="password" />
          </label>
          <button disabled={!canMutateConnections || busy === "create"} title={canMutateConnections ? "Создать подключение" : access.reason} type="submit">
            <Plus size={16} />
            Создать
          </button>
        </form>
      </div>

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
              title={canMutateConnections ? "Проверить подключение" : access.reason}
              type="button"
            >
              <PlayCircle size={16} />
              Проверить
            </button>
          </header>

          <div className="channel-detail-grid">
            <label>
              <span>Название</span>
              <input
                disabled={!canMutateConnections || busy === selectedConnection.id}
                defaultValue={selectedConnection.name}
                onBlur={(event) => updateConnection(selectedConnection, { name: event.target.value, reason: "Connection name changed" })}
              />
            </label>
            <label>
              <span>Маршрутизация</span>
              <input
                disabled={!canMutateConnections || busy === selectedConnection.id}
                defaultValue={selectedConnection.routingQueueId}
                onBlur={(event) => updateConnection(selectedConnection, { routingQueueId: event.target.value, reason: "Routing queue changed" })}
              />
            </label>
            <label>
              <span>Лимит</span>
              <input
                disabled={!canMutateConnections || busy === selectedConnection.id}
                defaultValue={selectedConnection.chatLimit}
                min="1"
                onBlur={(event) => updateConnection(selectedConnection, { chatLimit: Number(event.target.value), reason: "Chat limit changed" })}
                type="number"
              />
            </label>
            <div>
              <span>Секреты</span>
              <strong>{selectedConnection.credentialsMasked ? "замаскированы" : "не заданы"}</strong>
            </div>
          </div>

          <div className="channel-action-row">
            <button disabled={!canMutateConnections || busy === selectedConnection.id} onClick={() => updateConnection(selectedConnection, { status: "active", reason: "Connection resumed" })} type="button">
              <RefreshCw size={16} />
              Возобновить
            </button>
            <button disabled={!canMutateConnections || busy === selectedConnection.id} onClick={() => updateConnection(selectedConnection, { status: "paused", reason: "Connection paused" })} type="button">
              <PauseCircle size={16} />
              Пауза
            </button>
            <button className="danger" disabled={!canMutateConnections || busy === selectedConnection.id} onClick={() => disableConnection(selectedConnection)} type="button">
              <Trash2 size={16} />
              Отключить
            </button>
          </div>

          <div className="channel-test-panel">
            <div className="section-title compact-title">
              <h3>Тест приема/отправки</h3>
              <span>{canMutateConnections ? selectedConnection.id : "только администратор"}</span>
            </div>
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
              <button disabled={!canMutateConnections || busy === `test:${selectedConnection.id}`} onClick={() => runConnectionTest(selectedConnection)} type="button">
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

          <div className="channel-detail-section">
            <div className="channel-log-toolbar">
              <div className="section-title compact-title">
                <h3>Журнал событий</h3>
                <span>{visibleEvents.length} событий</span>
              </div>
              <select value={eventSeverity} onChange={(event) => setEventSeverity(event.target.value)}>
                <option value="all">Все уровни</option>
                <option value="info">Info</option>
                <option value="warn">Warn</option>
                <option value="error">Error</option>
              </select>
              <select value={eventWindow} onChange={(event) => setEventWindow(event.target.value)}>
                <option value="all">Все время</option>
                <option value="24h">24 часа</option>
                <option value="1h">1 час</option>
              </select>
            </div>
            <div className="channel-log-list">
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
        </div>
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
