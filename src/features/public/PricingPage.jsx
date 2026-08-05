import React from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { publicCatalogService } from "../../services/publicCatalogService.js";
import "./public.css";

const featureLabels = { "shared-inbox": "Общий inbox", "website-chat": "Чат на сайте", "email-support": "Поддержка по email", "basic-analytics": "Базовая аналитика", omnichannel: "Омниканальность", routing: "Маршрутизация", sla: "SLA", exports: "Экспорт", sso: "SSO" };
const formatPrice = (amount) => new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(Number(amount ?? 0) / 100);

export function PricingPage({ onNavigateAuth = () => {}, onRequestDemo = () => {}, onStartFree = () => {} }) {
  const [tariffs, setTariffs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    void publicCatalogService.fetchTariffs().then((response) => {
      if (!cancelled) {
        setTariffs(response.status === "ok" && Array.isArray(response.data?.items) ? response.data.items : []);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);
  return <main className="public-page pricing-page">
    <header className="public-nav"><a className="public-brand" href="#/landing"><span>SC</span><strong>Support Communication</strong></a><nav><a href="#/landing">Продукт</a><a href="#/pricing">Тарифы</a><a href="#/docs">Документация API</a></nav><div className="public-nav-actions"><button className="public-btn ghost" onClick={onNavigateAuth} type="button">Войти</button><button className="public-btn primary" onClick={() => onStartFree({ plan: "free", source: "pricing-nav" })} type="button">Начать бесплатно</button></div></header>
    <section className="pricing-hero"><span>Тарифы</span><h1>Начните бесплатно. Масштабируйтесь, когда команда будет готова.</h1><p>Free включает одного оператора-владельца без карты. Выберите платный тариф, когда понадобятся команда и расширенные лимиты.</p></section>
    <section className="pricing-grid" aria-label="Тарифы Support Communication">{loading ? <p>Загрузка тарифов…</p> : tariffs.map((tariff) => {
      const free = tariff.billingAvailability === "free";
      const enterprise = tariff.id === "enterprise";
      return <article className={`pricing-card${free ? " featured" : ""}`} key={tariff.id}><header><strong>{tariff.name}</strong><span>{free ? "Для старта" : enterprise ? "Для крупных команд" : "За оператора в месяц"}</span></header><div className="pricing-price">{free ? "Бесплатно" : enterprise ? "По запросу" : formatPrice(tariff.priceMonthly)}</div><p>{tariff.ownerOnly ? "Один оператор — владелец организации" : `${formatPrice(tariff.priceMonthly)} за оператора · до ${tariff.includedUsers} операторов`}</p><ul>{(tariff.features ?? []).map((feature) => <li key={feature}><CheckCircle2 size={16} />{featureLabels[feature] ?? feature}</li>)}</ul>{enterprise ? <button className="public-btn secondary" onClick={() => onRequestDemo({ planInterest: "enterprise", source: "pricing-enterprise", title: "Запрос Enterprise" })} type="button">Связаться с нами</button> : <button className={`public-btn ${free ? "primary" : "secondary"}`} onClick={() => onStartFree({ plan: "free", source: "pricing-card" })} type="button">{free ? "Начать бесплатно" : "Начать с Free"}<ArrowRight size={16} /></button>}</article>;
    })}</section>
  </main>;
}

export default PricingPage;
