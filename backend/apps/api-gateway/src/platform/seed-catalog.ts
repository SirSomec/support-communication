import type { FeatureFlag, PlatformComponent, PlatformIncident, PlatformTenant } from "./platform.types.js";

export const platformTenants: PlatformTenant[] = [
  { id: "tenant-northstar", name: "Northstar Retail", planId: "business", region: "eu-central", status: "active" },
  { id: "tenant-volga", name: "Volga Logistics", planId: "scale", region: "ru-west", status: "watch" },
  { id: "tenant-aurora", name: "Aurora Fintech", planId: "enterprise", region: "eu-west", status: "restricted" },
  { id: "tenant-lumen", name: "Lumen Health", planId: "starter", region: "us-east", status: "trial" }
];

export const platformComponents: PlatformComponent[] = [
  {
    id: "cmp-api",
    name: "Public API",
    status: "operational",
    ownerTeam: "Platform",
    region: "global",
    latencyMs: 91,
    errorRate: 0.04,
    uptime: 99.99,
    tenantImpact: 0,
    dependencies: ["cmp-auth", "cmp-events"],
    signals: [
      { label: "p95 latency", value: "91 ms", tone: "ok" },
      { label: "5xx rate", value: "0.04%", tone: "ok" }
    ],
    recentEvents: ["Canary release completed", "No rate-limit spike"]
  },
  {
    id: "cmp-auth",
    name: "Authorization and sessions",
    status: "degraded",
    ownerTeam: "Identity",
    region: "eu-west",
    latencyMs: 280,
    errorRate: 1.8,
    uptime: 99.72,
    tenantImpact: 3,
    dependencies: ["cmp-api"],
    signals: [
      { label: "2FA checks", value: "+31%", tone: "warn" },
      { label: "session callbacks", value: "slower", tone: "warn" }
    ],
    recentEvents: ["Risk rule updated", "Aurora restricted after risky login"]
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
      { label: "signature errors", value: "34", tone: "warn" }
    ],
    recentEvents: ["Manual replay window opened", "Volga retry queue above threshold"]
  },
  {
    id: "cmp-search",
    name: "Dialog search",
    status: "degraded",
    ownerTeam: "Search and data",
    region: "global",
    latencyMs: 510,
    errorRate: 0.9,
    uptime: 99.41,
    tenantImpact: 7,
    dependencies: ["cmp-api", "cmp-events"],
    signals: [
      { label: "index lag", value: "14 min", tone: "warn" },
      { label: "p95 latency", value: "510 ms", tone: "warn" }
    ],
    recentEvents: ["Backfill reached 71%", "Northstar status note added"]
  }
];

export const platformMetrics = [
  { id: "webhook_retry_queue", label: "Webhook retry queue", value: 8200, unit: "jobs", componentId: "cmp-webhooks", tone: "danger" },
  { id: "auth_2fa_latency", label: "2FA p95 latency", value: 280, unit: "ms", componentId: "cmp-auth", tone: "warn" },
  { id: "search_index_lag", label: "Search index lag", value: 14, unit: "minutes", componentId: "cmp-search", tone: "warn" },
  { id: "event_stream_lag", label: "Event stream lag", value: 22, unit: "seconds", componentId: "cmp-events", tone: "ok" }
];

export const platformIncidents: PlatformIncident[] = [
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
    impact: "Delayed webhook delivery in ru-west for high-volume endpoints.",
    customerMessage: "Webhook delivery is delayed. Messages are queued and will be retried.",
    updates: [
      { at: "07:34", author: "on-call", text: "Replay queue cleanup started for Volga endpoints." },
      { at: "07:12", author: "support", text: "Incident linked to Volga account timeline." }
    ]
  },
  {
    id: "inc-auth-degrade",
    title: "Increased 2FA verification latency",
    status: "monitoring",
    severity: "sev3",
    componentId: "cmp-auth",
    owner: "Identity on-call",
    startedAt: "2026-06-27T07:05:00.000Z",
    updatedAt: "2026-06-27T07:42:00.000Z",
    affectedTenantIds: ["tenant-aurora"],
    impact: "Service admins may wait longer for session verification.",
    customerMessage: "Authorization is available with increased latency.",
    updates: [
      { at: "07:42", author: "identity", text: "Latency returned below alert threshold." },
      { at: "07:21", author: "risk", text: "No new impossible-travel alerts." }
    ]
  },
  {
    id: "inc-search-latency",
    title: "Dialog search index lag",
    status: "identified",
    severity: "sev3",
    componentId: "cmp-search",
    owner: "Search and data",
    startedAt: "2026-06-27T06:44:00.000Z",
    updatedAt: "2026-06-27T07:28:00.000Z",
    affectedTenantIds: ["tenant-northstar", "tenant-aurora"],
    impact: "New messages may appear in search with a delay.",
    customerMessage: "Dialog search is delayed; live chats are not affected.",
    updates: [
      { at: "07:28", author: "data", text: "Backfill reached 71%." },
      { at: "06:58", author: "support", text: "Status note added for Northstar." }
    ]
  }
];

export const maintenanceWindows = [
  {
    id: "mw-search-backfill",
    componentId: "cmp-search",
    startsAt: "2026-06-28T01:00:00.000Z",
    endsAt: "2026-06-28T02:00:00.000Z",
    customerVisible: true,
    status: "scheduled",
    summary: "Search backfill capacity increase"
  }
];

export const incidentPostmortems = [
  {
    incidentId: "inc-webhook-retry",
    status: "not_started",
    dueAt: "2026-06-30T12:00:00.000Z",
    owner: "Integrations on-call"
  },
  {
    incidentId: "inc-auth-degrade",
    status: "draft",
    dueAt: "2026-06-30T12:00:00.000Z",
    owner: "Identity on-call"
  }
];

export const featureFlags: FeatureFlag[] = [
  {
    id: "flag-ai-replies",
    key: "ff-ai-replies",
    name: "AI reply assistant",
    status: "on",
    environment: "production",
    scope: "tenant",
    rollout: 72,
    owner: "AI team",
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
    name: "Billing tariffs v2",
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
    variants: [{ id: "enabled", weight: 100 }],
    killSwitch: false,
    updatedAt: "2026-06-26T19:12:00.000Z"
  }
];
