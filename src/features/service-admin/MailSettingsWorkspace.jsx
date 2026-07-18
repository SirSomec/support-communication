import React, { useEffect, useState } from "react";
import { LoaderCircle, MailCheck, Save, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { SectionTitle } from "../../ui.jsx";
import { mailSettingsService } from "../../services/mailSettingsService.js";
import {
  applyEncryptionChange,
  buildMailSettingsPayload,
  describeMailDeliverySource,
  describeMailTestDiagnostic,
  describeMailTestState,
  hasEmailShape,
  mailEncryptionOptions,
  mailSettingsFormFromResponse,
  validateMailSettingsForm
} from "./mailSettingsModel.js";

// Служебная почта сервиса: единое SMTP-подключение для рассылок всей платформы
// (коды 2FA, восстановление пароля, приглашения сотрудников). Настраивается
// только администратором сервиса; пароль write-only.
export function MailSettingsWorkspace({ onAudit, onToast }) {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [environmentFallback, setEnvironmentFallback] = useState({ configured: false });
  const [form, setForm] = useState(mailSettingsFormFromResponse(null));
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    let active = true;

    mailSettingsService.fetchMailSettings().then((envelope) => {
      if (!active) return;
      setLoading(false);
      if (envelope.status !== "ok") {
        setError(envelope.error?.message ?? "Не удалось загрузить настройки служебной почты.");
        return;
      }
      applyServerState(envelope.data);
    });

    return () => {
      active = false;
    };
  }, []);

  function applyServerState(data) {
    setSettings(data?.settings ?? null);
    setEnvironmentFallback(data?.environmentFallback ?? { configured: false });
    setForm(mailSettingsFormFromResponse(data?.settings));
    setDirty(false);
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  }

  function updateEncryption(value) {
    // Смена шифрования подставляет стандартный порт (SSL — 465, STARTTLS — 587),
    // если текущий порт стандартный: главный источник ошибок «smtp_timeout».
    setForm((current) => applyEncryptionChange(current, value));
    setDirty(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    const violation = validateMailSettingsForm(form, {
      passwordConfigured: Boolean(settings?.passwordConfigured)
    });
    if (violation) {
      setError(violation);
      return;
    }

    setError("");
    setSaving(true);
    const envelope = await mailSettingsService.saveMailSettings(buildMailSettingsPayload(form));
    setSaving(false);

    if (envelope.status !== "ok") {
      setError(envelope.error?.message ?? "Не удалось сохранить настройки почты.");
      return;
    }

    applyServerState(envelope.data);
    setTestResult(null);
    onAudit?.(envelope, { action: "service.mail.update", target: "service" });
    onToast?.("Настройки служебной почты сохранены.");
  }

  async function handleTest() {
    const recipient = testRecipient.trim();
    if (!hasEmailShape(recipient)) {
      setTestResult({ status: "failed", message: "Укажите корректный email получателя тестового письма." });
      return;
    }

    setTesting(true);
    setTestResult(null);
    const envelope = await mailSettingsService.sendTestEmail({ recipient });
    setTesting(false);

    if (envelope.data?.settings) {
      setSettings(envelope.data.settings);
    }
    onAudit?.(envelope, { action: "service.mail.test", target: "service" });
    const test = envelope.data?.test;
    if (test?.status === "passed") {
      setTestResult({ status: "passed", message: `Письмо отправлено на ${recipient}.` });
      onToast?.("Тестовое письмо отправлено.");
      return;
    }
    const hint = describeMailTestDiagnostic(test?.diagnostic?.code);
    setTestResult({
      status: "failed",
      message: hint || envelope.error?.message || "Не удалось отправить тестовое письмо."
    });
  }

  const source = describeMailDeliverySource(settings, environmentFallback);
  const passwordConfigured = Boolean(settings?.passwordConfigured);
  const controlsDisabled = loading || saving;

  return (
    <div className="service-admin-workspace-grid mail-settings-workspace">
      <section className="service-admin-list-panel">
        <header className="service-admin-panel-toolbar"><Send size={18} /><strong>Проверка подключения</strong></header>
        <p className="mail-settings-note">Отправляет тестовое письмо по последним сохранённым настройкам. Сейчас: {source.label}.</p>
        <label className="service-admin-reason-field">
          <span>Получатель тестового письма</span>
          <input
            disabled={testing}
            onChange={(event) => setTestRecipient(event.target.value)}
            placeholder="admin@company.ru"
            type="email"
            value={testRecipient}
          />
        </label>
        <button
          className="primary-action mail-settings-test-send"
          disabled={testing || loading || !settings}
          onClick={() => void handleTest()}
          type="button"
        >
          {testing ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}
          {testing ? "Отправка..." : "Отправить тестовое письмо"}
        </button>
        {!settings && !loading ? (
          <p className="mail-settings-note">Сначала сохраните настройки — тест отправляется по сохранённому подключению.</p>
        ) : null}
        {dirty && settings ? (
          <p className="mail-settings-note">Есть несохранённые изменения: тест уйдёт по последним сохранённым настройкам.</p>
        ) : null}
        {testResult ? (
          <div className={`mail-settings-test-result ${testResult.status === "passed" ? "passed" : "failed"}`} role="status">
            {testResult.status === "passed" ? <MailCheck size={15} /> : <TriangleAlert size={15} />}
            <span>{testResult.message}</span>
          </div>
        ) : null}
        <p className="mail-settings-note">{describeMailTestState(settings)}</p>
      </section>

      <section className="service-admin-detail-panel">
        <SectionTitle title="Служебная почта сервиса" action="одно подключение на всю платформу" />
        <p className="ai-connection-note">
          <ShieldCheck size={17} />
          Через это SMTP-подключение уходят служебные письма всех рабочих пространств: коды двухфакторной
          авторизации, восстановление пароля и приглашения сотрудников. Пароль шифруется на сервере и после
          сохранения не показывается.
        </p>
        <form className="service-admin-action-box" onSubmit={handleSave}>
          <label className="service-admin-reason-field">
            <span>SMTP-хост</span>
            <input disabled={controlsDisabled} onChange={(event) => update("host", event.target.value)} placeholder="smtp.company.ru" value={form.host} />
          </label>
          <label className="service-admin-reason-field">
            <span>Порт</span>
            <input disabled={controlsDisabled} inputMode="numeric" onChange={(event) => update("port", event.target.value)} placeholder="587" value={form.port} />
          </label>
          <label className="service-admin-reason-field">
            <span>Шифрование</span>
            <select disabled={controlsDisabled} onChange={(event) => updateEncryption(event.target.value)} value={form.encryption}>
              {mailEncryptionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="service-admin-reason-field">
            <span>Логин SMTP</span>
            <input autoComplete="off" disabled={controlsDisabled} onChange={(event) => update("username", event.target.value)} placeholder="логин (обычно email)" value={form.username} />
            <small>Очистка логина отключает аутентификацию и удаляет сохранённый пароль.</small>
          </label>
          <label className="service-admin-reason-field">
            <span>{passwordConfigured ? "Пароль SMTP (пусто — оставить текущий)" : "Пароль SMTP"}</span>
            <input autoComplete="new-password" disabled={controlsDisabled} onChange={(event) => update("password", event.target.value)} placeholder={passwordConfigured ? "•••••• (сохранён)" : "пароль не задан"} type="password" value={form.password} />
          </label>
          <label className="service-admin-reason-field">
            <span>Адрес отправителя</span>
            <input disabled={controlsDisabled} onChange={(event) => update("fromAddress", event.target.value)} placeholder="noreply@company.ru" value={form.fromAddress} />
          </label>
          <label className="service-admin-reason-field">
            <span>Имя отправителя (необязательно)</span>
            <input disabled={controlsDisabled} onChange={(event) => update("fromName", event.target.value)} placeholder="Поддержка" value={form.fromName} />
          </label>
          <label className="service-admin-reason-field">
            <span>Reply-To (необязательно)</span>
            <input disabled={controlsDisabled} onChange={(event) => update("replyTo", event.target.value)} placeholder="support@company.ru" value={form.replyTo} />
          </label>
          <label className="mail-settings-enabled">
            <input checked={form.enabled} disabled={controlsDisabled} onChange={(event) => update("enabled", event.target.checked)} type="checkbox" />
            <span>Использовать это подключение для служебных рассылок</span>
          </label>
          {error ? <p className="service-admin-feedback danger">{error}</p> : null}
          <footer>
            <button className="primary-action mail-settings-save" disabled={controlsDisabled} type="submit">
              {saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
              {saving ? "Сохранение..." : "Сохранить настройки"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
