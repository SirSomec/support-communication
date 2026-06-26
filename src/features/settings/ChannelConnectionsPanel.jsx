import React, { useMemo, useState } from "react";
import { PlayCircle } from "lucide-react";
import { ChannelBadge, SectionTitle } from "../../ui.jsx";
import { channelDetails } from "../../data.js";

export function ChannelConnectionsPanel({ access, canEditSettings, onToast }) {
  const [selectedChannelId, setSelectedChannelId] = useState(channelDetails[0].id);
  const [channelLogSeverity, setChannelLogSeverity] = useState("all");
  const [channelLogConnection, setChannelLogConnection] = useState("all");
  const [channelTestMode, setChannelTestMode] = useState("receive");
  const [channelTestRecipient, setChannelTestRecipient] = useState("+7 999 000-00-00");
  const [channelTestMessage, setChannelTestMessage] = useState("Тестовое сообщение из панели канала");
  const [channelTestResult, setChannelTestResult] = useState(null);
  const selectedChannel = channelDetails.find((channel) => channel.id === selectedChannelId) ?? channelDetails[0];

  const visibleChannelLogs = useMemo(() => {
    return selectedChannel.logs.filter((log) => {
      const severityMatches = channelLogSeverity === "all" || log.severity === channelLogSeverity;
      const connectionMatches = channelLogConnection === "all" || log.connectionId === channelLogConnection;
      return severityMatches && connectionMatches;
    });
  }, [channelLogConnection, channelLogSeverity, selectedChannel]);

  function handleChannelSelect(channelId) {
    setSelectedChannelId(channelId);
    setChannelLogSeverity("all");
    setChannelLogConnection("all");
    setChannelTestResult(null);
  }

  function handleChannelTest() {
    if (!canEditSettings) {
      return;
    }

    const message = channelTestMessage.trim();
    const recipient = channelTestRecipient.trim();
    if (!recipient || !message) {
      setChannelTestResult({
        tone: "error",
        title: "Заполните адресата и сообщение",
        raw: "{ \"ok\": false, \"error\": \"recipient_and_message_required\" }"
      });
      return;
    }

    const raw = {
      ok: true,
      channel: selectedChannel.channel,
      direction: channelTestMode,
      connection: selectedChannel.connections[0].rawId,
      recipient,
      requestId: `test_${selectedChannel.id}_${Date.now().toString().slice(-5)}`,
      status: channelTestMode === "receive" ? "accepted_to_queue" : "sent_to_channel"
    };
    setChannelTestResult({
      tone: "success",
      title: channelTestMode === "receive" ? "Входящее тестовое сообщение принято" : "Исходящее тестовое сообщение отправлено",
      raw: JSON.stringify(raw, null, 2)
    });
    onToast(`${selectedChannel.channel}: тест ${channelTestMode === "receive" ? "приема" : "отправки"} выполнен.`);
  }

  return (
    <section className="work-panel channel-connections-panel">
      <SectionTitle title="Подключения" action={`${selectedChannel.channel}: детализация канала`} />
      <div className="integration-cards channel-card-list">
        {channelDetails.map((integration) => (
          <button
            aria-pressed={selectedChannelId === integration.id}
            className={`integration-card channel-card ${selectedChannelId === integration.id ? "selected" : ""}`}
            data-channel-card={integration.id}
            key={integration.id}
            onClick={() => handleChannelSelect(integration.id)}
            type="button"
          >
            <header>
              <ChannelBadge channel={integration.channel} />
              <strong>{integration.name}</strong>
              <span>{integration.status}</span>
            </header>
            <p>{integration.detail}</p>
            <div className="health-bar"><i style={{ width: `${integration.health}%` }} /></div>
            <footer>
              <span>{integration.health}% health</span>
              <b>{integration.connections.length} подключения</b>
            </footer>
          </button>
        ))}
      </div>
      <div className="channel-detail-surface">
        <header className="channel-detail-head">
          <div>
            <ChannelBadge channel={selectedChannel.channel} />
            <strong>{selectedChannel.name}</strong>
            <span>{selectedChannel.status} · синхронизация {selectedChannel.lastSync}</span>
          </div>
          <button
            disabled={!canEditSettings}
            onClick={() => onToast(`${selectedChannel.name}: проверка подключения запущена.`)}
            title={canEditSettings ? "Проверить канал" : access.reason}
            type="button"
          >
            <PlayCircle size={16} />
            Проверить канал
          </button>
        </header>
        <div className="channel-detail-grid">
          <div>
            <span>Raw ID</span>
            <strong>{selectedChannel.rawId}</strong>
          </div>
          <div>
            <span>Маршрутизация</span>
            <strong>{selectedChannel.route}</strong>
          </div>
          <div>
            <span>Лимит</span>
            <strong>{selectedChannel.limit}</strong>
          </div>
          <div>
            <span>Сотрудники</span>
            <strong>{selectedChannel.employees}</strong>
          </div>
        </div>
        <div className="channel-group-list" aria-label="Группы канала">
          {selectedChannel.groups.map((group) => <span key={group}>{group}</span>)}
        </div>

        <div className="channel-detail-section">
          <div className="section-title compact-title">
            <h3>Подключения канала</h3>
            <span>несколько инстансов</span>
          </div>
          <div className="connection-list">
            {selectedChannel.connections.map((connection) => (
              <div className={`connection-row ${connection.status.toLowerCase()}`} key={connection.id}>
                <div>
                  <strong>{connection.name}</strong>
                  <span>{connection.env} · {connection.rawId}</span>
                </div>
                <b>{connection.status}</b>
                <span>{connection.lastEvent}</span>
                <span>{connection.traffic}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="channel-detail-section">
          <div className="channel-log-toolbar">
            <div className="section-title compact-title">
              <h3>Журнал ошибок и событий</h3>
              <span>{visibleChannelLogs.length} событий</span>
            </div>
            <select value={channelLogConnection} onChange={(event) => setChannelLogConnection(event.target.value)} aria-label="Фильтр логов по подключению">
              <option value="all">Все подключения</option>
              {selectedChannel.connections.map((connection) => <option value={connection.id} key={connection.id}>{connection.name}</option>)}
            </select>
            <select value={channelLogSeverity} onChange={(event) => setChannelLogSeverity(event.target.value)} aria-label="Фильтр логов по уровню">
              <option value="all">Все уровни</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div className="channel-log-list">
            {visibleChannelLogs.map((log) => (
              <div className={`channel-log-row ${log.severity}`} key={log.id}>
                <time>{log.time}</time>
                <b>{log.severity}</b>
                <span>{selectedChannel.connections.find((connection) => connection.id === log.connectionId)?.name ?? log.connectionId}</span>
                <strong>{log.message}</strong>
                <code>{log.traceId}</code>
              </div>
            ))}
            {!visibleChannelLogs.length ? (
              <div className="channel-log-empty">По выбранным фильтрам событий нет.</div>
            ) : null}
          </div>
        </div>

        <div className="channel-test-panel">
          <div className="section-title compact-title">
            <h3>Тест приема/отправки</h3>
            <span>{canEditSettings ? "симуляция raw response" : "только администратор"}</span>
          </div>
          <div className="channel-test-grid">
            <label>
              <span>Направление</span>
              <select disabled={!canEditSettings} value={channelTestMode} onChange={(event) => setChannelTestMode(event.target.value)} title={canEditSettings ? "Выберите режим теста" : access.reason}>
                <option value="receive">Прием</option>
                <option value="send">Отправка</option>
              </select>
            </label>
            <label>
              <span>Адресат / тестовый пользователь</span>
              <input disabled={!canEditSettings} value={channelTestRecipient} onChange={(event) => setChannelTestRecipient(event.target.value)} title={canEditSettings ? "Тестовый адресат" : access.reason} />
            </label>
            <label className="channel-test-message">
              <span>Сообщение / payload</span>
              <textarea disabled={!canEditSettings} value={channelTestMessage} onChange={(event) => setChannelTestMessage(event.target.value)} title={canEditSettings ? "Тестовое сообщение" : access.reason} />
            </label>
            <button disabled={!canEditSettings} onClick={handleChannelTest} title={canEditSettings ? "Запустить тест" : access.reason} type="button">
              <PlayCircle size={16} />
              Запустить тест
            </button>
          </div>
          {channelTestResult ? (
            <div className={`channel-test-result ${channelTestResult.tone}`}>
              <strong>{channelTestResult.title}</strong>
              <code>{channelTestResult.raw}</code>
            </div>
          ) : (
            <div className="channel-test-empty">Результат теста появится после запуска.</div>
          )}
        </div>
      </div>
    </section>
  );
}
