export interface ServiceAdminTenant {
  id: string;
  name: string;
  planId: string;
  status: string;
}

export interface ServiceAdminUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  mfa: string;
  inviteStatus: string;
  lastActiveAt: string;
  sessions: number;
  risk: string;
  device: string;
  supportNotes: string;
}
