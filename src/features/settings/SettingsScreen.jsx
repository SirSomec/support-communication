import React, { useMemo, useState } from "react";
import { ProductScreen } from "../../ui.jsx";
import { channelSettings, employeeChannelRules, topicDirectorySeed } from "../../data.js";
import { createScreenStateItems } from "../../app/screenState.js";
import { AdminWorkspaces } from "./AdminWorkspaces.jsx";
import { ChannelConnectionsPanel } from "./ChannelConnectionsPanel.jsx";
import { EmployeeManagementPanel } from "./EmployeeManagementPanel.jsx";
import { RulesPanel } from "./RulesPanel.jsx";
import { SettingsAccessPanel } from "./SettingsAccessPanel.jsx";
import { SettingsShell } from "./SettingsShell.jsx";
import { SdkConsolePanel } from "./SdkConsolePanel.jsx";
import { TopicDirectoryPanel } from "./TopicDirectoryPanel.jsx";

export function SettingsScreen({ onBack, onToast, access, roleMode, onRoleMode, onTopicOptionsChange }) {
  const [activeTab, setActiveTab] = useState("connections");
  const [connectionSummary, setConnectionSummary] = useState({ active: 0, total: 0 });
  const canEditSettings = access.canManageSettings;
  const topicTotals = useMemo(() => countTopics(topicDirectorySeed), []);

  const summaries = {
    connections: `${connectionSummary.total} подключений, ${connectionSummary.active} активных`,
    employees: `${employeeChannelRules.length} сотрудников, роли и лимиты`,
    topics: `${topicTotals.active} активных / ${topicTotals.archived} архив`,
    rules: "4 активных правила"
  };

  return (
    <ProductScreen
      title="Настройки"
      subtitle="Подключения, сотрудники, справочник тематик и правила обработки обращений."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: channelSettings.length,
        empty: `${channelSettings.length} каналов`,
        emptyWhenZero: "каналы не настроены",
        errors: 0,
        errorLabel: "критичных ошибок нет"
      })}
    >
      <SettingsAccessPanel
        canEditSettings={canEditSettings}
        onRoleMode={onRoleMode}
        roleMode={roleMode}
      />

      <SettingsShell activeTab={activeTab} onTabChange={setActiveTab} summaries={summaries}>
        {activeTab === "connections" ? (
          <>
            <div className="integration-layout">
              <ChannelConnectionsPanel
                access={access}
                canEditSettings={canEditSettings}
                onSummaryChange={setConnectionSummary}
                onToast={onToast}
              />

              <SdkConsolePanel
                access={access}
                canEditSettings={canEditSettings}
                onToast={onToast}
              />
            </div>
            <AdminWorkspaces
              access={access}
              canEditSettings={canEditSettings}
              onToast={onToast}
              roleMode={roleMode}
            />
          </>
        ) : null}

        {activeTab === "employees" ? (
          <EmployeeManagementPanel
            access={access}
            canEditSettings={canEditSettings}
            canResetEmployeePassword={access.canResetPasswords}
            onToast={onToast}
            roleMode={roleMode}
          />
        ) : null}

        {activeTab === "topics" ? (
          <TopicDirectoryPanel
            access={access}
            canEditSettings={canEditSettings}
            onTopicOptionsChange={onTopicOptionsChange}
            onToast={onToast}
            roleMode={roleMode}
          />
        ) : null}

        {activeTab === "rules" ? (
          <RulesPanel
            access={access}
            canEditSettings={canEditSettings}
            onToast={onToast}
          />
        ) : null}
      </SettingsShell>
    </ProductScreen>
  );
}

function countTopics(directory) {
  return directory.reduce((totals, group) => {
    group.branches.forEach((branch) => {
      branch.children.forEach((topic) => {
        if (topic.archived) {
          totals.archived += 1;
        } else {
          totals.active += 1;
        }
      });
    });
    return totals;
  }, { active: 0, archived: 0 });
}
