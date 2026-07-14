import {
  Building2,
  CreditCard,
  Gauge,
  KeyRound,
  Mail,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { RangeControl, StepHeading } from "./OnboardingControls.jsx";
import { employeeRoles, planOptions } from "./onboardingModel.js";

export function OnboardingStepContent({
  activeStep,
  admin,
  employeeDraft,
  employees,
  handleAddEmployee,
  handleGenerateSlug,
  handleRemoveEmployee,
  limits,
  plan,
  setAdmin,
  setEmployeeDraft,
  setLimits,
  setNotice,
  setPlan,
  setTenant,
  tenant
}) {
  return (
    <>
          {activeStep === "tenant" ? (
            <div className="onboarding-step">
              <StepHeading
                icon={<Building2 size={20} />}
                title="Организация"
                text="Создайте рабочее пространство и публичный slug, который будет использоваться в маршрутах и audit."
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
                  <span>Slug организации</span>
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
                <strong>https://app.support.local/{tenant.slug || "org-slug"}</strong>
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
                  <span>Пароль</span>
                  <input
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setAdmin((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Минимум 8 символов"
                    type="password"
                    value={admin.password ?? ""}
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
                text="Добавьте хотя бы одного сотрудника, чтобы проверить invite flow и будущие роли в организации."
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
    </>
  );
}

export default OnboardingStepContent;
