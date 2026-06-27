import React from "react";
import { SectionTitle } from "../../ui.jsx";

export function SecurityControlsPanel({
  activeSecuritySessions,
  onRevokeSession,
  revokedSessionIds,
  securityAlerts,
  securityControls
}) {
  return (
    <section className="work-panel security-controls-panel">
      <SectionTitle title="Security controls" action="2FA, sessions, IP allowlist" />
      <div className="security-control-grid">
        {securityControls.map((control) => (
          <article className={`security-control-card ${control.tone}`} key={control.id}>
            <strong>{control.title}</strong>
            <b>{control.state}</b>
            <span>{control.detail}</span>
          </article>
        ))}
      </div>
      <div className="security-session-list">
        {activeSecuritySessions.map((session) => {
          const isRevoked = revokedSessionIds.includes(session.id);

          return (
            <div className={`security-session-row ${isRevoked ? "revoked" : ""}`} key={session.id}>
              <span>
                <strong>{session.user}</strong>
                <small>{session.role} · {session.device}</small>
              </span>
              <code>{session.ip}</code>
              <b>{isRevoked ? "Отозвана" : session.status}</b>
              <time>{session.lastSeen}</time>
              <button disabled={isRevoked} onClick={() => onRevokeSession(session.id)} title="Отозвать сессию" type="button">
                Revoke
              </button>
            </div>
          );
        })}
      </div>
      <div className="security-alert-list">
        {securityAlerts.map((alert) => (
          <article className={`security-alert ${alert.level}`} key={alert.id}>
            <time>{alert.time}</time>
            <strong>{alert.text}</strong>
            <span>{alert.route}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
