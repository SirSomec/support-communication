import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, KeyRound, LoaderCircle, Pencil, PlugZap, Power, ShieldCheck, Trash2, X } from "lucide-react";
import { ConfirmDialog, SectionTitle, StatusBadge } from "../../ui.jsx";
import { supportAdminService } from "../../services/supportAdminService.js";
import { tenantService } from "../../services/tenantService.js";
import { formatDateTime, formatLabel, getStatusTone } from "./serviceAdminUtils.js";

const initialForm = { baseUrl: "", chatModel: "", embeddingModel: "", maxConcurrentRuns: "", monthlyTokenBudget: "", requestsPerMinute: "", secret: "" };

export function AiConnectionsWorkspace({ onAudit, onToast }) {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [connectionToDelete, setConnectionToDelete] = useState(null);
  const connectionRequestRef = useRef({ controller: null, sequence: 0, tenantId: "" });

  const loadConnections = useCallback(async (nextTenantId) => {
    if (!nextTenantId) return false;
    connectionRequestRef.current.controller?.abort();
    const request = {
      controller: new AbortController(),
      sequence: connectionRequestRef.current.sequence + 1,
      tenantId: nextTenantId
    };
    connectionRequestRef.current = request;
    const envelope = await supportAdminService.fetchAiConnections(nextTenantId, { signal: request.controller.signal });
    if (request.controller.signal.aborted || connectionRequestRef.current.sequence !== request.sequence) return false;
    if (envelope.status !== "ok") { setError(envelope.error?.message ?? "Не удалось загрузить AI-подключения."); return; }
    setConnections(envelope.data?.connections ?? []);
    return true;
  }, []);

  useEffect(() => {
    let active = true;
    tenantService.fetchTenants().then((envelope) => {
      if (!active || envelope.status !== "ok") return;
      const items = envelope.data?.items ?? [];
      setTenants(items);
      setTenantId(items[0]?.id ?? "");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setConnections([]);
    setEditingId("");
    setForm(initialForm);
    setConnectionToDelete(null);
    setError("");
    void loadConnections(tenantId);
    return () => {
      if (connectionRequestRef.current.tenantId === tenantId) {
        connectionRequestRef.current.controller?.abort();
      }
    };
  }, [loadConnections, tenantId]);

  function update(field, value) { setForm((current) => ({ ...current, [field]: value })); }

  async function saveConnection(event) {
    event.preventDefault();
    if (!tenantId || !form.baseUrl.trim() || !form.chatModel.trim() || (!editingId && !form.secret.trim())) {
      setError(editingId ? "Укажите адрес провайдера и модель." : "Укажите адрес провайдера, модель и API-ключ.");
      return;
    }
    setBusy("save"); setError("");
    const payload = {
      baseUrl: form.baseUrl.trim(),
      capabilities: ["chat_completion"],
      chatModel: form.chatModel.trim(),
      embeddingModel: form.embeddingModel.trim() || null,
      limits: { ...(form.maxConcurrentRuns ? { maxConcurrentRuns: Number(form.maxConcurrentRuns) } : {}), ...(form.requestsPerMinute ? { requestsPerMinute: Number(form.requestsPerMinute) } : {}), ...(form.monthlyTokenBudget ? { monthlyTokenBudget: Number(form.monthlyTokenBudget) } : {}) },
      ...(form.secret.trim() ? { secret: form.secret } : {})
    };
    const savedConnectionId = editingId;
    const envelope = savedConnectionId
      ? await supportAdminService.updateAiConnection(tenantId, savedConnectionId, payload)
      : await supportAdminService.createAiConnection(tenantId, payload);
    setBusy("");
    if (envelope.status !== "ok") { setError(envelope.error?.message ?? "Не удалось сохранить подключение."); return; }
    cancelEditing();
    await loadConnections(tenantId);
    onAudit?.(envelope, { action: savedConnectionId ? "ai.connection.update" : "ai.connection.create", target: savedConnectionId || tenantId });
    onToast?.(savedConnectionId ? "Настройки сохранены. Если ключ заменён, повторно проверьте подключение." : "Подключение сохранено. Проверьте его коротким тестом перед включением.");
  }

  function editConnection(connection) {
    setEditingId(connection.id); setError("");
    setForm({ baseUrl: connection.baseUrl ?? "", chatModel: connection.chatModel ?? "", embeddingModel: connection.embeddingModel ?? "", maxConcurrentRuns: connection.limits?.maxConcurrentRuns ?? "", monthlyTokenBudget: connection.limits?.monthlyTokenBudget ?? "", requestsPerMinute: connection.limits?.requestsPerMinute ?? "", secret: "" });
  }

  function cancelEditing() { setEditingId(""); setForm(initialForm); setError(""); }

  async function deleteConnection(connection) {
    setBusy(`delete:${connection.id}`); setError("");
    const envelope = await supportAdminService.deleteAiConnection(tenantId, connection.id);
    setBusy("");
    if (envelope.status !== "ok") { setError(envelope.error?.message ?? "Не удалось удалить подключение."); return; }
    if (editingId === connection.id) cancelEditing();
    await loadConnections(tenantId);
    onAudit?.(envelope, { action: "ai.connection.delete", target: connection.id });
    onToast?.("AI-подключение удалено вместе с сохранённым ключом.");
  }

  async function testConnection(connection) {
    setBusy(`test:${connection.id}`); setError("");
    const envelope = await supportAdminService.testAiConnection(tenantId, connection.id);
    setBusy(""); await loadConnections(tenantId);
    onAudit?.(envelope, { action: "ai.connection.test", target: connection.id });
    if (envelope.status === "ok") onToast?.("Подключение проверено: провайдер ответил."); else setError(envelope.error?.message ?? "Провайдер не ответил на тест.");
  }

  async function disableConnection(connection) {
    setBusy(`disable:${connection.id}`);
    const envelope = await supportAdminService.disableAiConnection(tenantId, connection.id);
    setBusy(""); await loadConnections(tenantId);
    onAudit?.(envelope, { action: "ai.connection.disable", target: connection.id });
  }

  return <div className="service-admin-workspace-grid ai-connections-workspace">
    <section className="service-admin-list-panel">
      <header className="service-admin-panel-toolbar"><PlugZap size={18} /><strong>AI-подключения клиента</strong></header>
      <label className="service-admin-reason-field"><span>Организация</span><select disabled={Boolean(busy)} onChange={(event) => setTenantId(event.target.value)} value={tenantId}>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
      <div className="service-admin-mini-list">
        {connections.length ? connections.map((connection) => <article key={connection.id}><span className={connection.status === "ready" ? "ok" : connection.status === "error" ? "danger" : "warn"}><b>{connection.chatModel}</b><small>{connection.baseUrl}</small></span><StatusBadge tone={getStatusTone(connection.status)}>{formatLabel(connection.status)}</StatusBadge><small>{connection.secretConfigured ? "Ключ сохранён: ••••••••" : "Ключ не настроен"}</small><small>{connection.lastTestedAt ? `Проверено: ${formatDateTime(connection.lastTestedAt)}` : "Ещё не проверено"}</small><small>Использовано в этом месяце: {connection.usage?.usedTokens ?? 0}{connection.limits?.monthlyTokenBudget ? ` / ${connection.limits.monthlyTokenBudget} токенов` : " токенов"}</small><footer><button disabled={Boolean(busy)} onClick={() => editConnection(connection)} type="button"><Pencil size={14} />Изменить</button><button disabled={Boolean(busy)} onClick={() => void testConnection(connection)} type="button">{busy === `test:${connection.id}` ? "Проверяем…" : "Проверить"}</button><button disabled={Boolean(busy) || connection.status === "disabled"} onClick={() => void disableConnection(connection)} type="button"><Power size={14} />Отключить</button><button className="danger" disabled={Boolean(busy)} onClick={() => setConnectionToDelete(connection)} type="button"><Trash2 size={14} />Удалить</button></footer></article>) : <p>Для этой организации AI ещё не настроен.</p>}
      </div>
    </section>
    <section className="service-admin-detail-panel">
      <SectionTitle title={editingId ? "Изменить AI-подключение" : "Подключить AI-провайдера"} action="Ключ не сохраняется в браузере" />
      <p className="ai-connection-note"><ShieldCheck size={17} />Ключ будет зашифрован на сервере. После сохранения его нельзя посмотреть — только заменить.</p>
      <form className="service-admin-action-box" onSubmit={saveConnection}>
        <label className="service-admin-reason-field"><span>Тип провайдера</span><select disabled value="openai_compatible"><option value="openai_compatible">OpenAI-совместимый API</option></select><small>Подходит для OpenAI и других сервисов с совместимым Chat Completions API.</small></label>
        <label className="service-admin-reason-field"><span>Адрес API провайдера</span><input onChange={(event) => update("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" value={form.baseUrl} /></label>
        <label className="service-admin-reason-field"><span>Модель для ответов</span><input onChange={(event) => update("chatModel", event.target.value)} placeholder="Например, gpt-4.1-mini" value={form.chatModel} /></label>
        <label className="service-admin-reason-field"><span>Модель для поиска (необязательно)</span><input onChange={(event) => update("embeddingModel", event.target.value)} placeholder="Будет нужна при подключении базы знаний" value={form.embeddingModel} /></label>
        <label className="service-admin-reason-field"><span>Лимит запросов в минуту (необязательно)</span><input inputMode="numeric" onChange={(event) => update("requestsPerMinute", event.target.value)} value={form.requestsPerMinute} /></label>
        <label className="service-admin-reason-field"><span>Одновременных AI-ответов (необязательно)</span><input inputMode="numeric" min="1" onChange={(event) => update("maxConcurrentRuns", event.target.value)} value={form.maxConcurrentRuns} /></label>
        <label className="service-admin-reason-field"><span>Месячный лимит токенов (необязательно)</span><input inputMode="numeric" onChange={(event) => update("monthlyTokenBudget", event.target.value)} value={form.monthlyTokenBudget} /></label>
        <label className="service-admin-reason-field"><span>{editingId ? "Новый API-ключ (оставьте пустым, чтобы не менять)" : "API-ключ"}</span><input autoComplete="new-password" onChange={(event) => update("secret", event.target.value)} placeholder={editingId ? "Сохранённый ключ: ••••••••" : "Вставьте ключ"} type="password" value={form.secret} /></label>
        {error ? <p className="service-admin-feedback danger">{error}</p> : null}
        <footer><button className="primary-action" disabled={busy === "save" || !tenantId} type="submit">{busy === "save" ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />}{editingId ? "Сохранить изменения" : "Сохранить подключение"}</button>{editingId ? <button onClick={cancelEditing} type="button"><X size={15} />Отмена</button> : null}</footer>
      </form>
      <p className="ai-connection-note"><CheckCircle2 size={17} />После сохранения используйте «Проверить»: тест не передаёт документы или переписки клиента.</p>
    </section>
    {connectionToDelete ? (
      <ConfirmDialog
        confirmLabel="Удалить"
        danger
        description={`Удалить AI-подключение «${connectionToDelete.chatModel}»? Сценарии, использующие его, перестанут отвечать через AI. Сохранённый ключ будет удалён.`}
        eyebrow="AI-подключение"
        onCancel={() => setConnectionToDelete(null)}
        onConfirm={() => {
          const connection = connectionToDelete;
          setConnectionToDelete(null);
          void deleteConnection(connection);
        }}
        title="Удалить подключение?"
      />
    ) : null}
  </div>;
}
