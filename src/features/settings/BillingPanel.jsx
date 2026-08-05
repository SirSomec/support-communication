import React, { useEffect, useState } from "react";
import { CreditCard, Gauge, WalletCards } from "lucide-react";
import { tenantBillingService } from "../../services/tenantBillingService.js";

export function BillingPanel({ onToast }) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const [operatorSettings, setOperatorSettings] = useState(null);
  const [operatorLimit, setOperatorLimit] = useState(1);
  const [savingOperatorLimit, setSavingOperatorLimit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([tenantBillingService.fetchOverview(), tenantBillingService.fetchOperatorLimit()]).then(([overview, limit]) => {
      if (cancelled) return;
      if (limit.status === "ok") {
        setOperatorSettings(limit.data);
        setOperatorLimit(limit.data.operatorLimit);
      }
      setState(overview.status === "ok"
        ? { data: overview.data, error: "", loading: false }
        : { data: null, error: overview.error?.message ?? "Не удалось загрузить биллинг.", loading: false });
    });
    return () => { cancelled = true; };
  }, []);

  if (state.loading) return <div className="settings-empty">Загрузка тарифа и лимитов…</div>;
  if (state.error) return <div className="settings-empty" role="alert">{state.error}</div>;
  const current = state.data?.subscription?.tariff;
  const quotas = state.data?.quotas ?? [];
  const balance = state.data?.balance?.amountKopeks ?? 0;
  const monthlyCost = current?.billingAvailability === "free" ? 0 : Number(current?.priceMonthly ?? 0) * Number(operatorSettings?.operatorLimit ?? 1);
  const balanceOperations = (state.data?.invoices?.items ?? []).filter((invoice) => ["manual-balance", "internal-daily-charge"].includes(invoice.provider) && invoice.paymentStatus === "succeeded").slice(0, 5);

  const saveOperatorLimit = async () => {
    setSavingOperatorLimit(true);
    const response = await tenantBillingService.updateOperatorLimit(Number(operatorLimit));
    setSavingOperatorLimit(false);
    if (response.status !== "ok") {
      onToast(response.error?.message ?? "Не удалось сохранить лимит операторов.");
      return;
    }
    setOperatorSettings(response.data);
    setOperatorLimit(response.data.operatorLimit);
    onToast("Лимит операторов сохранён.");
  };

  return <section className="billing-panel">
    <header><CreditCard size={20} /><div><h2>Тариф и оплата</h2><p>Текущий доступ и использование ресурсов организации. Изменение тарифа выполняет администратор платформы.</p></div></header>
    <div className="billing-overview">
      <div className="billing-current"><strong>{current?.name ?? "Тариф не определён"}</strong><span>{current?.billingAvailability === "free" ? "Бесплатно" : `${formatMoney(current?.priceMonthly)} за оператора в месяц`}</span><small>{current?.ownerOnly ? "Один оператор-владелец" : `Текущая стоимость: ${formatMoney(monthlyCost)} в месяц · максимум ${current?.includedUsers ?? 0} операторов`}</small></div>
      <div aria-label="Текущий баланс" className="billing-balance"><WalletCards size={20} /><span>Текущий баланс</span><strong>{formatMoney(balance)}</strong><small>Пополняется администратором платформы</small></div>
    </div>
    {balanceOperations.length ? <section className="billing-balance-history"><h3>Операции баланса</h3><div className="billing-quotas">{balanceOperations.map((invoice) => <div key={invoice.id}><span>{invoice.provider === "internal-daily-charge" ? "Ежедневное списание" : "Ручное пополнение"}</span><strong>{invoice.provider === "internal-daily-charge" ? "−" : "+"}{formatMoney(invoice.amountPaid)}</strong><small>{formatDate(invoice.createdAt)}</small></div>)}</div></section> : null}
    {operatorSettings ? <section className="billing-operator-limit"><div><strong>Лимит операторов</strong><p>{operatorSettings.locked ? "На Free доступен только владелец организации." : `Выберите от ${operatorSettings.usedSeats} до ${operatorSettings.includedUsers} операторов. Это ограничит новые приглашения.`}</p></div><div className="billing-operator-limit__controls"><input aria-label="Лимит операторов" disabled={operatorSettings.locked || savingOperatorLimit} min={Math.max(1, operatorSettings.usedSeats)} max={operatorSettings.includedUsers} onChange={(event) => setOperatorLimit(event.target.value)} type="number" value={operatorLimit} /><button disabled={operatorSettings.locked || savingOperatorLimit || Number(operatorLimit) === operatorSettings.operatorLimit} onClick={saveOperatorLimit} type="button">{savingOperatorLimit ? "Сохранение…" : "Сохранить"}</button></div></section> : null}
    <h3><Gauge size={17} /> Лимиты</h3><div className="billing-quotas">{quotas.map((quota) => <div key={quota.resource}><span>{quota.resource}</span><strong>{quota.used} / {quota.limit}</strong><i><b style={{ width: `${quota.limit ? Math.min(100, quota.used / quota.limit * 100) : 100}%` }} /></i></div>)}</div>
  </section>;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(amount ?? 0) / 100);
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
}
