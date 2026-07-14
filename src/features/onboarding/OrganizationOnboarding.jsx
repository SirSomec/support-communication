import React, { useMemo, useState } from "react";
import { setTenantSession } from "../../app/sessionStore.js";
import { authService } from "../../services/authService.js";
import {
  mapOnboardingFormToProvisionPayload,
  tenantProvisionService
} from "../../services/tenantProvisionService.js";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  X
} from "lucide-react";
import { StepButton, SummaryRow } from "./OnboardingControls.jsx";
import { OnboardingStepContent } from "./OnboardingStepContent.jsx";
import {
  createSlug,
  getCompletion,
  hasEmailShape,
  planOptions,
  stepRequirements,
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
    password: "",
    role: "Владелец",
    mfa: true
  });
  const [isProvisioning, setIsProvisioning] = useState(false);
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
  const [notice, setNotice] = useState({ tone: "info", text: "" });

  const completion = useMemo(() => {
    return getCompletion({ admin, employees, limits, plan, tenant });
  }, [admin, employees, limits, plan, tenant]);
  const completedCount = Object.values(completion).filter(Boolean).length;
  const progress = Math.round((completedCount / steps.length) * 100);
  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  const allComplete = completedCount === steps.length;
  const incompleteSteps = steps.filter((step) => !completion[step.id]);
  const selectedPlan = planOptions.find((option) => option.id === plan.id) ?? planOptions[1];

  function moveStep(direction) {
    const nextIndex = Math.min(Math.max(activeIndex + direction, 0), steps.length - 1);
    setActiveStep(steps[nextIndex].id);
  }

  function handleGenerateSlug() {
    setTenant((current) => ({ ...current, slug: createSlug(current.name) }));
  }

  function handleAddEmployee(event) {
    event.preventDefault();
    const email = employeeDraft.email.trim().toLowerCase();

    if (!hasEmailShape(email)) {
      setNotice({ tone: "error", text: "Введите корректный email сотрудника." });
      return;
    }

    if (employees.some((employee) => employee.email === email)) {
      setNotice({ tone: "error", text: "Этот сотрудник уже добавлен в список приглашений." });
      return;
    }

    setEmployees((current) => [...current, { ...employeeDraft, email }]);
    setEmployeeDraft((current) => ({ ...current, email: "" }));
    setNotice({ tone: "success", text: `${email} добавлен в список приглашений.` });
  }

  function handleRemoveEmployee(email) {
    setEmployees((current) => current.filter((employee) => employee.email !== email));
  }

  async function handleFinish() {
    if (!allComplete) {
      const firstIncomplete = incompleteSteps[0];
      setActiveStep(firstIncomplete.id);
      setNotice({
        tone: "error",
        text: `Осталось завершить: ${incompleteSteps.map((step) => step.label).join(", ")}. ${stepRequirements[firstIncomplete.id]}`
      });
      return;
    }

    if (isProvisioning) {
      return;
    }

    setIsProvisioning(true);
    setNotice({ tone: "info", text: "Создаем организацию..." });

    try {
      const provisionPayload = mapOnboardingFormToProvisionPayload({ admin, employees, plan, tenant });
      const provisionResponse = await tenantProvisionService.provisionOrganization(provisionPayload);

      if (provisionResponse.status !== "ok" || !provisionResponse.data?.tenant) {
        setNotice({
          tone: "error",
          text: provisionResponse.error?.message ?? "Не удалось создать организацию. Проверьте данные и попробуйте снова."
        });
        return;
      }

      const {
        embedSnippet,
        operator,
        publicApiKey,
        session,
        tenant: provisionedTenant
      } = provisionResponse.data;

      if (!session?.accessToken) {
        const loginResponse = await authService.loginTenantOperator({
          email: admin.email.trim().toLowerCase(),
          password: admin.password
        });

        if (!authService.persistTenantLogin(loginResponse)) {
          setNotice({
            tone: "error",
            text: loginResponse.error?.message ?? "Организация создана, но вход не удался. Попробуйте войти вручную."
          });
          return;
        }
      } else {
        setTenantSession({
          accessToken: session.accessToken,
          tenantId: provisionResponse.data.tenantId ?? provisionedTenant.id,
          operator: operator ?? provisionResponse.data.admin
        });
      }

      onFinish({
        tenant: provisionedTenant,
        publicApiKey,
        embedSnippet,
        plan,
        limits,
        employees
      });
    } catch {
      setNotice({
        tone: "error",
        text: "Не удалось создать организацию из-за сетевой ошибки. Попробуйте снова."
      });
    } finally {
      setIsProvisioning(false);
    }
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
          <p>Организация, trial, первый администратор, лимиты и сотрудники перед входом в app namespace.</p>
        </div>
        <button className="onboarding-finish" disabled={isProvisioning} onClick={handleFinish} type="button">
          {isProvisioning ? "Создание..." : "Завершить"}
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
        {!allComplete ? (
          <p className="onboarding-progress-hint">
            Далее: <strong>{incompleteSteps[0].label}</strong> — {stepRequirements[incompleteSteps[0].id]}
          </p>
        ) : (
          <p className="onboarding-progress-hint complete">
            Все пункты завершены — нажмите «Завершить», чтобы создать организацию.
          </p>
        )}
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
              hint={completion[step.id] ? "" : stepRequirements[step.id]}
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
            employeeDraft={employeeDraft}
            employees={employees}
            handleAddEmployee={handleAddEmployee}
            handleGenerateSlug={handleGenerateSlug}
            handleRemoveEmployee={handleRemoveEmployee}
            limits={limits}
            plan={plan}
            setAdmin={setAdmin}
            setEmployeeDraft={setEmployeeDraft}
            setLimits={setLimits}
            setNotice={setNotice}
            setPlan={setPlan}
            setTenant={setTenant}
            tenant={tenant}
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
          <SummaryRow label="Лимиты" value={`${limits.operatorLimit} операторов · ${limits.concurrentDialogs} диалогов`} />
          <SummaryRow label="Сотрудники" value={`${employees.length} приглашений`} />
        </aside>
      </div>
    </main>
  );
}

export default OrganizationOnboarding;
