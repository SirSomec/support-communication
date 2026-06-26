import React from "react";
import { Bot, ChevronLeft, Clock3, Gauge, Inbox, Plus, SlidersHorizontal } from "lucide-react";
import { ClientsScreen } from "./clients/ClientsScreen.jsx";
import { PanelScreen } from "./panel/PanelScreen.jsx";
import { QualityScreen } from "./quality/QualityScreen.jsx";
import { ReportsScreen } from "./reports/ReportsScreen.jsx";
import { TemplatesScreen } from "./templates/TemplatesScreen.jsx";
import { VisitorsScreen } from "./visitors/VisitorsScreen.jsx";
import {
  AutomationScreen,
  SettingsScreen,
} from "../sections.jsx";

export function SectionPlaceholder({
  section,
  onBack,
  conversations,
  templates,
  onTemplatesChange,
  onToast,
  access,
  roleMode,
  onRoleMode
}) {
  const screenProps = { onBack, conversations, templates, onTemplatesChange, onToast, access, roleMode, onRoleMode };

  if (section === "panel") {
    return <PanelScreen {...screenProps} />;
  }

  if (section === "clients") {
    return <ClientsScreen {...screenProps} />;
  }

  if (section === "templates") {
    return <TemplatesScreen {...screenProps} />;
  }

  if (section === "visitors") {
    return <VisitorsScreen {...screenProps} />;
  }

  if (section === "reports") {
    return <ReportsScreen {...screenProps} />;
  }

  if (section === "quality") {
    return <QualityScreen {...screenProps} />;
  }

  if (section === "automation") {
    return <AutomationScreen {...screenProps} />;
  }

  if (section === "settings") {
    return <SettingsScreen {...screenProps} />;
  }

  const labels = {
    panel: "Панель смены",
    clients: "Клиенты",
    templates: "Шаблоны",
    visitors: "Визиты",
    reports: "Отчеты",
    quality: "Качество",
    automation: "Боты",
    settings: "Настройки"
  };

  return (
    <section className="secondary-screen">
      <div className="secondary-header">
        <button onClick={onBack}><ChevronLeft size={18} /> Диалоги</button>
        <h1>{labels[section]}</h1>
        <p>Раздел подготовлен как часть навигации первого фронтенд-среза.</p>
      </div>
      <div className="secondary-grid">
        <MetricCard icon={<Gauge size={22} />} label="Операторы онлайн" value="18" trend="+3 к часу назад" />
        <MetricCard icon={<Clock3 size={22} />} label="В перерыве" value="4" trend="среднее 12 мин" />
        <MetricCard icon={<Inbox size={22} />} label="Активные диалоги" value="126" trend="82% в SLA" />
        <MetricCard icon={<Bot size={22} />} label="Обработано ботом" value="37" trend="за смену" />
      </div>
      <div className="secondary-table">
        <header>
          <h2>Очереди и каналы</h2>
          <button><Plus size={16} /> Добавить настройку</button>
        </header>
        {["SDK", "Telegram", "MAX", "VK"].map((channel, index) => (
          <div className="table-row" key={channel}>
            <span className={`channel-chip ${channel.toLowerCase()}`}>{channel}</span>
            <b>{42 - index * 7} активных</b>
            <span>{8 + index} ожидают</span>
            <span>{index === 0 ? "лимит 12 на оператора" : "лимит 8 на оператора"}</span>
            <button><SlidersHorizontal size={16} /> Настроить</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value, trend }) {
  return (
    <article className="metric-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{trend}</small>
    </article>
  );
}
