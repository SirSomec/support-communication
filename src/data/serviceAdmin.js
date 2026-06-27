export const serviceAdminSession = {
  id: "svc-session-current",
  adminId: "svc-admin-001",
  adminName: "Надя Орлова",
  role: "service_admin",
  authState: "mfa_verified",
  allowedActions: [
    "tenants.read",
    "tenants.manage",
    "billing.change",
    "users.support",
    "incidents.manage",
    "flags.manage",
    "impersonation.start"
  ],
  mfaVerifiedAt: "2026-06-27T07:52:00.000Z",
  expiresAt: "2026-06-27T11:52:00.000Z"
};

export const serviceAdminTenants = [
  {
    id: "tenant-northstar",
    name: "Northstar Retail",
    legalName: "ООО Northstar Retail",
    status: "active",
    planId: "business",
    region: "eu-central",
    owner: "Мира Волкова",
    ownerEmail: "mira@northstar.example",
    workspaces: 8,
    users: 146,
    activeUsers: 91,
    monthlyRevenue: 489000,
    arr: 5868000,
    healthScore: 94,
    sla: 98.7,
    lastSeenAt: "2026-06-27T07:38:00.000Z",
    domains: ["northstar.example", "support.northstar.example"],
    flags: ["ff-ai-replies", "ff-billing-v2"],
    incidentIds: ["inc-search-latency"],
    notes: "Ключевой клиент. Владелец биллинга запросил пересмотр тарифа на следующей неделе."
  },
  {
    id: "tenant-volga",
    name: "Volga Logistics",
    legalName: "АО Volga Logistics",
    status: "watch",
    planId: "scale",
    region: "ru-west",
    owner: "Сергей Маркин",
    ownerEmail: "sergey@volga.example",
    workspaces: 14,
    users: 312,
    activeUsers: 204,
    monthlyRevenue: 1140000,
    arr: 13680000,
    healthScore: 76,
    sla: 91.4,
    lastSeenAt: "2026-06-27T07:31:00.000Z",
    domains: ["volga.example"],
    flags: ["ff-priority-routing"],
    incidentIds: ["inc-webhook-retry"],
    notes: "Высокий объем вебхуков. Уведомления по инциденту должны оставаться видимыми."
  },
  {
    id: "tenant-aurora",
    name: "Aurora Fintech",
    legalName: "Aurora Fintech Group",
    status: "restricted",
    planId: "enterprise",
    region: "eu-west",
    owner: "Елена Мороз",
    ownerEmail: "ops@aurora.example",
    workspaces: 22,
    users: 487,
    activeUsers: 329,
    monthlyRevenue: 2190000,
    arr: 26280000,
    healthScore: 68,
    sla: 86.9,
    lastSeenAt: "2026-06-27T07:25:00.000Z",
    domains: ["aurora.example", "secure.aurora.example"],
    flags: ["ff-ai-replies", "ff-risk-rules"],
    incidentIds: ["inc-auth-degrade", "inc-search-latency"],
    notes: "Ограничен после повторяющихся рисковых админских сессий. Для действий поддержки обязательна причина."
  },
  {
    id: "tenant-lumen",
    name: "Lumen Health",
    legalName: "Lumen Health Ltd",
    status: "trial",
    planId: "starter",
    region: "us-east",
    owner: "Анна Вайс",
    ownerEmail: "admin@lumen.example",
    workspaces: 2,
    users: 24,
    activeUsers: 16,
    monthlyRevenue: 39000,
    arr: 468000,
    healthScore: 89,
    sla: 99.1,
    lastSeenAt: "2026-06-27T07:41:00.000Z",
    domains: ["lumen.example"],
    flags: ["ff-billing-v2"],
    incidentIds: [],
    notes: "Пробный период завершается через 9 дней. Кандидат на тариф Бизнес."
  }
];

export const serviceAdminUsers = [
  {
    id: "usr-ns-owner",
    tenantId: "tenant-northstar",
    name: "Мира Волкова",
    email: "mira@northstar.example",
    role: "Owner",
    status: "active",
    mfa: "enabled",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-27T07:36:00.000Z",
    sessions: 2,
    risk: "low",
    device: "Chrome, macOS",
    supportNotes: "Основной согласующий по биллингу."
  },
  {
    id: "usr-ns-agent",
    tenantId: "tenant-northstar",
    name: "Павел Антонов",
    email: "pavel@northstar.example",
    role: "Senior operator",
    status: "active",
    mfa: "reset_pending",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-27T06:58:00.000Z",
    sessions: 1,
    risk: "medium",
    device: "Edge, Windows",
    supportNotes: "Запросил сброс 2FA после замены телефона."
  },
  {
    id: "usr-volga-admin",
    tenantId: "tenant-volga",
    name: "Сергей Маркин",
    email: "sergey@volga.example",
    role: "Admin",
    status: "active",
    mfa: "enabled",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-27T07:19:00.000Z",
    sessions: 4,
    risk: "high",
    device: "Chrome, Windows",
    supportNotes: "Четыре параллельные сессии во время инцидента вебхуков."
  },
  {
    id: "usr-aurora-risk",
    tenantId: "tenant-aurora",
    name: "Елена Мороз",
    email: "ops@aurora.example",
    role: "Owner",
    status: "blocked",
    mfa: "enabled",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-26T21:12:00.000Z",
    sessions: 0,
    risk: "critical",
    device: "Неизвестный VPN",
    supportNotes: "Заблокирована после сигнала невозможного перемещения."
  },
  {
    id: "usr-lumen-invite",
    tenantId: "tenant-lumen",
    name: "Николай Р.",
    email: "nikolai@lumen.example",
    role: "Operator",
    status: "invited",
    mfa: "not_configured",
    inviteStatus: "expired",
    lastActiveAt: null,
    sessions: 0,
    risk: "low",
    device: "Устройство не найдено",
    supportNotes: "Нужно повторить приглашение перед вводным звонком."
  }
];

export const serviceAdminTariffs = [
  {
    id: "starter",
    name: "Старт",
    priceMonthly: 39000,
    includedUsers: 25,
    workspaceLimit: 3,
    retentionDays: 30,
    automationRuns: 20000,
    features: ["Общий входящий поток", "Базовые отчеты", "Поддержка по почте"],
    changePolicy: "Мгновенное понижение доступно только во время пробного периода."
  },
  {
    id: "business",
    name: "Бизнес",
    priceMonthly: 129000,
    includedUsers: 150,
    workspaceLimit: 10,
    retentionDays: 180,
    automationRuns: 150000,
    features: ["SLA-маршрутизация", "AI-подсказки", "Экспорт аудита", "Приоритетная поддержка"],
    changePolicy: "Изменение применяется со следующего биллингового периода, если не подтверждено явно."
  },
  {
    id: "scale",
    name: "Масштаб",
    priceMonthly: 380000,
    includedUsers: 350,
    workspaceLimit: 20,
    retentionDays: 365,
    automationRuns: 600000,
    features: ["Повтор вебхуков", "Расширенная маршрутизация", "Функциональные флаги", "Выделенный CSM"],
    changePolicy: "Требует причину и предпросмотр согласования биллинга."
  },
  {
    id: "enterprise",
    name: "Корпоративный",
    priceMonthly: 990000,
    includedUsers: 700,
    workspaceLimit: 40,
    retentionDays: 1095,
    automationRuns: 2500000,
    features: ["SAML", "Хранение данных в выбранном регионе", "Индивидуальные лимиты", "Инцидентный мост 24/7"],
    changePolicy: "Требует письменное подтверждение и аудит администратора сервиса."
  }
];

export const serviceAdminPlatformComponents = [
  {
    id: "cmp-api",
    name: "Публичный API",
    status: "operational",
    ownerTeam: "Платформенный контур",
    region: "global",
    latencyMs: 91,
    errorRate: 0.04,
    uptime: 99.99,
    tenantImpact: 0,
    dependencies: ["cmp-auth", "cmp-events"],
    signals: [
      { label: "p95 задержка", value: "91 мс", tone: "ok" },
      { label: "4xx/5xx", value: "0.04%", tone: "ok" },
      { label: "релиз", value: "стабилен", tone: "ok" }
    ],
    recentEvents: ["Канареечный релиз продвинут в 06:20", "Всплесков лимита запросов нет"]
  },
  {
    id: "cmp-auth",
    name: "Авторизация и сессии",
    status: "degraded",
    ownerTeam: "Идентификация",
    region: "eu-west",
    latencyMs: 280,
    errorRate: 1.8,
    uptime: 99.72,
    tenantImpact: 3,
    dependencies: ["cmp-api"],
    signals: [
      { label: "2FA-проверка", value: "+31%", tone: "warn" },
      { label: "отзыв сессии", value: "медленнее", tone: "warn" },
      { label: "правила риска", value: "активны", tone: "ok" }
    ],
    recentEvents: ["Правило риска обновлено в 07:10", "Aurora ограничена после рискового входа"]
  },
  {
    id: "cmp-webhooks",
    name: "Доставка вебхуков",
    status: "partial_outage",
    ownerTeam: "Интеграции",
    region: "ru-west",
    latencyMs: 640,
    errorRate: 5.3,
    uptime: 98.91,
    tenantImpact: 12,
    dependencies: ["cmp-events"],
    signals: [
      { label: "очередь повторов", value: "8.2k", tone: "danger" },
      { label: "ошибки подписи", value: "34", tone: "warn" },
      { label: "очередь ошибок", value: "119", tone: "danger" }
    ],
    recentEvents: ["Открыто окно ручного повтора", "Очередь повторов Volga выше порога"]
  },
  {
    id: "cmp-search",
    name: "Поиск по диалогам",
    status: "degraded",
    ownerTeam: "Поиск и данные",
    region: "global",
    latencyMs: 510,
    errorRate: 0.9,
    uptime: 99.41,
    tenantImpact: 7,
    dependencies: ["cmp-api", "cmp-events"],
    signals: [
      { label: "лаг индекса", value: "14 мин", tone: "warn" },
      { label: "p95 задержка", value: "510 мс", tone: "warn" },
      { label: "догрузка", value: "идет", tone: "ok" }
    ],
    recentEvents: ["Догрузка запущена в 06:44", "Связан тикет поиска Northstar"]
  },
  {
    id: "cmp-events",
    name: "Поток событий",
    status: "operational",
    ownerTeam: "Платформа данных",
    region: "global",
    latencyMs: 122,
    errorRate: 0.08,
    uptime: 99.96,
    tenantImpact: 0,
    dependencies: [],
    signals: [
      { label: "лаг приема", value: "22 сек", tone: "ok" },
      { label: "поток аудита", value: "здоров", tone: "ok" },
      { label: "схема", value: "v18", tone: "ok" }
    ],
    recentEvents: ["Потребитель аудита догнал поток", "Нарушений схемы нет"]
  }
];

export const serviceAdminIncidents = [
  {
    id: "inc-webhook-retry",
    title: "Очередь повторов вебхуков выше порога",
    status: "investigating",
    severity: "sev2",
    componentId: "cmp-webhooks",
    owner: "Дежурный интеграций",
    startedAt: "2026-06-27T06:55:00.000Z",
    updatedAt: "2026-06-27T07:34:00.000Z",
    affectedTenantIds: ["tenant-volga"],
    impact: "Задержка доставки для высоконагруженных конечных точек вебхуков в ru-west.",
    customerMessage: "Доставка вебхуков задерживается. Сообщения стоят в очереди и будут повторены.",
    updates: [
      { at: "07:34", author: "дежурный", text: "Запущена очистка очереди ошибок для конечных точек Volga." },
      { at: "07:12", author: "поддержка", text: "Инцидент связан с таймлайном аккаунта Volga." }
    ]
  },
  {
    id: "inc-auth-degrade",
    title: "Повышенная задержка 2FA-проверки",
    status: "monitoring",
    severity: "sev3",
    componentId: "cmp-auth",
    owner: "Дежурный идентификации",
    startedAt: "2026-06-27T07:05:00.000Z",
    updatedAt: "2026-06-27T07:42:00.000Z",
    affectedTenantIds: ["tenant-aurora"],
    impact: "Администраторы сервиса могут дольше ждать отзыв сессий и сброс 2FA.",
    customerMessage: "Авторизация доступна, но работает с повышенной задержкой.",
    updates: [
      { at: "07:42", author: "идентификация", text: "Задержка вернулась ниже порога алерта." },
      { at: "07:21", author: "риск", text: "Новых алертов невозможного перемещения нет." }
    ]
  },
  {
    id: "inc-search-latency",
    title: "Лаг индекса поиска по истории диалогов",
    status: "identified",
    severity: "sev3",
    componentId: "cmp-search",
    owner: "Поиск и данные",
    startedAt: "2026-06-27T06:44:00.000Z",
    updatedAt: "2026-06-27T07:28:00.000Z",
    affectedTenantIds: ["tenant-northstar", "tenant-aurora"],
    impact: "Новые сообщения могут появляться в поиске с задержкой до 14 минут.",
    customerMessage: "Поиск по диалогам задерживается, живые чаты не затронуты.",
    updates: [
      { at: "07:28", author: "данные", text: "Догрузка дошла до 71%." },
      { at: "06:58", author: "поддержка", text: "Добавлена статусная заметка для Northstar." }
    ]
  }
];

export const serviceAdminFeatureFlags = [
  {
    id: "flag-ai-replies",
    key: "ff-ai-replies",
    name: "AI-ассистент ответов",
    status: "on",
    environment: "production",
    scope: "tenant",
    rollout: 72,
    owner: "AI-команда",
    segments: ["business", "enterprise"],
    enabledTenantIds: ["tenant-northstar", "tenant-aurora"],
    variants: [
      { id: "control", weight: 28 },
      { id: "assistant-v2", weight: 72 }
    ],
    killSwitch: true,
    updatedAt: "2026-06-27T06:30:00.000Z"
  },
  {
    id: "flag-billing-v2",
    key: "ff-billing-v2",
    name: "Биллинг тарифов v2",
    status: "gradual",
    environment: "production",
    scope: "plan",
    rollout: 35,
    owner: "Биллинг",
    segments: ["starter", "business"],
    enabledTenantIds: ["tenant-northstar", "tenant-lumen"],
    variants: [
      { id: "legacy", weight: 65 },
      { id: "tariff-preview", weight: 35 }
    ],
    killSwitch: true,
    updatedAt: "2026-06-27T05:54:00.000Z"
  },
  {
    id: "flag-priority-routing",
    key: "ff-priority-routing",
    name: "Движок приоритетной маршрутизации",
    status: "on",
    environment: "production",
    scope: "tenant",
    rollout: 100,
    owner: "Маршрутизация",
    segments: ["scale", "enterprise"],
    enabledTenantIds: ["tenant-volga", "tenant-aurora"],
    variants: [
      { id: "enabled", weight: 100 }
    ],
    killSwitch: false,
    updatedAt: "2026-06-26T19:12:00.000Z"
  },
  {
    id: "flag-risk-rules",
    key: "ff-risk-rules",
    name: "Адаптивные правила риска",
    status: "guarded",
    environment: "production",
    scope: "tenant",
    rollout: 18,
    owner: "Идентификация",
    segments: ["enterprise"],
    enabledTenantIds: ["tenant-aurora"],
    variants: [
      { id: "baseline", weight: 82 },
      { id: "adaptive", weight: 18 }
    ],
    killSwitch: true,
    updatedAt: "2026-06-27T07:10:00.000Z"
  }
];

export const serviceAdminAuditEvents = [
  {
    id: "svc-audit-1001",
    at: "2026-06-27T07:42:00.000Z",
    actor: "Надя Орлова",
    action: "incident.monitor",
    target: "inc-auth-degrade",
    tenantId: "tenant-aurora",
    severity: "info",
    reason: "Мониторинг восстановления идентификации после обновления правила риска",
    result: "ok",
    traceId: "trc_service_admin_incident_1001"
  },
  {
    id: "svc-audit-1002",
    at: "2026-06-27T07:34:00.000Z",
    actor: "Надя Орлова",
    action: "user.block",
    target: "usr-aurora-risk",
    tenantId: "tenant-aurora",
    severity: "critical",
    reason: "Поддержка подтвердила сигнал невозможного перемещения",
    result: "ok",
    traceId: "trc_service_admin_user_1002"
  },
  {
    id: "svc-audit-1003",
    at: "2026-06-27T07:20:00.000Z",
    actor: "Биллинг Ops",
    action: "tariff.preview",
    target: "tenant-lumen",
    tenantId: "tenant-lumen",
    severity: "info",
    reason: "Оценка конверсии пробного периода",
    result: "ok",
    traceId: "trc_service_admin_billing_1003"
  },
  {
    id: "svc-audit-1004",
    at: "2026-06-27T07:12:00.000Z",
    actor: "Надя Орлова",
    action: "impersonation.start",
    target: "tenant-volga",
    tenantId: "tenant-volga",
    severity: "warn",
    reason: "Клиент согласовал проверку повторов вебхуков",
    result: "ok",
    traceId: "trc_service_admin_impersonation_1004"
  }
];
