import React, { useMemo, useState } from "react";
import { CreditCard, Eye, ShieldAlert, WalletCards } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { serviceAdminTariffs, serviceAdminTenants } from "../../data/serviceAdmin.js";
import { billingService } from "../../services/billingService.js";
import { formatCurrency, formatLabel, getStatusTone } from "./serviceAdminUtils.js";

export function BillingTariffWorkspace({ onAudit }) {
  const [tenantFilter, setTenantFilter] = useState("all");
  const [selectedTenantId, setSelectedTenantId] = useState(serviceAdminTenants[0].id);
  const [selectedPlanId, setSelectedPlanId] = useState("scale");
  const [reason, setReason] = useState("Коммерческое согласование получено в тикете по биллингу");
  const [preview, setPreview] = useState(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [planOverrides, setPlanOverrides] = useState({});

  const tenants = useMemo(() => (
    serviceAdminTenants.map((tenant) => ({ ...tenant, planId: planOverrides[tenant.id] ?? tenant.planId }))
  ), [planOverrides]);
  const visibleTenants = tenants.filter((tenant) => tenantFilter === "all" || tenant.status === tenantFilter);
  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0];
  const currentTariff = serviceAdminTariffs.find((tariff) => tariff.id === selectedTenant.planId);
  const nextTariff = serviceAdminTariffs.find((tariff) => tariff.id === selectedPlanId) ?? serviceAdminTariffs[0];
  const currentPreview = preview?.tenant?.id === selectedTenant.id && preview.nextTariff?.id === nextTariff.id ? preview : null;
  const confirmationRequired = Boolean(currentPreview?.confirmation?.required);
  const canApply = currentPreview && reason.trim().length >= 8 && (!confirmationRequired || confirmationText === currentPreview.confirmation.expectedText);

  async function handlePreview() {
    const envelope = await billingService.previewTariffChange({
      nextPlanId: nextTariff.id,
      reason,
      tenantId: selectedTenant.id
    });

    if (envelope.status === "ok") {
      setPreview(envelope.data);
      setConfirmationText("");
    }
  }

  async function handleApply() {
    const envelope = await billingService.changeTenantTariff({
      confirmationText,
      confirmed: true,
      nextPlanId: nextTariff.id,
      reason,
      tenantId: selectedTenant.id
    });

    if (envelope.status === "ok" && envelope.data.applied) {
      setPlanOverrides((current) => ({ ...current, [selectedTenant.id]: nextTariff.id }));
      setPreview(null);
      setConfirmationText("");
    }

    onAudit(envelope, { action: "tenant.tariff.change", target: selectedTenant.id });
  }

  return (
    <div className="service-admin-workspace-grid billing-workspace">
      <section className="service-admin-list-panel">
        <header className="service-admin-panel-toolbar">
          <select
            aria-label="Фильтр организаций в биллинге"
            className="inline-select"
            onChange={(event) => setTenantFilter(event.target.value)}
            value={tenantFilter}
          >
            <option value="all">все организации</option>
            <option value="active">активные</option>
            <option value="watch">под наблюдением</option>
            <option value="trial">{formatLabel("trial")}</option>
            <option value="restricted">ограниченные</option>
          </select>
        </header>
        <div className="service-admin-tenant-list">
          {visibleTenants.map((tenant) => {
            const tariff = serviceAdminTariffs.find((item) => item.id === tenant.planId);

            return (
              <button
                className={tenant.id === selectedTenant.id ? "selected" : ""}
                key={tenant.id}
                onClick={() => {
                  setSelectedTenantId(tenant.id);
                  setPreview(null);
                  setConfirmationText("");
                }}
                type="button"
              >
                <CreditCard size={18} />
                <span>
                  <strong>{tenant.name}</strong>
                  <small>{tariff?.name} - {tenant.users} пользователей - {tenant.workspaces} пространств</small>
                </span>
                <StatusBadge tone={getStatusTone(tenant.status)}>{formatLabel(tenant.status)}</StatusBadge>
              </button>
            );
          })}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Предпросмотр и смена тарифа" action={selectedTenant.name} />
        <div className="service-admin-detail-head">
          <div>
            <span>Текущий: {currentTariff?.name}</span>
            <h3>{formatCurrency(currentTariff?.priceMonthly ?? 0)} / мес.</h3>
            <p>{currentTariff?.changePolicy}</p>
          </div>
          <StatusBadge tone={getStatusTone(selectedTenant.status)}>{formatLabel(selectedTenant.status)}</StatusBadge>
        </div>

        <div className="tariff-card-grid">
          {serviceAdminTariffs.map((tariff) => (
            <button
              className={tariff.id === nextTariff.id ? "selected" : ""}
              key={tariff.id}
              onClick={() => {
                setSelectedPlanId(tariff.id);
                setPreview(null);
                setConfirmationText("");
              }}
              type="button"
            >
              <WalletCards size={18} />
              <strong>{tariff.name}</strong>
              <span>{formatCurrency(tariff.priceMonthly)}</span>
              <small>{tariff.includedUsers} пользователей - {tariff.workspaceLimit} пространств</small>
            </button>
          ))}
        </div>

        <div className="service-admin-action-box">
          <header>
            <ShieldAlert size={18} />
            <div>
              <strong>Предпросмотр изменения биллинга</strong>
              <span>{currentTariff?.name} → {nextTariff.name}</span>
            </div>
          </header>
          <label className="service-admin-reason-field">
            <span>Причина</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </label>
          <div className="service-admin-action-buttons">
            <button disabled={reason.trim().length < 8 || currentTariff?.id === nextTariff.id} onClick={handlePreview} type="button">
              <Eye size={17} />
              Предпросмотр
            </button>
            <button disabled={!canApply} onClick={handleApply} type="button">
              <CreditCard size={17} />
              Применить
            </button>
          </div>

          {currentPreview ? (
            <div className="service-admin-preview">
              <span><b>Дельта в месяц</b>{formatCurrency(currentPreview.monthlyDelta)}</span>
              <span><b>Пользователи</b>{formatLabel(currentPreview.capacityCheck.users)} ({currentPreview.capacityCheck.seatDelta})</span>
              <span><b>Пространства</b>{formatLabel(currentPreview.capacityCheck.workspaces)} ({currentPreview.capacityCheck.workspaceDelta})</span>
              <span><b>Согласование</b>{currentPreview.approval.required ? "требуется" : "не требуется"}</span>
            </div>
          ) : null}

          {confirmationRequired ? (
            <label className="service-admin-reason-field">
              <span>Введите подтверждение: {currentPreview.confirmation.expectedText}</span>
              <input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} />
            </label>
          ) : null}
        </div>
      </section>
    </div>
  );
}
