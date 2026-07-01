import React from "react";
import { Cable, ListChecks, Tags, UsersRound } from "lucide-react";

const tabs = [
  {
    id: "connections",
    label: "Подключения",
    description: "Каналы, webhook, API keys",
    icon: Cable
  },
  {
    id: "employees",
    label: "Сотрудники и роли",
    description: "Доступы, группы, лимиты",
    icon: UsersRound
  },
  {
    id: "topics",
    label: "Справочник тематик",
    description: "Классификация и маршрутизация",
    icon: Tags
  },
  {
    id: "rules",
    label: "Правила",
    description: "Ограничения и контроль",
    icon: ListChecks
  }
];

export function SettingsShell({ activeTab, children, onTabChange, summaries }) {
  return (
    <div className="settings-shell">
      <nav className="settings-subnav" aria-label="Разделы настроек" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const summary = summaries?.[tab.id];

          return (
            <button
              aria-controls={`settings-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "active" : ""}
              id={`settings-tab-${tab.id}`}
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              role="tab"
              type="button"
            >
              <Icon size={18} />
              <span>
                <strong>{tab.label}</strong>
                <small>{summary ?? tab.description}</small>
              </span>
            </button>
          );
        })}
      </nav>
      <div
        aria-labelledby={`settings-tab-${activeTab}`}
        className="settings-subpage"
        id={`settings-panel-${activeTab}`}
        role="tabpanel"
      >
        {children}
      </div>
    </div>
  );
}
