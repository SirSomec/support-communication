import React, { useMemo, useState } from "react";
import { Activity, Search, ShieldCheck } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { serviceAdminAuditEvents } from "../../data/serviceAdmin.js";
import { formatAction, formatDateTime, formatLabel, formatResult, getStatusTone } from "./serviceAdminUtils.js";

const severityOptions = ["all", "info", "warn", "critical"];

export function ServiceAdminAuditStream({ events = serviceAdminAuditEvents }) {
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedEventId, setSelectedEventId] = useState(events[0]?.id ?? "");

  const actionOptions = useMemo(() => ["all", ...Array.from(new Set(events.map((event) => event.action)))], [events]);
  const [actionFilter, setActionFilter] = useState("all");

  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return events.filter((event) => {
      const severityMatches = severityFilter === "all" || event.severity === severityFilter;
      const actionMatches = actionFilter === "all" || event.action === actionFilter;
      const queryMatches = !normalizedQuery || [event.actor, event.action, event.target, event.reason, event.traceId]
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      return severityMatches && actionMatches && queryMatches;
    });
  }, [actionFilter, events, query, severityFilter]);

  const selectedEvent = visibleEvents.find((event) => event.id === selectedEventId) ?? visibleEvents[0] ?? events[0];

  return (
    <div className="service-admin-workspace-grid audit-workspace">
      <section className="service-admin-list-panel">
        <header className="service-admin-panel-toolbar">
          <label className="toolbar-search audit-search">
            <Search size={17} />
            <input
              aria-label="Поиск событий аудита"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Актор, причина, trace"
              value={query}
            />
          </label>
          <select
            aria-label="Фильтр аудита по критичности"
            className="inline-select"
            onChange={(event) => setSeverityFilter(event.target.value)}
            value={severityFilter}
          >
            {severityOptions.map((severity) => <option key={severity} value={severity}>{formatLabel(severity)}</option>)}
          </select>
          <select
            aria-label="Фильтр аудита по действию"
            className="inline-select"
            onChange={(event) => setActionFilter(event.target.value)}
            value={actionFilter}
          >
            {actionOptions.map((action) => <option key={action} value={action}>{action === "all" ? "все действия" : formatAction(action)}</option>)}
          </select>
        </header>
        <div className="service-admin-audit-list">
          {visibleEvents.map((event) => (
            <button
              className={event.id === selectedEvent?.id ? "selected" : ""}
              key={event.id}
              onClick={() => setSelectedEventId(event.id)}
              type="button"
            >
              <Activity size={18} />
              <span>
                <strong>{formatAction(event.action)}</strong>
                <small>{event.actor} - {formatDateTime(event.at)}</small>
              </span>
              <StatusBadge tone={getStatusTone(event.severity)}>{formatLabel(event.severity)}</StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Событие аудита" action={selectedEvent?.id ?? "нет"} />
        {selectedEvent ? (
          <>
            <div className="service-admin-detail-head">
              <div>
                <span>{selectedEvent.actor} - {formatDateTime(selectedEvent.at)}</span>
                <h3>{formatAction(selectedEvent.action)}</h3>
                <p>{selectedEvent.reason}</p>
              </div>
              <StatusBadge tone={getStatusTone(selectedEvent.severity)}>{formatResult(selectedEvent.result)}</StatusBadge>
            </div>
            <dl className="service-admin-audit-detail">
              <div>
                <dt>Цель</dt>
                <dd>{selectedEvent.target}</dd>
              </div>
              <div>
                <dt>Организация</dt>
                <dd>{selectedEvent.tenantId ?? "платформа"}</dd>
              </div>
              <div>
                <dt>Trace</dt>
                <dd><code>{selectedEvent.traceId}</code></dd>
              </div>
              <div>
                <dt>Неизменяемость</dt>
                <dd><ShieldCheck size={16} /> append-only поток</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="service-admin-empty">
            <strong>Событий аудита нет</strong>
            <span>Измените фильтры или выполните привилегированное действие.</span>
          </div>
        )}
      </section>
    </div>
  );
}
