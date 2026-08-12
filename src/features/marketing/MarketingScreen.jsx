import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Copy, KeyRound, Megaphone, PauseCircle, PlayCircle, Plus, RefreshCw, SendHorizontal, Settings2, ShieldCheck, UsersRound, X } from "lucide-react";
import { uploadComposerAttachment } from "../../app/useComposerAttachments.js";
import { ProductScreen, StatusBadge, WorkspaceState } from "../../ui.jsx";
import { marketingService } from "../../services/marketingService.js";
import "./marketing.css";

const emptyWorkspace = Object.freeze({ audiences: [], campaigns: [], settings: null, templates: [] });
const marketingPlans = Object.freeze([
  { key: "start", name: "Start", price: "4 900 ₽/мес.", included: "10 000 сообщений", overage: "0,50 ₽ за сообщение сверх лимита" },
  { key: "business", name: "Business", price: "9 900 ₽/мес.", included: "50 000 сообщений", overage: "0,30 ₽ за сообщение сверх лимита" },
  { key: "scale", name: "Scale", price: "19 900 ₽/мес.", included: "100 000 сообщений", overage: "0,20 ₽ за сообщение сверх лимита" }
]);

export function MarketingScreen({ onBack, onToast }) {
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accessInfo, setAccessInfo] = useState(null);
  const [activatingPlan, setActivatingPlan] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [draft, setDraft] = useState({ audienceId: "", buttonLabel: "", buttonUrl: "", channels: "", clientIds: "", contentText: "", mediaType: "image", mediaUrl: "", scheduledAt: "", strategy: "manual", title: "" });
  const [contentBlocks, setContentBlocks] = useState([]);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [testClientIds, setTestClientIds] = useState("");
  const [audienceDraft, setAudienceDraft] = useState({ name: "", clientIds: "", records: "" });
  const [audienceImportReview, setAudienceImportReview] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({ title: "", contentText: "" });
  const [settingsDraft, setSettingsDraft] = useState({ consentText: "", quietHoursEnd: "9", quietHoursStart: "21" });
  const [campaignResult, setCampaignResult] = useState(null);
  const [activeView, setActiveView] = useState("campaigns");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadWorkspace = useCallback(async () => {
    setStatus("loading");
    const accessResponse = await marketingService.getAccessStatus();
    if (accessResponse.status !== "ok") {
      setError(accessResponse.error?.message ?? "Не удалось проверить доступ к модулю.");
      setStatus("error");
      return;
    }
    const nextAccess = accessResponse.data ?? {};
    setAccessInfo(nextAccess);
    if (!nextAccess.allowed) {
      setWorkspace({ ...emptyWorkspace, settings: { moduleStatus: nextAccess.moduleStatus, planKey: nextAccess.planKey } });
      setStatus("inactive");
      return;
    }
    const response = await marketingService.fetchWorkspace();
    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось загрузить коммуникации.");
      setStatus("error");
      return;
    }
    setWorkspace({
      ...emptyWorkspace,
      ...(response.data ?? {}),
      access: { ...(response.data?.access ?? {}), isOwner: Boolean(response.data?.access?.isOwner || nextAccess.isOwner) }
    });
    setSettingsDraft({
      consentText: response.data?.settings?.consentText ?? "",
      quietHoursEnd: String(response.data?.settings?.quietHoursEnd ?? 9),
      quietHoursStart: String(response.data?.settings?.quietHoursStart ?? 21)
    });
    setStatus("ready");
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const campaignRows = useMemo(() => Array.isArray(workspace.campaigns) ? workspace.campaigns : [], [workspace.campaigns]);
  const audiences = Array.isArray(workspace.audiences) ? workspace.audiences : [];
  const templates = Array.isArray(workspace.templates) ? workspace.templates : [];
  const users = Array.isArray(workspace.users) ? workspace.users : [];
  const apiKeys = Array.isArray(workspace.apiKeys) ? workspace.apiKeys : [];
  const isOwner = Boolean(workspace.access?.isOwner || accessInfo?.isOwner);
  const previewBlocks = useMemo(() => buildDraftContent(draft, contentBlocks).blocks, [contentBlocks, draft]);

  const createCampaign = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    const response = await marketingService.createCampaign({
      audienceId: draft.audienceId || undefined,
      channels: draft.channels.split(",").map((item) => item.trim()).filter(Boolean),
      clientIds: draft.clientIds.split(",").map((item) => item.trim()).filter(Boolean),
      content: buildDraftContent(draft, contentBlocks),
      scheduledAt: draft.scheduledAt ? new Date(draft.scheduledAt).toISOString() : undefined,
      strategy: draft.strategy,
      title: draft.title
    });
    setSubmitting(false);
    if (response.status !== "ok") { onToast?.(response.error?.message ?? "Не удалось создать кампанию."); return; }
    const testRecipients = testClientIds.split(",").map((item) => item.trim()).filter(Boolean);
    setDraft({ audienceId: "", buttonLabel: "", buttonUrl: "", channels: "", clientIds: "", contentText: "", mediaType: "image", mediaUrl: "", scheduledAt: "", strategy: "manual", title: "" });
    setContentBlocks([]);
    setSelectedTemplateId("");
    setTestClientIds("");
    if (testRecipients.length) {
      const tested = await marketingService.testCampaign(response.data?.campaign?.id, testRecipients);
      onToast?.(tested.status === "ok" ? `\u0422\u0435\u0441\u0442: \u0432 \u043e\u0447\u0435\u0440\u0435\u0434\u0438 ${tested.data?.queued ?? 0}.` : tested.error?.message ?? "\u0422\u0435\u0441\u0442\u043e\u0432\u0430\u044f \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0430 \u043d\u0435 \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u0430.");
    }
    onToast?.("Черновик кампании создан.");
    void loadWorkspace();
  };

  const createAudience = async (event) => {
    event.preventDefault();
    let records;
    try { records = audienceDraft.records.trim() ? JSON.parse(audienceDraft.records) : undefined; }
    catch { onToast?.("Импорт должен быть JSON-массивом записей с clientId, externalId, phone или email."); return; }
    if (records?.length) {
      const preview = await marketingService.previewAudienceImport(records);
      if (preview.status !== "ok") { onToast?.(preview.error?.message ?? "Не удалось сверить импорт с клиентской базой."); return; }
      if (preview.data?.summary?.reviewRequired) {
        setAudienceImportReview({ overrides: {}, records, rows: preview.data.records ?? [], summary: preview.data.summary });
        onToast?.(`Требуется ручная проверка строк: ${preview.data.summary.reviewRequired}.`);
        return;
      }
    }
    const response = await marketingService.createAudience({
      name: audienceDraft.name,
      clientIds: audienceDraft.clientIds.split(",").map((item) => item.trim()).filter(Boolean),
      records,
      source: records ? "import" : "manual"
    });
    onToast?.(response.status === "ok" ? `Аудитория создана: сопоставлено ${response.data?.matchedCount ?? 0}.` : response.error?.message ?? "Не удалось создать аудиторию.");
    if (response.status === "ok") { setAudienceDraft({ name: "", clientIds: "", records: "" }); setAudienceImportReview(null); void loadWorkspace(); }
  };

  const confirmAudienceImport = async () => {
    if (!audienceImportReview) return;
    const response = await marketingService.createAudience({
      name: audienceDraft.name,
      clientIds: audienceDraft.clientIds.split(",").map((item) => item.trim()).filter(Boolean),
      matchOverrides: audienceImportReview.overrides,
      records: audienceImportReview.records,
      source: "import"
    });
    onToast?.(response.status === "ok" ? `Аудитория создана: сопоставлено ${response.data?.matchedCount ?? 0}.` : response.error?.message ?? "Не удалось создать аудиторию.");
    if (response.status === "ok") { setAudienceDraft({ name: "", clientIds: "", records: "" }); setAudienceImportReview(null); void loadWorkspace(); }
  };

  const archiveAudience = async (audienceId) => {
    const response = await marketingService.archiveAudience(audienceId);
    onToast?.(response.status === "ok" ? "\u0410\u0443\u0434\u0438\u0442\u043e\u0440\u0438\u044f \u0430\u0440\u0445\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u043d\u0430." : response.error?.message ?? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0430\u0440\u0445\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0430\u0443\u0434\u0438\u0442\u043e\u0440\u0438\u044e.");
    if (response.status === "ok") void loadWorkspace();
  };

  const addContentBlock = (type) => setContentBlocks((current) => [...current, { id: crypto.randomUUID(), text: "", type, url: "" }]);
  const updateContentBlock = (id, patch) => setContentBlocks((current) => current.map((block) => block.id === id ? { ...block, ...patch } : block));
  const removeContentBlock = (id) => setContentBlocks((current) => current.filter((block) => block.id !== id));
  const applyTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    const blocks = Array.isArray(template?.content?.blocks) ? template.content.blocks : [];
    if (!template || !blocks.length) return;
    setContentBlocks(blocks.map(({ label, ...block }) => ({ ...block, id: crypto.randomUUID(), text: String(label ?? block.text ?? ""), url: String(block.url ?? "") })));
    setDraft((current) => ({ ...current, buttonLabel: "", buttonUrl: "", contentText: "", mediaUrl: "", title: current.title || template.title }));
    onToast?.("Шаблон загружен в редактор. Проверьте его в предпросмотре.");
  };
  const uploadContentFile = async (event) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    const channel = draft.channels.split(",").map((value) => value.trim()).find(Boolean);
    if (!file || !channel) { onToast?.("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u0430\u043d\u0430\u043b \u043a\u043e\u043c\u043c\u0443\u043d\u0438\u043a\u0430\u0446\u0438\u0438."); return; }
    if (file.size > 20 * 1024 * 1024) { onToast?.("\u0424\u0430\u0439\u043b \u043d\u0435 \u0434\u043e\u043b\u0436\u0435\u043d \u043f\u0440\u0435\u0432\u044b\u0448\u0430\u0442\u044c 20 \u041c\u0411."); return; }
    setMediaUploading(true);
    const attachment = { channel, file, idempotencyKey: `marketing-upload:${crypto.randomUUID()}`, mimeType: file.type || "application/octet-stream", name: file.name, sizeBytes: file.size };
    const uploaded = await uploadComposerAttachment(attachment);
    setMediaUploading(false);
    if (uploaded.status !== "ready" || !uploaded.fileId) { onToast?.(uploaded.error ?? "\u0424\u0430\u0439\u043b \u0435\u0449\u0451 \u043d\u0435 \u0433\u043e\u0442\u043e\u0432 \u043a \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0435."); return; }
    const type = file.type.startsWith("image/") ? "image" : draft.mediaType;
    setContentBlocks((current) => [...current, { fileId: uploaded.fileId, fileName: file.name, id: crypto.randomUUID(), mimeType: file.type, text: "", type, url: "" }]);
    onToast?.("\u0424\u0430\u0439\u043b \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d \u0438 \u043f\u0440\u043e\u0448\u0451\u043b \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0443.");
  };

  const createTemplate = async (event) => {
    event.preventDefault();
    const response = await marketingService.createTemplate({ title: templateDraft.title, content: { blocks: [{ type: "text", text: templateDraft.contentText }] } });
    onToast?.(response.status === "ok" ? "Шаблон сохранён." : response.error?.message ?? "Не удалось сохранить шаблон.");
    if (response.status === "ok") { setTemplateDraft({ title: "", contentText: "" }); void loadWorkspace(); }
  };

  const importAudienceFile = async (event) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Файл импорта не должен быть больше 10 МБ.");
      const fileName = file.name.toLowerCase();
      const xlsx = fileName.endsWith(".xlsx") ? await import("read-excel-file/browser") : null;
      const sheetRows = xlsx ? await xlsx.readSheet(file) : null;
      const records = sheetRows
        ? rowsToAudienceRecords(sheetRows)
        : fileName.endsWith(".json") ? JSON.parse(await file.text()) : parseAudienceCsv(await file.text());
      if (!Array.isArray(records)) throw new Error("Файл должен содержать массив записей.");
      setAudienceImportReview(null);
      setAudienceDraft((value) => ({ ...value, records: JSON.stringify(records.slice(0, 100_000)) }));
      onToast?.(`Загружено строк: ${Math.min(records.length, 100_000)}. Перед сохранением они будут сверены с базой клиентов.`);
    } catch (error) { onToast?.(error instanceof Error ? error.message : "Не удалось прочитать файл импорта."); }
  };

  const cloneCampaign = async (campaignId) => {
    const response = await marketingService.cloneCampaign(campaignId);
    onToast?.(response.status === "ok" ? "\u0421\u043e\u0437\u0434\u0430\u043d \u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u0443\u0435\u043c\u044b\u0439 \u0434\u0443\u0431\u043b\u0438\u043a\u0430\u0442 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438." : response.error?.message ?? "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0434\u0443\u0431\u043b\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e.");
    if (response.status === "ok") void loadWorkspace();
  };

  const execute = async (campaignId, action) => {
    const response = action === "launch" ? await marketingService.launchCampaign(campaignId)
      : action === "pause" ? await marketingService.pauseCampaign(campaignId)
        : action === "resume" ? await marketingService.resumeCampaign(campaignId)
        : await marketingService.cancelCampaign(campaignId);
    const deferred = Number(response.data?.deferredByQuietHours ?? 0);
    onToast?.(response.status === "ok" ? response.data?.crmAudienceStaleWarning ? "Кампания запущена по последнему успешному CRM-снимку. Синхронизация сообщила ошибку; обновите аудиторию в течение 24 часов." : deferred ? `Статус кампании обновлён: ${deferred} получателей будут отправлены после тихих часов.` : "Статус кампании обновлён." : response.error?.message ?? "Операция не выполнена.");
    if (response.status === "ok") void loadWorkspace();
  };

  const showCampaignResults = async (campaignId) => {
    const response = await marketingService.getCampaignResults(campaignId);
    if (response.status !== "ok") { onToast?.(response.error?.message ?? "Не удалось загрузить результаты кампании."); return; }
    setCampaignResult(response.data ?? null);
  };

  const loadMoreCampaignRecipients = async () => {
    const campaignId = campaignResult?.campaign?.id;
    const pagination = campaignResult?.pagination;
    if (!campaignId || !pagination?.hasNextPage) return;
    const response = await marketingService.getCampaignResults(campaignId, { page: Number(pagination.page) + 1, pageSize: pagination.pageSize });
    if (response.status !== "ok") { onToast?.(response.error?.message ?? "Не удалось загрузить следующую страницу получателей."); return; }
    setCampaignResult((current) => ({ ...response.data, recipients: [...(current?.recipients ?? []), ...(response.data?.recipients ?? [])] }));
  };

  const exportCampaignResults = async (kind, format = "csv") => {
    const campaignId = campaignResult?.campaign?.id;
    if (!campaignId) return;
    const response = await marketingService.exportCampaignResults(campaignId, kind, format);
    if (response.status !== "ok") { onToast?.(response.error?.message ?? "Не удалось подготовить экспорт."); return; }
    const fileStem = `${campaignResult.campaign.title || "campaign"}_${kind}`;
    if (format === "xlsx") await downloadMarketingXlsx(response.data?.rows ?? [], fileStem);
    else downloadMarketingCsv(response.data?.rows ?? [], fileStem);
    onToast?.(`${format.toUpperCase()}-экспорт подготовлен и записан в журнал аудита.`);
  };

  const retryFailedCampaign = async (campaignId) => {
    const response = await marketingService.retryFailedCampaign(campaignId);
    onToast?.(response.status === "ok" ? `Повторно поставлено в очередь: ${response.data?.retried ?? 0}.` : response.error?.message ?? "Не удалось повторить неуспешные доставки.");
    if (response.status === "ok") void loadWorkspace();
  };

  const showPreflight = async (campaignId) => {
    const response = await marketingService.preflightCampaign(campaignId);
    if (response.status !== "ok") { onToast?.(response.error?.message ?? "Не удалось выполнить preflight кампании."); return; }
    setCampaignResult({ preflight: response.data ?? {} });
  };

  const activateModule = async (planKey) => {
    setActivatingPlan(planKey);
    const response = await marketingService.activateModule(planKey);
    setActivatingPlan("");
    if (response.status !== "ok") {
      onToast?.(response.error?.message ?? "Не удалось подключить модуль.");
      return;
    }
    onToast?.("Модуль коммуникаций подключён. Тариф можно изменить в настройках модуля.");
    void loadWorkspace();
  };

  const updateUserAccess = async (user) => {
    const response = await marketingService.updateAccess(user.id, !user.marketingEnabled);
    onToast?.(response.status === "ok" ? `Доступ к коммуникациям ${user.marketingEnabled ? "отозван" : "выдан"}.` : response.error?.message ?? "Не удалось изменить доступ.");
    if (response.status === "ok") void loadWorkspace();
  };

  const createApiKey = async () => {
    const response = await marketingService.createApiKey();
    if (response.status !== "ok") { onToast?.(response.error?.message ?? "Не удалось создать API-ключ."); return; }
    setApiSecret(response.data?.apiKey?.secret ?? "");
    onToast?.("API-ключ создан. Скопируйте его сейчас: повторно секрет не показывается.");
  };

  const revokeApiKey = async (apiKeyId) => {
    const response = await marketingService.revokeApiKey(apiKeyId);
    onToast?.(response.status === "ok" ? "API-ключ отозван." : response.error?.message ?? "Не удалось отозвать API-ключ.");
    if (response.status === "ok") void loadWorkspace();
  };

  const copyApiSecret = async () => {
    if (!apiSecret) return;
    try {
      await navigator.clipboard.writeText(apiSecret);
      onToast?.("Секрет API-ключа скопирован.");
    } catch {
      onToast?.("Не удалось скопировать ключ автоматически. Выделите и скопируйте его вручную.");
    }
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    const response = await marketingService.updateSettings({
      consentText: settingsDraft.consentText,
      quietHoursEnd: Number(settingsDraft.quietHoursEnd),
      quietHoursStart: Number(settingsDraft.quietHoursStart)
    });
    onToast?.(response.status === "ok" ? "Настройки маркетинговых коммуникаций сохранены." : response.error?.message ?? "Не удалось сохранить настройки.");
    if (response.status === "ok") void loadWorkspace();
  };

  return (
    <ProductScreen title="Коммуникации" subtitle="Персональные и массовые маркетинговые кампании" onBack={onBack} backLabel="Диалоги" actions={<div className="marketing-header-actions">{workspace.access?.isOwner ? <button aria-label="Открыть настройки коммуникаций" className="marketing-icon-button" onClick={() => setSettingsOpen(true)} title="Настройки" type="button"><Settings2 size={18} /></button> : null}<button className="primary-action" onClick={loadWorkspace} type="button"><RefreshCw size={16} /> Обновить</button></div>}>
      {status === "loading" ? <WorkspaceState tone="loading" title="Загружаем кампании" /> : null}
      {status === "error" ? <WorkspaceState tone="error" title="Коммуникации недоступны" description={error} actionLabel="Повторить" onAction={loadWorkspace} /> : null}
      {status === "inactive" ? <section className="marketing-activation">
        <div><span className="marketing-eyebrow">Платный модуль</span><h2>Маркетинговые коммуникации</h2><p>Создавайте персональные и массовые кампании только для клиентов с согласием в выбранном канале. Включены статические аудитории, импорт с сопоставлением существующих профилей, тихие часы, шаблоны и статистика.</p><small>Тестовые и сообщения для запроса согласия не тарифицируются. Повторные попытки доставки бесплатны.</small></div>
        {accessInfo?.isOwner ? <div className="marketing-plan-grid">{marketingPlans.map((plan) => <article key={plan.key}><strong>{plan.name}</strong><b>{plan.price}</b><span>{plan.included}</span><small>{plan.overage}</small><button className="primary-action" disabled={Boolean(activatingPlan)} onClick={() => activateModule(plan.key)} type="button">{activatingPlan === plan.key ? "Подключаем…" : "Подключить"}</button></article>)}</div> : <WorkspaceState tone="empty" title="Модуль не подключён" description="Попросите владельца организации подключить тариф и выдать вам доступ к коммуникациям." />}
      </section> : null}
      {status === "ready" ? <div className={`marketing-workspace marketing-view-${activeView}`}>
        <section className="marketing-commandbar">
          <div><span className="marketing-eyebrow">Центр коммуникаций</span><h2>Кампании без лишнего шума</h2><p>Создавайте, запускайте и проверяйте рассылки в одном рабочем пространстве.</p></div>
          <div className="marketing-commandbar-meta"><span><Check size={15} /> Согласия и тихие часы учитываются автоматически</span></div>
        </section>
        <nav aria-label="Разделы коммуникаций" className="marketing-tabs">
          <button aria-current={activeView === "campaigns" ? "page" : undefined} className={activeView === "campaigns" ? "is-active" : ""} onClick={() => setActiveView("campaigns")} type="button"><Megaphone size={16} /> Кампании</button>
          <button aria-current={activeView === "audiences" ? "page" : undefined} className={activeView === "audiences" ? "is-active" : ""} onClick={() => setActiveView("audiences")} type="button"><UsersRound size={16} /> Аудитории</button>
          <button aria-current={activeView === "templates" ? "page" : undefined} className={activeView === "templates" ? "is-active" : ""} onClick={() => setActiveView("templates")} type="button"><Copy size={16} /> Шаблоны</button>
          <button aria-current={activeView === "analytics" ? "page" : undefined} className={activeView === "analytics" ? "is-active" : ""} onClick={() => setActiveView("analytics")} type="button"><BarChart3 size={16} /> Аналитика</button>
        </nav>
        {activeView === "analytics" ? <section className="marketing-analytics"><div><span className="marketing-eyebrow">Обзор периода</span><h2>Результаты коммуникаций</h2><p>Следите за объёмом отправок и быстрее находите кампании, которым нужно внимание.</p></div><div className="marketing-analytics-grid"><article><span>Сообщений отправлено</span><strong>{workspace.usage?.messages ?? 0}</strong></article><article><span>Кампаний в работе</span><strong>{campaignRows.filter((campaign) => ["scheduled", "sending", "paused"].includes(campaign.status)).length}</strong></article><article><span>Ошибок доставки</span><strong>{campaignRows.reduce((total, campaign) => total + Number(campaign.deliverySummary?.failed ?? 0), 0)}</strong></article></div></section> : null}
        <section className="marketing-summary" aria-label="Сводка коммуникаций" hidden={activeView !== "campaigns"}>
          <article><Megaphone size={20} /><span>Кампании</span><strong>{campaignRows.length}</strong></article>
          <article><UsersRound size={20} /><span>Статические аудитории</span><strong>{audiences.length}</strong></article>
          <article><SendHorizontal size={20} /><span>Тариф</span><strong>{workspace.settings?.planKey ?? "Не подключён"}</strong></article>
          <article><SendHorizontal size={20} /><span>Расход за период</span><strong>{workspace.usage?.messages ?? 0}</strong><small>{formatRoubles(workspace.usage?.overageKopeks ?? 0)} сверх лимита</small></article>
        </section>
        <section className="marketing-settings-workspace" hidden={activeView !== "settings"}>
          <header><span className="marketing-eyebrow">Настройки коммуникаций</span><h2>Доступы, API и правила отправки</h2><p>Управляйте участниками, интеграциями и политикой согласий в отдельном рабочем разделе.</p></header>
        {workspace.access?.isOwner ? <section className="marketing-access-panel"><div><h2>Доступ и API</h2><p>Владелец выдаёт полный доступ к модулю индивидуально. Роли и другие права не меняются.</p><button onClick={createApiKey} type="button">Создать API-ключ</button>{apiSecret ? <code className="marketing-api-secret">{apiSecret}</code> : null}<form className="marketing-settings-form" onSubmit={saveSettings}><strong>Тихие часы и согласие</strong><label>С <select value={settingsDraft.quietHoursStart} onChange={(event) => setSettingsDraft((value) => ({ ...value, quietHoursStart: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label><label>До <select value={settingsDraft.quietHoursEnd} onChange={(event) => setSettingsDraft((value) => ({ ...value, quietHoursEnd: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label><label>Текст согласия<textarea value={settingsDraft.consentText} onChange={(event) => setSettingsDraft((value) => ({ ...value, consentText: event.target.value }))} /></label><button type="submit">Сохранить</button></form></div><div className="marketing-access-list">{users.map((user) => <article key={user.id}><span><strong>{user.name}</strong><small>{user.email} · {user.role}</small></span><button className={user.marketingEnabled ? "danger-action" : "primary-action"} disabled={String(user.role).toLowerCase() === "owner"} onClick={() => updateUserAccess(user)} type="button">{user.marketingEnabled ? "Отозвать доступ" : "Выдать доступ"}</button></article>)}</div></section> : null}
        {workspace.access?.isOwner ? <section className="marketing-api-key-list"><div><h2>{"\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435 API-\u043a\u043b\u044e\u0447\u0438"}</h2><p>{"\u0421\u0435\u043a\u0440\u0435\u0442 \u0432\u044b\u0434\u0430\u0451\u0442\u0441\u044f \u0442\u043e\u043b\u044c\u043a\u043e \u043e\u0434\u0438\u043d \u0440\u0430\u0437. \u041e\u0442\u0437\u044b\u0432 \u043d\u0435\u043c\u0435\u0434\u043b\u0435\u043d\u043d\u043e \u043f\u0440\u0435\u043a\u0440\u0430\u0449\u0430\u0435\u0442 API-\u0434\u043e\u0441\u0442\u0443\u043f."}</p></div>{apiKeys.length ? <div className="marketing-api-key-rows">{apiKeys.map((apiKey) => <article key={apiKey.id}><span><strong>mk_live_…{apiKey.keyLastFour}</strong><small>{apiKey.revokedAt ? "\u043e\u0442\u043e\u0437\u0432\u0430\u043d" : "\u0430\u043a\u0442\u0438\u0432\u0435\u043d"} · {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString("ru-RU") : "\u0435\u0449\u0451 \u043d\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043b\u0441\u044f"}</small></span>{!apiKey.revokedAt ? <button className="danger-action" onClick={() => revokeApiKey(apiKey.id)} type="button">{"\u041e\u0442\u043e\u0437\u0432\u0430\u0442\u044c"}</button> : null}</article>)}</div> : <small>{"\u041a\u043b\u044e\u0447\u0435\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442."}</small>}</section> : null}
        </section>
        <section className="marketing-create" hidden={activeView !== "campaigns"}>
          <div><h2>Новая кампания</h2><p>Создайте черновик, добавьте блоки контента и проверьте его перед запуском.</p><MarketingMessagePreview blocks={previewBlocks} channels={draft.channels} title={draft.title} /></div>
          <form onSubmit={createCampaign}>
            <label className="marketing-content-field">{"\u0428\u0430\u0431\u043b\u043e\u043d"}<select onChange={(event) => applyTemplate(event.target.value)} value={selectedTemplateId}><option value="">{"\u041d\u0430\u0447\u0430\u0442\u044c \u0441 \u043f\u0443\u0441\u0442\u043e\u0433\u043e \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0430"}</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select><small>{"\u0428\u0430\u0431\u043b\u043e\u043d \u043a\u043e\u043f\u0438\u0440\u0443\u0435\u0442\u0441\u044f \u0432 \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a; \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043d\u0435 \u0437\u0430\u0442\u0440\u043e\u043d\u0443\u0442 \u043e\u0440\u0438\u0433\u0438\u043d\u0430\u043b."}</small></label>
            <label className="marketing-content-field">{"\u0422\u0435\u0441\u0442\u043e\u0432\u044b\u0435 \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u0438 (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)"}<input onChange={(event) => setTestClientIds(event.target.value)} placeholder="client_1, client_2" value={testClientIds} /><small>{"\u041f\u043e\u0441\u043b\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a\u0430 \u0442\u0435\u0441\u0442 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u0441\u044f \u0434\u043e 20 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u043c \u043f\u0440\u043e\u0444\u0438\u043b\u044f\u043c. \u0422\u0435\u0441\u0442\u044b \u0431\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b, \u043d\u043e \u0442\u0440\u0435\u0431\u0443\u044e\u0442 \u0441\u043e\u0433\u043b\u0430\u0441\u0438\u044f."}</small></label>
            <label className="marketing-content-field marketing-upload-control">{"\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443 \u0438\u043b\u0438 \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435"}<input accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.mp3,.mp4" disabled={mediaUploading} onChange={uploadContentFile} type="file" /><small>{mediaUploading ? "\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0438 \u0430\u043d\u0442\u0438\u0432\u0438\u0440\u0443\u0441\u043d\u0430\u044f \u043f\u0440\u043e\u0432\u0435\u0440\u043a\u0430…" : "\u0414\u043e 20 \u041c\u0411; \u0432 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e \u043f\u043e\u043f\u0430\u0434\u0443\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u043d\u044b\u0435 \u0444\u0430\u0439\u043b\u044b."}</small></label>
            <fieldset className="marketing-content-field marketing-block-builder"><legend>{"\u0414\u043e\u043f\u043e\u043b\u043d\u0438\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0431\u043b\u043e\u043a\u0438"}</legend><div className="marketing-block-add"><button onClick={() => addContentBlock("heading")} type="button">{"\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a"}</button><button onClick={() => addContentBlock("divider")} type="button">{"\u0420\u0430\u0437\u0434\u0435\u043b\u0438\u0442\u0435\u043b\u044c"}</button><button onClick={() => addContentBlock("spacer")} type="button">{"\u041e\u0442\u0441\u0442\u0443\u043f"}</button></div>{contentBlocks.map((block) => <div className="marketing-added-block" key={block.id}><select value={block.type} onChange={(event) => updateContentBlock(block.id, { type: event.target.value })}><option value="heading">{"\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a"}</option><option value="text">{"\u0422\u0435\u043a\u0441\u0442"}</option><option value="divider">{"\u0420\u0430\u0437\u0434\u0435\u043b\u0438\u0442\u0435\u043b\u044c"}</option><option value="spacer">{"\u041e\u0442\u0441\u0442\u0443\u043f"}</option></select>{["divider", "spacer"].includes(block.type) ? <span>{block.type}</span> : <input onChange={(event) => updateContentBlock(block.id, { text: event.target.value })} placeholder={"\u0422\u0435\u043a\u0441\u0442 \u0431\u043b\u043e\u043a\u0430"} value={block.text} />}<button className="danger-action" onClick={() => removeContentBlock(block.id)} type="button">×</button></div>)}</fieldset>
            <label>Название<input required value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></label>
            <label>Аудитория<select value={draft.audienceId} onChange={(event) => setDraft((value) => ({ ...value, audienceId: event.target.value }))}><option value="">Выберите аудиторию</option>{audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}</select></label>
            <label>Персональные получатели<input placeholder="client_1, client_2" value={draft.clientIds} onChange={(event) => setDraft((value) => ({ ...value, clientIds: event.target.value }))} /></label>
            <label>Каналы<input list="marketing-active-channels" required placeholder="telegram, vk" value={draft.channels} onChange={(event) => setDraft((value) => ({ ...value, channels: event.target.value }))} /><datalist id="marketing-active-channels">{(workspace.channels ?? []).map((channel) => <option key={channel.id} value={channel.type}>{channel.name}</option>)}</datalist><small>{(workspace.channelCapabilities ?? []).length ? (workspace.channelCapabilities ?? []).map((channel) => `${channel.channel}: ${channel.supportedBlocks.join(", ")}`).join(" · ") : "Подключите активный канал, чтобы увидеть доступные блоки."}</small></label>
            <label>Стратегия<select value={draft.strategy} onChange={(event) => setDraft((value) => ({ ...value, strategy: event.target.value }))}><option value="manual">Выбранные каналы</option><option value="preferred">Предпочтительный канал</option><option value="cascade">Каскад при технической ошибке</option><option value="all">Все выбранные каналы</option></select></label>
            <label>Запланировать<input type="datetime-local" value={draft.scheduledAt} onChange={(event) => setDraft((value) => ({ ...value, scheduledAt: event.target.value }))} /></label>
            <label className="marketing-content-field">Сообщение<textarea maxLength={4000} placeholder="Текст сообщения, эмодзи и переменные, например {{client.name}}" value={draft.contentText} onChange={(event) => setDraft((value) => ({ ...value, contentText: event.target.value }))} /></label>
            <p className="marketing-content-field">Изображения и вложения добавляйте через загрузку выше: в кампанию попадают только проверенные файлы организации.</p>
            <fieldset className="marketing-content-field marketing-block-controls"><legend>Кнопка / CTA</legend><input placeholder="Текст кнопки" value={draft.buttonLabel} onChange={(event) => setDraft((value) => ({ ...value, buttonLabel: event.target.value }))} /><input placeholder="https://…" type="url" value={draft.buttonUrl} onChange={(event) => setDraft((value) => ({ ...value, buttonUrl: event.target.value }))} /></fieldset>
            <button className="primary-action" disabled={submitting} type="submit"><Plus size={16} /> Создать черновик</button>
          </form>
        </section>
        <section className="marketing-tools" hidden={activeView === "campaigns" || activeView === "analytics"}>
          <form className="marketing-tool-card" onSubmit={createAudience}>
            <div><h2>Аудитории</h2><p>Используйте ID существующих клиентов или импорт JSON. Несопоставленные записи не создают новые профили и исключаются.</p></div>
            <label>Название<input required value={audienceDraft.name} onChange={(event) => setAudienceDraft((value) => ({ ...value, name: event.target.value }))} /></label>
            <label>Client ID через запятую<input value={audienceDraft.clientIds} onChange={(event) => setAudienceDraft((value) => ({ ...value, clientIds: event.target.value }))} /></label>
            <label>Импорт JSON<textarea placeholder={'[{"externalId":"crm-42"}]'} value={audienceDraft.records} onChange={(event) => setAudienceDraft((value) => ({ ...value, records: event.target.value }))} /></label>
            <label>CSV, XLSX или JSON<input accept=".csv,.xlsx,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json" onChange={importAudienceFile} type="file" /></label>
            <button className="primary-action" type="submit"><UsersRound size={16} /> Создать аудиторию</button>
          </form>
          <section className="marketing-tool-card marketing-audience-list"><div><h2>{"\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0430\u0443\u0434\u0438\u0442\u043e\u0440\u0438\u0438"}</h2><p>{"\u0410\u0440\u0445\u0438\u0432 \u0441\u043a\u0440\u044b\u0432\u0430\u0435\u0442 \u043a\u043e\u0433\u043e\u0440\u0442\u0443 \u0438\u0437 \u0432\u044b\u0431\u043e\u0440\u0430, \u043d\u043e \u043d\u0435 \u0443\u0434\u0430\u043b\u044f\u0435\u0442 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432."}</p></div>{audiences.length ? <div className="marketing-audience-rows">{audiences.map((audience) => <article key={audience.id}><span><strong>{audience.name}</strong><small>{audience.source} · {audience._count?.members ?? 0}</small></span><button className="danger-action" onClick={() => archiveAudience(audience.id)} type="button">{"\u0412 \u0430\u0440\u0445\u0438\u0432"}</button></article>)}</div> : <small>{"\u041d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u0430\u0443\u0434\u0438\u0442\u043e\u0440\u0438\u0439."}</small>}</section>
          <form className="marketing-tool-card" onSubmit={createTemplate}>
            <div><h2>Шаблоны</h2><p>Маркетинговые шаблоны изолированы от поддержки. Контент хранится блоками и поддерживает текст, эмодзи и вложения.</p></div>
            <label>Название<input required value={templateDraft.title} onChange={(event) => setTemplateDraft((value) => ({ ...value, title: event.target.value }))} /></label>
            <label>Текст шаблона<textarea required value={templateDraft.contentText} onChange={(event) => setTemplateDraft((value) => ({ ...value, contentText: event.target.value }))} /></label>
            <button className="primary-action" type="submit"><Plus size={16} /> Сохранить шаблон</button>
            {workspace.templates?.length ? <small>Сохранено шаблонов: {workspace.templates.length}</small> : null}
          </form>
        </section>
        {audienceImportReview ? <section className="marketing-import-review"><div><strong>Проверка импорта</strong><span>Автоматически сопоставлено: {audienceImportReview.summary?.matched ?? 0}; требуют решения: {audienceImportReview.summary?.reviewRequired ?? 0}. Укажите ID существующего клиента либо оставьте строку исключённой.</span></div><div className="marketing-import-review-rows">{audienceImportReview.rows.filter((row) => row.status !== "matched").map((row) => <article key={row.index}><span><strong>Строка {row.index + 1}</strong><small>{row.status === "ambiguous" ? `Несколько совпадений: ${row.candidates.map((candidate) => `${candidate.name} (${candidate.id})`).join(", ")}` : "Совпадение не найдено"}</small></span><input onChange={(event) => setAudienceImportReview((current) => ({ ...current, overrides: { ...current.overrides, [row.index]: event.target.value } }))} placeholder="ID существующего клиента" value={audienceImportReview.overrides[row.index] ?? ""} /></article>)}</div><button className="primary-action" onClick={confirmAudienceImport} type="button">Подтвердить сопоставленные строки</button></section> : null}
        <section className="marketing-campaigns"><div className="section-title"><h2>Кампании</h2></div>{campaignRows.length ? <div className="marketing-list">{campaignRows.map((campaign) => <article key={campaign.id}><div><strong>{campaign.title}</strong><span>{campaign.channels?.join(", ") || "Канал не выбран"} · {campaign.strategy}</span></div><StatusBadge tone={statusTone(campaign.status)}>{campaign.status}</StatusBadge><div className="marketing-list-actions"><button onClick={() => showCampaignResults(campaign.id)} type="button">Результаты</button>{["draft", "scheduled"].includes(campaign.status) ? <><button onClick={() => showPreflight(campaign.id)} type="button">Проверить</button><button onClick={() => execute(campaign.id, "launch")} type="button"><PlayCircle size={16} /> Запустить</button></> : null}{campaign.status === "sending" ? <button onClick={() => execute(campaign.id, "pause")} type="button"><PauseCircle size={16} /> Пауза</button> : null}{!['completed', 'cancelled'].includes(campaign.status) ? <button className="danger-action" onClick={() => execute(campaign.id, "cancel")} type="button">Отменить</button> : null}</div></article>)}</div> : <WorkspaceState tone="empty" title="Кампаний пока нет" description="Создайте первую кампанию для выбранной статической аудитории." />}{campaignResult ? <div className="marketing-result-panel"><div><h3>{campaignResult.campaign?.title ?? "Проверка кампании"}</h3><button onClick={() => setCampaignResult(null)} type="button">Закрыть</button></div>{campaignResult.preflight ? <p>Аудитория: {campaignResult.preflight.audience} · к отправке: {campaignResult.preflight.eligible} · запрет канала: {campaignResult.preflight.exclusions?.channelRestricted ?? 0} · нет согласия: {campaignResult.preflight.exclusions?.consentRequired} · нет контакта: {campaignResult.preflight.exclusions?.destinationMissing} · прогноз перерасхода: {campaignResult.preflight.projectedOverageRecipients}</p> : <><p>{Object.entries(campaignResult.summary ?? {}).map(([statusName, count]) => `${statusName}: ${count}`).join(" · ") || "Доставки ещё не сформированы."}</p><MarketingCampaignRecipients onLoadMore={loadMoreCampaignRecipients} result={campaignResult} /></>}</div> : null}</section>
        {campaignResult?.campaign ? <section className="marketing-export-panel"><strong>{"\u042d\u043a\u0441\u043f\u043e\u0440\u0442 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u043e\u0432"}</strong><span>Сводка и получатели доступны в CSV и XLSX; состав полей и получатели фиксируются в аудите.</span><button onClick={() => exportCampaignResults("summary", "csv")} type="button">{"\u0421\u0432\u043e\u0434\u043a\u0430 CSV"}</button><button onClick={() => exportCampaignResults("detailed", "csv")} type="button">{"\u041f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u0438 CSV"}</button><button onClick={() => exportCampaignResults("summary", "xlsx")} type="button">Сводка XLSX</button><button onClick={() => exportCampaignResults("detailed", "xlsx")} type="button">Получатели XLSX</button></section> : null}
        {campaignRows.some((campaign) => Number(campaign.deliverySummary?.failed ?? 0) > 0) ? <section className="marketing-retry-panel"><strong>{"\u041f\u043e\u0432\u0442\u043e\u0440 \u043e\u0448\u0438\u0431\u043e\u043a \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438"}</strong><span>{"\u0412 \u043e\u0447\u0435\u0440\u0435\u0434\u044c \u043f\u043e\u043f\u0430\u0434\u0443\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0442\u0435\u0440\u043c\u0438\u043d\u0430\u043b\u044c\u043d\u043e \u043d\u0435\u0443\u0441\u043f\u0435\u0448\u043d\u044b\u0435 \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u0438; \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0433\u043e \u0441\u043f\u0438\u0441\u0430\u043d\u0438\u044f \u043d\u0435\u0442."}</span>{campaignRows.filter((campaign) => Number(campaign.deliverySummary?.failed ?? 0) > 0).map((campaign) => <button key={campaign.id} onClick={() => retryFailedCampaign(campaign.id)} type="button">{"\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c: "}{campaign.title}</button>)}</section> : null}
        {campaignRows.length ? <section className="marketing-clone-panel"><strong>{"\u0414\u0443\u0431\u043b\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e"}</strong><span>{"\u041a\u043e\u043f\u0438\u044f \u0441\u043e\u0437\u0434\u0430\u0451\u0442\u0441\u044f \u043a\u0430\u043a \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a \u0438 \u043d\u0435 \u0438\u0437\u043c\u0435\u043d\u044f\u0435\u0442 \u0438\u0441\u0445\u043e\u0434\u043d\u0443\u044e \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044e."}</span>{campaignRows.map((campaign) => <button key={campaign.id} onClick={() => cloneCampaign(campaign.id)} type="button">{"\u041a\u043e\u043f\u0438\u044f: "}{campaign.title}</button>)}</section> : null}
        {campaignRows.some((campaign) => campaign.status === "paused") ? <section className="marketing-resume-panel"><strong>{"\u041f\u0430\u0443\u0437\u0430 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0439"}</strong><span>{"\u0412\u043e\u0437\u043e\u0431\u043d\u043e\u0432\u043b\u044f\u0439\u0442\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0443: \u0442\u0438\u0445\u0438\u0435 \u0447\u0430\u0441\u044b \u0431\u0443\u0434\u0443\u0442 \u0443\u0447\u0442\u0435\u043d\u044b \u0434\u043b\u044f \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u043f\u043e\u043b\u0443\u0447\u0430\u0442\u0435\u043b\u044f \u043e\u0442\u0434\u0435\u043b\u044c\u043d\u043e."}</span>{campaignRows.filter((campaign) => campaign.status === "paused").map((campaign) => <button key={campaign.id} onClick={() => execute(campaign.id, "resume")} type="button"><PlayCircle size={16} /> {"\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c: "}{campaign.title}</button>)}</section> : null}
      </div> : null}
      {settingsOpen && workspace.access?.isOwner ? <MarketingSettingsDialog apiKeys={apiKeys} apiSecret={apiSecret} onClose={() => setSettingsOpen(false)} onCopyApiSecret={copyApiSecret} onCreateApiKey={createApiKey} onRevokeApiKey={revokeApiKey} onSaveSettings={saveSettings} onUpdateUserAccess={updateUserAccess} setSettingsDraft={setSettingsDraft} settingsDraft={settingsDraft} users={users} /> : null}
    </ProductScreen>
  );
}

function MarketingSettingsDialog({ apiKeys, apiSecret, onClose, onCopyApiSecret, onCreateApiKey, onRevokeApiKey, onSaveSettings, onUpdateUserAccess, setSettingsDraft, settingsDraft, users }) {
  const [section, setSection] = useState("general");
  const closeOnBackdrop = (event) => { if (event.target === event.currentTarget) onClose(); };
  return <div className="marketing-dialog-backdrop" onMouseDown={closeOnBackdrop}>
    <section aria-label="Настройки коммуникаций" aria-modal="true" className="marketing-dialog" role="dialog">
      <header className="marketing-dialog-header">
        <div><span className="marketing-eyebrow">Настройки</span><h2>Коммуникации</h2><p>Доступы, интеграции и правила отправки собраны в одном месте.</p></div>
        <button aria-label="Закрыть настройки" className="marketing-icon-button" onClick={onClose} type="button"><X size={18} /></button>
      </header>
      <div className="marketing-settings-layout">
        <nav aria-label="Разделы настроек" className="marketing-settings-nav">
          <button className={section === "general" ? "is-active" : ""} onClick={() => setSection("general")} type="button"><Settings2 size={16} /> Правила</button>
          <button className={section === "access" ? "is-active" : ""} onClick={() => setSection("access")} type="button"><ShieldCheck size={16} /> Доступы</button>
          <button className={section === "api" ? "is-active" : ""} onClick={() => setSection("api")} type="button"><KeyRound size={16} /> API-ключи</button>
        </nav>
        <div className="marketing-settings-panel">
          {section === "general" ? <form className="marketing-settings-form marketing-settings-form-modern" onSubmit={onSaveSettings}>
            <div><h3>Правила отправки</h3><p>Сервис самостоятельно применяет эти правила к каждой кампании.</p></div>
            <div className="marketing-settings-time"><label>Тихие часы с<select value={settingsDraft.quietHoursStart} onChange={(event) => setSettingsDraft((value) => ({ ...value, quietHoursStart: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label><label>до<select value={settingsDraft.quietHoursEnd} onChange={(event) => setSettingsDraft((value) => ({ ...value, quietHoursEnd: event.target.value }))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label></div>
            <label>Текст согласия<textarea value={settingsDraft.consentText} onChange={(event) => setSettingsDraft((value) => ({ ...value, consentText: event.target.value }))} /></label>
            <footer><button className="primary-action" type="submit"><Check size={16} /> Сохранить изменения</button></footer>
          </form> : null}
          {section === "access" ? <div className="marketing-settings-section"><div><h3>Доступ к коммуникациям</h3><p>Владелец выдаёт доступ каждому пользователю отдельно. Остальные роли не меняются.</p></div><div className="marketing-access-list marketing-access-list-modern">{users.map((user) => <article key={user.id}><span><strong>{user.name}</strong><small>{user.email} · {user.role}</small></span><button className={user.marketingEnabled ? "danger-action" : "primary-action"} disabled={String(user.role).toLowerCase() === "owner"} onClick={() => onUpdateUserAccess(user)} type="button">{user.marketingEnabled ? "Отозвать доступ" : "Выдать доступ"}</button></article>)}</div></div> : null}
          {section === "api" ? <div className="marketing-settings-section"><div className="marketing-api-intro"><div><h3>API-ключи</h3><p>Секрет показывается только после создания. Отзыв ключа сразу блокирует API-доступ.</p></div><button className="primary-action" onClick={onCreateApiKey} type="button"><KeyRound size={16} /> Создать ключ</button></div>{apiSecret ? <div className="marketing-api-secret-card"><span>Новый секрет — сохраните его сейчас</span><code>{apiSecret}</code><button onClick={onCopyApiSecret} type="button"><Copy size={16} /> Скопировать</button></div> : null}<div className="marketing-api-key-rows marketing-api-key-rows-modern">{apiKeys.length ? apiKeys.map((apiKey) => <article key={apiKey.id}><span><strong>mk_live_…{apiKey.keyLastFour}</strong><small>{apiKey.revokedAt ? "отозван" : "активен"} · {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString("ru-RU") : "ещё не использовался"}</small></span>{!apiKey.revokedAt ? <button className="danger-action" onClick={() => onRevokeApiKey(apiKey.id)} type="button">Отозвать</button> : null}</article>) : <div className="marketing-settings-empty"><KeyRound size={22} /><span>Активных ключей пока нет.</span></div>}</div></div> : null}
        </div>
      </div>
    </section>
  </div>;
}

function statusTone(status) { return status === "sending" ? "success" : status === "paused" ? "warning" : status === "cancelled" ? "danger" : "info"; }
function MarketingCampaignRecipients({ result, onLoadMore }) {
  const recipients = Array.isArray(result?.recipients) ? result.recipients : [];
  const pagination = result?.pagination;
  if (!recipients.length) return <small className="marketing-recipient-empty">Получатели ещё не поставлены в очередь или их нет на этой странице.</small>;
  return <div className="marketing-recipient-results">
    <div className="marketing-recipient-results-head"><strong>Получатели</strong><small>{pagination ? `Показано ${recipients.length} из ${pagination.total}` : `Показано ${recipients.length}`} · Прочтения: {result?.analytics?.read?.state === "not_supported" ? "нет данных у канала" : result?.analytics?.read?.count ?? "нет данных"}</small></div>
    <div className="marketing-recipient-results-list">{recipients.map((recipient) => <article key={recipient.id}><span><strong>{recipient.channel}</strong><small>{recipient.excludedReason || "В очереди или отправлено"}</small></span><StatusBadge tone={recipient.status === "failed" ? "danger" : recipient.status === "excluded" ? "warning" : recipient.status === "delivered" ? "success" : "info"}>{recipient.status}</StatusBadge></article>)}</div>
    {pagination?.hasNextPage ? <button onClick={onLoadMore} type="button">Загрузить следующую страницу</button> : null}
  </div>;
}
function buildDraftContent(draft, contentBlocks) {
  return { blocks: [
    ...(draft.contentText ? [{ type: "text", text: draft.contentText }] : []),
    ...(draft.buttonLabel && draft.buttonUrl ? [{ type: "button", label: draft.buttonLabel, url: draft.buttonUrl }] : []),
    ...contentBlocks.map((block) => ["divider", "spacer"].includes(block.type) ? { type: block.type } : ["image", "file", "gif", "audio", "video"].includes(block.type) ? { type: block.type, ...(block.fileId ? { fileId: block.fileId, fileName: block.fileName, mimeType: block.mimeType } : { url: block.url }) } : block.type === "button" ? { type: "button", label: block.label ?? block.text, url: block.url } : { type: block.type, text: block.text })
  ] };
}

function MarketingMessagePreview({ blocks, channels, title }) {
  const selectedChannels = channels.split(",").map((value) => value.trim()).filter(Boolean);
  return <section className="marketing-message-preview" aria-label={"\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438"}>
    <div className="marketing-preview-header"><span>{"\u041f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440"}</span><small>{selectedChannels.length ? selectedChannels.join(", ") : "\u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043a\u0430\u043d\u0430\u043b"}</small></div>
    <div className="marketing-preview-device">
      <div className="marketing-preview-recipient"><span>{"\u0410\u043b\u0435\u043a\u0441\u0435\u0439 \u0418\u0432\u0430\u043d\u043e\u0432"}</span><small>{title || "\u041d\u043e\u0432\u0430\u044f \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u044f"}</small></div>
      <div className="marketing-preview-message">
        {blocks.length ? blocks.map((block, index) => <MarketingPreviewBlock block={block} key={`${block.type ?? "block"}_${index}`} />) : <p className="marketing-preview-empty">{"\u0422\u0435\u043a\u0441\u0442, \u0441\u043c\u0430\u0439\u043b\u044b, \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0438 \u0438 \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u044f \u043f\u043e\u044f\u0432\u044f\u0442\u0441\u044f \u0437\u0434\u0435\u0441\u044c."}</p>}
      </div>
    </div>
    <small className="marketing-preview-note">{"\u0412 \u043f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0435 \u043f\u043e\u0434\u0441\u0442\u0430\u0432\u043b\u044f\u0435\u0442\u0441\u044f \u0442\u0435\u0441\u0442\u043e\u0432\u044b\u0439 \u043a\u043b\u0438\u0435\u043d\u0442. \u041f\u0435\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0435 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0442\u0441\u044f \u0431\u0435\u0437 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439."}</small>
  </section>;
}

function MarketingPreviewBlock({ block }) {
  const type = String(block?.type ?? "text");
  const text = previewText(block?.text ?? block?.label ?? "");
  const url = safePreviewUrl(block?.url);
  if (type === "heading") return <h3>{text || "\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a"}</h3>;
  if (type === "divider") return <hr />;
  if (type === "spacer") return <div className="marketing-preview-spacer" />;
  if (type === "button") return <span className="marketing-preview-cta">{text || "\u041a\u043d\u043e\u043f\u043a\u0430"}</span>;
  if (type === "image" && url) return <img alt={text || "\u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0432 \u043a\u0430\u043c\u043f\u0430\u043d\u0438\u0438"} loading="lazy" referrerPolicy="no-referrer" src={url} />;
  if (["image", "file", "gif", "audio", "video"].includes(type)) return <span className="marketing-preview-file">{previewAttachmentLabel(type, block, url)}</span>;
  return <p>{text}</p>;
}

function previewText(value) {
  return String(value ?? "").replaceAll("{{client.name}}", "\u0410\u043b\u0435\u043a\u0441\u0435\u0439").replaceAll("{{client.firstName}}", "\u0410\u043b\u0435\u043a\u0441\u0435\u0439");
}

function safePreviewUrl(value) {
  try { const parsed = new URL(String(value ?? "")); return parsed.protocol === "https:" ? parsed.href : ""; }
  catch { return ""; }
}

function previewAttachmentLabel(type, block, url) {
  if (block?.fileName) return `\u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435: ${block.fileName}`;
  if (url) return type === "audio" ? "\ud83c\udfb5 \u0410\u0443\u0434\u0438\u043e" : type === "video" ? "\ud83c\udfac \u0412\u0438\u0434\u0435\u043e" : type === "file" ? "\ud83d\udcce \u0424\u0430\u0439\u043b" : "\ud83d\uddbc\ufe0f \u041c\u0435\u0434\u0438\u0430";
  return type === "image" ? "\ud83d\uddbc\ufe0f \u0418\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435" : "\ud83d\udcce \u0412\u043b\u043e\u0436\u0435\u043d\u0438\u0435";
}
function downloadMarketingCsv(rows, fileStem) {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))];
  const escape = (value) => {
    const raw = String(value ?? "");
    const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const csv = `\uFEFF${fields.map(escape).join(";")}\n${rows.map((row) => fields.map((field) => escape(row?.[field])).join(";")).join("\n")}`;
  const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.download = `${fileStem.replace(/[^a-z0-9_-]+/gi, "_") || "marketing"}.csv`;
  link.href = href;
  link.click();
  URL.revokeObjectURL(href);
}
async function downloadMarketingXlsx(rows, fileStem) {
  const blob = await createMarketingXlsx(rows);
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${fileStem.replace(/[^a-z0-9_-]+/gi, "_") || "marketing"}.xlsx`;
  link.href = href;
  link.click();
  URL.revokeObjectURL(href);
}
async function createMarketingXlsx(rows) {
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row ?? {})))];
  const allRows = [fields, ...rows.map((row) => fields.map((field) => row?.[field] ?? ""))];
  const sheetRows = allRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => spreadsheetCell(value, rowIndex + 1, columnIndex)).join("")}</row>`).join("");
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Результаты" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`]
  ];
  return new Blob([await zipMarketingFiles(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function spreadsheetCell(value, row, column) {
  const reference = `${spreadsheetColumn(column)}${row}`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${reference}"><v>${value}</v></c>`;
  const raw = String(value ?? "");
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeSpreadsheetXml(safe)}</t></is></c>`;
}
function spreadsheetColumn(index) { let value = index + 1; let column = ""; while (value) { const remainder = (value - 1) % 26; column = String.fromCharCode(65 + remainder) + column; value = Math.floor((value - 1) / 26); } return column; }
function escapeSpreadsheetXml(value) { return String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
async function zipMarketingFiles(files) {
  const encoder = new TextEncoder(); const locals = []; const centrals = []; let offset = 0;
  for (const [name, value] of files) {
    const filename = encoder.encode(name); const raw = encoder.encode(value); const compressed = await deflateRaw(raw); const crc = marketingCrc32(raw);
    const local = zipBytes([zipUint32(0x04034b50), zipUint16(20), zipUint16(0x0800), zipUint16(8), zipUint16(0), zipUint16(0), zipUint32(crc), zipUint32(compressed.length), zipUint32(raw.length), zipUint16(filename.length), zipUint16(0), filename, compressed]);
    locals.push(local);
    centrals.push(zipBytes([zipUint32(0x02014b50), zipUint16(20), zipUint16(20), zipUint16(0x0800), zipUint16(8), zipUint16(0), zipUint16(0), zipUint32(crc), zipUint32(compressed.length), zipUint32(raw.length), zipUint16(filename.length), zipUint16(0), zipUint16(0), zipUint16(0), zipUint16(0), zipUint32(0), zipUint32(offset), filename]));
    offset += local.length;
  }
  const central = zipBytes(centrals); const footer = zipBytes([zipUint32(0x06054b50), zipUint16(0), zipUint16(0), zipUint16(files.length), zipUint16(files.length), zipUint32(central.length), zipUint32(offset), zipUint16(0)]);
  return zipBytes([...locals, central, footer]);
}
async function deflateRaw(bytes) { const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw")); return new Uint8Array(await new Response(stream).arrayBuffer()); }
function zipUint16(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]); }
function zipUint32(value) { return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]); }
function zipBytes(parts) { const size = parts.reduce((total, part) => total + part.length, 0); const result = new Uint8Array(size); let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result; }
function marketingCrc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; } return (crc ^ 0xffffffff) >>> 0; }
export { createMarketingXlsx };
function formatRoubles(kopeks) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(Number(kopeks || 0) / 100); }
function parseAudienceCsv(source) {
  const rows = source.replace(/^\uFEFF/, "").split(/\r?\n/).filter((row) => row.trim()).map(parseCsvRow);
  if (rows.length < 2) return [];
  const headers = rows.shift().map((item) => item.trim());
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}
function rowsToAudienceRecords(rows) {
  if (rows.length < 2) return [];
  const [headers, ...body] = rows;
  return body.filter((row) => row.some((value) => String(value ?? "").trim())).map((row) => Object.fromEntries(headers.map((header, index) => [String(header ?? "").trim(), row[index] == null ? "" : String(row[index])] )));
}
function parseCsvRow(row) {
  const delimiter = row.includes(";") && !row.includes(",") ? ";" : ",";
  const values = []; let current = ""; let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"' && row[index + 1] === '"') { current += '"'; index += 1; }
    else if (character === '"') quoted = !quoted;
    else if (character === delimiter && !quoted) { values.push(current); current = ""; }
    else current += character;
  }
  values.push(current); return values;
}
