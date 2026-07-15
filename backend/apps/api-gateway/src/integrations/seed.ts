import type { IntegrationState, IntegrationWorkspaceCatalog } from "./integration.repository.js";

import {

  activeSecuritySessions,

  apiChangelog,

  apiEnvironmentKeys,

  channelDetails,

  securityAlerts,

  securityControls,

  webhookDeliveryLog,

  webhookEndpoints

} from "./seed-catalog.js";



function clone<T>(value: T): T {

  return JSON.parse(JSON.stringify(value)) as T;

}



export function bootstrapIntegrationWorkspaceCatalog(): IntegrationWorkspaceCatalog {

  return {

    apiChangelog: clone(apiChangelog),

    apiEnvironmentKeys: clone(apiEnvironmentKeys),

    channelDetails: clone(channelDetails),

    securityAlerts: clone(securityAlerts),

    securityControls: clone(securityControls),

    webhookDeliveryLog: clone(webhookDeliveryLog),

    webhookEndpoints: clone(webhookEndpoints)

  };

}



export function bootstrapIntegrationState(base?: Partial<IntegrationState>): IntegrationState {

  return {

    apiKeyRotationAuditEvents: base?.apiKeyRotationAuditEvents ?? [],

    apiKeyRotationJobs: base?.apiKeyRotationJobs ?? [],

    channelConnectionAuditEvents: base?.channelConnectionAuditEvents ?? [],

    channelConnectionEvents: base?.channelConnectionEvents ?? [],

    channelConnections: base?.channelConnections ?? seedChannelConnections(),

    providerConnectionCredentials: base?.providerConnectionCredentials ?? [],

    publicApiKeys: base?.publicApiKeys ?? [],

    publicApiKeyRevealStates: base?.publicApiKeyRevealStates ?? [],

    publicDemoRequestAuditEvents: base?.publicDemoRequestAuditEvents ?? [],

    publicDemoRequestNotificationDescriptors: base?.publicDemoRequestNotificationDescriptors ?? [],

    publicDemoRequests: base?.publicDemoRequests ?? [],

    securitySessions: base?.securitySessions ?? clone(activeSecuritySessions),

    sdkVisitorPresenceSessions: base?.sdkVisitorPresenceSessions ?? [],

    telegramConnections: base?.telegramConnections ?? [],

    webhookDeliveryJournal: base?.webhookDeliveryJournal ?? [],

    webhookEndpointRecords: base?.webhookEndpointRecords ?? [],

    webhookReplayAuditEvents: base?.webhookReplayAuditEvents ?? [],

    webhookReplayJournal: base?.webhookReplayJournal ?? [],

    workspace: base?.workspace ?? bootstrapIntegrationWorkspaceCatalog()

  };

}



export * from "./seed-catalog.js";

function seedChannelConnections(): IntegrationState["channelConnections"] {
  const now = "2026-07-02T09:00:00.000Z";
  return [
    {
      chatLimit: 12,
      createdAt: now,
      credentialsMasked: true,
      environment: "production",
      health: 100,
      id: "conn_admin_telegram",
      lastSyncAt: now,
      name: "Admin Telegram",
      rawExternalId: "telegram:admin",
      routingQueueId: "queue-telegram",
      status: "active",
      tenantId: "tenant-volga",
      traffic: "0 events",
      type: "telegram",
      updatedAt: now,
      webhookUrl: "http://127.0.0.1:4100/api/v1/integrations/telegram/webhook/conn_admin_telegram"
    },
    {
      chatLimit: 8,
      createdAt: now,
      credentialsMasked: true,
      environment: "production",
      health: 100,
      id: "conn_email_digest",
      lastSyncAt: now,
      name: "Email digest",
      rawExternalId: "sdk:email-digest",
      routingQueueId: "queue-email-digest",
      status: "active",
      tenantId: "tenant-volga",
      traffic: "0 events",
      type: "sdk",
      updatedAt: now,
      webhookUrl: "https://monitoring.example.test/email-digest"
    },
    {
      chatLimit: 8,
      createdAt: now,
      credentialsMasked: true,
      environment: "production",
      health: 68,
      id: "conn_vk_main",
      lastSyncAt: now,
      name: "VK main community",
      rawExternalId: "vk:main",
      routingQueueId: "queue-vk",
      status: "active",
      tenantId: "tenant-volga",
      traffic: "0 events",
      type: "vk",
      updatedAt: now,
      webhookUrl: "https://api.support.local/webhooks/vk"
    },
    {
      chatLimit: 8,
      createdAt: now,
      credentialsMasked: true,
      environment: "stage",
      health: 100,
      id: "conn_vk_stage",
      lastSyncAt: now,
      name: "VK stage community",
      rawExternalId: "vk:stage",
      routingQueueId: "queue-vk-stage",
      status: "active",
      tenantId: "tenant-volga",
      traffic: "0 events",
      type: "vk",
      updatedAt: now,
      webhookUrl: "https://api.support.local/webhooks/vk-stage"
    },
    {
      chatLimit: 8,
      createdAt: now,
      credentialsMasked: true,
      environment: "production",
      health: 100,
      id: "conn_incident_webhook",
      lastSyncAt: now,
      name: "Incident webhook",
      rawExternalId: "webhook:incident",
      routingQueueId: "queue-incidents",
      status: "active",
      tenantId: "tenant-volga",
      traffic: "0 events",
      type: "webhook",
      updatedAt: now,
      webhookUrl: "https://monitoring.example.test/incidents"
    }
  ];
}
