import React, { useEffect, useState } from "react";
import { CreditCard, Gauge } from "lucide-react";
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
    <header><CreditCard size={20} /><div><h2>Тариф и лимиты</h2><p>Текущий доступ и использование ресурсов организации. Изменение тарифа выполняет администратор платформы.</p></div></header>
    <div className="billing-current"><strong>{current?.name ?? "Тариф не определён"}</strong><span>{current?.billingAvailability === "free" ? "Бесплатно" : `${formatMoney(current?.priceMonthly)} в месяц`}</span><small>{current?.ownerOnly ? "Один оператор-владелец" : `Включено мест: ${current?.includedUsers ?? 0}`}</small></div>
    {operatorSettings ? <section className="billing-operator-limit"><div><strong>Лимит операторов</strong><p>{operatorSettings.locked ? "На Free доступен только владелец организации." : `Выберите от ${operatorSettings.usedSeats} до ${operatorSettings.includedUsers} операторов. Это ограничит новые приглашения.`}</p></div><div className="billing-operator-limit__controls"><input aria-label="Лимит операторов" disabled={operatorSettings.locked || savingOperatorLimit} min={Math.max(1, operatorSettings.usedSeats)} max={operatorSettings.includedUsers} onChange={(event) => setOperatorLimit(event.target.value)} type="number" value={operatorLimit} /><button disabled={operatorSettings.locked || savingOperatorLimit || Number(operatorLimit) === operatorSettings.operatorLimit} onClick={saveOperatorLimit} type="button">{savingOperatorLimit ? "Сохранение…" : "Сохранить"}</button></div></section> : null}
    <h3><Gauge size={17} /> Лимиты</h3><div className="billing-quotas">{quotas.map((quota) => <div key={quota.resource}><span>{quota.resource}</span><strong>{quota.used} / {quota.limit}</strong><i><b style={{ width: `${quota.limit ? Math.min(100, quota.used / quota.limit * 100) : 100}%` }} /></i></div>)}</div>
  </section>;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(amount ?? 0) / 100);
}
