import React from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
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
  Users
} from "lucide-react";
import { publicCatalogService } from "../../services/publicCatalogService.js";
import "./public.css";

const noop = () => {};

const capabilityItems = [
  {
    icon: MessageSquare,
    title: "Омниканальная очередь",
    text: "SDK и Telegram в одной ленте с SLA, тематиками и передачей между сотрудниками."
  },
  {
    icon: ShieldCheck,
    title: "Проверка качества",
    text: "Оценки клиентов, ручные проверки и локальные правила проверки текста с журналом действий."
  },
  {
    icon: Gauge,
    title: "Контроль смены",
    text: "Лимиты по операторам, загрузка очередей, спасение просроченных диалогов и видимость руководителя."
  },
  {
    icon: BarChart3,
    title: "Отчеты и качество",
    text: "Отчеты по диалогам, первому ответу, SLA и назначениям с XLSX-выгрузкой и аудитом."
  }
];

const integrationItems = [
  ["Web SDK", "Идентификация посетителя, диалоги и сообщения", "Работает"],
  ["Telegram", "Входящие диалоги и ответы операторов", "Работает"],
  ["REST API", "Клиенты, диалоги, отчеты, webhooks и audit export", "Работает"],
  ["MAX", "Полный прием и отправка сообщений", "В разработке"],
  ["VK", "Полный прием и отправка сообщений", "В разработке"],
  ["Внешний ИИ", "Подсказки и оценка через внешний провайдер", "В разработке"]
];

const queueRows = [
  ["Клиент A", "Telegram", "Возврат заказа"],
  ["Клиент B", "SDK", "Проблема оплаты"]
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
          <button className="public-btn primary" onClick={() => onStartTrial({ plan: "business", source: "landing-nav" })} type="button">
            Trial
            <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <section className="public-hero" aria-labelledby="public-hero-title">
        <div className="public-hero-copy">
          <h1 id="public-hero-title">Support Communication</h1>
          <p>
            Рабочее место для поддержки, где SDK, Telegram, операторские лимиты,
            отчеты и аудит собраны в один операционный контур.
          </p>
          <div className="public-hero-actions">
            <button className="public-btn primary large" onClick={() => onStartTrial({ plan: "business", source: "landing-hero" })} type="button">
              Запустить trial
              <ArrowRight size={18} />
            </button>
            <button
              className="public-btn secondary large"
              disabled={!demoRequestEnabled}
              onClick={() => handleDemoRequest?.({ planInterest: "business", source: "landing-hero", title: "Демо по запросу" })}
              type="button"
            >
              Демо по запросу
            </button>
            <button className="public-btn text" onClick={onNavigateAuth} type="button">
              Уже есть аккаунт
            </button>
          </div>
        </div>

        <div className="public-product-preview" aria-label="Демонстрационный пример рабочего интерфейса поддержки">
          <div className="public-preview-topbar">
            <span><Activity size={16} /> Демонстрационный пример интерфейса</span>
            <span>Без реальных клиентских данных</span>
          </div>
          <div className="public-preview-grid">
            <section className="public-queue-panel" aria-label="Очередь диалогов">
              <header>
                <strong>Очередь</strong>
                <small>пример</small>
              </header>
              {queueRows.map(([name, channel, topic]) => (
                <article className="public-queue-row" key={`${name}-${channel}`}>
                  <span>{name.slice(0, 1)}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>{channel} · {topic}</small>
                  </div>
                </article>
              ))}
            </section>

            <section className="public-chat-panel" aria-label="Пример диалога и проверки текста">
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
                <ShieldCheck size={16} />
                <span>Локальная проверка: указан следующий шаг и понятный ответ клиенту.</span>
              </aside>
            </section>

            <aside className="public-signal-panel" aria-label="Сигналы платформы">
              <article>
                <RadioTower size={18} />
                <div>
                  <strong>Рабочие каналы</strong>
                  <span>SDK и Telegram</span>
                </div>
              </article>
              <article>
                <ShieldCheck size={18} />
                <div>
                  <strong>Журнал действий</strong>
                  <span>Роли и маскирование PII</span>
                </div>
              </article>
              <article>
                <Server size={18} />
                <div>
                  <strong>Статус API</strong>
                  <span>{publicStatus === "available" ? "доступен" : publicStatus === "unavailable" ? "недоступен" : "проверяется"}</span>
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
          {capabilityItems.map(({ icon: Icon, title, text }) => (
            <article className="public-capability-card" key={title}>
              <Icon size={22} />
              <strong>{title}</strong>
              <p>{text}</p>
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
            {integrationItems.map(([name, description, status]) => (
              <article key={name}>
                <PlugZap size={17} />
                <strong>{name}</strong>
                <span>{description}</span>
                <b>{status}</b>
              </article>
            ))}
          </div>
          <div className="public-code-panel">
            <header>
              <Code2 size={18} />
              <strong>SDK init</strong>
              <span>актуальный пример</span>
            </header>
            <pre><code>{`SupportWidget.init({
  apiBase: "/api/v1",
  publicKey: "sk_stage_...",
  externalId: "visitor-1"
});`}</code></pre>
            <footer>
              <span>public SDK identify → conversation</span>
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
          {tariffs.map((tariff) => (
            <article className="public-tariff-card" key={tariff.id}>
              <header>
                <strong>{tariff.name}</strong>
                <span>в месяц</span>
              </header>
              <div className="public-price">{formatTariffPrice(tariff.priceMonthly)}</div>
              <p>{tariff.includedUsers} пользователей · {tariff.workspaceLimit} рабочих пространств</p>
              <ul>
                {(tariff.features ?? []).map((feature) => (
                  <li key={feature}><CheckCircle2 size={15} /> {feature}</li>
                ))}
              </ul>
              <button className="public-btn secondary" onClick={() => onStartTrial({ plan: tariff.id, source: "landing-tariff" })} type="button">
                Выбрать тариф
              </button>
            </article>
          ))}
          {!tariffs.length ? <p>Каталог тарифов временно недоступен. Оставьте заявку для уточнения условий.</p> : null}
        </div>
      </section>

      <section className="public-section public-security" id="security" aria-labelledby="security-title">
        <div className="public-section-heading">
          <h2 id="security-title">Безопасность, доступ и поддержка</h2>
          <p>Рабочие сценарии доступа: email OTP, роли, блокировки, журнал действий и изоляция организаций.</p>
        </div>
        <div className="public-security-grid">
          <article>
            <LockKeyhole size={20} />
            <strong>Вход и подтверждение</strong>
            <span>Email OTP, восстановление доступа и активация приглашений.</span>
          </article>
          <article>
            <Users size={20} />
            <strong>Tenant isolation</strong>
            <span>Выбор организации, роли, тарифы, лимиты операторов и запрет утечки между tenant.</span>
          </article>
          <article>
            <CreditCard size={20} />
            <strong>Billing controls</strong>
            <span>Trial, единый каталог тарифов и ограничения по каналам и сотрудникам.</span>
          </article>
          <article>
            <Headphones size={20} />
            <strong>Service support</strong>
            <span>Заявка на демонстрацию и связь с командой сервиса.</span>
          </article>
        </div>
      </section>

      <section className="public-section public-status" aria-labelledby="status-title">
        <div>
          <h2 id="status-title">Статус и доверие</h2>
          <p>Публично показывается только проверяемая доступность API. Внутренние очереди и SLA доступны после входа.</p>
        </div>
        <div className="public-status-grid">
          <article className={publicStatus === "available" ? "ok" : publicStatus === "unavailable" ? "warn" : ""}>
            <span>API</span>
            <strong>{publicStatus === "available" ? "доступен" : publicStatus === "unavailable" ? "недоступен" : "проверяется"}</strong>
          </article>
        </div>
        <div className="public-support-actions">
          <button
            className="public-btn secondary"
            disabled={!demoRequestEnabled}
            onClick={() => handleDemoRequest?.({ planInterest: "enterprise", source: "landing-status-contact", title: "Контакт по запросу" })}
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
