export interface IntegrationConnection {
  env: "beta" | "prod" | "stage";
  id: string;
  lastEvent: string;
  name: string;
  rawId: string;
  status: string;
  traffic: string;
}

export interface ChannelDetail {
  channel: string;
  connections: IntegrationConnection[];
  detail: string;
  groups: string[];
  health: number;
  id: string;
  lastSync: string;
  limit: string;
  name: string;
  rawId: string;
  route: string;
  status: string;
}

export interface ApiEnvironmentKey {
  env: "production" | "stage";
  id: string;
  keyPreview: string;
  lastRotated: string;
  name: string;
  owner: string;
  protection: string;
  scopes: string[];
  status: string;
}

export interface WebhookDelivery {
  attempts: number;
  endpointId: string;
  event: string;
  httpStatus: string;
  id: string;
  status: string;
  time: string;
  traceId: string;
}

export interface SecuritySession {
  device: string;
  id: string;
  ip: string;
  lastSeen: string;
  role: string;
  status: string;
  user: string;
}
