import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  Filter,
  Gauge,
  Inbox,
  KeyRound,
  ListChecks,
  LayoutDashboard,
  MessageSquareWarning,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Tag,
  ToggleLeft,
  ToggleRight,
  UsersRound,
  Workflow,
  Zap
} from "lucide-react";
import { ChannelBadge, ChannelList, MetricTile, Permission, ProductScreen, SectionTitle, StatusBadge, ToolbarSearch } from "./ui.jsx";
import {
  activeVisitors,
  aiSuggestions,
  auditEvents,
  botScenarios,
  channelDetails,
  channelSettings,
  employeeChannelRules,
  employeeGroups,
  exportJobs,
  initialTemplates,
  knowledgeArticles,
  operators,
  proactiveRules,
  qualityScores,
  reportChartBlocks,
  reportColumnOptions,
  queues,
  reportBars,
  reportRows,
  rescueChats,
  rescueOutcomeSummary,
  rescueReportRows,
  roles,
  sdkEvents,
  topicOptions,
  topicDirectorySeed
} from "./data.js";

function maskPhone(phone) {
  return phone.replace(/(\+7)\s(\d{3})\s(\d{3})-(\d{2})-(\d{2})/, "$1 *** ***-**-$5");
}

function getClientId(client) {
  return `gig-${client.id}-${client.phone.replace(/\D/g, "").slice(-4)}`;
}

const topicStatusFilters = ["Все", "Активные", "Архив"];
const reportTeamOptions = ["Все команды", "1-я линия", "Старшие смены", "Финансы", "Администраторы"];
const reportStatusOptions = ["Все статусы", "Новые", "В работе", "Закрытые", "Ожидают", "Спасение"];
const reportSlaOptions = ["Все SLA", "В норме", "Риск", "Просрочено"];
const reportDialogTypeOptions = ["Все типы", "Входящие", "Исходящие", "Proactive", "Бот"];
const proactiveChannelOptions = ["SDK", "Telegram", "MAX", "VK"];
const botNodeTypeOptions = [
  { id: "message", label: "Сообщение" },
  { id: "quick_replies", label: "Быстрые ответы" },
  { id: "condition", label: "Условие" },
  { id: "contact_request", label: "Запрос контакта" },
  { id: "webhook", label: "Webhook" },
  { id: "handoff", label: "Handoff" },
  { id: "fallback", label: "Fallback" }
];
const botNodeTypeLabels = Object.fromEntries(botNodeTypeOptions.map((type) => [type.id, type.label]));
const exportStatusClasses = {
  ready: "ok",
  running: "info",
  queued: "hold",
  error: "warn",
  expired: "closed"
};

function createScreenStateItems({
  loading = "готово",
  total = 1,
  empty = "данные есть",
  emptyWhenZero = "нет данных",
  errors = 0,
  errorLabel = "нет ошибок"
}) {
  return [
    { label: "Загрузка", value: loading, tone: "ok" },
    { label: total ? "Данные" : "Пусто", value: total ? empty : emptyWhenZero, tone: total ? "ok" : "empty" },
    { label: "Ошибки", value: errors ? `${errors} требуют внимания` : errorLabel, tone: errors ? "error" : "ok" }
  ];
}

export function PanelScreen({ onBack, onToast, access }) {
  const [channel, setChannel] = useState("Все каналы");
  const visibleQueues = channel === "Все каналы" ? queues : queues.filter((queue) => queue.name === channel);
  const activeChats = visibleQueues.reduce((sum, queue) => sum + queue.active, 0);
  const waitingChats = visibleQueues.reduce((sum, queue) => sum + queue.waiting, 0);
  const overdueChats = visibleQueues.reduce((sum, queue) => sum + queue.overdue, 0);

  return (
    <ProductScreen
      title="Панель смены"
      subtitle="Операторы, очереди, активные диалоги и SLA-риски в одном рабочем окне."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: visibleQueues.length,
        empty: `${visibleQueues.length} очередей`,
        emptyWhenZero: "очередей нет",
        errors: overdueChats,
        errorLabel: "SLA без ошибок"
      })}
      actions={
        <>
          <select className="inline-select" value={channel} onChange={(event) => setChannel(event.target.value)}>
            <option>Все каналы</option>
            {queues.map((queue) => <option key={queue.name}>{queue.name}</option>)}
          </select>
          <button className="primary-action" disabled={!access.canRedistribute} onClick={() => onToast("Очереди перераспределены по текущим лимитам.")} title={access.canRedistribute ? "Перераспределить очереди" : access.reason}>
            <Workflow size={17} />
            Перераспределить
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<UsersRound size={21} />} label="Операторы онлайн" value="18" detail="4 в перерыве" />
        <MetricTile icon={<Inbox size={21} />} label="Активные диалоги" value={activeChats} detail="7 / 12 у Ивана П." />
        <MetricTile icon={<Clock3 size={21} />} label="Ожидают ответа" value={waitingChats} detail="первый ответ 01:36" />
        <MetricTile icon={<AlertTriangle size={21} />} label="SLA-риски" value={overdueChats} detail="требуют старшего" tone="danger" />
      </div>

      <div className="ops-layout">
        <section className="work-panel">
          <SectionTitle title="Нагрузка операторов" action="Обновлено 11:32" />
          <div className="operator-table">
            {operators.map((operator) => (
              <div className="operator-row" key={operator.name}>
                <span className={`operator-presence ${operator.status}`} />
                <strong>{operator.name}</strong>
                <span>{operator.status === "break" ? "Перерыв" : operator.status === "offline" ? "Офлайн" : "Онлайн"}</span>
                <div className="load-meter">
                  <i style={{ width: `${Math.min(100, (operator.chats / operator.limit) * 100)}%` }} />
                </div>
                <b>{operator.chats} / {operator.limit}</b>
                <span>{operator.avg}</span>
                <span>{operator.sla}% SLA</span>
                <ChannelList channels={operator.channels} />
              </div>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Очереди и каналы" action="Порог ожидания 3 мин" />
          <div className="queue-health-list">
            {visibleQueues.map((queue) => (
              <article className="queue-health" key={queue.name}>
                <header>
                  <ChannelBadge channel={queue.name} />
                  <strong>{queue.active} активных</strong>
                </header>
                <div className="queue-health-grid">
                  <span>Ожидают <b>{queue.waiting}</b></span>
                  <span>SLA <b>{queue.overdue}</b></span>
                  <span>Лимит <b>{queue.limit}</b></span>
                </div>
                <div className="health-bar">
                  <i style={{ width: `${queue.health}%` }} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </ProductScreen>
  );
}

export function ClientsScreen({ conversations, onBack, onToast, access }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [mergedIds, setMergedIds] = useState([]);
  const clients = useMemo(() => {
    return conversations.filter((client) => `${client.name} ${client.phone} ${client.channel} ${client.device} ${client.topic}`.toLowerCase().includes(query.toLowerCase()));
  }, [conversations, query]);
  const selected = conversations.find((client) => client.id === selectedId) ?? clients[0] ?? conversations[0];
  const canMergeProfiles = access.canViewSensitive;
  const visiblePhone = access.canViewSensitive ? selected.phone : maskPhone(selected.phone);
  const visibleClientId = access.canViewSensitive ? getClientId(selected) : `${getClientId(selected).slice(0, 8)}***`;
  const duplicateCandidates = conversations
    .filter((client) => client.id !== selected.id)
    .map((client) => ({
      ...client,
      score: client.phone.slice(0, 6) === selected.phone.slice(0, 6) ? 94 : client.name.split(" ")[0] === selected.name.split(" ")[0] ? 82 : 64
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  function mergeClient(candidate) {
    if (!canMergeProfiles) {
      onToast(access.reason);
      return;
    }

    if (mergedIds.includes(candidate.id)) {
      return;
    }

    setMergedIds((current) => [...current, candidate.id]);
    onToast(`${candidate.name} объединен с профилем ${selected.name}.`);
  }

  function unmergeClient(candidate) {
    if (!canMergeProfiles) {
      onToast(access.reason);
      return;
    }

    setMergedIds((current) => current.filter((id) => id !== candidate.id));
    onToast(`${candidate.name} вынесен в отдельный профиль.`);
  }

  return (
    <ProductScreen
      title="Клиенты"
      subtitle="Единые профили с телефонами, устройствами, точками входа и историей обращений."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: clients.length,
        empty: `${clients.length} профилей`,
        emptyWhenZero: "поиск без результатов",
        errors: duplicateCandidates.filter((candidate) => candidate.score >= 90 && !mergedIds.includes(candidate.id)).length,
        errorLabel: "дублей нет"
      })}
      actions={
        <button className="primary-action" disabled={!canMergeProfiles} onClick={() => duplicateCandidates[0] ? mergeClient(duplicateCandidates[0]) : onToast("Потенциальных дублей не найдено.")} title={canMergeProfiles ? "Объединить ближайший дубль" : access.reason}>
          <Sparkles size={17} />
          Объединить дубли
        </button>
      }
    >
      <div className="screen-toolbar">
        <ToolbarSearch value={query} onChange={setQuery} placeholder="Поиск по телефону, имени или каналу" />
        <button><Filter size={17} /> Сегмент</button>
        <button><Download size={17} /> Экспорт</button>
      </div>

      <div className="clients-workspace">
        <section className="entity-table clients-table">
          <div className="entity-head">
            <span>Клиент</span>
            <span>Телефон</span>
            <span>Канал</span>
            <span>Устройство</span>
            <span>Тематика</span>
            <span>История</span>
          </div>
          {clients.map((client) => (
            <button className={`entity-row ${selected.id === client.id ? "selected" : ""}`} key={client.id} onClick={() => setSelectedId(client.id)}>
              <strong>{client.name}</strong>
              <span>{access.canViewSensitive ? client.phone : maskPhone(client.phone)}</span>
              <ChannelBadge channel={client.channel} />
              <span>{client.device}</span>
              <span>{client.topic || "Не выбрана"}</span>
              <span>{client.previous.length} закрытых</span>
            </button>
          ))}
          {!clients.length ? (
            <div className="entity-empty">
              <strong>Клиенты не найдены</strong>
              <span>Измените поисковый запрос или фильтр сегмента.</span>
            </div>
          ) : null}
        </section>

        <aside className="client-detail-panel">
          <section className="work-panel">
            <SectionTitle title="Профиль клиента" action={selected.channel} />
            <div className="client-profile-head">
              <span className={`avatar avatar-fallback ${selected.channel.toLowerCase()}`}>{selected.initials}</span>
              <div>
                <strong>{selected.name}</strong>
                <span>{visibleClientId}</span>
              </div>
            </div>
            <div className="detail-stack compact">
              <div><span>Телефон</span><strong>{visiblePhone}</strong></div>
              <div><span>Устройство</span><strong>{selected.device}</strong></div>
              <div><span>Точка входа</span><strong>{selected.entry}</strong></div>
              <div><span>Клиент с</span><strong>{selected.clientSince}</strong></div>
              <div><span>Язык</span><strong>{selected.language}</strong></div>
              <div><span>Текущая тематика</span><strong>{selected.topic || "Не выбрана"}</strong></div>
            </div>
            {!access.canViewSensitive ? (
              <div className="client-privacy-note">
                <ShieldCheck size={15} />
                Телефон и client ID замаскированы для текущей роли.
              </div>
            ) : null}
            <div className="tag-list">
              {selected.tags.map((tag) => <span key={tag}><Tag size={13} />{tag}</span>)}
            </div>
          </section>

          <section className="work-panel">
            <SectionTitle title="Дубли и объединение" action={`${mergedIds.length} объединено`} />
            {!canMergeProfiles ? (
              <div className="client-privacy-note">
                <ShieldCheck size={15} />
                {access.reason}
              </div>
            ) : null}
            <div className="duplicate-list">
              {duplicateCandidates.map((candidate) => {
                const isMerged = mergedIds.includes(candidate.id);

                return (
                  <article className={`duplicate-row ${isMerged ? "merged" : ""}`} key={candidate.id}>
                    <header>
                      <strong>{candidate.name}</strong>
                      <b>{candidate.score}%</b>
                    </header>
                    <span>{access.canViewSensitive ? candidate.phone : maskPhone(candidate.phone)} · {candidate.channel} · {candidate.device}</span>
                    <footer>
                      <small>{candidate.topic || "Без тематики"}</small>
                      <button disabled={!canMergeProfiles} onClick={() => isMerged ? unmergeClient(candidate) : mergeClient(candidate)} title={canMergeProfiles ? "Изменить связь профилей" : access.reason} type="button">
                        {isMerged ? "Разъединить" : "Объединить"}
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="work-panel">
            <SectionTitle title="История обращений" action={`${selected.previous.length + 1} всего`} />
            <div className="client-history-list">
              <article>
                <time>Сейчас</time>
                <strong>{selected.topic || "Активный диалог"}</strong>
                <span>{selected.channel} · {selected.status}</span>
              </article>
              {selected.previous.map(([date, topic, status]) => (
                <article key={`${date}-${topic}`}>
                  <time>{date}</time>
                  <strong>{topic}</strong>
                  <span>{status}</span>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </ProductScreen>
  );
}

export function TemplatesScreen({ onBack, onToast, templates, onTemplatesChange }) {
  const [localItems, setLocalItems] = useState(initialTemplates);
  const items = templates ?? localItems;
  const setItems = onTemplatesChange ?? setLocalItems;
  const [selectedId, setSelectedId] = useState("delay");
  const [query, setQuery] = useState("");
  const selected = items.find((template) => template.id === selectedId) ?? items[0];
  const visibleItems = items.filter((template) => `${template.title} ${template.text} ${template.topic}`.toLowerCase().includes(query.toLowerCase()));

  function updateSelected(field, value) {
    setItems((current) => current.map((template) => template.id === selected.id ? { ...template, [field]: value } : template));
  }

  function createTemplate() {
    const next = {
      id: `template-${Date.now()}`,
      title: "Новый шаблон",
      scope: "Личный",
      channel: "Все",
      topic: "Без группы",
      usage: 0,
      updated: "только что",
      text: "Введите текст шаблона."
    };
    setItems((current) => [next, ...current]);
    setSelectedId(next.id);
    onToast("Создан новый личный шаблон.");
  }

  return (
    <ProductScreen
      title="Шаблоны"
      subtitle="Личные, командные и глобальные ответы с каналами, тематиками и переменными."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: visibleItems.length,
        empty: `${visibleItems.length} шаблонов`,
        emptyWhenZero: "поиск без шаблонов",
        errorLabel: "ошибок редактора нет"
      })}
      actions={
        <button className="primary-action" onClick={createTemplate}>
          <Plus size={17} />
          Новый шаблон
        </button>
      }
    >
      <div className="templates-workspace">
        <section className="template-browser">
          <div className="screen-toolbar compact">
            <ToolbarSearch value={query} onChange={setQuery} placeholder="Найти шаблон" />
          </div>
          <div className="template-cards">
            {visibleItems.map((template) => (
              <button className={`template-card ${selected.id === template.id ? "selected" : ""}`} key={template.id} onClick={() => setSelectedId(template.id)}>
                <span>
                  <strong>{template.title}</strong>
                  <small>{template.scope} • {template.channel}</small>
                </span>
                <b>{template.usage}</b>
                <p>{template.text}</p>
                <em>{template.updated}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="template-editor">
          <SectionTitle title="Редактор шаблона" action={selected.scope} />
          <div className="form-grid">
            <label>
              <span>Название</span>
              <input value={selected.title} onChange={(event) => updateSelected("title", event.target.value)} />
            </label>
            <label>
              <span>Канал</span>
              <select value={selected.channel} onChange={(event) => updateSelected("channel", event.target.value)}>
                {["Все", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              <span>Тематика</span>
              <input value={selected.topic} onChange={(event) => updateSelected("topic", event.target.value)} />
            </label>
            <label>
              <span>Доступ</span>
              <select value={selected.scope} onChange={(event) => updateSelected("scope", event.target.value)}>
                {["Личный", "Командный", "Глобальный"].map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          </div>
          <label className="large-field">
            <span>Текст ответа</span>
            <textarea value={selected.text} onChange={(event) => updateSelected("text", event.target.value)} />
          </label>
          <div className="variable-row">
            {["{client_name}", "{operator_name}", "{ticket_id}", "{topic}"].map((variable) => <button key={variable}>{variable}</button>)}
          </div>
          <footer className="editor-actions">
            <button onClick={() => onToast("Предпросмотр шаблона открыт.")}><BookOpen size={17} /> Предпросмотр</button>
            <button className="primary-action" onClick={() => onToast("Шаблон сохранен.")}><CheckCircle2 size={17} /> Сохранить</button>
          </footer>
        </section>
      </div>
    </ProductScreen>
  );
}

export function VisitorsScreen({ onBack, onToast, access }) {
  const [selectedVisitorId, setSelectedVisitorId] = useState(activeVisitors[0].id);
  const [proactiveRuleItems, setProactiveRuleItems] = useState(proactiveRules);
  const [selectedRuleId, setSelectedRuleId] = useState(proactiveRules[0].id);
  const selectedVisitor = activeVisitors.find((visitor) => visitor.id === selectedVisitorId) ?? activeVisitors[0];
  const selectedRule = proactiveRuleItems.find((rule) => rule.id === selectedRuleId) ?? proactiveRuleItems[0];
  const activeVariant = selectedRule.variants.find((variant) => variant.id === selectedRule.activeVariant) ?? selectedRule.variants[0];
  const typingCount = activeVisitors.filter((visitor) => visitor.typing).length;
  const criticalRescue = rescueChats.filter((chat) => chat.priority === "Критичный").length;
  const canManageProactive = access.canManageSettings;

  function updateProactiveRule(field, value) {
    setProactiveRuleItems((current) => current.map((rule) => rule.id === selectedRule.id ? { ...rule, [field]: value } : rule));
  }

  function toggleProactiveChannel(channel) {
    const nextChannels = selectedRule.channels.includes(channel)
      ? selectedRule.channels.filter((item) => item !== channel)
      : [...selectedRule.channels, channel];
    updateProactiveRule("channels", nextChannels.length ? nextChannels : [channel]);
  }

  function updateProactiveVariant(variantId, text) {
    setProactiveRuleItems((current) => current.map((rule) => {
      if (rule.id !== selectedRule.id) {
        return rule;
      }

      return {
        ...rule,
        variants: rule.variants.map((variant) => variant.id === variantId ? { ...variant, text } : variant),
        message: rule.activeVariant === variantId ? text : rule.message
      };
    }));
  }

  function selectProactiveVariant(variant) {
    setProactiveRuleItems((current) => current.map((rule) => rule.id === selectedRule.id
      ? { ...rule, activeVariant: variant.id, message: variant.text }
      : rule
    ));
  }

  return (
    <ProductScreen
      title="Активные визиты и спасение"
      subtitle="Наблюдение SDK/VK-сессий до начала чата, proactive-приглашения и очередь спасения диалогов с таймерами."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: activeVisitors.length,
        empty: `${activeVisitors.length} активных визитов`,
        emptyWhenZero: "активных визитов нет",
        errors: criticalRescue,
        errorLabel: "критичных rescue нет"
      })}
      actions={
        <>
          <button
            disabled={!canManageProactive}
            onClick={() => onToast(`Правило "${selectedRule.name}" сохранено для ${selectedRule.channels.join(", ")}.`)}
            title={canManageProactive ? "Сохранить proactive-правило" : access.reason}
            type="button"
          >
            <Zap size={17} />
            Сохранить правило
          </button>
          <button className="primary-action" disabled={!access.canOutbound} onClick={() => onToast(`Диалог с ${selectedVisitor.name} инициирован через ${selectedVisitor.channel}.`)} title={access.canOutbound ? "Начать диалог" : access.reason} type="button">
            <MessageSquareWarning size={17} />
            Начать диалог
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<UsersRound size={21} />} label="Активные визиты" value={activeVisitors.length} detail="SDK и внешние каналы" />
        <MetricTile icon={<Pencil size={21} />} label="Печатает до чата" value={typingCount} detail="только контекст без текста ввода" />
        <MetricTile icon={<AlertTriangle size={21} />} label="Спасение" value={rescueChats.length} detail={`${criticalRescue} критичных`} tone="danger" />
        <MetricTile icon={<Zap size={21} />} label="Proactive" value={`${Math.max(...proactiveRuleItems.map((rule) => rule.acceptanceRate))}%`} detail="принятие лучшего правила" />
      </div>

      <div className="visitors-layout">
        <section className="work-panel">
          <SectionTitle title="Посетители сейчас" action="контекст до обращения" />
          <div className="visitor-list">
            {activeVisitors.map((visitor) => (
              <button
                className={`visitor-row ${selectedVisitor.id === visitor.id ? "selected" : ""}`}
                key={visitor.id}
                onClick={() => setSelectedVisitorId(visitor.id)}
                type="button"
              >
                <span>
                  <strong>{visitor.name}</strong>
                  <small>{visitor.phone || "телефон еще не передан"} · {visitor.device}</small>
                </span>
                <ChannelBadge channel={visitor.channel} />
                <b>{visitor.activeFor}</b>
                <em>{visitor.typing ? "печатает" : visitor.segment}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="work-panel visitor-detail">
          <SectionTitle title="Контекст визита" action={selectedVisitor.privacy} />
          <div className="detail-stack">
            <InfoPill label="Страница" value={selectedVisitor.page} />
            <InfoPill label="Точка входа" value={selectedVisitor.entry} />
            <InfoPill label="Последнее событие" value={selectedVisitor.lastEvent} />
            <InfoPill label="Маршрут" value={selectedVisitor.operatorHint} />
          </div>
          <div className="sdk-timeline">
            {["identifyUser", "trackEntryPoint", "viewScreen", "openSupport"].map((event, index) => (
              <div className="timeline-row" key={event}>
                <span>{`11:${24 + index}`}</span>
                <strong>{event}</strong>
                <small>{index === 0 ? selectedVisitor.phone || "anonymous" : selectedVisitor.page}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="visitors-layout">
        <section className="work-panel">
          <SectionTitle title="Очередь спасения" action="возврат в очередь и контроль старшего" />
          <div className="rescue-list">
            {rescueChats.map((chat) => (
              <article className="rescue-row" key={chat.id}>
                <header>
                  <ChannelBadge channel={chat.channel} />
                  <strong>{chat.client}</strong>
                  <b>{chat.timer}</b>
                </header>
                <p>{chat.reason}</p>
                <footer>
                  <span>{chat.operator}</span>
                  <button onClick={() => onToast(`${chat.client}: ${chat.nextAction}`)} type="button">Выполнить</button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Proactive-правила" action="A/B, cooldown, privacy" />
          <div className="proactive-list">
            {proactiveRuleItems.map((rule) => (
              <button className={`proactive-row ${selectedRule.id === rule.id ? "selected" : ""}`} key={rule.id} onClick={() => setSelectedRuleId(rule.id)} type="button">
                <header>
                  <strong>{rule.name}</strong>
                  <span>{rule.status}</span>
                </header>
                <p>{rule.segment}</p>
                <small>{rule.message}</small>
                <footer>
                  <ChannelList channels={rule.channels} />
                  <b>{rule.acceptanceRate}%</b>
                </footer>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel proactive-builder-panel">
        <SectionTitle title="Visual builder proactive" action={`${selectedRule.name} · ${selectedRule.status}`} />
        <div className="proactive-builder-grid">
          <div className="proactive-rule-form">
            <label>
              <span>Название правила</span>
              <input disabled={!canManageProactive} value={selectedRule.name} onChange={(event) => updateProactiveRule("name", event.target.value)} />
            </label>
            <label>
              <span>Условие / сегмент</span>
              <textarea disabled={!canManageProactive} value={selectedRule.segment} onChange={(event) => updateProactiveRule("segment", event.target.value)} />
            </label>
            <label>
              <span>Экран или URL</span>
              <input disabled={!canManageProactive} value={selectedRule.screen} onChange={(event) => updateProactiveRule("screen", event.target.value)} />
            </label>
            <div className="proactive-field-row">
              <label>
                <span>Задержка показа</span>
                <input disabled={!canManageProactive} value={selectedRule.triggerDelay} onChange={(event) => updateProactiveRule("triggerDelay", event.target.value)} />
              </label>
              <label>
                <span>Cooldown</span>
                <input disabled={!canManageProactive} value={selectedRule.cooldown} onChange={(event) => updateProactiveRule("cooldown", event.target.value)} />
              </label>
            </div>
            <div className="proactive-field-row">
              <label>
                <span>Рабочее время</span>
                <input disabled={!canManageProactive} value={selectedRule.workHours} onChange={(event) => updateProactiveRule("workHours", event.target.value)} />
              </label>
              <label>
                <span>Offline form</span>
                <input disabled={!canManageProactive} value={selectedRule.offlineForm} onChange={(event) => updateProactiveRule("offlineForm", event.target.value)} />
              </label>
            </div>
            <label>
              <span>Privacy</span>
              <input disabled={!canManageProactive} value={selectedRule.privacyNotice} onChange={(event) => updateProactiveRule("privacyNotice", event.target.value)} />
            </label>
            <div className="proactive-channel-editor" aria-label="Каналы proactive-правила">
              {proactiveChannelOptions.map((channel) => (
                <button
                  className={selectedRule.channels.includes(channel) ? "selected" : ""}
                  disabled={!canManageProactive}
                  key={channel}
                  onClick={() => toggleProactiveChannel(channel)}
                  type="button"
                >
                  {selectedRule.channels.includes(channel) ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                  {channel}
                </button>
              ))}
            </div>
          </div>

          <aside className="proactive-preview-panel">
            <div className="proactive-widget-preview">
              <header>
                <span>{selectedVisitor.channel}</span>
                <b>{selectedRule.screen}</b>
              </header>
              <strong>{selectedRule.name}</strong>
              <p>{activeVariant.text}</p>
              <footer>
                <button type="button">Написать</button>
                <button type="button">Не сейчас</button>
              </footer>
            </div>
            <div className="proactive-rule-summary">
              <InfoPill label="Показ" value={`${selectedRule.triggerDelay} · ${selectedRule.workHours}`} />
              <InfoPill label="Cooldown" value={selectedRule.cooldown} />
              <InfoPill label="Принятие" value={`${selectedRule.acceptanceRate}%`} />
              <InfoPill label="Конверсия / отказ" value={`${selectedRule.conversionRate}% / ${selectedRule.dismissRate}%`} />
            </div>
            <div className="proactive-ab-list">
              {selectedRule.variants.map((variant) => (
                <article className={selectedRule.activeVariant === variant.id ? "active" : ""} key={variant.id}>
                  <header>
                    <strong>Вариант {variant.label}</strong>
                    <button disabled={!canManageProactive} onClick={() => selectProactiveVariant(variant)} type="button">
                      {selectedRule.activeVariant === variant.id ? <CheckCircle2 size={15} /> : <PlayCircle size={15} />}
                      {selectedRule.activeVariant === variant.id ? "Активен" : "Сделать активным"}
                    </button>
                  </header>
                  <textarea disabled={!canManageProactive} value={variant.text} onChange={(event) => updateProactiveVariant(variant.id, event.target.value)} />
                  <footer>
                    <span>Конверсия {variant.conversion}%</span>
                    <span>Отказы {variant.dismiss}%</span>
                  </footer>
                </article>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </ProductScreen>
  );
}

export function QualityScreen({ onBack, onToast }) {
  const [selectedArticleId, setSelectedArticleId] = useState(knowledgeArticles[0]?.id ?? "");
  const [articleDrafts, setArticleDrafts] = useState(() =>
    Object.fromEntries(knowledgeArticles.map((article) => [
      article.id,
      {
        ...article,
        body: `${article.title}: актуальная инструкция для операторов и self-service. Свяжите статью с тематикой ${article.topics.join(", ")} и проверьте формулировки перед публикацией.`
      }
    ]))
  );
  const lowScores = qualityScores.filter((item) => Number(item.score) < 4 || item.status.includes("Низкая"));
  const averageCsat = Math.round(
    qualityScores
      .filter((item) => item.scale === "CSAT")
      .reduce((sum, item, _, list) => sum + (Number(item.score) / 5) * 100 / list.length, 0)
  );
  const selectedArticle = articleDrafts[selectedArticleId] ?? Object.values(articleDrafts)[0];

  function updateArticleDraft(field, value) {
    setArticleDrafts((current) => ({
      ...current,
      [selectedArticle.id]: {
        ...current[selectedArticle.id],
        [field]: value
      }
    }));
  }

  function toggleArticleChannel(channel) {
    const nextChannels = selectedArticle.channels.includes(channel)
      ? selectedArticle.channels.filter((item) => item !== channel)
      : [...selectedArticle.channels, channel];

    updateArticleDraft("channels", nextChannels);
  }

  return (
    <ProductScreen
      title="Качество, CSAT и AI"
      subtitle="Оценки клиентов, ручной QA, низкие оценки, AI-подсказки и управление статьями базы знаний."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: qualityScores.length + aiSuggestions.length + knowledgeArticles.length,
        empty: `${qualityScores.length} оценок, ${aiSuggestions.length} AI`,
        emptyWhenZero: "качество без данных",
        errors: lowScores.length,
        errorLabel: "низких оценок нет"
      })}
      actions={
        <>
          <button onClick={() => onToast("Фильтр низких оценок применен к очереди старшего сотрудника.")} type="button">
            <Filter size={17} />
            Низкие оценки
          </button>
          <button className="primary-action" onClick={() => onToast("AI-проверка диалогов поставлена в очередь.")} type="button">
            <Sparkles size={17} />
            AI-проверка
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<Star size={21} />} label="CSAT" value={`${averageCsat}%`} detail="по закрытым диалогам" />
        <MetricTile icon={<AlertTriangle size={21} />} label="Низкие оценки" value={lowScores.length} detail="нужна проверка старшего" tone="danger" />
        <MetricTile icon={<Sparkles size={21} />} label="AI-подсказки" value={aiSuggestions.length} detail="accept / edit / reject" />
        <MetricTile icon={<BookOpen size={21} />} label="Статьи" value={knowledgeArticles.length} detail="рекомендации в чате" />
      </div>

      <div className="quality-layout">
        <section className="work-panel">
          <SectionTitle title="Оценки и ручной QA" action="после закрытия и выборочная проверка" />
          <div className="quality-list">
            {qualityScores.map((score) => (
              <article className={`quality-row ${Number(score.score) < 4 ? "danger" : ""}`} key={score.id}>
                <header>
                  <strong>{score.client}</strong>
                  <ChannelBadge channel={score.channel} />
                  <b>{score.scale}: {score.score}</b>
                </header>
                <p>{score.comment}</p>
                <footer>
                  <span>{score.operator} · {score.topic}</span>
                  <button onClick={() => onToast(`${score.client}: ${score.status}`)} type="button">Проверить</button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="AI-помощник оператора" action="контролируемые действия" />
          <div className="ai-suggestion-list">
            {aiSuggestions.map((suggestion) => (
              <article className="ai-suggestion" key={suggestion.id}>
                <header>
                  <Sparkles size={17} />
                  <strong>{suggestion.title}</strong>
                  <span>{suggestion.confidence}%</span>
                </header>
                <p>{suggestion.text}</p>
                <small>{suggestion.suggestedTopic} · {suggestion.risk}</small>
                <footer>
                  {suggestion.actions.map((action) => (
                    <button key={action} onClick={() => onToast(`${suggestion.title}: ${action}`)} type="button">{action}</button>
                  ))}
                </footer>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel">
        <SectionTitle title="База знаний" action="редактор и публикация статей" />
        <div className="knowledge-workspace">
          <div className="knowledge-table">
            {Object.values(articleDrafts).map((article) => (
              <button
                className={`knowledge-row ${selectedArticle.id === article.id ? "selected" : ""}`}
                key={article.id}
                onClick={() => setSelectedArticleId(article.id)}
                type="button"
              >
                <strong>{article.title}</strong>
                <span>{article.category}</span>
                <span>{article.status}</span>
                <ChannelList channels={article.channels} />
                <b>{article.helpfulRate}% полезность</b>
              </button>
            ))}
          </div>

          <div className="knowledge-editor">
            <div className="knowledge-editor-form">
              <label>
                <span>Название</span>
                <input value={selectedArticle.title} onChange={(event) => updateArticleDraft("title", event.target.value)} />
              </label>
              <label>
                <span>Статус</span>
                <select value={selectedArticle.status} onChange={(event) => updateArticleDraft("status", event.target.value)}>
                  <option>Черновик</option>
                  <option>На проверке</option>
                  <option>Опубликована</option>
                </select>
              </label>
              <label>
                <span>Текст статьи</span>
                <textarea value={selectedArticle.body} onChange={(event) => updateArticleDraft("body", event.target.value)} />
              </label>
              <div className="knowledge-channel-picker" aria-label="Каналы статьи">
                {["SDK", "Telegram", "MAX", "VK"].map((channel) => (
                  <button
                    className={selectedArticle.channels.includes(channel) ? "active" : ""}
                    key={channel}
                    onClick={() => toggleArticleChannel(channel)}
                    type="button"
                  >
                    {channel}
                  </button>
                ))}
              </div>
              <footer>
                <button onClick={() => onToast(`${selectedArticle.title}: черновик сохранен.`)} type="button">
                  <Pencil size={16} />
                  Сохранить
                </button>
                <button className="primary-action" onClick={() => updateArticleDraft("status", "На проверке")} type="button">
                  <CheckCircle2 size={16} />
                  На проверку
                </button>
              </footer>
            </div>
            <article className="knowledge-preview">
              <span>{selectedArticle.category} · {selectedArticle.status}</span>
              <h3>{selectedArticle.title}</h3>
              <p>{selectedArticle.body}</p>
              <ChannelList channels={selectedArticle.channels} />
              <small>Тематики: {selectedArticle.topics.join(", ")} · полезность {selectedArticle.helpfulRate}%</small>
            </article>
          </div>
        </div>
      </section>
    </ProductScreen>
  );
}

export function AutomationScreen({ onBack, onToast, access }) {
  const [scenarioItems, setScenarioItems] = useState(botScenarios);
  const [selectedScenarioId, setSelectedScenarioId] = useState(botScenarios[0].id);
  const [selectedNodeId, setSelectedNodeId] = useState(botScenarios[0].flowNodes[0].id);
  const [importDraft, setImportDraft] = useState("");
  const [importError, setImportError] = useState("");
  const selectedScenario = scenarioItems.find((scenario) => scenario.id === selectedScenarioId) ?? scenarioItems[0];
  const selectedNode = selectedScenario.flowNodes.find((node) => node.id === selectedNodeId) ?? selectedScenario.flowNodes[0];
  const canManageAutomation = access.canManageSettings;
  const enabledScenarios = scenarioItems.filter((scenario) => scenario.status.includes("Включ") || scenario.status.includes("Р’РєР»")).length;
  const enabledProactive = proactiveRules.filter((rule) => rule.status.includes("Включ") || rule.status.includes("Р’РєР»")).length;
  const automationChannels = ["SDK", "Telegram", "MAX", "VK"];
  const channelAssignments = automationChannels.map((channel) => ({
    channel,
    scenario: scenarioItems.find((scenario) => scenario.channels.includes(channel))
  }));
  const botMetricRows = [
    { label: "Диалогов с ботом", value: "312", detail: "24 часа" },
    { label: "Успешно без оператора", value: "41%", detail: "по выбранным сценариям" },
    { label: "Handoff rate", value: "37%", detail: selectedScenario.handoff },
    { label: "Fallback", value: "8%", detail: "нет intent или данных" }
  ];
  const afterHoursPolicy = {
    name: "Нерабочее время",
    window: "21:00-09:00",
    channels: selectedScenario.channels,
    behavior: "Собрать телефон, тему, номер заказа и создать обращение без ожидания оператора",
    fallback: "Если клиент просит человека, показать срок ответа и поставить SLA-таймер"
  };
  const exportPayload = JSON.stringify({
    schemaVersion: selectedScenario.schemaVersion,
    exportVersion: selectedScenario.exportVersion,
    id: selectedScenario.id,
    name: selectedScenario.name,
    status: selectedScenario.status,
    owner: selectedScenario.owner,
    updatedAt: selectedScenario.updatedAt,
    trigger: selectedScenario.trigger,
    channels: selectedScenario.channels,
    flowNodes: selectedScenario.flowNodes,
    flowEdges: selectedScenario.flowEdges,
    validationRules: selectedScenario.validationRules,
    previewMessages: selectedScenario.previewMessages,
    testCases: selectedScenario.testCases,
    handoff: selectedScenario.handoff
  }, null, 2);

  function selectScenario(scenario) {
    setSelectedScenarioId(scenario.id);
    setSelectedNodeId(scenario.flowNodes[0]?.id ?? "");
    setImportDraft("");
    setImportError("");
  }

  function updateSelectedNode(field, value) {
    setScenarioItems((current) => current.map((scenario) => {
      if (scenario.id !== selectedScenario.id) {
        return scenario;
      }

      return {
        ...scenario,
        flowNodes: scenario.flowNodes.map((node) => node.id === selectedNode.id
          ? { ...node, [field]: value, ...(field === "type" ? { typeLabel: botNodeTypeLabels[value] } : {}) }
          : node
        )
      };
    }));
  }

  function handleAddNode() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const nextNode = {
      id: `node-${Date.now()}`,
      type: "message",
      typeLabel: botNodeTypeLabels.message,
      title: "Новая нода",
      detail: "Опишите условие, ответ или handoff.",
      channel: selectedScenario.channels[0] ?? "SDK",
      position: { x: 1, y: Math.ceil((selectedScenario.flowNodes.length + 1) / 2) }
    };

    setScenarioItems((current) => current.map((scenario) => scenario.id === selectedScenario.id
      ? {
          ...scenario,
          flowNodes: [...scenario.flowNodes, nextNode],
          flowEdges: [
            ...(scenario.flowEdges ?? []),
            ...(scenario.flowNodes.length ? [{ from: scenario.flowNodes.at(-1).id, to: nextNode.id, label: "next" }] : [])
          ]
        }
      : scenario
    ));
    setSelectedNodeId(nextNode.id);
    onToast("Нода добавлена в canvas сценария.");
  }

  function handleScenarioCreate() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const id = `bot-draft-${Date.now()}`;
    const draftScenario = {
      id,
      name: "Новый сценарий",
      status: "Черновик",
      schemaVersion: "bot-flow/v1",
      owner: "Администратор",
      updatedAt: "сейчас",
      trigger: "Опишите триггер",
      channels: ["SDK"],
      steps: ["Триггер", "Ответ", "Handoff"],
      handoff: "Очередь 1-я линия",
      successRate: 0,
      flowNodes: [
        { id: `${id}-message`, type: "message", typeLabel: "Сообщение", title: "Новый триггер", detail: "Условие запуска сценария", channel: "SDK", position: { x: 1, y: 1 } },
        { id: `${id}-condition`, type: "condition", typeLabel: "Условие", title: "Условие перехода", detail: "Правило ветвления сценария", channel: "SDK", position: { x: 2, y: 1 } },
        { id: `${id}-handoff`, type: "handoff", typeLabel: "Handoff", title: "Передача оператору", detail: "Очередь и причина handoff", channel: "SDK", position: { x: 3, y: 1 } }
      ],
      flowEdges: [
        { from: `${id}-message`, to: `${id}-condition`, label: "next" },
        { from: `${id}-condition`, to: `${id}-handoff`, label: "handoff" }
      ],
      validationRules: ["phone"],
      previewMessages: [
        { side: "client", speaker: "Клиент", time: "00:01", text: "Пример входящего сообщения." },
        { side: "bot", speaker: "Бот", time: "00:03", text: "Черновик ответа бота." },
        { side: "bot", speaker: "Бот", time: "00:07", text: "При необходимости подключу оператора." }
      ],
      testCases: [
        { id: `${id}-default`, name: "Базовый тест", expected: "handoff" }
      ],
      exportVersion: "flow-v1.3"
    };

    setScenarioItems((current) => [draftScenario, ...current]);
    setSelectedScenarioId(id);
    setSelectedNodeId(draftScenario.flowNodes[0].id);
    setImportDraft("");
    setImportError("");
    onToast("Черновик сценария создан в конструкторе.");
  }

  function handleAssignChannel(channel, scenarioId) {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const targetScenario = scenarioItems.find((scenario) => scenario.id === scenarioId);

    setScenarioItems((current) => current.map((scenario) => {
      const nextChannels = scenario.id === scenarioId
        ? Array.from(new Set([...scenario.channels, channel]))
        : scenario.channels.filter((item) => item !== channel);

      return { ...scenario, channels: nextChannels };
    }));
    onToast(`${channel}: назначен бот "${targetScenario?.name ?? "сценарий"}".`);
  }

  function handleImportFlow() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    try {
      const payload = JSON.parse(importDraft);
      const validNodeTypes = new Set(botNodeTypeOptions.map((type) => type.id));
      const hasValidNodes = Array.isArray(payload.flowNodes) &&
        payload.flowNodes.length &&
        payload.flowNodes.every((node) => node.id && validNodeTypes.has(node.type));
      const hasValidEdges = payload.flowEdges === undefined ||
        (Array.isArray(payload.flowEdges) && payload.flowEdges.every((edge) => edge.from && edge.to));

      if (!payload.name || !hasValidNodes || !hasValidEdges) {
        throw new Error("JSON должен содержать name, flowNodes с валидными type и корректные flowEdges.");
      }

      setScenarioItems((current) => current.map((scenario) => scenario.id === selectedScenario.id
        ? {
            ...scenario,
            name: payload.name,
            status: payload.status ?? scenario.status,
            schemaVersion: payload.schemaVersion ?? scenario.schemaVersion,
            owner: payload.owner ?? scenario.owner,
            updatedAt: "сейчас",
            trigger: payload.trigger ?? scenario.trigger,
            channels: Array.isArray(payload.channels) ? payload.channels : scenario.channels,
            handoff: payload.handoff ?? scenario.handoff,
            flowNodes: payload.flowNodes.map((node) => ({ ...node, typeLabel: node.typeLabel ?? botNodeTypeLabels[node.type] })),
            flowEdges: Array.isArray(payload.flowEdges) ? payload.flowEdges : scenario.flowEdges,
            validationRules: Array.isArray(payload.validationRules) ? payload.validationRules : scenario.validationRules,
            previewMessages: Array.isArray(payload.previewMessages) ? payload.previewMessages : scenario.previewMessages,
            testCases: Array.isArray(payload.testCases) ? payload.testCases : scenario.testCases,
            exportVersion: payload.exportVersion ?? payload.version ?? scenario.exportVersion
          }
        : scenario
      ));
      setSelectedNodeId(payload.flowNodes[0].id);
      setImportError("");
      onToast(`Импортирован flow: ${payload.name}.`);
    } catch (error) {
      setImportError(error.message || "Импорт не выполнен: вставьте валидный JSON flow.");
    }
  }

  function handleExportFlowDownload() {
    if (!canManageAutomation) {
      onToast(access.reason);
      return;
    }

    const blob = new Blob([exportPayload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedScenario.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
    onToast(`${selectedScenario.name}: JSON export скачан.`);
  }

  return (
    <ProductScreen
      title="Боты и автоматизация"
      subtitle="Сценарии AI-оператора, proactive-приглашения, handoff в очереди и audit действий автоматики."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: scenarioItems.length,
        empty: `${scenarioItems.length} сценариев`,
        emptyWhenZero: "сценариев нет",
        errors: importError ? 1 : 0,
        errorLabel: "ошибок flow нет"
      })}
      actions={
        <>
          <button disabled={!canManageAutomation} onClick={handleScenarioCreate} title={canManageAutomation ? "Создать сценарий" : access.reason} type="button">
            <Plus size={17} />
            Новый сценарий
          </button>
          <button className="primary-action" disabled={!canManageAutomation} onClick={() => onToast(`Тестовый прогон "${selectedScenario.name}" запущен.`)} title={canManageAutomation ? "Прогнать тест" : access.reason} type="button">
            <PlayCircle size={17} />
            Прогнать тест
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<Bot size={21} />} label="Сценарии" value={scenarioItems.length} detail={`${enabledScenarios} включены`} />
        <MetricTile icon={<Zap size={21} />} label="Proactive" value={proactiveRules.length} detail={`${enabledProactive} активны`} />
        <MetricTile icon={<Workflow size={21} />} label="Handoff" value="4" detail="очереди назначения" />
        <MetricTile icon={<ListChecks size={21} />} label="Audit" value={auditEvents.length} detail="последние события" />
      </div>

      <div className="automation-insight-grid">
        <section className="work-panel bot-assignment-panel">
          <SectionTitle title="Боты по каналам" action="один активный сценарий на канал" />
          <div className="bot-assignment-list">
            {channelAssignments.map(({ channel, scenario }) => (
              <label key={channel}>
                <span><ChannelBadge channel={channel} /> {scenario?.status ?? "Не назначен"}</span>
                <select
                  disabled={!canManageAutomation}
                  onChange={(event) => handleAssignChannel(channel, event.target.value)}
                  value={scenario?.id ?? ""}
                >
                  <option value="" disabled>Выберите сценарий</option>
                  {scenarioItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>

        <section className="work-panel after-hours-card">
          <SectionTitle title="Нерабочее время" action={afterHoursPolicy.window} />
          <p>{afterHoursPolicy.behavior}</p>
          <small>{afterHoursPolicy.fallback}</small>
          <ChannelList channels={afterHoursPolicy.channels} />
        </section>

        <section className="work-panel bot-metrics-card">
          <SectionTitle title="Метрики ботов" action="срез демо-данных" />
          <div className="bot-metric-list">
            {botMetricRows.map((metric) => (
              <span key={metric.label}>
                <b>{metric.value}</b>
                <strong>{metric.label}</strong>
                <small>{metric.detail}</small>
              </span>
            ))}
          </div>
        </section>

        <section className="work-panel bot-handoff-card">
          <SectionTitle title="Handoff summary" action={selectedScenario.handoff} />
          <p>Оператор получает trigger, собранные поля, последний ответ бота и причину передачи до первого ручного сообщения.</p>
          <div>
            <span>Поля: {selectedScenario.validationRules.join(", ")}</span>
            <span>Последний тест: {selectedScenario.testCases[0]?.expected ?? "handoff"}</span>
          </div>
        </section>
      </div>

      <div className="automation-layout">
        <section className="work-panel">
          <SectionTitle title="Конструктор сценариев" action="триггер -> шаги -> handoff" />
          <div className="scenario-list">
            {scenarioItems.map((scenario) => (
              <article className={`scenario-card ${selectedScenario.id === scenario.id ? "selected" : ""}`} key={scenario.id}>
                <header>
                  <Bot size={18} />
                  <strong>{scenario.name}</strong>
                  <span>{scenario.status}</span>
                </header>
                <p>{scenario.trigger}</p>
                <ol>
                  {scenario.steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
                <footer>
                  <ChannelList channels={scenario.channels} />
                  <b>{scenario.successRate}%</b>
                  <button onClick={() => selectScenario(scenario)} type="button">Открыть</button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Audit автоматизации" action="экспорт, лимиты, rescue" />
          <div className="audit-list">
            {auditEvents.map((event) => (
              <article className="audit-row" key={event.id}>
                <time>{event.time}</time>
                <strong>{event.action}</strong>
                <span>{event.actor} · {event.role}</span>
                <p>{event.target}: {event.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel bot-builder-panel">
        <SectionTitle title="Canvas сценария" action={`${selectedScenario.name} · ${selectedScenario.status}`} />
        <div className="bot-builder-grid">
          <div className="bot-canvas-panel">
            <div className="bot-canvas-toolbar">
              <strong>{selectedScenario.trigger}</strong>
              <span>{selectedScenario.handoff} · {selectedScenario.schemaVersion} · {selectedScenario.owner}</span>
            </div>
            <div className="bot-flow-canvas" aria-label="Ноды сценария">
              {selectedScenario.flowNodes.map((node, index) => (
                <button
                  aria-pressed={selectedNode.id === node.id}
                  className={`bot-flow-node ${selectedNode.id === node.id ? "selected" : ""} ${node.type}`}
                  key={node.id}
                  onClick={() => setSelectedNodeId(node.id)}
                  type="button"
                >
                  <span>{index + 1}</span>
                  <strong>{node.title}</strong>
                  <small>{node.typeLabel ?? botNodeTypeLabels[node.type] ?? node.type} · {node.channel}</small>
                  <p>{node.detail}</p>
                </button>
              ))}
            </div>
            <div className="bot-edge-list" aria-label="Связи сценария">
              {(selectedScenario.flowEdges ?? []).map((edge) => (
                <span key={`${edge.from}-${edge.to}-${edge.label}`}>
                  {edge.from} {"->"} {edge.to} <b>{edge.label}</b>
                </span>
              ))}
            </div>
          </div>

          <aside className="bot-node-editor">
            <header>
              <Pencil size={17} />
              <strong>Редактор ноды</strong>
            </header>
            <label>
              <span>Тип</span>
              <select disabled={!canManageAutomation} value={selectedNode.type} onChange={(event) => updateSelectedNode("type", event.target.value)}>
                {botNodeTypeOptions.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>
            <label>
              <span>Название</span>
              <input disabled={!canManageAutomation} value={selectedNode.title} onChange={(event) => updateSelectedNode("title", event.target.value)} />
            </label>
            <label>
              <span>Каналы</span>
              <input disabled={!canManageAutomation} value={selectedNode.channel} onChange={(event) => updateSelectedNode("channel", event.target.value)} />
            </label>
            <label>
              <span>Логика</span>
              <textarea disabled={!canManageAutomation} value={selectedNode.detail} onChange={(event) => updateSelectedNode("detail", event.target.value)} />
            </label>
            <footer>
              <button disabled={!canManageAutomation} onClick={handleAddNode} title={canManageAutomation ? "Добавить ноду" : access.reason} type="button">
                <Plus size={16} />
                Нода
              </button>
              <button disabled={!canManageAutomation} onClick={() => onToast(`${selectedScenario.name}: изменения сохранены в черновике.`)} title={canManageAutomation ? "Сохранить сценарий" : access.reason} type="button">
                <CheckCircle2 size={16} />
                Сохранить
              </button>
            </footer>
            <div className="bot-validation-list">
              <strong>Validation</strong>
              {(selectedScenario.validationRules ?? []).map((rule) => <span key={rule}>{rule}</span>)}
              <strong>Test cases</strong>
              {(selectedScenario.testCases ?? []).map((test) => <span key={test.id}>{test.name} {"->"} {test.expected}</span>)}
            </div>
          </aside>

          <aside className="bot-preview-panel">
            <div className="bot-transcript-preview">
              <header>
                <Sparkles size={17} />
                <strong>Transcript preview</strong>
              </header>
              {selectedScenario.previewMessages.map((message, index) => (
                <div className={`bot-preview-message ${message.side ?? (message.speaker === "Клиент" ? "client" : "bot")}`} key={`${message.speaker}-${index}`}>
                  <span>{message.speaker} · {message.time ?? `00:0${index + 1}`}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            <div className="bot-io-panel">
              <header>
                <FileText size={17} />
                <strong>Import / Export</strong>
              </header>
              <textarea readOnly value={exportPayload} aria-label="JSON export сценария" />
              <textarea disabled={!canManageAutomation} value={importDraft} onChange={(event) => setImportDraft(event.target.value)} placeholder="Вставьте JSON flow для импорта" />
              {importError ? (
                <div className="bot-import-error">
                  <AlertTriangle size={15} />
                  {importError}
                </div>
              ) : null}
              <footer>
                <button disabled={!canManageAutomation} onClick={() => setImportDraft(exportPayload)} title={canManageAutomation ? "Скопировать export в импорт" : access.reason} type="button">Вставить export</button>
                <button disabled={!canManageAutomation} onClick={handleImportFlow} title={canManageAutomation ? "Импортировать flow" : access.reason} type="button">Импорт</button>
                <button disabled={!canManageAutomation} onClick={handleExportFlowDownload} title={canManageAutomation ? "Экспортировать JSON" : access.reason} type="button">
                  <Download size={15} />
                  Export
                </button>
              </footer>
            </div>
          </aside>
        </div>
      </section>
    </ProductScreen>
  );
}

export function ReportsScreen({ onBack, onToast, access }) {
  const [period, setPeriod] = useState("Сегодня");
  const [channel, setChannel] = useState("Все каналы");
  const [reportType, setReportType] = useState("Ежедневный");
  const [operatorFilter, setOperatorFilter] = useState("Все операторы");
  const [topicFilter, setTopicFilter] = useState("Все тематики");
  const [teamFilter, setTeamFilter] = useState("Все команды");
  const [statusFilter, setStatusFilter] = useState("Все статусы");
  const [slaFilter, setSlaFilter] = useState("Все SLA");
  const [dialogTypeFilter, setDialogTypeFilter] = useState("Все типы");
  const [selectedColumns, setSelectedColumns] = useState(reportColumnOptions.map((column) => column.id));
  const [reportExportJobs, setReportExportJobs] = useState(exportJobs);
  const visibleReportColumns = reportColumnOptions.filter((column) => selectedColumns.includes(column.id));
  const reportOperatorOptions = ["Все операторы", ...operators.map((operator) => operator.name)];
  const reportTopicOptions = ["Все тематики", ...topicOptions.slice(0, 8)];

  function toggleReportColumn(columnId) {
    const column = reportColumnOptions.find((item) => item.id === columnId);
    if (column?.locked) {
      return;
    }

    setSelectedColumns((current) => current.includes(columnId)
      ? current.filter((id) => id !== columnId)
      : [...current, columnId]
    );
  }

  function handleCreateExport() {
    if (!access.canExportReports) {
      return;
    }

    const nextJob = {
      id: `export-${Date.now()}`,
      name: `${reportType}: ${channel}`,
      format: "XLSX",
      period,
      statusKey: "queued",
      status: "В очереди",
      progress: 8,
      requestedBy: "Текущий оператор",
      createdAt: "сейчас",
      rows: 0,
      auditId: `audit-${Math.floor(9000 + Math.random() * 900)}`
    };

    setReportExportJobs((current) => [nextJob, ...current]);
    onToast(`Выгрузка XLSX за период "${period}" поставлена в очередь.`);
  }

  function handleApplyFilters() {
    onToast(`Фильтр применен: ${reportType}, ${period}, ${channel}, ${operatorFilter}, ${topicFilter}, ${teamFilter}, ${statusFilter}, ${slaFilter}, ${dialogTypeFilter}.`);
  }

  function handleExportRetry(jobId) {
    if (!access.canExportReports) {
      return;
    }

    setReportExportJobs((current) => current.map((job) => job.id === jobId
      ? { ...job, statusKey: "running", status: "Повторная подготовка", progress: 28, rows: job.rows || 486 }
      : job
    ));
    onToast("Экспорт поставлен на повторную подготовку.");
  }

  function handleExportDownload(job) {
    if (!access.canExportReports) {
      return;
    }

    onToast(`${job.name}: файл ${job.format} готов к скачиванию.`);
  }

  function getReportCell(row, columnId) {
    if (columnId === "metric") return <strong>{row.metric}</strong>;
    if (columnId === "today") return <span>{row.today}</span>;
    if (columnId === "previous") return <span>{row.previous}</span>;
    if (columnId === "delta") return <b>{row.delta}</b>;
    return <span>{row.status}</span>;
  }

  return (
    <ProductScreen
      title="Отчеты"
      subtitle="Ежедневный отчет, дайджест и выгрузка всех показателей, которые видны в интерфейсе."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: reportRows.length,
        empty: `${reportRows.length} метрик`,
        emptyWhenZero: "метрик нет",
        errors: reportExportJobs.filter((job) => job.statusKey === "error").length,
        errorLabel: "ошибок экспорта нет"
      })}
      actions={
        <>
          <select className="inline-select" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {["Сегодня", "Вчера", "7 дней", "30 дней"].map((option) => <option key={option}>{option}</option>)}
          </select>
          <select className="inline-select" value={reportType} onChange={(event) => setReportType(event.target.value)} aria-label="Тип отчета">
            {["Ежедневный", "Дайджест", "CSAT/CSI", "SLA", "Операторы"].map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className="primary-action" disabled={!access.canExportReports} onClick={handleCreateExport} title={access.canExportReports ? "Экспорт XLSX" : access.reason}>
            <Download size={17} />
            Экспорт XLSX
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<ClipboardList size={21} />} label="Новых" value="486" detail="+11% к прошлому" />
        <MetricTile icon={<CheckCircle2 size={21} />} label="Закрыто" value="451" detail="93% обработано" />
        <MetricTile icon={<Clock3 size={21} />} label="Первый ответ" value="01:36" detail="лучше на 16 сек" />
        <MetricTile icon={<Gauge size={21} />} label="SLA" value="91%" detail="+4 п.п." />
      </div>

      <div className="screen-toolbar report-toolbar">
        <select className="inline-select" value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Канал отчета">
          {["Все каналы", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={operatorFilter} onChange={(event) => setOperatorFilter(event.target.value)} aria-label="Оператор отчета">
          {reportOperatorOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} aria-label="Тематика отчета">
          {reportTopicOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} aria-label="Команда отчета">
          {reportTeamOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Статус диалога в отчете">
          {reportStatusOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={slaFilter} onChange={(event) => setSlaFilter(event.target.value)} aria-label="SLA отчета">
          {reportSlaOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <select className="inline-select" value={dialogTypeFilter} onChange={(event) => setDialogTypeFilter(event.target.value)} aria-label="Тип диалога в отчете">
          {reportDialogTypeOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <button onClick={handleApplyFilters} type="button"><Filter size={17} /> Применить</button>
        <button onClick={() => onToast("История экспортов открыта.")} type="button"><CalendarDays size={17} /> История</button>
      </div>

      <div className="reports-layout">
        <section className="work-panel">
          <SectionTitle title="Каналы" action="Доля новых обращений" />
          <div className="bar-list">
            {reportBars.map(([label, value]) => (
              <div className="bar-row" key={label}>
                <ChannelBadge channel={label} />
                <div><i style={{ width: `${value}%` }} /></div>
                <b>{value}%</b>
              </div>
            ))}
          </div>
        </section>
        <section className="work-panel">
          <SectionTitle title="Дайджест руководителя" action="Автообновление 18:00" />
          <div className="digest-list">
            <p><b>Главный риск:</b> VK просел по SLA до 68%, очередь требует перераспределения.</p>
            <p><b>Топ тематика:</b> доставка и статус заказа, 34% всех обращений.</p>
            <p><b>Контроль качества:</b> низких оценок 7, все попали в фильтр старшего.</p>
          </div>
        </section>
      </div>

      <section className="work-panel report-charts-panel">
        <SectionTitle title="Chart-блоки отчета" action="нагрузка, SLA, качество, rescue" />
        <div className="report-chart-grid">
          {reportChartBlocks.map((chart) => (
            <article className={`report-chart-card ${chart.tone}`} key={chart.id}>
              <header>
                <strong>{chart.title}</strong>
                <span>{chart.delta}</span>
              </header>
              <b>{chart.value}</b>
              <div className="mini-chart" aria-label={chart.title}>
                {chart.points.map((point, index) => (
                  <i style={{ height: `${Math.max(18, point)}%` }} key={`${chart.id}-${index}`} />
                ))}
              </div>
              <footer>
                {chart.legend.map((item) => <span key={item}>{item}</span>)}
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="work-panel rescue-report-panel">
        <SectionTitle title="Спасенные и пропущенные" action="rescue timer outcomes" />
        <div className="rescue-outcome-summary">
          {rescueOutcomeSummary.map((item) => (
            <article className={`rescue-outcome-card ${item.tone}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
        <div className="rescue-report-list">
          <div className="rescue-report-head">
            <span>Клиент</span>
            <span>Канал</span>
            <span>Timer</span>
            <span>Outcome</span>
            <span>Решение</span>
          </div>
          {rescueReportRows.map((row) => (
            <article className={`rescue-report-row ${row.outcome === "Пропущен" ? "missed" : "saved"}`} key={row.id}>
              <div>
                <strong>{row.client}</strong>
                <small>{row.operator} · {row.reason}</small>
              </div>
              <ChannelBadge channel={row.channel} />
              <b>{row.timer}</b>
              <StatusBadge tone={row.outcome === "Пропущен" ? "warn" : "ok"}>{row.outcome}</StatusBadge>
              <p>{row.resolution}<small>{row.digest}</small></p>
            </article>
          ))}
        </div>
      </section>

      <section className="work-panel report-columns-panel">
        <SectionTitle title="Состав колонок выгрузки" action={`${selectedColumns.length} из ${reportColumnOptions.length}`} />
        <div className="report-column-controls">
          {reportColumnOptions.map((column) => (
            <label key={column.id}>
              <input
                checked={selectedColumns.includes(column.id)}
                disabled={column.locked}
                onChange={() => toggleReportColumn(column.id)}
                type="checkbox"
              />
              <span>{column.label}</span>
              {column.locked ? <b>обязательная</b> : null}
            </label>
          ))}
        </div>
      </section>

      <div className="entity-table report-table">
        <div className="entity-head report-dynamic-row" style={{ gridTemplateColumns: `minmax(220px, 1fr) repeat(${Math.max(0, visibleReportColumns.length - 1)}, minmax(110px, 0.7fr))` }}>
          {visibleReportColumns.map((column) => <span key={column.id}>{column.label}</span>)}
        </div>
        {reportRows.map((row) => (
          <div className="entity-row report-dynamic-row" key={row.metric} style={{ gridTemplateColumns: `minmax(220px, 1fr) repeat(${Math.max(0, visibleReportColumns.length - 1)}, minmax(110px, 0.7fr))` }}>
            {visibleReportColumns.map((column) => <React.Fragment key={column.id}>{getReportCell(row, column.id)}</React.Fragment>)}
          </div>
        ))}
      </div>

      <section className="work-panel export-queue-panel">
        <SectionTitle title="Очередь и история выгрузок" action="каждый экспорт фиксируется в audit" />
        <div className="export-job-list">
          {reportExportJobs.map((job) => (
            <article className={`export-job ${job.statusKey === "error" ? "danger" : ""}`} key={job.id}>
              <header>
                <strong>{job.name}</strong>
                <StatusBadge tone={exportStatusClasses[job.statusKey] ?? "info"}>{job.status}</StatusBadge>
              </header>
              <div className="health-bar"><i style={{ width: `${job.progress}%` }} /></div>
              <footer>
                <span>{job.format} · {job.period} · {job.rows} строк</span>
                <div className="export-actions">
                  <button disabled={!access.canExportReports} onClick={() => onToast(`${job.name}: audit ${job.auditId}`)} title={access.canExportReports ? "Открыть audit" : access.reason} type="button">Audit</button>
                  {job.statusKey === "ready" ? (
                    <button disabled={!access.canExportReports} onClick={() => handleExportDownload(job)} title={access.canExportReports ? "Скачать файл" : access.reason} type="button">
                      <Download size={15} />
                      Скачать
                    </button>
                  ) : null}
                  {job.statusKey === "error" ? (
                    <button disabled={!access.canExportReports} onClick={() => handleExportRetry(job.id)} title={access.canExportReports ? "Повторить экспорт" : access.reason} type="button">
                      <PlayCircle size={15} />
                      Retry
                    </button>
                  ) : null}
                  {job.statusKey === "expired" ? (
                    <button disabled={!access.canExportReports} onClick={() => handleExportRetry(job.id)} title={access.canExportReports ? "Сгенерировать заново" : access.reason} type="button">
                      <PlayCircle size={15} />
                      Сгенерировать
                    </button>
                  ) : null}
                  {job.statusKey === "queued" || job.statusKey === "running" ? (
                    <button disabled type="button">В процессе</button>
                  ) : null}
                </div>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </ProductScreen>
  );
}

export function SettingsScreen({ onBack, onToast, access, roleMode, onRoleMode }) {
  const [channels, setChannels] = useState(channelSettings);
  const [topicDirectory, setTopicDirectory] = useState(topicDirectorySeed);
  const [topicQuery, setTopicQuery] = useState("");
  const [topicStatusFilter, setTopicStatusFilter] = useState("Все");
  const [selectedChannelId, setSelectedChannelId] = useState(channelDetails[0].id);
  const [channelLogSeverity, setChannelLogSeverity] = useState("all");
  const [channelLogConnection, setChannelLogConnection] = useState("all");
  const [channelTestMode, setChannelTestMode] = useState("receive");
  const [channelTestRecipient, setChannelTestRecipient] = useState("+7 999 000-00-00");
  const [channelTestMessage, setChannelTestMessage] = useState("Тестовое сообщение из панели канала");
  const [channelTestResult, setChannelTestResult] = useState(null);
  const [employeeRules, setEmployeeRules] = useState(employeeChannelRules);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employeeChannelRules[0].id);
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [sdkPlaygroundEvent, setSdkPlaygroundEvent] = useState(sdkEvents[0][0]);
  const [sdkPlaygroundEnv, setSdkPlaygroundEnv] = useState("production");
  const [sdkPlaygroundChannel, setSdkPlaygroundChannel] = useState("SDK");
  const [sdkPlaygroundUser, setSdkPlaygroundUser] = useState("gig-olga-0940");
  const [sdkPlaygroundPhone, setSdkPlaygroundPhone] = useState("+7 985 430-09-40");
  const [sdkPlaygroundMessage, setSdkPlaygroundMessage] = useState("Здравствуйте, проверяем запуск диалога из SDK.");
  const [sdkPlaygroundResult, setSdkPlaygroundResult] = useState(null);
  const canEditSettings = access.canManageSettings;
  const canEditEmployeeDirectory = canEditSettings;
  const canResetEmployeePassword = canEditSettings || roleMode === "Старший сотрудник";
  const normalizedTopicQuery = topicQuery.trim().toLowerCase();
  const selectedChannel = channelDetails.find((channel) => channel.id === selectedChannelId) ?? channelDetails[0];
  const selectedEmployee = employeeRules.find((employee) => employee.id === selectedEmployeeId) ?? employeeRules[0];

  const topicTotals = useMemo(() => {
    return topicDirectory.reduce((totals, group) => {
      group.branches.forEach((branch) => {
        branch.children.forEach((topic) => {
          totals.total += 1;
          if (topic.archived) {
            totals.archived += 1;
          } else {
            totals.active += 1;
          }
        });
      });
      return totals;
    }, { active: 0, archived: 0, total: 0 });
  }, [topicDirectory]);

  const visibleTopicDirectory = useMemo(() => {
    function statusMatches(topic) {
      if (topicStatusFilter === "Активные") {
        return !topic.archived;
      }
      if (topicStatusFilter === "Архив") {
        return topic.archived;
      }
      return true;
    }

    return topicDirectory.map((group) => {
      const branches = group.branches.map((branch) => {
        const branchMatches = [group.name, group.owner, group.description, branch.name].join(" ").toLowerCase().includes(normalizedTopicQuery);
        const children = branch.children.filter((topic) => {
          const haystack = [
            group.name,
            group.owner,
            group.description,
            branch.name,
            topic.name,
            topic.routing,
            topic.access,
            ...topic.channels
          ].join(" ").toLowerCase();
          return statusMatches(topic) && (!normalizedTopicQuery || branchMatches || haystack.includes(normalizedTopicQuery));
        });
        return { ...branch, children };
      }).filter((branch) => branch.children.length > 0);

      if (!branches.length) {
        return null;
      }

      return { ...group, branches };
    }).filter(Boolean);
  }, [normalizedTopicQuery, topicDirectory, topicStatusFilter]);

  const visibleChannelLogs = useMemo(() => {
    return selectedChannel.logs.filter((log) => {
      const severityMatches = channelLogSeverity === "all" || log.severity === channelLogSeverity;
      const connectionMatches = channelLogConnection === "all" || log.connectionId === channelLogConnection;
      return severityMatches && connectionMatches;
    });
  }, [channelLogConnection, channelLogSeverity, selectedChannel]);

  const visibleEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    if (!query) {
      return employeeRules;
    }

    return employeeRules.filter((employee) => [
      employee.employee,
      employee.role,
      employee.group,
      employee.passwordStatus,
      ...employee.channels
    ].join(" ").toLowerCase().includes(query));
  }, [employeeQuery, employeeRules]);

  const sdkPayloadPreview = useMemo(() => {
    const base = {
      appId: sdkPlaygroundEnv === "production" ? "gig-app-prod" : "gig-app-stage",
      event: sdkPlaygroundEvent,
      channel: sdkPlaygroundChannel,
      userId: sdkPlaygroundUser,
      timestamp: "2026-06-26T12:00:00+03:00"
    };

    if (sdkPlaygroundEvent === "identifyUser") {
      return {
        ...base,
        payload: {
          phone: sdkPlaygroundPhone,
          device: sdkPlaygroundChannel === "SDK" ? "iOS 17" : "external",
          entryPoint: sdkPlaygroundChannel
        }
      };
    }

    if (sdkPlaygroundEvent === "initConversation") {
      return {
        ...base,
        payload: {
          phone: sdkPlaygroundPhone,
          topic: "Оплата / Возврат",
          message: sdkPlaygroundMessage,
          operatorId: "auto"
        }
      };
    }

    if (sdkPlaygroundEvent === "trackEntryPoint") {
      return {
        ...base,
        payload: {
          source: sdkPlaygroundChannel,
          screen: "order_status",
          utm: "support_entry"
        }
      };
    }

    return {
      ...base,
      payload: {
        topic: "Оплата / Возврат",
        requiredForClose: true,
        source: sdkPlaygroundChannel
      }
    };
  }, [sdkPlaygroundChannel, sdkPlaygroundEnv, sdkPlaygroundEvent, sdkPlaygroundMessage, sdkPlaygroundPhone, sdkPlaygroundUser]);

  function toggleChannel(name) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, enabled: !channel.enabled } : channel));
  }

  function updateLimit(name, limit) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, limit } : channel));
  }

  function updateSelectedEmployee(field, value) {
    if (!canEditEmployeeDirectory) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => employee.id === selectedEmployee.id ? { ...employee, [field]: value } : employee));
  }

  function toggleSelectedEmployeeChannel(channelName) {
    if (!canEditEmployeeDirectory) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => {
      if (employee.id !== selectedEmployee.id) {
        return employee;
      }

      const channels = employee.channels.includes(channelName)
        ? employee.channels.filter((channel) => channel !== channelName)
        : [...employee.channels, channelName];
      return { ...employee, channels };
    }));
  }

  function handlePasswordReset(employeeName) {
    if (!canResetEmployeePassword) {
      return;
    }

    setEmployeeRules((current) => current.map((employee) => employee.employee === employeeName
      ? { ...employee, passwordStatus: "Сброс отправлен" }
      : employee
    ));
    onToast(`${employeeName}: ссылка для смены пароля отправлена и попадет в audit.`);
  }

  function handleTopicArchive(groupId, branchId, topicId) {
    if (!canEditSettings) {
      return;
    }

    let toastMessage = "";
    const nextDirectory = topicDirectory.map((group) => {
      if (group.id !== groupId) {
        return group;
      }

      return {
        ...group,
        branches: group.branches.map((branch) => {
          if (branch.id !== branchId) {
            return branch;
          }

          return {
            ...branch,
            children: branch.children.map((topic) => {
              if (topic.id !== topicId) {
                return topic;
              }

              const archived = !topic.archived;
              toastMessage = `${group.name} / ${topic.name}: ${archived ? "перемещена в архив" : "восстановлена"}. Audit-событие подготовлено.`;
              return { ...topic, archived };
            })
          };
        })
      };
    });

    setTopicDirectory(nextDirectory);
    if (toastMessage) {
      onToast(toastMessage);
    }
  }

  function handleTopicEdit(groupName, topicName) {
    onToast(canEditSettings ? `${groupName} / ${topicName}: карточка редактирования открыта.` : access.reason);
  }

  function handleChannelSelect(channelId) {
    setSelectedChannelId(channelId);
    setChannelLogSeverity("all");
    setChannelLogConnection("all");
    setChannelTestResult(null);
  }

  function handleChannelTest() {
    if (!canEditSettings) {
      return;
    }

    const message = channelTestMessage.trim();
    const recipient = channelTestRecipient.trim();
    if (!recipient || !message) {
      setChannelTestResult({
        tone: "error",
        title: "Заполните адресата и сообщение",
        raw: "{ \"ok\": false, \"error\": \"recipient_and_message_required\" }"
      });
      return;
    }

    const raw = {
      ok: true,
      channel: selectedChannel.channel,
      direction: channelTestMode,
      connection: selectedChannel.connections[0].rawId,
      recipient,
      requestId: `test_${selectedChannel.id}_${Date.now().toString().slice(-5)}`,
      status: channelTestMode === "receive" ? "accepted_to_queue" : "sent_to_channel"
    };
    setChannelTestResult({
      tone: "success",
      title: channelTestMode === "receive" ? "Входящее тестовое сообщение принято" : "Исходящее тестовое сообщение отправлено",
      raw: JSON.stringify(raw, null, 2)
    });
    onToast(`${selectedChannel.channel}: тест ${channelTestMode === "receive" ? "приема" : "отправки"} выполнен.`);
  }

  function handleSdkPlaygroundRun() {
    if (!canEditSettings) {
      return;
    }

    const requiresPhone = ["identifyUser", "initConversation"].includes(sdkPlaygroundEvent);
    const requiresMessage = sdkPlaygroundEvent === "initConversation";
    if ((requiresPhone && !sdkPlaygroundPhone.trim()) || (requiresMessage && !sdkPlaygroundMessage.trim())) {
      setSdkPlaygroundResult({
        tone: "error",
        title: "Payload не прошел валидацию",
        response: "{ \"ok\": false, \"error\": \"phone_or_message_required\" }"
      });
      return;
    }

    const response = {
      ok: true,
      event: sdkPlaygroundEvent,
      environment: sdkPlaygroundEnv,
      requestId: `sdk_${sdkPlaygroundEvent}_${Date.now().toString().slice(-5)}`,
      acceptedAt: "2026-06-26T12:00:02+03:00",
      route: sdkPlaygroundEvent === "initConversation" ? "outbound_queue" : "event_stream"
    };
    setSdkPlaygroundResult({
      tone: "success",
      title: "Payload принят тестовым стендом",
      response: JSON.stringify(response, null, 2)
    });
    onToast(`SDK playground: ${sdkPlaygroundEvent} выполнен в ${sdkPlaygroundEnv}.`);
  }

  return (
    <ProductScreen
      title="Настройки"
      subtitle="Права, каналы, лимиты операторов, маршрутизация и обязательные правила закрытия."
      onBack={onBack}
      stateItems={createScreenStateItems({
        total: channels.length,
        empty: `${channels.length} каналов`,
        emptyWhenZero: "каналы не настроены",
        errors: channelDetails.flatMap((channel) => channel.logs).filter((log) => log.severity === "error").length,
        errorLabel: "критичных ошибок нет"
      })}
      actions={
        <button className="primary-action" disabled={!canEditSettings} onClick={() => onToast("Настройки сохранены и попадут в аудит.")}>
          <ShieldCheck size={17} />
          Сохранить
        </button>
      }
    >
      <div className="role-mode-panel">
        <div>
          <strong>Проверка интерфейса по роли</strong>
          <span>{canEditSettings ? "Полный доступ к общим настройкам" : "Общие настройки доступны только на чтение"}</span>
        </div>
        <div className="segmented-control" role="group" aria-label="Текущая роль">
          {["Сотрудник", "Старший сотрудник", "Администратор"].map((role) => (
              <button
                className={roleMode === role ? "active" : ""}
                key={role}
                onClick={() => onRoleMode(role)}
                type="button"
              >
              {role}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-layout">
        <section className="work-panel">
          <SectionTitle title="Матрица ролей" action="Серверная проверка прав" />
          <div className="role-table">
            <div className="role-head">
              <span>Роль</span>
              <span>Панель</span>
              <span>Настройки</span>
              <span>Пароли</span>
              <span>Отчеты</span>
            </div>
            {roles.map((role) => (
              <div className="role-row" key={role.name}>
                <strong>{role.name}</strong>
                <Permission enabled={role.panel} />
                <Permission enabled={role.settings} />
                <Permission enabled={role.reset} />
                <span>{role.reports}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="work-panel">
          <SectionTitle title="Каналы и лимиты" action="На одного оператора" />
          <div className="channel-settings">
            {channels.map((channel) => (
              <article key={channel.name}>
                <button
                  aria-label={`Переключить ${channel.name}`}
                  aria-pressed={channel.enabled}
                  className="toggle-button"
                  disabled={!canEditSettings}
                  onClick={() => toggleChannel(channel.name)}
                  title={`Переключить ${channel.name}`}
                  type="button"
                >
                  {channel.enabled ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
                </button>
                <ChannelBadge channel={channel.name} />
                <span>{channel.staff} сотрудников</span>
                <label>
                  <span>Лимит</span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={channel.limit}
                    disabled={!canEditSettings}
                    onChange={(event) => updateLimit(channel.name, Number(event.target.value))}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="work-panel employee-rules-panel">
        <SectionTitle title="Каналы и лимиты по сотрудникам" action="исключения и маскирование данных" />
        <div className="employee-management">
          <div className="employee-directory">
            <ToolbarSearch
              ariaLabel="Поиск сотрудника"
              className="employee-search"
              iconSize={17}
              placeholder="Сотрудник, роль, группа, канал"
              value={employeeQuery}
              onChange={setEmployeeQuery}
            />
            <div className="employee-selector-list">
              {visibleEmployees.map((employee) => (
                <button
                  aria-pressed={selectedEmployee.id === employee.id}
                  className={selectedEmployee.id === employee.id ? "selected" : ""}
                  data-employee-id={employee.id}
                  key={employee.id}
                  onClick={() => setSelectedEmployeeId(employee.id)}
                  type="button"
                >
                  <strong>{employee.employee}</strong>
                  <span>{employee.role} · {employee.group}</span>
                  <ChannelList channels={employee.channels} />
                </button>
              ))}
              {!visibleEmployees.length ? (
                <div className="employee-empty">Сотрудники не найдены.</div>
              ) : null}
            </div>
          </div>

          <div className="employee-editor">
            <header>
              <div>
                <strong>{selectedEmployee.employee}</strong>
                <span>{selectedEmployee.role} · {selectedEmployee.lastLogin}</span>
              </div>
              <button
                disabled={!canResetEmployeePassword}
                onClick={() => handlePasswordReset(selectedEmployee.employee)}
                title={canResetEmployeePassword ? "Сбросить пароль сотруднику" : access.reason}
                type="button"
              >
                <KeyRound size={16} />
                Сбросить пароль
              </button>
            </header>
            <div className="employee-editor-grid">
              <label>
                <span>Роль</span>
                <select disabled={!canEditEmployeeDirectory} value={selectedEmployee.role} onChange={(event) => updateSelectedEmployee("role", event.target.value)} title={canEditEmployeeDirectory ? "Изменить роль" : access.reason}>
                  {["Сотрудник", "Старший сотрудник", "Администратор"].map((role) => <option key={role}>{role}</option>)}
                </select>
              </label>
              <label>
                <span>Группа</span>
                <select disabled={!canEditEmployeeDirectory} value={selectedEmployee.group} onChange={(event) => updateSelectedEmployee("group", event.target.value)} title={canEditEmployeeDirectory ? "Назначить группу" : access.reason}>
                  {employeeGroups.map((group) => <option value={group.name} key={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label>
                <span>Лимит чатов</span>
                <input disabled={!canEditEmployeeDirectory} min="1" max="30" type="number" value={selectedEmployee.chatLimit} onChange={(event) => updateSelectedEmployee("chatLimit", Number(event.target.value))} title={canEditEmployeeDirectory ? "Изменить лимит сотрудника" : access.reason} />
              </label>
              <div>
                <span>Пароль</span>
                <strong>{selectedEmployee.passwordStatus}</strong>
              </div>
            </div>
            <div className="employee-channel-editor" aria-label="Каналы сотрудника">
              {["SDK", "Telegram", "MAX", "VK"].map((channelName) => (
                <label key={channelName}>
                  <input
                    checked={selectedEmployee.channels.includes(channelName)}
                    disabled={!canEditEmployeeDirectory}
                    onChange={() => toggleSelectedEmployeeChannel(channelName)}
                    title={canEditEmployeeDirectory ? `Переключить канал ${channelName}` : access.reason}
                    type="checkbox"
                  />
                  <ChannelBadge channel={channelName} />
                </label>
              ))}
            </div>
            <div className="employee-permission-toggles">
              <label>
                <input
                  checked={selectedEmployee.canOverride}
                  disabled={!canEditEmployeeDirectory}
                  onChange={(event) => updateSelectedEmployee("canOverride", event.target.checked)}
                  title={canEditEmployeeDirectory ? "Разрешить override" : access.reason}
                  type="checkbox"
                />
                <span>Override очереди</span>
              </label>
              <label>
                <input
                  checked={selectedEmployee.sensitiveData}
                  disabled={!canEditEmployeeDirectory}
                  onChange={(event) => updateSelectedEmployee("sensitiveData", event.target.checked)}
                  title={canEditEmployeeDirectory ? "Показывать чувствительные данные" : access.reason}
                  type="checkbox"
                />
                <span>Чувствительные данные</span>
              </label>
            </div>
            <footer>
              <span>{canEditEmployeeDirectory ? "Изменения попадут в audit после сохранения." : `${roleMode}: можно смотреть карточку сотрудника${canResetEmployeePassword ? " и сбрасывать пароль." : "."}`}</span>
              <button
                disabled={!canEditEmployeeDirectory}
                onClick={() => onToast(`${selectedEmployee.employee}: настройки сотрудника сохранены.`)}
                title={canEditEmployeeDirectory ? "Сохранить сотрудника" : access.reason}
                type="button"
              >
                <ShieldCheck size={16} />
                Сохранить
              </button>
            </footer>
          </div>
        </div>
        <div className="employee-group-strip" aria-label="Группы сотрудников">
          {employeeGroups.map((group) => (
            <div key={group.id}>
              <strong>{group.name}</strong>
              <span>{group.members} сотрудников · {group.scope}</span>
            </div>
          ))}
        </div>
        <div className="employee-rule-list">
          {employeeRules.map((rule) => (
            <article className="employee-rule" key={rule.id}>
              <header>
                <strong>{rule.employee}</strong>
                <span>{rule.role} · {rule.group}</span>
                <b>{rule.chatLimit} чатов</b>
              </header>
              <ChannelList channels={rule.channels} />
              <p>{rule.exceptions.join("; ")}</p>
              <footer>
                <span>{rule.canOverride ? "может override" : "без override"}</span>
                <span>{rule.sensitiveData ? "видит чувствительные данные" : "данные маскированы"}</span>
                <span>{rule.passwordStatus}</span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="work-panel topic-directory-panel">
        <SectionTitle title="Справочник тематик" action={`${topicTotals.active} активных / ${topicTotals.archived} архив`} />
        <div className="topic-directory-toolbar">
          <ToolbarSearch
            ariaLabel="Поиск по справочнику тематик"
            className="topic-search"
            iconSize={17}
            placeholder="Поиск по теме, каналу, владельцу"
            value={topicQuery}
            onChange={setTopicQuery}
          />
          <div className="segmented-control topic-filter" role="group" aria-label="Статус тематики">
            {topicStatusFilters.map((filter) => (
              <button
                aria-pressed={topicStatusFilter === filter}
                className={topicStatusFilter === filter ? "active" : ""}
                key={filter}
                onClick={() => setTopicStatusFilter(filter)}
                type="button"
              >
                {filter}
              </button>
            ))}
          </div>
          <button
            className="topic-add-button"
            disabled={!canEditSettings}
            onClick={() => onToast("Новая тематика: карточка создания открыта.")}
            title={canEditSettings ? "Добавить тематику" : access.reason}
            type="button"
          >
            <Plus size={16} />
            Добавить
          </button>
        </div>
        <div className="topic-rights-note">
          <ShieldCheck size={17} />
          <span>{canEditSettings ? "Администратор может создавать, редактировать, архивировать и восстанавливать тематики." : `${roleMode}: просмотр справочника без изменения общих настроек.`}</span>
        </div>
        <div className="topic-tree-list">
          {visibleTopicDirectory.map((group) => (
            <article className="topic-group" key={group.id}>
              <header>
                <div>
                  <strong>{group.name}</strong>
                  <span>{group.description}</span>
                </div>
                <div className="topic-group-meta">
                  <span>{group.owner}</span>
                  <b>{group.branches.reduce((sum, branch) => sum + branch.children.length, 0)} тем</b>
                </div>
              </header>
              {group.branches.map((branch) => (
                <div className="topic-branch" key={branch.id}>
                  <div className="topic-branch-title">
                    <span>{branch.name}</span>
                    <small>{branch.children.length} видимых</small>
                  </div>
                  <div className="topic-row-list">
                    {branch.children.map((topic) => (
                      <div className={`topic-row ${topic.archived ? "archived" : ""}`} data-topic-id={topic.id} key={topic.id}>
                        <div className="topic-path">
                          <Tag size={16} />
                          <div>
                            <strong>{topic.name}</strong>
                            <span>{group.name} / {branch.name} / {topic.name}</span>
                          </div>
                        </div>
                        <ChannelList channels={topic.channels} />
                        <div className="topic-state">
                          <span className={topic.archived ? "archived" : "active"}>{topic.archived ? "Архив" : "Активна"}</span>
                          <small>{topic.required ? "обязательная" : "необязательная"}</small>
                        </div>
                        <div className="topic-routing">
                          <strong>{topic.routing}</strong>
                          <span>{topic.access}</span>
                        </div>
                        <div className="topic-actions">
                          <button
                            aria-label={`Редактировать: ${group.name} / ${topic.name}`}
                            data-topic-action="edit"
                            disabled={!canEditSettings}
                            onClick={() => handleTopicEdit(group.name, topic.name)}
                            title={canEditSettings ? "Редактировать тематику" : access.reason}
                            type="button"
                          >
                            <Pencil size={15} />
                            Редактировать
                          </button>
                          <button
                            aria-label={`${topic.archived ? "Вернуть" : "В архив"}: ${group.name} / ${topic.name}`}
                            aria-pressed={topic.archived}
                            data-topic-action="archive"
                            disabled={!canEditSettings}
                            onClick={() => handleTopicArchive(group.id, branch.id, topic.id)}
                            title={canEditSettings ? (topic.archived ? "Вернуть тематику из архива" : "Переместить тематику в архив") : access.reason}
                            type="button"
                          >
                            {topic.archived ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            {topic.archived ? "Вернуть" : "В архив"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </article>
          ))}
          {!visibleTopicDirectory.length && (
            <div className="topic-empty">
              <Search size={18} />
              <strong>Тематики не найдены</strong>
              <span>Измените запрос или фильтр статуса.</span>
            </div>
          )}
        </div>
      </section>

      <div className="integration-layout">
        <section className="work-panel channel-connections-panel">
          <SectionTitle title="Подключения" action={`${selectedChannel.channel}: детализация канала`} />
          <div className="integration-cards channel-card-list">
            {channelDetails.map((integration) => (
              <button
                aria-pressed={selectedChannelId === integration.id}
                className={`integration-card channel-card ${selectedChannelId === integration.id ? "selected" : ""}`}
                data-channel-card={integration.id}
                key={integration.id}
                onClick={() => handleChannelSelect(integration.id)}
                type="button"
              >
                <header>
                  <ChannelBadge channel={integration.channel} />
                  <strong>{integration.name}</strong>
                  <span>{integration.status}</span>
                </header>
                <p>{integration.detail}</p>
                <div className="health-bar"><i style={{ width: `${integration.health}%` }} /></div>
                <footer>
                  <span>{integration.health}% health</span>
                  <b>{integration.connections.length} подключения</b>
                </footer>
              </button>
            ))}
          </div>
          <div className="channel-detail-surface">
            <header className="channel-detail-head">
              <div>
                <ChannelBadge channel={selectedChannel.channel} />
                <strong>{selectedChannel.name}</strong>
                <span>{selectedChannel.status} · синхронизация {selectedChannel.lastSync}</span>
              </div>
              <button
                disabled={!canEditSettings}
                onClick={() => onToast(`${selectedChannel.name}: проверка подключения запущена.`)}
                title={canEditSettings ? "Проверить канал" : access.reason}
                type="button"
              >
                <PlayCircle size={16} />
                Проверить канал
              </button>
            </header>
            <div className="channel-detail-grid">
              <div>
                <span>Raw ID</span>
                <strong>{selectedChannel.rawId}</strong>
              </div>
              <div>
                <span>Маршрутизация</span>
                <strong>{selectedChannel.route}</strong>
              </div>
              <div>
                <span>Лимит</span>
                <strong>{selectedChannel.limit}</strong>
              </div>
              <div>
                <span>Сотрудники</span>
                <strong>{selectedChannel.employees}</strong>
              </div>
            </div>
            <div className="channel-group-list" aria-label="Группы канала">
              {selectedChannel.groups.map((group) => <span key={group}>{group}</span>)}
            </div>

            <div className="channel-detail-section">
              <div className="section-title compact-title">
                <h3>Подключения канала</h3>
                <span>несколько инстансов</span>
              </div>
              <div className="connection-list">
                {selectedChannel.connections.map((connection) => (
                  <div className={`connection-row ${connection.status.toLowerCase()}`} key={connection.id}>
                    <div>
                      <strong>{connection.name}</strong>
                      <span>{connection.env} · {connection.rawId}</span>
                    </div>
                    <b>{connection.status}</b>
                    <span>{connection.lastEvent}</span>
                    <span>{connection.traffic}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="channel-detail-section">
              <div className="channel-log-toolbar">
                <div className="section-title compact-title">
                  <h3>Журнал ошибок и событий</h3>
                  <span>{visibleChannelLogs.length} событий</span>
                </div>
                <select value={channelLogConnection} onChange={(event) => setChannelLogConnection(event.target.value)} aria-label="Фильтр логов по подключению">
                  <option value="all">Все подключения</option>
                  {selectedChannel.connections.map((connection) => <option value={connection.id} key={connection.id}>{connection.name}</option>)}
                </select>
                <select value={channelLogSeverity} onChange={(event) => setChannelLogSeverity(event.target.value)} aria-label="Фильтр логов по уровню">
                  <option value="all">Все уровни</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                </select>
              </div>
              <div className="channel-log-list">
                {visibleChannelLogs.map((log) => (
                  <div className={`channel-log-row ${log.severity}`} key={log.id}>
                    <time>{log.time}</time>
                    <b>{log.severity}</b>
                    <span>{selectedChannel.connections.find((connection) => connection.id === log.connectionId)?.name ?? log.connectionId}</span>
                    <strong>{log.message}</strong>
                    <code>{log.traceId}</code>
                  </div>
                ))}
                {!visibleChannelLogs.length ? (
                  <div className="channel-log-empty">По выбранным фильтрам событий нет.</div>
                ) : null}
              </div>
            </div>

            <div className="channel-test-panel">
              <div className="section-title compact-title">
                <h3>Тест приема/отправки</h3>
                <span>{canEditSettings ? "симуляция raw response" : "только администратор"}</span>
              </div>
              <div className="channel-test-grid">
                <label>
                  <span>Направление</span>
                  <select disabled={!canEditSettings} value={channelTestMode} onChange={(event) => setChannelTestMode(event.target.value)} title={canEditSettings ? "Выберите режим теста" : access.reason}>
                    <option value="receive">Прием</option>
                    <option value="send">Отправка</option>
                  </select>
                </label>
                <label>
                  <span>Адресат / тестовый пользователь</span>
                  <input disabled={!canEditSettings} value={channelTestRecipient} onChange={(event) => setChannelTestRecipient(event.target.value)} title={canEditSettings ? "Тестовый адресат" : access.reason} />
                </label>
                <label className="channel-test-message">
                  <span>Сообщение / payload</span>
                  <textarea disabled={!canEditSettings} value={channelTestMessage} onChange={(event) => setChannelTestMessage(event.target.value)} title={canEditSettings ? "Тестовое сообщение" : access.reason} />
                </label>
                <button disabled={!canEditSettings} onClick={handleChannelTest} title={canEditSettings ? "Запустить тест" : access.reason} type="button">
                  <PlayCircle size={16} />
                  Запустить тест
                </button>
              </div>
              {channelTestResult ? (
                <div className={`channel-test-result ${channelTestResult.tone}`}>
                  <strong>{channelTestResult.title}</strong>
                  <code>{channelTestResult.raw}</code>
                </div>
              ) : (
                <div className="channel-test-empty">Результат теста появится после запуска.</div>
              )}
            </div>
          </div>
        </section>

        <section className="work-panel sdk-console">
          <SectionTitle title="SDK-консоль" action="Ключи, события, точки входа" />
          <div className="sdk-code">
            <code>{`SupportSDK.init({ appId: "gig-app", channels: ["SDK", "Telegram", "MAX", "VK"] })`}</code>
            <button disabled={!canEditSettings} onClick={() => onToast("SDK snippet скопирован.")} title={canEditSettings ? "Копировать SDK snippet" : access.reason} type="button">Копировать</button>
          </div>
          <div className="sdk-playground">
            <div className="section-title compact-title">
              <h3>Playground payload</h3>
              <span>{canEditSettings ? "raw preview и тестовый стенд" : "только администратор"}</span>
            </div>
            <div className="sdk-playground-grid">
              <label>
                <span>Событие</span>
                <select disabled={!canEditSettings} value={sdkPlaygroundEvent} onChange={(event) => setSdkPlaygroundEvent(event.target.value)} title={canEditSettings ? "Выберите SDK событие" : access.reason}>
                  {sdkEvents.map(([event]) => <option value={event} key={event}>{event}</option>)}
                </select>
              </label>
              <label>
                <span>Окружение</span>
                <select disabled={!canEditSettings} value={sdkPlaygroundEnv} onChange={(event) => setSdkPlaygroundEnv(event.target.value)} title={canEditSettings ? "Выберите окружение" : access.reason}>
                  <option value="production">production</option>
                  <option value="stage">stage</option>
                </select>
              </label>
              <label>
                <span>Канал</span>
                <select disabled={!canEditSettings} value={sdkPlaygroundChannel} onChange={(event) => setSdkPlaygroundChannel(event.target.value)} title={canEditSettings ? "Выберите канал" : access.reason}>
                  {["SDK", "Telegram", "MAX", "VK"].map((channel) => <option value={channel} key={channel}>{channel}</option>)}
                </select>
              </label>
              <label>
                <span>User ID</span>
                <input disabled={!canEditSettings} value={sdkPlaygroundUser} onChange={(event) => setSdkPlaygroundUser(event.target.value)} title={canEditSettings ? "ID гигера" : access.reason} />
              </label>
              <label>
                <span>Телефон</span>
                <input disabled={!canEditSettings} value={sdkPlaygroundPhone} onChange={(event) => setSdkPlaygroundPhone(event.target.value)} title={canEditSettings ? "Телефон гигера" : access.reason} />
              </label>
              <label className="sdk-message-field">
                <span>Сообщение</span>
                <textarea disabled={!canEditSettings} value={sdkPlaygroundMessage} onChange={(event) => setSdkPlaygroundMessage(event.target.value)} title={canEditSettings ? "Текст стартового сообщения" : access.reason} />
              </label>
            </div>
            <div className="sdk-payload-preview">
              <div>
                <strong>Raw payload</strong>
                <code>{JSON.stringify(sdkPayloadPreview, null, 2)}</code>
              </div>
              <div>
                <strong>Response</strong>
                {sdkPlaygroundResult ? (
                  <code className={sdkPlaygroundResult.tone}>{sdkPlaygroundResult.response}</code>
                ) : (
                  <span>Запустите событие, чтобы увидеть ответ тестового стенда.</span>
                )}
              </div>
            </div>
            <div className="sdk-playground-actions">
              {sdkPlaygroundResult ? <span className={sdkPlaygroundResult.tone}>{sdkPlaygroundResult.title}</span> : <span>Payload обновляется при изменении полей.</span>}
              <button disabled={!canEditSettings} onClick={handleSdkPlaygroundRun} title={canEditSettings ? "Запустить SDK событие" : access.reason} type="button">
                <PlayCircle size={16} />
                Запустить событие
              </button>
            </div>
          </div>
          <div className="sdk-event-list">
            {sdkEvents.map(([event, description]) => (
              <div className="sdk-event-row" key={event}>
                <Zap size={17} />
                <strong>{event}</strong>
                <span>{description}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="rules-panel">
        <SectionTitle title="Критичные правила" action="Включены" />
        {[
          ["Нельзя закрыть диалог без тематики", "Обязательное правило для всех каналов"],
          ["Внутренний комментарий не отправляется клиенту", "Разделение режимов ввода"],
          ["Оператор не получает чаты сверх лимита", "Override только с правами старшего"],
          ["Экспорт отчетов фиксируется в аудите", "CSV/XLSX/PDF"]
        ].map(([title, description]) => (
          <div className="rule-row" key={title}>
            <KeyRound size={18} />
            <strong>{title}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
    </ProductScreen>
  );
}

function InfoPill({ label, value }) {
  return (
    <div className="info-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
