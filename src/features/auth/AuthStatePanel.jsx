export function AuthStatePanel({
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
