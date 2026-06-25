import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardList,
  Clock3,
  Copy,
  FileText,
  Gauge,
  Headphones,
  Inbox,
  Info,
  LayoutDashboard,
  Lock,
  MessageCircle,
  MoreHorizontal,
  PanelRightOpen,
  Paperclip,
  PhoneCall,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Tag,
  UsersRound,
  X,
  Zap
} from "lucide-react";
import { ClientsScreen, PanelScreen, ReportsScreen, SettingsScreen, TemplatesScreen, initialTemplates } from "./sections.jsx";

const conversations = [
  {
    id: "maria",
    name: "Мария К.",
    initials: "МК",
    avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=128&q=80",
    channel: "SDK",
    phone: "+7 999 204-18-44",
    time: "11:24",
    preview: "Где мой заказ? Он должен был приехать вчера.",
    status: "active",
    sla: "02:15",
    slaTone: "ok",
    topic: "Доставка / Статус заказа",
    unread: true,
    device: "Android",
    entry: "SDK",
    language: "Русский",
    clientSince: "12 мая 2024",
    tags: ["доставка", "статус заказа", "важный клиент"],
    previous: [
      ["05.05.2024", "Возврат товара", "Закрыт"],
      ["22.04.2024", "Вопрос по оплате", "Закрыт"],
      ["10.04.2024", "Изменение заказа", "Закрыт"]
    ],
    messages: [
      { id: 1, side: "client", text: "Где мой заказ? Он должен был приехать вчера.", time: "11:24" },
      { id: 2, type: "event", text: "Назначен оператором Иван П.", time: "11:24" },
      { id: 3, side: "agent", text: "Здравствуйте, Мария! Сейчас проверю информацию по вашему заказу.", time: "11:25" },
      {
        id: 4,
        type: "internal",
        text: "Проверить статус в ЛК и связаться с курьерской службой.",
        author: "Иван П.",
        time: "11:25"
      },
      { id: 5, side: "client", text: "Хорошо, спасибо!", time: "11:25" },
      {
        id: 6,
        side: "agent",
        text: "Ваш заказ №12345 передан курьеру, он будет доставлен сегодня до 18:00. Приношу извинения за задержку.",
        time: "11:26"
      },
      { id: 7, side: "client", text: "Спасибо, буду ждать.", time: "11:27" }
    ]
  },
  {
    id: "dmitry",
    name: "Дмитрий С.",
    initials: "ДС",
    channel: "Telegram",
    phone: "+7 916 481-77-02",
    time: "11:20",
    preview: "Можно ли изменить адрес доставки?",
    status: "waiting",
    sla: "01:45",
    slaTone: "ok",
    topic: "Доставка / Адрес",
    device: "iOS",
    entry: "Telegram",
    language: "Русский",
    clientSince: "03 июня 2024",
    tags: ["доставка", "изменение адреса"],
    previous: [["11.05.2024", "Промокод", "Закрыт"]],
    messages: [
      { id: 1, side: "client", text: "Можно ли изменить адрес доставки?", time: "11:20" },
      { id: 2, side: "agent", text: "Да, напишите новый адрес. Я проверю, можно ли изменить маршрут.", time: "11:21" }
    ]
  },
  {
    id: "irina",
    name: "Ирина П.",
    initials: "ИП",
    avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=128&q=80",
    channel: "MAX",
    phone: "+7 925 111-02-19",
    time: "11:18",
    preview: "Спасибо, вопрос решен!",
    status: "closed",
    sla: "Закрыт",
    slaTone: "closed",
    topic: "Оплата / Возврат",
    device: "Android",
    entry: "MAX",
    language: "Русский",
    clientSince: "24 января 2024",
    tags: ["оплата", "возврат"],
    previous: [],
    messages: [
      { id: 1, side: "client", text: "Спасибо, вопрос решен!", time: "11:18" },
      { id: 2, type: "event", text: "Диалог закрыт с тематикой Оплата / Возврат", time: "11:19" }
    ]
  },
  {
    id: "alexey",
    name: "Алексей Т.",
    initials: "АТ",
    channel: "VK",
    phone: "+7 903 773-11-05",
    time: "11:10",
    preview: "Не приходит код подтверждения",
    status: "waiting",
    sla: "Ожидает",
    slaTone: "hold",
    topic: "Авторизация / Код",
    device: "Web",
    entry: "VK",
    language: "Русский",
    clientSince: "09 февраля 2024",
    tags: ["авторизация", "код"],
    previous: [],
    messages: [
      { id: 1, side: "client", text: "Не приходит код подтверждения", time: "11:10" },
      { id: 2, side: "agent", text: "Проверю отправку кода. Напишите, пожалуйста, последние 4 цифры номера.", time: "11:11" }
    ]
  },
  {
    id: "olga",
    name: "Ольга Л.",
    initials: "ОЛ",
    avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=128&q=80",
    channel: "SDK",
    phone: "+7 985 430-09-40",
    time: "11:05",
    preview: "Возврат денежных средств",
    status: "sla",
    sla: "SLA 00:30",
    slaTone: "warn",
    topic: "Оплата / Возврат",
    device: "iOS",
    entry: "SDK",
    language: "Русский",
    clientSince: "14 марта 2024",
    tags: ["возврат", "важно"],
    previous: [["28.05.2024", "Смена карты", "Закрыт"]],
    messages: [
      { id: 1, side: "client", text: "Когда вернутся деньги за отмененный заказ?", time: "11:05" },
      { id: 2, type: "event", text: "SLA первого ответа истекает через 30 минут", time: "11:05" }
    ]
  },
  {
    id: "vladimir",
    name: "Владимир Б.",
    initials: "ВБ",
    channel: "Telegram",
    phone: "+7 921 991-12-53",
    time: "10:58",
    preview: "Товар не соответствует описанию",
    status: "breached",
    sla: "SLA просрочен",
    slaTone: "danger",
    topic: "",
    device: "Android",
    entry: "Telegram",
    language: "Русский",
    clientSince: "29 апреля 2024",
    tags: ["товар", "жалоба"],
    previous: [],
    messages: [
      { id: 1, side: "client", text: "Товар не соответствует описанию. Хочу вернуть.", time: "10:58" },
      { id: 2, type: "event", text: "Для закрытия укажите тематику", time: "10:59" }
    ]
  }
];

const navItems = [
  { key: "dialogs", label: "Диалоги", icon: MessageCircle },
  { key: "panel", label: "Панель", icon: LayoutDashboard },
  { key: "clients", label: "Клиенты", icon: UsersRound },
  { key: "templates", label: "Шаблоны", icon: ClipboardList },
  { key: "reports", label: "Отчеты", icon: BarChart3 },
  { key: "settings", label: "Настройки", icon: Settings }
];

const topicOptions = [
  "Доставка / Статус заказа",
  "Доставка / Адрес",
  "Оплата / Возврат",
  "Авторизация / Код",
  "Товар / Несоответствие"
];

function App() {
  const [conversationItems, setConversationItems] = useState(conversations);
  const [section, setSection] = useState("dialogs");
  const [selectedId, setSelectedId] = useState("maria");
  const [filter, setFilter] = useState("mine");
  const [query, setQuery] = useState("");
  const [composeMode, setComposeMode] = useState("reply");
  const [draft, setDraft] = useState("");
  const [isOutboundOpen, setOutboundOpen] = useState(false);
  const [templateLibrary, setTemplateLibrary] = useState(initialTemplates);
  const [saveTemplateDraft, setSaveTemplateDraft] = useState(null);
  const [topics, setTopics] = useState(() =>
    Object.fromEntries(conversations.map((conversation) => [conversation.id, conversation.topic]))
  );
  const [closedIds, setClosedIds] = useState(() => new Set(conversations.filter((item) => item.status === "closed").map((item) => item.id)));
  const [toast, setToast] = useState("");

  const selected = conversationItems.find((conversation) => conversation.id === selectedId) ?? conversationItems[0];
  const selectedTopic = topics[selected.id] ?? "";
  const isClosed = closedIds.has(selected.id);

  const filtered = useMemo(() => {
    return conversationItems.filter((conversation) => {
      const matchesQuery = `${conversation.name} ${conversation.phone} ${conversation.preview} ${conversation.channel}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesFilter =
        filter === "mine" ||
        (filter === "waiting" && ["waiting", "breached"].includes(conversation.status)) ||
        (filter === "sla" && ["sla", "breached"].includes(conversation.status)) ||
        filter === "all";
      return matchesQuery && matchesFilter;
    });
  }, [conversationItems, filter, query]);

  function handleOutboundCreate(outbound) {
    const id = `outbound-${Date.now()}`;
    const newConversation = {
      id,
      name: outbound.clientName || "Новый клиент",
      initials: outbound.clientName ? outbound.clientName.split(" ").map((part) => part[0]).join("").slice(0, 2) : "НК",
      avatar: "",
      channel: outbound.channel,
      phone: outbound.phone,
      time: "сейчас",
      preview: outbound.message,
      status: "active",
      sla: "00:00",
      slaTone: "ok",
      topic: outbound.topic,
      unread: false,
      device: outbound.device,
      entry: outbound.channel,
      language: "Русский",
      clientSince: outbound.existing ? outbound.existing.clientSince : "Новый контакт",
      tags: ["исходящий", outbound.channel.toLowerCase()],
      previous: outbound.existing ? outbound.existing.previous : [],
      messages: [
        { id: 1, type: "event", text: `Диалог инициирован через ${outbound.channel} по номеру телефона`, time: "сейчас" },
        { id: 2, side: "operator", text: outbound.message, time: "сейчас" }
      ]
    };

    setConversationItems((current) => [newConversation, ...current]);
    setTopics((current) => ({ ...current, [id]: outbound.topic }));
    setSelectedId(id);
    setSection("dialogs");
    setOutboundOpen(false);
    setToast(`Исходящий диалог создан: ${outbound.phone}`);
  }

  function handleOpenTemplateSave() {
    if (!draft.trim()) {
      setToast("Введите текст ответа перед сохранением шаблона.");
      return;
    }

    setSaveTemplateDraft({
      title: selectedTopic ? selectedTopic.split(" / ").at(-1) : "Новый шаблон",
      scope: "Личный",
      channel: selected.channel,
      topic: selectedTopic || "Без тематики",
      text: draft.trim()
    });
  }

  function handleTemplateSave(template) {
    const next = {
      id: `chat-template-${Date.now()}`,
      usage: 0,
      updated: "только что",
      ...template
    };

    setTemplateLibrary((current) => [next, ...current]);
    setSaveTemplateDraft(null);
    setToast(`Шаблон сохранен: ${next.title}`);
  }

  function handleClose() {
    if (!selectedTopic) {
      setToast("Для закрытия диалога выберите тематику.");
      return;
    }

    const next = new Set(closedIds);
    next.add(selected.id);
    setClosedIds(next);
    setToast("Диалог закрыт и попадет в ежедневный отчет.");
  }

  function handleSend() {
    if (!draft.trim()) {
      setToast("Введите сообщение перед отправкой.");
      return;
    }

    setDraft("");
    setToast(composeMode === "internal" ? "Внутренний комментарий сохранен." : "Ответ отправлен клиенту.");
  }

  return (
    <div className="app-shell">
      <Sidebar active={section} onSelect={setSection} />
      <main className="workspace">
        <TopBar onOutbound={() => setOutboundOpen(true)} />
        {section === "dialogs" ? (
          <div className="cockpit">
            <ConversationList
              conversations={filtered}
              allConversations={conversationItems}
              selectedId={selectedId}
              onSelect={setSelectedId}
              filter={filter}
              onFilter={setFilter}
              query={query}
              onQuery={setQuery}
              topics={topics}
              closedIds={closedIds}
            />
            <ChatPane
              conversation={selected}
              topic={selectedTopic}
              onTopic={(value) => setTopics((current) => ({ ...current, [selected.id]: value }))}
              composeMode={composeMode}
              setComposeMode={setComposeMode}
              draft={draft}
              setDraft={setDraft}
              onSend={handleSend}
              templates={templateLibrary}
              onSaveTemplate={handleOpenTemplateSave}
              isClosed={isClosed}
            />
            <CustomerPanel
              conversation={selected}
              topic={selectedTopic}
              onTopic={(value) => setTopics((current) => ({ ...current, [selected.id]: value }))}
              draft={draft}
              setDraft={setDraft}
              templates={templateLibrary}
              onClose={handleClose}
              isClosed={isClosed}
            />
          </div>
        ) : (
          <SectionPlaceholder
            section={section}
            onBack={() => setSection("dialogs")}
            conversations={conversationItems}
            templates={templateLibrary}
            onTemplatesChange={setTemplateLibrary}
            onToast={setToast}
          />
        )}
      </main>
      {isOutboundOpen ? (
        <OutboundDialogLauncher
          conversations={conversationItems}
          onClose={() => setOutboundOpen(false)}
          onCreate={handleOutboundCreate}
          onToast={setToast}
        />
      ) : null}
      {saveTemplateDraft ? (
        <SaveTemplateDialog
          draft={saveTemplateDraft}
          onClose={() => setSaveTemplateDraft(null)}
          onSave={handleTemplateSave}
        />
      ) : null}
      {toast ? <Toast message={toast} onClose={() => setToast("")} /> : null}
    </div>
  );
}

function Sidebar({ active, onSelect }) {
  return (
    <aside className="sidebar">
      <div className="brand-mark">
        <Headphones size={22} />
      </div>
      <nav className="nav-list" aria-label="Главная навигация">
        {navItems.map(({ key, label, icon: Icon }) => (
          <button
            aria-label={label}
            className={`nav-item ${active === key ? "active" : ""}`}
            key={key}
            onClick={() => onSelect(key)}
            title={label}
            type="button"
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="operator-card">
        <img
          alt=""
          src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=96&q=80"
        />
        <div>
          <strong>Иван П.</strong>
          <span><i /> Онлайн</span>
        </div>
        <ChevronDown size={16} />
      </div>
    </aside>
  );
}

function TopBar({ onOutbound }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="status-select">
          <span className="presence-dot" />
          Онлайн
          <ChevronDown size={16} />
        </button>
        <button className="status-select">
          <UsersRound size={17} />
          7 / 12 чатов
          <ChevronDown size={16} />
        </button>
      </div>
      <div className="topbar-right">
        <button className="icon-button has-badge" aria-label="Уведомления">
          <Bell size={20} />
          <span>3</span>
        </button>
        <button className="icon-button" aria-label="Поиск">
          <Search size={20} />
        </button>
        <button className="quick-action" onClick={onOutbound} type="button">
          <Zap size={17} />
          Быстрые действия
          <ChevronDown size={16} />
        </button>
      </div>
    </header>
  );
}

function OutboundDialogLauncher({ conversations, onClose, onCreate, onToast }) {
  const [phone, setPhone] = useState("+7 ");
  const [clientName, setClientName] = useState("");
  const [channel, setChannel] = useState("SDK");
  const [topic, setTopic] = useState(topicOptions[0]);
  const [message, setMessage] = useState("Здравствуйте! Пишем по вашему обращению, готовы помочь в этом диалоге.");

  const normalizedPhone = phone.replace(/\D/g, "");
  const existing = conversations.find((conversation) => conversation.phone.replace(/\D/g, "") === normalizedPhone);
  const device = channel === "SDK" ? "Android / iOS из SDK" : "Определится каналом";
  const canCreate = normalizedPhone.length >= 11 && message.trim().length > 0;

  function handleCreate() {
    if (!canCreate) {
      onToast("Укажите телефон и стартовое сообщение для исходящего диалога.");
      return;
    }

    onCreate({
      phone,
      clientName: existing?.name ?? clientName.trim(),
      channel,
      topic,
      message: message.trim(),
      device,
      existing
    });
  }

  return (
    <div className="outbound-overlay" role="presentation">
      <section className="outbound-panel" aria-label="Новый исходящий диалог" aria-modal="true" role="dialog">
        <header>
          <div>
            <span>SDK contact center</span>
            <h2>Новый исходящий диалог</h2>
          </div>
          <button aria-label="Закрыть" className="icon-button" onClick={onClose} title="Закрыть" type="button">
            <X size={18} />
          </button>
        </header>

        <div className="outbound-grid">
          <label>
            <span>Телефон клиента</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+7 999 000-00-00" />
          </label>
          <label>
            <span>Имя, если новый клиент</span>
            <input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Новый клиент" disabled={Boolean(existing)} />
          </label>
          <label>
            <span>Канал запуска</span>
            <select value={channel} onChange={(event) => setChannel(event.target.value)}>
              {["SDK", "Telegram", "MAX", "VK"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label>
            <span>Тематика</span>
            <select value={topic} onChange={(event) => setTopic(event.target.value)}>
              {topicOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <label className="outbound-message">
          <span>Стартовое сообщение</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        </label>

        <div className="sdk-preview">
          <div>
            <PhoneCall size={18} />
            <strong>{existing ? `Найден профиль: ${existing.name}` : "Будет создан новый профиль"}</strong>
            <span>{phone} · {channel} · {device}</span>
          </div>
          <div>
            <Smartphone size={18} />
            <strong>SDK-событие</strong>
            <span>initConversation(phone, channel, topic, operatorId)</span>
          </div>
        </div>

        <footer>
          <button onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" onClick={handleCreate} type="button">
            <Send size={17} />
            Создать диалог
          </button>
        </footer>
      </section>
    </div>
  );
}

function SaveTemplateDialog({ draft, onClose, onSave }) {
  const [form, setForm] = useState(draft);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSave() {
    onSave({
      ...form,
      title: form.title.trim() || "Новый шаблон",
      text: form.text.trim()
    });
  }

  return (
    <div className="template-save-overlay" role="presentation">
      <section className="template-save-panel" aria-label="Сохранить как шаблон" aria-modal="true" role="dialog">
        <header>
          <div>
            <span>Личная база оператора</span>
            <h2>Сохранить как шаблон</h2>
          </div>
          <button aria-label="Закрыть" className="icon-button" onClick={onClose} title="Закрыть" type="button">
            <X size={18} />
          </button>
        </header>

        <div className="template-save-grid">
          <label>
            <span>Название</span>
            <input value={form.title} onChange={(event) => update("title", event.target.value)} />
          </label>
          <label>
            <span>Доступ</span>
            <select value={form.scope} onChange={(event) => update("scope", event.target.value)}>
              {["Личный", "Командный", "Глобальный"].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Канал</span>
            <select value={form.channel} onChange={(event) => update("channel", event.target.value)}>
              {["Все", "SDK", "Telegram", "MAX", "VK"].map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <label>
            <span>Тематика</span>
            <input value={form.topic} onChange={(event) => update("topic", event.target.value)} />
          </label>
        </div>

        <label className="template-save-text">
          <span>Текст шаблона</span>
          <textarea value={form.text} onChange={(event) => update("text", event.target.value)} />
        </label>

        <div className="variable-row compact">
          {["{client_name}", "{operator_name}", "{ticket_id}", "{topic}"].map((variable) => (
            <button key={variable} onClick={() => update("text", `${form.text} ${variable}`.trim())} type="button">{variable}</button>
          ))}
        </div>

        <footer>
          <button onClick={onClose} type="button">Отмена</button>
          <button className="primary-action" disabled={!form.text.trim()} onClick={handleSave} type="button">
            <BookOpen size={17} />
            Сохранить шаблон
          </button>
        </footer>
      </section>
    </div>
  );
}

function ConversationList({ conversations, allConversations, selectedId, onSelect, filter, onFilter, query, onQuery, topics, closedIds }) {
  const counters = {
    waiting: allConversations.filter((item) => ["waiting", "breached"].includes(item.status)).length,
    sla: allConversations.filter((item) => ["sla", "breached"].includes(item.status)).length
  };

  return (
    <section className="conversation-list" aria-label="Список диалогов">
      <div className="queue-tabs">
        <TabButton id="mine" active={filter} onClick={onFilter} label="Мои" />
        <TabButton id="waiting" active={filter} onClick={onFilter} label="Ожидают" count={counters.waiting} tone="danger" />
        <TabButton id="sla" active={filter} onClick={onFilter} label="SLA" count={counters.sla} tone="warn" />
        <TabButton id="all" active={filter} onClick={onFilter} label="Все" />
      </div>
      <div className="queue-search">
        <Search size={19} />
        <input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Поиск по диалогам" />
        <button aria-label="Фильтры">
          <SlidersHorizontal size={19} />
        </button>
      </div>
      <div className="queue-items">
        {conversations.map((conversation) => (
          <button
            className={`queue-row ${selectedId === conversation.id ? "selected" : ""} ${conversation.slaTone === "danger" ? "danger" : ""}`}
            key={conversation.id}
            onClick={() => onSelect(conversation.id)}
          >
            <Avatar conversation={conversation} />
            <span className="queue-body">
              <span className="queue-title">
                <strong>{conversation.name}</strong>
                <time>{conversation.time}</time>
              </span>
              <span className={`channel-chip ${conversation.channel.toLowerCase()}`}>{conversation.channel}</span>
              <span className="queue-preview">{conversation.preview}</span>
              <span className={`queue-meta ${conversation.slaTone}`}>
                {conversation.slaTone === "danger" ? <AlertTriangle size={15} /> : null}
                {conversation.slaTone === "warn" || conversation.slaTone === "hold" ? <Clock3 size={15} /> : null}
                {closedIds.has(conversation.id) ? "Закрыт" : conversation.sla}
              </span>
              {!topics[conversation.id] ? <span className="topic-warning">Для закрытия укажите тематику</span> : null}
            </span>
            {conversation.unread ? <span className="unread-dot" /> : null}
          </button>
        ))}
      </div>
      <footer className="queue-footer">
        <span>Показано 1-20 из 48</span>
        <div>
          <button aria-label="Назад"><ChevronLeft size={18} /></button>
          <button aria-label="Вперед"><ChevronRight size={18} /></button>
        </div>
      </footer>
    </section>
  );
}

function TabButton({ id, active, onClick, label, count, tone }) {
  return (
    <button className={`queue-tab ${active === id ? "active" : ""}`} onClick={() => onClick(id)}>
      {label}
      {count ? <span className={`tab-count ${tone ?? ""}`}>{count}</span> : null}
    </button>
  );
}

function Avatar({ conversation }) {
  if (conversation.avatar) {
    return <img className="avatar" src={conversation.avatar} alt="" />;
  }

  return <span className={`avatar avatar-fallback ${conversation.channel.toLowerCase()}`}>{conversation.initials}</span>;
}

function ChatPane({ conversation, topic, onTopic, composeMode, setComposeMode, draft, setDraft, onSend, templates, onSaveTemplate, isClosed }) {
  return (
    <section className="chat-pane" aria-label="Окно чата">
      <header className="chat-header">
        <div className="chat-identity">
          <Avatar conversation={conversation} />
          <div>
            <h1>{conversation.name}</h1>
            <span>{conversation.phone}</span>
          </div>
        </div>
        <div className="chat-actions">
          <button aria-label="Дополнительно"><MoreHorizontal size={21} /></button>
          <button aria-label="Информация"><Info size={20} /></button>
        </div>
        <label className="topic-select">
          <span>Тематика:</span>
          <select value={topic} onChange={(event) => onTopic(event.target.value)}>
            <option value="">Не выбрана</option>
            {topicOptions.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="chat-transcript">
        <div className="day-divider">Сегодня</div>
        {conversation.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>

      <Composer
        mode={composeMode}
        setMode={setComposeMode}
        draft={draft}
        setDraft={setDraft}
        onSend={onSend}
        templates={templates}
        onSaveTemplate={onSaveTemplate}
        disabled={isClosed}
      />
    </section>
  );
}

function MessageBubble({ message }) {
  if (message.type === "event") {
    return (
      <div className="system-event">
        <span>{message.text}</span>
        <time>{message.time}</time>
      </div>
    );
  }

  if (message.type === "internal") {
    return (
      <article className="internal-note">
        <strong>Внутренний комментарий</strong>
        <p>{message.text}</p>
        <footer>
          <span>{message.author}</span>
          <time>{message.time}</time>
        </footer>
      </article>
    );
  }

  return (
    <article className={`message-bubble ${message.side}`}>
      <p>{message.text}</p>
      <time>{message.time}</time>
    </article>
  );
}

function Composer({ mode, setMode, draft, setDraft, onSend, templates, onSaveTemplate, disabled }) {
  const primaryTemplate = templates[0];

  return (
    <section className={`composer ${mode === "internal" ? "internal-mode" : ""}`}>
      <div className="composer-tabs">
        <button className={mode === "reply" ? "active" : ""} onClick={() => setMode("reply")} disabled={disabled}>
          <MessageCircle size={17} />
          Ответ клиенту
        </button>
        <button className={mode === "internal" ? "active" : ""} onClick={() => setMode("internal")} disabled={disabled}>
          <Info size={17} />
          Внутренний комментарий
        </button>
        <button onClick={() => primaryTemplate && setDraft(primaryTemplate.text)} disabled={disabled || !primaryTemplate} type="button">
          <BookOpen size={17} />
          Шаблоны
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={disabled ? "Диалог закрыт" : mode === "internal" ? "Текст увидят только сотрудники..." : "Введите сообщение..."}
        disabled={disabled}
      />
      <footer className="composer-footer">
        <div className="composer-tools">
          <button aria-label="Прикрепить файл" disabled={disabled}><Paperclip size={18} /></button>
          <button aria-label="Добавить эмодзи" disabled={disabled}>☺</button>
          <button aria-label="Сохранить как шаблон" disabled={disabled} onClick={onSaveTemplate} title="Сохранить как шаблон" type="button"><BookOpen size={18} /></button>
          <button aria-label="ИИ-подсказка" disabled={disabled}><Sparkles size={18} /></button>
        </div>
        <button className="send-button" onClick={onSend} disabled={disabled}>
          <Send size={18} />
          {mode === "internal" ? "Сохранить" : "Отправить"}
        </button>
      </footer>
    </section>
  );
}

function CustomerPanel({ conversation, topic, onTopic, setDraft, templates, onClose, isClosed }) {
  return (
    <aside className="customer-panel" aria-label="Карточка клиента">
      <PanelSection title="О клиенте" action={<button aria-label="Копировать"><Copy size={18} /></button>}>
        <InfoRow label="Телефон" value={conversation.phone} />
        <InfoRow label="Устройство" value={conversation.device} icon={<Smartphone size={15} />} />
        <InfoRow label="Точка входа" value={conversation.entry} />
        <InfoRow label="Клиент с" value={conversation.clientSince} />
        <InfoRow label="Язык" value={conversation.language} />
        <div className="channel-list">
          <span>Канал(ы)</span>
          <div>
            {["SDK", "Telegram", "MAX", "VK"].map((channel) => (
              <span className={`channel-chip ${channel.toLowerCase()}`} key={channel}>{channel}</span>
            ))}
          </div>
        </div>
      </PanelSection>

      <PanelSection title="Предыдущие диалоги" action={<button>Смотреть все</button>}>
        <div className="history-list">
          {(conversation.previous.length ? conversation.previous : [["-", "Истории пока нет", "Новый"]]).map(([date, title, status]) => (
            <div className="history-row" key={`${date}${title}`}>
              <time>{date}</time>
              <span>{title}</span>
              <b>{status}</b>
            </div>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Теги" action={<button><Plus size={16} /> Добавить тег</button>}>
        <div className="tag-list">
          {conversation.tags.map((tag) => (
            <span key={tag}>{tag}<button aria-label={`Удалить тег ${tag}`}>×</button></span>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Рекомендуемые шаблоны">
        <div className="template-list">
          {templates.slice(0, 3).map((template) => (
            <button key={template.id} onClick={() => setDraft(template.text)}>
              <span>
                <strong>{template.title}</strong>
                <small>{template.scope} · {template.channel}</small>
              </span>
              <b>Вставить</b>
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Рекомендуемые статьи">
        <div className="article-list">
          {["Отслеживание заказа", "Сроки и условия доставки"].map((title) => (
            <button key={title}>
              <span>
                <strong>{title}</strong>
                <small>{title === "Отслеживание заказа" ? "Инструкция" : "Статья"}</small>
              </span>
              <FileText size={17} />
            </button>
          ))}
        </div>
      </PanelSection>

      <PanelSection title="Закрытие диалога">
        <label className="close-topic">
          <span>Тематика</span>
          <select value={topic} onChange={(event) => onTopic(event.target.value)} disabled={isClosed}>
            <option value="">Не выбрана</option>
            {topicOptions.map((option) => (
              <option value={option} key={option}>{option}</option>
            ))}
          </select>
        </label>
        <button className="close-button" onClick={onClose} disabled={isClosed || !topic}>
          {isClosed ? <ShieldCheck size={17} /> : <Lock size={17} />}
          {isClosed ? "Закрыт" : "Закрыть"}
        </button>
        {!topic ? (
          <p className="close-warning">
            <AlertTriangle size={16} />
            Для закрытия укажите тематику
          </p>
        ) : null}
      </PanelSection>
    </aside>
  );
}

function PanelSection({ title, action, children }) {
  return (
    <section className="panel-section">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function InfoRow({ label, value, icon }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
      {icon}
    </div>
  );
}

function SectionPlaceholder({ section, onBack, conversations, templates, onTemplatesChange, onToast }) {
  const screenProps = { onBack, conversations, templates, onTemplatesChange, onToast };

  if (section === "panel") {
    return <PanelScreen {...screenProps} />;
  }

  if (section === "clients") {
    return <ClientsScreen {...screenProps} />;
  }

  if (section === "templates") {
    return <TemplatesScreen {...screenProps} />;
  }

  if (section === "reports") {
    return <ReportsScreen {...screenProps} />;
  }

  if (section === "settings") {
    return <SettingsScreen {...screenProps} />;
  }

  const labels = {
    panel: "Панель смены",
    clients: "Клиенты",
    templates: "Шаблоны",
    reports: "Отчеты",
    settings: "Настройки"
  };

  return (
    <section className="secondary-screen">
      <div className="secondary-header">
        <button onClick={onBack}><ChevronLeft size={18} /> Диалоги</button>
        <h1>{labels[section]}</h1>
        <p>Раздел подготовлен как часть навигации первого фронтенд-среза.</p>
      </div>
      <div className="secondary-grid">
        <MetricCard icon={<Gauge size={22} />} label="Операторы онлайн" value="18" trend="+3 к часу назад" />
        <MetricCard icon={<Clock3 size={22} />} label="В перерыве" value="4" trend="среднее 12 мин" />
        <MetricCard icon={<Inbox size={22} />} label="Активные диалоги" value="126" trend="82% в SLA" />
        <MetricCard icon={<Bot size={22} />} label="Обработано ботом" value="37" trend="за смену" />
      </div>
      <div className="secondary-table">
        <header>
          <h2>Очереди и каналы</h2>
          <button><Plus size={16} /> Добавить настройку</button>
        </header>
        {["SDK", "Telegram", "MAX", "VK"].map((channel, index) => (
          <div className="table-row" key={channel}>
            <span className={`channel-chip ${channel.toLowerCase()}`}>{channel}</span>
            <b>{42 - index * 7} активных</b>
            <span>{8 + index} ожидают</span>
            <span>{index === 0 ? "лимит 12 на оператора" : "лимит 8 на оператора"}</span>
            <button><SlidersHorizontal size={16} /> Настроить</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ icon, label, value, trend }) {
  return (
    <article className="metric-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{trend}</small>
    </article>
  );
}

function Toast({ message, onClose }) {
  return (
    <button className="toast" onClick={onClose}>
      <CircleGauge size={18} />
      {message}
    </button>
  );
}

export default App;
