import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft } from "lucide-react";
import { AdminWorkspaces } from "./AdminWorkspaces.jsx";
import { ChannelConnectionsPanel } from "./ChannelConnectionsPanel.jsx";
import { EmployeeManagementPanel } from "./EmployeeManagementPanel.jsx";
import { ExternalAppPanel } from "./ExternalAppPanel.jsx";
import { GroupManagementPanel } from "./GroupManagementPanel.jsx";
import { IntegrationCenterPanel } from "./IntegrationCenterPanel.jsx";
import { RulesPanel } from "./RulesPanel.jsx";
import { SettingsShell, settingsTabIds } from "./SettingsShell.jsx";
import { SdkConsolePanel } from "./SdkConsolePanel.jsx";
import { TopicDirectoryPanel } from "./TopicDirectoryPanel.jsx";
import { integrationService } from "../../services/integrationService.js";
import { settingsService } from "../../services/settingsService.js";

export function SettingsScreen({ onBack, onToast, access, roleMode, onTopicOptionsChange, navigationTarget = null }) {
  const requestedTab = resolveSettingsNavigationTab(navigationTarget);
  const requestedNavigationKey = settingsNavigationKey(navigationTarget);
  const hasNavigationTarget = Boolean(navigationTarget);
  const appliedNavigationKeyRef = useRef(requestedTab ? requestedNavigationKey : "");
  const connectionSummaryLoadedRef = useRef(false);
  const [activeTab, setActiveTab] = useState(requestedTab || "connections");
  const [integrationWorkspace, setIntegrationWorkspace] = useState(() => navigationTarget?.channelType || navigationTarget?.connectionId ? "channels" : "center");
  const [connectionSummary, setConnectionSummary] = useState(null);
  const [externalSummary, setExternalSummary] = useState({ active: 0, total: 0 });
  const [employeeSummary, setEmployeeSummary] = useState({ total: 0 });
  const [groupSummary, setGroupSummary] = useState({ total: 0 });
  const [topicTotals, setTopicTotals] = useState({ active: 0, archived: 0, total: 0 });
  const [rulesSummary, setRulesSummary] = useState({ active: 0 });
  const [loadError, setLoadError] = useState("");
  const canEditSettings = access.canManageSettings && !loadError;

  function handleSettingsTabChange(tab) {
    setActiveTab(tab);
    if (tab === "connections") {
      setIntegrationWorkspace("center");
    }
  }

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
      if (requestedTab === "connections") {
        setIntegrationWorkspace(navigationTarget?.channelType || navigationTarget?.connectionId ? "channels" : "center");
      }
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
      setGroupSummary({ total: employees.data?.groups?.length ?? 0 });
      setTopicTotals(topics.data?.totals ?? { active: 0, archived: 0, total: 0 });
      setRulesSummary({ active: rules.data?.totals?.active ?? 0 });
    }

    loadSummaries();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab === "connections" || connectionSummaryLoadedRef.current) {
      return undefined;
    }

    let cancelled = false;
    integrationService.fetchChannelConnections().then((response) => {
      if (cancelled) {
        return;
      }
      connectionSummaryLoadedRef.current = true;
      if (response.status !== "ok") {
        setConnectionSummary({ unavailable: true });
        return;
      }
      const connections = response.data?.connections ?? [];
      setConnectionSummary({
        active: connections.filter((connection) => connection.status === "active").length,
        total: connections.length
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  function handleConnectionSummaryChange(summary) {
    connectionSummaryLoadedRef.current = true;
    setConnectionSummary(summary);
  }

  const summaries = {
    connections: connectionSummary?.unavailable
      ? "данные недоступны"
      : connectionSummary
        ? `${connectionSummary.active} из ${connectionSummary.total} активны`
        : "загрузка...",
    external: externalSummary.total ? `${externalSummary.active} из ${externalSummary.total} активны` : "нет подключений",
    employees: `${employeeSummary.total} сотрудников`,
    groups: `${groupSummary.total} групп`,
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

      <SettingsShell activeTab={activeTab} onTabChange={handleSettingsTabChange} summaries={summaries}>
        {activeTab === "connections" ? (
          <IntegrationWorkspace
            access={access}
            canEditSettings={canEditSettings}
            focusChannelType={navigationTarget?.tab === "connections" ? navigationTarget.channelType : ""}
            focusConnectionId={navigationTarget?.tab === "connections" ? navigationTarget.connectionId : ""}
            onSummaryChange={handleConnectionSummaryChange}
            onToast={onToast}
            onWorkspaceChange={setIntegrationWorkspace}
            roleMode={roleMode}
            workspace={integrationWorkspace}
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
            onOpenGroups={() => setActiveTab("groups")}
            onToast={onToast}
            roleMode={roleMode}
          />
        ) : null}

        {activeTab === "groups" ? (
          <GroupManagementPanel
            access={access}
            canEditSettings={canEditSettings}
            onSummaryChange={setGroupSummary}
            onToast={onToast}
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

function IntegrationWorkspace({
  access,
  canEditSettings,
  focusChannelType,
  focusConnectionId,
  onSummaryChange,
  onToast,
  onWorkspaceChange,
  roleMode,
  workspace
}) {
  if (workspace === "center") {
    return (
      <IntegrationCenterPanel
        access={access}
        canEditSettings={canEditSettings}
        onManage={onWorkspaceChange}
        onSummaryChange={onSummaryChange}
        onToast={onToast}
      />
    );
  }

  const titles = {
    api: "API и webhooks",
    channels: "Управление каналами",
    external: "Внешнее приложение",
    sdk: "Виджет и SDK"
  };

  return (
    <section className="integration-workspace-detail" aria-label={titles[workspace] ?? "Интеграции"}>
      <header>
        <button className="back-link" onClick={() => onWorkspaceChange("center")} type="button">
          <ChevronLeft size={18} /> Центр интеграций
        </button>
        <div>
          <h2>{titles[workspace] ?? "Интеграции"}</h2>
          <p>Расширенные параметры доступны здесь, но начать новое подключение можно в Центре интеграций.</p>
        </div>
      </header>
      <div className="integration-workspace-body">
        {workspace === "channels" ? (
          <ChannelConnectionsPanel
            access={access}
            canEditSettings={canEditSettings}
            focusChannelType={focusChannelType}
            focusConnectionId={focusConnectionId}
            onSummaryChange={onSummaryChange}
            onToast={onToast}
          />
        ) : null}
        {workspace === "external" ? (
          <ExternalAppPanel
            access={access}
            canEditSettings={canEditSettings}
            onSummaryChange={() => {}}
            onToast={onToast}
          />
        ) : null}
        {workspace === "sdk" ? (
          <SdkConsolePanel
            access={access}
            canEditSettings={canEditSettings}
            onToast={onToast}
          />
        ) : null}
        {workspace === "api" ? (
          <AdminWorkspaces
            access={access}
            canEditSettings={canEditSettings}
            onToast={onToast}
            roleMode={roleMode}
            view="api"
          />
        ) : null}
      </div>
    </section>
  );
}

function resolveSettingsNavigationTab(navigationTarget) {
  const tab = typeof navigationTarget?.tab === "string" ? navigationTarget.tab : "";
  if (["external", "sdk", "api"].includes(tab)) {
    return "connections";
  }
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
