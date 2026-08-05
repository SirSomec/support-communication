import React, { useEffect, useState } from "react";
import { Bot, CreditCard, Gauge, WalletCards } from "lucide-react";
import { tenantBillingService } from "../../services/tenantBillingService.js";
import { SettingsModal } from "./SettingsPrimitives.jsx";

export function BillingPanel({ onToast }) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  const [operatorSettings, setOperatorSettings] = useState(null);
  const [operatorLimit, setOperatorLimit] = useState(1);
  const [savingOperatorLimit, setSavingOperatorLimit] = useState(false);
  const [isBalanceOperationsOpen, setBalanceOperationsOpen] = useState(false);
  const [pendingAiPackage, setPendingAiPackage] = useState(null);
  const [purchasingAiPackage, setPurchasingAiPackage] = useState(false);

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
  const aiDialogQuota = quotas.find((quota) => quota.resource === "ai_dialogs");
  const aiDialogPackages = state.data?.aiDialogPackages ?? [];
  const monthlyCost = current?.billingAvailability === "free" ? 0 : Number(current?.priceMonthly ?? 0) * Number(operatorSettings?.operatorLimit ?? 1);
  const balanceOperations = (state.data?.invoices?.items ?? []).filter((invoice) => ["manual-balance", "internal-daily-charge", "internal-ai-package-purchase"].includes(invoice.provider) && invoice.paymentStatus === "succeeded");

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

  const openAiPackagePurchase = (aiPackage) => {
    setPendingAiPackage({
      ...aiPackage,
      idempotencyKey: crypto.randomUUID()
    });
  };

  const purchaseAiPackage = async () => {
    if (!pendingAiPackage) return;
    setPurchasingAiPackage(true);
    const response = await tenantBillingService.purchaseAiDialogPackage({
      idempotencyKey: pendingAiPackage.idempotencyKey,
      packageId: pendingAiPackage.id
    });
    if (response.status !== "ok") {
      setPurchasingAiPackage(false);
      onToast(response.error?.message ?? "Не удалось купить пакет AI-диалогов.");
      return;
    }

    const overview = await tenantBillingService.fetchOverview();
    setPurchasingAiPackage(false);
    setPendingAiPackage(null);
    if (overview.status === "ok") {
      setState({ data: overview.data, error: "", loading: false });
    }
    onToast(`Пакет на ${pendingAiPackage.dialogCount.toLocaleString("ru-RU")} AI-диалогов подключён.`);
  };

  return <section className="billing-panel">
    <header><CreditCard size={20} /><div><h2>Тариф и оплата</h2><p>Текущий доступ и использование ресурсов организации. Изменение тарифа выполняет администратор платформы.</p></div></header>
    <div className="billing-overview">
      <div className="billing-current"><strong>{current?.name ?? "Тариф не определён"}</strong><span>{current?.billingAvailability === "free" ? "Бесплатно" : `${formatMoney(current?.priceMonthly)} за оператора в месяц`}</span><small>{current?.ownerOnly ? "Один оператор-владелец" : `Текущая стоимость: ${formatMoney(monthlyCost)} в месяц · максимум ${current?.includedUsers ?? 0} операторов`}</small></div>
      <div aria-label="Текущий баланс" className="billing-balance"><WalletCards size={20} /><span>Текущий баланс</span><strong>{formatMoney(balance)}</strong><small>Пополняется администратором платформы</small></div>
    </div>
    <section className="billing-ai-dialogs"><strong>AI-диалоги</strong><span>{aiDialogQuota ? `${aiDialogQuota.remaining.toLocaleString("ru-RU")} из ${aiDialogQuota.limit.toLocaleString("ru-RU")} доступно` : "Пакет не подключён"}</span><small>Один диалог списывается после первого успешного ответа AI-бота.</small></section>
    <section className="billing-ai-packages" aria-labelledby="billing-ai-packages-title">
      <div className="billing-ai-packages__heading"><Bot size={19} /><div><h3 id="billing-ai-packages-title">Купить пакет AI-диалогов</h3><p>Стоимость спишется с текущего баланса. Пакеты суммируются и не сгорают.</p></div></div>
      <div className="billing-ai-packages__grid">{aiDialogPackages.map((aiPackage) => {
        const insufficientBalance = balance < aiPackage.priceKopeks;
        return <article key={aiPackage.id}>
          <strong>{aiPackage.dialogCount.toLocaleString("ru-RU")} диалогов</strong>
          <span>{formatMoney(aiPackage.priceKopeks)}</span>
          <small>{formatMoney(aiPackage.priceKopeks / aiPackage.dialogCount)} за диалог{aiPackage.discountPercent ? ` · скидка ${aiPackage.discountPercent}%` : ""}</small>
          <button disabled={insufficientBalance} onClick={() => openAiPackagePurchase(aiPackage)} type="button">{insufficientBalance ? "Недостаточно средств" : "Купить пакет"}</button>
        </article>;
      })}</div>
    </section>
    <section className="billing-balance-history"><h3>Операции баланса</h3><button className="billing-balance-history__open" onClick={() => setBalanceOperationsOpen(true)} type="button">Посмотреть операции{balanceOperations.length ? ` (${balanceOperations.length})` : ""}</button></section>
    {operatorSettings ? <section className="billing-operator-limit"><div><strong>Лимит операторов</strong><p>{operatorSettings.locked ? "На Free доступен только владелец организации." : `Выберите от ${operatorSettings.usedSeats} до ${operatorSettings.includedUsers} операторов. Это ограничит новые приглашения.`}</p></div><div className="billing-operator-limit__controls"><input aria-label="Лимит операторов" disabled={operatorSettings.locked || savingOperatorLimit} min={Math.max(1, operatorSettings.usedSeats)} max={operatorSettings.includedUsers} onChange={(event) => setOperatorLimit(event.target.value)} type="number" value={operatorLimit} /><button disabled={operatorSettings.locked || savingOperatorLimit || Number(operatorLimit) === operatorSettings.operatorLimit} onClick={saveOperatorLimit} type="button">{savingOperatorLimit ? "Сохранение…" : "Сохранить"}</button></div></section> : null}
    <h3><Gauge size={17} /> Лимиты</h3><div className="billing-quotas">{quotas.map((quota) => <div key={quota.resource}><span>{quota.resource}</span><strong>{quota.used} / {quota.limit}</strong><i><b style={{ width: `${quota.limit ? Math.min(100, quota.used / quota.limit * 100) : 100}%` }} /></i></div>)}</div>
    {isBalanceOperationsOpen ? <SettingsModal eyebrow="Тариф и оплата" footer={<button onClick={() => setBalanceOperationsOpen(false)} type="button">Закрыть</button>} onClose={() => setBalanceOperationsOpen(false)} size="wide" title="Операции баланса" titleId="billing-balance-operations-title">
      {balanceOperations.length ? <div className="billing-operations-table-wrap"><table className="billing-operations-table"><thead><tr><th scope="col">Дата</th><th scope="col">Операция</th><th scope="col">Сумма</th></tr></thead><tbody>{balanceOperations.map((invoice) => <tr key={invoice.id}><td>{formatDate(invoice.createdAt)}</td><td>{invoice.provider === "manual-balance" ? "Ручное пополнение" : invoice.provider === "internal-ai-package-purchase" ? "Покупка пакета AI-диалогов" : "Ежедневное списание"}</td><td className={invoice.provider === "manual-balance" ? "credit" : "debit"}>{invoice.provider === "manual-balance" ? "+" : "−"}{formatMoney(invoice.amountPaid)}</td></tr>)}</tbody></table></div> : <p className="billing-operations-empty">Операций по балансу пока нет.</p>}
    </SettingsModal> : null}
    {pendingAiPackage ? <SettingsModal eyebrow="Покупка AI-диалогов" footer={<><button disabled={purchasingAiPackage} onClick={() => setPendingAiPackage(null)} type="button">Отмена</button><button className="billing-ai-purchase-confirm" disabled={purchasingAiPackage} onClick={purchaseAiPackage} type="button">{purchasingAiPackage ? "Покупка…" : `Купить за ${formatMoney(pendingAiPackage.priceKopeks)}`}</button></>} onClose={() => { if (!purchasingAiPackage) setPendingAiPackage(null); }} title="Подтвердите покупку" titleId="billing-ai-purchase-title">
      <div className="billing-ai-purchase-summary"><strong>{pendingAiPackage.dialogCount.toLocaleString("ru-RU")} AI-диалогов</strong><p>С баланса будет списано {formatMoney(pendingAiPackage.priceKopeks)}. После покупки останется {formatMoney(balance - pendingAiPackage.priceKopeks)}.</p><small>Пакет сразу добавится к текущему остатку и не имеет срока действия.</small></div>
    </SettingsModal> : null}
  </section>;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(amount ?? 0) / 100);
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
}
