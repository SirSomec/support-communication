import React, { useMemo, useState } from "react";
import { CreditCard, Eye, ShieldAlert, WalletCards } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { serviceAdminTariffs, serviceAdminTenants } from "../../data/serviceAdmin.js";
import { billingService } from "../../services/billingService.js";
import { formatCurrency, getStatusTone } from "./serviceAdminUtils.js";

export function BillingTariffWorkspace({ onAudit }) {
  const [tenantFilter, setTenantFilter] = useState("all");
  const [selectedTenantId, setSelectedTenantId] = useState(serviceAdminTenants[0].id);
  const [selectedPlanId, setSelectedPlanId] = useState("scale");
  const [reason, setReason] = useState("Commercial approval received in billing ticket");
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
            aria-label="Billing tenant filter"
            className="inline-select"
            onChange={(event) => setTenantFilter(event.target.value)}
            value={tenantFilter}
          >
            <option value="all">all tenants</option>
            <option value="active">active</option>
            <option value="watch">watch</option>
            <option value="trial">trial</option>
            <option value="restricted">restricted</option>
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
                  <small>{tariff?.name} - {tenant.users} users - {tenant.workspaces} workspaces</small>
                </span>
                <StatusBadge tone={getStatusTone(tenant.status)}>{tenant.status}</StatusBadge>
              </button>
            );
          })}
        </div>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Tariff preview and change" action={selectedTenant.name} />
        <div className="service-admin-detail-head">
          <div>
            <span>Current: {currentTariff?.name}</span>
            <h3>{formatCurrency(currentTariff?.priceMonthly ?? 0)} / month</h3>
            <p>{currentTariff?.changePolicy}</p>
          </div>
          <StatusBadge tone={getStatusTone(selectedTenant.status)}>{selectedTenant.status}</StatusBadge>
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
              <small>{tariff.includedUsers} users - {tariff.workspaceLimit} workspaces</small>
            </button>
          ))}
        </div>

        <div className="service-admin-action-box">
          <header>
            <ShieldAlert size={18} />
            <div>
              <strong>Billing change preview</strong>
              <span>{currentTariff?.name} to {nextTariff.name}</span>
            </div>
          </header>
          <label className="service-admin-reason-field">
            <span>Reason</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </label>
          <div className="service-admin-action-buttons">
            <button disabled={reason.trim().length < 8 || currentTariff?.id === nextTariff.id} onClick={handlePreview} type="button">
              <Eye size={17} />
              Preview
            </button>
            <button disabled={!canApply} onClick={handleApply} type="button">
              <CreditCard size={17} />
              Apply change
            </button>
          </div>

          {currentPreview ? (
            <div className="service-admin-preview">
              <span><b>Monthly delta</b>{formatCurrency(currentPreview.monthlyDelta)}</span>
              <span><b>Users</b>{currentPreview.capacityCheck.users} ({currentPreview.capacityCheck.seatDelta})</span>
              <span><b>Workspaces</b>{currentPreview.capacityCheck.workspaces} ({currentPreview.capacityCheck.workspaceDelta})</span>
              <span><b>Approval</b>{currentPreview.approval.required ? "required" : "not required"}</span>
            </div>
          ) : null}

          {confirmationRequired ? (
            <label className="service-admin-reason-field">
              <span>Type confirmation: {currentPreview.confirmation.expectedText}</span>
              <input value={confirmationText} onChange={(event) => setConfirmationText(event.target.value)} />
            </label>
          ) : null}
        </div>
      </section>
    </div>
  );
}
