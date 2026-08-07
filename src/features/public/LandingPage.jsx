import React from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  Code2,
  Gauge,
  GitBranch,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Webhook,
  Zap
} from "lucide-react";
import { publicCatalogService } from "../../services/publicCatalogService.js";
import { commercialPageDefinitions } from "../../public/content/commercialPageDefinitions.js";
import operatorCockpitPreview from "../../assets/operator-cockpit-concept.jpg";
import "./public.css";

const noop = () => {};

const heroStats = [
  ["Web SDK", "сообщения, файлы, presence и CSAT"],
  ["SLA", "назначение, паузы и rescue"],
  ["1–70", "мест в текущей тарифной сетке"]
];

const aiHighlights = [
  {
    icon: BookOpen,
    title: "Знания под контролем",
    text: "Статьи, документы, страницы и MCP-источники с предпросмотром «что знает бот»."
  },
  {
    icon: ShieldCheck,
    title: "Рамки ответов",
    text: "О чём молчать, когда сразу звать человека, обязателен ли источник."
  },
  {
    icon: MessageCircle,
    title: "Живой тест-чат",
    text: "Проверьте бота как клиент и увидьте, «как он думал»: триггер, источники, токены."
  },
  {
    icon: GitBranch,
    title: "Handoff с контекстом",
    text: "Оператор получает цель, AI-исход, цитаты и причину передачи."
  }
];

const channelItems = [
  { key: "web-sdk", name: "Web SDK", icon: Code2, tint: "blue", status: "реализовано", live: true, text: "Идентификация посетителя, сообщения, файлы, presence и оценки после настройки SDK key и домена." },
  { key: "telegram", name: "Telegram", icon: Send, tint: "sky", status: "требует настройки", live: true, text: "Входящие диалоги и ответы операторов через бота после подключения действующего bot token." },
  { key: "vk", name: "ВКонтакте", mark: "VK", tint: "vk", status: "требует live-проверки", live: false, text: "Интеграционный контур реализован; перед сильным production claim нужна приёмка с реальными credentials." },
  { key: "max", name: "MAX", mark: "MAX", tint: "max", status: "требует live-проверки", live: false, text: "Интеграционный контур реализован; публичный live-статус подтверждается отдельной приёмкой." },
  { key: "rest-api", name: "REST API", icon: Webhook, tint: "blue", status: "реализовано", live: true, text: "Публичный API и Open Channel для поддерживаемых интеграционных сценариев." },
  { key: "whatsapp", name: "WhatsApp", icon: MessageSquare, tint: "green", status: "на подключении", live: false, text: "Бизнес-переписка и шаблоны сообщений — в той же операционной ленте." },
  { key: "email", name: "Email", icon: Mail, tint: "violet", status: "на подключении", live: false, text: "Обращения на почту превращаются в диалоги с тематиками и SLA." },
  { key: "viber", name: "Viber", icon: Phone, tint: "purple", status: "на подключении", live: false, text: "Ещё один канал мессенджеров — подключается как управляемый источник событий." }
];

const workflowSteps = [
  {
    title: "Подключите каналы",
    text: "Настройте SDK key и разрешённый домен для сайта или подключите Telegram-бота с действующим токеном."
  },
  {
    title: "Настройте смену",
    text: "Задайте роли, лимиты, тематики и правила SLA; назначения и rescue остаются управляемыми действиями команды."
  },
  {
    title: "Контролируйте качество",
    text: "Используйте клиентские оценки, ручные проверки, отчёты с XLSX-выгрузкой и доступные события аудита."
  }
];

const capabilityItems = [
  {
    icon: MessageSquare,
    title: "Омниканальная очередь",
    text: "SDK и Telegram в одной ленте с SLA, тематиками и передачей между сотрудниками."
  },
  {
    icon: ShieldCheck,
    title: "Проверка качества",
    text: "Оценки клиентов, ручные проверки и правила проверки текста с журналом действий."
  },
  {
    icon: Gauge,
    title: "Контроль смены",
    text: "Лимиты по операторам, загрузка очередей, спасение просроченных диалогов."
  },
  {
    icon: BarChart3,
    title: "Отчёты и качество",
    text: "Отчёты по диалогам, первому ответу, SLA и назначениям с XLSX-выгрузкой."
  }
];

const faqItems = [
  {
    question: "Сколько занимает запуск?",
    answer: "Регистрация создаёт Free-организацию. Срок подключения зависит от выбранного канала, домена, credentials и проверки интеграции."
  },
  {
    question: "Какие каналы поддерживаются?",
    answer: "Web SDK и REST API реализованы, Telegram требует настройки bot token. Для публичного live-статуса ВКонтакте и MAX нужна отдельная приёмка с реальными credentials; WhatsApp, Email и Viber не заявляются работающими."
  },
  {
    question: "Что входит в Free?",
    answer: "Free создаёт рабочую организацию с одним оператором-владельцем. Карта не нужна; тариф меняет администратор платформы, когда команде потребуются дополнительные места."
  },
  {
    question: "Как защищены данные?",
    answer: "В продукте реализованы роли и блокировки, изоляция организаций и журнал доступных событий. Соответствие конкретным законам или внешним стандартам требует отдельного подтверждения."
  },
  {
    question: "Можно ли выгружать отчёты?",
    answer: "Да — отчёты по диалогам, первому ответу, SLA и назначениям выгружаются в XLSX; аудит доступен через API."
  }
];

const tariffFeatureLabels = {
  "advanced-automation": "Автоматизация повторяющихся задач",
  "basic-analytics": "Основные показатели работы",
  "custom-integrations": "Подключение нужных вам сервисов",
  "custom-sla": "Согласованный срок ответа службы поддержки",
  "data-residency": "Хранение данных в выбранной стране",
  "dedicated-success": "Персональный менеджер",
  "email-support": "Поддержка по электронной почте",
  exports: "Выгрузка данных",
  omnichannel: "Обращения из разных каналов в одном месте",
  routing: "Распределение обращений между сотрудниками",
  "shared-inbox": "Все обращения в одном окне",
  "website-chat": "Чат на сайте",
  sla: "Контроль времени ответа",
  sso: "Единый вход для сотрудников",
  "quality-ai": "Проверка качества ответов с помощью искусственного интеллекта"
};

export function LandingPage({
  demoRequestEnabled = false,
  onDemoOpen = noop,
  onNavigateAuth = noop,
  onRequestDemo = noop,
  onStartFree = noop
}) {
  const [requestDialog, setRequestDialog] = React.useState(null);
  const [requestForm, setRequestForm] = React.useState(defaultRequestForm());
  const [requestState, setRequestState] = React.useState({ error: "", submitting: false });
  const [tariffs, setTariffs] = React.useState([]);
  const [publicStatus, setPublicStatus] = React.useState("checking");
  const handleDemoRequest = demoRequestEnabled
    ? (options = {}) => openRequestDialog(options)
    : undefined;

  React.useEffect(() => {
    let ignore = false;
    void Promise.all([publicCatalogService.fetchHealth(), publicCatalogService.fetchTariffs()]).then(([health, catalog]) => {
      if (ignore) return;
      setPublicStatus(health.status === "ok" ? "available" : "unavailable");
      setTariffs(catalog.status === "ok" && Array.isArray(catalog.data?.items) ? catalog.data.items : []);
    });
    return () => { ignore = true; };
  }, []);

  React.useEffect(() => {
    if (!demoRequestEnabled || typeof window === "undefined") return;
    const demoSource = new URLSearchParams(window.location.search).get("demo");
    if (demoSource !== "ai-support-bot") return;

    window.history.replaceState(null, "", `${window.location.pathname}#request-demo`);
    openRequestDialog({
      planInterest: "ai",
      source: "ai-support-bot-landing",
      title: "Демо AI-сценария поддержки"
    });
  }, [demoRequestEnabled, onDemoOpen]);

  function openRequestDialog({ planInterest = "business", source = "landing-hero", title = "Демо по запросу" } = {}) {
    onDemoOpen();
    setRequestDialog({ source, title });
    setRequestForm(defaultRequestForm({ planInterest, source }));
    setRequestState({ error: "", submitting: false });
  }

  function updateRequestForm(field, value) {
    setRequestForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function submitRequestForm(event) {
    event.preventDefault();
    if (requestState.submitting || !requestDialog) {
      return;
    }

    setRequestState({ error: "", submitting: true });
    const response = await onRequestDemo({
      ...requestForm,
      source: requestDialog.source
    });

    if (response?.status === "ok") {
      setRequestDialog(null);
      setRequestState({ error: "", submitting: false });
      return;
    }

    setRequestState({
      error: response?.error?.message ?? "Не удалось отправить заявку.",
      submitting: false
    });
  }

  const apiStatusLabel = publicStatus === "available" ? "доступен" : publicStatus === "unavailable" ? "недоступен" : "проверяется";

  return (
    <main className="public-page">
      <header className="public-nav" aria-label="Публичная навигация">
        <button className="public-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button">
          <span>SC</span>
          <strong>Support Communication</strong>
        </button>
        <nav>
          <a href="#capabilities">Возможности</a>
          <a href="#ai-agent">ИИ-бот</a>
          <a href="#channels">Каналы</a>
          <a href="/pricing/">Тарифы</a>
          <a href="/docs/">Документация API</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="public-nav-actions">
          <button className="public-btn ghost" onClick={onNavigateAuth} type="button">Войти</button>
          <button className="public-btn primary" onClick={() => onStartFree({ plan: "free", source: "landing-nav" })} type="button">
            Начать бесплатно
            <ArrowRight size={15} />
          </button>
        </div>
      </header>

      <section className="public-hero" aria-labelledby="public-hero-title">
        <div className="public-hero-copy">
          <span className="public-hero-badge"><Zap size={14} /> Web SDK, очередь и рабочее место оператора</span>
          <h1 id="public-hero-title">Вся поддержка клиентов — в&nbsp;одном операционном контуре</h1>
          <p>
            Web SDK на сайте, Telegram после настройки, лимиты операторов, SLA, отчёты и аудит
            объединены в рабочем месте смены.
          </p>
          <div className="public-hero-actions">
            <button className="public-btn primary large" onClick={() => onStartFree({ plan: "free", source: "landing-hero" })} type="button">
              Начать бесплатно
              <ArrowRight size={17} />
            </button>
            <button
              className="public-btn secondary large"
              disabled={!demoRequestEnabled}
              onClick={() => handleDemoRequest?.({ planInterest: "business", source: "landing-hero", title: "Демо по запросу" })}
              type="button"
            >
              Демо по запросу
            </button>
          </div>
          <div className="public-hero-stats">
            {heroStats.map(([value, caption], index) => (
              <React.Fragment key={caption}>
                {index ? <div className="public-hero-stat-divider" aria-hidden="true" /> : null}
                <div className="public-hero-stat">
                  <strong>{value}</strong>
                  <span>{caption}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="public-product-preview" aria-label="Демонстрационный пример интерфейса оператора — без клиентских данных">
          <div className="public-preview-topbar">
            <span><Activity size={15} /> Рабочее место оператора</span>
            <span>Демонстрационный пример · без клиентских данных</span>
          </div>
          <img
            alt="Рабочее место оператора: очередь диалогов, чат с клиентом и карточка клиента"
            height={759}
            src={operatorCockpitPreview}
            width={1200}
          />
        </div>
      </section>

      <section className="public-ai" id="ai-agent" aria-labelledby="ai-agent-title">
        <div className="public-ai-inner">
          <div className="public-ai-copy">
            <span className="public-ai-badge"><Bot size={14} /> Встроенный ИИ-агент</span>
            <h2 id="ai-agent-title">Бот отвечает первым, оператор — когда правда нужен</h2>
            <p>
              Консультационный бот собирается без кода: подключите источники знаний, задайте ключевые
              фразы и рамки ответов. Сложный вопрос он передаёт оператору вместе с историей и причиной.
            </p>
            <div className="public-ai-highlights">
              {aiHighlights.map(({ icon: Icon, title, text }) => (
                <div className="public-ai-highlight" key={title}>
                  <Icon size={18} />
                  <div>
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="public-ai-chat" aria-label="Пример диалога консультационного бота">
            <header>
              <span className="public-ai-chat-title">
                <span className="public-ai-chat-avatar"><Bot size={13} /></span>
                Сценарий «Оплата и возвраты»
              </span>
            <span>демонстрационный сценарий</span>
            </header>
            <div className="public-ai-chat-body">
              <div className="public-ai-message client">Как вернуть деньги за отменённый заказ?</div>
              <div className="public-ai-message bot">
                Срок возврата зависит от правил вашей компании. Подскажите номер заказа — проверю
                доступный сценарий или передам диалог оператору.
              </div>
              <div className="public-ai-trace">
                <Search size={14} />
                <span><b>Как бот обработал пример:</b> триггер «возврат» · демонстрационный источник «Политика возвратов»</span>
              </div>
              <div className="public-ai-handoff">
                <UserRound size={14} />
                <span><b>Передача оператору:</b> клиент просит частичный возврат — тема вне рамок бота</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section public-channels" id="channels" aria-labelledby="channels-title">
        <div className="public-section-heading">
          <h2 id="channels-title">Каналы, где живут ваши клиенты</h2>
          <p>
            Статус каждого канала указан отдельно: реализованный код не подменяет настройку credentials
            и live-приёмку внешнего провайдера.
          </p>
        </div>
        <div className="public-channel-grid">
          {channelItems.map(({ key, name, icon: Icon, mark, tint, status, live, text }) => (
            <article className={`public-channel-card${live ? "" : " pending"}`} key={key}>
              <div className="public-channel-top">
                <span className={`public-channel-tile ${tint}`}>{Icon ? <Icon size={19} /> : <b>{mark}</b>}</span>
                <span className={`public-channel-status${live ? "" : " pending"}`}>{status}</span>
              </div>
              <strong>{name}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-steps" aria-labelledby="steps-title">
        <div className="public-section-heading">
          <h2 id="steps-title">Как это работает</h2>
          <p>Три управляемых этапа от регистрации до проверки рабочего сценария поддержки.</p>
        </div>
        <div className="public-step-grid">
          {workflowSteps.map(({ title, text }, index) => (
            <article className="public-step-card" key={title}>
              <span>{index + 1}</span>
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-capabilities" id="capabilities" aria-labelledby="capabilities-title">
        <h2 id="capabilities-title">Возможности для смены и руководителя</h2>
        <div className="public-capability-grid">
          {capabilityItems.map(({ icon: Icon, title, text }) => (
            <article className="public-capability-card" key={title}>
              <Icon size={22} />
              <strong>{title}</strong>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-tariffs" id="tariffs" aria-labelledby="tariffs-title">
        <div className="public-section-heading">
          <h2 id="tariffs-title">Тарифы без скрытых контуров</h2>
          <p>Free создаёт рабочую организацию с одним оператором-владельцем. Расширение тарифа выполняется через администратора платформы.</p>
        </div>
        <div className="public-tariff-grid">
          {tariffs.map((tariff) => {
            const isFeatured = tariff.id === "free";
            const isEnterprise = tariff.id === "enterprise";
            const isPaidPerOperator = tariff.billingAvailability !== "free" && !isEnterprise;
            return (
              <article
                className={`public-tariff-card${isFeatured ? " featured" : ""}${isEnterprise ? " enterprise" : ""}`}
                key={tariff.id}
              >
                <header>
                  <strong>{tariff.name}</strong>
                  <span>{isFeatured ? "Чтобы попробовать сервис" : isEnterprise ? "Для компаний с особыми требованиями" : `Для команды до ${tariff.includedUsers} сотрудников`}</span>
                </header>
                <div className="public-price-row">
                  <div className="public-price">{tariff.billingAvailability === "free" ? "Бесплатно" : isEnterprise ? "Индивидуально" : formatTariffPrice(tariff.priceMonthly)}</div>
                  {isPaidPerOperator ? <span>за сотрудника<br />в месяц</span> : null}
                </div>
                <p className="public-tariff-audience">{tariff.billingAvailability === "free" ? "Для одного сотрудника — владельца организации" : isEnterprise ? `До ${tariff.includedUsers} сотрудников` : `До ${tariff.includedUsers} сотрудников в команде`}</p>
                <ul>
                  {(tariff.features ?? []).map((feature) => (
                    <li key={feature}><CheckCircle2 aria-hidden="true" size={16} /> <span>{tariffFeatureLabels[feature] ?? feature}</span></li>
                  ))}
                </ul>
                {isEnterprise ? (
                  <button
                    className="public-btn secondary"
                    disabled={!demoRequestEnabled}
                    onClick={() => handleDemoRequest?.({ planInterest: "enterprise", source: "landing-tariff-contact", title: "Контакт по запросу" })}
                    type="button"
                  >
                    Связаться с нами
                    <ArrowRight aria-hidden="true" size={16} />
                  </button>
                ) : (
                  <button
                    className={`public-btn ${isFeatured ? "primary" : "secondary"}`}
                    onClick={() => onStartFree({ plan: "free", source: "landing-tariff" })}
                    type="button"
                  >
                    {isFeatured ? "Начать бесплатно" : "Попробовать бесплатно"}
                    <ArrowRight aria-hidden="true" size={16} />
                  </button>
                )}
              </article>
            );
          })}
          {!tariffs.length ? <p>Каталог тарифов временно недоступен. Оставьте заявку для уточнения условий.</p> : null}
        </div>
      </section>

      <section className="public-section public-faq" id="faq" aria-labelledby="faq-title">
        <div className="public-faq-intro">
          <h2 id="faq-title">Частые вопросы</h2>
          <p>Не нашли ответа — отправьте заявку на демо, чтобы команда уточнила ваш сценарий.</p>
        </div>
        <div className="public-faq-list">
          {faqItems.map(({ question, answer }, index) => (
            <details key={question} open={index === 0}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="public-section public-cta" aria-labelledby="cta-title">
        <div className="public-cta-band">
          <div>
            <strong id="cta-title">Начните настройку поддержки</strong>
            <span>Free создаёт организацию для одного владельца; подключение каналов проверяется отдельно.</span>
          </div>
          <button className="public-btn primary large" onClick={() => onStartFree({ plan: "free", source: "landing-cta" })} type="button">
            Начать бесплатно
            <ArrowRight size={17} />
          </button>
        </div>
      </section>

      <footer className="public-footer">
        <div className="public-footer-grid">
          <div className="public-footer-brand">
            <div>
              <span>SC</span>
              <strong>Support Communication</strong>
            </div>
            <p>Операционный контур поддержки: каналы, очередь, качество и аудит в одном продукте.</p>
          </div>
          <div className="public-footer-column">
            <strong>Продукт</strong>
            <a href="#capabilities">Возможности</a>
            <a href="/pricing/">Тарифы</a>
            <a href="#channels">Каналы и SDK</a>
            <span>Статус API: {apiStatusLabel}</span>
          </div>
          <div className="public-footer-column">
            <strong>Решения и ресурсы</strong>
            {commercialPageDefinitions.map((page) => (
              <a href={page.pathname} key={page.id}>{page.breadcrumbLabel}</a>
            ))}
            <a href="/docs/">Документация API</a>
          </div>
          <div className="public-footer-column">
            <strong>Контакты</strong>
            <span>sales@supportcom.ru</span>
            <span>Telegram: @supportcomm</span>
            <span>Демо по запросу</span>
          </div>
        </div>
        <div className="public-footer-bottom">
          <span>© 2026 Support Communication</span>
          <span>Политика обработки данных · Условия сервиса</span>
        </div>
      </footer>

      {requestDialog ? (
        <div className="public-dialog-backdrop">
          <section
            aria-labelledby="public-demo-request-title"
            aria-modal="true"
            className="public-request-dialog"
            data-testid="public-demo-request-dialog"
            id="request-demo"
            role="dialog"
          >
            <header>
              <div>
                <h2 id="public-demo-request-title">{requestDialog.title}</h2>
                <p>Оставьте рабочие контакты, чтобы команда сервиса подготовила маршрут демо.</p>
              </div>
              <button aria-label="Закрыть заявку" onClick={() => setRequestDialog(null)} type="button">Закрыть</button>
            </header>

            <form onSubmit={submitRequestForm}>
              <div className="public-request-grid">
                <label>
                  <span>Имя</span>
                  <input
                    autoComplete="name"
                    name="name"
                    onChange={(event) => updateRequestForm("name", event.target.value)}
                    required
                    value={requestForm.name}
                  />
                </label>
                <label>
                  <span>Компания</span>
                  <input
                    autoComplete="organization"
                    name="company"
                    onChange={(event) => updateRequestForm("company", event.target.value)}
                    required
                    value={requestForm.company}
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    autoComplete="email"
                    name="email"
                    onChange={(event) => updateRequestForm("email", event.target.value)}
                    required
                    type="email"
                    value={requestForm.email}
                  />
                </label>
                <label>
                  <span>Тариф</span>
                  <select
                    name="planInterest"
                    onChange={(event) => updateRequestForm("planInterest", event.target.value)}
                    value={requestForm.planInterest}
                  >
                    {tariffs.length ? tariffs.map((tariff) => <option key={tariff.id} value={tariff.id}>{tariff.name}</option>) : <option value={requestForm.planInterest}>Уточнить условия</option>}
                  </select>
                </label>
              </div>
              <label className="public-request-message">
                <span>Сообщение</span>
                <textarea
                  name="message"
                  onChange={(event) => updateRequestForm("message", event.target.value)}
                  required
                  rows={4}
                  value={requestForm.message}
                />
              </label>
              <label className="public-request-consent">
                <input
                  checked={requestForm.consent}
                  name="consent"
                  onChange={(event) => updateRequestForm("consent", event.target.checked)}
                  required
                  type="checkbox"
                />
                <span>Согласие на обработку заявки</span>
              </label>
              <label aria-hidden="true" className="public-request-website">
                <span>Website</span>
                <input
                  autoComplete="off"
                  name="website"
                  onChange={(event) => updateRequestForm("website", event.target.value)}
                  tabIndex={-1}
                  value={requestForm.website}
                />
              </label>
              {requestState.error ? <p className="public-request-error" role="alert">{requestState.error}</p> : null}
              <footer>
                <button className="public-btn text" onClick={() => setRequestDialog(null)} type="button">Отмена</button>
                <button
                  className="public-btn primary"
                  data-testid="public-demo-request-submit"
                  disabled={requestState.submitting}
                  type="submit"
                >
                  {requestState.submitting ? "Отправка" : "Отправить заявку"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default LandingPage;

function formatTariffPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) ? `${new Intl.NumberFormat("ru-RU").format(price / 100)} ₽` : "По запросу";
}

function defaultRequestForm(overrides = {}) {
  return {
    company: "",
    consent: false,
    email: "",
    message: "",
    name: "",
    planInterest: "business",
    source: "landing-hero",
    website: "",
    ...overrides
  };
}
