import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  KeyRound,
  LockKeyhole,
  Mail,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wrench
} from "lucide-react";
import "./auth.css";

const noop = () => {};

const authModes = {
  login: {
    title: "Вход в рабочее пространство",
    description: "Email, пароль и дальнейшая проверка 2FA или выбор организации."
  },
  sso: {
    title: "SSO вход",
    description: "Выберите провайдера и домен организации для SAML/OIDC входа."
  },
  twoFactor: {
    title: "Двухфакторная проверка",
    description: "Введите 6-значный код из приложения или резервного канала."
  },
  recovery: {
    title: "Восстановление доступа",
    description: "Отправим ссылку для сброса пароля и отметим событие в audit."
  },
  invite: {
    title: "Активация приглашения",
    description: "Подтвердите invite code и email, чтобы войти в организацию."
  },
  organizationSelect: {
    title: "Выбор организации",
    description: "Для multi-tenant аккаунта нужно выбрать tenant перед входом."
  },
  blocked: {
    title: "Аккаунт заблокирован",
    description: "Доступ остановлен политикой безопасности или администратором."
  },
  expired: {
    title: "Приглашение истекло",
    description: "Invite token больше не действует. Можно запросить новый или начать onboarding."
  },
  maintenance: {
    title: "Плановое обслуживание",
    description: "Вход временно ограничен, чтобы не открыть рабочий контур в нестабильном состоянии."
  }
};

const organizationOptions = [
  {
    id: "north-retail",
    name: "North Retail",
    role: "Администратор",
    tariff: "Growth",
    lastLogin: "сегодня, 10:24",
    status: "SLA 99.9%"
  },
  {
    id: "city-care",
    name: "City Care",
    role: "Старший оператор",
    tariff: "Start",
    lastLogin: "вчера, 18:05",
    status: "trial 5 дней"
  },
  {
    id: "internal-support",
    name: "Internal Support",
    role: "Аудитор",
    tariff: "Enterprise",
    lastLogin: "21 июня, 09:10",
    status: "SSO required"
  }
];

const ssoProviders = ["Google Workspace", "Microsoft Entra ID", "Okta", "SAML"];
const validModes = new Set(Object.keys(authModes));

function getInitialMode(mode) {
  return validModes.has(mode) ? mode : "login";
}

function hasEmailShape(value) {
  return /\S+@\S+\.\S+/.test(value);
}

function normalizeCode(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function AuthPage({
  initialMode = "login",
  onAuthSuccess = noop,
  onNavigateLanding = noop,
  onStartOnboarding = noop
}) {
  const [mode, setMode] = useState(() => getInitialMode(initialMode));
  const [login, setLogin] = useState({ email: "", password: "", remember: true });
  const [sso, setSso] = useState({ provider: ssoProviders[0], domain: "" });
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [invite, setInvite] = useState({ code: "", email: "" });
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(organizationOptions[0].id);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const activeMode = authModes[mode];
  const selectedOrganization = useMemo(() => {
    return organizationOptions.find((organization) => organization.id === selectedOrganizationId) ?? organizationOptions[0];
  }, [selectedOrganizationId]);

  function transition(nextMode, nextMessage = "") {
    setMode(getInitialMode(nextMode));
    setError("");
    setMessage(nextMessage);
  }

  function handleLoginSubmit(event) {
    event.preventDefault();
    const email = login.email.trim().toLowerCase();

    if (!hasEmailShape(email)) {
      setError("Введите рабочий email.");
      return;
    }

    if (login.password.length < 8) {
      setError("Пароль должен содержать минимум 8 символов.");
      return;
    }

    if (email.includes("blocked")) {
      transition("blocked");
      return;
    }

    if (email.includes("maintenance")) {
      transition("maintenance");
      return;
    }

    if (email.includes("multi")) {
      transition("organizationSelect", "Найдено несколько организаций. Выберите tenant для продолжения.");
      return;
    }

    transition("twoFactor", `Код 2FA отправлен для ${email}.`);
  }

  function handleSsoSubmit(event) {
    event.preventDefault();
    const domain = sso.domain.trim().toLowerCase();

    if (!domain || !domain.includes(".")) {
      setError("Укажите домен организации, например company.ru.");
      return;
    }

    if (domain.includes("blocked")) {
      transition("blocked");
      return;
    }

    if (domain.includes("maintenance")) {
      transition("maintenance");
      return;
    }

    if (domain.includes("multi")) {
      transition("organizationSelect", `${sso.provider}: найдено несколько tenant для домена ${domain}.`);
      return;
    }

    onAuthSuccess({
      method: "sso",
      provider: sso.provider,
      domain,
      organization: organizationOptions[0]
    });
  }

  function handleTwoFactorSubmit(event) {
    event.preventDefault();

    if (twoFactorCode === "000000") {
      setError("Код отклонен. Попробуйте резервный код или восстановление доступа.");
      return;
    }

    if (twoFactorCode.length !== 6) {
      setError("Введите 6 цифр из приложения 2FA.");
      return;
    }

    onAuthSuccess({
      method: "password",
      email: login.email.trim(),
      remember: login.remember,
      organization: selectedOrganization
    });
  }

  function handleRecoverySubmit(event) {
    event.preventDefault();

    if (!hasEmailShape(recoveryEmail.trim())) {
      setError("Введите email, привязанный к аккаунту.");
      return;
    }

    setError("");
    setMessage(`Ссылка восстановления отправлена на ${recoveryEmail.trim()}.`);
  }

  function handleInviteSubmit(event) {
    event.preventDefault();
    const code = invite.code.trim();
    const email = invite.email.trim();

    if (!hasEmailShape(email)) {
      setError("Введите email из приглашения.");
      return;
    }

    if (code.toLowerCase().includes("expired")) {
      transition("expired");
      return;
    }

    if (code.length < 8) {
      setError("Invite code должен содержать минимум 8 символов.");
      return;
    }

    onAuthSuccess({
      method: "invite",
      email,
      inviteCode: code,
      organization: selectedOrganization
    });
  }

  function handleOrganizationContinue() {
    onAuthSuccess({
      method: "organizationSelect",
      email: login.email.trim() || invite.email.trim() || `${selectedOrganization.id}@tenant.local`,
      organization: selectedOrganization
    });
  }

  return (
    <main className="auth-page">
      <aside className="auth-product-panel" aria-label="Контекст продукта">
        <button className="auth-back-link" onClick={onNavigateLanding} type="button">
          <ArrowLeft size={17} />
          На лендинг
        </button>
        <div className="auth-product-copy">
          <h1>Support Communication</h1>
          <p>Вход без app shell: проверка tenant, тарифа, роли, SSO, 2FA и состояния платформы до открытия рабочего места.</p>
        </div>
        <div className="auth-access-grid">
          <article>
            <ShieldCheck size={18} />
            <strong>SSO / 2FA</strong>
            <span>SAML, OIDC, резервные коды</span>
          </article>
          <article>
            <Building2 size={18} />
            <strong>Multi-tenant</strong>
            <span>Выбор организации и роли</span>
          </article>
          <article>
            <Sparkles size={18} />
            <strong>Invite-first</strong>
            <span>Активация приглашений</span>
          </article>
        </div>
        <div className="auth-state-shortcuts" aria-label="Состояния доступа">
          <button className={mode === "login" ? "active" : ""} onClick={() => transition("login")} type="button">Login</button>
          <button className={mode === "sso" ? "active" : ""} onClick={() => transition("sso")} type="button">SSO</button>
          <button className={mode === "invite" ? "active" : ""} onClick={() => transition("invite")} type="button">Invite</button>
          <button className={mode === "blocked" ? "active" : ""} onClick={() => transition("blocked")} type="button">Blocked</button>
          <button className={mode === "expired" ? "active" : ""} onClick={() => transition("expired")} type="button">Expired</button>
          <button className={mode === "maintenance" ? "active" : ""} onClick={() => transition("maintenance")} type="button">Maintenance</button>
        </div>
      </aside>

      <section className="auth-workspace" aria-labelledby="auth-title">
        <div className="auth-card">
          <header className="auth-card-header">
            <div>
              <span>{mode}</span>
              <h2 id="auth-title">{activeMode.title}</h2>
              <p>{activeMode.description}</p>
            </div>
          </header>

          {message ? (
            <div className="auth-alert success" role="status">
              <CheckCircle2 size={17} />
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="auth-alert error" role="alert">
              <AlertTriangle size={17} />
              {error}
            </div>
          ) : null}

          {mode === "login" ? (
            <form className="auth-form" onSubmit={handleLoginSubmit}>
              <label className="auth-field">
                <span>Email</span>
                <div className="auth-input-with-icon">
                  <Mail size={17} />
                  <input
                    autoComplete="email"
                    onChange={(event) => setLogin((current) => ({ ...current, email: event.target.value }))}
                    placeholder="name@company.ru"
                    type="email"
                    value={login.email}
                  />
                </div>
              </label>
              <label className="auth-field">
                <span>Пароль</span>
                <div className="auth-input-with-icon">
                  <LockKeyhole size={17} />
                  <input
                    autoComplete="current-password"
                    onChange={(event) => setLogin((current) => ({ ...current, password: event.target.value }))}
                    placeholder="Минимум 8 символов"
                    type="password"
                    value={login.password}
                  />
                </div>
              </label>
              <div className="auth-form-row">
                <label className="auth-check">
                  <input
                    checked={login.remember}
                    onChange={(event) => setLogin((current) => ({ ...current, remember: event.target.checked }))}
                    type="checkbox"
                  />
                  Запомнить tenant
                </label>
                <button className="auth-link-button" onClick={() => transition("recovery")} type="button">Забыли пароль?</button>
              </div>
              <button className="auth-primary-button" type="submit">
                Продолжить
                <ArrowRight size={17} />
              </button>
              <div className="auth-secondary-actions">
                <button onClick={() => transition("sso")} type="button">Войти через SSO</button>
                <button onClick={() => transition("invite")} type="button">Активировать invite</button>
              </div>
              <button className="auth-onboarding-link" onClick={() => onStartOnboarding({ source: "auth-login" })} type="button">
                Создать новую организацию
              </button>
            </form>
          ) : null}

          {mode === "sso" ? (
            <form className="auth-form" onSubmit={handleSsoSubmit}>
              <label className="auth-field">
                <span>Провайдер</span>
                <select
                  onChange={(event) => setSso((current) => ({ ...current, provider: event.target.value }))}
                  value={sso.provider}
                >
                  {ssoProviders.map((provider) => <option key={provider}>{provider}</option>)}
                </select>
              </label>
              <label className="auth-field">
                <span>Домен организации</span>
                <div className="auth-input-with-icon">
                  <Building2 size={17} />
                  <input
                    onChange={(event) => setSso((current) => ({ ...current, domain: event.target.value }))}
                    placeholder="company.ru"
                    value={sso.domain}
                  />
                </div>
              </label>
              <button className="auth-primary-button" type="submit">
                Продолжить через SSO
                <ArrowRight size={17} />
              </button>
              <button className="auth-link-button left" onClick={() => transition("login")} type="button">
                <ArrowLeft size={16} />
                Назад к email
              </button>
            </form>
          ) : null}

          {mode === "twoFactor" ? (
            <form className="auth-form" onSubmit={handleTwoFactorSubmit}>
              <label className="auth-field">
                <span>Код 2FA</span>
                <div className="auth-input-with-icon">
                  <KeyRound size={17} />
                  <input
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setTwoFactorCode(normalizeCode(event.target.value))}
                    placeholder="123456"
                    value={twoFactorCode}
                  />
                </div>
              </label>
              <div className="auth-two-factor-grid" aria-label="Статус проверки">
                <span>Устройство: authenticator</span>
                <span>Окно: 30 секунд</span>
                <span>Попытки: 3</span>
              </div>
              <button className="auth-primary-button" type="submit">
                Подтвердить вход
                <ArrowRight size={17} />
              </button>
              <div className="auth-secondary-actions">
                <button onClick={() => setMessage("Новый код отправлен в резервный канал.")} type="button">
                  <RefreshCcw size={16} />
                  Отправить снова
                </button>
                <button onClick={() => transition("recovery")} type="button">Нет доступа</button>
              </div>
            </form>
          ) : null}

          {mode === "recovery" ? (
            <form className="auth-form" onSubmit={handleRecoverySubmit}>
              <label className="auth-field">
                <span>Email аккаунта</span>
                <div className="auth-input-with-icon">
                  <Mail size={17} />
                  <input
                    autoComplete="email"
                    onChange={(event) => setRecoveryEmail(event.target.value)}
                    placeholder="name@company.ru"
                    type="email"
                    value={recoveryEmail}
                  />
                </div>
              </label>
              <button className="auth-primary-button" type="submit">Отправить ссылку восстановления</button>
              <button className="auth-link-button left" onClick={() => transition("login")} type="button">
                <ArrowLeft size={16} />
                Назад ко входу
              </button>
            </form>
          ) : null}

          {mode === "invite" ? (
            <form className="auth-form" onSubmit={handleInviteSubmit}>
              <label className="auth-field">
                <span>Email из приглашения</span>
                <div className="auth-input-with-icon">
                  <UserPlus size={17} />
                  <input
                    autoComplete="email"
                    onChange={(event) => setInvite((current) => ({ ...current, email: event.target.value }))}
                    placeholder="invitee@company.ru"
                    type="email"
                    value={invite.email}
                  />
                </div>
              </label>
              <label className="auth-field">
                <span>Invite code</span>
                <input
                  onChange={(event) => setInvite((current) => ({ ...current, code: event.target.value }))}
                  placeholder="INVITE-2026"
                  value={invite.code}
                />
              </label>
              <button className="auth-primary-button" type="submit">
                Активировать приглашение
                <ArrowRight size={17} />
              </button>
              <button className="auth-link-button left" onClick={() => transition("login")} type="button">
                <ArrowLeft size={16} />
                Назад ко входу
              </button>
            </form>
          ) : null}

          {mode === "organizationSelect" ? (
            <div className="auth-organization-flow">
              <div className="auth-organization-list">
                {organizationOptions.map((organization) => (
                  <button
                    className={selectedOrganizationId === organization.id ? "selected" : ""}
                    key={organization.id}
                    onClick={() => setSelectedOrganizationId(organization.id)}
                    type="button"
                  >
                    <Building2 size={18} />
                    <span>
                      <strong>{organization.name}</strong>
                      <small>{organization.role} · {organization.tariff}</small>
                    </span>
                    <b>{organization.status}</b>
                    <time>{organization.lastLogin}</time>
                  </button>
                ))}
              </div>
              <footer className="auth-flow-footer">
                <button className="auth-link-button left" onClick={() => transition("login")} type="button">
                  <ArrowLeft size={16} />
                  Назад
                </button>
                <button className="auth-primary-button compact" onClick={handleOrganizationContinue} type="button">
                  Продолжить
                  <ArrowRight size={17} />
                </button>
              </footer>
            </div>
          ) : null}

          {mode === "blocked" ? (
            <AuthStatePanel
              actionLabel="Вернуться ко входу"
              detail="Причина: превышен лимит попыток входа или аккаунт отключен администратором tenant. Вход в app shell не будет открыт."
              icon={<ShieldAlert size={30} />}
              onAction={() => transition("login")}
              secondaryActionLabel="На лендинг"
              onSecondaryAction={onNavigateLanding}
              tone="danger"
            />
          ) : null}

          {mode === "expired" ? (
            <AuthStatePanel
              actionLabel="Запросить новое приглашение"
              detail="Старый invite token удален из активных сессий. Новый администратор может отправить повторное приглашение или начать onboarding организации."
              icon={<Clock3 size={30} />}
              onAction={() => transition("invite", "Введите новый invite code из письма.")}
              secondaryActionLabel="Начать onboarding"
              onSecondaryAction={() => onStartOnboarding({ source: "expired-invite" })}
              tone="warn"
            />
          ) : null}

          {mode === "maintenance" ? (
            <AuthStatePanel
              actionLabel="Проверить снова"
              detail="Идет maintenance окна авторизации и route guards. Публичный лендинг и status/support остаются доступны."
              icon={<Wrench size={30} />}
              onAction={() => setMessage("Статус обновлен: авторизация пока закрыта.")}
              secondaryActionLabel="На лендинг"
              onSecondaryAction={onNavigateLanding}
              tone="info"
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function AuthStatePanel({
  actionLabel,
  detail,
  icon,
  onAction,
  onSecondaryAction,
  secondaryActionLabel,
  tone
}) {
  return (
    <div className={`auth-state-panel ${tone}`}>
      <div className="auth-state-icon">{icon}</div>
      <p>{detail}</p>
      <div className="auth-state-actions">
        <button className="auth-primary-button compact" onClick={onAction} type="button">{actionLabel}</button>
        <button className="auth-link-button" onClick={onSecondaryAction} type="button">{secondaryActionLabel}</button>
      </div>
    </div>
  );
}

export default AuthPage;
