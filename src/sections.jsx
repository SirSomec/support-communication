import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Clock3,
  Download,
  FileText,
  Filter,
  Gauge,
  Inbox,
  KeyRound,
  LayoutDashboard,
  MessageSquareWarning,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  ToggleLeft,
  ToggleRight,
  UsersRound,
  Workflow,
  Zap
} from "lucide-react";

const operators = [
  { name: "Иван П.", status: "online", chats: 7, limit: 12, avg: "01:18", sla: 96, channels: ["SDK", "Telegram"] },
  { name: "Анна Р.", status: "online", chats: 10, limit: 12, avg: "01:42", sla: 91, channels: ["MAX", "VK"] },
  { name: "Кирилл М.", status: "break", chats: 3, limit: 8, avg: "02:11", sla: 88, channels: ["Telegram"] },
  { name: "Елена С.", status: "online", chats: 5, limit: 10, avg: "01:05", sla: 98, channels: ["SDK"] },
  { name: "Олег Н.", status: "offline", chats: 0, limit: 8, avg: "03:20", sla: 82, channels: ["VK"] }
];

const queues = [
  { name: "SDK", active: 42, waiting: 8, overdue: 2, limit: 12, health: 82 },
  { name: "Telegram", active: 35, waiting: 11, overdue: 3, limit: 8, health: 74 },
  { name: "MAX", active: 24, waiting: 5, overdue: 1, limit: 8, health: 89 },
  { name: "VK", active: 25, waiting: 9, overdue: 4, limit: 8, health: 68 }
];

const reportRows = [
  { metric: "Новые обращения", today: "486", previous: "438", delta: "+11%", status: "Рост нагрузки" },
  { metric: "Закрытые обращения", today: "451", previous: "429", delta: "+5%", status: "В норме" },
  { metric: "Среднее время первого ответа", today: "01:36", previous: "01:52", delta: "-14%", status: "Лучше" },
  { metric: "SLA выполнен", today: "91%", previous: "87%", delta: "+4 п.п.", status: "Лучше" },
  { metric: "Без тематики", today: "0", previous: "3", delta: "-3", status: "Контроль работает" }
];

const reportBars = [
  ["SDK", 38],
  ["Telegram", 28],
  ["MAX", 18],
  ["VK", 16]
];

const initialTemplates = [
  {
    id: "delay",
    title: "Задержка доставки",
    scope: "Командный",
    channel: "SDK",
    topic: "Доставка",
    usage: 184,
    updated: "Сегодня, 11:04",
    text: "Понимаю ожидание. Проверю статус заказа и вернусь с точным временем доставки."
  },
  {
    id: "courier",
    title: "Передан курьеру",
    scope: "Личный",
    channel: "Telegram",
    topic: "Доставка",
    usage: 97,
    updated: "Вчера, 18:20",
    text: "Заказ передан курьеру и будет доставлен сегодня до 18:00."
  },
  {
    id: "phone",
    title: "Запрос телефона",
    scope: "Глобальный",
    channel: "Все",
    topic: "Идентификация",
    usage: 241,
    updated: "22 июня",
    text: "Напишите, пожалуйста, номер телефона, указанный в заказе."
  },
  {
    id: "refund",
    title: "Возврат средств",
    scope: "Командный",
    channel: "VK",
    topic: "Оплата",
    usage: 73,
    updated: "20 июня",
    text: "Проверю статус возврата и уточню срок зачисления средств."
  }
];

const roles = [
  { name: "Сотрудник", panel: false, settings: false, reset: false, reports: "Личные" },
  { name: "Старший сотрудник", panel: true, settings: false, reset: true, reports: "Команда" },
  { name: "Администратор", panel: true, settings: true, reset: true, reports: "Все" }
];

const channelSettings = [
  { name: "SDK", enabled: true, staff: 18, limit: 12 },
  { name: "Telegram", enabled: true, staff: 14, limit: 8 },
  { name: "MAX", enabled: true, staff: 9, limit: 8 },
  { name: "VK", enabled: true, staff: 11, limit: 8 }
];

const integrationCards = [
  { name: "SDK Web / Mobile", channel: "SDK", status: "Активен", detail: "2 приложения, 14 680 сессий сегодня", health: 98 },
  { name: "Telegram Bot", channel: "Telegram", status: "Активен", detail: "Webhook 200 OK, 28% новых обращений", health: 94 },
  { name: "MAX Business", channel: "MAX", status: "Тестовый контур", detail: "9 операторов, лимит 8 чатов", health: 82 },
  { name: "VK Сообщества", channel: "VK", status: "Требует внимания", detail: "SLA 68%, очередь перегружена", health: 68 }
];

const sdkEvents = [
  ["identifyUser", "Передает телефон, устройство и ID гигера"],
  ["initConversation", "Инициирует диалог по номеру телефона"],
  ["trackEntryPoint", "Фиксирует SDK, Telegram, MAX или VK"],
  ["syncTopic", "Синхронизирует тематику и запрет закрытия"]
];

export function PanelScreen({ onBack, onToast }) {
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
          <button className="primary-action" onClick={() => onToast("Очереди перераспределены по текущим лимитам.")}>
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

export function ClientsScreen({ conversations, onBack, onToast }) {
  const [query, setQuery] = useState("");
  const clients = useMemo(() => {
    return conversations.filter((client) => `${client.name} ${client.phone} ${client.channel}`.toLowerCase().includes(query.toLowerCase()));
  }, [conversations, query]);

  return (
    <ProductScreen
      title="Клиенты"
      subtitle="Единые профили с телефонами, устройствами, точками входа и историей обращений."
      onBack={onBack}
      actions={
        <button className="primary-action" onClick={() => onToast("Карточки клиентов синхронизированы.")}>
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
      <div className="entity-table clients-table">
        <div className="entity-head">
          <span>Клиент</span>
          <span>Телефон</span>
          <span>Канал</span>
          <span>Устройство</span>
          <span>Тематика</span>
          <span>История</span>
        </div>
        {clients.map((client) => (
          <button className="entity-row" key={client.id} onClick={() => onToast(`Открыта карточка: ${client.name}`)}>
            <strong>{client.name}</strong>
            <span>{client.phone}</span>
            <ChannelBadge channel={client.channel} />
            <span>{client.device}</span>
            <span>{client.topic || "Не выбрана"}</span>
            <span>{client.previous.length} закрытых</span>
          </button>
        ))}
      </div>
    </ProductScreen>
  );
}

export function TemplatesScreen({ onBack, onToast }) {
  const [items, setItems] = useState(initialTemplates);
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

export function ReportsScreen({ onBack, onToast }) {
  const [period, setPeriod] = useState("Сегодня");

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
          <button className="primary-action" onClick={() => onToast(`Выгрузка XLSX за период "${period}" поставлена в очередь.`)}>
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
    </ProductScreen>
  );
}

export function SettingsScreen({ onBack, onToast }) {
  const [channels, setChannels] = useState(channelSettings);

  function toggleChannel(name) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, enabled: !channel.enabled } : channel));
  }

  function updateLimit(name, limit) {
    setChannels((current) => current.map((channel) => channel.name === name ? { ...channel, limit } : channel));
  }

  return (
    <ProductScreen
      title="Настройки"
      subtitle="Права, каналы, лимиты операторов, маршрутизация и обязательные правила закрытия."
      onBack={onBack}
      actions={
        <button className="primary-action" onClick={() => onToast("Настройки сохранены и попадут в аудит.")}>
          <ShieldCheck size={17} />
          Сохранить
        </button>
      }
    >
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
                    onChange={(event) => updateLimit(channel.name, Number(event.target.value))}
                  />
                </label>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="integration-layout">
        <section className="work-panel">
          <SectionTitle title="Подключения" action="Мониторинг каналов" />
          <div className="integration-cards">
            {integrationCards.map((integration) => (
              <article className="integration-card" key={integration.name}>
                <header>
                  <ChannelBadge channel={integration.channel} />
                  <strong>{integration.name}</strong>
                  <span>{integration.status}</span>
                </header>
                <p>{integration.detail}</p>
                <div className="health-bar"><i style={{ width: `${integration.health}%` }} /></div>
                <footer>
                  <span>{integration.health}% health</span>
                  <button onClick={() => onToast(`${integration.name}: проверка подключения запущена.`)} type="button">Проверить</button>
                </footer>
              </article>
            ))}
          </div>
        </section>

        <section className="work-panel sdk-console">
          <SectionTitle title="SDK-консоль" action="Ключи, события, точки входа" />
          <div className="sdk-code">
            <code>{`SupportSDK.init({ appId: "gig-app", channels: ["SDK", "Telegram", "MAX", "VK"] })`}</code>
            <button onClick={() => onToast("SDK snippet скопирован.")} type="button">Копировать</button>
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

function ProductScreen({ title, subtitle, onBack, actions, children }) {
  return (
    <section className="product-screen">
      <header className="product-header">
        <div>
          <button className="back-link" onClick={onBack}><ChevronLeft size={18} /> Диалоги</button>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="product-actions">{actions}</div>
      </header>
      {children}
    </section>
  );
}

function MetricTile({ icon, label, value, detail, tone }) {
  return (
    <article className={`metric-tile ${tone ?? ""}`}>
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SectionTitle({ title, action }) {
  return (
    <header className="section-title">
      <h2>{title}</h2>
      <span>{action}</span>
    </header>
  );
}

function ChannelBadge({ channel }) {
  return <span className={`channel-chip ${channel.toLowerCase()}`}>{channel}</span>;
}

function ChannelList({ channels }) {
  return (
    <div className="mini-channel-list">
      {channels.map((channel) => <ChannelBadge channel={channel} key={channel} />)}
    </div>
  );
}

function Permission({ enabled }) {
  return enabled ? <span className="permission yes">Да</span> : <span className="permission no">Нет</span>;
}
