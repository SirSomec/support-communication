import React, { useMemo, useState } from "react";
import { Ban, Building2, CheckCircle2, Eye, Search, ShieldAlert } from "lucide-react";
import { SectionTitle, StatusBadge, ToolbarSearch } from "../../ui.jsx";
import {
  serviceAdminFeatureFlags,
  serviceAdminIncidents,
  serviceAdminTariffs,
  serviceAdminTenants,
  serviceAdminUsers
} from "../../data/serviceAdmin.js";
import { tenantService } from "../../services/tenantService.js";
import { formatCurrency, formatDateTime, formatLabel, getStatusTone } from "./serviceAdminUtils.js";

const tenantStatusOptions = ["all", "active", "watch", "restricted", "trial"];
const nextStatusOptions = ["active", "watch", "restricted"];

export function TenantManagementWorkspace({ onAudit }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTenantId, setSelectedTenantId] = useState(serviceAdminTenants[0].id);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [nextStatus, setNextStatus] = useState("watch");
  const [reason, setReason] = useState("Проверка администратора сервиса после эскалации клиента");
  const [confirmed, setConfirmed] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState({});

  const visibleTenants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return serviceAdminTenants
      .map((tenant) => ({ ...tenant, status: statusOverrides[tenant.id] ?? tenant.status }))
      .filter((tenant) => {
        const statusMatches = statusFilter === "all" || tenant.status === statusFilter;
        const queryMatches = !normalizedQuery || [tenant.name, tenant.legalName, tenant.owner, tenant.ownerEmail]
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));

        return statusMatches && queryMatches;
      });
  }, [query, statusFilter, statusOverrides]);

  const selectedTenant = visibleTenants.find((tenant) => tenant.id === selectedTenantId)
    ?? serviceAdminTenants.find((tenant) => tenant.id === selectedTenantId)
    ?? serviceAdminTenants[0];
  const detail = selectedDetail?.tenant?.id === selectedTenant.id ? selectedDetail : buildLocalTenantDetail(selectedTenant);
  const actionDisabled = reason.trim().length < 8 || !confirmed || nextStatus === selectedTenant.status;

  async function handleSelectTenant(tenantId) {
    setSelectedTenantId(tenantId);
    const envelope = await tenantService.fetchTenantDetail(tenantId);

    if (envelope.status === "ok") {
      setSelectedDetail(envelope.data);
      setNextStatus(envelope.data.tenant.status === "active" ? "watch" : "active");
    }
  }

  async function handleStatusChange() {
    const envelope = await tenantService.updateTenantStatus({
      confirmed,
      reason,
      status: nextStatus,
      tenantId: selectedTenant.id
    });

    if (envelope.status === "ok") {
      setStatusOverrides((current) => ({ ...current, [selectedTenant.id]: nextStatus }));
      setConfirmed(false);
      onAudit(envelope, { action: "tenant.status.change", target: selectedTenant.id });
    }
  }

  return (
    <div className="service-admin-workspace-grid tenant-workspace">
      <section className="service-admin-list-panel">
        <header className="service-admin-panel-toolbar">
          <ToolbarSearch
            ariaLabel="Поиск организаций"
            iconSize={17}
            onChange={setQuery}
            placeholder="Организация, владелец, домен"
            value={query}
          />
          <select
            aria-label="Фильтр организаций по статусу"
            className="inline-select"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            {tenantStatusOptions.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
          </select>
        </header>

        <div className="service-admin-tenant-list">
          {visibleTenants.map((tenant) => (
            <button
              className={tenant.id === selectedTenant.id ? "selected" : ""}
              key={tenant.id}
              onClick={() => handleSelectTenant(tenant.id)}
              type="button"
            >
              <Building2 size={18} />
              <span>
                <strong>{tenant.name}</strong>
                <small>{tenant.region} - {tenant.users} пользователей - {formatCurrency(tenant.monthlyRevenue)}</small>
              </span>
              <StatusBadge tone={getStatusTone(tenant.status)}>{formatLabel(tenant.status)}</StatusBadge>
            </button>
          ))}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Карточка организации" action={selectedTenant.id} />
        <div className="service-admin-detail-head">
          <div>
            <span>{selectedTenant.legalName}</span>
            <h3>{selectedTenant.name}</h3>
            <p>{selectedTenant.notes}</p>
          </div>
          <StatusBadge tone={getStatusTone(selectedTenant.status)}>{formatLabel(selectedTenant.status)}</StatusBadge>
        </div>

        <div className="service-admin-stat-grid">
          <span><b>{selectedTenant.healthScore}</b> здоровье</span>
          <span><b>{selectedTenant.sla}%</b> SLA</span>
          <span><b>{selectedTenant.workspaces}</b> рабочих пространств</span>
          <span><b>{formatDateTime(selectedTenant.lastSeenAt)}</b> последняя активность</span>
        </div>

        <div className="service-admin-linked-grid">
          <article>
            <strong>Пользователи</strong>
            <span>{detail.users.length} всего</span>
            <small>{detail.users.filter((user) => user.risk !== "low").length} требуют внимания поддержки</small>
          </article>
          <article>
            <strong>Тариф</strong>
            <span>{detail.tariff?.name ?? "Неизвестно"}</span>
            <small>{detail.tariff?.retentionDays ?? 0} дней хранения</small>
          </article>
          <article>
            <strong>Инциденты</strong>
            <span>{detail.incidents.length} связано</span>
            <small>{detail.incidents.map((incident) => formatLabel(incident.severity)).join(", ") || "нет"}</small>
          </article>
          <article>
            <strong>Флаги</strong>
            <span>{detail.flags.length} включено</span>
            <small>{detail.flags.map((flag) => flag.key).join(", ") || "нет"}</small>
          </article>
        </div>

        <div className="service-admin-action-box">
          <header>
            <ShieldAlert size={18} />
            <div>
              <strong>Предпросмотр изменения статуса</strong>
              <span>{formatLabel(selectedTenant.status)} → {formatLabel(nextStatus)}</span>
            </div>
          </header>
          <div className="service-admin-action-grid">
            <label>
              <span>Новый статус</span>
              <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                {nextStatusOptions.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
              </select>
            </label>
            <label>
              <span>Причина</span>
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
            </label>
          </div>
          <label className="service-admin-confirm">
            <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
            <span>Подтверждаю изменение статуса, которое влияет на клиента.</span>
          </label>
          <footer>
            <span>{actionDisabled ? "Нужны причина и подтверждение" : "Готово к аудируемому изменению статуса"}</span>
            <button disabled={actionDisabled} onClick={handleStatusChange} type="button">
              {nextStatus === "restricted" ? <Ban size={17} /> : <CheckCircle2 size={17} />}
              Применить статус
            </button>
          </footer>
        </div>
      </section>
    </div>
  );
}

function buildLocalTenantDetail(tenant) {
  return {
    tenant,
    users: serviceAdminUsers.filter((user) => user.tenantId === tenant.id),
    tariff: serviceAdminTariffs.find((tariff) => tariff.id === tenant.planId),
    incidents: serviceAdminIncidents.filter((incident) => incident.affectedTenantIds.includes(tenant.id)),
    flags: serviceAdminFeatureFlags.filter((flag) => flag.enabledTenantIds.includes(tenant.id))
  };
}
