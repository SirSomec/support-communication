import React, { useMemo, useState } from "react";
import { AlertTriangle, Clock3, RadioTower, ShieldAlert } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import {
  serviceAdminIncidents,
  serviceAdminPlatformComponents,
  serviceAdminTenants
} from "../../data/serviceAdmin.js";
import { incidentService } from "../../services/incidentService.js";
import { formatDateTime, formatLabel, getStatusTone } from "./serviceAdminUtils.js";

const incidentStatuses = ["all", "investigating", "identified", "monitoring", "resolved"];
const severities = ["all", "sev2", "sev3"];
const nextIncidentStatuses = ["investigating", "identified", "monitoring", "resolved"];

export function IncidentMonitoringWorkspace({ onAudit }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedIncidentId, setSelectedIncidentId] = useState(serviceAdminIncidents[0].id);
  const [message, setMessage] = useState("Публичный статус инцидента обновлен администратором сервиса.");
  const [reason, setReason] = useState("Обновление коммуникации по инциденту после проверки платформы");
  const [nextStatus, setNextStatus] = useState("monitoring");
  const [confirmed, setConfirmed] = useState(false);
  const [incidentOverrides, setIncidentOverrides] = useState({});

  const incidents = useMemo(() => (
    serviceAdminIncidents.map((incident) => ({ ...incident, ...(incidentOverrides[incident.id] ?? {}) }))
  ), [incidentOverrides]);
  const visibleIncidents = incidents.filter((incident) => {
    const statusMatches = statusFilter === "all" || incident.status === statusFilter;
    const severityMatches = severityFilter === "all" || incident.severity === severityFilter;

    return statusMatches && severityMatches;
  });
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0];
  const component = serviceAdminPlatformComponents.find((item) => item.id === selectedIncident.componentId);
  const affectedTenants = serviceAdminTenants.filter((tenant) => selectedIncident.affectedTenantIds.includes(tenant.id));
  const actionDisabled = message.trim().length < 10 || reason.trim().length < 8 || !confirmed;

  async function handleIncidentUpdate() {
    const envelope = await incidentService.addIncidentUpdate({
      confirmed,
      incidentId: selectedIncident.id,
      message,
      reason,
      status: nextStatus
    });

    if (envelope.status === "ok") {
      setIncidentOverrides((current) => ({ ...current, [selectedIncident.id]: envelope.data.incident }));
      setConfirmed(false);
      onAudit(envelope, { action: "incident.update", target: selectedIncident.id, severity: "warn" });
    }
  }

  return (
    <div className="service-admin-workspace-grid incident-workspace">
      <section className="service-admin-list-panel">
        <header className="service-admin-panel-toolbar">
          <select
            aria-label="Фильтр инцидентов по статусу"
            className="inline-select"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            {incidentStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
          </select>
          <select
            aria-label="Фильтр инцидентов по критичности"
            className="inline-select"
            onChange={(event) => setSeverityFilter(event.target.value)}
            value={severityFilter}
          >
            {severities.map((severity) => <option key={severity} value={severity}>{formatLabel(severity)}</option>)}
          </select>
        </header>
        <div className="service-admin-incident-list">
          {visibleIncidents.map((incident) => (
            <button
              className={incident.id === selectedIncident.id ? "selected" : ""}
              key={incident.id}
              onClick={() => {
                setSelectedIncidentId(incident.id);
                setNextStatus(incident.status === "resolved" ? "monitoring" : incident.status);
              }}
              type="button"
            >
              <AlertTriangle size={18} />
              <span>
                <strong>{incident.title}</strong>
                <small>{incident.owner} - {formatDateTime(incident.updatedAt)}</small>
              </span>
              <StatusBadge tone={getStatusTone(incident.status)}>{formatLabel(incident.severity)}</StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Карточка инцидента" action={selectedIncident.id} />
        <div className="service-admin-detail-head">
          <div>
            <span>{component?.name} - {selectedIncident.owner}</span>
            <h3>{selectedIncident.title}</h3>
            <p>{selectedIncident.impact}</p>
          </div>
          <StatusBadge tone={getStatusTone(selectedIncident.status)}>{formatLabel(selectedIncident.status)}</StatusBadge>
        </div>

        <div className="service-admin-stat-grid">
          <span><b>{formatLabel(selectedIncident.severity)}</b> критичность</span>
          <span><b>{affectedTenants.length}</b> организаций</span>
          <span><b>{formatDateTime(selectedIncident.startedAt)}</b> начало</span>
          <span><b>{formatLabel(component?.status)}</b> компонент</span>
        </div>

        <div className="service-admin-mini-list">
          {affectedTenants.map((tenant) => (
            <span key={tenant.id}>
              <b>{tenant.name}</b>
              {formatLabel(tenant.status)}
            </span>
          ))}
        </div>

        <div className="service-admin-action-box">
          <header>
            <ShieldAlert size={18} />
            <div>
              <strong>Обновление инцидента</strong>
              <span>Добавляет запись в таймлайн и при необходимости меняет статус</span>
            </div>
          </header>
          <div className="service-admin-action-grid">
            <label>
              <span>Новый статус</span>
              <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                {nextIncidentStatuses.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
              </select>
            </label>
            <label>
              <span>Причина</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
            </label>
            <label>
              <span>Сообщение в таймлайн</span>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} />
            </label>
          </div>
          <label className="service-admin-confirm">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>Подтверждаю, что обновление согласовано и видно клиентам.</span>
          </label>
          <footer>
            <span>{actionDisabled ? "Нужны причина, сообщение и подтверждение" : `${selectedIncident.updates.length} записей в таймлайне`}</span>
            <button disabled={actionDisabled} onClick={handleIncidentUpdate} type="button">
              <Clock3 size={17} />
              Добавить обновление
            </button>
          </footer>
        </div>

        <div className="service-admin-timeline">
          {selectedIncident.updates.map((update) => (
            <article key={`${selectedIncident.id}-${update.at}-${update.text}`}>
              <RadioTower size={16} />
              <span>
                <strong>{update.author} - {update.at}</strong>
                <small>{update.text}</small>
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
