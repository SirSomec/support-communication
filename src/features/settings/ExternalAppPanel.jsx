import React, { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, PauseCircle, PlayCircle, PlugZap, Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "../../ui.jsx";
import { FieldHint, InlineHint, SettingsModal, SettingsSectionHeader } from "./SettingsPrimitives.jsx";
import { copyTextToClipboard } from "../../services/clipboardService.js";
import { integrationService } from "../../services/integrationService.js";
import { routingService } from "../../services/routingService.js";

// Подключение чата внешнего приложения по Open Channel API: весь путь в одном
// окне — форма создания сразу переходит в выдачу адреса приёма и токена.

const initialForm = {
  name: "",
  outboundUrl: "",
  routingQueueId: ""
};

export function ExternalAppPanel({ access, canEditSettings, onSummaryChange, onToast }) {
  const [apps, setApps] = useState([]);
  const [queues, setQueues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [isConnectOpen, setConnectOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState("");
  // issued != null переключает модалку подключения в режим выдачи данных:
  // токен из ответа backend показывается только один раз.
  const [issued, setIssued] = useState(null);
  const [appToDelete, setAppToDelete] = useState(null);
  const [appToRotate, setAppToRotate] = useState(null);
  const canMutate = canEditSettings && !error;

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (queues.length && !queues.some((queue) => queue.id === form.routingQueueId)) {
      setForm((current) => ({ ...current, routingQueueId: queues[0].id }));
    }
  }, [form.routingQueueId, queues]);

  const totals = useMemo(() => ({
    active: apps.filter((app) => app.status === "active").length,
    total: apps.length
  }), [apps]);

  async function loadApps() {
    setLoading(true);
    setError("");
    const [response, queueResponse] = await Promise.all([
      integrationService.fetchExternalChatChannels(),
      routingService.fetchQueues({ status: "active" })
    ]);
    if (response.status === "ok" && queueResponse.status === "ok") {
      const items = response.data.items ?? [];
      setApps(items);
      setQueues(queueResponse.data.queues ?? []);
      onSummaryChange?.({
        active: items.filter((app) => app.status === "active").length,
        total: items.length
      });
    } else {
      setError(response.error?.message ?? queueResponse.error?.message ?? "Не удалось загрузить внешние приложения.");
      setApps([]);
      setQueues([]);
      onSummaryChange?.({ active: 0, total: 0 });
    }
    setLoading(false);
  }

  function openConnectModal() {
    if (!canMutate) {
      onToast?.(access.reason);
      return;
    }

    setFormError("");
    setIssued(null);
    setForm({ ...initialForm, routingQueueId: queues[0]?.id ?? "" });
    setConnectOpen(true);
  }

  function closeConnectModal() {
    setConnectOpen(false);
    setIssued(null);
  }

  async function connectApp(event) {
    event.preventDefault();
    if (!canMutate || busy) {
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setFormError("Укажите название приложения.");
      return;
    }

    const outboundUrl = form.outboundUrl.trim();
    if (outboundUrl && !isHttpUrl(outboundUrl)) {
      setFormError("Адрес для ответов должен начинаться с http:// или https://.");
      return;
    }

    setBusy("connect");
    setFormError("");
    const response = await integrationService.createExternalChatChannel({
      name,
      outboundUrl: form.outboundUrl.trim(),
      routingQueueId: form.routingQueueId.trim()
    });
    setBusy("");

    if (response.status !== "ok") {
      setFormError(response.error?.message ?? "Не удалось подключить приложение.");
      return;
    }

    setIssued({ channel: response.data.channel, mode: "created" });
    await loadApps();
    onToast?.(`${response.data.channel.name}: приложение подключено.`);
  }

  async function confirmRotateToken() {
    const app = appToRotate;
    setAppToRotate(null);
    if (!app || !canMutate) {
      return;
    }

    setBusy(`rotate:${app.id}`);
    setError("");
    const response = await integrationService.updateExternalChatChannel({
      channelId: app.id,
      rotateToken: true
    });
    setBusy("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось выпустить новый токен.");
      return;
    }

    setIssued({ channel: response.data.channel, mode: "rotated" });
    setConnectOpen(true);
    await loadApps();
    onToast?.(`${response.data.channel.name}: выпущен новый токен.`);
  }

  async function updateApp(app, payload, successMessage) {
    if (!app || !canMutate) {
      return;
    }

    setBusy(`update:${app.id}`);
    setError("");
    const response = await integrationService.updateExternalChatChannel({
      channelId: app.id,
      ...payload
    });
    setBusy("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось сохранить изменения.");
      return;
    }

    await loadApps();
    onToast?.(successMessage ?? `${response.data.channel.name}: изменения сохранены.`);
  }

  async function confirmDeleteApp() {
    const app = appToDelete;
    setAppToDelete(null);
    if (!app || !canMutate) {
      return;
    }

    setBusy(`delete:${app.id}`);
    setError("");
    const response = await integrationService.deleteExternalChatChannel(app.id);
    setBusy("");

    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось отключить приложение.");
      return;
    }

    await loadApps();
    onToast?.(`${app.name}: приложение отключено.`);
  }

  async function copyValue(label, value) {
    const result = await copyTextToClipboard(value);
    onToast?.(result.ok ? `${label} — скопировано.` : result.message);
  }

  return (
    <section className="settings-section external-app-panel">
      <SettingsSectionHeader
        title="Внешнее приложение"
        meta={loading ? "загрузка" : `${totals.active} из ${totals.total} активны`}
        hint="Чат вашего сайта или мобильного приложения, подключенный по API: сообщения клиентов попадают к операторам, ответы возвращаются на ваш сервер."
        actions={
          <button
            className="primary-action settings-create-external-app"
            disabled={!canMutate}
            onClick={openConnectModal}
            title={canMutate ? "Подключить приложение по API" : access.reason}
            type="button"
          >
            <Plus size={16} />
            Подключить приложение
          </button>
        }
      />

      {error ? <div className="settings-rule-error">{error}</div> : null}

      {loading ? <div className="channel-log-empty">Загружаем внешние приложения.</div> : null}

      {!loading && !apps.length ? (
        <div className="settings-empty-state">
          <PlugZap size={22} />
          <strong>Внешних приложений пока нет</strong>
          <span>
            Подключение занимает пару минут: назовите приложение — и получите адрес приёма сообщений
            и токен в одном окне. Останется отправить первое сообщение по API.
          </span>
          <button className="primary-action settings-create-external-app" disabled={!canMutate} onClick={openConnectModal} type="button">
            <Plus size={16} />
            Подключить приложение
          </button>
        </div>
      ) : null}

      {!loading && apps.length ? (
        <div className="external-app-list settings-scroll">
          {apps.map((app) => {
            const isAppBusy = busy === `update:${app.id}` || busy === `rotate:${app.id}` || busy === `delete:${app.id}`;

            return (
              <article className="external-app-card" key={app.id}>
                <header>
                  <strong>{app.name}</strong>
                  <b className={`external-app-status ${app.status}`}>{app.status === "active" ? "Активно" : "На паузе"}</b>
                </header>
                <div className="external-app-grid">
                  <div>
                    <span>Приём сообщений</span>
                    <code title="Полный адрес с токеном показывается один раз при подключении">{app.inboundPath}</code>
                    <FieldHint>Токен в адресе скрыт. Потеряли — выпустите новый.</FieldHint>
                  </div>
                  <label>
                    <span>Ответы операторов</span>
                    <input
                      defaultValue={app.outboundUrl}
                      disabled={!canMutate || isAppBusy}
                      key={`outbound-${app.id}-${app.updatedAt}`}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value === (app.outboundUrl ?? "")) {
                          return;
                        }
                        if (value && !isHttpUrl(value)) {
                          setError("Адрес для ответов должен начинаться с http:// или https://.");
                          return;
                        }
                        updateApp(app, { outboundUrl: value }, `${app.name}: адрес для ответов сохранен.`);
                      }}
                      placeholder="https://your-app.example.com/support/replies"
                    />
                    <FieldHint>URL на вашем сервере. Сохраняется при выходе из поля.</FieldHint>
                  </label>
                  <label>
                    <span>Очередь приема</span>
                    <select
                      disabled={!canMutate || isAppBusy || !queues.length}
                      onChange={(event) => updateApp(app, { routingQueueId: event.target.value }, `${app.name}: очередь изменена.`)}
                      value={app.routingQueueId ?? queues[0]?.id ?? ""}
                    >
                      {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                    </select>
                    <FieldHint>Куда попадают новые обращения.</FieldHint>
                  </label>
                </div>
                <footer className="external-app-actions">
                  <button
                    className="external-app-rotate"
                    disabled={!canMutate || isAppBusy}
                    onClick={() => setAppToRotate(app)}
                    title="Выпустить новый токен — старый перестанет действовать"
                    type="button"
                  >
                    <KeyRound size={15} />
                    Новый токен
                  </button>
                  <button
                    disabled={!canMutate || isAppBusy}
                    onClick={() => updateApp(
                      app,
                      { status: app.status === "active" ? "disabled" : "active" },
                      `${app.name}: ${app.status === "active" ? "поставлено на паузу" : "включено"}.`
                    )}
                    title={app.status === "active" ? "Приостановить прием сообщений" : "Возобновить прием сообщений"}
                    type="button"
                  >
                    {app.status === "active" ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
                    {app.status === "active" ? "Пауза" : "Включить"}
                  </button>
                  <button
                    className="danger external-app-delete"
                    disabled={!canMutate || isAppBusy}
                    onClick={() => setAppToDelete(app)}
                    title="Отключить приложение и отозвать токен"
                    type="button"
                  >
                    <Trash2 size={15} />
                    Отключить
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      ) : null}

      {isConnectOpen && !issued ? (
        <SettingsModal
          eyebrow="Внешнее приложение"
          footer={
            <>
              <button onClick={closeConnectModal} type="button">Отмена</button>
              <button
                className="primary-action"
                disabled={!canMutate || busy === "connect"}
                form="external-app-connect-form"
                type="submit"
              >
                <PlugZap size={16} />
                Подключить
              </button>
            </>
          }
          onClose={closeConnectModal}
          title="Подключить приложение"
          titleId="external-app-connect-title"
        >
          <form className="settings-form" id="external-app-connect-form" onSubmit={connectApp}>
            <InlineHint>После подключения вы сразу получите адрес приёма сообщений и токен — в этом же окне.</InlineHint>
            <div className="settings-form-grid">
              <label className="settings-form-wide">
                <span>Название</span>
                <input
                  disabled={busy === "connect"}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Чат в мобильном приложении"
                  value={form.name}
                />
                <FieldHint>Видно операторам в списке диалогов.</FieldHint>
              </label>
              <label className="settings-form-wide">
                <span>Куда доставлять ответы операторов</span>
                <input
                  disabled={busy === "connect"}
                  onChange={(event) => setForm({ ...form, outboundUrl: event.target.value })}
                  placeholder="https://your-app.example.com/support/replies"
                  value={form.outboundUrl}
                />
                <FieldHint>URL на вашем сервере. Необязательно — можно добавить позже.</FieldHint>
              </label>
              <label className="settings-form-wide">
                <span>Очередь приема</span>
                <select
                  disabled={busy === "connect" || !queues.length}
                  onChange={(event) => setForm({ ...form, routingQueueId: event.target.value })}
                  value={form.routingQueueId}
                >
                  {!queues.length ? <option value="">Нет доступных очередей</option> : null}
                  {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
                </select>
                <FieldHint>Какая команда разбирает обращения из приложения.</FieldHint>
              </label>
            </div>
            {formError ? <div className="settings-form-error" role="alert">{formError}</div> : null}
          </form>
        </SettingsModal>
      ) : null}

      {isConnectOpen && issued ? (
        <SettingsModal
          eyebrow="Внешнее приложение"
          footer={
            <button className="primary-action external-app-done" onClick={closeConnectModal} type="button">
              Готово
            </button>
          }
          onClose={closeConnectModal}
          title={issued.mode === "rotated" ? "Новый токен выпущен" : "Приложение подключено"}
          titleId="external-app-issued-title"
        >
          <div className="api-key-reveal">
            <InlineHint>
              Скопируйте данные сейчас — токен показывается только один раз. Если потеряете его,
              выпустите новый кнопкой «Новый токен».
            </InlineHint>
            <IssuedRow
              hint="Сюда ваше приложение отправляет сообщения клиентов (POST, JSON)."
              label="Адрес приёма сообщений"
              onCopy={copyValue}
              value={buildInboundUrl(issued.channel.inboundPath)}
            />
            <IssuedRow
              hint="Часть адреса выше. Храните как секрет."
              label="Токен канала"
              onCopy={copyValue}
              value={issued.channel.token}
            />
            <IssuedRow
              hint="Выполните в терминале — сообщение появится у операторов."
              label="Проверка подключения"
              multiline
              onCopy={copyValue}
              value={buildExampleCommand(buildInboundUrl(issued.channel.inboundPath))}
            />
            {issued.channel.outboundUrl ? (
              <p className="external-app-outbound-note">
                Ответы операторов будут приходить на <code>{issued.channel.outboundUrl}</code>.
              </p>
            ) : (
              <p className="external-app-outbound-note">
                Адрес для ответов операторов не указан — добавьте его в карточке приложения, чтобы получать ответы.
              </p>
            )}
          </div>
        </SettingsModal>
      ) : null}

      {appToRotate ? (
        <ConfirmDialog
          confirmLabel="Выпустить новый"
          danger
          description={`Выпустить новый токен для «${appToRotate.name}»? Старый токен сразу перестанет действовать — обновите его в вашем приложении.`}
          eyebrow="Внешнее приложение"
          onCancel={() => setAppToRotate(null)}
          onConfirm={confirmRotateToken}
          title="Выпустить новый токен?"
        />
      ) : null}

      {appToDelete ? (
        <ConfirmDialog
          confirmLabel="Отключить"
          danger
          description={`Отключить «${appToDelete.name}»? Приложение перестанет принимать и получать сообщения, токен станет недействительным.`}
          eyebrow="Внешнее приложение"
          onCancel={() => setAppToDelete(null)}
          onConfirm={confirmDeleteApp}
          title="Отключить приложение?"
        />
      ) : null}
    </section>
  );
}

function IssuedRow({ hint, label, multiline = false, onCopy, value }) {
  return (
    <div className="api-key-reveal-row">
      <span>{label}</span>
      <div className="external-app-copy-row">
        <code className={`api-key-reveal-secret external-app-secret ${multiline ? "multiline" : ""}`}>{value}</code>
        <button onClick={() => onCopy(label, value)} title={`Копировать: ${label}`} type="button">
          <Copy size={15} />
          Копировать
        </button>
      </div>
      {hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildInboundUrl(inboundPath) {
  const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  return `${origin}${inboundPath}`;
}

function buildExampleCommand(inboundUrl) {
  return [
    `curl -X POST "${inboundUrl}" \\`,
    "  -H \"Content-Type: application/json\" \\",
    "  -d '{\"sender\": {\"id\": \"client-1\", \"name\": \"Иван\"}, \"message\": {\"type\": \"text\", \"id\": \"m-1\", \"text\": \"Добрый день!\"}}'"
  ].join("\n");
}
