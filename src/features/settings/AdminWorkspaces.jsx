import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Plus } from "lucide-react";
import { AdminLockedPanel } from "./AdminLockedPanel.jsx";
import { ApiGovernancePanel, isEndpointDisabled } from "./ApiGovernancePanel.jsx";
import { BackendIntegrationPanel } from "./BackendIntegrationPanel.jsx";
import { SecurityControlsPanel } from "./SecurityControlsPanel.jsx";
import { FieldHint, InlineHint, SettingsModal, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { ConfirmDialog } from "../../ui.jsx";
import {
  submitApiKeyCreate,
  submitApiKeyRevoke,
  submitApiKeyRotation,
  submitSecuritySessionRevoke,
  submitWebhookEndpointCreate,
  submitWebhookEndpointDelete,
  submitWebhookEndpointUpdate,
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

const INITIAL_KEY_FORM = { environment: "stage", name: "", scopes: "" };
const INITIAL_ENDPOINT_FORM = { channel: "SDK", name: "", url: "" };

export function AdminWorkspaces({ access, canEditSettings, onToast, roleMode, view = "all" }) {
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [selectedWebhookId, setSelectedWebhookId] = useState("");
  const [rotatedKeyIds, setRotatedKeyIds] = useState([]);
  const [replayedDeliveryIds, setReplayedDeliveryIds] = useState([]);
  const [revokedSessionIds, setRevokedSessionIds] = useState([]);
  const [busy, setBusy] = useState("");

  const [isKeyModalOpen, setKeyModalOpen] = useState(false);
  const [keyForm, setKeyForm] = useState(INITIAL_KEY_FORM);
  const [keyFormError, setKeyFormError] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const [keyToRevoke, setKeyToRevoke] = useState(null);

  const [isEndpointModalOpen, setEndpointModalOpen] = useState(false);
  const [endpointForm, setEndpointForm] = useState(INITIAL_ENDPOINT_FORM);
  const [endpointFormError, setEndpointFormError] = useState("");
  const [endpointToEdit, setEndpointToEdit] = useState(null);
  const [endpointToDelete, setEndpointToDelete] = useState(null);

  const loadWorkspace = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }

    const response = await integrationService.fetchIntegrationWorkspace();

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
    } else if (!silent) {
      setWorkspace(EMPTY_WORKSPACE);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadWorkspace().catch(() => {
      if (!cancelled) {
        setWorkspace(EMPTY_WORKSPACE);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadWorkspace]);

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
    if (!canEditSettings || busy) {
      return;
    }

    setBusy(`rotate:${keyId}`);
    const result = await submitApiKeyRotation(keyId, integrationService).finally(() => setBusy(""));
    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setRotatedKeyIds((current) => current.includes(result.keyId) ? current : [...current, result.keyId]);
    onToast(result.message);
  }

  async function handleCreateApiKey(event) {
    event.preventDefault();
    if (!canEditSettings || busy) {
      return;
    }

    setBusy("create-key");
    setKeyFormError("");
    const result = await submitApiKeyCreate(keyForm, integrationService);
    setBusy("");

    if (!result.ok) {
      setKeyFormError(result.message);
      return;
    }

    setKeyModalOpen(false);
    setKeyForm(INITIAL_KEY_FORM);
    setCreatedKey({ key: result.key, rawKey: result.rawKey });
    await loadWorkspace({ silent: true });
    onToast(result.message);
  }

  async function confirmRevokeApiKey() {
    const key = keyToRevoke;
    setKeyToRevoke(null);
    if (!key || !canEditSettings) {
      return;
    }

    setBusy(`revoke:${key.id}`);
    const result = await submitApiKeyRevoke(key.id, integrationService);
    setBusy("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    await loadWorkspace({ silent: true });
    onToast(result.message);
  }

  async function handleCreateEndpoint(event) {
    event.preventDefault();
    if (!canEditSettings || busy) {
      return;
    }

    setBusy("create-endpoint");
    setEndpointFormError("");
    const result = await submitWebhookEndpointCreate(endpointForm, integrationService);
    setBusy("");

    if (!result.ok) {
      setEndpointFormError(result.message);
      return;
    }

    setEndpointModalOpen(false);
    setEndpointForm(INITIAL_ENDPOINT_FORM);
    setSelectedWebhookId(result.endpoint.id);
    await loadWorkspace({ silent: true });
    onToast(result.message);
  }

  async function handleUpdateEndpoint(event) {
    event.preventDefault();
    if (!canEditSettings || busy || !endpointToEdit) {
      return;
    }

    setBusy("update-endpoint");
    setEndpointFormError("");
    const result = await submitWebhookEndpointUpdate(endpointToEdit.id, {
      name: endpointToEdit.name,
      url: endpointToEdit.url
    }, integrationService);
    setBusy("");

    if (!result.ok) {
      setEndpointFormError(result.message);
      return;
    }

    setEndpointToEdit(null);
    await loadWorkspace({ silent: true });
    onToast(result.message);
  }

  async function handleToggleEndpoint(endpoint) {
    if (!canEditSettings || busy || !endpoint) {
      return;
    }

    const nextStatus = isEndpointDisabled(endpoint) ? "active" : "disabled";
    setBusy(`toggle:${endpoint.id}`);
    const result = await submitWebhookEndpointUpdate(endpoint.id, { status: nextStatus }, integrationService);
    setBusy("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    await loadWorkspace({ silent: true });
    onToast(`${result.endpoint.name}: endpoint ${nextStatus === "active" ? "включён" : "отключён"}.`);
  }

  async function confirmDeleteEndpoint() {
    const endpoint = endpointToDelete;
    setEndpointToDelete(null);
    if (!endpoint || !canEditSettings) {
      return;
    }

    setBusy(`delete:${endpoint.id}`);
    const result = await submitWebhookEndpointDelete(endpoint, integrationService);
    setBusy("");

    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setSelectedWebhookId("");
    await loadWorkspace({ silent: true });
    onToast(result.message);
  }

  async function handleReplayWebhook(delivery) {
    if (!canEditSettings || busy) {
      return;
    }

    setBusy(`replay:${delivery.id}`);
    const result = await submitWebhookReplay(delivery, integrationService).finally(() => setBusy(""));
    if (!result.ok) {
      onToast(result.message);
      return;
    }

    setReplayedDeliveryIds((current) => current.includes(result.deliveryId) ? current : [...current, result.deliveryId]);
    onToast(result.message);
  }

  async function handleRevokeSession(sessionId) {
    if (!canEditSettings || busy) {
      return;
    }

    setBusy(`session:${sessionId}`);
    const result = await submitSecuritySessionRevoke(sessionId, integrationService).finally(() => setBusy(""));
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

  const showApi = view === "all" || view === "api";
  const showSecurity = view === "all" || view === "security";
  const header = showApi && !showSecurity ? (
    <SettingsSectionHeader
      title="API и webhooks"
      hint="Ключи окружений, подписанные доставки webhook и changelog API. Создание и отзыв ключей, ротация и повтор доставок фиксируются в аудите."
      actions={
        <>
          <button
            className="settings-ghost-action settings-create-endpoint"
            disabled={Boolean(busy)}
            onClick={() => { setEndpointFormError(""); setEndpointForm(INITIAL_ENDPOINT_FORM); setEndpointModalOpen(true); }}
            title="Добавить webhook endpoint"
            type="button"
          >
            <Plus size={16} />
            Добавить endpoint
          </button>
          <button
            className="primary-action settings-create-api-key"
            disabled={Boolean(busy)}
            onClick={() => { setKeyFormError(""); setKeyForm(INITIAL_KEY_FORM); setKeyModalOpen(true); }}
            title="Создать API-ключ"
            type="button"
          >
            <KeyRound size={16} />
            Создать ключ
          </button>
        </>
      }
    />
  ) : (
    <SettingsSectionHeader
      title="Безопасность"
      hint="Активные сессии, контроль доступа и диагностика backend-интеграции. Отзыв сессии действует немедленно."
    />
  );

  if (loading) {
    return (
      <div className="settings-section admin-workspace-section">
        {header}
        <div className="admin-workspace-layout">Загружаем данные администрирования…</div>
      </div>
    );
  }

  return (
    <div className="settings-section admin-workspace-section">
      {header}
      <div className={`admin-workspace-layout ${view} settings-scroll`}>
        {showApi ? (
          <ApiGovernancePanel
            apiChangelog={apiChangelog}
            apiEnvironmentKeys={apiEnvironmentKeys}
            busy={busy}
            onDeleteEndpoint={setEndpointToDelete}
            onEditEndpoint={(endpoint) => { setEndpointFormError(""); setEndpointToEdit({ ...endpoint }); }}
            onReplayDelivery={handleReplayWebhook}
            onRevokeKey={setKeyToRevoke}
            onRotateKey={handleRotateApiKey}
            onSelectWebhook={setSelectedWebhookId}
            onToggleEndpoint={handleToggleEndpoint}
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
              busy={busy}
              onRevokeSession={handleRevokeSession}
              revokedSessionIds={revokedSessionIds}
              securityAlerts={securityAlerts}
              securityControls={securityControls}
            />
            <BackendIntegrationPanel />
          </>
        ) : null}
      </div>

      {isKeyModalOpen ? (
        <SettingsModal
          eyebrow="API и webhooks"
          footer={
            <>
              <button onClick={() => setKeyModalOpen(false)} type="button">Отмена</button>
              <button className="primary-action" disabled={busy === "create-key"} form="api-key-create-form" type="submit">
                <KeyRound size={16} />
                Создать ключ
              </button>
            </>
          }
          onClose={() => setKeyModalOpen(false)}
          title="Новый API-ключ"
          titleId="api-key-create-title"
        >
          <form className="api-key-create-form settings-form" id="api-key-create-form" onSubmit={handleCreateApiKey}>
            <InlineHint>Секрет ключа показывается один раз после создания. В хранилище остаётся только хэш.</InlineHint>
            <div className="settings-form-grid">
              <label>
                <span>Название</span>
                <input
                  disabled={busy === "create-key"}
                  onChange={(event) => setKeyForm({ ...keyForm, name: event.target.value })}
                  placeholder="CRM integration key"
                  value={keyForm.name}
                />
                <FieldHint>Видно в списке ключей и аудите.</FieldHint>
              </label>
              <label>
                <span>Окружение</span>
                <select
                  disabled={busy === "create-key"}
                  onChange={(event) => setKeyForm({ ...keyForm, environment: event.target.value })}
                  value={keyForm.environment}
                >
                  <option value="stage">stage</option>
                  <option value="production">production</option>
                </select>
                <FieldHint>Stage — для проверки интеграции без клиентов.</FieldHint>
              </label>
              <label className="settings-form-wide">
                <span>Скоупы</span>
                <input
                  disabled={busy === "create-key"}
                  onChange={(event) => setKeyForm({ ...keyForm, scopes: event.target.value })}
                  placeholder="clients:identify, conversations:write"
                  value={keyForm.scopes}
                />
                <FieldHint>Через запятую. Пусто — стандартный набор SDK.</FieldHint>
              </label>
            </div>
            {keyFormError ? <div className="settings-form-error" role="alert">{keyFormError}</div> : null}
          </form>
        </SettingsModal>
      ) : null}

      {createdKey ? (
        <SettingsModal
          eyebrow="API и webhooks"
          footer={
            <button className="primary-action" onClick={() => setCreatedKey(null)} type="button">
              Я сохранил ключ
            </button>
          }
          onClose={() => setCreatedKey(null)}
          title="Ключ создан"
          titleId="api-key-created-title"
        >
          <div className="api-key-reveal">
            <InlineHint>Скопируйте секрет сейчас — он показывается только один раз и не хранится в открытом виде.</InlineHint>
            <div className="api-key-reveal-row">
              <span>{createdKey.key?.name} · {createdKey.key?.env}</span>
              <code className="api-key-reveal-secret">{createdKey.rawKey}</code>
            </div>
          </div>
        </SettingsModal>
      ) : null}

      {isEndpointModalOpen ? (
        <SettingsModal
          eyebrow="API и webhooks"
          footer={
            <>
              <button onClick={() => setEndpointModalOpen(false)} type="button">Отмена</button>
              <button className="primary-action" disabled={busy === "create-endpoint"} form="webhook-endpoint-create-form" type="submit">
                <Plus size={16} />
                Добавить
              </button>
            </>
          }
          onClose={() => setEndpointModalOpen(false)}
          title="Новый webhook endpoint"
          titleId="webhook-endpoint-create-title"
        >
          <form className="webhook-endpoint-create-form settings-form" id="webhook-endpoint-create-form" onSubmit={handleCreateEndpoint}>
            <InlineHint>События подписываются HMAC SHA-256 и доставляются с повторами при ошибках.</InlineHint>
            <div className="settings-form-grid">
              <label>
                <span>Название</span>
                <input
                  disabled={busy === "create-endpoint"}
                  onChange={(event) => setEndpointForm({ ...endpointForm, name: event.target.value })}
                  placeholder="CRM events"
                  value={endpointForm.name}
                />
                <FieldHint>Видно в списке endpoint'ов.</FieldHint>
              </label>
              <label>
                <span>Канал</span>
                <select
                  disabled={busy === "create-endpoint"}
                  onChange={(event) => setEndpointForm({ ...endpointForm, channel: event.target.value })}
                  value={endpointForm.channel}
                >
                  <option value="SDK">SDK</option>
                  <option value="Telegram">Telegram</option>
                  <option value="VK">VK</option>
                  <option value="MAX">MAX</option>
                </select>
                <FieldHint>Источник событий для endpoint'а.</FieldHint>
              </label>
              <label className="settings-form-wide">
                <span>URL</span>
                <input
                  disabled={busy === "create-endpoint"}
                  onChange={(event) => setEndpointForm({ ...endpointForm, url: event.target.value })}
                  placeholder="https://example.com/webhooks/support"
                  value={endpointForm.url}
                />
                <FieldHint>Адрес, куда доставляются подписанные события.</FieldHint>
              </label>
            </div>
            {endpointFormError ? <div className="settings-form-error" role="alert">{endpointFormError}</div> : null}
          </form>
        </SettingsModal>
      ) : null}

      {endpointToEdit ? (
        <SettingsModal
          eyebrow="API и webhooks"
          footer={
            <>
              <button onClick={() => setEndpointToEdit(null)} type="button">Отмена</button>
              <button className="primary-action" disabled={busy === "update-endpoint"} form="webhook-endpoint-edit-form" type="submit">
                Сохранить
              </button>
            </>
          }
          onClose={() => setEndpointToEdit(null)}
          title="Изменить endpoint"
          titleId="webhook-endpoint-edit-title"
        >
          <form className="webhook-endpoint-edit-form settings-form" id="webhook-endpoint-edit-form" onSubmit={handleUpdateEndpoint}>
            <div className="settings-form-grid">
              <label>
                <span>Название</span>
                <input
                  disabled={busy === "update-endpoint"}
                  onChange={(event) => setEndpointToEdit({ ...endpointToEdit, name: event.target.value })}
                  value={endpointToEdit.name}
                />
              </label>
              <label className="settings-form-wide">
                <span>URL</span>
                <input
                  disabled={busy === "update-endpoint"}
                  onChange={(event) => setEndpointToEdit({ ...endpointToEdit, url: event.target.value })}
                  value={endpointToEdit.url}
                />
                <FieldHint>Изменение адреса применяется к новым доставкам.</FieldHint>
              </label>
            </div>
            {endpointFormError ? <div className="settings-form-error" role="alert">{endpointFormError}</div> : null}
          </form>
        </SettingsModal>
      ) : null}

      {keyToRevoke ? (
        <ConfirmDialog
          confirmLabel="Отозвать"
          danger
          description={`Отозвать ключ ${keyToRevoke.name}? Запросы с этим ключом перестанут приниматься немедленно.`}
          eyebrow="API-ключ"
          onCancel={() => setKeyToRevoke(null)}
          onConfirm={confirmRevokeApiKey}
          title="Отозвать API-ключ?"
        />
      ) : null}

      {endpointToDelete ? (
        <ConfirmDialog
          confirmLabel="Удалить"
          danger
          description={`Удалить endpoint ${endpointToDelete.name}? Доставка событий на ${endpointToDelete.url} прекратится.`}
          eyebrow="Webhook endpoint"
          onCancel={() => setEndpointToDelete(null)}
          onConfirm={confirmDeleteEndpoint}
          title="Удалить webhook endpoint?"
        />
      ) : null}
    </div>
  );
}
