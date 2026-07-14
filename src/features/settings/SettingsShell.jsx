import React from "react";
import { Cable, ListChecks, ShieldCheck, Tags, TerminalSquare, UsersRound, Webhook } from "lucide-react";

// Навигация настроек: вертикальные группы разделов-экранов.
// Идентификаторы вкладок стабильны (settings-tab-*), на них опираются
// deep-link из уведомлений и smoke-тесты.
const navGroups = [
  {
    id: "channels",
    label: "Каналы",
    items: [
      { id: "connections", label: "Подключения", hint: "Мессенджеры, виджет и очереди приема", icon: Cable },
      { id: "sdk", label: "SDK-консоль", hint: "Сниппет, playground и события SDK", icon: TerminalSquare }
    ]
  },
  {
    id: "team",
    label: "Команда",
    items: [
      { id: "employees", label: "Сотрудники и роли", hint: "Доступы, группы и лимиты", icon: UsersRound },
      { id: "topics", label: "Тематики", hint: "Классификация и маршрутизация", icon: Tags }
    ]
  },
  {
    id: "control",
    label: "Контроль",
    items: [
      { id: "rules", label: "Правила", hint: "Ограничения обработки обращений", icon: ListChecks },
      { id: "api", label: "API и webhooks", hint: "Ключи, доставки, changelog", icon: Webhook },
      { id: "security", label: "Безопасность", hint: "Сессии, 2FA и диагностика", icon: ShieldCheck }
    ]
  }
];

export const settingsTabIds = navGroups.flatMap((group) => group.items.map((item) => item.id));

export function SettingsShell({ activeTab, children, onTabChange, summaries }) {
  function handleNavKeyDown(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();
    const currentIndex = settingsTabIds.indexOf(activeTab);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const nextTab = settingsTabIds[(currentIndex + step + settingsTabIds.length) % settingsTabIds.length];
    onTabChange(nextTab);
    document.getElementById(`settings-tab-${nextTab}`)?.focus();
  }

  return (
    <div className="settings-shell">
      <nav aria-label="Разделы настроек" className="settings-subnav" onKeyDown={handleNavKeyDown} role="tablist">
        {navGroups.map((group) => (
          <div className="settings-nav-group" key={group.id}>
            <span className="settings-nav-group-label" role="presentation">{group.label}</span>
            {group.items.map((tab) => {
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
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  title={tab.hint}
                  type="button"
                >
                  <Icon size={17} />
                  <span>
                    <strong>{tab.label}</strong>
                    <small>{summary ?? tab.hint}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
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
