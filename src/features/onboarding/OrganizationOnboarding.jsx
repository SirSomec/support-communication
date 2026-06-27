import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Circle,
  Code2,
  Copy,
  CreditCard,
  Gauge,
  KeyRound,
  Mail,
  MessageSquare,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
  X
} from "lucide-react";
import "./onboarding.css";

const noop = () => {};

const steps = [
  { id: "tenant", label: "Tenant", icon: Building2 },
  { id: "plan", label: "Тариф / trial", icon: CreditCard },
  { id: "admin", label: "Первый администратор", icon: UserPlus },
  { id: "channel", label: "Канал / SDK", icon: Code2 },
  { id: "limits", label: "Лимиты", icon: Gauge },
  { id: "employees", label: "Сотрудники", icon: Users },
  { id: "test", label: "Тестовое сообщение", icon: Send }
];

const planOptions = [
  {
    id: "Start",
    price: "19 900 ₽",
    description: "Первый канал, базовые шаблоны, очередь и отчеты.",
    limits: "до 5 операторов"
  },
  {
    id: "Growth",
    price: "49 900 ₽",
    description: "Все каналы, SDK, AI-подсказки, SLA и смены.",
    limits: "до 25 операторов"
  },
  {
    id: "Enterprise",
    price: "по договору",
    description: "SSO, расширенный аудит, выделенные лимиты и SLA.",
    limits: "индивидуально"
  }
];

const channelOptions = ["Web SDK", "Telegram", "MAX", "VK", "REST API"];
const employeeRoles = ["Оператор", "Старший оператор", "Администратор", "Аудитор"];

function hasEmailShape(value) {
  return /\S+@\S+\.\S+/.test(value);
}

function createSlug(value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34);

  return slug || `tenant-${Date.now().toString(36).slice(-5)}`;
}

function createSdkKey() {
  return `sdk_live_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function getCompletion({
  admin,
  channel,
  employees,
  limits,
  plan,
  tenant,
  test
}) {
  return {
    tenant: tenant.name.trim().length >= 2 && tenant.slug.trim().length >= 3,
    plan: Boolean(plan.id),
    admin: admin.name.trim().length >= 2 && hasEmailShape(admin.email),
    channel: channel.type === "Web SDK"
      ? Boolean(channel.domain.trim().length >= 4 && channel.sdkKey)
      : Boolean(channel.webhook.trim().length >= 8 || channel.sdkKey),
    limits: limits.operatorLimit > 0 && limits.concurrentDialogs > 0 && limits.dailyMessages >= 100,
    employees: employees.length > 0,
    test: test.status === "sent"
  };
}

export function OrganizationOnboarding({ onFinish = noop, onBack = noop }) {
  const [activeStep, setActiveStep] = useState("tenant");
  const [tenant, setTenant] = useState({
    name: "",
    slug: "",
    region: "ru-1",
    industry: "retail"
  });
  const [plan, setPlan] = useState({
    id: "Growth",
    trial: true,
    billingCycle: "monthly"
  });
  const [admin, setAdmin] = useState({
    name: "",
    email: "",
    role: "Владелец",
    mfa: true
  });
  const [channel, setChannel] = useState({
    type: "Web SDK",
    domain: "",
    webhook: "",
    sdkKey: ""
  });
  const [limits, setLimits] = useState({
    operatorLimit: 8,
    concurrentDialogs: 12,
    dailyMessages: 5000,
    aiAssist: true,
    afterHoursBot: false
  });
  const [employeeDraft, setEmployeeDraft] = useState({
    email: "",
    role: "Оператор",
    team: "Support"
  });
  const [employees, setEmployees] = useState([]);
  const [test, setTest] = useState({
    recipient: "",
    message: "Здравствуйте! Это тестовое сообщение из onboarding Support Communication.",
    status: "idle",
    log: ""
  });
  const [notice, setNotice] = useState({ tone: "info", text: "" });

  const completion = useMemo(() => {
    return getCompletion({ admin, channel, employees, limits, plan, tenant, test });
  }, [admin, channel, employees, limits, plan, tenant, test]);
  const completedCount = Object.values(completion).filter(Boolean).length;
  const progress = Math.round((completedCount / steps.length) * 100);
  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  const allComplete = completedCount === steps.length;
  const selectedPlan = planOptions.find((option) => option.id === plan.id) ?? planOptions[1];

  function moveStep(direction) {
    const nextIndex = Math.min(Math.max(activeIndex + direction, 0), steps.length - 1);
    setActiveStep(steps[nextIndex].id);
  }

  function handleGenerateSlug() {
    setTenant((current) => ({ ...current, slug: createSlug(current.name) }));
  }

  function handleGenerateSdkKey() {
    setChannel((current) => ({ ...current, sdkKey: createSdkKey() }));
    setNotice({ tone: "success", text: "SDK key создан локально для onboarding-сценария." });
  }

  function handleAddEmployee(event) {
    event.preventDefault();
    const email = employeeDraft.email.trim().toLowerCase();

    if (!hasEmailShape(email)) {
      setNotice({ tone: "error", text: "Введите корректный email сотрудника." });
      return;
    }

    if (employees.some((employee) => employee.email === email)) {
      setNotice({ tone: "error", text: "Этот сотрудник уже добавлен в приглашения." });
      return;
    }

    setEmployees((current) => [...current, { ...employeeDraft, email }]);
    setEmployeeDraft((current) => ({ ...current, email: "" }));
    setNotice({ tone: "success", text: `${email} добавлен в список приглашений.` });
  }

  function handleRemoveEmployee(email) {
    setEmployees((current) => current.filter((employee) => employee.email !== email));
  }

  function handleSendTest(event) {
    event.preventDefault();

    if (!completion.channel) {
      setNotice({ tone: "error", text: "Сначала завершите подключение канала или SDK." });
      return;
    }

    if (!hasEmailShape(test.recipient.trim())) {
      setNotice({ tone: "error", text: "Введите email получателя тестового сообщения." });
      return;
    }

    if (test.message.trim().length < 12) {
      setNotice({ tone: "error", text: "Текст тестового сообщения слишком короткий." });
      return;
    }

    setTest((current) => ({
      ...current,
      status: "sent",
      log: `${channel.type}: test message queued for ${current.recipient.trim()}`
    }));
    setNotice({ tone: "success", text: "Тестовое сообщение поставлено в локальную очередь." });
  }

  function handleFinish() {
    if (!allComplete) {
      setNotice({ tone: "error", text: "Завершите все пункты checklist перед открытием рабочего пространства." });
      return;
    }

    onFinish({
      tenant,
      plan,
      admin,
      channel,
      limits,
      employees,
      test
    });
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <button className="onboarding-back" onClick={onBack} type="button">
          <ArrowLeft size={17} />
          Назад
        </button>
        <div>
          <h1>Onboarding организации</h1>
          <p>Tenant, trial, первый администратор, канал, лимиты, сотрудники и тестовое сообщение перед входом в app namespace.</p>
        </div>
        <button className="onboarding-finish" onClick={handleFinish} type="button">
          Завершить
          <ArrowRight size={17} />
        </button>
      </header>

      <section className="onboarding-progress" aria-label="Прогресс onboarding">
        <div>
          <strong>{progress}%</strong>
          <span>{completedCount} из {steps.length} пунктов завершено</span>
        </div>
        <div className="onboarding-progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>

      {notice.text ? (
        <div className={`onboarding-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
          {notice.tone === "error" ? <X size={16} /> : <CheckCircle2 size={16} />}
          {notice.text}
        </div>
      ) : null}

      <div className="onboarding-layout">
        <aside className="onboarding-checklist" aria-label="Checklist onboarding">
          {steps.map((step) => (
            <StepButton
              active={step.id === activeStep}
              complete={completion[step.id]}
              icon={step.icon}
              key={step.id}
              label={step.label}
              onClick={() => setActiveStep(step.id)}
            />
          ))}
        </aside>

        <section className="onboarding-card" aria-labelledby="onboarding-step-title">
          {activeStep === "tenant" ? (
            <div className="onboarding-step">
              <StepHeading
                icon={<Building2 size={20} />}
                title="Tenant"
                text="Создайте рабочее пространство и публичный slug, который будет использоваться в маршрутах, SDK и audit."
              />
              <div className="onboarding-form-grid">
                <label className="onboarding-field">
                  <span>Название организации</span>
                  <input
                    onChange={(event) => setTenant((current) => ({ ...current, name: event.target.value }))}
                    placeholder="North Retail"
                    value={tenant.name}
                  />
                </label>
                <label className="onboarding-field slug-field">
                  <span>Slug tenant</span>
                  <div>
                    <input
                      onChange={(event) => setTenant((current) => ({ ...current, slug: event.target.value.toLowerCase() }))}
                      placeholder="north-retail"
                      value={tenant.slug}
                    />
                    <button onClick={handleGenerateSlug} type="button">Сгенерировать</button>
                  </div>
                </label>
                <label className="onboarding-field">
                  <span>Регион данных</span>
                  <select
                    onChange={(event) => setTenant((current) => ({ ...current, region: event.target.value }))}
                    value={tenant.region}
                  >
                    <option value="ru-1">RU-1</option>
                    <option value="eu-1">EU-1</option>
                    <option value="kz-1">KZ-1</option>
                  </select>
                </label>
                <label className="onboarding-field">
                  <span>Отрасль</span>
                  <select
                    onChange={(event) => setTenant((current) => ({ ...current, industry: event.target.value }))}
                    value={tenant.industry}
                  >
                    <option value="retail">Retail</option>
                    <option value="fintech">Fintech</option>
                    <option value="marketplace">Marketplace</option>
                    <option value="healthcare">Healthcare</option>
                  </select>
                </label>
              </div>
              <div className="onboarding-preview-row">
                <KeyRound size={17} />
                <span>Workspace URL</span>
                <strong>https://app.support.local/{tenant.slug || "tenant-slug"}</strong>
              </div>
            </div>
          ) : null}

          {activeStep === "plan" ? (
            <div className="onboarding-step">
              <StepHeading
                icon={<CreditCard size={20} />}
                title="Тариф и trial"
                text="Выберите тариф, trial и billing cycle. Эти значения попадут в guards лимитов и доступности функций."
              />
              <div className="onboarding-plan-grid">
                {planOptions.map((option) => (
                  <button
                    className={plan.id === option.id ? "selected" : ""}
                    key={option.id}
                    onClick={() => setPlan((current) => ({ ...current, id: option.id }))}
                    type="button"
                  >
                    <strong>{option.id}</strong>
                    <b>{option.price}</b>
                    <span>{option.description}</span>
                    <small>{option.limits}</small>
                  </button>
                ))}
              </div>
              <div className="onboarding-toggle-grid">
                <label>
                  <input
                    checked={plan.trial}
                    onChange={(event) => setPlan((current) => ({ ...current, trial: event.target.checked }))}
                    type="checkbox"
                  />
                  Включить trial на 14 дней
                </label>
                <label>
                  <input
                    checked={plan.billingCycle === "annual"}
                    onChange={(event) => setPlan((current) => ({ ...current, billingCycle: event.target.checked ? "annual" : "monthly" }))}
                    type="checkbox"
                  />
                  Годовая оплата
                </label>
              </div>
            </div>
          ) : null}

          {activeStep === "admin" ? (
            <div className="onboarding-step">
              <StepHeading
                icon={<UserPlus size={20} />}
                title="Первый администратор"
                text="Первый администратор получает owner-доступ, может пригласить сотрудников и подключить SSO позже."
              />
              <div className="onboarding-form-grid">
                <label className="onboarding-field">
                  <span>Имя</span>
                  <input
                    onChange={(event) => setAdmin((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Анна Смирнова"
                    value={admin.name}
                  />
                </label>
                <label className="onboarding-field">
                  <span>Email</span>
                  <input
                    onChange={(event) => setAdmin((current) => ({ ...current, email: event.target.value }))}
                    placeholder="admin@company.ru"
                    type="email"
                    value={admin.email}
                  />
                </label>
                <label className="onboarding-field">
                  <span>Роль</span>
                  <select
                    onChange={(event) => setAdmin((current) => ({ ...current, role: event.target.value }))}
                    value={admin.role}
                  >
                    <option>Владелец</option>
                    <option>Администратор</option>
                    <option>Service owner</option>
                  </select>
                </label>
                <label className="onboarding-check-row">
                  <input
                    checked={admin.mfa}
                    onChange={(event) => setAdmin((current) => ({ ...current, mfa: event.target.checked }))}
                    type="checkbox"
                  />
                  Требовать 2FA при первом входе
                </label>
              </div>
            </div>
          ) : null}

          {activeStep === "channel" ? (
            <div className="onboarding-step">
              <StepHeading
                icon={<Code2 size={20} />}
                title="Канал и SDK"
                text="Подключите первый канал или SDK-ключ. Все поля локальные, но отражают production-contract будущего adapter."
              />
              <div className="onboarding-form-grid">
                <label className="onboarding-field">
                  <span>Тип канала</span>
                  <select
                    onChange={(event) => setChannel((current) => ({ ...current, type: event.target.value }))}
                    value={channel.type}
                  >
                    {channelOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
                <label className="onboarding-field">
                  <span>Разрешенный домен</span>
                  <input
                    onChange={(event) => setChannel((current) => ({ ...current, domain: event.target.value }))}
                    placeholder="company.ru"
                    value={channel.domain}
                  />
                </label>
                <label className="onboarding-field wide">
                  <span>Webhook endpoint</span>
                  <input
                    onChange={(event) => setChannel((current) => ({ ...current, webhook: event.target.value }))}
                    placeholder="https://company.ru/support/webhook"
                    value={channel.webhook}
                  />
                </label>
              </div>
              <div className="onboarding-sdk-panel">
                <div>
                  <Code2 size={18} />
                  <strong>{channel.sdkKey || "SDK key еще не создан"}</strong>
                </div>
                <button onClick={handleGenerateSdkKey} type="button">Сгенерировать ключ</button>
                <button
                  disabled={!channel.sdkKey}
                  onClick={() => setNotice({ tone: "success", text: "SDK key готов к копированию в интеграцию." })}
                  type="button"
                >
                  <Copy size={16} />
                  Скопировать
                </button>
              </div>
            </div>
          ) : null}

          {activeStep === "limits" ? (
            <div className="onboarding-step">
              <StepHeading
                icon={<Gauge size={20} />}
                title="Лимиты"
                text="Настройте стартовые лимиты, которые будут применяться к очередям, операторам и тарифным guard."
              />
              <div className="onboarding-limit-grid">
                <RangeControl
                  label="Операторы"
                  max={50}
                  min={1}
                  onChange={(value) => setLimits((current) => ({ ...current, operatorLimit: value }))}
                  value={limits.operatorLimit}
                />
                <RangeControl
                  label="Диалогов на оператора"
                  max={40}
                  min={1}
                  onChange={(value) => setLimits((current) => ({ ...current, concurrentDialogs: value }))}
                  value={limits.concurrentDialogs}
                />
                <label className="onboarding-field">
                  <span>Сообщений в день</span>
                  <input
                    min="100"
                    onChange={(event) => setLimits((current) => ({ ...current, dailyMessages: Number(event.target.value) }))}
                    type="number"
                    value={limits.dailyMessages}
                  />
                </label>
                <label className="onboarding-check-row">
                  <input
                    checked={limits.aiAssist}
                    onChange={(event) => setLimits((current) => ({ ...current, aiAssist: event.target.checked }))}
                    type="checkbox"
                  />
                  Включить AI-подсказки
                </label>
                <label className="onboarding-check-row">
                  <input
                    checked={limits.afterHoursBot}
                    onChange={(event) => setLimits((current) => ({ ...current, afterHoursBot: event.target.checked }))}
                    type="checkbox"
                  />
                  After-hours bot для нерабочего времени
                </label>
              </div>
            </div>
          ) : null}

          {activeStep === "employees" ? (
            <div className="onboarding-step">
              <StepHeading
                icon={<Users size={20} />}
                title="Сотрудники"
                text="Добавьте хотя бы одного сотрудника, чтобы проверить invite flow и будущие роли в tenant."
              />
              <form className="onboarding-employee-form" onSubmit={handleAddEmployee}>
                <label className="onboarding-field">
                  <span>Email сотрудника</span>
                  <input
                    onChange={(event) => setEmployeeDraft((current) => ({ ...current, email: event.target.value }))}
                    placeholder="operator@company.ru"
                    type="email"
                    value={employeeDraft.email}
                  />
                </label>
                <label className="onboarding-field">
                  <span>Роль</span>
                  <select
                    onChange={(event) => setEmployeeDraft((current) => ({ ...current, role: event.target.value }))}
                    value={employeeDraft.role}
                  >
                    {employeeRoles.map((role) => <option key={role}>{role}</option>)}
                  </select>
                </label>
                <label className="onboarding-field">
                  <span>Группа</span>
                  <input
                    onChange={(event) => setEmployeeDraft((current) => ({ ...current, team: event.target.value }))}
                    value={employeeDraft.team}
                  />
                </label>
                <button className="onboarding-inline-primary" type="submit">Добавить</button>
              </form>
              <div className="onboarding-employee-list">
                {employees.length ? employees.map((employee) => (
                  <article key={employee.email}>
                    <Mail size={17} />
                    <div>
                      <strong>{employee.email}</strong>
                      <span>{employee.role} · {employee.team}</span>
                    </div>
                    <button aria-label={`Удалить ${employee.email}`} onClick={() => handleRemoveEmployee(employee.email)} type="button">
                      <X size={16} />
                    </button>
                  </article>
                )) : (
                  <div className="onboarding-empty-state">
                    <Users size={22} />
                    <span>Список приглашений пока пуст.</span>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {activeStep === "test" ? (
            <div className="onboarding-step">
              <StepHeading
                icon={<Send size={20} />}
                title="Тестовое сообщение"
                text="Отправьте тестовое сообщение через выбранный канал, чтобы подтвердить маршрут перед завершением."
              />
              <form className="onboarding-test-form" onSubmit={handleSendTest}>
                <label className="onboarding-field">
                  <span>Получатель</span>
                  <input
                    onChange={(event) => setTest((current) => ({ ...current, recipient: event.target.value, status: "idle" }))}
                    placeholder="qa@company.ru"
                    type="email"
                    value={test.recipient}
                  />
                </label>
                <label className="onboarding-field wide">
                  <span>Сообщение</span>
                  <textarea
                    onChange={(event) => setTest((current) => ({ ...current, message: event.target.value, status: "idle" }))}
                    value={test.message}
                  />
                </label>
                <button className="onboarding-inline-primary" type="submit">
                  <MessageSquare size={17} />
                  Отправить тест
                </button>
              </form>
              <div className={`onboarding-test-result ${test.status}`}>
                <ShieldCheck size={18} />
                <span>{test.log || "Тест еще не отправлен."}</span>
              </div>
            </div>
          ) : null}

          <footer className="onboarding-step-footer">
            <button disabled={activeIndex === 0} onClick={() => moveStep(-1)} type="button">
              <ArrowLeft size={16} />
              Назад
            </button>
            <button disabled={activeIndex === steps.length - 1} onClick={() => moveStep(1)} type="button">
              Далее
              <ArrowRight size={16} />
            </button>
          </footer>
        </section>

        <aside className="onboarding-summary" aria-label="Сводка onboarding">
          <h2>Сводка</h2>
          <SummaryRow label="Организация" value={tenant.name || "не задана"} />
          <SummaryRow label="Slug" value={tenant.slug || "tenant-slug"} />
          <SummaryRow label="Тариф" value={`${selectedPlan.id}${plan.trial ? " · trial" : ""}`} />
          <SummaryRow label="Администратор" value={admin.email || "не задан"} />
          <SummaryRow label="Канал" value={channel.type} />
          <SummaryRow label="SDK key" value={channel.sdkKey ? "создан" : "нет"} />
          <SummaryRow label="Лимиты" value={`${limits.operatorLimit} операторов · ${limits.concurrentDialogs} диалогов`} />
          <SummaryRow label="Сотрудники" value={`${employees.length} приглашений`} />
          <SummaryRow label="Тест" value={test.status === "sent" ? "отправлен" : "ожидает"} />
        </aside>
      </div>
    </main>
  );
}

function StepButton({ active, complete, icon: Icon, label, onClick }) {
  return (
    <button className={`${active ? "active" : ""} ${complete ? "complete" : ""}`} onClick={onClick} type="button">
      <Icon size={18} />
      <span>{label}</span>
      {complete ? <CheckCircle2 size={17} /> : <Circle size={17} />}
    </button>
  );
}

function StepHeading({ icon, text, title }) {
  return (
    <header className="onboarding-step-heading">
      <div>{icon}</div>
      <span>Шаг onboarding</span>
      <h2 id="onboarding-step-title">{title}</h2>
      <p>{text}</p>
    </header>
  );
}

function RangeControl({ label, max, min, onChange, value }) {
  return (
    <label className="onboarding-range">
      <span>{label}</span>
      <strong>{value}</strong>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
    </label>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default OrganizationOnboarding;
