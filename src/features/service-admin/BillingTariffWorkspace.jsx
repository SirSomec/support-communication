import React, { useEffect, useMemo, useState } from "react";
import { CreditCard, Eye, ShieldAlert, WalletCards } from "lucide-react";
import { SectionTitle, StatusBadge } from "../../ui.jsx";
import { billingService } from "../../services/billingService.js";
import { tenantService } from "../../services/tenantService.js";
import { formatKopeks, formatLabel, getStatusTone } from "./serviceAdminUtils.js";

export function BillingTariffWorkspace({ onAudit }) {
  const [tenants, setTenants] = useState([]);
  const [tariffs, setTariffs] = useState([]);
  const [aiDialogPackages, setAiDialogPackages] = useState([]);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState("scale");
  const [reason, setReason] = useState("Коммерческое согласование получено в тикете по биллингу");
  const [preview, setPreview] = useState(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [planOverrides, setPlanOverrides] = useState({});
  const [paymentReadiness, setPaymentReadiness] = useState(null);
  const [balance, setBalance] = useState(0);
  const [topUpAmount, setTopUpAmount] = useState("1000");
  const [topUpReason, setTopUpReason] = useState("Ручное пополнение баланса");
  const [selectedAiPackageId, setSelectedAiPackageId] = useState("ai-dialogs-1000");

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      const [tenantResponse, tariffResponse, readinessResponse] = await Promise.all([
        tenantService.fetchTenants(),
        billingService.fetchTariffs(),
        billingService.fetchPaymentProviderReadiness()
      ]);

      if (cancelled) {
        return;
      }

      const items = tenantResponse.status === "ok" ? tenantResponse.data?.items ?? [] : [];
      setTenants(items);
      setTariffs(tariffResponse.status === "ok" ? tariffResponse.data?.items ?? [] : []);
      setAiDialogPackages(tariffResponse.status === "ok" ? tariffResponse.data?.aiDialogPackages ?? [] : []);
      setPaymentReadiness(readinessResponse.status === "ok" ? readinessResponse.data : null);
      setSelectedTenantId(items[0]?.id ?? "");
    }

    loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, []);

  const mergedTenants = useMemo(() => (
    tenants.map((tenant) => ({ ...tenant, planId: planOverrides[tenant.id] ?? tenant.planId }))
  ), [planOverrides, tenants]);
  const visibleTenants = mergedTenants.filter((tenant) => tenantFilter === "all" || tenant.status === tenantFilter);
  const selectedTenant = visibleTenants.find((tenant) => tenant.id === selectedTenantId) ?? visibleTenants[0] ?? null;
  const currentTariff = tariffs.find((tariff) => tariff.id === selectedTenant?.planId);
  const nextTariff = tariffs.find((tariff) => tariff.id === selectedPlanId) ?? tariffs[0];
  const currentPreview = selectedTenant && nextTariff && preview?.tenant?.id === selectedTenant.id && preview.nextTariff?.id === nextTariff.id ? preview : null;
  const confirmationRequired = Boolean(currentPreview?.confirmation?.required);
  const canApply = Boolean(currentPreview && reason.trim().length >= 8 && (!confirmationRequired || confirmationText === currentPreview.confirmation.expectedText));
  useEffect(() => {
    if (!selectedTenant?.id) return;
    billingService.fetchTenantInvoices(selectedTenant.id).then((response) => {
      if (response.status !== "ok") return;
      setBalance((response.data?.items ?? []).reduce((sum, invoice) => {
        if (invoice.paymentStatus !== "succeeded") return sum;

        const amount = Math.max(0, Number(invoice.amountPaid ?? 0));
        if (invoice.provider === "manual-balance") return sum + amount;
        if (invoice.provider === "internal-daily-charge") return sum - amount;
        if (invoice.provider === "internal-ai-package-purchase") return sum - amount;

        return sum;
      }, 0));
    });
  }, [selectedTenant?.id]);

  async function handleTopUp() {
    if (!selectedTenant) return;
    const envelope = await billingService.topUpTenantBalance({ amountKopeks: Math.round(Number(topUpAmount) * 100), reason: topUpReason, tenantId: selectedTenant.id });
    if (envelope.status === "ok") setBalance(envelope.data.balance.amountKopeks);
    onAudit(envelope, { action: "tenant.balance.top_up", target: selectedTenant.id });
  }

  async function handleAiPackagePurchase() {
    if (!selectedTenant || !selectedAiPackageId) return;
    const envelope = await billingService.purchaseAiDialogPackage({ packageId: selectedAiPackageId, reason: topUpReason, tenantId: selectedTenant.id });
    if (envelope.status === "ok") setBalance(envelope.data.balance.amountKopeks);
    onAudit(envelope, { action: "tenant.ai_dialog_package.purchase", target: selectedTenant.id });
  }

  async function handlePreview() {
    if (!selectedTenant || !nextTariff) {
      return;
    }

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
    if (!selectedTenant || !nextTariff) {
      return;
    }

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
      <section className="service-admin-detail-panel">
        <SectionTitle title="Готовность платежей" action={paymentReadiness?.mode === "yookassa" ? "Включено" : "Выключено"} />
        <p>{paymentReadiness?.mode === "yookassa" ? "YooKassa включена. Перед запуском проверьте все контрольные пункты." : "Платежи безопасно выключены. Внесите credentials в защищённую runtime-конфигурацию, затем включите BILLING_CHECKOUT_PROVIDER_MODE=yookassa."}</p>
        <div className="service-admin-preview">{Object.entries(paymentReadiness?.checks ?? {}).map(([key, ready]) => <span key={key}><b>{key}</b>{ready ? "готово" : "требуется"}</span>)}</div>
      </section>
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
            const tariff = tariffs.find((item) => item.id === tenant.planId);

            return (
              <button
                className={tenant.id === selectedTenant?.id ? "selected" : ""}
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
        <SectionTitle title="Предпросмотр и смена тарифа" action={selectedTenant?.name ?? "Нет данных"} />
        <div className="service-admin-detail-head">
          <div>
            <span>Текущий: {currentTariff?.name}</span>
            <h3>{formatKopeks(currentTariff?.priceMonthly ?? 0)} / мес.</h3>
            <p>{currentTariff?.changePolicy}</p>
          </div>
          {selectedTenant ? <StatusBadge tone={getStatusTone(selectedTenant.status)}>{formatLabel(selectedTenant.status)}</StatusBadge> : null}
        </div>
        <div className="service-admin-action-box"><header><WalletCards size={18} /><div><strong>Баланс организации</strong><span>{formatKopeks(balance)}</span></div></header><label className="service-admin-reason-field"><span>Сумма, ₽</span><input min="1" onChange={(event) => setTopUpAmount(event.target.value)} type="number" value={topUpAmount} /></label><label className="service-admin-reason-field"><span>Причина</span><input onChange={(event) => setTopUpReason(event.target.value)} value={topUpReason} /></label><button disabled={!selectedTenant || Number(topUpAmount) <= 0 || topUpReason.trim().length < 3} onClick={handleTopUp} type="button">Пополнить баланс</button></div>
        <div className="service-admin-action-box"><header><WalletCards size={18} /><div><strong>Пакет AI-диалогов</strong><span>Списание из баланса организации</span></div></header><label className="service-admin-reason-field"><span>Пакет</span><select onChange={(event) => setSelectedAiPackageId(event.target.value)} value={selectedAiPackageId}>{aiDialogPackages.map((item) => <option key={item.id} value={item.id}>{item.dialogCount.toLocaleString("ru-RU")} диалогов — {formatKopeks(item.priceKopeks)}</option>)}</select></label><button disabled={!selectedTenant || !selectedAiPackageId || topUpReason.trim().length < 3} onClick={handleAiPackagePurchase} type="button">Начислить пакет</button></div>

        <div className="tariff-card-grid">
          {tariffs.map((tariff) => (
            <button
              className={tariff.id === nextTariff?.id ? "selected" : ""}
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
              <span>{formatKopeks(tariff.priceMonthly)}</span>
              <small>до {tariff.includedUsers} пользователей · до {tariff.workspaceLimit} каналов</small>
            </button>
          ))}
        </div>

        <div className="service-admin-action-box">
          <header>
            <ShieldAlert size={18} />
            <div>
              <strong>Предпросмотр изменения биллинга</strong>
              <span>{currentTariff?.name} → {nextTariff?.name ?? "нет тарифа"}</span>
            </div>
          </header>
          <label className="service-admin-reason-field">
            <span>Причина</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </label>
          <div className="service-admin-action-buttons">
            <button disabled={!selectedTenant || !nextTariff || reason.trim().length < 8 || currentTariff?.id === nextTariff.id} onClick={handlePreview} type="button">
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
              <span><b>Дельта в месяц</b>{formatKopeks(currentPreview.monthlyDelta)}</span>
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
