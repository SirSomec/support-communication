import React, { useMemo, useState } from "react";
import {
  activeSecuritySessions,
  apiChangelog,
  apiEnvironmentKeys,
  securityAlerts,
  securityControls,
  webhookDeliveryLog,
  webhookEndpoints
} from "../../data.js";
import { AdminLockedPanel } from "./AdminLockedPanel.jsx";
import { ApiGovernancePanel } from "./ApiGovernancePanel.jsx";
import { SecurityControlsPanel } from "./SecurityControlsPanel.jsx";
import "./settings.css";

export function AdminWorkspaces({ access, canEditSettings, onToast, roleMode }) {
  const [selectedWebhookId, setSelectedWebhookId] = useState(webhookEndpoints[0].id);
  const [rotatedKeyIds, setRotatedKeyIds] = useState([]);
  const [replayedDeliveryIds, setReplayedDeliveryIds] = useState([]);
  const [revokedSessionIds, setRevokedSessionIds] = useState([]);

  const selectedWebhook = webhookEndpoints.find((endpoint) => endpoint.id === selectedWebhookId) ?? webhookEndpoints[0];
  const visibleWebhookDeliveries = useMemo(
    () => webhookDeliveryLog.filter((entry) => entry.endpointId === selectedWebhook.id),
    [selectedWebhook.id]
  );

  function handleRotateApiKey(keyId) {
    if (!canEditSettings) {
      return;
    }

    setRotatedKeyIds((current) => current.includes(keyId) ? current : [...current, keyId]);
    onToast(`${keyId}: ключ поставлен на ротацию, audit event подготовлен.`);
  }

  function handleReplayWebhook(delivery) {
    if (!canEditSettings) {
      return;
    }

    setReplayedDeliveryIds((current) => current.includes(delivery.id) ? current : [...current, delivery.id]);
    onToast(`${delivery.traceId}: manual replay поставлен в очередь.`);
  }

  function handleRevokeSession(sessionId) {
    if (!canEditSettings) {
      return;
    }

    setRevokedSessionIds((current) => current.includes(sessionId) ? current : [...current, sessionId]);
    onToast(`${sessionId}: сессия отозвана и попадет в security audit.`);
  }

  if (!canEditSettings) {
    return <AdminLockedPanel access={access} roleMode={roleMode} />;
  }

  return (
    <div className="admin-workspace-layout">
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
      <SecurityControlsPanel
        activeSecuritySessions={activeSecuritySessions}
        onRevokeSession={handleRevokeSession}
        revokedSessionIds={revokedSessionIds}
        securityAlerts={securityAlerts}
        securityControls={securityControls}
      />
    </div>
  );
}
