import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { AdminWorkspaces } from "./AdminWorkspaces.jsx";
import { ChannelConnectionsPanel } from "./ChannelConnectionsPanel.jsx";
import { EmployeeManagementPanel } from "./EmployeeManagementPanel.jsx";
import { ExternalAppPanel } from "./ExternalAppPanel.jsx";
import { RulesPanel } from "./RulesPanel.jsx";
import { SettingsShell, settingsTabIds } from "./SettingsShell.jsx";
import { SdkConsolePanel } from "./SdkConsolePanel.jsx";
import { TopicDirectoryPanel } from "./TopicDirectoryPanel.jsx";
import { settingsService } from "../../services/settingsService.js";

export function SettingsScreen({ onBack, onToast, access, roleMode, onTopicOptionsChange, navigationTarget = null }) {
  const requestedTab = resolveSettingsNavigationTab(navigationTarget);
  const requestedNavigationKey = settingsNavigationKey(navigationTarget);
  const hasNavigationTarget = Boolean(navigationTarget);
  const appliedNavigationKeyRef = useRef(requestedTab ? requestedNavigationKey : "");
  const [activeTab, setActiveTab] = useState(requestedTab || "connections");
  const [connectionSummary, setConnectionSummary] = useState({ active: 0, total: 0 });
  const [externalSummary, setExternalSummary] = useState({ active: 0, total: 0 });
  const [employeeSummary, setEmployeeSummary] = useState({ total: 0 });
  const [topicTotals, setTopicTotals] = useState({ active: 0, archived: 0, total: 0 });
  const [rulesSummary, setRulesSummary] = useState({ active: 0 });
  const [loadError, setLoadError] = useState("");
  const canEditSettings = access.canManageSettings && !loadError;

  useEffect(() => {
    if (!requestedTab) {
      if (!hasNavigationTarget) {
        appliedNavigationKeyRef.current = "";
      }
      return;
    }
    if (requestedNavigationKey !== appliedNavigationKeyRef.current) {
      appliedNavigationKeyRef.current = requestedNavigationKey;
      setActiveTab(requestedTab);
    }
  }, [hasNavigationTarget, requestedNavigationKey, requestedTab]);

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
    connections: `${connectionSummary.active} из ${connectionSummary.total} активны`,
    external: externalSummary.total ? `${externalSummary.active} из ${externalSummary.total} активны` : "нет подключений",
    employees: `${employeeSummary.total} сотрудников`,
    topics: `${topicTotals.active} активных / ${topicTotals.archived} архив`,
    rules: `${rulesSummary.active} активных правил`
  };

  return (
    <section className="product-screen settings-screen">
      <header className="settings-header">
        <div className="settings-header-main">
          <button className="back-link" onClick={onBack} type="button">
            <ChevronLeft size={18} />
            Диалоги
          </button>
          <div>
            <h1>Настройки</h1>
            <p>Управление рабочим пространством: каналы, команда и правила обработки обращений.</p>
          </div>
        </div>
        {loadError ? (
          <div className="settings-load-error" role="alert">
            <AlertTriangle size={16} />
            <div>
              <strong>{loadError}</strong>
              <span>Изменения заблокированы до восстановления backend.</span>
            </div>
          </div>
        ) : null}
      </header>

      <SettingsShell activeTab={activeTab} onTabChange={setActiveTab} summaries={summaries}>
        {activeTab === "connections" ? (
          <ChannelConnectionsPanel
            access={access}
            canEditSettings={canEditSettings}
            focusChannelType={navigationTarget?.tab === "connections" ? navigationTarget.channelType : ""}
            focusConnectionId={navigationTarget?.tab === "connections" ? navigationTarget.connectionId : ""}
            onSummaryChange={setConnectionSummary}
            onToast={onToast}
          />
        ) : null}

        {activeTab === "external" ? (
          <ExternalAppPanel
            access={access}
            canEditSettings={canEditSettings}
            onSummaryChange={setExternalSummary}
            onToast={onToast}
          />
        ) : null}

        {activeTab === "sdk" ? (
          <SdkConsolePanel
            access={access}
            canEditSettings={canEditSettings}
            onToast={onToast}
          />
        ) : null}

        {activeTab === "api" ? (
          <AdminWorkspaces
            access={access}
            canEditSettings={canEditSettings}
            onToast={onToast}
            roleMode={roleMode}
            view="api"
          />
        ) : null}

        {activeTab === "security" ? (
          <AdminWorkspaces
            access={access}
            canEditSettings={canEditSettings}
            onToast={onToast}
            roleMode={roleMode}
            view="security"
          />
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
    </section>
  );
}

function resolveSettingsNavigationTab(navigationTarget) {
  const tab = typeof navigationTarget?.tab === "string" ? navigationTarget.tab : "";
  return settingsTabIds.includes(tab) ? tab : "";
}

function settingsNavigationKey(navigationTarget) {
  if (!navigationTarget) return "";
  return [
    navigationTarget.navigationKey,
    navigationTarget.tab,
    navigationTarget.channelType,
    navigationTarget.connectionId,
    navigationTarget.resourceId
  ].map((value) => String(value ?? "")).join(":");
}
