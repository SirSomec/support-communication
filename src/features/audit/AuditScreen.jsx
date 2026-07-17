import React, { useEffect, useMemo, useState } from "react";
import { Archive, Download, FileClock, Filter, KeyRound, Link2, ShieldAlert } from "lucide-react";
import { createScreenStateItems } from "../../app/screenState.js";
import { lifecycleEventDetail } from "../../app/conversationApiMapper.js";
import { auditService } from "../../services/auditService.js";
import { copyTextToClipboard } from "../../services/clipboardService.js";
import { MetricTile, ProductScreen, SectionTitle, StatusBadge, ToolbarSearch } from "../../ui.jsx";
import { csvCell } from "./auditExport.js";

const auditSourceOptions = ["Все источники", "Диалоги", "Качество", "Боты", "Каналы"];
const auditSeverityOptions = ["Все уровни", "critical", "warning", "info"];
const auditObjectTypeOptions = ["Все объекты", "Диалог", "Канал"];
const auditPeriodOptions = ["Сегодня", "7 дней", "30 дней", "Год"];
const auditUsageGuide = [
  { name: "Разбор инцидентов", coverage: "Кто и когда изменил статус, назначение или тему обращения", period: "фильтр «Диалоги»" },
  { name: "Контроль качества", coverage: "Оценки клиентов и ручные проверки с указанием исполнителя", period: "фильтр «Качество»" },
  { name: "Доказательная база", coverage: "У каждого события неизменяемый ID и trace — на них можно ссылаться в спорных ситуациях", period: "кнопка JSON" }
];
const actorTypeLabels = {
  client: "Клиент",
  operator: "Оператор",
  service_admin: "Сервис-админ",
  system: "Система",
  worker: "Бот"
};
const severityTone = {
  critical: "warn",
  warning: "hold",
  info: "info"
};
const AUDIT_PAGE_SIZE = 20;

function auditPeriodValue(periodFilter) {
  if (periodFilter === "Сегодня") {
    return "24h";
  }
  if (periodFilter === "7 дней") {
    return "7d";
  }
  if (periodFilter === "Год") {
    return "365d";
  }
  return "30d";
}

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
  const roleLabel = actorTypeLabels[event.actorType] ?? "Система";
  const data = event.data && typeof event.data === "object" ? event.data : {};
  const detail = event.objectType === "Диалог"
    ? lifecycleEventDetail(event.action, { ...data, reason: event.reason })
    : event.reason || event.action;
  return {
    id: event.id,
    time: at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
    date: at.toISOString().slice(0, 10),
    actor: event.actorName || event.actorId || roleLabel,
    role: roleLabel,
    action: event.action,
    object: event.target,
    objectType: event.objectType ?? "Диалог",
    source: event.source ?? "Диалоги",
    severity: event.severity ?? "info",
    result: event.result ?? "applied",
    eventId: event.id,
    detail,
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
  const [coverageWarning, setCoverageWarning] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("Все источники");
  const [severityFilter, setSeverityFilter] = useState("Все уровни");
  const [objectTypeFilter, setObjectTypeFilter] = useState("Все объекты");
  const [periodFilter, setPeriodFilter] = useState("Сегодня");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [relatedEvent, setRelatedEvent] = useState(null);
  const [page, setPage] = useState(1);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    setPage(1);
  }, [normalizedQuery, sourceFilter, severityFilter, objectTypeFilter, periodFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      setLoading(true);
      setError("");
      setCoverageWarning("");
      const response = await auditService.fetchWorkspaceAuditEvents({
        period: auditPeriodValue(periodFilter)
      });

      if (cancelled) {
        return;
      }

      if (response.status !== "ok") {
        setError(response.error?.message ?? "Не удалось загрузить журнал аудита.");
        setEvents([]);
        setLoading(false);
        return;
      }

      const nextEvents = (response.data?.items ?? []).map(mapAuditEvent);
      const unavailableSources = Array.isArray(response.data?.unavailableSources) ? response.data.unavailableSources : [];
      if (response.partial || unavailableSources.length) {
        setCoverageWarning(`Журнал загружен частично. Недоступные источники: ${unavailableSources.join(", ") || "не определены"}.`);
      }
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

  const totalPages = Math.max(1, Math.ceil(visibleEvents.length / AUDIT_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedEvents = visibleEvents.slice((currentPage - 1) * AUDIT_PAGE_SIZE, currentPage * AUDIT_PAGE_SIZE);
  const pageRangeStart = visibleEvents.length ? (currentPage - 1) * AUDIT_PAGE_SIZE + 1 : 0;
  const pageRangeEnd = Math.min(currentPage * AUDIT_PAGE_SIZE, visibleEvents.length);
  const selectedEvent = pagedEvents.find((event) => event.id === selectedEventId) ?? pagedEvents[0] ?? null;
  const relatedObjectEvent = relatedEvent && visibleEvents.some((event) => event.id === relatedEvent.id) ? relatedEvent : null;
  const criticalCount = events.filter((event) => event.severity === "critical").length;
  const warningCount = events.filter((event) => event.severity === "warning").length;
  const visibleCriticalCount = visibleEvents.filter((event) => event.severity === "critical").length;

  function handleExport() {
    if (!visibleEvents.length || error) {
      return;
    }

    const header = ["Дата", "Действие", "Кто", "Роль", "Объект", "Источник", "Уровень", "Результат", "Trace", "Event ID"];
    const rows = visibleEvents.map((event) => [
      event.rawAt,
      event.detail,
      event.actor,
      event.role,
      event.object,
      event.source,
      event.severity,
      event.result,
      event.traceId,
      event.eventId
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onToast(`Экспортировано: ${formatAuditEventCount(visibleEvents.length)} за период "${periodFilter}".`);
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
      title="Аудит действий"
      subtitle="Неизменяемый журнал: кто и когда менял диалоги, ставил оценки, запускал ботов и подключал каналы. Для разбора инцидентов и спорных ситуаций."
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
          <select className="inline-select" value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} aria-label="Период журнала">
            {auditPeriodOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className="primary-action" disabled={!visibleEvents.length || Boolean(error)} onClick={handleExport} title={visibleEvents.length ? "Скачать CSV с событиями по текущим фильтрам." : "Нет событий для экспорта."} type="button">
            <Download size={17} />
            Экспорт CSV
          </button>
        </>
      }
    >
      {error ? <div className="entity-empty"><strong>{error}</strong></div> : null}
      {coverageWarning ? <div className="entity-empty"><strong>{coverageWarning}</strong></div> : null}
      <div className="metric-strip">
        <MetricTile icon={<FileClock size={21} />} label="Событий" value={events.length} detail="за выбранный период" />
        <MetricTile icon={<ShieldAlert size={21} />} label="Критичные" value={criticalCount} detail="требуют внимания" tone="danger" />
        <MetricTile icon={<Filter size={21} />} label="Предупреждения" value={warningCount} detail="низкие оценки, повторы, SLA" />
        <MetricTile icon={<KeyRound size={21} />} label="Неизменяемость" value="100%" detail="event id у каждого события" />
      </div>

      <div className="screen-toolbar audit-toolbar">
        <ToolbarSearch ariaLabel="Поиск по журналу" placeholder="Поиск: кто, действие, объект, event id" value={query} onChange={setQuery} />
        <select className="inline-select" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="Источник событий">
          {auditSourceOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)} aria-label="Уровень события">
          {auditSeverityOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={objectTypeFilter} onChange={(event) => setObjectTypeFilter(event.target.value)} aria-label="Тип объекта">
          {auditObjectTypeOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </div>

      <div className="audit-layout">
        <section className="work-panel">
          <SectionTitle title="Журнал событий" action={`${formatAuditEventCount(visibleEvents.length)} найдено`} />
          <div className="audit-log-list">
            {loading ? <div className="entity-empty"><strong>Загружаем журнал...</strong></div> : null}
            {!loading ? pagedEvents.map((event) => (
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
                  <strong>{event.detail}</strong>
                  <small>{event.actor} · {event.role}</small>
                </span>
                <span>
                  <b>{event.object}</b>
                  <small>{event.source} · {event.objectType}</small>
                </span>
                <StatusBadge tone={severityTone[event.severity]}>{event.severity}</StatusBadge>
              </button>
            )) : null}
            {!loading && !visibleEvents.length ? (
              <div className="entity-empty">
                <strong>Событий не найдено</strong>
                <span>Измените фильтры или период.</span>
              </div>
            ) : null}
          </div>
          {!loading && visibleEvents.length > AUDIT_PAGE_SIZE ? (
            <footer className="audit-pagination">
              <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} type="button">
                Назад
              </button>
              <span>
                Страница {currentPage} из {totalPages} · записи {pageRangeStart}–{pageRangeEnd} из {visibleEvents.length}
              </span>
              <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} type="button">
                Вперед
              </button>
            </footer>
          ) : null}
        </section>

        <aside className="audit-detail-panel">
          {selectedEvent ? (
            <section className="work-panel audit-event-detail">
              <SectionTitle title="Деталка события" action={selectedEvent.eventId} />
              <header>
                <div>
                  <span>{selectedEvent.date} · {selectedEvent.time}</span>
                  <h2>{selectedEvent.detail}</h2>
                  <p>{selectedEvent.action}</p>
                </div>
                <StatusBadge tone={severityTone[selectedEvent.severity]}>{selectedEvent.result}</StatusBadge>
              </header>
              <dl>
                <div><dt>Кто</dt><dd>{selectedEvent.actor} ({selectedEvent.role})</dd></div>
                <div><dt>Объект</dt><dd>{selectedEvent.object}</dd></div>
                <div><dt>Источник</dt><dd>{selectedEvent.source}</dd></div>
                <div><dt>Тип объекта</dt><dd>{selectedEvent.objectType}</dd></div>
                <div><dt>Trace</dt><dd>{selectedEvent.traceId || "—"}</dd></div>
                <div><dt>Event ID</dt><dd>{selectedEvent.eventId}</dd></div>
              </dl>
              <footer>
                <button onClick={handleOpenRelated} type="button"><Link2 size={16} /> Открыть объект</button>
                <button onClick={() => void handleCopyEventJson()} type="button">JSON</button>
              </footer>
            </section>
          ) : (
            <section className="work-panel audit-empty-detail">
              <SectionTitle title="Деталка события" action="нет события" />
              <p>Выборка пуста. Измените фильтры, чтобы увидеть детали события и его неизменяемый event id.</p>
            </section>
          )}

          {relatedObjectEvent ? (
            <section className="work-panel audit-related-object-panel" data-testid="audit-related-object-panel">
              <SectionTitle title="Связанный объект" action={relatedObjectEvent.objectType} />
              <dl>
                <div><dt>Объект</dt><dd>{relatedObjectEvent.related}</dd></div>
                <div><dt>Event ID</dt><dd>{relatedObjectEvent.eventId}</dd></div>
                <div><dt>Действие</dt><dd>{relatedObjectEvent.detail}</dd></div>
                <div><dt>Кто</dt><dd>{relatedObjectEvent.actor}</dd></div>
                <div><dt>Организация</dt><dd>{relatedObjectEvent.tenantId ?? "-"}</dd></div>
                <div><dt>Пользователь</dt><dd>{relatedObjectEvent.userId ?? "-"}</dd></div>
                <div><dt>Trace</dt><dd>{relatedObjectEvent.traceId || "-"}</dd></div>
                <div><dt>Источник</dt><dd>{relatedObjectEvent.source}</dd></div>
                <div><dt>Результат</dt><dd>{relatedObjectEvent.result}</dd></div>
                <div><dt>Журнал</dt><dd>{relatedObjectEvent.immutable ? "неизменяемый" : "изменяемый"}</dd></div>
              </dl>
              <footer>
                <span>Объект открыт из события журнала — фильтры не сбрасываются.</span>
                <button onClick={() => setRelatedEvent(null)} type="button">Закрыть</button>
              </footer>
            </section>
          ) : null}

          <section className="work-panel audit-retention-panel">
            <SectionTitle title="Зачем нужен аудит" action="журнал неизменяем" />
            <div>
              {auditUsageGuide.map((usage) => (
                <article key={usage.name}>
                  <Archive size={17} />
                  <span>
                    <strong>{usage.name}</strong>
                    <small>{usage.coverage}</small>
                  </span>
                  <b>{usage.period}</b>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </ProductScreen>
  );
}
