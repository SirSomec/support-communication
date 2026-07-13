import React, { useEffect, useMemo, useState } from "react";
import { AdminLockedPanel } from "./AdminLockedPanel.jsx";
import { ApiGovernancePanel } from "./ApiGovernancePanel.jsx";
import { BackendIntegrationPanel } from "./BackendIntegrationPanel.jsx";
import { SecurityControlsPanel } from "./SecurityControlsPanel.jsx";
import {
  submitApiKeyRotation,
  submitSecuritySessionRevoke,
  submitWebhookReplay
} from "../../app/integrationAdminActions.js";
import { integrationService } from "../../services/integrationService.js";
import "./settings.css";

const EMPTY_WORKSPACE = {
  activeSecuritySessions: [],
  apiChangelog: [],
  apiEnvironmentKeys: [],
  securityAlerts: [],
  securityControls: [],
  webhookDeliveryLog: [],
  webhookEndpoints: []
};

export function AdminWorkspaces({ access, canEditSettings, onToast, roleMode, view = "all" }) {
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [selectedWebhookId, setSelectedWebhookId] = useState("");
  const [rotatedKeyIds, setRotatedKeyIds] = useState([]);
  const [replayedDeliveryIds, setReplayedDeliveryIds] = useState([]);
  const [revokedSessionIds, setRevokedSessionIds] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      setLoading(true);
      const response = await integrationService.fetchIntegrationWorkspace();

      if (cancelled) {
        return;
      }

      if (response.status === "ok" && response.data) {
        setWorkspace({
          activeSecuritySessions: response.data.activeSecuritySessions ?? [],
          apiChangelog: response.data.apiChangelog ?? [],
          apiEnvironmentKeys: response.data.apiEnvironmentKeys ?? [],
          securityAlerts: response.data.securityAlerts ?? [],
          securityControls: response.data.securityControls ?? [],
          webhookDeliveryLog: response.data.webhookDeliveryLog ?? [],
          webhookEndpoints: response.data.webhookEndpoints ?? []
        });
        setSelectedWebhookId((current) => current || response.data.webhookEndpoints?.[0]?.id || "");
      } else {
        setWorkspace(EMPTY_WORKSPACE);
      }

      setLoading(false);
    }

    loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  const {
    activeSecuritySessions,
    apiChangelog,
    apiEnvironmentKeys,
    securityAlerts,
    securityControls,
    webhookDeliveryLog,
    webhookEndpoints
  } = workspace;

  const selectedWebhook = webhookEndpoints.find((endpoint) => endpoint.id === selectedWebhookId) ?? webhookEndpoints[0] ?? null;
  const visibleWebhookDeliveries = useMemo(
    () => (selectedWebhook ? webhookDeliveryLog.filter((entry) => entry.endpointId === selectedWebhook.id) : []),
    [selectedWebhook, webhookDeliveryLog]
  );

  async function handleRotateApiKey(keyId) {
    if (!canEditSettings) {
      return;
    }

    const result = await submitApiKeyRotation(keyId, integrationService);
    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setRotatedKeyIds((current) => current.includes(result.keyId) ? current : [...current, result.keyId]);
    onToast(result.message);
  }

  async function handleReplayWebhook(delivery) {
    if (!canEditSettings) {
      return;
    }

    const result = await submitWebhookReplay(delivery, integrationService);
    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setReplayedDeliveryIds((current) => current.includes(result.deliveryId) ? current : [...current, result.deliveryId]);
    onToast(result.message);
  }

  async function handleRevokeSession(sessionId) {
    if (!canEditSettings) {
      return;
    }

    const result = await submitSecuritySessionRevoke(sessionId, integrationService);
    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setRevokedSessionIds((current) => current.includes(result.sessionId) ? current : [...current, result.sessionId]);
    onToast(result.message);
  }

  if (!canEditSettings) {
    return <AdminLockedPanel access={access} roleMode={roleMode} />;
  }

  if (loading) {
    return <div className="admin-workspace-layout">Загружаем данные администрирования…</div>;
  }

  const showApi = view === "all" || view === "api";
  const showSecurity = view === "all" || view === "security";

  return (
    <div className="admin-workspace-layout">
      {showApi ? (
        <ApiGovernancePanel
          apiChangelog={apiChangelog}
          apiEnvironmentKeys={apiEnvironmentKeys}
          onReplayDelivery={handleReplayWebhook}
          onRotateKey={handleRotateApiKey}
          onSelectWebhook={setSelectedWebhookId}
          replayedDeliveryIds={replayedDeliveryIds}
          rotatedKeyIds={rotatedKeyIds}
          selectedWebhook={selectedWebhook}
          visibleWebhookDeliveries={visibleWebhookDeliveries}
          webhookEndpoints={webhookEndpoints}
        />
      ) : null}
      {showSecurity ? (
        <>
          <SecurityControlsPanel
            activeSecuritySessions={activeSecuritySessions}
            onRevokeSession={handleRevokeSession}
            revokedSessionIds={revokedSessionIds}
            securityAlerts={securityAlerts}
            securityControls={securityControls}
          />
          <BackendIntegrationPanel />
        </>
      ) : null}
    </div>
  );
}
