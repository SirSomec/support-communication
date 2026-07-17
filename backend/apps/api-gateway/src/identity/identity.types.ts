export interface IdentityAvailableOrganization {
  id: string;
  name: string;
  role: string;
}

export interface IdentityTenant {
  activeUsers: number;
  arr: number;
  domains: string[];
  employeeGroups?: IdentityEmployeeGroup[];
  flags: string[];
  healthScore: number;
  id: string;
  incidentIds: string[];
  lastSeenAt: string;
  legalName: string;
  monthlyRevenue: number;
  name: string;
  notes: string;
  onboarding?: {
    adminRole: "Admin" | "Owner";
    billingCycle: "annual" | "monthly";
    industry: string;
    limits: {
      afterHoursBot: boolean;
      aiAssist: boolean;
      concurrentDialogs: number;
      dailyMessages: number;
      operatorLimit: number;
    };
    mfaRequired: boolean;
  };
  owner: string;
  ownerEmail: string;
  planId: string;
  region: string;
  sla: number;
  status: "active" | "restricted" | "trial" | "watch";
  users: number;
  workspaces: number;
}

export interface IdentityEmployeeGroup {
  channels: string[];
  id: string;
  memberIds: string[];
  name: string;
  scope: string;
  tenantId: string;
  updatedAt: string;
}

export interface IdentityTenantAuditEvent {
  action: string;
  actor: string;
  at: string;
  id: string;
  immutable?: boolean;
  reason: string;
  result: string;
  severity: string;
  target: string;
  tenantId: string;
  traceId: string;
}

export interface IdentityTenantUser {
  device: string;
  email: string;
  id: string;
  inviteStatus: string;
  lastActiveAt: string | null;
  mfa: string;
  metadata?: Record<string, unknown>;
  name: string;
  risk: string;
  role: string;
  sessions: number;
  status: string;
  supportNotes: string;
  tenantId: string;
}

export interface IdentityPermissionRole {
  actions: string[];
  aliases: string[];
  description: string;
  groupIds: string[];
  key: string;
  metadata: Record<string, unknown>;
}

export interface IdentityServiceAdminTariff {
  automationRuns: number;
  changePolicy: string;
  features: string[];
  id: string;
  includedUsers: number;
  name: string;
  priceMonthly: number;
  retentionDays: number;
  workspaceLimit: number;
}

export interface IdentityServiceAdminIncidentUpdate {
  at: string;
  author: string;
  text: string;
}

export interface IdentityServiceAdminIncident {
  affectedTenantIds: string[];
  componentId: string;
  customerMessage: string;
  id: string;
  impact: string;
  owner: string;
  severity: string;
  startedAt: string;
  status: string;
  title: string;
  updatedAt: string;
  updates: IdentityServiceAdminIncidentUpdate[];
}

export interface IdentityServiceAdminFeatureFlag {
  enabledTenantIds: string[];
  environment: string;
  id: string;
  key: string;
  killSwitch: boolean;
  name: string;
  owner: string;
  rollout: number;
  scope: string;
  segments: string[];
  status: string;
  updatedAt: string;
  variants: Array<{ id: string; weight: number }>;
}
