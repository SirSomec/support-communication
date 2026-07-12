import type { IdentityPermissionRole, IdentityServiceAdminTariff } from "./identity.types.js";

export const serviceAdminPrivilegedActions: string[] = [
  "auth.logout", "auth.state", "billing.read", "tenants.read", "tenants.manage",
  "billing.change", "break-glass.decide", "break-glass.request", "channels.ingest",
  "channels.read", "clients.merge", "clients.read", "dialogs.manage", "dialogs.read",
  "files.read", "files.write", "flags.read", "flags.test", "users.support",
  "impersonation.stop", "incidents.read", "knowledge.read", "knowledge.write",
  "permissions.read", "permissions.validate", "platform.alert.acknowledge",
  "platform.alert-routing.write", "platform.health-rollups.write", "platform.read",
  "platform.telemetry.ingest", "quality.manual-reviews.write", "quality.ratings.write",
  "quality.scoring-audits.write", "quotas.check", "quotas.read", "realtime.events.read",
  "notifications.read", "operations.read", "operations.write", "settings.read",
  "settings.manage", "service-admin.users.read", "service-admin.users.write",
  "service-admin.audit.read", "service-admin.audit.export", "security.review",
  "templates.read", "templates.write", "incidents.manage", "flags.manage",
  "impersonation.start"
];

export const identityPermissionRoleCatalog: IdentityPermissionRole[] = [
  {
    key: "employee",
    description: "Line support operator",
    actions: ["dialogs.read", "templates.read", "templates.write", "clients.read"],
    aliases: ["employee", "operator", "line_1", "line-1"],
    groupIds: ["line-1"],
    metadata: {}
  },
  {
    key: "senior",
    description: "Senior support operator",
    actions: [
      "dialogs.read", "dialogs.manage", "panel.read", "routing.read", "routing.redistribute",
      "templates.read", "templates.write", "clients.read", "clients.merge", "visitors.read",
      "automation.proactive.read", "reports.read", "reports.export", "quality.read",
      "quality.scoring-audits.write", "quality.ratings.write", "quality.manual-reviews.write",
      "knowledge.read", "automation.read", "permissions.read", "notifications.read",
      "settings.read", "employees.passwordReset", "outbound.start"
    ],
    aliases: ["senior", "senior_operator", "lead"],
    groupIds: ["senior-shifts"],
    metadata: {}
  },
  {
    key: "admin",
    description: "Tenant administrator",
    actions: ["*"],
    aliases: ["admin", "administrator", "owner"],
    groupIds: ["admins"],
    metadata: {}
  },
  {
    key: "service_admin",
    description: "Platform service administrator",
    actions: Array.from(new Set([
      ...serviceAdminPrivilegedActions,
      "reports.read", "reports.export", "reports.write", "audit.read", "audit.export", "audit.redact"
    ])),
    aliases: ["service_admin"],
    groupIds: ["service-admins"],
    metadata: {}
  }
];

export const identityServiceAdminTariffCatalog: IdentityServiceAdminTariff[] = [
  { id: "starter", name: "Start", priceMonthly: 39000, includedUsers: 25, workspaceLimit: 3, retentionDays: 30, automationRuns: 20000, features: ["Shared inbox", "Basic reports", "Email support"], changePolicy: "Immediate downgrade is available during trial only." },
  { id: "business", name: "Business", priceMonthly: 129000, includedUsers: 150, workspaceLimit: 10, retentionDays: 180, automationRuns: 150000, features: ["SLA routing", "AI suggestions", "Audit export", "Priority support"], changePolicy: "Changes apply next billing period unless explicitly confirmed." },
  { id: "scale", name: "Scale", priceMonthly: 380000, includedUsers: 350, workspaceLimit: 20, retentionDays: 365, automationRuns: 600000, features: ["Webhook replay", "Advanced routing", "Feature flags", "Dedicated CSM"], changePolicy: "Requires reason and billing approval preview." },
  { id: "enterprise", name: "Enterprise", priceMonthly: 990000, includedUsers: 700, workspaceLimit: 40, retentionDays: 1095, automationRuns: 2500000, features: ["SAML", "Regional data storage", "Custom limits", "Incident bridge 24/7"], changePolicy: "Requires written confirmation and service-admin audit." }
];
