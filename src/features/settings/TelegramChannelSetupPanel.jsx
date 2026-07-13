import React, { useEffect, useState } from "react";
import { Copy, Link2, Save, Unplug } from "lucide-react";
import { integrationService } from "../../services/integrationService.js";

const EMPTY_CONNECTION = {
  botUsername: null,
  status: "not_configured",
  tokenConfigured: false,
  tokenPreview: null,
  webhookSecret: null,
  webhookUrl: ""
};

export function TelegramChannelSetupPanel({ canEditSettings, onToast }) {
  const [connection, setConnection] = useState(EMPTY_CONNECTION);
  const [botToken, setBotToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadConnection() {
      setLoading(true);
      setError("");
      const response = await integrationService.fetchTelegramConnection();
      if (!active) {
        return;
      }

      if (response.status === "ok") {
        setConnection(response.data.connection ?? EMPTY_CONNECTION);
      } else {
        setError(response.error?.message ?? "Не удалось загрузить настройки Telegram.");
      }
      setLoading(false);
    }

    void loadConnection();
    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    if (!canEditSettings || !botToken.trim()) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await integrationService.saveTelegramConnection({ botToken: botToken.trim() });
    setSaving(false);

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось сохранить токен бота.");
      return;
    }

    setConnection(response.data.connection ?? EMPTY_CONNECTION);
    setBotToken("");
    onToast("Telegram: токен бота сохранён. Зарегистрируйте webhook в BotFather.");
  }

  async function handleDisconnect() {
    if (!canEditSettings) {
      return;
    }

    setSaving(true);
    setError("");
    const response = await integrationService.disconnectTelegramConnection();
    setSaving(false);

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось отключить Telegram.");
      return;
    }

    setConnection(response.data.connection ?? EMPTY_CONNECTION);
    onToast("Telegram отключён.");
  }

  async function handleCopy(value, label) {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    onToast(`${label} скопирован.`);
  }

  const webhookCommand = connection.webhookSecret && connection.webhookUrl
    ? `curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" -d "url=${connection.webhookUrl}" -d "secret_token=${connection.webhookSecret}"`
    : "";

  return (
    <div className="channel-detail-section telegram-setup-panel">
      <div className="section-title compact-title">
        <h3>Telegram Bot</h3>
        <span>{connection.tokenConfigured ? "подключён" : "требует настройки"}</span>
      </div>

      {loading ? (
        <div className="channel-test-empty">Загрузка настроек Telegram…</div>
      ) : (
        <>
          <div className="channel-detail-grid">
            <div>
              <span>Статус</span>
              <strong>{formatTelegramStatus(connection.status)}</strong>
            </div>
            <div>
              <span>Бот</span>
              <strong>{connection.botUsername ? `@${connection.botUsername}` : "—"}</strong>
            </div>
            <div>
              <span>Токен</span>
              <strong>{connection.tokenPreview ?? "не задан"}</strong>
            </div>
          </div>

          <label className="channel-test-message">
            <span>Bot Token от @BotFather</span>
            <input
              disabled={!canEditSettings || saving}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder="7123456789:AAH..."
              type="password"
              value={botToken}
            />
          </label>

          <div className="channel-test-grid">
            <button disabled={!canEditSettings || saving || !botToken.trim()} onClick={handleSave} type="button">
              <Save size={16} />
              Сохранить токен
            </button>
            <button
              className="ghost-action"
              disabled={!canEditSettings || saving || !connection.tokenConfigured}
              onClick={handleDisconnect}
              type="button"
            >
              <Unplug size={16} />
              Отключить
            </button>
          </div>

          {connection.webhookUrl ? (
            <div className="telegram-webhook-instructions">
              <div className="section-title compact-title">
                <h4>Webhook</h4>
                <span>после сохранения токена</span>
              </div>
              <div className="connection-row ok">
                <div>
                  <strong>URL</strong>
                  <span>{connection.webhookUrl}</span>
                </div>
                <button aria-label="Копировать Webhook URL" onClick={() => handleCopy(connection.webhookUrl, "Webhook URL")} title="Копировать Webhook URL" type="button">
                  <Copy size={14} />
                </button>
              </div>
              {connection.webhookSecret ? (
                <div className="connection-row ok">
                  <div>
                    <strong>secret_token</strong>
                    <span>{connection.webhookSecret}</span>
                  </div>
                  <button aria-label="Копировать secret_token" onClick={() => handleCopy(connection.webhookSecret, "secret_token")} title="Копировать secret_token" type="button">
                    <Copy size={14} />
                  </button>
                </div>
              ) : null}
              {webhookCommand ? (
                <div className="channel-test-result success">
                  <strong>Команда для регистрации webhook</strong>
                  <code>{webhookCommand}</code>
                  <button onClick={() => handleCopy(webhookCommand, "Команда setWebhook")} type="button">
                    <Link2 size={14} />
                    Скопировать команду
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <div className="channel-test-result error"><strong>{error}</strong></div> : null}
        </>
      )}
    </div>
  );
}

function formatTelegramStatus(status) {
  if (status === "active") {
    return "Активен";
  }
  if (status === "disabled") {
    return "Отключён";
  }
  return "Не настроен";
}
