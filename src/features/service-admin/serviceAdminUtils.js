export const noop = () => {};

export function formatCurrency(value) {
  return new Intl.NumberFormat("ru-RU", {
    currency: "RUB",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}

export function formatDateTime(value) {
  if (!value) {
    return "never";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(new Date(value));
}

export function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function getStatusTone(status) {
  const value = String(status).toLowerCase();

  if (["active", "accepted", "enabled", "on", "operational", "resolved", "ok"].includes(value)) {
    return "ok";
  }

  if (["watch", "trial", "monitoring", "identified", "gradual", "guarded", "degraded"].includes(value)) {
    return "warn";
  }

  if (["restricted", "blocked", "partial_outage", "investigating", "sev2", "critical", "off"].includes(value)) {
    return "closed";
  }

  return "info";
}

export function envelopeToAuditEntry(envelope, fallback = {}) {
  const auditEvent = envelope?.data?.auditEvent;

  return {
    id: auditEvent?.id ?? `svc-ui-${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    actor: fallback.actor ?? "Service admin",
    action: auditEvent?.action ?? fallback.action ?? envelope?.operation ?? "service-admin.action",
    target: auditEvent?.target ?? fallback.target ?? "service-admin",
    tenantId: auditEvent?.tenantId ?? fallback.tenantId ?? null,
    severity: fallback.severity ?? (envelope?.status === "ok" ? "info" : "warn"),
    reason: auditEvent?.reason ?? fallback.reason ?? "Service-admin UI action",
    result: auditEvent?.result ?? envelope?.status ?? "ok",
    traceId: envelope?.traceId ?? fallback.traceId ?? "trc_service_admin_ui"
  };
}
