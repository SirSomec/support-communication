export const serviceAdminSession = {
  id: "svc-session-current",
  adminId: "svc-admin-001",
  adminName: "Nadia Orlova",
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
    legalName: "Northstar Retail LLC",
    status: "active",
    planId: "business",
    region: "eu-central",
    owner: "Mira Volkova",
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
    notes: "Key account. Billing owner requested tariff review next week."
  },
  {
    id: "tenant-volga",
    name: "Volga Logistics",
    legalName: "Volga Logistics JSC",
    status: "watch",
    planId: "scale",
    region: "ru-west",
    owner: "Sergey Markin",
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
    notes: "High webhook volume. Keep incident notifications visible."
  },
  {
    id: "tenant-aurora",
    name: "Aurora Fintech",
    legalName: "Aurora Fintech Group",
    status: "restricted",
    planId: "enterprise",
    region: "eu-west",
    owner: "Elena Moroz",
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
    notes: "Restricted after repeated risky admin sessions. Require reason for support actions."
  },
  {
    id: "tenant-lumen",
    name: "Lumen Health",
    legalName: "Lumen Health Ltd",
    status: "trial",
    planId: "starter",
    region: "us-east",
    owner: "Anna Weiss",
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
    notes: "Trial closes in 9 days. Candidate for Business tariff."
  }
];

export const serviceAdminUsers = [
  {
    id: "usr-ns-owner",
    tenantId: "tenant-northstar",
    name: "Mira Volkova",
    email: "mira@northstar.example",
    role: "Owner",
    status: "active",
    mfa: "enabled",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-27T07:36:00.000Z",
    sessions: 2,
    risk: "low",
    device: "Chrome, macOS",
    supportNotes: "Primary billing approver."
  },
  {
    id: "usr-ns-agent",
    tenantId: "tenant-northstar",
    name: "Pavel Antonov",
    email: "pavel@northstar.example",
    role: "Senior operator",
    status: "active",
    mfa: "reset_pending",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-27T06:58:00.000Z",
    sessions: 1,
    risk: "medium",
    device: "Edge, Windows",
    supportNotes: "Asked for MFA reset after phone replacement."
  },
  {
    id: "usr-volga-admin",
    tenantId: "tenant-volga",
    name: "Sergey Markin",
    email: "sergey@volga.example",
    role: "Admin",
    status: "active",
    mfa: "enabled",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-27T07:19:00.000Z",
    sessions: 4,
    risk: "high",
    device: "Chrome, Windows",
    supportNotes: "Four parallel sessions during webhook incident."
  },
  {
    id: "usr-aurora-risk",
    tenantId: "tenant-aurora",
    name: "Elena Moroz",
    email: "ops@aurora.example",
    role: "Owner",
    status: "blocked",
    mfa: "enabled",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-26T21:12:00.000Z",
    sessions: 0,
    risk: "critical",
    device: "Unknown VPN",
    supportNotes: "Blocked after impossible travel signal."
  },
  {
    id: "usr-lumen-invite",
    tenantId: "tenant-lumen",
    name: "Nikolai R.",
    email: "nikolai@lumen.example",
    role: "Operator",
    status: "invited",
    mfa: "not_configured",
    inviteStatus: "expired",
    lastActiveAt: null,
    sessions: 0,
    risk: "low",
    device: "No device",
    supportNotes: "Needs invite resend before onboarding call."
  }
];

export const serviceAdminTariffs = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 39000,
    includedUsers: 25,
    workspaceLimit: 3,
    retentionDays: 30,
    automationRuns: 20000,
    features: ["Shared inbox", "Basic reports", "Email support"],
    changePolicy: "Immediate downgrade allowed only while trial is active."
  },
  {
    id: "business",
    name: "Business",
    priceMonthly: 129000,
    includedUsers: 150,
    workspaceLimit: 10,
    retentionDays: 180,
    automationRuns: 150000,
    features: ["SLA routing", "AI suggestions", "Audit export", "Priority support"],
    changePolicy: "Change applies at next billing period unless explicitly confirmed."
  },
  {
    id: "scale",
    name: "Scale",
    priceMonthly: 380000,
    includedUsers: 350,
    workspaceLimit: 20,
    retentionDays: 365,
    automationRuns: 600000,
    features: ["Webhook replay", "Advanced routing", "Feature gates", "Dedicated CSM"],
    changePolicy: "Requires reason and billing approval preview."
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: 990000,
    includedUsers: 700,
    workspaceLimit: 40,
    retentionDays: 1095,
    automationRuns: 2500000,
    features: ["SAML", "Data residency", "Custom limits", "24/7 incident bridge"],
    changePolicy: "Requires written confirmation and service-admin audit."
  }
];

export const serviceAdminPlatformComponents = [
  {
    id: "cmp-api",
    name: "Public API",
    status: "operational",
    ownerTeam: "Platform Edge",
    region: "global",
    latencyMs: 91,
    errorRate: 0.04,
    uptime: 99.99,
    tenantImpact: 0,
    dependencies: ["cmp-auth", "cmp-events"],
    signals: [
      { label: "p95 latency", value: "91 ms", tone: "ok" },
      { label: "4xx/5xx", value: "0.04%", tone: "ok" },
      { label: "deploy", value: "stable", tone: "ok" }
    ],
    recentEvents: ["Canary promoted at 06:20", "No rate-limit spikes"]
  },
  {
    id: "cmp-auth",
    name: "Auth and sessions",
    status: "degraded",
    ownerTeam: "Identity",
    region: "eu-west",
    latencyMs: 280,
    errorRate: 1.8,
    uptime: 99.72,
    tenantImpact: 3,
    dependencies: ["cmp-api"],
    signals: [
      { label: "MFA challenge", value: "+31%", tone: "warn" },
      { label: "session revoke", value: "slower", tone: "warn" },
      { label: "risk rules", value: "active", tone: "ok" }
    ],
    recentEvents: ["Risk rule update at 07:10", "Aurora restricted after high-risk login"]
  },
  {
    id: "cmp-webhooks",
    name: "Webhook delivery",
    status: "partial_outage",
    ownerTeam: "Integrations",
    region: "ru-west",
    latencyMs: 640,
    errorRate: 5.3,
    uptime: 98.91,
    tenantImpact: 12,
    dependencies: ["cmp-events"],
    signals: [
      { label: "retry queue", value: "8.2k", tone: "danger" },
      { label: "signature fails", value: "34", tone: "warn" },
      { label: "DLQ", value: "119", tone: "danger" }
    ],
    recentEvents: ["Manual replay window opened", "Volga retry queue above threshold"]
  },
  {
    id: "cmp-search",
    name: "Conversation search",
    status: "degraded",
    ownerTeam: "Data Experience",
    region: "global",
    latencyMs: 510,
    errorRate: 0.9,
    uptime: 99.41,
    tenantImpact: 7,
    dependencies: ["cmp-api", "cmp-events"],
    signals: [
      { label: "index lag", value: "14 min", tone: "warn" },
      { label: "p95 latency", value: "510 ms", tone: "warn" },
      { label: "backfill", value: "running", tone: "ok" }
    ],
    recentEvents: ["Backfill started at 06:44", "Northstar search ticket linked"]
  },
  {
    id: "cmp-events",
    name: "Event pipeline",
    status: "operational",
    ownerTeam: "Data Platform",
    region: "global",
    latencyMs: 122,
    errorRate: 0.08,
    uptime: 99.96,
    tenantImpact: 0,
    dependencies: [],
    signals: [
      { label: "ingest lag", value: "22 sec", tone: "ok" },
      { label: "audit stream", value: "healthy", tone: "ok" },
      { label: "schema", value: "v18", tone: "ok" }
    ],
    recentEvents: ["Audit consumer caught up", "No schema violations"]
  }
];

export const serviceAdminIncidents = [
  {
    id: "inc-webhook-retry",
    title: "Webhook retry queue above threshold",
    status: "investigating",
    severity: "sev2",
    componentId: "cmp-webhooks",
    owner: "Integrations on-call",
    startedAt: "2026-06-27T06:55:00.000Z",
    updatedAt: "2026-06-27T07:34:00.000Z",
    affectedTenantIds: ["tenant-volga"],
    impact: "Delayed delivery for high-volume webhook endpoints in ru-west.",
    customerMessage: "Webhook delivery is delayed. Messages are queued and will be retried.",
    updates: [
      { at: "07:34", author: "on-call", text: "DLQ drain started for Volga endpoints." },
      { at: "07:12", author: "support", text: "Incident linked to Volga account timeline." }
    ]
  },
  {
    id: "inc-auth-degrade",
    title: "Elevated MFA challenge latency",
    status: "monitoring",
    severity: "sev3",
    componentId: "cmp-auth",
    owner: "Identity on-call",
    startedAt: "2026-06-27T07:05:00.000Z",
    updatedAt: "2026-06-27T07:42:00.000Z",
    affectedTenantIds: ["tenant-aurora"],
    impact: "Service admins may wait longer for session revoke and MFA reset actions.",
    customerMessage: "Authentication remains available with increased latency.",
    updates: [
      { at: "07:42", author: "identity", text: "Latency returned below alert threshold." },
      { at: "07:21", author: "risk", text: "No new impossible travel alerts." }
    ]
  },
  {
    id: "inc-search-latency",
    title: "Search index lag for conversation history",
    status: "identified",
    severity: "sev3",
    componentId: "cmp-search",
    owner: "Data Experience",
    startedAt: "2026-06-27T06:44:00.000Z",
    updatedAt: "2026-06-27T07:28:00.000Z",
    affectedTenantIds: ["tenant-northstar", "tenant-aurora"],
    impact: "Recent messages may appear in search up to 14 minutes late.",
    customerMessage: "Conversation search is delayed while live chats remain unaffected.",
    updates: [
      { at: "07:28", author: "data", text: "Backfill reached 71% completion." },
      { at: "06:58", author: "support", text: "Added status note to Northstar tenant." }
    ]
  }
];

export const serviceAdminFeatureFlags = [
  {
    id: "flag-ai-replies",
    key: "ff-ai-replies",
    name: "AI reply assistant",
    status: "on",
    environment: "production",
    scope: "tenant",
    rollout: 72,
    owner: "AI Experience",
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
    name: "Billing tariff v2",
    status: "gradual",
    environment: "production",
    scope: "plan",
    rollout: 35,
    owner: "Billing",
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
    name: "Priority routing engine",
    status: "on",
    environment: "production",
    scope: "tenant",
    rollout: 100,
    owner: "Routing",
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
    name: "Adaptive risk rules",
    status: "guarded",
    environment: "production",
    scope: "tenant",
    rollout: 18,
    owner: "Identity",
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
    actor: "Nadia Orlova",
    action: "incident.monitor",
    target: "inc-auth-degrade",
    tenantId: "tenant-aurora",
    severity: "info",
    reason: "Monitoring identity recovery after risk rule update",
    result: "ok",
    traceId: "trc_service_admin_incident_1001"
  },
  {
    id: "svc-audit-1002",
    at: "2026-06-27T07:34:00.000Z",
    actor: "Nadia Orlova",
    action: "user.block",
    target: "usr-aurora-risk",
    tenantId: "tenant-aurora",
    severity: "critical",
    reason: "Impossible travel signal confirmed by support",
    result: "ok",
    traceId: "trc_service_admin_user_1002"
  },
  {
    id: "svc-audit-1003",
    at: "2026-06-27T07:20:00.000Z",
    actor: "Billing Ops",
    action: "tariff.preview",
    target: "tenant-lumen",
    tenantId: "tenant-lumen",
    severity: "info",
    reason: "Trial conversion estimate",
    result: "ok",
    traceId: "trc_service_admin_billing_1003"
  },
  {
    id: "svc-audit-1004",
    at: "2026-06-27T07:12:00.000Z",
    actor: "Nadia Orlova",
    action: "impersonation.start",
    target: "tenant-volga",
    tenantId: "tenant-volga",
    severity: "warn",
    reason: "Customer approved webhook replay check",
    result: "ok",
    traceId: "trc_service_admin_impersonation_1004"
  }
];
