import React, { useMemo, useState } from "react";
import { authService, mapAuthErrorToMode } from "../../services/authService.js";
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
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Wrench
} from "lucide-react";
import { AuthStatePanel } from "./AuthStatePanel.jsx";
import {
  authModes,
  getInitialMode,
  hasEmailShape,
  normalizeCode,
  organizationOptions,
  ssoProviders
} from "./authModel.js";
import "./auth.css";

const noop = () => {};
const AUTH_STATE_SHORTCUTS_ENABLED = import.meta.env.DEV;
const defaultTenantMfaContext = {
  email: "",
  inviteCode: "",
  method: "password",
  password: "",
  recoveryToken: "",
  tenantId: ""
};

function getLocalMailboxUrl() {
  if (typeof window === "undefined") {
    return "";
  }

  const hostname = window.location.hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    return "";
  }

  return `http://${hostname === "::1" ? "[::1]" : hostname}:18025`;
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
  const [tenantMfaChallengeId, setTenantMfaChallengeId] = useState("");
  const [tenantMfaContext, setTenantMfaContext] = useState(defaultTenantMfaContext);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryToken, setRecoveryToken] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [invite, setInvite] = useState({ code: "", email: "", password: "" });
  const [memberships, setMemberships] = useState(organizationOptions);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(organizationOptions[0].id);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const localMailboxUrl = getLocalMailboxUrl();

  const activeMode = authModes[mode];
  const selectedOrganization = useMemo(() => {
    return memberships.find((organization) => organization.id === selectedOrganizationId) ?? memberships[0];
  }, [memberships, selectedOrganizationId]);

  function transition(nextMode, nextMessage = "") {
    setMode(getInitialMode(nextMode));
    setError("");
    setMessage(nextMessage);
  }

  function handleAuthDenial(response, fallbackMessage, mfaContext = {}) {
    const nextMode = response.data?.nextStep === "otp" ? "twoFactor" : mapAuthErrorToMode(response.error?.code);
    if (nextMode) {
      if (nextMode === "organizationSelect" && Array.isArray(response.data?.memberships)) {
        setMemberships(response.data.memberships.map(mapMembershipOption));
      }
      if (nextMode === "twoFactor") {
        const contextEmail = String(
          mfaContext.email
          || tenantMfaContext.email
          || login.email
          || invite.email
          || recoveryEmail
        ).trim().toLowerCase();
        const challengeId = response.data?.mfaChallengeId ?? tenantMfaChallengeId;

        if (challengeId) {
          setTenantMfaChallengeId(challengeId);
        }
        setTenantMfaContext({
          ...defaultTenantMfaContext,
          ...tenantMfaContext,
          ...mfaContext,
          email: contextEmail,
          password: mfaContext.password ?? tenantMfaContext.password ?? login.password
        });
        setMode("twoFactor");

        if (response.error) {
          setError(response.error.message ?? fallbackMessage);
          setMessage("");
        } else {
          setError("");
          setMessage(`Код подтверждения отправлен на ${contextEmail}.`);
          setTwoFactorCode("");
        }
        return;
      }
      transition(nextMode, response.error?.message ?? fallbackMessage);
      return;
    }

    setError(response.error?.message ?? fallbackMessage);
  }

  async function handleLoginSubmit(event) {
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

    setError("");
    setMessage("");
    setTenantMfaChallengeId("");
    setTenantMfaContext(defaultTenantMfaContext);
    setIsSubmitting(true);

    try {
      const response = await authService.loginTenantOperator({
        email,
        password: login.password
      });

      if (authService.persistTenantLogin(response)) {
        onAuthSuccess({
          method: "password",
          email,
          remember: login.remember,
          organization: selectedOrganization,
          tenantId: response.data.tenantId,
          operator: response.data.operator
        });
        return;
      }

      handleAuthDenial(response, "Не удалось войти. Проверьте email и пароль.", {
        email,
        method: "password",
        password: login.password
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSsoSubmit(event) {
    event.preventDefault();
    const domain = sso.domain.trim().toLowerCase();

    if (!domain || !domain.includes(".")) {
      setError("Укажите домен организации, например company.ru.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const redirectUri = `${window.location.origin}${window.location.pathname}#/auth/oidc/callback`;
      const response = await authService.startOidcLogin({
        providerId: mapSsoProviderId(sso.provider),
        redirectUri
      });

      if (response.status !== "ok" || !response.data?.authorizationUrl) {
        handleAuthDenial(response, "Не удалось начать SSO вход.");
        return;
      }

      window.location.assign(response.data.authorizationUrl);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitTenantMfaChallenge() {
    const context = tenantMfaContext;
    const email = String(context.email || login.email).trim().toLowerCase();

    if (context.method === "invite") {
      return authService.acceptInvite({
        code: context.inviteCode,
        email,
        mfaChallengeId: tenantMfaChallengeId,
        otp: twoFactorCode,
        password: context.password
      });
    }

    if (context.method === "recovery") {
      return authService.completeRecovery({
        email,
        mfaChallengeId: tenantMfaChallengeId,
        otp: twoFactorCode,
        password: context.password,
        token: context.recoveryToken
      });
    }

    return authService.loginTenantOperator({
      email,
      mfaChallengeId: tenantMfaChallengeId,
      password: context.password || login.password,
      otp: twoFactorCode,
      tenantId: context.tenantId || undefined
    });
  }

  async function handleTwoFactorSubmit(event) {
    event.preventDefault();

    if (twoFactorCode.length !== 6) {
      setError("Введите 6 цифр из письма.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await submitTenantMfaChallenge();
      const method = tenantMfaContext.method === "invite" || tenantMfaContext.method === "recovery"
        ? tenantMfaContext.method
        : "password";
      const email = String(tenantMfaContext.email || login.email).trim();

      if (authService.persistTenantLogin(response)) {
        onAuthSuccess({
          method,
          email,
          remember: login.remember,
          inviteCode: tenantMfaContext.inviteCode || undefined,
          organization: selectedOrganization,
          tenantId: response.data.tenantId,
          operator: response.data.operator
        });
        return;
      }

      handleAuthDenial(response, "Код подтверждения отклонён.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRecoverySubmit(event) {
    event.preventDefault();
    const email = recoveryEmail.trim().toLowerCase();
    const token = recoveryToken.trim();

    if (!hasEmailShape(email)) {
      setError("Введите email, привязанный к аккаунту.");
      return;
    }

    if (token || recoveryPassword) {
      if (!token || recoveryPassword.length < 8) {
        setError("Recovery token and a new password with at least 8 characters are required.");
        return;
      }
    }

    setError("");
    setIsSubmitting(true);

    try {
      if (token && recoveryPassword) {
        const response = await authService.completeRecovery({
          email,
          password: recoveryPassword,
          token
        });

        if (authService.persistTenantLogin(response)) {
          onAuthSuccess({
            method: "recovery",
            email,
            organization: selectedOrganization,
            tenantId: response.data.tenantId,
            operator: response.data.operator
          });
          return;
        }

        handleAuthDenial(response, "Не удалось завершить восстановление.", {
          email,
          method: "recovery",
          password: recoveryPassword,
          recoveryToken: token
        });
        return;
      }

      const response = await authService.requestRecovery({ email });
      if (response.status !== "ok") {
        handleAuthDenial(response, "Не удалось отправить ссылку восстановления.");
        return;
      }

      setRecoveryToken(response.data?.recoveryToken ?? recoveryToken);
      setMessage(`Ссылка восстановления отправлена на ${email}.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleInviteSubmit(event) {
    event.preventDefault();
    const code = invite.code.trim();
    const email = invite.email.trim().toLowerCase();

    if (!hasEmailShape(email)) {
      setError("Введите email из приглашения.");
      return;
    }

    if (invite.password.length < 8) {
      setError("Пароль должен содержать минимум 8 символов.");
      return;
    }

    if (code.length < 8) {
      setError("Invite code должен содержать минимум 8 символов.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await authService.acceptInvite({
        code,
        email,
        password: invite.password
      });

      if (authService.persistTenantLogin(response)) {
        onAuthSuccess({
          method: "invite",
          email,
          inviteCode: code,
          organization: selectedOrganization
        });
        return;
      }

      handleAuthDenial(response, "Не удалось активировать приглашение.", {
        email,
        inviteCode: code,
        method: "invite",
        password: invite.password
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOrganizationContinue() {
    const email = login.email.trim() || invite.email.trim();
    if (!email || !selectedOrganization?.tenantId) {
      setError("Выберите организацию для продолжения.");
      return;
    }

    setIsSubmitting(true);
    try {
      const selection = await authService.selectTenant({
        email,
        tenantId: selectedOrganization.tenantId ?? selectedOrganization.id
      });

      if (selection.status !== "ok") {
        handleAuthDenial(selection, "Не удалось выбрать организацию.");
        return;
      }

      const response = await authService.loginTenantOperator({
        email,
        password: login.password,
        tenantId: selectedOrganization.tenantId ?? selectedOrganization.id
      });

      if (authService.persistTenantLogin(response)) {
        onAuthSuccess({
          method: "organizationSelect",
          email,
          organization: selectedOrganization
        });
        return;
      }

      handleAuthDenial(response, "Не удалось войти после выбора организации.", {
        email,
        method: "password",
        password: login.password,
        tenantId: selectedOrganization.tenantId ?? selectedOrganization.id
      });
    } finally {
      setIsSubmitting(false);
    }
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
        {AUTH_STATE_SHORTCUTS_ENABLED ? (
          <div className="auth-state-shortcuts" aria-label="Состояния доступа">
            <button className={mode === "login" ? "active" : ""} onClick={() => transition("login")} type="button">Login</button>
            <button className={mode === "sso" ? "active" : ""} onClick={() => transition("sso")} type="button">SSO</button>
            <button className={mode === "invite" ? "active" : ""} onClick={() => transition("invite")} type="button">Invite</button>
            <button className={mode === "blocked" ? "active" : ""} onClick={() => transition("blocked")} type="button">Blocked</button>
            <button className={mode === "expired" ? "active" : ""} onClick={() => transition("expired")} type="button">Expired</button>
            <button className={mode === "maintenance" ? "active" : ""} onClick={() => transition("maintenance")} type="button">Maintenance</button>
          </div>
        ) : null}
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
              <button className="auth-primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Вход..." : "Продолжить"}
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
              <button className="auth-primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Перенаправление..." : "Продолжить через SSO"}
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
                <span>Код из письма</span>
                <div className="auth-input-with-icon">
                  <KeyRound size={17} />
                  <input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setTwoFactorCode(normalizeCode(event.target.value))}
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    value={twoFactorCode}
                  />
                </div>
              </label>
              <button className="auth-primary-button" disabled={isSubmitting} type="submit">
                Подтвердить вход
                <ArrowRight size={17} />
              </button>
              <div className="auth-secondary-actions">
                <button onClick={() => transition("recovery")} type="button">Нет доступа</button>
                {localMailboxUrl ? (
                  <a href={localMailboxUrl} rel="noreferrer" target="_blank">Открыть тестовую почту</a>
                ) : null}
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
              <label className="auth-field">
                <span>Recovery token</span>
                <input
                  onChange={(event) => setRecoveryToken(event.target.value)}
                  placeholder="recovery_..."
                  value={recoveryToken}
                />
              </label>
              <label className="auth-field">
                <span>New password</span>
                <input
                  autoComplete="new-password"
                  onChange={(event) => setRecoveryPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  type="password"
                  value={recoveryPassword}
                />
              </label>
              <button className="auth-primary-button" disabled={isSubmitting} type="submit">
                {recoveryToken || recoveryPassword ? "Complete recovery" : "Отправить ссылку восстановления"}
              </button>
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
              <label className="auth-field">
                <span>Пароль</span>
                <input
                  autoComplete="new-password"
                  onChange={(event) => setInvite((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Минимум 8 символов"
                  type="password"
                  value={invite.password}
                />
              </label>
              <button className="auth-primary-button" disabled={isSubmitting} type="submit">
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
                {memberships.map((organization) => (
                  <button
                    className={selectedOrganizationId === organization.id ? "selected" : ""}
                    key={organization.id}
                    onClick={() => setSelectedOrganizationId(organization.id)}
                    type="button"
                  >
                    <Building2 size={18} />
                    <span>
                      <strong>{organization.name}</strong>
                      <small>{organization.role} · {organization.tariff ?? "tenant"}</small>
                    </span>
                    <b>{organization.status ?? "active"}</b>
                  </button>
                ))}
              </div>
              <footer className="auth-flow-footer">
                <button className="auth-link-button left" onClick={() => transition("login")} type="button">
                  <ArrowLeft size={16} />
                  Назад
                </button>
                <button className="auth-primary-button compact" disabled={isSubmitting} onClick={handleOrganizationContinue} type="button">
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

function mapSsoProviderId(provider) {
  if (provider === "SAML") {
    return "saml-main";
  }

  return "oidc-main";
}

function mapMembershipOption(membership) {
  return {
    id: membership.id ?? membership.tenantId,
    tenantId: membership.tenantId,
    name: membership.tenantName ?? membership.tenantId,
    role: membership.role ?? "Operator",
    status: "active"
  };
}

export default AuthPage;
