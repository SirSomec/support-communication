import React, { useMemo, useState } from "react";
import { Activity, Search, ShieldCheck } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { serviceAdminAuditEvents } from "../../data/serviceAdmin.js";
import { formatDateTime, getStatusTone } from "./serviceAdminUtils.js";

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
              aria-label="Search audit events"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actor, reason, trace"
              value={query}
            />
          </label>
          <select
            aria-label="Audit severity filter"
            className="inline-select"
            onChange={(event) => setSeverityFilter(event.target.value)}
            value={severityFilter}
          >
            {severityOptions.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
          </select>
          <select
            aria-label="Audit action filter"
            className="inline-select"
            onChange={(event) => setActionFilter(event.target.value)}
            value={actionFilter}
          >
            {actionOptions.map((action) => <option key={action} value={action}>{action}</option>)}
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
                <strong>{event.action}</strong>
                <small>{event.actor} - {formatDateTime(event.at)}</small>
              </span>
              <StatusBadge tone={getStatusTone(event.severity)}>{event.severity}</StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Audit event" action={selectedEvent?.id ?? "none"} />
        {selectedEvent ? (
          <>
            <div className="service-admin-detail-head">
              <div>
                <span>{selectedEvent.actor} - {formatDateTime(selectedEvent.at)}</span>
                <h3>{selectedEvent.action}</h3>
                <p>{selectedEvent.reason}</p>
              </div>
              <StatusBadge tone={getStatusTone(selectedEvent.severity)}>{selectedEvent.result}</StatusBadge>
            </div>
            <dl className="service-admin-audit-detail">
              <div>
                <dt>Target</dt>
                <dd>{selectedEvent.target}</dd>
              </div>
              <div>
                <dt>Tenant</dt>
                <dd>{selectedEvent.tenantId ?? "platform"}</dd>
              </div>
              <div>
                <dt>Trace</dt>
                <dd><code>{selectedEvent.traceId}</code></dd>
              </div>
              <div>
                <dt>Immutable</dt>
                <dd><ShieldCheck size={16} /> append-only stream</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="service-admin-empty">
            <strong>No audit events</strong>
            <span>Change filters or run a privileged action.</span>
          </div>
        )}
      </section>
    </div>
  );
}
