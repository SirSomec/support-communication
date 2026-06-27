import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  X
} from "lucide-react";
import { StepButton, SummaryRow } from "./OnboardingControls.jsx";
import { OnboardingStepContent } from "./OnboardingStepContent.jsx";
import {
  channelOptions,
  createSdkKey,
  createSlug,
  employeeRoles,
  getCompletion,
  hasEmailShape,
  planOptions,
  steps
} from "./onboardingModel.js";
import "./onboarding.css";

const noop = () => {};

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
          <OnboardingStepContent
            activeStep={activeStep}
            admin={admin}
            channel={channel}
            completion={completion}
            employeeDraft={employeeDraft}
            employees={employees}
            handleAddEmployee={handleAddEmployee}
            handleGenerateSdkKey={handleGenerateSdkKey}
            handleGenerateSlug={handleGenerateSlug}
            handleRemoveEmployee={handleRemoveEmployee}
            handleSendTest={handleSendTest}
            limits={limits}
            plan={plan}
            setAdmin={setAdmin}
            setChannel={setChannel}
            setEmployeeDraft={setEmployeeDraft}
            setLimits={setLimits}
            setNotice={setNotice}
            setPlan={setPlan}
            setTenant={setTenant}
            setTest={setTest}
            tenant={tenant}
            test={test}
          />
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

export default OrganizationOnboarding;
