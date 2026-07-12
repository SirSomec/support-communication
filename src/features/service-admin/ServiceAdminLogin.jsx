import React, { useState } from "react";
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { authService } from "../../services/authService.js";
import "../auth/auth.css";

export function ServiceAdminLogin({ onBack, onSuccess }) {
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const awaitingOtp = Boolean(challengeId);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const response = await authService.login({
        email: credentials.email.trim().toLowerCase(),
        password: credentials.password,
        ...(awaitingOtp ? { mfaChallengeId: challengeId, otp } : {})
      });

      if (response.status === "ok" && response.data?.accessToken) {
        onSuccess();
        return;
      }

      if (response.data?.nextStep === "otp" && response.data?.mfaChallengeId) {
        setChallengeId(response.data.mfaChallengeId);
        setOtp("");
        return;
      }

      setError(response.error?.message ?? "Не удалось выполнить вход администратора сервиса.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page" data-testid="route-service-admin-login">
      <section className="auth-card">
        <div className="auth-brand"><ShieldCheck size={24} /> Support Communication</div>
        <div className="auth-heading">
          <span className="auth-kicker">Внутренний контур</span>
          <h1>Администрирование сервиса</h1>
          <p>Вход доступен только учетной записи администратора сервиса.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {!awaitingOtp ? (
            <>
              <label>
                <span>Email</span>
                <div className="auth-input"><Mail size={18} /><input autoComplete="username" onChange={(event) => setCredentials((current) => ({ ...current, email: event.target.value }))} required type="email" value={credentials.email} /></div>
              </label>
              <label>
                <span>Пароль</span>
                <div className="auth-input"><LockKeyhole size={18} /><input autoComplete="current-password" minLength="8" onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} required type="password" value={credentials.password} /></div>
              </label>
            </>
          ) : (
            <label>
              <span>Код подтверждения</span>
              <div className="auth-input"><KeyRound size={18} /><input autoComplete="one-time-code" inputMode="numeric" maxLength="6" onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} required value={otp} /></div>
              <small>Код отправлен на {credentials.email.trim().toLowerCase()}.</small>
            </label>
          )}
          {error ? <div className="auth-message error" role="alert">{error}</div> : null}
          <div className="auth-actions">
            <button className="secondary-button" onClick={onBack} type="button">Назад</button>
            <button className="primary-button" disabled={submitting} type="submit">{awaitingOtp ? "Подтвердить" : "Продолжить"}</button>
          </div>
        </form>
      </section>
    </main>
  );
}
