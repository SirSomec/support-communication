import React, { useEffect, useState } from "react";
import { MailCheck, Send, TriangleAlert } from "lucide-react";
import { FieldHint, InlineHint, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import {
  buildMailSettingsPayload,
  describeMailDeliverySource,
  describeMailTestState,
  hasEmailShape,
  mailEncryptionOptions,
  mailSettingsFormFromResponse,
  validateMailSettingsForm
} from "./mailSettingsModel.js";
import { mailSettingsService } from "../../services/mailSettingsService.js";
import "./settings.css";

// Служебная почта воркспейса: SMTP-подключение для рассылок 2FA-кодов, писем
// восстановления пароля и приглашений сотрудников. Пароль write-only: сервер
// возвращает только passwordConfigured.
export function MailSettingsPanel({ canEditSettings, onToast }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [settings, setSettings] = useState(null);
  const [environmentFallback, setEnvironmentFallback] = useState({ configured: false });
  const [form, setForm] = useState(mailSettingsFormFromResponse(null));
  const [dirty, setDirty] = useState(false);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    let cancelled = false;

    mailSettingsService.fetchMailSettings().then((response) => {
      if (cancelled) {
        return;
      }
      setLoading(false);
      if (response.status !== "ok") {
        setLoadError(response.error?.message ?? "Не удалось загрузить настройки почты.");
        return;
      }
      applyServerState(response.data);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function applyServerState(data) {
    setSettings(data?.settings ?? null);
    setEnvironmentFallback(data?.environmentFallback ?? { configured: false });
    setForm(mailSettingsFormFromResponse(data?.settings));
    setDirty(false);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    const violation = validateMailSettingsForm(form, {
      passwordConfigured: Boolean(settings?.passwordConfigured)
    });
    if (violation) {
      setFormError(violation);
      return;
    }

    setFormError("");
    setSaving(true);
    const response = await mailSettingsService.saveMailSettings(buildMailSettingsPayload(form));
    setSaving(false);

    if (response.status !== "ok") {
      setFormError(response.error?.message ?? "Не удалось сохранить настройки почты.");
      return;
    }

    setSettings(response.data?.settings ?? null);
    setEnvironmentFallback(response.data?.environmentFallback ?? { configured: false });
    setForm(mailSettingsFormFromResponse(response.data?.settings));
    setDirty(false);
    setTestResult(null);
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
    const response = await mailSettingsService.sendTestEmail({ recipient });
    setTesting(false);

    const test = response.data?.test;
    if (response.data?.settings) {
      setSettings(response.data.settings);
    }
    if (test?.status === "passed") {
      setTestResult({ status: "passed", message: `Письмо отправлено на ${recipient}.` });
      onToast?.("Тестовое письмо отправлено.");
      return;
    }
    const diagnostic = test?.diagnostic?.code ? ` Код: ${test.diagnostic.code}.` : "";
    setTestResult({
      status: "failed",
      message: `${response.error?.message ?? "Не удалось отправить тестовое письмо."}${diagnostic}`
    });
  }

  const source = describeMailDeliverySource(settings, environmentFallback);
  const passwordConfigured = Boolean(settings?.passwordConfigured);
  const controlsDisabled = !canEditSettings || saving || loading;

  return (
    <section className="settings-section mail-settings-panel" aria-label="Служебная почта">
      <SettingsSectionHeader
        title="Служебная почта"
        meta={source.label}
        hint="SMTP-подключение для служебных рассылок: коды двухфакторной авторизации, восстановление пароля и приглашения сотрудников."
      />

      {loadError ? (
        <div className="settings-form-error" role="alert">{loadError}</div>
      ) : null}

      {!canEditSettings ? (
        <InlineHint>Изменение настроек доступно только администратору рабочего пространства.</InlineHint>
      ) : null}

      <form className="settings-form mail-settings-form" onSubmit={handleSave}>
        <div className="settings-form-grid">
          <label>
            <span>SMTP-хост</span>
            <input
              disabled={controlsDisabled}
              onChange={(event) => updateField("host", event.target.value)}
              placeholder="smtp.company.ru"
              value={form.host}
            />
          </label>
          <label>
            <span>Порт</span>
            <input
              disabled={controlsDisabled}
              inputMode="numeric"
              onChange={(event) => updateField("port", event.target.value)}
              placeholder="587"
              value={form.port}
            />
          </label>
          <label>
            <span>Шифрование</span>
            <select
              disabled={controlsDisabled}
              onChange={(event) => updateField("encryption", event.target.value)}
              value={form.encryption}
            >
              {mailEncryptionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Логин SMTP</span>
            <input
              autoComplete="off"
              disabled={controlsDisabled}
              onChange={(event) => updateField("username", event.target.value)}
              placeholder="логин (обычно email)"
              value={form.username}
            />
          </label>
          <label>
            <span>Пароль SMTP</span>
            <input
              autoComplete="new-password"
              disabled={controlsDisabled}
              onChange={(event) => updateField("password", event.target.value)}
              placeholder={passwordConfigured ? "•••••• (сохранён)" : "пароль не задан"}
              type="password"
              value={form.password}
            />
          </label>
          <label>
            <span>Адрес отправителя</span>
            <input
              disabled={controlsDisabled}
              onChange={(event) => updateField("fromAddress", event.target.value)}
              placeholder="noreply@company.ru"
              value={form.fromAddress}
            />
          </label>
          <label>
            <span>Имя отправителя</span>
            <input
              disabled={controlsDisabled}
              onChange={(event) => updateField("fromName", event.target.value)}
              placeholder="Поддержка"
              value={form.fromName}
            />
          </label>
          <label>
            <span>Reply-To</span>
            <input
              disabled={controlsDisabled}
              onChange={(event) => updateField("replyTo", event.target.value)}
              placeholder="support@company.ru"
              value={form.replyTo}
            />
          </label>
        </div>

        <FieldHint>
          Пароль хранится в зашифрованном виде и не показывается после сохранения. Пустое поле пароля
          оставляет прежний; очистка логина отключает аутентификацию и удаляет сохранённый пароль.
        </FieldHint>

        <label className="mail-settings-enabled">
          <input
            checked={form.enabled}
            disabled={controlsDisabled}
            onChange={(event) => updateField("enabled", event.target.checked)}
            type="checkbox"
          />
          <span>Использовать это подключение для служебных рассылок</span>
        </label>

        {formError ? <div className="settings-form-error" role="alert">{formError}</div> : null}

        <div className="settings-form-actions">
          <button className="primary-action mail-settings-save" disabled={controlsDisabled} type="submit">
            {saving ? "Сохранение..." : "Сохранить настройки"}
          </button>
        </div>
      </form>

      <div className="mail-settings-test">
        <h3>Проверка подключения</h3>
        <p>Отправляет тестовое письмо по последним сохранённым настройкам.</p>
        <div className="mail-settings-test-row">
          <input
            disabled={!canEditSettings || testing}
            onChange={(event) => setTestRecipient(event.target.value)}
            placeholder="Кому: admin@company.ru"
            type="email"
            value={testRecipient}
          />
          <button
            className="mail-settings-test-send"
            disabled={!canEditSettings || testing || loading || !settings}
            onClick={handleTest}
            type="button"
          >
            <Send size={15} />
            {testing ? "Отправка..." : "Отправить тестовое письмо"}
          </button>
        </div>
        {!settings && !loading ? (
          <FieldHint>Сначала сохраните настройки — тестовое письмо отправляется по сохранённому подключению.</FieldHint>
        ) : null}
        {dirty && settings ? (
          <FieldHint>Есть несохранённые изменения: тест уйдёт по последним сохранённым настройкам.</FieldHint>
        ) : null}
        {testResult ? (
          <div
            className={`mail-settings-test-result ${testResult.status === "passed" ? "passed" : "failed"}`}
            role="status"
          >
            {testResult.status === "passed" ? <MailCheck size={15} /> : <TriangleAlert size={15} />}
            <span>{testResult.message}</span>
          </div>
        ) : null}
        <FieldHint>{describeMailTestState(settings)}</FieldHint>
      </div>
    </section>
  );
}
