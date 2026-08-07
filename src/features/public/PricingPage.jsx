import React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { publicCatalogService } from "../../services/publicCatalogService.js";
import "./public.css";

const featureLabels = {
  "shared-inbox": "Все обращения в одном окне",
  "website-chat": "Чат на сайте",
  "email-support": "Поддержка по электронной почте",
  "basic-analytics": "Основные показатели работы",
  omnichannel: "Обращения из разных каналов в одном месте",
  routing: "Распределение обращений между сотрудниками",
  sla: "Контроль времени ответа",
  exports: "Выгрузка данных",
  "advanced-automation": "Автоматизация повторяющихся задач",
  "quality-ai": "Проверка качества ответов с помощью искусственного интеллекта",
  "custom-integrations": "Подключение нужных вам сервисов",
  sso: "Единый вход для сотрудников",
  "dedicated-success": "Персональный менеджер",
  "data-residency": "Хранение данных в выбранной стране",
  "custom-sla": "Согласованный срок ответа службы поддержки"
};
const formatPrice = (amount) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(amount ?? 0) / 100);

export function PricingPage({ onNavigateAuth = () => {}, onRequestDemo = () => {}, onStartFree = () => {} }) {
  const [tariffs, setTariffs] = React.useState([]);
  const [aiDialogPackages, setAiDialogPackages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    void publicCatalogService.fetchTariffs().then((response) => {
      if (!cancelled) {
        setTariffs(response.status === "ok" && Array.isArray(response.data?.items) ? response.data.items : []);
        setAiDialogPackages(response.status === "ok" && Array.isArray(response.data?.aiDialogPackages) ? response.data.aiDialogPackages : []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);
  return <main className="public-page pricing-page">
    <header className="public-nav"><a className="public-brand" href="/"><span>SC</span><strong>Support Communication</strong></a><nav><a href="/">Продукт</a><a href="/pricing/">Тарифы</a><a href="/docs/">Описание возможностей</a></nav><div className="public-nav-actions"><button className="public-btn ghost" onClick={onNavigateAuth} type="button">Войти</button><button className="public-btn primary" onClick={() => onStartFree({ plan: "free", source: "pricing-nav" })} type="button">Начать бесплатно</button></div></header>
    <section className="pricing-hero"><span>Тарифы</span><h1>Начните бесплатно — выберите подходящий вариант, когда команда станет больше.</h1><p>Бесплатный тариф подойдёт, чтобы попробовать сервис одному сотруднику. Банковская карта не нужна. Когда потребуется больше сотрудников или возможностей, выберите другой тариф.</p></section>
    <section className="pricing-grid" aria-label="Тарифы Support Communication">{loading ? <p>Загрузка тарифов…</p> : tariffs.map((tariff) => {
      const free = tariff.billingAvailability === "free";
      const enterprise = tariff.id === "enterprise";
      return <article className={`pricing-card${free ? " featured" : ""}`} key={tariff.id}><header><strong>{tariff.name}</strong><span>{free ? "Чтобы попробовать сервис" : enterprise ? "Для компаний с особыми требованиями" : "Стоимость за сотрудника в месяц"}</span></header>{!enterprise && <div className="pricing-price">{free ? "Бесплатно" : formatPrice(tariff.priceMonthly)}</div>}<p>{tariff.ownerOnly ? "Для одного сотрудника — владельца организации" : enterprise ? `До ${tariff.includedUsers} сотрудников` : `${formatPrice(tariff.priceMonthly)} за сотрудника · до ${tariff.includedUsers} сотрудников`}</p><ul>{(tariff.features ?? []).map((feature) => <li key={feature}><CheckCircle2 size={16} />{featureLabels[feature] ?? "Дополнительные возможности"}</li>)}</ul>{enterprise ? <button className="public-btn secondary" onClick={() => onRequestDemo({ planInterest: "enterprise", source: "pricing-enterprise", title: "Обсуждение индивидуального тарифа" })} type="button">Связаться с нами</button> : <button className={`public-btn ${free ? "primary" : "secondary"}`} onClick={() => onStartFree({ plan: tariff.id, source: "pricing-card" })} type="button">{free ? "Начать бесплатно" : "Выбрать тариф"}<ArrowRight size={16} /></button>}</article>;
    })}</section>
    <section className="pricing-hero"><span>AI-бот</span><h2>Пакеты обработанных диалогов</h2><p>AI-бот оплачивается отдельно от операторов. Диалог списывается один раз — после первого успешного ответа бота. Бесплатных AI-ответов нет.</p></section>
    <section className="pricing-grid" aria-label="Пакеты AI-диалогов">{aiDialogPackages.map((item) => <article className="pricing-card" key={item.id}><header><strong>{item.dialogCount.toLocaleString("ru-RU")} диалогов</strong><span>{item.discountPercent ? `Скидка ${item.discountPercent}%` : "Базовая стоимость 20 ₽ за диалог"}</span></header><div className="pricing-price">{formatPrice(item.priceKopeks)}</div><p>{formatPrice(Math.round(item.priceKopeks / item.dialogCount))} за обработанный диалог</p><button className="public-btn secondary" onClick={() => onStartFree({ plan: "free", source: `pricing-${item.id}` })} type="button">Начать работу<ArrowRight size={16} /></button></article>)}</section>
  </main>;
}

export default PricingPage;
