import type { ServiceAdminTenant, ServiceAdminUser } from "./service-admin.types.js";

export const serviceAdminTenants: ServiceAdminTenant[] = [
  { id: "tenant-northstar", name: "Northstar Retail", planId: "business", status: "active" },
  { id: "tenant-volga", name: "Volga Logistics", planId: "scale", status: "watch" },
  { id: "tenant-lumen", name: "Lumen Health", planId: "starter", status: "trial" }
];

export const serviceAdminUsers: ServiceAdminUser[] = [
  {
    id: "usr-ns-agent",
    tenantId: "tenant-northstar",
    name: "Anna North",
    email: "anna.north@northstar.example",
    role: "operator",
    status: "active",
    mfa: "enabled",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-25T10:20:00.000Z",
    sessions: 1,
    risk: "low",
    device: "Windows laptop",
    supportNotes: "MFA reset allowed after HR ticket verification."
  },
  {
    id: "usr-volga-admin",
    tenantId: "tenant-volga",
    name: "Sergey Volga",
    email: "sergey.volga@volga.example",
    role: "admin",
    status: "active",
    mfa: "enabled",
    inviteStatus: "accepted",
    lastActiveAt: "2026-06-26T08:11:00.000Z",
    sessions: 4,
    risk: "medium",
    device: "macOS desktop",
    supportNotes: "Primary admin for logistics workspace."
  },
  {
    id: "usr-lumen-invite",
    tenantId: "tenant-lumen",
    name: "Maria Lumen",
    email: "maria.lumen@lumen.example",
    role: "owner",
    status: "invited",
    mfa: "disabled",
    inviteStatus: "expired",
    lastActiveAt: "never",
    sessions: 0,
    risk: "low",
    device: "unknown",
    supportNotes: "Invite expired during trial onboarding."
  }
];
