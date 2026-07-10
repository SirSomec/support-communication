import React from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Code2,
  CreditCard,
  Gauge,
  Globe2,
  Headphones,
  LifeBuoy,
  LockKeyhole,
  MessageSquare,
  PlugZap,
  RadioTower,
  Server,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import "./public.css";

const noop = () => {};

const capabilityItems = [
  {
    icon: MessageSquare,
    title: "Омниканальная очередь",
    text: "SDK, Telegram, MAX, VK и веб-чат в одной ленте с SLA, тематиками и передачей между сменами.",
    metric: "126 активных"
  },
  {
    icon: Bot,
    title: "AI и автоответы",
    text: "Подсказки оператору, извлечение интента, шаблоны и handoff в нужный момент без потери контекста.",
    metric: "37% закрыто ботом"
  },
  {
    icon: Gauge,
    title: "Контроль смены",
    text: "Лимиты по операторам, загрузка очередей, спасение просроченных диалогов и видимость руководителя.",
    metric: "82% в SLA"
  },
  {
    icon: BarChart3,
    title: "Отчеты и качество",
    text: "CSAT, FRT, AHT, QA-чеклисты, экспорт и аудит действий в одном рабочем контуре.",
    metric: "8 отчетов"
  }
];

const integrationItems = [
  ["Web SDK", "События visitor, conversation, message и unread counter"],
  ["Telegram", "Быстрый запуск бота с routing rules и retry delivery"],
  ["MAX", "Каналы поддержки с лимитами и тематиками"],
  ["VK", "Сообщества, вложения, операторские статусы"],
  ["REST API", "Клиенты, диалоги, отчеты, webhooks и audit export"],
  ["CRM", "Встраивание профиля клиента и истории обращений"]
];

const tariffItems = [
  {
    name: "Start",
    price: "19 900 ₽",
    period: "в месяц",
    description: "Для первой команды поддержки и одного основного канала.",
    features: ["5 операторов", "2 канала", "База знаний", "7 дней trial"],
    accent: "start"
  },
  {
    name: "Growth",
    price: "49 900 ₽",
    period: "в месяц",
    description: "Для нескольких смен, SDK, автоматизации и руководителей.",
    features: ["25 операторов", "Все каналы", "AI-подсказки", "SLA и отчеты"],
    accent: "growth"
  },
  {
    name: "Enterprise",
    price: "по договору",
    period: "SLA 99.9%",
    description: "Для multi-tenant, SSO, отдельных лимитов и расширенного аудита.",
    features: ["SSO/SAML", "Выделенные лимиты", "DPA и аудит", "Service support"],
    accent: "enterprise"
  }
];

const statusItems = [
  ["API", "99.98%", "ok"],
  ["Web SDK", "операционный", "ok"],
  ["Очереди", "без деградации", "ok"],
  ["Поддержка", "до 3 мин", "warn"]
];

const queueRows = [
  ["Мария", "Telegram", "Возврат заказа", "03:14", "warn"],
  ["Никита", "SDK", "Проблема оплаты", "00:48", "ok"],
  ["Алина", "VK", "Статус доставки", "08:21", "danger"]
];

export function LandingPage({
  demoRequestEnabled = false,
  onNavigateAuth = noop,
  onRequestDemo = noop,
  onStartTrial = noop
}) {
  const [requestDialog, setRequestDialog] = React.useState(null);
  const [requestForm, setRequestForm] = React.useState(defaultRequestForm());
  const [requestState, setRequestState] = React.useState({ error: "", submitting: false });
  const handleDemoRequest = demoRequestEnabled
    ? (options = {}) => openRequestDialog(options)
    : undefined;

  function openRequestDialog({ planInterest = "Growth", source = "landing-hero", title = "Демо по запросу" } = {}) {
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

  return (
    <main className="public-page">
      <header className="public-nav" aria-label="Публичная навигация">
        <button className="public-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button">
          <span>SC</span>
          <strong>Support Communication</strong>
        </button>
        <nav>
          <a href="#capabilities">Возможности</a>
          <a href="#integrations">SDK</a>
          <a href="#tariffs">Тарифы</a>
          <a href="#security">Безопасность</a>
        </nav>
        <div className="public-nav-actions">
          <button className="public-btn ghost" onClick={onNavigateAuth} type="button">Войти</button>
          <button className="public-btn primary" onClick={() => onStartTrial({ plan: "Growth", source: "landing-nav" })} type="button">
            Trial
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <section className="public-hero" aria-labelledby="public-hero-title">
        <div className="public-hero-copy">
          <h1 id="public-hero-title">Support Communication</h1>
          <p>
            Рабочее место для поддержки, где публичные каналы, SDK, операторские лимиты, AI-подсказки,
            отчеты и аудит собраны в один операционный контур.
          </p>
          <div className="public-hero-actions">
            <button className="public-btn primary large" onClick={() => onStartTrial({ plan: "Growth", source: "landing-hero" })} type="button">
              Запустить trial
              <ArrowRight size={18} />
            </button>
            <button
              className="public-btn secondary large"
              disabled={!demoRequestEnabled}
              onClick={() => handleDemoRequest?.({ planInterest: "Growth", source: "landing-hero", title: "Демо по запросу" })}
              type="button"
            >
              Демо по запросу
            </button>
            <button className="public-btn text" onClick={onNavigateAuth} type="button">
              Уже есть аккаунт
            </button>
          </div>
        </div>

        <div className="public-product-preview" aria-label="Превью рабочего интерфейса поддержки">
          <div className="public-preview-topbar">
            <span><Activity size={16} /> Операционный cockpit</span>
            <span>Смена: 18 операторов онлайн</span>
            <span>SLA: 82%</span>
          </div>
          <div className="public-preview-grid">
            <section className="public-queue-panel" aria-label="Очередь диалогов">
              <header>
                <strong>Очередь</strong>
                <small>126 активных</small>
              </header>
              {queueRows.map(([name, channel, topic, time, tone]) => (
                <article className={`public-queue-row ${tone}`} key={`${name}-${channel}`}>
                  <span>{name.slice(0, 1)}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>{channel} · {topic}</small>
                  </div>
                  <b>{time}</b>
                </article>
              ))}
            </section>

            <section className="public-chat-panel" aria-label="Диалог и AI-подсказка">
              <header>
                <div>
                  <strong>Проблема оплаты</strong>
                  <span>SDK · checkout · VIP</span>
                </div>
                <button type="button">Закрыть в QA</button>
              </header>
              <div className="public-message client">Оплата прошла, но заказ остался в ожидании.</div>
              <div className="public-message agent">Проверяю платеж и закрепляю обращение за темой "Оплата".</div>
              <aside className="public-ai-note">
                <Sparkles size={16} />
                <span>AI предлагает: сверить webhook payment_succeeded, отправить ссылку на статус заказа.</span>
              </aside>
            </section>

            <aside className="public-signal-panel" aria-label="Сигналы платформы">
              <article>
                <RadioTower size={18} />
                <div>
                  <strong>5 каналов</strong>
                  <span>SDK, Telegram, MAX, VK, API</span>
                </div>
              </article>
              <article>
                <ShieldCheck size={18} />
                <div>
                  <strong>Audit enabled</strong>
                  <span>SSO, роли, маскирование PII</span>
                </div>
              </article>
              <article>
                <Server size={18} />
                <div>
                  <strong>Webhook latency</strong>
                  <span>p95 184 ms</span>
                </div>
              </article>
            </aside>
          </div>
        </div>
      </section>

      <section className="public-section public-capabilities" id="capabilities" aria-labelledby="capabilities-title">
        <div className="public-section-heading">
          <h2 id="capabilities-title">Возможности для смены и руководителя</h2>
          <p>Не отдельные витрины, а рабочие поверхности продукта: очередь, чат, профили, шаблоны, отчеты и настройки доступа.</p>
        </div>
        <div className="public-capability-grid">
          {capabilityItems.map(({ icon: Icon, title, text, metric }) => (
            <article className="public-capability-card" key={title}>
              <Icon size={22} />
              <strong>{title}</strong>
              <p>{text}</p>
              <span>{metric}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-integrations" id="integrations" aria-labelledby="integrations-title">
        <div className="public-section-heading">
          <h2 id="integrations-title">Интеграции и SDK</h2>
          <p>Каналы подключаются как управляемые источники событий: с логами доставки, лимитами, ключами API и тестовой отправкой.</p>
        </div>
        <div className="public-integration-layout">
          <div className="public-integration-list">
            {integrationItems.map(([name, description]) => (
              <article key={name}>
                <PlugZap size={17} />
                <strong>{name}</strong>
                <span>{description}</span>
              </article>
            ))}
          </div>
          <div className="public-code-panel">
            <header>
              <Code2 size={18} />
              <strong>SDK init</strong>
              <span>production-ready</span>
            </header>
            <pre><code>{`window.SupportCom.init({
  tenant: "north-retail",
  channel: "web-sdk",
  locale: "ru",
  signature: response.signature
});`}</code></pre>
            <footer>
              <span>event: conversation.created</span>
              <b>184 ms</b>
            </footer>
          </div>
        </div>
      </section>

      <section className="public-section public-tariffs" id="tariffs" aria-labelledby="tariffs-title">
        <div className="public-section-heading">
          <h2 id="tariffs-title">Тарифы без скрытых контуров</h2>
          <p>Trial можно начать с рабочей организации, первым администратором, лимитами и тестовым сообщением.</p>
        </div>
        <div className="public-tariff-grid">
          {tariffItems.map((tariff) => (
            <article className={`public-tariff-card ${tariff.accent}`} key={tariff.name}>
              <header>
                <strong>{tariff.name}</strong>
                <span>{tariff.period}</span>
              </header>
              <div className="public-price">{tariff.price}</div>
              <p>{tariff.description}</p>
              <ul>
                {tariff.features.map((feature) => (
                  <li key={feature}><CheckCircle2 size={15} /> {feature}</li>
                ))}
              </ul>
              <button className="public-btn secondary" onClick={() => onStartTrial({ plan: tariff.name, source: "landing-tariff" })} type="button">
                Выбрать тариф
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="public-section public-security" id="security" aria-labelledby="security-title">
        <div className="public-section-heading">
          <h2 id="security-title">Безопасность, доступ и поддержка</h2>
          <p>Сценарии для multi-tenant продукта: SSO, 2FA, роли, блокировки, audit trail, maintenance и статус платформы.</p>
        </div>
        <div className="public-security-grid">
          <article>
            <LockKeyhole size={20} />
            <strong>SSO и 2FA</strong>
            <span>SAML/OIDC, резервные коды, восстановление доступа и invite activation.</span>
          </article>
          <article>
            <Users size={20} />
            <strong>Tenant isolation</strong>
            <span>Выбор организации, роли, тарифы, лимиты операторов и запрет утечки между tenant.</span>
          </article>
          <article>
            <CreditCard size={20} />
            <strong>Billing controls</strong>
            <span>Trial, тарифы, ограничения по каналам, сотрудникам и AI-функциям.</span>
          </article>
          <article>
            <Headphones size={20} />
            <strong>Service support</strong>
            <span>Статус платформы, инциденты, коммуникация поддержки и SLA по тарифу.</span>
          </article>
        </div>
      </section>

      <section className="public-section public-status" aria-labelledby="status-title">
        <div>
          <h2 id="status-title">Статус и доверие</h2>
          <p>Публичный контур показывает состояние платформы до входа в app shell и помогает быстро выбрать следующий путь.</p>
        </div>
        <div className="public-status-grid">
          {statusItems.map(([label, value, tone]) => (
            <article className={tone} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <div className="public-support-actions">
          <button
            className="public-btn secondary"
            disabled={!demoRequestEnabled}
            onClick={() => handleDemoRequest?.({ planInterest: "Enterprise", source: "landing-status-contact", title: "Контакт по запросу" })}
            type="button"
          >
            <LifeBuoy size={17} /> Контакт по запросу
          </button>
          <button className="public-btn text" onClick={onNavigateAuth} type="button"><Globe2 size={17} /> Перейти ко входу</button>
        </div>
      </section>

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
                    <option value="Start">Start</option>
                    <option value="Growth">Growth</option>
                    <option value="Enterprise">Enterprise</option>
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

function defaultRequestForm(overrides = {}) {
  return {
    company: "",
    consent: false,
    email: "",
    message: "",
    name: "",
    planInterest: "Growth",
    source: "landing-hero",
    website: "",
    ...overrides
  };
}
