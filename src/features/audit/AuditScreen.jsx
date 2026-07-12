import React, { useEffect, useMemo, useState } from "react";
import { Archive, Download, FileClock, Filter, KeyRound, Link2, ShieldAlert } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { auditService } from "../../services/auditService.js";
import { copyTextToClipboard } from "../../services/clipboardService.js";
import { MetricTile, ProductScreen, SectionTitle, StatusBadge, ToolbarSearch } from "../../ui.jsx";

const auditSourceOptions = ["Все источники", "Диалоги", "Отчеты", "Настройки", "Каналы", "Качество", "Боты"];
const auditSeverityOptions = ["Все уровни", "critical", "warning", "info"];
const auditObjectTypeOptions = ["Все объекты", "Диалог", "Экспорт", "Права", "Webhook", "AI", "Бот"];
const auditPeriodOptions = ["Сегодня", "7 дней", "30 дней", "Retention"];
const auditRetentionPolicies = [
  { name: "Privileged actions", coverage: "Service-admin mutations", period: "365 дней" },
  { name: "Channel failures", coverage: "Webhook and delivery errors", period: "180 дней" },
  { name: "Exports", coverage: "Report and audit descriptors", period: "90 дней" }
];
const severityTone = {
  critical: "warn",
  warning: "hold",
  info: "info"
};

function formatAuditEventCount(count) {
  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} событие`;
  }

  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} события`;
  }

  return `${count} событий`;
}

function mapAuditEvent(event) {
  const at = new Date(event.at ?? Date.now());
  return {
    id: event.id,
    time: at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    date: at.toISOString().slice(0, 10),
    actor: event.actorName ?? event.actor ?? "system",
    role: event.actor ?? "system",
    action: event.action,
    object: event.target,
    objectType: event.action?.includes("export") ? "Экспорт" : "Событие",
    source: event.tenantId ? "Настройки" : "Система",
    channel: "Система",
    severity: event.severity ?? "info",
    result: event.result ?? "applied",
    retention: "365 дней",
    ip: "—",
    eventId: event.id,
    detail: event.reason ?? event.action,
    related: event.target,
    rawAt: event.at ?? at.toISOString(),
    tenantId: event.tenantId ?? null,
    userId: event.userId ?? null,
    traceId: event.traceId ?? "",
    immutable: Boolean(event.immutable)
  };
}

export function AuditScreen({ onBack, onToast, access }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("Все источники");
  const [severityFilter, setSeverityFilter] = useState("Все уровни");
  const [objectTypeFilter, setObjectTypeFilter] = useState("Все объекты");
  const [periodFilter, setPeriodFilter] = useState("Сегодня");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [relatedEvent, setRelatedEvent] = useState(null);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);
      setError("");
      const response = await auditService.fetchAuditEvents({
        period: periodFilter === "Retention" ? "365d" : periodFilter === "Сегодня" ? "24h" : periodFilter === "7 дней" ? "7d" : "30d"
      });

      if (cancelled) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить audit.");
        setEvents([]);
        setLoading(false);
        return;
      }

      const nextEvents = (response.data?.items ?? []).map(mapAuditEvent);
      setEvents(nextEvents);
      setSelectedEventId((current) => current && nextEvents.some((event) => event.id === current)
        ? current
        : nextEvents[0]?.id ?? "");
      setLoading(false);
    }

    loadEvents();
    return () => {
      cancelled = true;
    };
  }, [periodFilter]);

  const visibleEvents = useMemo(() => {
    return events.filter((event) => {
      const queryText = [
        event.id,
        event.actor,
        event.role,
        event.action,
        event.object,
        event.objectType,
        event.source,
        event.channel,
        event.result,
        event.eventId,
        event.detail,
        event.tenantId,
        event.userId,
        event.traceId
      ].join(" ").toLowerCase();
      const matchesQuery = !normalizedQuery || queryText.includes(normalizedQuery);
      const matchesSource = sourceFilter === "Все источники" || event.source === sourceFilter;
      const matchesSeverity = severityFilter === "Все уровни" || event.severity === severityFilter;
      const matchesObject = objectTypeFilter === "Все объекты" || event.objectType === objectTypeFilter;
      return matchesQuery && matchesSource && matchesSeverity && matchesObject;
    });
  }, [events, normalizedQuery, objectTypeFilter, severityFilter, sourceFilter]);

  const selectedEvent = visibleEvents.find((event) => event.id === selectedEventId) ?? visibleEvents[0] ?? null;
  const relatedObjectEvent = relatedEvent && visibleEvents.some((event) => event.id === relatedEvent.id) ? relatedEvent : null;
  const criticalCount = events.filter((event) => event.severity === "critical").length;
  const warningCount = events.filter((event) => event.severity === "warning").length;
  const visibleCriticalCount = visibleEvents.filter((event) => event.severity === "critical").length;

  async function handleExport() {
    if (!access.canManageSettings || error) {
      return;
    }

    const response = await auditService.exportAuditEvents({
      format: "json",
      period: periodFilter === "Retention" ? "365d" : periodFilter === "Сегодня" ? "24h" : periodFilter === "7 дней" ? "7d" : "30d"
    });

    if (response.status === "ok") {
      onToast(`Audit export: ${formatAuditEventCount(visibleEvents.length)} за период "${periodFilter}" поставлены в очередь.`);
      return;
    }

    onToast(response.error?.message ?? "Не удалось экспортировать audit.");
  }

  function handleOpenRelated() {
    if (!selectedEvent) {
      return;
    }

    setRelatedEvent(selectedEvent);
  }

  async function handleCopyEventJson() {
    if (!selectedEvent) {
      return;
    }

    const result = await copyTextToClipboard(JSON.stringify(selectedEvent, null, 2));
    onToast(result.ok ? `${selectedEvent.id}: JSON события скопирован.` : result.message);
  }

  return (
    <ProductScreen
      title="Audit"
      subtitle="Единый журнал действий по диалогам, экспортам, правам, webhooks, AI и ботам."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: visibleEvents.length,
        empty: loading ? "загрузка" : formatAuditEventCount(visibleEvents.length),
        emptyWhenZero: "событий нет",
        errors: visibleCriticalCount,
        errorLabel: "критичных нет"
      })}
      actions={
        <>
          <select className="inline-select" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} aria-label="Период audit">
            {auditPeriodOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className="primary-action" disabled={!access.canManageSettings || Boolean(error)} onClick={handleExport} title={access.canManageSettings ? "Экспорт audit CSV" : access.reason} type="button">
            <Download size={17} />
            Экспорт CSV
          </button>
        </>
      }
    >
      {error ? <div className="entity-empty"><strong>{error}</strong></div> : null}
      <div className="metric-strip">
        <MetricTile icon={<FileClock size={21} />} label="Событий" value={events.length} detail="из всех источников" />
        <MetricTile icon={<ShieldAlert size={21} />} label="Critical" value={criticalCount} detail="требуют внимания" tone="danger" />
        <MetricTile icon={<Filter size={21} />} label="Warnings" value={warningCount} detail="проверка старшим" />
        <MetricTile icon={<KeyRound size={21} />} label="Immutable ID" value="100%" detail="event id у каждого события" />
      </div>

      <div className="screen-toolbar audit-toolbar">
        <ToolbarSearch ariaLabel="Поиск audit" placeholder="Поиск по actor, action, object, event id" value={query} onChange={setQuery} />
        <select className="inline-select" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Источник audit">
          {auditSourceOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} aria-label="Уровень audit">
          {auditSeverityOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={objectTypeFilter} onChange={(event) => setObjectTypeFilter(event.target.value)} aria-label="Тип объекта audit">
          {auditObjectTypeOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      <div className="audit-layout">
        <section className="work-panel">
          <SectionTitle title="Журнал событий" action={`${formatAuditEventCount(visibleEvents.length)} найдено`} />
          <div className="audit-log-list">
            {loading ? <div className="entity-empty"><strong>Загружаем audit...</strong></div> : null}
            {!loading ? visibleEvents.map((event) => (
              <button
                className={`audit-log-row ${event.id === selectedEvent?.id ? "selected" : ""}`}
                key={event.id}
                onClick={() => {
                  setSelectedEventId(event.id);
                  setRelatedEvent(null);
                }}
                type="button"
              >
                <time>{event.time}</time>
                <span>
                  <strong>{event.action}</strong>
                  <small>{event.actor} · {event.role}</small>
                </span>
                <span>
                  <b>{event.object}</b>
                  <small>{event.source} · {event.channel}</small>
                </span>
                <StatusBadge tone={severityTone[event.severity]}>{event.severity}</StatusBadge>
              </button>
            )) : null}
            {!loading && !visibleEvents.length ? (
              <div className="entity-empty">
                <strong>Событий не найдено</strong>
                <span>Измените фильтры audit или период.</span>
              </div>
            ) : null}
          </div>
        </section>

        <aside className="audit-detail-panel">
          {selectedEvent ? (
            <section className="work-panel audit-event-detail">
              <SectionTitle title="Деталка события" action={selectedEvent.eventId} />
              <header>
                <div>
                  <span>{selectedEvent.date} · {selectedEvent.time}</span>
                  <h2>{selectedEvent.action}</h2>
                  <p>{selectedEvent.detail}</p>
                </div>
                <StatusBadge tone={severityTone[selectedEvent.severity]}>{selectedEvent.result}</StatusBadge>
              </header>
              <dl>
                <div><dt>Actor</dt><dd>{selectedEvent.actor}</dd></div>
                <div><dt>Object</dt><dd>{selectedEvent.object}</dd></div>
                <div><dt>Source</dt><dd>{selectedEvent.source}</dd></div>
                <div><dt>Channel</dt><dd>{selectedEvent.channel}</dd></div>
                <div><dt>IP</dt><dd>{selectedEvent.ip}</dd></div>
                <div><dt>Retention</dt><dd>{selectedEvent.retention}</dd></div>
              </dl>
              <footer>
                <button onClick={handleOpenRelated} type="button"><Link2 size={16} /> Открыть объект</button>
                <button onClick={() => void handleCopyEventJson()} type="button">JSON</button>
              </footer>
            </section>
          ) : (
            <section className="work-panel audit-empty-detail">
              <SectionTitle title="Деталка события" action="нет события" />
              <p>Выборка пуста. Измените фильтры, чтобы увидеть immutable event id и детали события.</p>
            </section>
          )}

          {relatedObjectEvent ? (
            <section className="work-panel audit-related-object-panel" data-testid="audit-related-object-panel">
              <SectionTitle title="Связанный объект" action={relatedObjectEvent.objectType} />
              <dl>
                <div><dt>Object</dt><dd>{relatedObjectEvent.related}</dd></div>
                <div><dt>Event ID</dt><dd>{relatedObjectEvent.eventId}</dd></div>
                <div><dt>Action</dt><dd>{relatedObjectEvent.action}</dd></div>
                <div><dt>Actor</dt><dd>{relatedObjectEvent.actor}</dd></div>
                <div><dt>Tenant</dt><dd>{relatedObjectEvent.tenantId ?? "-"}</dd></div>
                <div><dt>User</dt><dd>{relatedObjectEvent.userId ?? "-"}</dd></div>
                <div><dt>Trace</dt><dd>{relatedObjectEvent.traceId || "-"}</dd></div>
                <div><dt>Source</dt><dd>{relatedObjectEvent.source}</dd></div>
                <div><dt>Result</dt><dd>{relatedObjectEvent.result}</dd></div>
                <div><dt>Immutable</dt><dd>{relatedObjectEvent.immutable ? "immutable" : "mutable"}</dd></div>
              </dl>
              <footer>
                <span>Источник открыт из immutable audit-события без потери контекста фильтра.</span>
                <button onClick={() => setRelatedEvent(null)} type="button">Закрыть</button>
              </footer>
            </section>
          ) : null}

          <section className="work-panel audit-retention-panel">
            <SectionTitle title="Retention policy" action="redaction-ready" />
            <div>
              {auditRetentionPolicies.map((policy) => (
                <article key={policy.name}>
                  <Archive size={17} />
                  <span>
                    <strong>{policy.name}</strong>
                    <small>{policy.coverage}</small>
                  </span>
                  <b>{policy.period}</b>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </ProductScreen>
  );
}
