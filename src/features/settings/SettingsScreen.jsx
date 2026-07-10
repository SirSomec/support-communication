import React, { useEffect, useState } from "react";
import { ProductScreen } from "../../ui.jsx";
import { createScreenStateItems } from "../../app/screenState.js";
import { AdminWorkspaces } from "./AdminWorkspaces.jsx";
import { ChannelConnectionsPanel } from "./ChannelConnectionsPanel.jsx";
import { EmployeeManagementPanel } from "./EmployeeManagementPanel.jsx";
import { RulesPanel } from "./RulesPanel.jsx";
import { SettingsAccessPanel } from "./SettingsAccessPanel.jsx";
import { SettingsShell } from "./SettingsShell.jsx";
import { SdkConsolePanel } from "./SdkConsolePanel.jsx";
import { TopicDirectoryPanel } from "./TopicDirectoryPanel.jsx";
import { settingsService } from "../../services/settingsService.js";

export function SettingsScreen({ onBack, onToast, access, roleMode, onRoleMode, onTopicOptionsChange, navigationTarget = null }) {
  const requestedTab = resolveSettingsNavigationTab(navigationTarget);
  const [activeTab, setActiveTab] = useState(requestedTab || "connections");
  const [connectionSummary, setConnectionSummary] = useState({ active: 0, total: 0 });
  const [employeeSummary, setEmployeeSummary] = useState({ total: 0 });
  const [topicTotals, setTopicTotals] = useState({ active: 0, archived: 0, total: 0 });
  const [rulesSummary, setRulesSummary] = useState({ active: 0 });
  const [loadError, setLoadError] = useState("");
  const canEditSettings = access.canManageSettings && !loadError;

  useEffect(() => {
    if (requestedTab && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
  }, [activeTab, requestedTab]);

  useEffect(() => {
    let cancelled = false;

    async function loadSummaries() {
      const [employees, topics, rules] = await Promise.all([
        settingsService.fetchEmployees(),
        settingsService.fetchTopics(),
        settingsService.fetchRules()
      ]);

      if (cancelled) {
        return;
      }

      if ([employees, topics, rules].some((response) => response.status !== "ok")) {
        setLoadError("Не удалось загрузить настройки из backend.");
        return;
      }

      setEmployeeSummary({ total: employees.data?.employees?.length ?? 0 });
      setTopicTotals(topics.data?.totals ?? { active: 0, archived: 0, total: 0 });
      setRulesSummary({ active: rules.data?.totals?.active ?? 0 });
    }

    loadSummaries();
    return () => {
      cancelled = true;
    };
  }, []);

  const summaries = {
    connections: `${connectionSummary.total} подключений, ${connectionSummary.active} активных`,
    employees: `${employeeSummary.total} сотрудников, роли и лимиты`,
    topics: `${topicTotals.active} активных / ${topicTotals.archived} архив`,
    rules: `${rulesSummary.active} активных правил`
  };

  return (
    <ProductScreen
      title="Настройки"
      subtitle="Подключения, сотрудники, справочник тематик и правила обработки обращений."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: connectionSummary.total,
        empty: `${connectionSummary.total} каналов`,
        emptyWhenZero: "каналы не настроены",
        errors: loadError ? 1 : 0,
        errorLabel: loadError || "критичных ошибок нет"
      })}
    >
      {loadError ? <div className="entity-empty"><strong>{loadError}</strong><span>Изменения заблокированы до восстановления backend.</span></div> : null}
      <SettingsAccessPanel
        canEditSettings={canEditSettings}
        onRoleMode={onRoleMode}
        onToast={onToast}
        roleMode={roleMode}
      />

      <SettingsShell activeTab={activeTab} onTabChange={setActiveTab} summaries={summaries}>
        {activeTab === "connections" ? (
          <>
            <div className="integration-layout">
              <ChannelConnectionsPanel
                access={access}
                canEditSettings={canEditSettings}
                focusChannelType={navigationTarget?.tab === "connections" ? navigationTarget.channelType : ""}
                focusConnectionId={navigationTarget?.tab === "connections" ? navigationTarget.connectionId : ""}
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

function resolveSettingsNavigationTab(navigationTarget) {
  const tab = typeof navigationTarget?.tab === "string" ? navigationTarget.tab : "";
  return ["connections", "employees", "topics", "rules"].includes(tab) ? tab : "";
}
