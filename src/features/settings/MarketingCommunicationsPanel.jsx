import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { marketingService } from "../../services/marketingService.js";

const emptyWorkspace = Object.freeze({ apiKeys: [], settings: {}, users: [] });

export function MarketingCommunicationsPanel({ onToast }) {
  const [status, setStatus] = useState("loading");
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [secret, setSecret] = useState("");
  const [settingsDraft, setSettingsDraft] = useState({ allowWithoutConsent: false, consentText: "", quietHoursEnd: "9", quietHoursStart: "21", requestConsentEnabled: true });

  const load = useCallback(async () => {
    setStatus("loading");
    const access = await marketingService.getAccessStatus();
    if (access.status !== "ok") { setStatus("error"); return; }
    if (!access.data?.isOwner) { setStatus("forbidden"); return; }
    const response = await marketingService.fetchWorkspace();
    if (response.status !== "ok") { setStatus("error"); return; }
    const data = response.data ?? {};
    setWorkspace({ ...emptyWorkspace, ...data });
    setSettingsDraft({
      allowWithoutConsent: data.settings?.allowWithoutConsent === true,
      consentText: data.settings?.consentText ?? "",
      quietHoursEnd: String(data.settings?.quietHoursEnd ?? 9),
      quietHoursStart: String(data.settings?.quietHoursStart ?? 21),
      requestConsentEnabled: data.settings?.requestConsentEnabled !== false
    });
    setStatus("ready");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateAccess = async (user) => {
    const response = await marketingService.updateAccess(user.id, !user.marketingEnabled);
    onToast?.(response.status === "ok" ? `Доступ ${user.marketingEnabled ? "отозван" : "выдан"}.` : response.error?.message ?? "Не удалось изменить доступ.");
    if (response.status === "ok") void load();
  };

  const createApiKey = async () => {
    const response = await marketingService.createApiKey();
    if (response.status !== "ok") { onToast?.(response.error?.message ?? "Не удалось создать API-ключ."); return; }
    setSecret(response.data?.apiKey?.secret ?? "");
    onToast?.("API-ключ создан. Скопируйте секрет сейчас: повторно он не показывается.");
    void load();
  };

  const revokeApiKey = async (apiKeyId) => {
    const response = await marketingService.revokeApiKey(apiKeyId);
    onToast?.(response.status === "ok" ? "API-ключ отозван." : response.error?.message ?? "Не удалось отозвать API-ключ.");
    if (response.status === "ok") void load();
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    const response = await marketingService.updateSettings({ ...settingsDraft, quietHoursEnd: Number(settingsDraft.quietHoursEnd), quietHoursStart: Number(settingsDraft.quietHoursStart) });
    onToast?.(response.status === "ok" ? "Правила маркетинговых рассылок сохранены." : response.error?.message ?? "Не удалось сохранить настройки.");
    if (response.status === "ok") void load();
  };

  const copySecret = async () => {
    try { await navigator.clipboard.writeText(secret); onToast?.("Секрет API-ключа скопирован."); }
    catch { onToast?.("Не удалось скопировать ключ автоматически. Скопируйте его вручную."); }
  };

  if (status === "loading") return <section className="marketing-settings-panel-card"><span>Загружаем настройки рассылок…</span></section>;
  if (status === "forbidden") return <section className="marketing-settings-panel-card marketing-settings-panel-empty"><ShieldCheck size={24} /><div><h2>Управление доступно владельцу</h2><p>Владелец организации может выдавать доступ к рассылкам и управлять API-ключами.</p></div></section>;
  if (status === "error") return <section className="marketing-settings-panel-card marketing-settings-panel-empty"><div><h2>Настройки рассылок недоступны</h2><p>Не удалось загрузить данные. Повторите попытку.</p></div><button onClick={load} type="button"><RefreshCw size={16} /> Повторить</button></section>;

  const users = Array.isArray(workspace.users) ? workspace.users : [];
  const apiKeys = Array.isArray(workspace.apiKeys) ? workspace.apiKeys : [];
  return <section className="marketing-settings-global">
    <header><div><span className="settings-panel-kicker">Рассылки</span><h2>Доступы и API</h2><p>Выдавайте доступ к маркетинговым рассылкам и управляйте интеграционными ключами.</p></div><button onClick={load} type="button"><RefreshCw size={16} /> Обновить</button></header>
    <div className="marketing-settings-global-grid">
      <section className="marketing-settings-panel-card"><div className="marketing-settings-panel-title"><UsersRound size={19} /><div><h3>Доступы команды</h3><p>Права выдаются отдельно от роли пользователя.</p></div></div><div className="marketing-settings-user-list">{users.map((user) => <article key={user.id}><span><strong>{user.name}</strong><small>{user.email} · {user.role}</small></span><button className={user.marketingEnabled ? "danger-action" : "primary-action"} disabled={String(user.role).toLowerCase() === "owner"} onClick={() => updateAccess(user)} type="button">{user.marketingEnabled ? "Отозвать" : "Выдать доступ"}</button></article>)}</div></section>
      <section className="marketing-settings-panel-card"><div className="marketing-settings-panel-title"><KeyRound size={19} /><div><h3>API-ключи</h3><p>Создавайте ключи для внешних интеграций.</p></div></div><button className="primary-action" onClick={createApiKey} type="button"><KeyRound size={16} /> Создать API-ключ</button>{secret ? <div className="marketing-settings-secret"><small>Новый секрет — сохраните его сейчас</small><code>{secret}</code><button onClick={copySecret} type="button"><Copy size={16} /> Скопировать</button></div> : null}<div className="marketing-settings-key-list">{apiKeys.length ? apiKeys.map((apiKey) => <article key={apiKey.id}><span><strong>mk_live_…{apiKey.keyLastFour}</strong><small>{apiKey.revokedAt ? "отозван" : "активен"} · {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString("ru-RU") : "ещё не использовался"}</small></span>{!apiKey.revokedAt ? <button className="danger-action" onClick={() => revokeApiKey(apiKey.id)} type="button">Отозвать</button> : null}</article>) : <small>Активных ключей пока нет.</small>}</div></section>
    </div>
    <form className="marketing-settings-panel-card marketing-settings-rules" onSubmit={saveSettings}><div className="marketing-settings-panel-title"><ShieldCheck size={19} /><div><h3>Согласия и тихие часы</h3><p>Настройте, нужно ли автоматически запрашивать согласие и можно ли запускать рассылки до его получения.</p></div></div><div className="marketing-settings-consent-toggles"><label className="marketing-settings-check-card"><input checked={settingsDraft.requestConsentEnabled} onChange={(event) => setSettingsDraft((value) => ({ ...value, requestConsentEnabled: event.target.checked }))} type="checkbox" /><span><strong>Запрашивать согласие</strong><small>При первом использовании канала клиент получит текст согласия. Любой следующий ответ подтвердит его.</small></span></label><label className={`marketing-settings-check-card${settingsDraft.allowWithoutConsent ? " is-warning" : ""}`}><input checked={settingsDraft.allowWithoutConsent} onChange={(event) => setSettingsDraft((value) => ({ ...value, allowWithoutConsent: event.target.checked }))} type="checkbox" /><span><strong>Разрешить рассылки без согласия</strong><small>Сообщения можно отправлять до получения ответа. Явный отзыв согласия по-прежнему блокирует отправку.</small></span></label></div><div><label>Тихие часы с<select value={settingsDraft.quietHoursStart} onChange={(event) => setSettingsDraft((value) => ({ ...value, quietHoursStart: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label><label>до<select value={settingsDraft.quietHoursEnd} onChange={(event) => setSettingsDraft((value) => ({ ...value, quietHoursEnd: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label></div><label>Текст запроса согласия<textarea disabled={!settingsDraft.requestConsentEnabled} value={settingsDraft.consentText} onChange={(event) => setSettingsDraft((value) => ({ ...value, consentText: event.target.value }))} /></label>{settingsDraft.allowWithoutConsent ? <div className="marketing-settings-consent-warning" role="note"><ShieldCheck size={17} /><span><strong>Повышенный риск</strong><small>Убедитесь, что отправка без предварительного согласия разрешена применимыми правилами и законодательством.</small></span></div> : null}<button className="primary-action" type="submit"><Check size={16} /> Сохранить правила</button></form>
  </section>;
}
