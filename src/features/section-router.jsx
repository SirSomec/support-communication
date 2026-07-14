import React from "react";
import { ChevronLeft } from "lucide-react";
import { AuditScreen } from "./audit/AuditScreen.jsx";
import { AutomationScreen } from "./automation/AutomationScreen.jsx";
import { ClientsScreen } from "./clients/ClientsScreen.jsx";
import { KnowledgeScreen } from "./knowledge/KnowledgeScreen.jsx";
import { PanelScreen } from "./panel/PanelScreen.jsx";
import { QualityScreen } from "./quality/QualityScreen.jsx";
import { ReportsScreen } from "./reports/ReportsScreen.jsx";
import { SettingsScreen } from "./settings/SettingsScreen.jsx";
import { TemplatesScreen } from "./templates/TemplatesScreen.jsx";
import { VisitorsScreen } from "./visitors/VisitorsScreen.jsx";
import "./workspace-sections.css";

export function SectionRouter({
  section,
  onBack,
  conversations,
  templates,
  onTemplatesChange,
  onToast,
  access,
  presenceVersion = 0,
  roleMode,
  onRoleMode,
  onTopicOptionsChange,
  operator,
  topicOptions,
  navigationTarget
}) {
  const screenProps = { onBack, conversations, templates, onTemplatesChange, onToast, access, presenceVersion, roleMode, onRoleMode, onTopicOptionsChange, operator, topicOptions, navigationTarget };

  if (!access.sections.includes(section)) {
    return (
      <section className="secondary-screen" aria-label="Доступ ограничен">
        <div className="secondary-header">
          <button onClick={onBack} type="button"><ChevronLeft size={18} /> Диалоги</button>
          <h1>Доступ ограничен</h1>
          <p>{access.reason}</p>
        </div>
      </section>
    );
  }

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

  if (section === "knowledge") {
    return <KnowledgeScreen {...screenProps} />;
  }

  if (section === "automation") {
    return <AutomationScreen {...screenProps} />;
  }

  if (section === "audit") {
    return <AuditScreen {...screenProps} />;
  }

  if (section === "settings") {
    return <SettingsScreen {...screenProps} />;
  }

  return (
    <section className="secondary-screen" aria-label="Раздел не найден">
      <div className="secondary-header">
        <button onClick={onBack} type="button"><ChevronLeft size={18} /> Диалоги</button>
        <h1>Раздел не найден</h1>
        <p>Такой раздел не найден. Вернитесь к диалогам и продолжите работу.</p>
      </div>
    </section>
  );
}
