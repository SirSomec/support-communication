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
import { ChannelBadge, ChannelList, MetricTile, Permission, ProductScreen, SectionTitle } from "./ui.jsx";
import {
  activeVisitors,
  aiSuggestions,
  auditEvents,
  botScenarios,
  channelDetails,
  channelSettings,
  employeeChannelRules,
  exportJobs,
  initialTemplates,
  knowledgeArticles,
  operators,
  proactiveRules,
  qualityScores,
  queues,
  reportBars,
  reportRows,
  rescueChats,
  roles,
  sdkEvents,
  topicDirectorySeed
} from "./data.js";

function maskPhone(phone) {
  return phone.replace(/(\+7)\s(\d{3})\s(\d{3})-(\d{2})-(\d{2})/, "$1 *** ***-**-$5");
}

function getClientId(client) {
  return `gig-${client.id}-${client.phone.replace(/\D/g, "").slice(-4)}`;
}

const topicStatusFilters = ["Все", "Активные", "Архив"];

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
      actions={
        <button className="primary-action" disabled={!canMergeProfiles} onClick={() => duplicateCandidates[0] ? mergeClient(duplicateCandidates[0]) : onToast("Потенциальных дублей не найдено.")} title={canMergeProfiles ? "Объединить ближайший дубль" : access.reason}>
          <Sparkles size={17} />
          Объединить дубли
        </button>
      }
    >
      <div className="screen-toolbar">
        <label className="toolbar-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по телефону, имени или каналу" />
        </label>
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
            <label className="toolbar-search">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти шаблон" />
            </label>
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
  const selectedVisitor = activeVisitors.find((visitor) => visitor.id === selectedVisitorId) ?? activeVisitors[0];
  const typingCount = activeVisitors.filter((visitor) => visitor.typing).length;
  const criticalRescue = rescueChats.filter((chat) => chat.priority === "Критичный").length;

  return (
    <ProductScreen
      title="Активные визиты и спасение"
      subtitle="Наблюдение SDK/VK-сессий до начала чата, proactive-приглашения и очередь спасения диалогов с таймерами."
      onBack={onBack}
      actions={
        <>
          <button onClick={() => onToast("Правила proactive-приглашений обновлены для активных посетителей.")} type="button">
            <Zap size={17} />
            Обновить правила
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
        <MetricTile icon={<Zap size={21} />} label="Proactive" value={`${proactiveRules[0].acceptanceRate}%`} detail="принятие лучшего правила" />
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
            {proactiveRules.map((rule) => (
              <article className="proactive-row" key={rule.id}>
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
              </article>
            ))}
          </div>
        </section>
      </div>
    </ProductScreen>
  );
}

export function QualityScreen({ onBack, onToast }) {
  const lowScores = qualityScores.filter((item) => Number(item.score) < 4 || item.status.includes("Низкая"));
  const averageCsat = Math.round(
    qualityScores
      .filter((item) => item.scale === "CSAT")
      .reduce((sum, item, _, list) => sum + (Number(item.score) / 5) * 100 / list.length, 0)
  );

  return (
    <ProductScreen
      title="Качество, CSAT и AI"
      subtitle="Оценки клиентов, ручной QA, низкие оценки, AI-подсказки и управление статьями базы знаний."
      onBack={onBack}
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
        <div className="knowledge-table">
          {knowledgeArticles.map((article) => (
            <button className="knowledge-row" key={article.id} onClick={() => onToast(`Открыт редактор статьи: ${article.title}`)} type="button">
              <strong>{article.title}</strong>
              <span>{article.category}</span>
              <span>{article.status}</span>
              <ChannelList channels={article.channels} />
              <b>{article.helpfulRate}% полезность</b>
            </button>
          ))}
        </div>
      </section>
    </ProductScreen>
  );
}

export function AutomationScreen({ onBack, onToast }) {
  const enabledScenarios = botScenarios.filter((scenario) => scenario.status.includes("Включ") || scenario.status.includes("Р’РєР»")).length;
  const enabledProactive = proactiveRules.filter((rule) => rule.status.includes("Включ") || rule.status.includes("Р’РєР»")).length;

  return (
    <ProductScreen
      title="Боты и автоматизация"
      subtitle="Сценарии AI-оператора, proactive-приглашения, handoff в очереди и audit действий автоматики."
      onBack={onBack}
      actions={
        <>
          <button onClick={() => onToast("Черновик сценария создан в конструкторе.")} type="button">
            <Plus size={17} />
            Новый сценарий
          </button>
          <button className="primary-action" onClick={() => onToast("Тестовый прогон сценариев запущен.")} type="button">
            <PlayCircle size={17} />
            Прогнать тест
          </button>
        </>
      }
    >
      <div className="metric-strip">
        <MetricTile icon={<Bot size={21} />} label="Сценарии" value={botScenarios.length} detail={`${enabledScenarios} включены`} />
        <MetricTile icon={<Zap size={21} />} label="Proactive" value={proactiveRules.length} detail={`${enabledProactive} активны`} />
        <MetricTile icon={<Workflow size={21} />} label="Handoff" value="4" detail="очереди назначения" />
        <MetricTile icon={<ListChecks size={21} />} label="Audit" value={auditEvents.length} detail="последние события" />
      </div>

      <div className="automation-layout">
        <section className="work-panel">
          <SectionTitle title="Конструктор сценариев" action="триггер -> шаги -> handoff" />
          <div className="scenario-list">
            {botScenarios.map((scenario) => (
              <article className="scenario-card" key={scenario.id}>
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
                  <button onClick={() => onToast(`Открыт сценарий: ${scenario.name}`)} type="button">Редактировать</button>
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
    </ProductScreen>
  );
}

export function ReportsScreen({ onBack, onToast, access }) {
  const [period, setPeriod] = useState("Сегодня");
  const [channel, setChannel] = useState("Все каналы");
  const [reportType, setReportType] = useState("Ежедневный");

  return (
    <ProductScreen
      title="Отчеты"
      subtitle="Ежедневный отчет, дайджест и выгрузка всех показателей, которые видны в интерфейсе."
      onBack={onBack}
      actions={
        <>
          <select className="inline-select" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {["Сегодня", "Вчера", "7 дней", "30 дней"].map((option) => <option key={option}>{option}</option>)}
          </select>
          <select className="inline-select" value={reportType} onChange={(event) => setReportType(event.target.value)} aria-label="Тип отчета">
            {["Ежедневный", "Дайджест", "CSAT/CSI", "SLA", "Операторы"].map((option) => <option key={option}>{option}</option>)}
          </select>
          <button className="primary-action" disabled={!access.canExportReports} onClick={() => onToast(`Выгрузка XLSX за период "${period}" поставлена в очередь.`)} title={access.canExportReports ? "Экспорт XLSX" : access.reason}>
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

      <div className="screen-toolbar">
        <select className="inline-select" value={channel} onChange={(event) => setChannel(event.target.value)} aria-label="Канал отчета">
          {["Все каналы", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
        </select>
        <button onClick={() => onToast(`Фильтр применен: ${reportType}, ${period}, ${channel}`)} type="button"><Filter size={17} /> Применить</button>
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

      <div className="entity-table report-table">
        <div className="entity-head">
          <span>Показатель</span>
          <span>Текущий период</span>
          <span>Сравнение</span>
          <span>Динамика</span>
          <span>Комментарий</span>
        </div>
        {reportRows.map((row) => (
          <div className="entity-row" key={row.metric}>
            <strong>{row.metric}</strong>
            <span>{row.today}</span>
            <span>{row.previous}</span>
            <b>{row.delta}</b>
            <span>{row.status}</span>
          </div>
        ))}
      </div>

      <section className="work-panel export-queue-panel">
        <SectionTitle title="Очередь и история выгрузок" action="каждый экспорт фиксируется в audit" />
        <div className="export-job-list">
          {exportJobs.map((job) => (
            <article className={`export-job ${job.status.includes("Ошибка") ? "danger" : ""}`} key={job.id}>
              <header>
                <strong>{job.name}</strong>
                <span>{job.status}</span>
              </header>
              <div className="health-bar"><i style={{ width: `${job.progress}%` }} /></div>
              <footer>
                <span>{job.format} · {job.period} · {job.rows} строк</span>
                <button onClick={() => onToast(`${job.name}: audit ${job.auditId}`)} type="button">Audit</button>
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
  const canEditSettings = access.canManageSettings;
  const normalizedTopicQuery = topicQuery.trim().toLowerCase();
  const selectedChannel = channelDetails.find((channel) => channel.id === selectedChannelId) ?? channelDetails[0];

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

  function toggleChannel(name) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, enabled: !channel.enabled } : channel));
  }

  function updateLimit(name, limit) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, limit } : channel));
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

  return (
    <ProductScreen
      title="Настройки"
      subtitle="Права, каналы, лимиты операторов, маршрутизация и обязательные правила закрытия."
      onBack={onBack}
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
        <div className="employee-rule-list">
          {employeeChannelRules.map((rule) => (
            <article className="employee-rule" key={rule.id}>
              <header>
                <strong>{rule.employee}</strong>
                <span>{rule.role}</span>
                <b>{rule.chatLimit} чатов</b>
              </header>
              <ChannelList channels={rule.channels} />
              <p>{rule.exceptions.join("; ")}</p>
              <footer>
                <span>{rule.canOverride ? "может override" : "без override"}</span>
                <span>{rule.sensitiveData ? "видит чувствительные данные" : "данные маскированы"}</span>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="work-panel topic-directory-panel">
        <SectionTitle title="Справочник тематик" action={`${topicTotals.active} активных / ${topicTotals.archived} архив`} />
        <div className="topic-directory-toolbar">
          <label className="toolbar-search topic-search">
            <Search size={17} />
            <input
              aria-label="Поиск по справочнику тематик"
              placeholder="Поиск по теме, каналу, владельцу"
              value={topicQuery}
              onChange={(event) => setTopicQuery(event.target.value)}
            />
          </label>
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
