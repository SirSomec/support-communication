import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, RadioTower, ShieldAlert } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { incidentService } from "../../services/incidentService.js";
import { platformMonitoringService } from "../../services/platformMonitoringService.js";
import { tenantService } from "../../services/tenantService.js";
import { formatDateTime, formatLabel, getStatusTone } from "./serviceAdminUtils.js";

const incidentStatuses = ["all", "investigating", "identified", "monitoring", "resolved"];
const severities = ["all", "sev2", "sev3"];
const nextIncidentStatuses = ["investigating", "identified", "monitoring", "resolved"];

export function IncidentMonitoringWorkspace({ onAudit }) {
  const [incidents, setIncidents] = useState([]);
  const [components, setComponents] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedIncidentId, setSelectedIncidentId] = useState("");
  const [message, setMessage] = useState("Публичный статус инцидента обновлен администратором сервиса.");
  const [reason, setReason] = useState("Обновление коммуникации по инциденту после проверки платформы");
  const [nextStatus, setNextStatus] = useState("monitoring");
  const [confirmed, setConfirmed] = useState(false);
  const [incidentOverrides, setIncidentOverrides] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      const [incidentResponse, platformResponse, tenantResponse] = await Promise.all([
        incidentService.fetchIncidents(),
        platformMonitoringService.fetchPlatformSnapshot(),
        tenantService.fetchTenants()
      ]);

      if (cancelled) {
        return;
      }

      const items = incidentResponse.status === "ok" ? incidentResponse.data?.items ?? [] : [];
      setIncidents(items);
      setComponents(platformResponse.status === "ok" ? platformResponse.data?.components ?? [] : []);
      setTenants(tenantResponse.status === "ok" ? tenantResponse.data?.items ?? [] : []);
      setSelectedIncidentId(items[0]?.id ?? "");
    }

    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedIncidents = useMemo(() => (
    incidents.map((incident) => ({ ...incident, ...(incidentOverrides[incident.id] ?? {}) }))
  ), [incidentOverrides, incidents]);
  const visibleIncidents = mergedIncidents.filter((incident) => {
    const statusMatches = statusFilter === "all" || incident.status === statusFilter;
    const severityMatches = severityFilter === "all" || incident.severity === severityFilter;

    return statusMatches && severityMatches;
  });
  const selectedIncident = mergedIncidents.find((incident) => incident.id === selectedIncidentId) ?? mergedIncidents[0];
  const component = components.find((item) => item.id === selectedIncident?.componentId);
  const affectedTenants = tenants.filter((tenant) => selectedIncident?.affectedTenantIds?.includes(tenant.id));
  const actionDisabled = !selectedIncident || message.trim().length < 10 || reason.trim().length < 8 || !confirmed;

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
    }

    onAudit(envelope, { action: "incident.update", target: selectedIncident.id });
  }

  return (
    <div className="service-admin-workspace-grid incident-workspace">
      <section className="service-admin-list-panel">
        <header className="service-admin-panel-toolbar">
          <select aria-label="Фильтр инцидентов по статусу" className="inline-select" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            {incidentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select aria-label="Фильтр инцидентов по severity" className="inline-select" onChange={(event) => setSeverityFilter(event.target.value)} value={severityFilter}>
            {severities.map((severity) => <option key={severity} value={severity}>{severity}</option>)}
          </select>
        </header>
        <div className="service-admin-list">
          {visibleIncidents.map((incident) => (
            <button className={incident.id === selectedIncident?.id ? "selected" : ""} key={incident.id} onClick={() => setSelectedIncidentId(incident.id)} type="button">
              <AlertTriangle size={18} />
              <span>
                <strong>{incident.title}</strong>
                <small>{incident.componentId} · {formatDateTime(incident.startedAt)}</small>
              </span>
              <StatusBadge tone={getStatusTone(incident.status)}>{formatLabel(incident.status)}</StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        {selectedIncident ? (
          <>
            <header>
              <div>
                <span>{component?.name ?? selectedIncident.componentId}</span>
                <h3>{selectedIncident.title}</h3>
              </div>
              <StatusBadge tone={getStatusTone(selectedIncident.status)}>{formatLabel(selectedIncident.status)}</StatusBadge>
            </header>
            <div className="service-admin-signal-grid">
              <span><RadioTower size={17} /> {selectedIncident.severity}</span>
              <span><Clock3 size={17} /> {formatDateTime(selectedIncident.startedAt)}</span>
              <span><ShieldAlert size={17} /> {affectedTenants.length} организаций</span>
            </div>
            <label>
              <span>Публичное сообщение</span>
              <textarea onChange={(event) => setMessage(event.target.value)} value={message} />
            </label>
            <label>
              <span>Причина</span>
              <textarea onChange={(event) => setReason(event.target.value)} value={reason} />
            </label>
            <label>
              <span>Следующий статус</span>
              <select onChange={(event) => setNextStatus(event.target.value)} value={nextStatus}>
                {nextIncidentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="service-admin-confirm">
              <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
              <span>Подтверждаю публичное обновление статуса инцидента.</span>
            </label>
            <footer>
              <button disabled={actionDisabled} onClick={handleIncidentUpdate} type="button">Обновить инцидент</button>
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}
