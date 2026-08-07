import {
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Gauge,
  UserPlus
} from "lucide-react";
import { RangeControl, StepHeading } from "./OnboardingControls.jsx";

const priceFormatter = new Intl.NumberFormat("ru-RU", {
  currency: "RUB",
  maximumFractionDigits: 0,
  style: "currency"
});

function formatPlanPrice(plan) {
  if (plan.billingAvailability === "free") return "0 ₽";
  return priceFormatter.format(Number(plan.priceMonthly ?? 0) / 100);
}

export function OnboardingStepContent({
  activeStep,
  admin,
  availablePlans,
  catalogState,
  handleGenerateSlug,
  handleSelectPlan,
  legal,
  limits,
  plan,
  selectedPlan,
  setAdmin,
  setLegal,
  setLimits,
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
            text="Укажите данные организации и реальный домен сайта, на котором будет подключён Web SDK."
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
            <label className="onboarding-field wide">
              <span>Домен сайта для Web SDK</span>
              <input
                autoCapitalize="none"
                onChange={(event) => setTenant((current) => ({ ...current, domain: event.target.value.toLowerCase() }))}
                placeholder="support.company.ru"
                value={tenant.domain}
              />
              <small>Укажите домен без протокола и пути, например company.ru.</small>
            </label>
          </div>
        </div>
      ) : null}

      {activeStep === "plan" ? (
        <div className="onboarding-step onboarding-plan-step">
          <StepHeading
            icon={<CreditCard size={20} />}
            title="Выберите тарифный план"
            text="Enterprise оформляется индивидуально и поэтому недоступен в самостоятельной регистрации. Платный тариф будет назначен организации в trial-статусе."
          />
          {catalogState === "fallback" ? (
            <p className="onboarding-catalog-message" role="status">
              Не удалось обновить каталог. Показаны последние зафиксированные условия тарифов.
            </p>
          ) : null}
          <div aria-label="Доступные тарифы" className="onboarding-plan-grid" role="radiogroup">
            {availablePlans.map((option) => {
              const selected = option.id === plan.id;
              return (
                <button
                  aria-checked={selected}
                  className={selected ? "selected" : ""}
                  key={option.id}
                  onClick={() => handleSelectPlan(option)}
                  role="radio"
                  type="button"
                >
                  <header>
                    <strong>{option.name}</strong>
                    {selected ? <span className="onboarding-plan-selected"><Check size={16} /></span> : null}
                  </header>
                  <div className="onboarding-plan-price">
                    <b>{formatPlanPrice(option)}</b>
                    {option.billingAvailability === "paid" ? <span>за сотрудника<br />в месяц</span> : null}
                  </div>
                  <p>{option.ownerOnly ? "Для одного владельца" : `До ${option.includedUsers} сотрудников`}</p>
                  <ul>
                    {option.features.map((feature) => (
                      <li key={feature}><CheckCircle2 aria-hidden="true" size={15} />{feature}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {activeStep === "admin" ? (
        <div className="onboarding-step">
          <StepHeading
            icon={<UserPlus size={20} />}
            title="Первый администратор"
            text="Этот пользователь станет владельцем организации и сможет управлять командой после первого входа."
          />
          <div className="onboarding-form-grid">
            <label className="onboarding-field">
              <span>Имя</span>
              <input
                autoComplete="name"
                onChange={(event) => setAdmin((current) => ({ ...current, name: event.target.value }))}
                placeholder="Анна Смирнова"
                value={admin.name}
              />
            </label>
            <label className="onboarding-field">
              <span>Email</span>
              <input
                autoComplete="email"
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
              </select>
            </label>
            <label className="onboarding-check-row wide">
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
            title="Стартовые лимиты"
            text={`Настройте рабочие ограничения в пределах тарифа ${selectedPlan?.name ?? "Free"}. Изменить их можно будет в настройках.`}
          />
          <div className="onboarding-limit-grid">
            <RangeControl
              label={`Операторы · максимум ${selectedPlan?.includedUsers ?? 1}`}
              max={selectedPlan?.includedUsers ?? 1}
              min={1}
              onChange={(value) => setLimits((current) => ({ ...current, operatorLimit: value }))}
              value={Math.min(limits.operatorLimit, selectedPlan?.includedUsers ?? 1)}
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
                disabled={selectedPlan?.ownerOnly}
                onChange={(event) => setLimits((current) => ({ ...current, aiAssist: event.target.checked }))}
                type="checkbox"
              />
              Включить AI-подсказки
            </label>
            <label className="onboarding-check-row">
              <input
                checked={limits.afterHoursBot}
                disabled={selectedPlan?.ownerOnly}
                onChange={(event) => setLimits((current) => ({ ...current, afterHoursBot: event.target.checked }))}
                type="checkbox"
              />
              After-hours bot
            </label>
          </div>
        </div>
      ) : null}

      {activeStep === "legal" ? (
        <div className="onboarding-step onboarding-legal-step">
          <StepHeading
            icon={<FileCheck2 size={20} />}
            title="Правовые документы"
            text="Подтвердите каждый пункт отдельно. Версия документов и время принятия будут сохранены вместе с регистрацией."
          />
          <div className="onboarding-legal-list">
            <label>
              <input
                checked={legal.termsAccepted}
                onChange={(event) => setLegal((current) => ({ ...current, termsAccepted: event.target.checked }))}
                type="checkbox"
              />
              <span>
                <strong>Пользовательское соглашение</strong>
                <small>Принимаю условия использования платформы от имени организации.</small>
                <a href="/legal/#terms" rel="noreferrer" target="_blank">Открыть документ <ExternalLink size={14} /></a>
              </span>
            </label>
            <label>
              <input
                checked={legal.privacyPolicyAcknowledged}
                onChange={(event) => setLegal((current) => ({ ...current, privacyPolicyAcknowledged: event.target.checked }))}
                type="checkbox"
              />
              <span>
                <strong>Политика обработки персональных данных</strong>
                <small>Подтверждаю, что ознакомился с целями, составом и порядком обработки данных.</small>
                <a href="/legal/#privacy" rel="noreferrer" target="_blank">Открыть документ <ExternalLink size={14} /></a>
              </span>
            </label>
            <label>
              <input
                checked={legal.personalDataConsent}
                onChange={(event) => setLegal((current) => ({ ...current, personalDataConsent: event.target.checked }))}
                type="checkbox"
              />
              <span>
                <strong>Согласие на обработку персональных данных</strong>
                <small>Даю отдельное, конкретное и информированное согласие для регистрации и работы аккаунта.</small>
                <a href="/legal/#consent" rel="noreferrer" target="_blank">Открыть согласие <ExternalLink size={14} /></a>
              </span>
            </label>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default OnboardingStepContent;
