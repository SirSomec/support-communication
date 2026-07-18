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
import operatorCockpitPreview from "../../assets/operator-cockpit-concept.png";
import "./public.css";

const noop = () => {};

const heroStats = [
  ["−38%", "время первого ответа за месяц"],
  ["100%", "действий — в журнале аудита"],
  ["1 день", "от регистрации до первого диалога"]
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
  { key: "web-sdk", name: "Web SDK", icon: Code2, tint: "blue", status: "работает", live: true, text: "Виджет на сайт одной строкой: идентификация посетителя, диалоги, вложения." },
  { key: "telegram", name: "Telegram", icon: Send, tint: "sky", status: "работает", live: true, text: "Входящие диалоги и ответы операторов через бота, подключение по токену." },
  { key: "vk", name: "ВКонтакте", mark: "VK", tint: "vk", status: "работает", live: true, text: "Приём и отправка сообщений сообщества в общей ленте со всеми каналами." },
  { key: "max", name: "MAX", mark: "MAX", tint: "max", status: "работает", live: true, text: "Полный приём и отправка сообщений в национальном мессенджере MAX." },
  { key: "rest-api", name: "REST API", icon: Webhook, tint: "blue", status: "работает", live: true, text: "Клиенты, диалоги, отчёты, webhooks и audit export для любых интеграций." },
  { key: "whatsapp", name: "WhatsApp", icon: MessageSquare, tint: "green", status: "на подключении", live: false, text: "Бизнес-переписка и шаблоны сообщений — в той же операционной ленте." },
  { key: "email", name: "Email", icon: Mail, tint: "violet", status: "на подключении", live: false, text: "Обращения на почту превращаются в диалоги с тематиками и SLA." },
  { key: "viber", name: "Viber", icon: Phone, tint: "purple", status: "на подключении", live: false, text: "Ещё один канал мессенджеров — подключается как управляемый источник событий." }
];

const workflowSteps = [
  {
    title: "Подключите каналы",
    text: "Web SDK вставляется одной строкой, Telegram-бот подключается по токену. Первое сообщение — через минуты."
  },
  {
    title: "Настройте смену",
    text: "Роли, лимиты операторов, тематики и SLA — очередь сама распределяет и спасает просроченные диалоги."
  },
  {
    title: "Контролируйте качество",
    text: "Оценки клиентов, проверки текста, отчёты с XLSX-выгрузкой и журнал аудита каждого действия."
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

const testimonialItems = [
  {
    quote: "«Перевели поддержку из трёх чатов в одну очередь. Первый ответ ускорился почти вдвое, и наконец видно, кто чем занят.»",
    initial: "М",
    author: "Марина, руководитель поддержки",
    meta: "интернет-ритейл · пример отзыва"
  },
  {
    quote: "«SDK подключили за вечер. Больше не теряем обращения с сайта — всё падает в ту же очередь, что и Telegram.»",
    initial: "А",
    author: "Алексей, владелец бизнеса",
    meta: "онлайн-сервис · пример отзыва"
  },
  {
    quote: "«Для нас критичен аудит: каждое действие оператора в журнале, PII маскируется. Security-ревью прошли без замечаний.»",
    initial: "Д",
    author: "Дмитрий, ИБ-директор",
    meta: "финтех · пример отзыва"
  }
];

const faqItems = [
  {
    question: "Сколько занимает запуск?",
    answer: "Обычно один день: регистрация создаёт рабочую организацию, SDK ставится одной строкой, Telegram подключается по токену бота."
  },
  {
    question: "Какие каналы поддерживаются?",
    answer: "Web SDK, Telegram, ВКонтакте, MAX и REST API уже работают в продакшене. WhatsApp, Email и Viber — на подключении."
  },
  {
    question: "Как устроен trial?",
    answer: "Trial стартует с полноценной организацией: первый администратор, лимиты операторов и тестовое сообщение. Карта не нужна."
  },
  {
    question: "Как защищены данные?",
    answer: "Email OTP, роли и блокировки, изоляция организаций, маскирование PII и полный журнал аудита с экспортом."
  },
  {
    question: "Можно ли выгружать отчёты?",
    answer: "Да — отчёты по диалогам, первому ответу, SLA и назначениям выгружаются в XLSX; аудит доступен через API."
  }
];

const tariffFeatureLabels = {
  "advanced-automation": "Расширенная автоматизация",
  "basic-analytics": "Базовые отчёты",
  "custom-integrations": "Кастомные интеграции",
  "custom-sla": "Индивидуальный SLA",
  "data-residency": "Региональное хранение данных",
  "dedicated-success": "Выделенный CSM",
  "email-support": "Поддержка по email",
  exports: "Экспорт отчётов и аудита",
  omnichannel: "Омниканальная очередь",
  routing: "Маршрутизация диалогов",
  "shared-inbox": "Общая очередь",
  sla: "SLA-контроль",
  sso: "SAML и SSO",
  "quality-ai": "ИИ-оценка качества"
};

function ClientLogos() {
  const logoText = { fontFamily: "inherit", fontSize: 17, fontWeight: 800, letterSpacing: 0.4 };
  return (
    <div className="public-logo-row" role="img" aria-label="Примеры клиентов: Нордвэй, Контур, Пик, Ритм, Орбита">
      <svg viewBox="0 0 132 28" height="26">
        <path d="M4 22 12 6l6 10 4-6 6 12z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <text x="38" y="20" fill="currentColor" style={logoText}>НОРДВЭЙ</text>
      </svg>
      <svg viewBox="0 0 118 28" height="26">
        <circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <circle cx="14" cy="14" r="3.4" fill="currentColor" />
        <text x="34" y="20" fill="currentColor" style={logoText}>КОНТУР</text>
      </svg>
      <svg viewBox="0 0 76 28" height="26">
        <path d="M5 22 14 6l9 16z" fill="currentColor" />
        <text x="32" y="20" fill="currentColor" style={logoText}>ПИК</text>
      </svg>
      <svg viewBox="0 0 92 28" height="26">
        <rect x="5" y="13" width="4" height="9" rx="1.4" fill="currentColor" />
        <rect x="12" y="7" width="4" height="15" rx="1.4" fill="currentColor" />
        <rect x="19" y="10" width="4" height="12" rx="1.4" fill="currentColor" />
        <text x="33" y="20" fill="currentColor" style={logoText}>РИТМ</text>
      </svg>
      <svg viewBox="0 0 112 28" height="26">
        <ellipse cx="15" cy="14" rx="11" ry="5.6" fill="none" stroke="currentColor" strokeWidth="2" transform="rotate(-18 15 14)" />
        <circle cx="15" cy="14" r="3.2" fill="currentColor" />
        <text x="36" y="20" fill="currentColor" style={logoText}>ОРБИТА</text>
      </svg>
    </div>
  );
}

export function LandingPage({
  demoRequestEnabled = false,
  onNavigateAuth = noop,
  onRequestDemo = noop,
  onStartTrial = noop
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

  function openRequestDialog({ planInterest = "business", source = "landing-hero", title = "Демо по запросу" } = {}) {
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
          <a href="#tariffs">Тарифы</a>
          <a href="#/docs">Документация API</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="public-nav-actions">
          <button className="public-btn ghost" onClick={onNavigateAuth} type="button">Войти</button>
          <button className="public-btn primary" onClick={() => onStartTrial({ plan: "business", source: "landing-nav" })} type="button">
            Запустить trial
            <ArrowRight size={15} />
          </button>
        </div>
      </header>

      <section className="public-hero" aria-labelledby="public-hero-title">
        <div className="public-hero-copy">
          <span className="public-hero-badge"><Zap size={14} /> Запуск пилота за один день</span>
          <h1 id="public-hero-title">Вся поддержка клиентов — в&nbsp;одном операционном контуре</h1>
          <p>
            SDK на сайте, Telegram, лимиты операторов, SLA, отчёты и аудит — не набор витрин,
            а рабочее место смены, готовое к продакшену.
          </p>
          <div className="public-hero-actions">
            <button className="public-btn primary large" onClick={() => onStartTrial({ plan: "business", source: "landing-hero" })} type="button">
              Запустить trial бесплатно
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
            src={operatorCockpitPreview}
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
              <span>активен</span>
            </header>
            <div className="public-ai-chat-body">
              <div className="public-ai-message client">Как вернуть деньги за отменённый заказ?</div>
              <div className="public-ai-message bot">
                Возврат приходит на карту за 3–5 рабочих дней. Могу оформить заявку прямо сейчас —
                подскажите номер заказа.
              </div>
              <div className="public-ai-trace">
                <Search size={14} />
                <span><b>Как бот думал:</b> триггер «возврат» · источник «Политика возвратов v3» · 412 токенов · 0.9 с</span>
              </div>
              <div className="public-ai-handoff">
                <UserRound size={14} />
                <span><b>Передача оператору:</b> клиент просит частичный возврат — тема вне рамок бота</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="public-section public-logos" aria-label="Примеры клиентов">
        <span className="public-logos-caption">Поддержку на платформе строят команды — примеры клиентов</span>
        <ClientLogos />
      </section>

      <section className="public-section public-channels" id="channels" aria-labelledby="channels-title">
        <div className="public-section-heading">
          <h2 id="channels-title">Каналы, где живут ваши клиенты</h2>
          <p>
            Одна очередь для всех каналов. SDK на сайте, Telegram, ВКонтакте и MAX уже в продакшене;
            популярные мессенджеры индустрии — на подключении.
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
          <p>Три шага от регистрации до работающей поддержки — без внедренцев и месяцев настройки.</p>
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

      <section className="public-section public-testimonials" aria-labelledby="testimonials-title">
        <h2 id="testimonials-title">Что говорят команды</h2>
        <div className="public-testimonial-grid">
          {testimonialItems.map(({ quote, initial, author, meta }) => (
            <figure className="public-testimonial-card" key={author}>
              <blockquote>{quote}</blockquote>
              <figcaption>
                <span>{initial}</span>
                <div>
                  <strong>{author}</strong>
                  <small>{meta}</small>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="public-section public-tariffs" id="tariffs" aria-labelledby="tariffs-title">
        <div className="public-section-heading">
          <h2 id="tariffs-title">Тарифы без скрытых контуров</h2>
          <p>Trial начинается с рабочей организации: первый администратор, лимиты и тестовое сообщение уже внутри.</p>
        </div>
        <div className="public-tariff-grid">
          {tariffs.map((tariff) => {
            const isFeatured = tariff.id === "business";
            const isEnterprise = tariff.id === "enterprise";
            return (
              <article
                className={`public-tariff-card${isFeatured ? " featured" : ""}${isEnterprise ? " enterprise" : ""}`}
                key={tariff.id}
              >
                <header>
                  <strong>{tariff.name}</strong>
                  {isFeatured ? <span className="public-tariff-flag">популярный</span> : <span>в месяц</span>}
                </header>
                <div className="public-price">{isEnterprise ? "Индивидуально" : formatTariffPrice(tariff.priceMonthly)}</div>
                <p>{tariff.includedUsers} пользователей · {tariff.workspaceLimit} рабочих пространств</p>
                <ul>
                  {(tariff.features ?? []).map((feature) => (
                    <li key={feature}><CheckCircle2 size={15} /> {tariffFeatureLabels[feature] ?? feature}</li>
                  ))}
                </ul>
                {isEnterprise ? (
                  <button
                    className="public-btn secondary"
                    disabled={!demoRequestEnabled}
                    onClick={() => handleDemoRequest?.({ planInterest: "enterprise", source: "landing-tariff-contact", title: "Контакт по запросу" })}
                    type="button"
                  >
                    Контакт по запросу
                  </button>
                ) : (
                  <button
                    className={`public-btn ${isFeatured ? "primary" : "secondary"}`}
                    onClick={() => onStartTrial({ plan: tariff.id, source: "landing-tariff" })}
                    type="button"
                  >
                    {isFeatured ? "Запустить trial" : "Выбрать тариф"}
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
          <p>Не нашли ответа — напишите нам, отвечаем в рабочие часы в тот же день.</p>
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
            <strong id="cta-title">Запустите поддержку уже сегодня</strong>
            <span>Рабочая организация, SDK и Telegram — за один день. Без карты.</span>
          </div>
          <button className="public-btn primary large" onClick={() => onStartTrial({ plan: "business", source: "landing-cta" })} type="button">
            Запустить trial
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
            <a href="#tariffs">Тарифы</a>
            <a href="#channels">Каналы и SDK</a>
            <span>Статус API: {apiStatusLabel}</span>
          </div>
          <div className="public-footer-column">
            <strong>Ресурсы</strong>
            <a href="#/docs">Документация API</a>
            <span>Руководство по ИИ</span>
            <span>Безопасность</span>
          </div>
          <div className="public-footer-column">
            <strong>Контакты</strong>
            <span>sales@supportcomm.ru</span>
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
  return Number.isFinite(price) ? `${new Intl.NumberFormat("ru-RU").format(price)} ₽` : "По запросу";
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
