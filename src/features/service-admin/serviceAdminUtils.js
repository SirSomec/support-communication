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
    return "нет данных";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "РЅРµС‚ РґР°РЅРЅС‹С…";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit"
  }).format(date);
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

const labelMap = {
  accepted: "принято",
  active: "активен",
  all: "все",
  baseline: "базовый",
  blocked: "заблокирован",
  business: "Бизнес",
  critical: "критический",
  degraded: "деградация",
  enabled: "включено",
  enterprise: "Корпоративный",
  expired: "истекло",
  gradual: "постепенно",
  guarded: "под контролем",
  high: "высокий",
  identified: "причина найдена",
  info: "инфо",
  investigating: "расследуется",
  invited: "приглашен",
  low: "низкий",
  medium: "средний",
  monitoring: "наблюдение",
  not_configured: "не настроено",
  off: "выключено",
  ok: "успешно",
  on: "включено",
  operational: "работает",
  over_limit: "сверх лимита",
  partial_outage: "частичный сбой",
  plan: "тариф",
  production: "продакшн",
  queued: "поставлено в очередь",
  read_only_by_default: "только чтение по умолчанию",
  requires_confirmation: "требует подтверждения",
  reset_pending: "ожидает сброса",
  resolved: "решено",
  restricted: "ограничен",
  scale: "Масштаб",
  sent: "отправлено",
  sev2: "SEV2",
  sev3: "SEV3",
  standard_change: "стандартное изменение",
  starter: "Старт",
  tenant: "организация",
  trial: "пробный",
  unknown: "неизвестно",
  warn: "предупреждение",
  watch: "под наблюдением",
  within_limit: "в лимите"
};

const actionMap = {
  "auth.state.refresh": "Обновление состояния входа",
  "feature_flag.update": "Обновление флага",
  "impersonation.expired": "Доступ истек",
  "impersonation.start": "Вход от имени пользователя",
  "impersonation.stop": "Выход из режима доступа",
  "incident.monitor": "Мониторинг инцидента",
  "incident.update": "Обновление инцидента",
  "platform.alert.acknowledge": "Подтверждение алерта платформы",
  "support.block": "Блокировка пользователя",
  "support.impersonate": "Вход от имени пользователя",
  "support.invite": "Повторное приглашение",
  "support.logout": "Завершение сессий",
  "support.reset2fa": "Сброс 2FA",
  "tariff.preview": "Предпросмотр тарифа",
  "tenant.status.change": "Изменение статуса организации",
  "tenant.tariff.change": "Изменение тарифа",
  "user.block": "Блокировка пользователя",
  "user.invite.resend": "Повторное приглашение",
  "user.mfa.reset": "Сброс 2FA",
  "user.sessions.logout": "Завершение сессий"
};

const roleMap = {
  Admin: "Администратор",
  Operator: "Оператор",
  Owner: "Владелец",
  "Senior operator": "Старший оператор"
};

export function formatLabel(value) {
  const key = String(value ?? "").toLowerCase();
  return labelMap[key] ?? value ?? "нет данных";
}

export function formatAction(action) {
  return actionMap[action] ?? action ?? "Действие администратора сервиса";
}

export function formatResult(result) {
  return formatLabel(result);
}

export function formatRole(role) {
  return roleMap[role] ?? role ?? "нет данных";
}

export function envelopeToAuditEntry(envelope, fallback = {}) {
  const auditEvent = envelope?.data?.auditEvent;

  return {
    id: auditEvent?.id ?? `svc-ui-${Date.now().toString(36)}`,
    at: new Date().toISOString(),
    actor: fallback.actor ?? "Администратор сервиса",
    action: auditEvent?.action ?? fallback.action ?? envelope?.operation ?? "service-admin.action",
    target: auditEvent?.target ?? fallback.target ?? "администратор сервиса",
    tenantId: auditEvent?.tenantId ?? fallback.tenantId ?? null,
    severity: fallback.severity ?? (envelope?.status === "ok" ? "info" : "warn"),
    reason: auditEvent?.reason ?? fallback.reason ?? "Действие из интерфейса администратора сервиса",
    result: auditEvent?.result ?? envelope?.status ?? "ok",
    traceId: envelope?.traceId ?? fallback.traceId ?? "trc_service_admin_ui"
  };
}
