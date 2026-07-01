export const API_VERSION = "v1";

export const backendServices = [
  "api-gateway",
  "auth-service",
  "tenant-service",
  "rbac-service",
  "conversation-service",
  "message-service",
  "channel-service",
  "client-profile-service",
  "template-knowledge-service",
  "routing-sla-service",
  "report-service",
  "integration-webhook-service",
  "file-service",
  "automation-bot-service",
  "quality-ai-service",
  "billing-service",
  "audit-service",
  "platform-admin-service",
  "incident-service",
  "feature-flag-service",
  "notification-service"
] as const;

export type BackendServiceId = (typeof backendServices)[number];
