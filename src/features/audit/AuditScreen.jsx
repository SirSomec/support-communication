import React, { useMemo, useState } from "react";
import { Archive, Download, FileClock, Filter, KeyRound, Link2, ShieldAlert } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { auditLogEvents, auditRetentionPolicies } from "../../data.js";
import { auditService } from "../../services/index.js";
import { MetricTile, ProductScreen, SectionTitle, StatusBadge, ToolbarSearch } from "../../ui.jsx";

const auditSourceOptions = ["Все источники", "Диалоги", "Отчеты", "Настройки", "Каналы", "Качество", "Боты"];
const auditSeverityOptions = ["Все уровни", "critical", "warning", "info"];
const auditObjectTypeOptions = ["Все объекты", "Диалог", "Экспорт", "Права", "Webhook", "AI", "Бот"];
const auditPeriodOptions = ["Сегодня", "7 дней", "30 дней", "Retention"];
const auditPeriodStartDates = {
  "Сегодня": "2026-06-26",
  "7 дней": "2026-06-20",
  "30 дней": "2026-05-27"
};
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

export function AuditScreen({ onBack, onToast, access }) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("Все источники");
  const [severityFilter, setSeverityFilter] = useState("Все уровни");
  const [objectTypeFilter, setObjectTypeFilter] = useState("Все объекты");
  const [periodFilter, setPeriodFilter] = useState("Сегодня");
  const [selectedEventId, setSelectedEventId] = useState(auditLogEvents[0].id);
  const normalizedQuery = query.trim().toLowerCase();

  const visibleEvents = useMemo(() => {
    return auditLogEvents.filter((event) => {
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
        event.detail
      ].join(" ").toLowerCase();
      const matchesQuery = !normalizedQuery || queryText.includes(normalizedQuery);
      const matchesSource = sourceFilter === "Все источники" || event.source === sourceFilter;
      const matchesSeverity = severityFilter === "Все уровни" || event.severity === severityFilter;
      const matchesObject = objectTypeFilter === "Все объекты" || event.objectType === objectTypeFilter;
      const matchesPeriod = periodFilter === "Retention" || event.date >= auditPeriodStartDates[periodFilter];

      return matchesQuery && matchesSource && matchesSeverity && matchesObject && matchesPeriod;
    });
  }, [normalizedQuery, objectTypeFilter, periodFilter, severityFilter, sourceFilter]);

  const selectedEvent = visibleEvents.find((event) => event.id === selectedEventId) ?? visibleEvents[0] ?? null;
  const criticalCount = auditLogEvents.filter((event) => event.severity === "critical").length;
  const warningCount = auditLogEvents.filter((event) => event.severity === "warning").length;
  const visibleCriticalCount = visibleEvents.filter((event) => event.severity === "critical").length;

  async function handleExport() {
    if (!access.canManageSettings) {
      return;
    }

    await auditService.exportAuditEvents({ format: "CSV", source: sourceFilter });
    onToast(`Audit export: ${formatAuditEventCount(visibleEvents.length)} за период "${periodFilter}" поставлены в очередь.`);
  }

  function handleOpenRelated() {
    if (!selectedEvent) {
      return;
    }

    onToast(`${selectedEvent.related}: связанный объект открыт в read-only preview.`);
  }

  return (
    <ProductScreen
      title="Audit"
      subtitle="Единый журнал действий по диалогам, экспортам, правам, webhooks, AI и ботам."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: visibleEvents.length,
        empty: formatAuditEventCount(visibleEvents.length),
        emptyWhenZero: "событий нет",
        errors: visibleCriticalCount,
        errorLabel: "критичных нет"
      })}
      actions={
        <>
          <select className="inline-select" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} aria-label="Период audit">
            {auditPeriodOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className="primary-action" disabled={!access.canManageSettings} onClick={handleExport} title={access.canManageSettings ? "Экспорт audit CSV" : access.reason} type="button">
            <Download size={17} />
            Экспорт CSV
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<FileClock size={21} />} label="Событий" value={auditLogEvents.length} detail="из всех источников" />
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
            {visibleEvents.map((event) => (
              <button
                className={`audit-log-row ${event.id === selectedEvent.id ? "selected" : ""}`}
                key={event.id}
                onClick={() => setSelectedEventId(event.id)}
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
            ))}
            {!visibleEvents.length ? (
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
                <button onClick={() => onToast(`${selectedEvent.id}: JSON события скопирован.`)} type="button">JSON</button>
              </footer>
            </section>
          ) : (
            <section className="work-panel audit-empty-detail">
              <SectionTitle title="Деталка события" action="нет события" />
              <p>Выборка пуста. Измените фильтры, чтобы увидеть immutable event id и детали события.</p>
            </section>
          )}

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
