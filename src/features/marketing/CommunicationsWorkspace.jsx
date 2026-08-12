import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  Ellipsis,
  FileText,
  Image,
  LayoutTemplate,
  Mail,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  Paperclip,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  Upload,
  UsersRound,
  X
} from "lucide-react";
import { uploadComposerAttachment } from "../../app/useComposerAttachments.js";
import { ProductScreen, WorkspaceState } from "../../ui.jsx";
import { marketingService } from "../../services/marketingService.js";
import { normalizeAudienceImportRecords, parseAudienceCsv, parseAudienceXlsx } from "./audienceImportModel.js";
import { campaignAdditionalBlocks, campaignContentBlocks, campaignStatusLabel, campaignToDraft, canLaunchCampaignDraft, isCampaignEditable } from "./marketingCampaignModel.js";
import { insertEmojiAtSelection } from "./marketingEmojiModel.js";
import "./communications-workspace.css";

const EmojiPickerPanel = React.lazy(() => import("./EmojiPickerPanel.jsx"));
const EMPTY_WORKSPACE = Object.freeze({ audiences: [], campaigns: [], channels: [], templates: [] });
const PLANS = Object.freeze([
  { key: "start", name: "Start", price: "4 900 ₽/мес.", included: "10 000 сообщений" },
  { key: "business", name: "Business", price: "9 900 ₽/мес.", included: "50 000 сообщений" },
  { key: "scale", name: "Scale", price: "19 900 ₽/мес.", included: "100 000 сообщений" }
]);
const TABS = Object.freeze([
  { id: "campaigns", label: "Кампании", icon: Megaphone },
  { id: "audiences", label: "Аудитории", icon: UsersRound },
  { id: "templates", label: "Шаблоны", icon: LayoutTemplate },
  { id: "analytics", label: "Аналитика", icon: BarChart3 }
]);

export function MarketingScreen({ onBack, onToast }) {
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [accessInfo, setAccessInfo] = useState(null);
  const [activatingPlan, setActivatingPlan] = useState("");
  const [activeTab, setActiveTab] = useState("campaigns");
  const [dialog, setDialog] = useState(null);
  const [campaignDialog, setCampaignDialog] = useState(null);
  const [campaignResult, setCampaignResult] = useState(null);

  const loadWorkspace = useCallback(async () => {
    setStatus("loading");
    setError("");
    const accessResponse = await marketingService.getAccessStatus();
    if (accessResponse.status !== "ok") {
      setError(accessResponse.error?.message ?? "Не удалось проверить доступ к коммуникациям.");
      setStatus("error");
      return;
    }
    const nextAccess = accessResponse.data ?? {};
    setAccessInfo(nextAccess);
    if (!nextAccess.allowed) {
      setStatus("inactive");
      return;
    }
    const response = await marketingService.fetchWorkspace();
    if (response.status !== "ok") {
      setError(response.error?.message ?? "Не удалось загрузить коммуникации.");
      setStatus("error");
      return;
    }
    setWorkspace({ ...EMPTY_WORKSPACE, ...(response.data ?? {}) });
    setStatus("ready");
  }, []);

  useEffect(() => { void loadWorkspace(); }, [loadWorkspace]);

  const activateModule = async (planKey) => {
    setActivatingPlan(planKey);
    const response = await marketingService.activateModule(planKey);
    setActivatingPlan("");
    if (response.status !== "ok") {
      onToast?.(response.error?.message ?? "Не удалось подключить модуль.");
      return;
    }
    onToast?.("Модуль коммуникаций подключён.");
    void loadWorkspace();
  };

  const openCampaignResults = async (campaign) => {
    const response = await marketingService.getCampaignResults(campaign.id);
    if (response.status !== "ok") {
      onToast?.(response.error?.message ?? "Не удалось загрузить результаты кампании.");
      return;
    }
    setCampaignResult(response.data ?? null);
  };

  const executeCampaign = async (campaign, action) => {
    const method = action === "launch" ? marketingService.launchCampaign
      : action === "pause" ? marketingService.pauseCampaign
        : action === "resume" ? marketingService.resumeCampaign
          : marketingService.cancelCampaign;
    const response = await method(campaign.id);
    onToast?.(response.status === "ok" ? "Статус кампании обновлён." : response.error?.message ?? "Операция не выполнена.");
    if (response.status === "ok") void loadWorkspace();
  };

  const cloneCampaign = async (campaign) => {
    const response = await marketingService.cloneCampaign(campaign.id);
    onToast?.(response.status === "ok" ? "Копия сохранена в черновиках." : response.error?.message ?? "Не удалось скопировать кампанию.");
    if (response.status === "ok") void loadWorkspace();
  };

  return (
    <ProductScreen
      actions={status === "ready" ? <div className="communications-page-actions">
        <button aria-label="Обновить коммуникации" className="communications-icon-button" onClick={loadWorkspace} title="Обновить" type="button"><RefreshCw size={17} /></button>
        <button className="primary-action communications-primary-action" onClick={() => setCampaignDialog({ campaign: null })} type="button"><Plus size={17} /> Создать кампанию</button>
      </div> : null}
      backLabel="Диалоги"
      onBack={onBack}
      subtitle="Планируйте сообщения по нужным каналам и отслеживайте результат"
      title="Коммуникации"
    >
      {status === "loading" ? <WorkspaceState tone="loading" title="Загружаем рабочее пространство" /> : null}
      {status === "error" ? <WorkspaceState actionLabel="Повторить" description={error} onAction={loadWorkspace} tone="error" title="Коммуникации недоступны" /> : null}
      {status === "inactive" ? <ActivationScreen accessInfo={accessInfo} activatingPlan={activatingPlan} onActivate={activateModule} /> : null}
      {status === "ready" ? <CommunicationsHome
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
        onArchiveAudience={async (audience) => {
          const response = await marketingService.archiveAudience(audience.id);
          onToast?.(response.status === "ok" ? "Аудитория перемещена в архив." : response.error?.message ?? "Не удалось архивировать аудиторию.");
          if (response.status === "ok") void loadWorkspace();
        }}
        onCloneCampaign={cloneCampaign}
        onCreate={(kind) => kind === "campaign" ? setCampaignDialog({ campaign: null }) : setDialog(kind)}
        onExecuteCampaign={executeCampaign}
        onOpenCampaign={(campaign) => setCampaignDialog({ campaign })}
        onOpenCampaignResults={openCampaignResults}
        workspace={workspace}
      /> : null}
      {campaignDialog ? <CampaignDialog campaign={campaignDialog.campaign} onClose={() => setCampaignDialog(null)} onToast={onToast} onWorkspaceChange={loadWorkspace} workspace={workspace} /> : null}
      {dialog === "audience" ? <AudienceDialog onClose={() => setDialog(null)} onCreated={() => { setDialog(null); void loadWorkspace(); }} onToast={onToast} /> : null}
      {dialog === "template" ? <TemplateDialog onClose={() => setDialog(null)} onCreated={() => { setDialog(null); void loadWorkspace(); }} onToast={onToast} /> : null}
      {campaignResult ? <ResultsDialog onClose={() => setCampaignResult(null)} result={campaignResult} /> : null}
    </ProductScreen>
  );
}

function CommunicationsHome({ activeTab, onActiveTabChange, onArchiveAudience, onCloneCampaign, onCreate, onExecuteCampaign, onOpenCampaign, onOpenCampaignResults, workspace }) {
  const campaigns = Array.isArray(workspace.campaigns) ? workspace.campaigns : [];
  const audiences = Array.isArray(workspace.audiences) ? workspace.audiences : [];
  const templates = Array.isArray(workspace.templates) ? workspace.templates : [];
  return <div className="communications-workspace">
    <nav aria-label="Разделы коммуникаций" className="communications-tabs">
      {TABS.map(({ id, label, icon: Icon }) => <button aria-current={activeTab === id ? "page" : undefined} className={activeTab === id ? "is-active" : ""} key={id} onClick={() => onActiveTabChange(id)} type="button"><Icon size={16} />{label}</button>)}
    </nav>
    {activeTab === "campaigns" ? <CampaignsView audiences={audiences} campaigns={campaigns} onClone={onCloneCampaign} onCreate={() => onCreate("campaign")} onExecute={onExecuteCampaign} onOpen={onOpenCampaign} onResults={onOpenCampaignResults} usage={workspace.usage} /> : null}
    {activeTab === "audiences" ? <AudiencesView audiences={audiences} onArchive={onArchiveAudience} onCreate={() => onCreate("audience")} /> : null}
    {activeTab === "templates" ? <TemplatesView onCreate={() => onCreate("template")} templates={templates} /> : null}
    {activeTab === "analytics" ? <AnalyticsView campaigns={campaigns} usage={workspace.usage} /> : null}
  </div>;
}

function CampaignsView({ audiences, campaigns, onClone, onCreate, onExecute, onOpen, onResults, usage }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const audienceNames = useMemo(() => new Map(audiences.map((audience) => [audience.id, audience.name])), [audiences]);
  const filteredCampaigns = useMemo(() => campaigns.filter((campaign) => {
    const matchesQuery = !query || String(campaign.title ?? "").toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"));
    const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
    const matchesChannel = channelFilter === "all" || campaign.channels?.includes(channelFilter);
    return matchesQuery && matchesStatus && matchesChannel;
  }), [campaigns, channelFilter, query, statusFilter]);
  const channels = useMemo(() => [...new Set(campaigns.flatMap((campaign) => campaign.channels ?? []))], [campaigns]);
  const upcoming = useMemo(() => campaigns.filter((campaign) => campaign.scheduledAt && new Date(campaign.scheduledAt) > new Date()).toSorted((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)).slice(0, 4), [campaigns]);
  const recentDraft = campaigns.find((campaign) => campaign.status === "draft");
  const activeCount = campaigns.filter((campaign) => ["sending", "paused"].includes(campaign.status)).length;
  const plannedCount = campaigns.filter((campaign) => campaign.status === "scheduled").length;
  return <div className="communications-campaign-layout">
    <main className="communications-campaign-main">
      <section aria-label="Ключевые показатели" className="communications-metrics">
        <Metric icon={Megaphone} label="Активные кампании" tone="blue" value={activeCount} />
        <Metric icon={CalendarClock} label="Запланировано" tone="green" value={plannedCount} />
        <Metric icon={TrendingUp} label="Доставлено в этом месяце" tone="violet" value={formatNumber(usage?.messages ?? 0)} />
      </section>
      <section className="communications-table-section">
        <div className="communications-filters">
          <label className="communications-search"><Search size={16} /><input aria-label="Поиск кампаний" onChange={(event) => setQuery(event.target.value)} placeholder="Поиск кампаний" value={query} /></label>
          <label className="communications-select"><span>Статус</span><select aria-label="Фильтр по статусу" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}><option value="all">Все</option><option value="draft">Черновик</option><option value="scheduled">Запланирована</option><option value="sending">Активна</option><option value="paused">На паузе</option><option value="completed">Завершена</option></select><ChevronDown size={15} /></label>
          <label className="communications-select"><span>Канал</span><select aria-label="Фильтр по каналу" onChange={(event) => setChannelFilter(event.target.value)} value={channelFilter}><option value="all">Все</option>{channels.map((channel) => <option key={channel} value={channel}>{channelLabel(channel)}</option>)}</select><ChevronDown size={15} /></label>
          <span className="communications-filter-count">{filteredCampaigns.length} из {campaigns.length}</span>
        </div>
        {filteredCampaigns.length ? <div className="communications-table-wrap"><table className="communications-table">
          <thead><tr><th>Кампания</th><th>Аудитория</th><th>Каналы</th><th>Отправка</th><th>Статус</th><th>Доставка</th><th><span className="sr-only">Действия</span></th></tr></thead>
          <tbody>{filteredCampaigns.map((campaign) => <CampaignRow audienceName={audienceNames.get(campaign.audienceId)} campaign={campaign} key={campaign.id} onClone={onClone} onExecute={onExecute} onOpen={onOpen} onResults={onResults} />)}</tbody>
        </table></div> : <EmptyCampaigns hasFilters={Boolean(query || statusFilter !== "all" || channelFilter !== "all")} onCreate={onCreate} />}
        <button className="communications-create-row" onClick={onCreate} type="button"><span><Plus size={19} /></span><strong>Создать новую кампанию</strong><small>Выберите аудиторию, каналы и сообщение для запуска</small><ArrowRight size={17} /></button>
      </section>
    </main>
    <aside className="communications-context-rail">
      <section className="communications-rail-section"><header><div><CalendarClock size={18} /><h3>Ближайшие отправки</h3></div></header>{upcoming.length ? <div className="communications-schedule-list">{upcoming.map((campaign) => <button key={campaign.id} onClick={() => onOpen(campaign)} type="button"><time><strong>{formatShortDate(campaign.scheduledAt)}</strong><span>{formatTime(campaign.scheduledAt)}</span></time><span><strong>{campaign.title}</strong><small>{campaign.channels?.map(channelLabel).join(" · ")}</small></span><ChannelStack channels={campaign.channels} /></button>)}</div> : <p className="communications-rail-empty">Запланированных отправок пока нет.</p>}</section>
      <section className="communications-recommendation"><div className="communications-recommendation-icon"><Sparkles size={20} /></div><div><h3>Проверьте охват каналов</h3><p>Добавьте резервный канал в кампании с одной точкой доставки — это снижает риск недоставки.</p></div></section>
      {recentDraft ? <section className="communications-rail-section communications-draft"><header><div><FileText size={18} /><h3>Недавний черновик</h3></div></header><button onClick={() => onOpen(recentDraft)} type="button"><span><strong>{recentDraft.title}</strong><small>Обновлён {formatRelativeDate(recentDraft.updatedAt)}</small></span><ArrowRight size={17} /></button></section> : null}
    </aside>
  </div>;
}

function CampaignRow({ audienceName, campaign, onClone, onExecute, onOpen, onResults }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const delivery = deliveryMetric(campaign.deliverySummary);
  return <tr>
    <td><button aria-label={`Открыть кампанию ${campaign.title}`} className="communications-campaign-name" onClick={() => onOpen(campaign)} type="button"><strong>{campaign.title || "Без названия"}</strong><span>{shortCampaignId(campaign.id)}</span></button></td>
    <td><span className="communications-cell-primary">{audienceName || (campaign.clientIds?.length ? "Персональная" : "Не выбрана")}</span><small>{campaign.audienceId ? "Статическая аудитория" : "Получатели вручную"}</small></td>
    <td><ChannelStack channels={campaign.channels} /></td>
    <td><span className="communications-cell-primary">{campaign.scheduledAt ? formatDateTime(campaign.scheduledAt) : campaign.status === "draft" ? "Не назначена" : "По триггеру"}</span></td>
    <td><CampaignStatus status={campaign.status} /></td>
    <td><div className="communications-delivery"><strong>{delivery.label}</strong><small>{delivery.caption}</small><span><i style={{ width: delivery.width }} /></span></div></td>
    <td className="communications-row-menu"><button aria-expanded={menuOpen} aria-label={`Действия: ${campaign.title}`} onClick={() => setMenuOpen((value) => !value)} type="button"><Ellipsis size={18} /></button>{menuOpen ? <div className="communications-menu">
      <button onClick={() => { setMenuOpen(false); onResults(campaign); }} type="button"><BarChart3 size={14} /> Статистика</button>
      <button onClick={() => { setMenuOpen(false); onClone(campaign); }} type="button"><Copy size={14} /> Дублировать</button>
      {campaign.status === "sending" ? <button onClick={() => { setMenuOpen(false); onExecute(campaign, "pause"); }} type="button"><Pause size={14} /> Поставить на паузу</button> : null}
      {campaign.status === "paused" ? <button onClick={() => { setMenuOpen(false); onExecute(campaign, "resume"); }} type="button"><Play size={14} /> Продолжить</button> : null}
    </div> : null}</td>
  </tr>;
}

function AudiencesView({ audiences, onArchive, onCreate }) {
  return <section className="communications-section-view"><header><div><h2>Аудитории</h2><p>Статические списки и внешние аудитории, сверенные с клиентской базой.</p></div><button className="primary-action" onClick={onCreate} type="button"><Plus size={16} /> Создать аудиторию</button></header>
    {audiences.length ? <div className="communications-list-table"><div className="communications-list-head"><span>Название</span><span>Источник</span><span>Клиентов</span><span>Синхронизация</span><span /></div>{audiences.map((audience) => <article key={audience.id}><span><strong>{audience.name}</strong><small>{shortCampaignId(audience.id)}</small></span><span>{audience.source === "import" ? "Внешний импорт" : "Статический список"}</span><strong>{formatNumber(audience._count?.members ?? 0)}</strong><span><SyncStatus sync={audience.sync} /></span><button aria-label={`Архивировать ${audience.name}`} className="communications-icon-button" onClick={() => onArchive(audience)} title="В архив" type="button"><Archive size={16} /></button></article>)}</div> : <WorkspaceState actionLabel="Создать аудиторию" description="Добавьте статический список или импортируйте внешнюю аудиторию." onAction={onCreate} tone="empty" title="Аудиторий пока нет" />}
  </section>;
}

function TemplatesView({ onCreate, templates }) {
  return <section className="communications-section-view"><header><div><h2>Шаблоны сообщений</h2><p>Готовые композиции для email, мессенджеров и персональных сообщений.</p></div><button className="primary-action" onClick={onCreate} type="button"><Plus size={16} /> Новый шаблон</button></header>
    {templates.length ? <div className="communications-template-grid">{templates.map((template) => <article key={template.id}><div className="communications-template-icon"><LayoutTemplate size={20} /></div><div><strong>{template.title}</strong><p>{template.content?.blocks?.find((block) => block.text)?.text || "Шаблон с готовой структурой контента"}</p></div><footer><span>{template.content?.blocks?.length ?? 0} блоков</span><button type="button">Открыть <ArrowRight size={14} /></button></footer></article>)}</div> : <WorkspaceState actionLabel="Создать шаблон" description="Сохраните удачную структуру сообщения, чтобы использовать её повторно." onAction={onCreate} tone="empty" title="Шаблонов пока нет" />}
  </section>;
}

function AnalyticsView({ campaigns, usage }) {
  const delivered = campaigns.reduce((sum, campaign) => sum + Number(campaign.deliverySummary?.delivered ?? 0), 0);
  const failed = campaigns.reduce((sum, campaign) => sum + Number(campaign.deliverySummary?.failed ?? 0), 0);
  const rate = delivered + failed ? Math.round(delivered / (delivered + failed) * 1000) / 10 : 0;
  const topCampaigns = campaigns.toSorted((a, b) => Number(b.deliverySummary?.delivered ?? 0) - Number(a.deliverySummary?.delivered ?? 0)).slice(0, 6);
  return <section className="communications-section-view"><header><div><h2>Эффективность коммуникаций</h2><p>Фактическая доставка и динамика кампаний за текущий расчётный период.</p></div></header>
    <div className="communications-analytics-summary"><Metric icon={Send} label="Сообщений за период" tone="blue" value={formatNumber(usage?.messages ?? 0)} /><Metric icon={Check} label="Успешно доставлено" tone="green" value={formatNumber(delivered)} /><Metric icon={TrendingUp} label="Доставляемость" tone="violet" value={`${rate}%`} /></div>
    <div className="communications-performance-list"><header><span>Кампания</span><span>Доставлено</span><span>Ошибки</span><span>Эффективность</span></header>{topCampaigns.map((campaign) => { const metric = deliveryMetric(campaign.deliverySummary); return <article key={campaign.id}><strong>{campaign.title}</strong><span>{formatNumber(campaign.deliverySummary?.delivered ?? 0)}</span><span>{formatNumber(campaign.deliverySummary?.failed ?? 0)}</span><div><span><i style={{ width: metric.width }} /></span><strong>{metric.label}</strong></div></article>; })}</div>
  </section>;
}

function CampaignDialog({ campaign, onClose, onToast, onWorkspaceChange, workspace }) {
  const [draft, setDraft] = useState(() => campaignToDraft(campaign));
  const [blocks, setBlocks] = useState(() => campaignAdditionalBlocks(campaign));
  const [testRecipients, setTestRecipients] = useState([]);
  const [campaignId, setCampaignId] = useState(campaign?.id ?? "");
  const [campaignStatus, setCampaignStatus] = useState(campaign?.status ?? "draft");
  const [submitting, setSubmitting] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [operationResult, setOperationResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const messageTextareaRef = React.useRef(null);
  const messageSelectionRef = React.useRef({ end: draft.contentText.length, start: draft.contentText.length });
  const templates = Array.isArray(workspace.templates) ? workspace.templates : [];
  const audiences = Array.isArray(workspace.audiences) ? workspace.audiences : [];
  const editable = isCampaignEditable(campaignStatus);
  const busy = submitting || testing || launching;
  const consentPolicyMessage = marketingConsentPolicyMessage(workspace.settings);
  const availableChannels = useMemo(() => {
    const source = Array.isArray(workspace.channels) ? workspace.channels : [];
    return source.length ? source.map((channel) => ({ id: channel.type, label: channel.name || channelLabel(channel.type) })) : ["email", "sms", "telegram", "whatsapp"].map((id) => ({ id, label: channelLabel(id) }));
  }, [workspace.channels]);
  const updateDraft = (patch) => {
    setTestResult(null);
    setOperationResult(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const toggleChannel = (channel) => updateDraft({ channels: draft.channels.includes(channel) ? draft.channels.filter((item) => item !== channel) : [...draft.channels, channel] });
  const rememberMessageSelection = (event) => {
    messageSelectionRef.current = { end: event.currentTarget.selectionEnd, start: event.currentTarget.selectionStart };
  };
  const insertEmoji = (emoji) => {
    const next = insertEmojiAtSelection(draft.contentText, emoji, messageSelectionRef.current.start, messageSelectionRef.current.end);
    updateDraft({ contentText: next.value });
    messageSelectionRef.current = { end: next.cursor, start: next.cursor };
    requestAnimationFrame(() => {
      messageTextareaRef.current?.focus();
      messageTextareaRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  };
  const applyTemplate = (templateId) => {
    const template = templates.find((item) => item.id === templateId);
    setTestResult(null);
    setOperationResult(null);
    setDraft((current) => ({ ...current, templateId, title: current.title || template?.title || "", contentText: template?.content?.blocks?.find((block) => block.type === "text")?.text ?? current.contentText }));
    setBlocks((template?.content?.blocks ?? []).filter((block) => block.type !== "text").map((block) => ({ ...block, id: crypto.randomUUID() })));
  };
  const uploadFile = async (event) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!file) return;
    if (!draft.channels.length) { onToast?.("Сначала выберите хотя бы один канал."); return; }
    if (file.size > 20 * 1024 * 1024) { onToast?.("Размер файла не должен превышать 20 МБ."); return; }
    setUploading(true);
    const uploaded = await uploadComposerAttachment({ channel: draft.channels[0], file, idempotencyKey: `marketing-upload:${crypto.randomUUID()}`, mimeType: file.type || "application/octet-stream", name: file.name, sizeBytes: file.size });
    setUploading(false);
    if (uploaded.status !== "ready" || !uploaded.fileId) { onToast?.(uploaded.error ?? "Файл не готов к отправке."); return; }
    setOperationResult(null);
    setBlocks((current) => [...current, { fileId: uploaded.fileId, fileName: file.name, id: crypto.randomUUID(), mimeType: file.type, type: file.type.startsWith("image/") ? "image" : "file" }]);
  };
  const campaignPayload = (overrides = {}) => {
    const nextDraft = { ...draft, ...overrides };
    return {
      audienceId: nextDraft.audienceId || undefined,
      channels: nextDraft.channels,
      clientIds: nextDraft.clientIds.split(",").map((item) => item.trim()).filter(Boolean),
      content: { blocks: campaignContentBlocks(nextDraft.contentText, blocks) },
      scheduledAt: nextDraft.scheduledAt ? new Date(nextDraft.scheduledAt).toISOString() : null,
      strategy: nextDraft.strategy,
      title: nextDraft.title
    };
  };

  const saveCampaign = async (overrides = {}) => {
    const response = campaignId
      ? await marketingService.updateCampaign(campaignId, campaignPayload(overrides))
      : await marketingService.createCampaign(campaignPayload(overrides));
    const savedCampaignId = response.data?.campaign?.id || campaignId;
    if (response.status === "ok" && savedCampaignId) {
      setCampaignId(savedCampaignId);
      setCampaignStatus(response.data?.campaign?.status ?? campaignStatus);
    }
    return { response, savedCampaignId };
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!editable || busy) return;
    const existedBeforeSave = Boolean(campaignId);
    setSubmitting(true);
    setOperationResult(null);
    const { response } = await saveCampaign();
    setSubmitting(false);
    if (response.status !== "ok") {
      const message = response.error?.message ?? "Не удалось сохранить кампанию.";
      setOperationResult({ message, tone: "error" });
      onToast?.(message);
      return;
    }
    const message = draft.scheduledAt
      ? "Расписание сохранено. Окно осталось открытым."
      : existedBeforeSave ? "Изменения черновика сохранены." : "Черновик сохранён. Можно продолжить редактирование или запустить кампанию.";
    setOperationResult({ message, tone: "success" });
    onToast?.(message);
    void onWorkspaceChange?.();
  };

  const testAvailabilityMessage = !testRecipients.length
    ? "Добавьте хотя бы одного тестового получателя."
    : !draft.title.trim()
      ? "Укажите название кампании."
      : !draft.channels.length
        ? "Выберите хотя бы один канал."
        : !draft.contentText.trim()
          ? "Добавьте текст сообщения."
          : "Сначала сохраним текущую версию как черновик, затем отправим тест. Основная кампания не запустится.";
  const canSendTest = Boolean(editable && testRecipients.length && draft.title.trim() && draft.channels.length && draft.contentText.trim());
  const canLaunch = editable && canLaunchCampaignDraft(draft);
  const launchAvailabilityMessage = !draft.title.trim()
    ? "Укажите название кампании."
    : !draft.channels.length
      ? "Выберите хотя бы один канал."
      : !draft.contentText.trim()
        ? "Добавьте текст сообщения."
        : !draft.audienceId && !draft.clientIds.split(",").some((item) => item.trim())
          ? "Выберите аудиторию или укажите получателей."
          : "Кампания будет сохранена и запущена немедленно.";

  const sendTest = async () => {
    if (!canSendTest || testing || submitting) return;
    setTesting(true);
    setTestResult(null);
    const { response: saved, savedCampaignId } = await saveCampaign();
    if (saved.status !== "ok" || !savedCampaignId) {
      const message = saved.error?.message ?? "Не удалось сохранить черновик перед тестовой отправкой.";
      setTestResult({ message, tone: "error" });
      onToast?.(message);
      setTesting(false);
      return;
    }
    const tested = await marketingService.testCampaign(savedCampaignId, testRecipients.map((recipient) => recipient.id));
    setTesting(false);
    if (tested.status !== "ok") {
      const message = tested.error?.message ?? "Не удалось запустить тестовую отправку.";
      setTestResult({ message, tone: "error" });
      onToast?.(message);
      void onWorkspaceChange?.();
      return;
    }
    const queued = Number(tested.data?.queued ?? 0);
    const excluded = Array.isArray(tested.data?.excluded) ? tested.data.excluded.length : Number(tested.data?.excluded ?? 0);
    const message = queued > 0
      ? `Тест поставлен в очередь. Сообщений: ${queued}${excluded ? `, исключено: ${excluded}` : ""}.`
      : `Тест не отправлен. Исключено получателей: ${excluded}. Проверьте доступность канала, согласие и тихие часы.`;
    setTestResult({ message, tone: queued > 0 ? "success" : "error" });
    onToast?.(message);
    void onWorkspaceChange?.();
  };

  const changeTestRecipients = (recipients) => {
    setTestResult(null);
    setTestRecipients(recipients);
  };

  const launchCampaign = async () => {
    if (!canLaunch || busy) return;
    setLaunching(true);
    setOperationResult(null);
    const { response: saved, savedCampaignId } = await saveCampaign({ scheduledAt: "" });
    if (saved.status !== "ok" || !savedCampaignId) {
      const message = saved.error?.message ?? "Не удалось сохранить кампанию перед запуском.";
      setOperationResult({ message, tone: "error" });
      onToast?.(message);
      setLaunching(false);
      return;
    }
    setDraft((current) => ({ ...current, scheduledAt: "" }));
    const launched = await marketingService.launchCampaign(savedCampaignId);
    setLaunching(false);
    if (launched.status !== "ok") {
      const message = launched.error?.message ?? "Не удалось запустить кампанию.";
      setOperationResult({ message, tone: "error" });
      onToast?.(message);
      void onWorkspaceChange?.();
      return;
    }
    setCampaignStatus("sending");
    const queued = Number(launched.data?.queued ?? 0);
    const excluded = Number(launched.data?.excluded ?? 0);
    const message = `Кампания запущена. В очереди: ${queued}${excluded ? `, исключено: ${excluded}` : ""}.`;
    setOperationResult({ message, tone: "success" });
    onToast?.(message);
    void onWorkspaceChange?.();
  };

  return <Modal className="communications-campaign-dialog" eyebrow={campaignId ? campaignStatusLabel(campaignStatus) : "Новая кампания"} onClose={onClose} title={campaignId ? "Кампания" : "Создайте коммуникацию"}>
    <form className="communications-campaign-form" onSubmit={submit}>
      {campaignId ? <div className={`communications-campaign-state ${editable ? "is-editable" : "is-locked"}`}><CampaignStatus status={campaignStatus} /><p>{editable ? "Кампанию можно редактировать, тестировать и запускать." : "Кампания уже запущена. Поля доступны только для просмотра."}</p></div> : null}
      <fieldset className="communications-editor-pane" disabled={!editable}>
        <section><h3>Основное</h3><div className="communications-form-grid">
          <label className="is-wide"><span>Название кампании</span><input autoFocus={!campaignId} required onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Например, Весенняя акция" value={draft.title} /></label>
          <label><span>Аудитория</span><select onChange={(event) => updateDraft({ audienceId: event.target.value })} value={draft.audienceId}><option value="">Персональные получатели</option>{audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name} · {audience._count?.members ?? 0}</option>)}</select></label>
          <label><span>Шаблон</span><select onChange={(event) => applyTemplate(event.target.value)} value={draft.templateId}><option value="">С чистого листа</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.title}</option>)}</select></label>
          {!draft.audienceId ? <label className="is-wide"><span>ID клиентов</span><input onChange={(event) => updateDraft({ clientIds: event.target.value })} placeholder="client_1, client_2" value={draft.clientIds} /></label> : null}
        </div></section>
        <section><div className="communications-section-heading"><div><h3>Каналы</h3><p>Выберите один или несколько каналов доставки.</p></div></div><div className="communications-channel-picker">{availableChannels.map((channel) => { const selected = draft.channels.includes(channel.id); return <button aria-pressed={selected} className={selected ? "is-selected" : ""} key={channel.id} onClick={() => toggleChannel(channel.id)} type="button"><ChannelIcon channel={channel.id} size={18} /><span>{channel.label}</span>{selected ? <Check size={15} /> : null}</button>; })}</div></section>
        <section><div className="communications-section-heading"><div><h3>Сообщение</h3><p>Добавьте текст, эмодзи и необходимые вложения.</p></div><span>{draft.contentText.length}/4000</span></div><div className="communications-composer-toolbar"><EmojiPickerButton disabled={!editable} onSelect={insertEmoji} /><label title="Добавить изображение или файл"><Paperclip size={17} /><input accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.mp3,.mp4" disabled={uploading || !editable} onChange={uploadFile} type="file" /></label><button onClick={() => { setOperationResult(null); setBlocks((current) => [...current, { id: crypto.randomUUID(), text: "", type: "heading" }]); }} type="button"><FileText size={16} /> Заголовок</button></div><textarea maxLength={4000} onChange={(event) => updateDraft({ contentText: event.target.value })} onClick={rememberMessageSelection} onKeyUp={rememberMessageSelection} onSelect={rememberMessageSelection} placeholder="Введите текст сообщения. Можно использовать переменные, например {{client.name}}" ref={messageTextareaRef} required value={draft.contentText} />{blocks.length ? <div className="communications-attachments">{blocks.map((block) => <div key={block.id}>{block.type === "image" ? <Image size={15} /> : block.type === "heading" ? <FileText size={15} /> : <Paperclip size={15} />}<input aria-label="Содержимое блока" onChange={(event) => { setOperationResult(null); setBlocks((current) => current.map((item) => item.id === block.id ? { ...item, text: event.target.value } : item)); }} placeholder={block.fileName || "Текст заголовка"} readOnly={Boolean(block.fileName)} value={block.fileName || block.text || ""} /><button aria-label="Удалить блок" onClick={() => { setOperationResult(null); setBlocks((current) => current.filter((item) => item.id !== block.id)); }} type="button"><X size={15} /></button></div>)}</div> : null}</section>
        <section><h3>Отправка</h3><div className="communications-form-grid"><label><span>Стратегия</span><select onChange={(event) => updateDraft({ strategy: event.target.value })} value={draft.strategy}><option value="manual">Выбранные каналы</option><option value="preferred">Предпочтительный канал</option><option value="cascade">Каскад каналов</option><option value="all">По всем каналам</option></select></label><label><span>Дата и время</span><input onChange={(event) => updateDraft({ scheduledAt: event.target.value })} type="datetime-local" value={draft.scheduledAt} /></label></div><TestRecipientPicker availabilityMessage={testAvailabilityMessage} canSend={canSendTest} onChange={changeTestRecipients} onSend={sendTest} result={testResult} sending={testing} value={testRecipients} /></section>
      </fieldset>
      <aside className="communications-preview-pane"><div className="communications-preview-title"><span>Предпросмотр</span><small>{draft.channels.length ? draft.channels.map(channelLabel).join(" · ") : "Канал не выбран"}</small></div><MessagePreview blocks={blocks} text={draft.contentText} /><div className="communications-safety-note"><Check size={16} /><p>{consentPolicyMessage}</p></div></aside>
      {operationResult ? <div aria-live="polite" className={`communications-campaign-operation is-${operationResult.tone}`} role="status">{operationResult.tone === "success" ? <Check size={15} /> : <CircleAlert size={15} />}<span>{operationResult.message}</span></div> : null}
      <footer className="communications-dialog-footer"><div className="communications-dialog-footer-note"><strong>{campaignStatusLabel(campaignStatus)}</strong><span>{editable ? launchAvailabilityMessage : "Редактирование недоступно после запуска."}</span></div><button onClick={onClose} type="button">Закрыть</button>{editable ? <><button className="communications-save-action" disabled={busy || !draft.title.trim() || !draft.channels.length} type="submit">{submitting ? "Сохраняем…" : campaignId ? "Сохранить изменения" : "Сохранить черновик"}</button><button className="primary-action communications-launch-action" disabled={busy || !canLaunch} onClick={launchCampaign} title={canLaunch ? "Запустить кампанию сейчас" : launchAvailabilityMessage} type="button"><Play size={15} /> {launching ? "Запускаем…" : "Запустить"}</button></> : null}</footer>
    </form>
  </Modal>;
}

function EmojiPickerButton({ disabled, onSelect }) {
  const [open, setOpen] = useState(false);
  const panelId = React.useId();
  const rootRef = React.useRef(null);
  const triggerRef = React.useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="communications-emoji-picker-anchor" ref={rootRef}>
    <button
      aria-controls={open ? panelId : undefined}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label="Открыть выбор эмодзи"
      className={open ? "is-active" : ""}
      disabled={disabled}
      onClick={() => setOpen((current) => !current)}
      ref={triggerRef}
      title="Добавить эмодзи"
      type="button"
    >😊</button>
    {open ? <div aria-label="Выбор эмодзи" className="communications-emoji-picker-popover" id={panelId} role="dialog">
      <header>
        <div><strong>Эмодзи</strong><span>Поиск, категории и оттенки кожи</span></div>
        <button aria-label="Закрыть выбор эмодзи" onClick={() => { setOpen(false); triggerRef.current?.focus(); }} type="button"><X size={15} /></button>
      </header>
      <React.Suspense fallback={<div className="communications-emoji-picker-loading"><RefreshCw className="is-spinning" size={17} /> Загружаем эмодзи…</div>}>
        <EmojiPickerPanel onEmojiSelect={onSelect} />
      </React.Suspense>
    </div> : null}
  </div>;
}

function TestRecipientPicker({ availabilityMessage, canSend, onChange, onSend, result, sending, value }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const selectedIds = useMemo(() => new Set(value.map((recipient) => recipient.id)), [value]);
  const availableResults = useMemo(() => results.filter((recipient) => !selectedIds.has(recipient.id)), [results, selectedIds]);

  useEffect(() => {
    const normalizedQuery = deferredQuery.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      setStatus("idle");
      return undefined;
    }
    let active = true;
    setStatus("loading");
    void marketingService.searchTestRecipients(normalizedQuery).then((response) => {
      if (!active) return;
      if (response.status !== "ok") {
        setResults([]);
        setStatus("error");
        return;
      }
      setResults(Array.isArray(response.data?.items) ? response.data.items : []);
      setStatus("ready");
    });
    return () => { active = false; };
  }, [deferredQuery]);

  const addRecipient = (recipient) => {
    if (value.length >= 20 || selectedIds.has(recipient.id)) return;
    onChange([...value, recipient]);
    setQuery("");
    setResults([]);
    setStatus("idle");
  };
  const removeRecipient = (recipientId) => onChange(value.filter((recipient) => recipient.id !== recipientId));

  return <details className="communications-test-recipient-picker">
    <summary>Тестовая отправка <span>{value.length ? `${value.length} из 20` : "не настроена"}</span></summary>
    <div className="communications-test-recipient-content">
      {value.length ? <div aria-label="Выбранные тестовые получатели" className="communications-test-recipient-selected">{value.map((recipient) => <span key={recipient.id}><strong>{recipient.name}</strong><small>{recipient.email || recipient.phone || channelLabel(recipient.channel)}</small><button aria-label={`Удалить ${recipient.name}`} onClick={() => removeRecipient(recipient.id)} type="button"><X size={13} /></button></span>)}</div> : null}
      <label><span>Найти клиента</span><div className="communications-test-recipient-search"><Search size={16} /><input aria-autocomplete="list" aria-controls="marketing-test-recipient-results" aria-expanded={availableResults.length > 0} autoComplete="off" disabled={value.length >= 20} onChange={(event) => setQuery(event.target.value)} placeholder="Фамилия, телефон или email" role="combobox" value={query} /></div></label>
      {query.trim().length === 1 ? <small className="communications-test-recipient-hint">Введите ещё один символ для поиска.</small> : null}
      {status === "loading" ? <div className="communications-test-recipient-state"><RefreshCw className="is-spinning" size={15} /> Ищем клиентов…</div> : null}
      {status === "error" ? <div className="communications-test-recipient-state is-error"><CircleAlert size={15} /> Не удалось выполнить поиск. Попробуйте ещё раз.</div> : null}
      {status === "ready" && !availableResults.length ? <div className="communications-test-recipient-state">Клиенты не найдены или уже добавлены.</div> : null}
      {availableResults.length ? <div className="communications-test-recipient-results" id="marketing-test-recipient-results" role="listbox">{availableResults.map((recipient) => <button aria-selected="false" key={recipient.id} onClick={() => addRecipient(recipient)} role="option" type="button"><span className="communications-test-recipient-avatar">{recipientInitials(recipient.name)}</span><span><strong>{recipient.name}</strong><small>{[recipient.phone, recipient.email, channelLabel(recipient.channel)].filter(Boolean).join(" · ")}</small></span><Plus size={16} /></button>)}</div> : null}
      <small className="communications-test-recipient-hint">Можно добавить до 20 существующих клиентов. Контакты показаны в маскированном виде.</small>
      <div className="communications-test-recipient-action">
        <p>{availabilityMessage}</p>
        <button className="primary-action" disabled={!canSend || sending} onClick={onSend} type="button"><Send size={15} /> {sending ? "Отправляем тест…" : "Отправить тест"}</button>
      </div>
      {result ? <div aria-live="polite" className={`communications-test-result is-${result.tone}`} role="status">{result.tone === "success" ? <Check size={15} /> : <CircleAlert size={15} />}<span>{result.message}</span></div> : null}
    </div>
  </details>;
}

function AudienceDialog({ onClose, onCreated, onToast }) {
  const [draft, setDraft] = useState({ clientIds: "", fileName: "", name: "", records: [] });
  const [importError, setImportError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const importFile = async (event) => {
    const [file] = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!file) return;
    try {
      const name = file.name.toLowerCase();
      const xlsx = name.endsWith(".xlsx") ? await import("read-excel-file/browser") : null;
      const parsed = xlsx ? await parseAudienceXlsx(file, xlsx.readSheet) : name.endsWith(".json") ? normalizeAudienceImportRecords(JSON.parse(await file.text())) : parseAudienceCsv(await file.text());
      const records = parsed.slice(0, 100_000);
      if (!records.length) throw new Error("empty_import");
      setImportError("");
      setDraft((current) => ({ ...current, fileName: file.name, records }));
      onToast?.(`Файл загружен: ${records.length} строк. Сверка с базой выполнится при сохранении.`);
    } catch { setImportError("Не удалось прочитать строки файла. Проверьте формат и наличие строки заголовков."); onToast?.("Не удалось прочитать файл. Проверьте формат CSV, XLSX или JSON."); }
  };
  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setImportError("");
    const records = draft.records.length ? draft.records : undefined;
    const clientIds = draft.clientIds.split(",").map((item) => item.trim()).filter(Boolean);
    if (records?.length) {
      const preview = await marketingService.previewAudienceImport(records);
      if (preview.status !== "ok") { setSubmitting(false); onToast?.(preview.error?.message ?? "Не удалось сверить аудиторию."); return; }
      if (!(preview.data?.summary?.matched ?? 0) && !clientIds.length) {
        const message = "В файле не найдено клиентов из базы сервиса. Используйте колонки «Телефон», «Почта», clientId или externalId и проверьте значения.";
        setSubmitting(false);
        setImportError(message);
        onToast?.(message);
        return;
      }
    }
    const response = await marketingService.createAudience({ clientIds, name: draft.name, records, source: records ? "import" : "manual" });
    setSubmitting(false);
    if (response.status !== "ok") { const message = response.error?.code === "marketing_audience_invalid" ? "Не найдено ни одного клиента из базы сервиса. Проверьте идентификаторы, телефоны или почту в файле." : response.error?.message ?? "Не удалось создать аудиторию."; setImportError(message); onToast?.(message); return; }
    onToast?.(`Аудитория создана: сопоставлено ${response.data?.matchedCount ?? 0} клиентов.`);
    onCreated();
  };
  return <Modal eyebrow="Новая аудитория" onClose={onClose} title="Кого включить в коммуникацию"><form className="communications-simple-form" onSubmit={submit}><label><span>Название аудитории</span><input autoFocus required onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Например, Активные клиенты" value={draft.name} /></label><div className="communications-import-zone"><Upload size={23} /><div><strong>Импортировать внешний список</strong><p>CSV, XLSX или JSON · поддерживаются Телефон, Почта, clientId и externalId</p></div><label><input accept=".csv,.xlsx,.json" onChange={importFile} type="file" />Выбрать файл</label>{draft.records.length ? <span><Check size={14} /> {draft.fileName} · {draft.records.length} строк готово к сверке</span> : null}</div>{importError ? <div className="communications-import-error" role="alert"><CircleAlert size={16} /><span>{importError}</span></div> : null}<div className="communications-or"><span>или</span></div><label><span>ID клиентов через запятую</span><textarea onChange={(event) => setDraft((current) => ({ ...current, clientIds: event.target.value }))} placeholder="client_1, client_2" value={draft.clientIds} /></label><footer><button onClick={onClose} type="button">Отмена</button><button className="primary-action" disabled={submitting} type="submit">{submitting ? "Сверяем…" : "Создать аудиторию"}</button></footer></form></Modal>;
}

function TemplateDialog({ onClose, onCreated, onToast }) {
  const [draft, setDraft] = useState({ text: "", title: "" });
  const submit = async (event) => {
    event.preventDefault();
    const response = await marketingService.createTemplate({ content: { blocks: [{ text: draft.text, type: "text" }] }, title: draft.title });
    if (response.status !== "ok") { onToast?.(response.error?.message ?? "Не удалось сохранить шаблон."); return; }
    onToast?.("Шаблон сохранён.");
    onCreated();
  };
  return <Modal eyebrow="Новый шаблон" onClose={onClose} title="Сохраните готовое сообщение"><form className="communications-simple-form" onSubmit={submit}><label><span>Название</span><input autoFocus onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required value={draft.title} /></label><label><span>Текст сообщения</span><textarea maxLength={4000} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} placeholder="Текст, эмодзи и переменные персонализации" required value={draft.text} /></label><footer><button onClick={onClose} type="button">Отмена</button><button className="primary-action" type="submit">Сохранить шаблон</button></footer></form></Modal>;
}

function ResultsDialog({ onClose, result }) {
  const summary = result.summary ?? {};
  return <Modal eyebrow="Результаты кампании" onClose={onClose} title={result.campaign?.title ?? "Кампания"}><div className="communications-results"><div className="communications-results-metrics"><Metric icon={Send} label="В очереди" tone="blue" value={formatNumber(summary.queued ?? 0)} /><Metric icon={Check} label="Доставлено" tone="green" value={formatNumber(summary.delivered ?? 0)} /><Metric icon={CircleAlert} label="Ошибки" tone="violet" value={formatNumber(summary.failed ?? 0)} /></div><p>Подробные статусы получателей обновляются по мере обработки каналами.</p><footer><button className="primary-action" onClick={onClose} type="button">Готово</button></footer></div></Modal>;
}

function Modal({ children, className = "", eyebrow, onClose, title }) {
  return <div className="communications-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-label={title} aria-modal="true" className={`communications-modal ${className}`} role="dialog"><header><div><span>{eyebrow}</span><h2>{title}</h2></div><button aria-label="Закрыть" className="communications-icon-button" onClick={onClose} type="button"><X size={18} /></button></header>{children}</section></div>;
}

function ActivationScreen({ accessInfo, activatingPlan, onActivate }) {
  return <section className="communications-activation"><div><Megaphone size={28} /><h2>Маркетинговые коммуникации</h2><p>Кампании, аудитории, шаблоны и аналитика во всех подключённых каналах.</p></div>{accessInfo?.isOwner ? <div className="communications-plan-grid">{PLANS.map((plan) => <article key={plan.key}><strong>{plan.name}</strong><b>{plan.price}</b><span>{plan.included}</span><button className="primary-action" disabled={Boolean(activatingPlan)} onClick={() => onActivate(plan.key)} type="button">{activatingPlan === plan.key ? "Подключаем…" : "Подключить"}</button></article>)}</div> : <WorkspaceState description="Попросите владельца подключить модуль и выдать вам индивидуальный доступ." tone="empty" title="Модуль пока недоступен" />}</section>;
}

function Metric({ icon: Icon, label, tone, value }) { return <article className={`communications-metric is-${tone}`}><span><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong></div></article>; }
function ChannelStack({ channels = [] }) { return <span className="communications-channel-stack">{channels.length ? channels.map((channel) => <span aria-label={channelLabel(channel)} key={channel} title={channelLabel(channel)}><ChannelIcon channel={channel} size={15} /></span>) : <small>—</small>}</span>; }
function ChannelIcon({ channel, size = 16 }) { const normalized = String(channel).toLowerCase(); const Icon = normalized.includes("email") || normalized.includes("mail") ? Mail : normalized.includes("telegram") ? Send : normalized.includes("whatsapp") ? MessageCircle : MessageSquareText; return <Icon size={size} />; }
function CampaignStatus({ status }) { return <span className={`communications-status is-${status || "draft"}`}>{["completed"].includes(status) ? <Check size={13} /> : status === "sending" ? <Play size={12} /> : status === "paused" ? <Pause size={12} /> : <Clock3 size={13} />}{campaignStatusLabel(status)}</span>; }
function SyncStatus({ sync }) { if (!sync) return <span className="communications-sync is-neutral">Не запускалась</span>; if (sync.status === "failed" || sync.lastError) return <span className="communications-sync is-error"><CircleAlert size={13} /> Требует внимания</span>; return <span className="communications-sync is-success"><Check size={13} /> Синхронизирована</span>; }
function EmptyCampaigns({ hasFilters, onCreate }) { return <div className="communications-empty"><Megaphone size={23} /><strong>{hasFilters ? "Ничего не найдено" : "Кампаний пока нет"}</strong><p>{hasFilters ? "Измените фильтры или поисковый запрос." : "Создайте первую коммуникацию для выбранной аудитории."}</p>{!hasFilters ? <button className="primary-action" onClick={onCreate} type="button"><Plus size={16} /> Создать кампанию</button> : null}</div>; }
function MessagePreview({ blocks, text }) {
  const headings = blocks.filter((block) => block.type === "heading" && block.text);
  const attachments = blocks.filter((block) => block.type !== "heading");
  return <div className="communications-phone-preview"><div className="communications-phone-top"><span /><strong>Предпросмотр</strong><Ellipsis size={16} /></div><div className="communications-phone-body"><div className="communications-preview-avatar"><Megaphone size={16} /></div><div className="communications-message-bubble">{headings.map((block) => <h4 key={block.id}>{block.text}</h4>)}<p>{text || "Ваше сообщение появится здесь"}</p>{attachments.map((block) => block.type === "image" ? <div className="communications-preview-media" key={block.id}><Image size={24} /><span>{block.fileName}</span></div> : block.fileName ? <div className="communications-preview-file" key={block.id}><Paperclip size={15} />{block.fileName}</div> : null)}<time>12:42</time></div></div></div>;
}

function deliveryMetric(summary = {}) { const delivered = Number(summary?.delivered ?? 0); const failed = Number(summary?.failed ?? 0); const total = delivered + failed + Number(summary?.queued ?? 0) + Number(summary?.sending ?? 0); if (!total) return { caption: "Нет отправок", label: "—", width: "0%" }; const rate = Math.round(delivered / total * 1000) / 10; return { caption: `${formatNumber(delivered)} из ${formatNumber(total)}`, label: `${rate}%`, width: `${Math.max(4, rate)}%` }; }
function channelLabel(channel) { const labels = { email: "Email", sms: "SMS", telegram: "Telegram", whatsapp: "WhatsApp", vk: "VK" }; return labels[String(channel).toLowerCase()] ?? String(channel); }
function marketingConsentPolicyMessage(settings = {}) { if (settings.allowWithoutConsent === true) return "Рассылка разрешена до получения согласия. Явный отзыв согласия всё равно блокирует отправку."; if (settings.requestConsentEnabled === false) return "Автоматический запрос согласия отключён. Клиенты без согласия будут исключены из отправки."; return "Если согласия нет, клиент сначала получит запрос. Любой ответ подтвердит согласие, и кампания продолжится автоматически."; }
function recipientInitials(name) { return String(name ?? "").trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toLocaleUpperCase("ru") || "К"; }
function formatNumber(value) { return new Intl.NumberFormat("ru-RU").format(Number(value) || 0); }
function formatDateTime(value) { if (!value) return "—"; return new Intl.DateTimeFormat("ru-RU", { day: "numeric", hour: "2-digit", minute: "2-digit", month: "short" }).format(new Date(value)); }
function formatShortDate(value) { return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(value)); }
function formatTime(value) { return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatRelativeDate(value) { if (!value) return "недавно"; const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 3_600_000)); return hours < 24 ? `${hours} ч назад` : formatShortDate(value); }
function shortCampaignId(value) { const source = String(value ?? ""); return source.length > 18 ? `ID: …${source.slice(-8)}` : source ? `ID: ${source}` : ""; }
