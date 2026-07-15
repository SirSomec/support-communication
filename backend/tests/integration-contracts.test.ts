import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  handlePublicIdentifyUserRequest,
  hashPublicApiKeySecret,
  resolvePublicApiRequest,
  type PublicApiKeyRecord
} from "../apps/api-gateway/src/integrations/public-api-auth.ts";
import { IntegrationService } from "../apps/api-gateway/src/integrations/integration.service.ts";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { ProviderConnectionCrypto } from "../apps/api-gateway/src/integrations/provider-connection-crypto.ts";
import { configureIntegrationRepository } from "../apps/api-gateway/src/integrations/bootstrap.ts";
import { bootstrapIntegrationState } from "../apps/api-gateway/src/integrations/seed.ts";
import { identifyPublicClientFromRoute } from "../apps/api-gateway/src/integrations/public-api.route.ts";
import { normalizeSignedInboundWebhookFromRoute } from "../apps/api-gateway/src/integrations/signed-webhook.route.ts";
import { InMemorySignedWebhookNonceStore } from "../apps/api-gateway/src/integrations/signed-webhook-verifier.ts";
import {
  recordWebhookDeliveryAttemptSuccess,
  recordWebhookDeliveryFailureForRetry,
  resolveWebhookDeliveryFailureState,
  runWebhookDeliveryWorkerOnce,
  createHttpWebhookDeliveryProvider
} from "../apps/api-gateway/src/integrations/webhook-delivery.worker.ts";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { ConversationService } from "../apps/api-gateway/src/conversation/conversation.service.ts";
import { bootstrapConversationState } from "../apps/api-gateway/src/conversation/seed.ts";

function telegramFetchOk(username = "support_bot") {
  return async (_input: string) => ({
    json: async () => ({ ok: true, result: { id: 123456, username } }),
    ok: true,
    status: 200
  });
}

describe("phase 6 public API, webhooks and SDK integration backend contracts", () => {
  it("keeps unseeded integration repositories honest and empty", () => {
    const state = IntegrationRepository.inMemory().readState();

    assert.deepEqual(state.channelConnections, []);
    assert.deepEqual(state.securitySessions, []);
    assert.deepEqual(state.workspace.channelDetails, []);
    assert.deepEqual(state.workspace.apiEnvironmentKeys, []);
  });

  it("returns integration workspace without exposing raw API keys or secrets", async () => {
    const integrations = new IntegrationService(IntegrationRepository.inMemory(bootstrapIntegrationState()));

    const workspace = await integrations.fetchIntegrationWorkspace();

    assert.equal(workspace.service, "integrationService");
    assert.equal(workspace.status, "ok");
    assert.equal(workspace.partial, true);
    assert.equal(workspace.meta.source, "api");
    assert.ok(workspace.data.channelDetails.some((channel) => channel.id === "sdk"));
    assert.ok(workspace.data.apiEnvironmentKeys.some((key) => key.env === "production"));
    assert.ok(workspace.data.apiEnvironmentKeys.every((key) => key.keyPreview.includes("****")));
    assert.ok(workspace.data.apiEnvironmentKeys.every((key) => !("rawKey" in key)));
    assert.ok(workspace.data.webhookEndpoints.every((endpoint) => endpoint.signature));
    assert.ok(workspace.data.webhookDeliveryLog.every((delivery) => delivery.traceId));
    assert.ok(workspace.data.securityControls.some((control) => control.id === "api-protection"));
  });

  it("queues channel test messages with environment isolation and validation", async () => {
    const integrations = new IntegrationService(IntegrationRepository.inMemory(bootstrapIntegrationState()));

    const invalid = await integrations.testChannelConnection({
      channelId: "sdk",
      message: "",
      recipient: ""
    });
    assert.equal(invalid.status, "invalid");
    assert.equal(invalid.error?.code, "recipient_and_message_required");

    const test = await integrations.testChannelConnection({
      channelId: "sdk",
      connectionId: "sdk-stage",
      environment: "stage",
      message: "SDK test",
      mode: "receive",
      recipient: "+7 900 000-00-00"
    });
    assert.equal(test.status, "ok");
    assert.equal(test.data.delivery.status, "accepted_to_queue");
    assert.equal(test.data.delivery.environment, "stage");
    assert.equal(test.data.delivery.sandboxIsolation, true);
    assert.equal(test.data.delivery.rawSecretExposed, false);
    assert.match(test.data.delivery.requestId, /^req_sdk_/);
    assert.match(test.data.auditId, /^evt_channel_/);

    const missingConnection = await integrations.testChannelConnection({
      channelId: "sdk",
      connectionId: "missing",
      environment: "production",
      message: "SDK test",
      recipient: "+7 900 000-00-00"
    });
    assert.equal(missingConnection.status, "not_found");
    assert.equal(missingConnection.error?.code, "connection_not_found");
  });

  it("manages generic multi-instance channel connections without exposing secrets", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const integrations = new IntegrationService(repository, { telegramFetch: telegramFetchOk() });
    const tenantId = "tenant-acme";

    const list = await integrations.fetchChannelConnections(tenantId, { type: "telegram" });
    const telegramConnections = list.data.connections as Array<Record<string, unknown>>;
    assert.equal(list.status, "ok");
    assert.equal(telegramConnections.length, 0);

    const created = await integrations.createChannelConnection(tenantId, {
      chatLimit: 8,
      credentials: { botToken: "123:secret" },
      environment: "production",
      name: "Telegram VIP",
      routingQueueId: "queue-vip",
      type: "telegram"
    });
    assert.equal(created.status, "ok");
    assert.equal(created.data.connection.name, "Telegram VIP");
    assert.equal(created.data.connection.type, "telegram");
    assert.equal(created.data.connection.credentialsMasked, true);
    assert.match(String(created.data.connection.webhookUrl), /\/integrations\/telegram\/webhook\/conn_telegram_/);
    assert.equal(JSON.stringify(created.data).includes("123:secret"), false);
    assert.match(String(created.data.auditId), /^evt_channel_/);
    assert.equal(integrations.listChannelConnectionAuditEvents().some((event) => event.id === created.data.auditId), true);

    const connectionId = String(created.data.connection.id);
    const otherTenantList = await integrations.fetchChannelConnections("tenant-other", { type: "telegram" });
    assert.deepEqual(otherTenantList.data.connections, []);

    const updated = await integrations.updateChannelConnection(tenantId, connectionId, {
      reason: "maintenance window",
      status: "paused"
    });
    assert.equal(updated.status, "ok");
    assert.equal(updated.data.connection.status, "paused");
    assert.equal(updated.data.reason, "maintenance window");
    assert.equal(integrations.listChannelConnectionAuditEvents().some((event) => event.id === updated.data.auditId), true);

    const test = await integrations.testChannelConnectionInstance(tenantId, connectionId, {
      message: "Channel smoke",
      mode: "send",
      recipient: "+7 900 123-45-67"
    });
    assert.equal(test.status, "ok");
    assert.equal(test.data.delivery.connectionId, connectionId);
    assert.equal(test.data.delivery.status, "sent_to_channel");
    assert.equal(integrations.listChannelConnectionAuditEvents().some((event) => event.id === test.data.auditId), true);

    const events = await integrations.fetchChannelConnectionEvents(tenantId, connectionId);
    assert.equal(events.status, "ok");
    assert.ok(Array.isArray(events.data.events));
    assert.ok((events.data.events as Array<Record<string, unknown>>).some((event) => event.action === "channel.test"));

    const deleted = await integrations.deleteChannelConnection(tenantId, connectionId, { reason: "retired bot" });
    assert.equal(deleted.status, "ok");
    assert.equal(deleted.data.connectionId, connectionId);
    assert.equal(deleted.data.status, "disabled");
    assert.equal(integrations.listChannelConnectionAuditEvents().some((event) => event.id === deleted.data.auditId), true);
  });

  it("lists active seeded tenant channel connections for notification delivery preferences", async () => {
    const integrations = new IntegrationService(IntegrationRepository.inMemory(bootstrapIntegrationState()));

    const list = await integrations.fetchChannelConnections("tenant-volga");
    const connections = list.data.connections as Array<Record<string, unknown>>;

    assert.equal(list.status, "ok");
    assert.ok(connections.some((connection) =>
      connection.id === "conn_admin_telegram"
        && connection.status === "active"
        && connection.tenantId === "tenant-volga"
    ));
    assert.ok(connections.some((connection) => connection.id === "conn_incident_webhook" && connection.status === "active"));
    assert.equal(connections.every((connection) => connection.tenantId === "tenant-volga"), true);
  });

  it("updates tenant channel type status through an audited aggregate mutation", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const integrations = new IntegrationService(repository);

    const disabled = await integrations.updateChannelTypeStatus("tenant-volga", "telegram", {
      enabled: false,
      reason: "Settings aggregate channel toggle disabled"
    });
    const disabledConnections = (await integrations.fetchChannelConnections("tenant-volga", { type: "telegram" })).data.connections as Array<Record<string, unknown>>;

    assert.equal(disabled.status, "ok");
    assert.equal(disabled.data.channel.type, "telegram");
    assert.equal(disabled.data.channel.enabled, false);
    assert.equal(disabled.data.channel.activeCount, 0);
    assert.equal(disabled.data.channel.total, disabledConnections.length);
    assert.ok(disabledConnections.length > 0);
    assert.equal(disabledConnections.every((connection) => connection.status === "disabled"), true);
    assert.ok((disabled.data.auditEvents as Array<Record<string, unknown>>).every((event) => event.immutable === true));
    assert.ok((disabled.data.auditEvents as Array<Record<string, unknown>>).every((event) => event.action === "channel.type_status.update"));

    const enabled = await integrations.updateChannelTypeStatus("tenant-volga", "telegram", {
      enabled: true,
      reason: "Settings aggregate channel toggle enabled"
    });
    const enabledConnections = (await integrations.fetchChannelConnections("tenant-volga", { type: "telegram" })).data.connections as Array<Record<string, unknown>>;

    assert.equal(enabled.status, "ok");
    assert.equal(enabled.data.channel.enabled, true);
    assert.equal(enabledConnections.every((connection) => connection.status === "active"), true);
    assert.equal(repository.listChannelConnectionAuditEvents().some((event) => event.id === enabled.data.auditEvents[0].id), true);

    const missing = await integrations.updateChannelTypeStatus("tenant-volga", "missing", {
      enabled: false,
      reason: "No such channel type"
    });
    assert.equal(missing.status, "not_found");
    assert.equal(missing.error?.code, "channel_type_connections_not_found");
  });

  it("adds missing seeded notification channel connections when reopening an existing JSON store", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "integration-seed-backfill-"));
    const filePath = join(workspace, "integration-store.json");
    const existingAdminTelegram = {
      ...bootstrapIntegrationState().channelConnections.find((connection) => connection.id === "conn_admin_telegram")!,
      name: "Existing Admin Telegram",
      status: "disabled"
    };

    try {
      IntegrationRepository.open({
        filePath,
        seed: bootstrapIntegrationState({ channelConnections: [existingAdminTelegram] })
      });

      const repository = configureIntegrationRepository(
        {
          INTEGRATION_STORE_FILE: filePath,
          NODE_ENV: "test",
          PORT: 4101,
          SERVICE_NAME: "api-gateway-test"
        },
        { seed: bootstrapIntegrationState() }
      );
      const state = repository.readState();

      assert.equal(repository.findChannelConnection("tenant-volga", "conn_admin_telegram")?.name, "Existing Admin Telegram");
      assert.equal(repository.findChannelConnection("tenant-volga", "conn_admin_telegram")?.status, "disabled");
      assert.ok(state.channelConnections.some((connection) => connection.id === "conn_email_digest" && connection.status === "active"));
      assert.ok(state.channelConnections.some((connection) => connection.id === "conn_incident_webhook" && connection.status === "active"));
      assert.equal(state.channelConnections.filter((connection) => connection.id === "conn_admin_telegram").length, 1);
    } finally {
      IntegrationRepository.clearDefault();
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("provisions Telegram and MAX channel connections from token without manual webhook URL", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const providerCredentialCrypto = new ProviderConnectionCrypto({
      keyVersion: "test-v1",
      masterKeyBase64: Buffer.alloc(32, 7).toString("base64")
    });
    let telegramGetMeUrl = "";
    const integrations = new IntegrationService(repository, {
      providerCredentialCrypto,
      telegramFetch: async (input) => {
        telegramGetMeUrl = input;
        return {
          json: async () => ({ ok: true, result: { id: 123456, username: "support_bot" } }),
          ok: true,
          status: 200
        };
      }
    });
    const tenantId = "tenant-token-only";

    const telegram = await integrations.createChannelConnection(tenantId, {
      credentials: { token: "123:telegramToken_123" },
      name: "Telegram token only",
      type: "telegram"
    });
    const max = await integrations.createChannelConnection(tenantId, {
      credentials: { token: "max-token" },
      name: "MAX token only",
      type: "max"
    });

    assert.equal(telegram.status, "ok");
    assert.equal(max.status, "ok");
    assert.match(String(telegram.data.connection.webhookUrl), /\/integrations\/telegram\/webhook\/conn_telegram_/);
    assert.match(String(max.data.connection.webhookUrl), /\/integrations\/max\/webhook\/conn_max_/);
    assert.match(telegramGetMeUrl, /https:\/\/api\.telegram\.org\/bot123:telegramToken_123\/getMe/);
    assert.equal(telegram.data.connection.rawExternalId, "telegram:support_bot");
    assert.equal(repository.findTelegramConnectionByTenantId(tenantId)?.botUsername, "support_bot");
    assert.equal(JSON.stringify(telegram.data).includes("telegramToken_123"), false);
    assert.equal(JSON.stringify(max.data).includes("max-token"), false);
    assert.match(String(max.data.providerRuntime.webhookSecret), /^[0-9a-f-]{36}$/);
    const maxCredential = repository.findProviderConnectionCredential(tenantId, String(max.data.connection.id));
    assert.equal(maxCredential?.provider, "max");
    assert.equal(providerCredentialCrypto.decrypt(JSON.parse(String(maxCredential?.accessTokenEncrypted))), "max-token");
  });

  it("persists tenant channel connections across JSON repository reopen without raw secrets", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "integration-channel-connections-"));
    const filePath = join(workspace, "integration-store.json");
    const tenantId = "tenant-durable";

    try {
      const firstRepository = IntegrationRepository.open({ filePath, seed: bootstrapIntegrationState() });
      const firstService = new IntegrationService(firstRepository, { telegramFetch: telegramFetchOk("durable_bot") });
      const created = await firstService.createChannelConnection(tenantId, {
        credentials: { botToken: "123:durable-secret" },
        name: "Durable Telegram",
        type: "telegram"
      });
      assert.equal(created.status, "ok");

      const reopenedRepository = IntegrationRepository.open({ filePath });
      const reopenedService = new IntegrationService(reopenedRepository);
      const list = await reopenedService.fetchChannelConnections(tenantId, { type: "telegram" });
      const connections = list.data.connections as Array<Record<string, unknown>>;

      assert.equal(list.status, "ok");
      assert.equal(connections.length, 1);
      assert.equal(connections[0]?.name, "Durable Telegram");
      assert.equal(connections[0]?.credentialsMasked, true);
      assert.equal(JSON.stringify(connections).includes("durable-secret"), false);
      assert.equal(reopenedRepository.findTelegramConnectionByTenantId(tenantId)?.botToken, "123:durable-secret");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("queues API key rotation without returning raw key material", async () => {
    const integrations = new IntegrationService(IntegrationRepository.inMemory(bootstrapIntegrationState()));

    const missing = await integrations.rotateApiKey("missing-key");
    assert.equal(missing.status, "not_found");
    assert.equal(missing.error?.code, "api_key_not_found");

    const rotated = await integrations.rotateApiKey("stage-key");
    assert.equal(rotated.status, "ok");
    assert.equal(rotated.data.keyId, "stage-key");
    assert.equal(rotated.data.status, "rotation_queued");
    assert.equal(rotated.data.requires2fa, true);
    assert.equal(rotated.data.rawKeyShownOnce, false);
    assert.equal(rotated.data.environment, "stage");
    assert.match(rotated.data.rotationId, /^key_rotation_/);
    assert.match(rotated.data.auditId, /^evt_key_/);
    assert.equal("rawKey" in rotated.data, false);
  });

  it("persists immutable public API key rotation audit rows without raw key material", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const integrations = new IntegrationService(repository);

    const rotated = await integrations.rotateApiKey("stage-key");
    const state = repository.readState();

    assert.equal(rotated.status, "ok");
    assert.equal(state.apiKeyRotationAuditEvents.length, 1);
    const auditEvent = state.apiKeyRotationAuditEvents[0];
    assert.equal(auditEvent.action, "public_api_key.rotation_queued");
    assert.equal(auditEvent.auditId, rotated.data.auditId);
    assert.equal(auditEvent.environment, "stage");
    assert.equal(auditEvent.immutable, true);
    assert.equal(auditEvent.keyId, "stage-key");
    assert.equal(auditEvent.keyPreview, "sk_test_****_44ST");
    assert.equal(auditEvent.rotationId, rotated.data.rotationId);
    assert.equal(auditEvent.status, "rotation_queued");
    assert.match(auditEvent.at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(Object.keys(auditEvent).sort(), [
      "action",
      "at",
      "auditId",
      "environment",
      "immutable",
      "keyId",
      "keyPreview",
      "rotationId",
      "status"
    ]);
    assert.equal(JSON.stringify(state.apiKeyRotationAuditEvents).includes("rawKey"), false);
    assert.equal(JSON.stringify(state.apiKeyRotationAuditEvents).includes("sk_test_support_secret"), false);
  });

  it("reloads public API key rotation audit rows from JSON store without raw key material", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "integration-rotation-audit-"));
    try {
      const filePath = join(workspace, "integration-rotation-audit.json");
      const firstRepository = IntegrationRepository.open({ filePath, seed: bootstrapIntegrationState() });
      const integrations = new IntegrationService(firstRepository);

      const rotated = await integrations.rotateApiKey("stage-key");
      const fileContents = readFileSync(filePath, "utf8");
      const reopenedRepository = IntegrationRepository.open({ filePath });
      const state = reopenedRepository.readState();

      assert.equal(rotated.status, "ok");
      assert.equal(fileContents.includes("sk_test_support_secret"), false);
      assert.equal(state.apiKeyRotationAuditEvents.length, 1);
      assert.equal("rawKey" in state.apiKeyRotationAuditEvents[0], false);
      assert.equal("rawSecret" in state.apiKeyRotationAuditEvents[0], false);
      assert.equal(state.apiKeyRotationAuditEvents[0].auditId, rotated.data.auditId);
      assert.equal(state.apiKeyRotationAuditEvents[0].rotationId, rotated.data.rotationId);
      assert.equal(state.apiKeyRotationAuditEvents[0].keyId, "stage-key");
      assert.equal(state.apiKeyRotationAuditEvents[0].keyPreview, "sk_test_****_44ST");
      assert.equal(state.apiKeyRotationAuditEvents[0].immutable, true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("creates public API keys with one-time raw secret and hash-only persistence", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const integrations = new IntegrationService(repository);

    const invalid = await integrations.createPublicApiKey({ name: "   " });
    assert.equal(invalid.status, "invalid");
    assert.equal(invalid.error?.code, "api_key_name_required");

    const badEnvironment = await integrations.createPublicApiKey({ environment: "sandbox", name: "CRM key" });
    assert.equal(badEnvironment.status, "invalid");
    assert.equal(badEnvironment.error?.code, "api_key_environment_invalid");

    const created = await integrations.createPublicApiKey({ environment: "stage", name: "CRM key", scopes: ["clients:identify"] });
    assert.equal(created.status, "ok");
    assert.equal(created.data.rawKeyShownOnce, true);
    assert.match(created.data.rawKey, /^sk_test_[0-9a-f]{36}$/);
    assert.equal(created.data.key.name, "CRM key");
    assert.equal(created.data.key.env, "stage");
    assert.equal(created.data.key.status, "Active");
    assert.ok(created.data.key.keyPreview.includes("****"));
    assert.match(created.data.auditId, /^evt_key_/);

    const state = repository.readState();
    const stored = state.publicApiKeys.find((key) => key.keyId === created.data.key.id);
    assert.ok(stored);
    assert.equal(JSON.stringify(state).includes(created.data.rawKey), false);
    assert.equal(state.publicApiKeyRevealStates.find((item) => item.keyId === stored.keyId)?.status, "consumed");
    assert.ok(state.apiKeyRotationAuditEvents.some((event) => event.action === "public_api_key.created" && event.keyId === stored.keyId));

    const workspace = await integrations.fetchIntegrationWorkspace();
    const listed = workspace.data.apiEnvironmentKeys.find((key) => key.id === created.data.key.id);
    assert.ok(listed);
    assert.equal("rawKey" in listed, false);
    assert.ok(listed.keyPreview.includes("****"));
  });

  it("revokes created and fixture public API keys with immutable audit evidence", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const integrations = new IntegrationService(repository);

    const missing = await integrations.revokePublicApiKey("missing-key");
    assert.equal(missing.status, "not_found");
    assert.equal(missing.error?.code, "api_key_not_found");

    const created = await integrations.createPublicApiKey({ name: "Revocable key" });
    const revoked = await integrations.revokePublicApiKey(created.data.key.id);
    assert.equal(revoked.status, "ok");
    assert.equal(revoked.data.status, "revoked");
    assert.equal(revoked.data.rawKeyShownOnce, false);
    assert.match(revoked.data.auditId, /^evt_key_/);

    const activeKeys = await repository.listActiveKeys();
    assert.equal(activeKeys.some((key) => key.keyId === created.data.key.id), false);

    const fixtureRevoked = await integrations.revokePublicApiKey("stage-key");
    assert.equal(fixtureRevoked.status, "ok");

    const workspace = await integrations.fetchIntegrationWorkspace();
    const createdView = workspace.data.apiEnvironmentKeys.find((key) => key.id === created.data.key.id);
    const stageView = workspace.data.apiEnvironmentKeys.find((key) => key.id === "stage-key");
    assert.equal(createdView?.status, "Revoked");
    assert.equal(stageView?.status, "Revoked");
    assert.ok(repository.readState().apiKeyRotationAuditEvents.some((event) => event.action === "public_api_key.revoked" && event.keyId === "stage-key"));
  });

  it("manages webhook endpoints with validation, seed overrides and tombstones", async () => {
    const integrations = new IntegrationService(IntegrationRepository.inMemory(bootstrapIntegrationState()));

    const noName = await integrations.createWebhookEndpoint({ url: "https://crm.example.test/hooks" });
    assert.equal(noName.status, "invalid");
    assert.equal(noName.error?.code, "webhook_endpoint_name_required");

    const badUrl = await integrations.createWebhookEndpoint({ name: "CRM hooks", url: "ftp://crm.example.test" });
    assert.equal(badUrl.status, "invalid");
    assert.equal(badUrl.error?.code, "webhook_endpoint_url_invalid");

    const created = await integrations.createWebhookEndpoint({ channel: "SDK", name: "CRM hooks", url: "https://crm.example.test/hooks" });
    assert.equal(created.status, "ok");
    assert.match(created.data.endpoint.id, /^wh_/);
    assert.equal(created.data.endpoint.signature, "HMAC SHA-256");

    const missing = await integrations.updateWebhookEndpoint("missing-endpoint", { name: "Ghost" });
    assert.equal(missing.status, "not_found");
    assert.equal(missing.error?.code, "webhook_endpoint_not_found");

    const badStatus = await integrations.updateWebhookEndpoint(created.data.endpoint.id, { status: "paused" });
    assert.equal(badStatus.status, "invalid");
    assert.equal(badStatus.error?.code, "webhook_endpoint_status_invalid");

    const disabled = await integrations.updateWebhookEndpoint(created.data.endpoint.id, { status: "disabled" });
    assert.equal(disabled.status, "ok");
    assert.equal(disabled.data.endpoint.status, "Отключён");

    const seedOverride = await integrations.updateWebhookEndpoint("vk-inbound", { url: "https://api.support.local/webhooks/vk-2" });
    assert.equal(seedOverride.status, "ok");
    assert.equal(seedOverride.data.endpoint.url, "https://api.support.local/webhooks/vk-2");

    const deleted = await integrations.deleteWebhookEndpoint(created.data.endpoint.id);
    assert.equal(deleted.status, "ok");
    assert.equal(deleted.data.deleted, true);

    const workspace = await integrations.fetchIntegrationWorkspace();
    const endpointIds = workspace.data.webhookEndpoints.map((endpoint) => endpoint.id);
    assert.equal(endpointIds.includes(created.data.endpoint.id), false);
    const vkEndpoint = workspace.data.webhookEndpoints.find((endpoint) => endpoint.id === "vk-inbound");
    assert.equal(vkEndpoint?.url, "https://api.support.local/webhooks/vk-2");
    assert.ok(workspace.data.webhookEndpoints.every((endpoint) => endpoint.signature));
  });

  it("persists webhook endpoint records in the JSON store across reopen", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "integration-webhook-endpoints-"));
    try {
      const filePath = join(workspace, "integration-webhook-endpoints.json");
      const integrations = new IntegrationService(IntegrationRepository.open({ filePath, seed: bootstrapIntegrationState() }));

      const created = await integrations.createWebhookEndpoint({ name: "Durable hooks", url: "https://durable.example.test/hooks" });
      await integrations.deleteWebhookEndpoint("vk-inbound");

      const reopened = new IntegrationService(IntegrationRepository.open({ filePath }));
      const reopenedWorkspace = await reopened.fetchIntegrationWorkspace();
      const endpointIds = reopenedWorkspace.data.webhookEndpoints.map((endpoint) => endpoint.id);

      assert.equal(endpointIds.includes(created.data.endpoint.id), true);
      assert.equal(endpointIds.includes("vk-inbound"), false);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("replays webhook deliveries idempotently while preserving original trace id", async () => {
    const integrations = new IntegrationService(IntegrationRepository.inMemory(bootstrapIntegrationState()));

    const missing = await integrations.replayWebhookDelivery({
      deliveryId: "missing-delivery"
    });
    assert.equal(missing.status, "not_found");
    assert.equal(missing.error?.code, "webhook_delivery_not_found");

    const replay = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-441",
      idempotencyKey: "replay-dlv-441"
    });
    assert.equal(replay.status, "ok");
    assert.equal(replay.data.deliveryId, "dlv-441");
    assert.equal(replay.data.originalTraceId, "hook_vk_441");
    assert.equal(replay.data.status, "replay_queued");
    assert.equal(replay.data.signatureVerified, false);
    assert.match(replay.data.replayId, /^webhook_replay_/);
    assert.match(replay.data.auditId, /^evt_webhook_/);

    const duplicate = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-441",
      idempotencyKey: "replay-dlv-441"
    });
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.replayId, replay.data.replayId);
    assert.equal(duplicate.data.originalTraceId, replay.data.originalTraceId);

    const reusedKeyWithDifferentDelivery = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-438",
      idempotencyKey: "replay-dlv-441"
    });
    assert.equal(reusedKeyWithDifferentDelivery.status, "conflict");
    assert.equal(reusedKeyWithDifferentDelivery.error?.code, "idempotency_key_reused");
    assert.equal(reusedKeyWithDifferentDelivery.data.deliveryId, "dlv-438");
    assert.equal(reusedKeyWithDifferentDelivery.data.originalDeliveryId, "dlv-441");
  });

  it("documents webhook replay idempotency key examples", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const integrations = new IntegrationService(repository);

    const first = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-441",
      idempotencyKey: "idempotency-example-001"
    });
    const duplicate = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-441",
      idempotencyKey: "idempotency-example-001"
    });
    const conflict = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-438",
      idempotencyKey: "idempotency-example-001"
    });
    const blankKeyFirst = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-441",
      idempotencyKey: "   "
    });
    const blankKeySecond = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-441",
      idempotencyKey: "   "
    });

    assert.equal(first.status, "ok");
    assert.equal(first.data.duplicate, false);
    assert.equal(duplicate.status, "ok");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.replayId, first.data.replayId);
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "idempotency_key_reused");
    assert.equal(conflict.data.originalDeliveryId, "dlv-441");
    assert.equal(blankKeyFirst.status, "ok");
    assert.equal(blankKeySecond.status, "ok");
    assert.equal(blankKeyFirst.data.duplicate, false);
    assert.equal(blankKeySecond.data.duplicate, false);
    assert.notEqual(blankKeySecond.data.replayId, blankKeyFirst.data.replayId);
    assert.equal(JSON.stringify(repository.readState().webhookReplayAuditEvents).includes("https://"), false);
  });

  it("persists immutable webhook replay audit events for retry, duplicate and dead-letter transitions", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const integrations = new IntegrationService(repository);

    const retryReplay = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-429",
      idempotencyKey: "replay-retry-scheduled"
    });
    const deadLetterReplay = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-441",
      idempotencyKey: "replay-signature-failed"
    });
    const duplicateReplay = await integrations.replayWebhookDelivery({
      deliveryId: "dlv-441",
      idempotencyKey: "replay-signature-failed"
    });

    const state = repository.readState();
    const auditEvents = state.webhookReplayAuditEvents;

    assert.equal(retryReplay.status, "ok");
    assert.equal(deadLetterReplay.status, "ok");
    assert.equal(duplicateReplay.data.duplicate, true);
    assert.equal(auditEvents.length, 3);
    assert.deepEqual(auditEvents.map((event) => event.transition), ["retry", "dead_letter", "duplicate"]);
    assert.deepEqual(auditEvents.map((event) => event.immutable), [true, true, true]);
    assert.deepEqual(auditEvents.map((event) => event.action), [
      "webhook.replay.queued",
      "webhook.replay.queued",
      "webhook.replay.duplicate"
    ]);
    assert.equal(auditEvents[1].auditId, deadLetterReplay.data.auditId);
    assert.equal(auditEvents[2].auditId, deadLetterReplay.data.auditId);
    assert.equal(auditEvents[2].replayId, duplicateReplay.data.replayId);
    assert.equal(auditEvents[2].idempotencyKey, "replay-signature-failed");
    assert.equal(JSON.stringify(auditEvents).includes("https://"), false);
    assert.equal(JSON.stringify(auditEvents).includes("signatureSecret"), false);
  });

  it("replays webhook deliveries from the durable delivery journal read-side", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 4,
      createdAt: "2026-06-30T14:15:00.000Z",
      deliveryId: "wdj-replay-readside-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-replay-readside-001",
      lastAttemptAt: "2026-06-30T14:15:10.000Z",
      lastError: {
        code: "provider_500",
        message: "Provider failed with Authorization: Bearer whsec_replay",
        statusCode: 500
      },
      payloadRef: "outbox_evt_replay_readside_001",
      queue: "webhook-delivery",
      status: "dead_lettered",
      targetUrl: "https://hooks.example.com/support?signatureSecret=replay-secret",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_replay_readside_001"
    });
    const integrations = new IntegrationService(repository);

    const replay = await integrations.replayWebhookDelivery({
      deliveryId: "wdj-replay-readside-001",
      idempotencyKey: "replay-durable-journal-delivery"
    });
    const duplicate = await integrations.replayWebhookDelivery({
      deliveryId: "wdj-replay-readside-001",
      idempotencyKey: "replay-durable-journal-delivery"
    });
    const state = repository.readState();

    assert.equal(replay.status, "ok");
    assert.equal(replay.data.deliveryId, "wdj-replay-readside-001");
    assert.equal(replay.data.originalTraceId, "trc_webhook_delivery_replay_readside_001");
    assert.equal(replay.data.signatureVerified, true);
    assert.equal(replay.data.status, "replay_queued");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(state.webhookReplayAuditEvents.length, 2);
    assert.deepEqual(state.webhookReplayAuditEvents.map((event) => event.transition), ["dead_letter", "duplicate"]);
    assert.equal(state.webhookReplayAuditEvents[0].attempts, 4);
    assert.equal(state.webhookReplayAuditEvents[0].deliveryStatus, "dead_lettered");
    assert.equal(JSON.stringify(state.webhookReplayAuditEvents).includes("https://"), false);
    assert.equal(JSON.stringify(state.webhookReplayAuditEvents).includes("signatureSecret"), false);
    assert.equal(JSON.stringify(state.webhookReplayJournal).includes("whsec_"), false);
  });

  it("exposes webhook delivery status read-side from the durable journal without secrets", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 3,
      createdAt: "2026-06-30T14:25:00.000Z",
      deliveryId: "wdj-status-readside-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-status-readside-001",
      lastAttemptAt: "2026-06-30T14:25:10.000Z",
      lastError: {
        code: "provider_504",
        message: "Provider failed with Authorization: Bearer whsec_status",
        statusCode: 504
      },
      nextAttemptAt: "2026-06-30T14:28:10.000Z",
      payloadRef: "outbox_evt_status_readside_001",
      queue: "webhook-delivery",
      status: "retry_scheduled",
      targetUrl: "https://hooks.example.com/support?webhookSecret=status-secret",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_status_readside_001"
    });
    const integrations = new IntegrationService(repository);

    const workspace = await integrations.fetchIntegrationWorkspace();
    const deliveryLog = workspace.data.webhookDeliveryLog as Array<Record<string, unknown>>;
    const journalDelivery = deliveryLog.find((delivery) => delivery.id === "wdj-status-readside-001");
    const deliveryLogJson = JSON.stringify(deliveryLog);

    assert.equal(workspace.status, "ok");
    assert.equal(journalDelivery?.status, "retry_scheduled");
    assert.equal(journalDelivery?.attempts, 3);
    assert.equal(journalDelivery?.httpStatus, "504");
    assert.equal(journalDelivery?.traceId, "trc_webhook_delivery_status_readside_001");
    assert.equal("targetUrl" in (journalDelivery ?? {}), false);
    assert.equal("lastError" in (journalDelivery ?? {}), false);
    assert.equal(deliveryLogJson.includes("whsec_"), false);
    assert.equal(deliveryLogJson.includes("webhookSecret"), false);
    assert.equal(deliveryLogJson.includes("https://"), false);
  });

  it("exposes sanitized webhook delivery dead-letter read-side from the durable journal", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 5,
      createdAt: "2026-06-30T14:35:00.000Z",
      deliveryId: "wdj-dead-letter-readside-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-dead-letter-readside-001",
      lastAttemptAt: "2026-06-30T14:35:10.000Z",
      lastError: {
        code: "provider_401",
        message: "Provider failed with Authorization: Bearer whsec_dead_letter and webhookSecret=dead-letter-secret",
        statusCode: 401
      },
      payloadRef: "outbox_evt_dead_letter_readside_001",
      queue: "webhook-delivery",
      status: "dead_lettered",
      targetUrl: "https://hooks.example.com/support?webhookSecret=dead-letter-secret",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_dead_letter_readside_001"
    });
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 1,
      createdAt: "2026-06-30T14:36:00.000Z",
      deliveryId: "wdj-dead-letter-readside-delivered",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-dead-letter-readside-delivered",
      payloadRef: "outbox_evt_dead_letter_readside_delivered",
      queue: "webhook-delivery",
      status: "delivered",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_dead_letter_readside_delivered"
    });
    const integrations = new IntegrationService(repository);

    const workspace = await integrations.fetchIntegrationWorkspace();
    const deadLetters = workspace.data.webhookDeadLetters as Array<Record<string, unknown>>;
    const deadLetterJson = JSON.stringify(deadLetters);

    assert.equal(deadLetters.length, 1);
    assert.equal(deadLetters[0].deliveryId, "wdj-dead-letter-readside-001");
    assert.equal(deadLetters[0].status, "dead_lettered");
    assert.equal(deadLetters[0].attempts, 5);
    assert.equal(deadLetters[0].errorCode, "provider_401");
    assert.equal(deadLetters[0].httpStatus, "401");
    assert.equal(deadLetters[0].lastAttemptAt, "2026-06-30T14:35:10.000Z");
    assert.equal(deadLetters[0].traceId, "trc_webhook_delivery_dead_letter_readside_001");
    assert.equal(deadLetters[0].replayable, true);
    assert.equal("targetUrl" in deadLetters[0], false);
    assert.equal("lastError" in deadLetters[0], false);
    assert.equal("message" in deadLetters[0], false);
    assert.equal(deadLetterJson.includes("wdj-dead-letter-readside-delivered"), false);
    assert.equal(deadLetterJson.includes("whsec_"), false);
    assert.equal(deadLetterJson.includes("webhookSecret"), false);
    assert.equal(deadLetterJson.includes("https://"), false);
  });

  it("keeps webhook replay journal first-write-wins for reused idempotency keys", () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());

    const first = repository.saveWebhookReplay({
      auditId: "evt_webhook_first",
      deliveryId: "dlv-441",
      idempotencyKey: "journal-first-write",
      originalTraceId: "hook_vk_441",
      replayId: "webhook_replay_first",
      signatureVerified: false,
      status: "replay_queued"
    });
    const second = repository.saveWebhookReplay({
      auditId: "evt_webhook_second",
      deliveryId: "dlv-438",
      idempotencyKey: "journal-first-write",
      originalTraceId: "hook_tg_438",
      replayId: "webhook_replay_second",
      signatureVerified: true,
      status: "replay_queued"
    });

    const state = repository.readState();

    assert.deepEqual(second, first);
    assert.equal(state.webhookReplayJournal.length, 1);
    assert.equal(state.webhookReplayJournal[0].deliveryId, "dlv-441");
    assert.equal(state.webhookReplayJournal[0].replayId, "webhook_replay_first");
  });

  it("persists webhook delivery journal rows first-write-wins without endpoint secrets", () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());

    const first = repository.saveWebhookDeliveryJournalEntry({
      attempts: 0,
      createdAt: "2026-06-30T13:20:00.000Z",
      deliveryId: "wdj-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-wdj-001",
      payloadRef: "outbox_evt_001",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_001"
    });
    const replayed = repository.saveWebhookDeliveryJournalEntry({
      attempts: 1,
      createdAt: "2026-06-30T13:21:00.000Z",
      deliveryId: "wdj-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-wdj-001-replay",
      payloadRef: "outbox_evt_002",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://hooks.example.com/support/replayed",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_replayed"
    });

    const queued = repository.listWebhookDeliveryJournal({ status: "queued" });
    const found = repository.findWebhookDeliveryJournalEntry("wdj-001");
    const state = repository.readState();

    assert.deepEqual(replayed, first);
    assert.deepEqual(found, first);
    assert.equal(queued.length, 1);
    assert.equal(queued[0].deliveryId, "wdj-001");
    assert.equal(queued[0].attempts, 0);
    assert.equal(queued[0].payloadRef, "outbox_evt_001");
    assert.equal(state.webhookDeliveryJournal.length, 1);
    assert.equal(JSON.stringify(state.webhookDeliveryJournal).includes("whsec_"), false);
    assert.equal(JSON.stringify(state.webhookDeliveryJournal).includes("signatureSecret"), false);
  });

  it("records webhook delivery retry state without storing provider secrets", () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());

    repository.saveWebhookDeliveryJournalEntry({
      attempts: 0,
      createdAt: "2026-06-30T13:25:00.000Z",
      deliveryId: "wdj-retry-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-retry-001",
      lockedAt: "2026-06-30T13:25:02.000Z",
      payloadRef: "outbox_evt_retry_001",
      queue: "webhook-delivery",
      status: "publishing",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_retry_001"
    });

    const retry = repository.recordWebhookDeliveryRetryState({
      attempts: 1,
      deliveryId: "wdj-retry-001",
      lastError: {
        code: "provider_503",
        message: "Provider temporarily unavailable",
        statusCode: 503
      },
      lastAttemptAt: "2026-06-30T13:25:05.000Z",
      nextAttemptAt: "2026-06-30T13:26:05.000Z"
    });
    const missing = repository.recordWebhookDeliveryRetryState({
      attempts: 1,
      deliveryId: "wdj-retry-missing",
      lastError: {
        code: "provider_500",
        message: "Missing delivery",
        statusCode: 500
      },
      lastAttemptAt: "2026-06-30T13:25:05.000Z",
      nextAttemptAt: "2026-06-30T13:26:05.000Z"
    });
    const retryRows = repository.listWebhookDeliveryJournal({ status: "retry_scheduled" });
    const state = repository.readState();

    assert.equal(retry.status, "retry_scheduled");
    assert.equal(retry.attempts, 1);
    assert.equal(retry.lastAttemptAt, "2026-06-30T13:25:05.000Z");
    assert.equal(retry.nextAttemptAt, "2026-06-30T13:26:05.000Z");
    assert.deepEqual(retry.lastError, {
      code: "provider_503",
      message: "Provider temporarily unavailable",
      statusCode: 503
    });
    assert.equal(missing, undefined);
    assert.equal(retryRows.length, 1);
    assert.equal(retryRows[0].deliveryId, "wdj-retry-001");
    assert.equal(JSON.stringify(state.webhookDeliveryJournal).includes("whsec_"), false);
    assert.equal(JSON.stringify(state.webhookDeliveryJournal).includes("signatureSecret"), false);
    assert.equal(JSON.stringify(state.webhookDeliveryJournal).includes("Authorization"), false);
  });

  it("claims due webhook delivery journal rows once and recovers stale leases", () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());

    repository.saveWebhookDeliveryJournalEntry({
      attempts: 0,
      createdAt: "2026-06-30T13:30:00.000Z",
      deliveryId: "wdj-claim-queued",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-claim-queued",
      payloadRef: "outbox_evt_claim_queued",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_claim_queued"
    });
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 1,
      createdAt: "2026-06-30T13:31:00.000Z",
      deliveryId: "wdj-claim-retry-waiting",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-claim-retry-waiting",
      nextAttemptAt: "2026-06-30T13:35:00.000Z",
      payloadRef: "outbox_evt_claim_retry_waiting",
      queue: "webhook-delivery",
      status: "retry_scheduled",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_claim_retry_waiting"
    });
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 2,
      createdAt: "2026-06-30T13:32:00.000Z",
      deliveryId: "wdj-claim-retry-due",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-claim-retry-due",
      nextAttemptAt: "2026-06-30T13:32:30.000Z",
      payloadRef: "outbox_evt_claim_retry_due",
      queue: "webhook-delivery",
      status: "retry_scheduled",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_claim_retry_due"
    });

    const firstClaim = repository.claimWebhookDeliveryJournalEntries({
      limit: 10,
      now: "2026-06-30T13:33:00.000Z",
      queue: "webhook-delivery"
    });
    const secondClaim = repository.claimWebhookDeliveryJournalEntries({
      limit: 10,
      now: "2026-06-30T13:33:30.000Z",
      queue: "webhook-delivery"
    });
    const staleClaim = repository.claimWebhookDeliveryJournalEntries({
      leaseTimeoutMs: 60_000,
      limit: 10,
      now: "2026-06-30T13:34:01.000Z",
      queue: "webhook-delivery"
    });

    assert.deepEqual(firstClaim.map((entry) => entry.deliveryId), ["wdj-claim-queued", "wdj-claim-retry-due"]);
    assert.deepEqual(firstClaim.map((entry) => entry.status), ["publishing", "publishing"]);
    assert.deepEqual(firstClaim.map((entry) => entry.lockedAt), [
      "2026-06-30T13:33:00.000Z",
      "2026-06-30T13:33:00.000Z"
    ]);
    assert.deepEqual(secondClaim, []);
    assert.deepEqual(staleClaim.map((entry) => entry.deliveryId), ["wdj-claim-queued", "wdj-claim-retry-due"]);
    assert.deepEqual(staleClaim.map((entry) => entry.lockedAt), [
      "2026-06-30T13:34:01.000Z",
      "2026-06-30T13:34:01.000Z"
    ]);
    assert.deepEqual(repository.listWebhookDeliveryJournal({ status: "retry_scheduled" }).map((entry) => entry.deliveryId), [
      "wdj-claim-retry-waiting"
    ]);
  });

  it("calculates webhook delivery retry backoff and terminal dead-letter state", () => {
    const retryable = resolveWebhookDeliveryFailureState({
      currentAttempts: 2,
      failedAt: "2026-06-30T13:40:00.000Z",
      maxAttempts: 5,
      retryBackoffMs: 120_000
    });
    const terminal = resolveWebhookDeliveryFailureState({
      currentAttempts: 4,
      failedAt: "2026-06-30T13:40:00.000Z",
      maxAttempts: 5,
      retryBackoffMs: 120_000
    });

    assert.deepEqual(retryable, {
      attempts: 3,
      deadLetteredAt: null,
      nextAttemptAt: "2026-06-30T13:42:00.000Z",
      status: "retry_scheduled"
    });
    assert.deepEqual(terminal, {
      attempts: 5,
      deadLetteredAt: "2026-06-30T13:40:00.000Z",
      nextAttemptAt: null,
      status: "dead_lettered"
    });
    assert.throws(() => resolveWebhookDeliveryFailureState({
      currentAttempts: 0,
      failedAt: "not-a-date",
      maxAttempts: 5,
      retryBackoffMs: 120_000
    }), /webhook_delivery_failed_at_invalid/);
    assert.throws(() => resolveWebhookDeliveryFailureState({
      currentAttempts: 0,
      failedAt: "2026-06-30T13:40:00.000Z",
      maxAttempts: 5,
      retryBackoffMs: 0
    }), /webhook_delivery_retry_backoff_invalid/);
  });

  it("persists webhook delivery retry schedule after a failed claimed delivery", () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 2,
      createdAt: "2026-06-30T13:45:00.000Z",
      deliveryId: "wdj-retry-worker-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-retry-worker-001",
      lockedAt: "2026-06-30T13:45:02.000Z",
      payloadRef: "outbox_evt_retry_worker_001",
      queue: "webhook-delivery",
      status: "publishing",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_retry_worker_001"
    });
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 0,
      createdAt: "2026-06-30T13:45:00.000Z",
      deliveryId: "wdj-retry-worker-unclaimed",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-retry-worker-unclaimed",
      payloadRef: "outbox_evt_retry_worker_unclaimed",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_retry_worker_unclaimed"
    });

    const scheduled = recordWebhookDeliveryFailureForRetry({
      deliveryId: "wdj-retry-worker-001",
      error: {
        code: "provider_timeout",
        message: "Provider timed out with Authorization: Bearer whsec_secret and signatureSecret=abc",
        statusCode: 504
      },
      failedAt: "2026-06-30T13:45:10.000Z",
      maxAttempts: 5,
      repository,
      retryBackoffMs: 180_000
    });
    const directUnclaimedUpdate = repository.recordWebhookDeliveryRetryState({
      attempts: 1,
      deliveryId: "wdj-retry-worker-unclaimed",
      lastAttemptAt: "2026-06-30T13:45:10.000Z",
      lastError: {
        code: "provider_timeout",
        message: "Should not persist",
        statusCode: 504
      },
      nextAttemptAt: "2026-06-30T13:48:10.000Z"
    });
    assert.throws(() => recordWebhookDeliveryFailureForRetry({
      deliveryId: "wdj-retry-worker-unclaimed",
      error: {
        code: "provider_timeout",
        message: "Should not schedule",
        statusCode: 504
      },
      failedAt: "2026-06-30T13:45:10.000Z",
      maxAttempts: 5,
      repository,
      retryBackoffMs: 180_000
    }), /webhook_delivery_not_claimed/);
    const persisted = repository.findWebhookDeliveryJournalEntry("wdj-retry-worker-001");

    assert.equal(scheduled.status, "retry_scheduled");
    assert.equal(scheduled.attempts, 3);
    assert.equal(scheduled.lastAttemptAt, "2026-06-30T13:45:10.000Z");
    assert.equal(scheduled.nextAttemptAt, "2026-06-30T13:48:10.000Z");
    assert.deepEqual(scheduled.lastError, {
      code: "provider_timeout",
      message: "Provider timed out with [REDACTED:api_key] and [REDACTED:secret]",
      statusCode: 504
    });
    assert.equal(scheduled.lockedAt, undefined);
    assert.equal(directUnclaimedUpdate, undefined);
    assert.deepEqual(persisted, scheduled);
    assert.equal(JSON.stringify(repository.readState().webhookDeliveryJournal).includes("whsec_"), false);
    assert.equal(JSON.stringify(repository.readState().webhookDeliveryJournal).includes("Authorization"), false);
    assert.equal(JSON.stringify(repository.readState().webhookDeliveryJournal).includes("signatureSecret"), false);
  });

  it("persists webhook delivery attempt success without storing provider response secrets", () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 1,
      createdAt: "2026-06-30T13:55:00.000Z",
      deliveryId: "wdj-attempt-success-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-attempt-success-001",
      lockedAt: "2026-06-30T13:55:02.000Z",
      payloadRef: "outbox_evt_attempt_success_001",
      queue: "webhook-delivery",
      status: "publishing",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_attempt_success_001"
    });
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 0,
      createdAt: "2026-06-30T13:55:00.000Z",
      deliveryId: "wdj-attempt-success-unclaimed",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-attempt-success-unclaimed",
      payloadRef: "outbox_evt_attempt_success_unclaimed",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_attempt_success_unclaimed"
    });

    const delivered = recordWebhookDeliveryAttemptSuccess({
      attemptedAt: "2026-06-30T13:55:10.000Z",
      deliveryId: "wdj-attempt-success-001",
      providerResponse: {
        body: "ok Authorization: Bearer whsec_success and signatureSecret=attempt-secret",
        statusCode: 202
      },
      repository
    });
    const directUnclaimedUpdate = repository.recordWebhookDeliveryAttemptSuccess({
      attemptedAt: "2026-06-30T13:55:10.000Z",
      deliveryId: "wdj-attempt-success-unclaimed"
    });
    assert.throws(() => recordWebhookDeliveryAttemptSuccess({
      attemptedAt: "2026-06-30T13:55:10.000Z",
      deliveryId: "wdj-attempt-success-unclaimed",
      providerResponse: {
        body: "Should not persist",
        statusCode: 202
      },
      repository
    }), /webhook_delivery_not_claimed/);
    const persisted = repository.findWebhookDeliveryJournalEntry("wdj-attempt-success-001");
    const journalJson = JSON.stringify(repository.readState().webhookDeliveryJournal);

    assert.equal(delivered.status, "delivered");
    assert.equal(delivered.attempts, 2);
    assert.equal(delivered.lastAttemptAt, "2026-06-30T13:55:10.000Z");
    assert.equal(delivered.lockedAt, undefined);
    assert.equal(delivered.nextAttemptAt, undefined);
    assert.equal(delivered.lastError, undefined);
    assert.equal(directUnclaimedUpdate, undefined);
    assert.deepEqual(persisted, delivered);
    assert.equal(journalJson.includes("whsec_"), false);
    assert.equal(journalJson.includes("Authorization"), false);
    assert.equal(journalJson.includes("signatureSecret"), false);
    assert.equal(journalJson.includes("attempt-secret"), false);
  });

  it("sanitizes webhook delivery worker provider failure carriers before persistence", () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 0,
      createdAt: "2026-06-30T14:05:00.000Z",
      deliveryId: "wdj-redaction-hardening-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-redaction-hardening-001",
      lockedAt: "2026-06-30T14:05:02.000Z",
      payloadRef: "outbox_evt_redaction_hardening_001",
      queue: "webhook-delivery",
      status: "publishing",
      targetUrl: "https://hooks.example.com/support",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_redaction_hardening_001"
    });

    const scheduled = recordWebhookDeliveryFailureForRetry({
      deliveryId: "wdj-redaction-hardening-001",
      error: {
        code: "provider_401",
        message: "Provider 401 {\"authorization\":\"Bearer whsec_json\",\"providerToken\":\"bot123456:secret\",\"x-provider-signature\":\"sha256=abc123\",\"webhookSecret\":\"whsec_hook\"} objectKey=tenant-volga/private/export/provider-secret.csv",
        statusCode: 401
      },
      failedAt: "2026-06-30T14:05:10.000Z",
      maxAttempts: 3,
      repository,
      retryBackoffMs: 60_000
    });
    const journalJson = JSON.stringify(repository.readState().webhookDeliveryJournal);

    assert.equal(scheduled.lastError?.message, "Provider 401 {[REDACTED:api_key],[REDACTED:provider_token],[REDACTED:webhook_signature],[REDACTED:secret]} objectKey=[REDACTED:object_key]");
    assert.equal(journalJson.includes("whsec_"), false);
    assert.equal(journalJson.includes("bot123456"), false);
    assert.equal(journalJson.includes("sha256=abc123"), false);
    assert.equal(journalJson.includes("tenant-volga/private"), false);
    assert.equal(journalJson.includes("authorization"), false);
    assert.equal(journalJson.includes("providerToken"), false);
    assert.equal(journalJson.includes("x-provider-signature"), false);
    assert.equal(journalJson.includes("webhookSecret"), false);
  });

  it("runs webhook delivery worker once and persists provider delivery outcomes", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const deliveredCalls: Array<{ deliveryId: string; targetUrl: string }> = [];
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 0,
      createdAt: "2026-06-30T14:10:00.000Z",
      deliveryId: "wdj-worker-delivered-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-worker-delivered-001",
      payloadRef: "outbox_evt_worker_delivered_001",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://hooks.example.com/success",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_worker_delivered_001"
    });
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 0,
      createdAt: "2026-06-30T14:10:01.000Z",
      deliveryId: "wdj-worker-retry-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-worker-retry-001",
      payloadRef: "outbox_evt_worker_retry_001",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://hooks.example.com/failure",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_worker_retry_001"
    });
    repository.saveWebhookDeliveryJournalEntry({
      attempts: 2,
      createdAt: "2026-06-30T14:10:02.000Z",
      deliveryId: "wdj-worker-dead-letter-001",
      endpointId: "wep-vk-support",
      eventType: "conversation.message.created",
      idempotencyKey: "webhook-delivery-worker-dead-letter-001",
      payloadRef: "outbox_evt_worker_dead_letter_001",
      queue: "webhook-delivery",
      status: "queued",
      targetUrl: "https://hooks.example.com/dead-letter",
      tenantId: "tenant-volga",
      traceId: "trc_webhook_delivery_worker_dead_letter_001"
    });

    const result = await runWebhookDeliveryWorkerOnce({
      maxAttempts: 3,
      now: "2026-06-30T14:11:00.000Z",
      provider: {
        async deliver(entry) {
          deliveredCalls.push({ deliveryId: entry.deliveryId, targetUrl: entry.targetUrl });
          if (entry.deliveryId === "wdj-worker-retry-001") {
            throw Object.assign(new Error("Provider rejected Authorization: Bearer whsec_worker and signatureSecret=retry-secret"), {
              code: "provider_503",
              statusCode: 503
            });
          }
          if (entry.deliveryId === "wdj-worker-dead-letter-001") {
            throw Object.assign(new Error("Provider exhausted Authorization: Bearer whsec_dead_letter and webhookSecret=terminal-secret"), {
              code: "provider_410",
              statusCode: 410
            });
          }

          return { body: "accepted Authorization: Bearer whsec_success", statusCode: 202 };
        }
      },
      repository,
      retryBackoffMs: 120_000
    });
    const delivered = repository.findWebhookDeliveryJournalEntry("wdj-worker-delivered-001");
    const retry = repository.findWebhookDeliveryJournalEntry("wdj-worker-retry-001");
    const deadLetter = repository.findWebhookDeliveryJournalEntry("wdj-worker-dead-letter-001");
    const journalJson = JSON.stringify(repository.readState().webhookDeliveryJournal);

    assert.deepEqual(result, {
      claimed: 3,
      deadLettered: 1,
      delivered: 1,
      failed: 0,
      retryScheduled: 1
    });
    assert.deepEqual(deliveredCalls, [
      { deliveryId: "wdj-worker-delivered-001", targetUrl: "https://hooks.example.com/success" },
      { deliveryId: "wdj-worker-retry-001", targetUrl: "https://hooks.example.com/failure" },
      { deliveryId: "wdj-worker-dead-letter-001", targetUrl: "https://hooks.example.com/dead-letter" }
    ]);
    assert.equal(delivered?.status, "delivered");
    assert.equal(delivered?.attempts, 1);
    assert.equal(delivered?.lastAttemptAt, "2026-06-30T14:11:00.000Z");
    assert.equal(delivered?.lockedAt, undefined);
    assert.equal(retry?.status, "retry_scheduled");
    assert.equal(retry?.attempts, 1);
    assert.equal(retry?.lastAttemptAt, "2026-06-30T14:11:00.000Z");
    assert.equal(retry?.nextAttemptAt, "2026-06-30T14:13:00.000Z");
    assert.deepEqual(retry?.lastError, {
      code: "provider_503",
      message: "Provider rejected [REDACTED:api_key] and [REDACTED:secret]",
      statusCode: 503
    });
    assert.equal(deadLetter?.status, "dead_lettered");
    assert.equal(deadLetter?.attempts, 3);
    assert.equal(deadLetter?.lastAttemptAt, "2026-06-30T14:11:00.000Z");
    assert.equal(deadLetter?.lockedAt, undefined);
    assert.equal(deadLetter?.nextAttemptAt, undefined);
    assert.equal(deadLetter?.deadLetteredAt, "2026-06-30T14:11:00.000Z");
    assert.deepEqual(deadLetter?.lastError, {
      code: "provider_410",
      message: "Provider exhausted [REDACTED:api_key] and [REDACTED:secret]",
      statusCode: 410
    });
    assert.equal(journalJson.includes("whsec_"), false);
    assert.equal(journalJson.includes("Authorization"), false);
    assert.equal(journalJson.includes("signatureSecret"), false);
    assert.equal(journalJson.includes("retry-secret"), false);
    assert.equal(journalJson.includes("terminal-secret"), false);
  });

  it("signs HTTP webhook deliveries with the canonical timestamp and body", async () => {
    const received: { body?: string; headers?: HeadersInit } = {};
    const provider = createHttpWebhookDeliveryProvider({
      fetchImpl: async (_url, init) => {
        received.body = String(init?.body ?? "");
        received.headers = init?.headers;
        return new Response("accepted", { status: 202 });
      },
      signingSecret: "webhook-outbound-contract-secret"
    });
    await provider.deliver({
      attempts: 0,
      createdAt: "2026-07-12T00:00:00.000Z",
      deliveryId: "wdj-signature-001",
      endpointId: "endpoint-signature-001",
      eventType: "conversation.message.created",
      idempotencyKey: "idempotency-signature-001",
      payloadRef: "payload-signature-001",
      queue: "webhook-delivery",
      status: "publishing",
      targetUrl: "https://hooks.example.test/signed",
      tenantId: "tenant-signature-001",
      traceId: "trace-signature-001"
    });

    const headers = new Headers(received.headers);
    const timestamp = headers.get("x-webhook-timestamp");
    const signature = headers.get("x-webhook-signature");
    assert.ok(timestamp);
    assert.equal(signature, `sha256=${createHmac("sha256", "webhook-outbound-contract-secret").update(`${timestamp}.${received.body}`).digest("hex")}`);
  });

  it("exposes webhook delivery worker runtime wiring and release smoke", () => {
    const backendPackageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    const releaseChecklist = readFileSync(new URL("../scripts/release-checklist.mjs", import.meta.url), "utf8");
    const compose = readFileSync(new URL("../../docker-compose.yml", import.meta.url), "utf8");
    const composeHealthCheck = readFileSync(new URL("../../scripts/compose-health-check.mjs", import.meta.url), "utf8");
    const smokeUrl = new URL("../scripts/webhook-delivery-worker-smoke.mjs", import.meta.url);

    assert.equal(
      backendPackageJson.scripts["start:webhook-delivery-worker"],
      "npm run build && node --env-file=.env.example apps/api-gateway/dist/integrations/webhook-delivery.main.js"
    );
    assert.equal(
      backendPackageJson.scripts["webhook:worker:once"],
      "npm run build && node --env-file=.env.example scripts/webhook-delivery-worker-smoke.mjs"
    );
    assert.equal(existsSync(smokeUrl), true);
    assert.match(readFileSync(smokeUrl, "utf8"), /createServer[\s\S]*webhook-delivery\.main\.js[\s\S]*webhook-delivery/);
    assert.match(releaseChecklist, /script: "webhook:worker:once"/);
    assert.match(compose, /webhook-delivery-worker:[\s\S]*command: \["node", "apps\/api-gateway\/dist\/integrations\/webhook-delivery\.main\.js"\]/);
    assert.match(compose, /webhook-delivery-worker:[\s\S]*WEBHOOK_DELIVERY_PROVIDER_MODE: \$\{WEBHOOK_DELIVERY_PROVIDER_MODE:-http\}/);
    assert.match(compose, /webhook-delivery-worker:[\s\S]*INTEGRATION_REPOSITORY: prisma/);
    assert.match(composeHealthCheck, /\["webhook-delivery-worker", \{\}\]/);
  });

  it("revokes security sessions with audit metadata", async () => {
    const integrations = new IntegrationService(IntegrationRepository.inMemory(bootstrapIntegrationState()));

    const missing = await integrations.revokeSecuritySession("missing-session");
    assert.equal(missing.status, "not_found");
    assert.equal(missing.error?.code, "security_session_not_found");

    const revoked = await integrations.revokeSecuritySession("sess-risk");
    assert.equal(revoked.status, "ok");
    assert.equal(revoked.data.sessionId, "sess-risk");
    assert.equal(revoked.data.status, "revoked");
    assert.match(revoked.data.revokedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(revoked.data.auditId, /^evt_session_/);
  });

  it("guards sensitive integration admin routes with tenant or service-admin permissions", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/integrations/integration.controller.ts", import.meta.url), "utf8");

    assert.match(source, /import \{ TenantOperatorOrServiceAdminGuard \} from "\.\.\/conversation\/tenant-operator-or-service-admin\.guard\.js"/);
    assert.match(source, /import \{ RequireServiceAdminAction/);
    assert.match(source, /@Post\("api-keys\/:keyId\/rotate"\)[\s\S]*@UseGuards\(TenantOperatorOrServiceAdminGuard\)[\s\S]*@RequireTenantOperatorPermission\("settings\.manage"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*rotateApiKey/);
    assert.match(source, /@Post\("webhooks\/deliveries\/:deliveryId\/replay"\)[\s\S]*@UseGuards\(TenantOperatorOrServiceAdminGuard\)[\s\S]*@RequireTenantOperatorPermission\("settings\.manage"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*replayWebhookDelivery/);
    assert.match(source, /@Post\("security\/sessions\/:sessionId\/revoke"\)[\s\S]*@UseGuards\(TenantOperatorOrServiceAdminGuard\)[\s\S]*@RequireTenantOperatorPermission\("settings\.manage"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*revokeSecuritySession/);
  });

  it("authenticates public API keys with environment binding and required scopes", async () => {
    const lookup = publicApiKeyLookup([
      publicApiKey({
        environment: "production",
        keyId: "pak_live_support",
        rawSecret: "sk_live_support_secret",
        scopes: ["conversations:write", "clients:identify"],
        tenantId: "tenant-volga"
      }),
      publicApiKey({
        environment: "stage",
        keyId: "pak_stage_support",
        rawSecret: "sk_test_support_secret",
        scopes: ["clients:identify"],
        tenantId: "tenant-volga"
      })
    ]);

    const allowed = await resolvePublicApiRequest({
      authorization: "Bearer sk_live_support_secret",
      environment: "production",
      lookup,
      requiredScope: "conversations:write"
    });
    const wrongEnvironment = await resolvePublicApiRequest({
      authorization: "Bearer sk_test_support_secret",
      environment: "production",
      lookup,
      requiredScope: "clients:identify"
    });
    const missingScope = await resolvePublicApiRequest({
      authorization: "Bearer sk_test_support_secret",
      environment: "stage",
      lookup,
      requiredScope: "conversations:write"
    });
    const missingKey = await resolvePublicApiRequest({
      authorization: "",
      environment: "stage",
      lookup,
      requiredScope: "clients:identify"
    });

    assert.equal(allowed.allowed, true);
    assert.deepEqual(allowed.context, {
      environment: "production",
      keyId: "pak_live_support",
      scopes: ["conversations:write", "clients:identify"],
      tenantId: "tenant-volga"
    });
    assert.equal(wrongEnvironment.allowed, false);
    assert.equal(wrongEnvironment.code, "public_api_key_environment_mismatch");
    assert.equal(missingScope.allowed, false);
    assert.equal(missingScope.code, "public_api_scope_denied");
    assert.equal(missingKey.allowed, false);
    assert.equal(missingKey.code, "public_api_key_required");
  });

  it("documents public API Authorization Bearer header examples without leaking raw keys", async () => {
    const lookup = publicApiKeyLookup([
      publicApiKey({
        environment: "production",
        keyId: "pak_live_header_examples",
        rawSecret: "sk_live_header_examples_secret",
        scopes: ["clients:identify"],
        tenantId: "tenant-volga"
      })
    ]);

    const trimmedLowercaseScheme = await resolvePublicApiRequest({
      authorization: "  bearer sk_live_header_examples_secret  ",
      environment: "production",
      lookup,
      requiredScope: "clients:identify"
    });
    const basicSchemeDenied = await resolvePublicApiRequest({
      authorization: "Basic sk_live_header_examples_secret",
      environment: "production",
      lookup,
      requiredScope: "clients:identify"
    });
    const emptyBearerDenied = await resolvePublicApiRequest({
      authorization: "Bearer   ",
      environment: "production",
      lookup,
      requiredScope: "clients:identify"
    });

    assert.equal(trimmedLowercaseScheme.allowed, true);
    assert.equal(trimmedLowercaseScheme.allowed ? trimmedLowercaseScheme.context.keyId : null, "pak_live_header_examples");
    assert.deepEqual(basicSchemeDenied, {
      allowed: false,
      code: "public_api_key_required",
      status: "unauthorized"
    });
    assert.deepEqual(emptyBearerDenied, {
      allowed: false,
      code: "public_api_key_required",
      status: "unauthorized"
    });
    assert.equal(JSON.stringify({ basicSchemeDenied, emptyBearerDenied }).includes("sk_live_header_examples_secret"), false);
  });

  it("persists public API keys as hashes with masked previews and no raw secret", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const rawSecret = "sk_live_contract_hash_secret_9876";
    const spacedRawSecret = "  sk_test_contract_hash_secret_1122  ";
    const shortRawSecret = "abc";

    const saved = await repository.savePublicApiKey({
      createdAt: "2026-06-30T09:00:00.000Z",
      environment: "production",
      keyId: "pak_contract_hash",
      name: "Contract hash key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });
    const savedWithWhitespace = await repository.savePublicApiKey({
      createdAt: "2026-06-30T09:05:00.000Z",
      environment: "stage",
      keyId: "pak_contract_hash_spaced",
      name: "Contract hash key with whitespace",
      owner: "Security",
      rawSecret: spacedRawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });
    const savedWithShortSecret = await repository.savePublicApiKey({
      createdAt: "2026-06-30T09:07:00.000Z",
      environment: "stage",
      keyId: "pak_contract_short_secret",
      name: "Contract short secret key",
      owner: "Security",
      rawSecret: shortRawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });
    const state = repository.readState();
    const auth = await resolvePublicApiRequest({
      authorization: `Bearer ${rawSecret}`,
      environment: "production",
      lookup: repository,
      requiredScope: "clients:identify"
    });
    const spacedAuth = await resolvePublicApiRequest({
      authorization: "Bearer sk_test_contract_hash_secret_1122",
      environment: "stage",
      lookup: repository,
      requiredScope: "clients:identify"
    });

    assert.equal(saved.secretHash, hashPublicApiKeySecret(rawSecret));
    assert.equal(saved.keyPreview, "sk_live_****_9876");
    assert.equal(savedWithWhitespace.secretHash, hashPublicApiKeySecret("sk_test_contract_hash_secret_1122"));
    assert.equal(savedWithWhitespace.keyPreview, "sk_test_****_1122");
    assert.equal(savedWithShortSecret.secretHash, hashPublicApiKeySecret(shortRawSecret));
    assert.equal(savedWithShortSecret.keyPreview, "key_****_****");
    assert.equal(savedWithShortSecret.keyPreview.includes(shortRawSecret), false);
    assert.equal(saved.keyPreview.includes(rawSecret), false);
    assert.equal(JSON.stringify(state).includes(rawSecret), false);
    assert.equal(JSON.stringify(state).includes(spacedRawSecret), false);
    assert.equal(JSON.stringify(state).includes(`key_****_${shortRawSecret}`), false);
    assert.equal("rawSecret" in state.publicApiKeys[0], false);
    assert.equal(state.publicApiKeys.find((key) => key.keyId === "pak_contract_hash")?.secretHash, hashPublicApiKeySecret(rawSecret));
    assert.equal(auth.allowed, true);
    assert.equal(auth.context.keyId, "pak_contract_hash");
    assert.equal(auth.context.tenantId, "tenant-volga");
    assert.equal(spacedAuth.allowed, true);
    assert.equal(spacedAuth.context.keyId, "pak_contract_hash_spaced");
  });

  it("reloads hashed public API keys from JSON store without raw secret material", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "integration-public-key-"));
    try {
      const filePath = join(workspace, "integration-public-key.json");
      const rawSecret = "sk_live_json_hash_secret_4411";
      const firstRepository = IntegrationRepository.open({ filePath, seed: bootstrapIntegrationState() });
      await firstRepository.savePublicApiKey({
        createdAt: "2026-06-30T09:10:00.000Z",
        environment: "production",
        keyId: "pak_json_hash",
        name: "JSON hash key",
        owner: "Security",
        rawSecret,
        scopes: ["clients:identify"],
        status: "active",
        tenantId: "tenant-volga"
      });

      const fileContents = readFileSync(filePath, "utf8");
      const reopenedRepository = IntegrationRepository.open({ filePath });
      const state = reopenedRepository.readState();
      const auth = await resolvePublicApiRequest({
        authorization: `Bearer ${rawSecret}`,
        environment: "production",
        lookup: reopenedRepository,
        requiredScope: "clients:identify"
      });

      assert.equal(fileContents.includes(rawSecret), false);
      assert.equal(fileContents.includes(hashPublicApiKeySecret(rawSecret)), true);
      assert.equal(state.publicApiKeys.length, 1);
      assert.equal(state.publicApiKeys[0].secretHash, hashPublicApiKeySecret(rawSecret));
      assert.equal(state.publicApiKeys[0].keyPreview, "sk_live_****_4411");
      assert.equal("rawSecret" in state.publicApiKeys[0], false);
      assert.equal(auth.allowed, true);
      assert.equal(auth.context.keyId, "pak_json_hash");
      assert.equal(auth.context.tenantId, "tenant-volga");
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("reveals public API key secrets only once without storing raw secret in state", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const rawSecret = "sk_live_reveal_once_secret_7788";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T10:00:00.000Z",
      environment: "production",
      keyId: "pak_reveal_once",
      name: "Reveal once key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });

    const firstReveal = repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T10:01:00.000Z",
      keyId: "pak_reveal_once"
    });
    const secondReveal = repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T10:02:00.000Z",
      keyId: "pak_reveal_once"
    });
    const state = repository.readState();

    assert.equal(firstReveal.status, "revealed");
    assert.equal(firstReveal.rawSecret, rawSecret);
    assert.equal(firstReveal.keyPreview, "sk_live_****_7788");
    assert.equal(firstReveal.consumedAt, "2026-06-30T10:01:00.000Z");
    assert.equal(secondReveal.status, "consumed");
    assert.equal("rawSecret" in secondReveal, false);
    assert.equal(JSON.stringify(state).includes(rawSecret), false);
    assert.equal(JSON.stringify(repository.listActiveKeys()).includes(rawSecret), false);
    assert.equal(state.publicApiKeyRevealStates.length, 1);
    assert.deepEqual(state.publicApiKeyRevealStates[0], {
      consumedAt: "2026-06-30T10:01:00.000Z",
      createdAt: "2026-06-30T10:00:00.000Z",
      keyId: "pak_reveal_once",
      keyPreview: "sk_live_****_7788",
      status: "consumed"
    });
  });

  it("marks reveal state consumed when one-time raw secret is unavailable after repository reopen", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "integration-reveal-"));
    try {
      const filePath = join(workspace, "integration-reveal.json");
      const firstRepository = IntegrationRepository.open({ filePath, seed: bootstrapIntegrationState() });
      await firstRepository.savePublicApiKey({
        createdAt: "2026-06-30T10:05:00.000Z",
        environment: "production",
        keyId: "pak_reveal_reopened",
        name: "Reveal reopened key",
        owner: "Security",
        rawSecret: "sk_live_reopened_reveal_secret_8844",
        scopes: ["clients:identify"],
        status: "active",
        tenantId: "tenant-volga"
      });

      const reopenedRepository = IntegrationRepository.open({ filePath });
      const reveal = reopenedRepository.consumePublicApiKeyReveal({
        consumedAt: "2026-06-30T10:06:00.000Z",
        keyId: "pak_reveal_reopened"
      });
      const state = reopenedRepository.readState();

      assert.equal(reveal.status, "consumed");
      assert.equal("rawSecret" in reveal, false);
      assert.equal(JSON.stringify(state).includes("sk_live_reopened_reveal_secret_8844"), false);
      assert.deepEqual(state.publicApiKeyRevealStates[0], {
        consumedAt: "2026-06-30T10:06:00.000Z",
        createdAt: "2026-06-30T10:05:00.000Z",
        keyId: "pak_reveal_reopened",
        keyPreview: "sk_live_****_8844",
        status: "consumed"
      });
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("persists consumed public API key reveal state across JSON repository reopen", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "integration-reveal-consumed-"));
    try {
      const filePath = join(workspace, "integration-reveal-consumed.json");
      const rawSecret = "sk_live_reveal_json_secret_5566";
      const firstRepository = IntegrationRepository.open({ filePath, seed: bootstrapIntegrationState() });
      await firstRepository.savePublicApiKey({
        createdAt: "2026-06-30T10:10:00.000Z",
        environment: "production",
        keyId: "pak_reveal_json",
        name: "Reveal JSON key",
        owner: "Security",
        rawSecret,
        scopes: ["clients:identify"],
        status: "active",
        tenantId: "tenant-volga"
      });

      const revealed = firstRepository.consumePublicApiKeyReveal({
        consumedAt: "2026-06-30T10:11:00.000Z",
        keyId: "pak_reveal_json"
      });
      const fileContents = readFileSync(filePath, "utf8");
      const reopenedRepository = IntegrationRepository.open({ filePath });
      const state = reopenedRepository.readState();
      const replay = reopenedRepository.consumePublicApiKeyReveal({
        consumedAt: "2026-06-30T10:12:00.000Z",
        keyId: "pak_reveal_json"
      });

      assert.equal(revealed.status, "revealed");
      assert.equal(revealed.rawSecret, rawSecret);
      assert.equal(fileContents.includes(rawSecret), false);
      assert.equal(replay.status, "consumed");
      assert.equal("rawSecret" in replay, false);
      assert.deepEqual(state.publicApiKeyRevealStates[0], {
        consumedAt: "2026-06-30T10:11:00.000Z",
        createdAt: "2026-06-30T10:10:00.000Z",
        keyId: "pak_reveal_json",
        keyPreview: "sk_live_****_5566",
        status: "consumed"
      });
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("does not reopen one-time public API key reveal state when key creation is replayed", async () => {
    const repository = IntegrationRepository.inMemory(bootstrapIntegrationState());
    const rawSecret = "sk_live_replay_reveal_secret_6677";

    await repository.savePublicApiKey({
      createdAt: "2026-06-30T10:20:00.000Z",
      environment: "production",
      keyId: "pak_reveal_replay",
      name: "Reveal replay key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });

    const firstReveal = repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T10:21:00.000Z",
      keyId: "pak_reveal_replay"
    });
    await repository.savePublicApiKey({
      createdAt: "2026-06-30T10:22:00.000Z",
      environment: "production",
      keyId: "pak_reveal_replay",
      name: "Reveal replay key",
      owner: "Security",
      rawSecret,
      scopes: ["clients:identify"],
      status: "active",
      tenantId: "tenant-volga"
    });
    const replayReveal = repository.consumePublicApiKeyReveal({
      consumedAt: "2026-06-30T10:23:00.000Z",
      keyId: "pak_reveal_replay"
    });
    const state = repository.readState();

    assert.equal(firstReveal.status, "revealed");
    assert.equal(firstReveal.rawSecret, rawSecret);
    assert.equal(replayReveal.status, "consumed");
    assert.equal("rawSecret" in replayReveal, false);
    assert.deepEqual(state.publicApiKeyRevealStates[0], {
      consumedAt: "2026-06-30T10:21:00.000Z",
      createdAt: "2026-06-30T10:20:00.000Z",
      keyId: "pak_reveal_replay",
      keyPreview: "sk_live_****_6677",
      status: "consumed"
    });
  });

  it("wires public SDK identify route through API-key auth with denial envelopes and rate-limit metadata", async () => {
    const lookup = publicApiKeyLookup([
      publicApiKey({
        environment: "production",
        keyId: "pak_live_identify",
        rawSecret: "sk_live_identify_secret",
        scopes: ["clients:identify"],
        tenantId: "tenant-volga"
      }),
      publicApiKey({
        environment: "stage",
        keyId: "pak_stage_limited",
        rawSecret: "sk_test_limited_secret",
        scopes: ["trackEntryPoint"],
        tenantId: "tenant-volga"
      })
    ]);

    const accepted = await handlePublicIdentifyUserRequest({
      authorization: "Bearer sk_live_identify_secret",
      environment: "production",
      lookup,
      payload: {
        externalId: "client-public-001",
        traits: {
          environment: "stage",
          tenantId: "tenant-attacker",
          tier: "gold"
        }
      }
    });
    const denied = await handlePublicIdentifyUserRequest({
      authorization: "Bearer sk_test_limited_secret",
      environment: "stage",
      lookup,
      payload: {
        externalId: "client-public-002"
      }
    });
    const rejectedOnlyTraits = await handlePublicIdentifyUserRequest({
      authorization: "Bearer sk_live_identify_secret",
      environment: "production",
      lookup,
      payload: {
        externalId: "client-public-003",
        traits: {
          environment: "stage",
          tenantId: "tenant-attacker"
        }
      }
    });
    const controllerAccepted = await identifyPublicClientFromRoute(
      lookup,
      "Bearer sk_live_identify_secret",
      "production",
      {
        externalId: "client-public-controller",
        traits: {
          environment: "stage",
          tenantId: "tenant-attacker"
        }
      }
    );
    const controllerSource = readFileSync(new URL("../apps/api-gateway/src/integrations/public-api.controller.ts", import.meta.url), "utf8");
    const moduleSource = readFileSync(new URL("../apps/api-gateway/src/integrations/integration.module.ts", import.meta.url), "utf8");

    assert.equal(accepted.status, "ok");
    assert.equal(accepted.operation, "identifyPublicClient");
    assert.equal(accepted.data.context.keyId, "pak_live_identify");
    assert.equal(accepted.data.context.tenantId, "tenant-volga");
    assert.equal(accepted.data.context.environment, "production");
    assert.equal(accepted.data.acceptedTenantId, "tenant-volga");
    assert.equal(accepted.data.acceptedEnvironment, "production");
    assert.deepEqual(accepted.data.rejectedPayloadContextFields, ["environment", "tenantId"]);
    assert.equal(accepted.data.rateLimit.policy, "public-api-default");
    assert.equal(accepted.data.rawKeyExposed, false);
    assert.equal(rejectedOnlyTraits.data.traitsAccepted, false);
    assert.deepEqual(rejectedOnlyTraits.data.rejectedPayloadContextFields, ["environment", "tenantId"]);
    assert.equal(controllerAccepted.data.acceptedTenantId, "tenant-volga");
    assert.equal(controllerAccepted.data.acceptedEnvironment, "production");
    assert.equal(controllerAccepted.data.traitsAccepted, false);
    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "public_api_scope_denied");
    assert.equal(denied.data.rawKeyExposed, false);
    assert.match(controllerSource, /@Controller\("public"\)/);
    assert.match(controllerSource, /@Post\("sdk\/identify"\)/);
    assert.doesNotMatch(controllerSource, /sk_(live|test)_[A-Za-z0-9_]+/);
    assert.doesNotMatch(controllerSource, /secretHash:/);
    assert.match(moduleSource, /PublicApiController/);
  });

  it("documents signed webhook header examples without leaking signature material", async () => {
    const conversationRepository = ConversationRepository.inMemory(bootstrapConversationState());
    const conversationService = new ConversationService(conversationRepository);
    const nonceStore = new InMemorySignedWebhookNonceStore();
    const body = JSON.stringify({
      conversationId: "maria",
      eventId: "vk_evt_header_examples_001",
      text: "Header examples webhook"
    });
    const secret = "signed_header_examples_secret";
    const timestamp = "2026-06-30T13:05:00.000Z";
    const signature = `sha256=${createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex")}`;

    const accepted = await normalizeSignedInboundWebhookFromRoute({
      body,
      channel: "vk",
      conversationService,
      endpointId: "vk-inbound",
      headers: {
        "x-webhook-nonce": "nonce-header-examples-001",
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp
      },
      nonceStore,
      now: "2026-06-30T13:05:03.000Z",
      secret
    });
    const missingSignature = await normalizeSignedInboundWebhookFromRoute({
      body,
      channel: "vk",
      conversationService,
      endpointId: "vk-inbound",
      headers: {
        "x-webhook-nonce": "nonce-header-examples-002",
        "x-webhook-timestamp": timestamp
      },
      nonceStore,
      now: "2026-06-30T13:05:04.000Z",
      secret
    });
    const missingTimestamp = await normalizeSignedInboundWebhookFromRoute({
      body,
      channel: "vk",
      conversationService,
      endpointId: "vk-inbound",
      headers: {
        "x-webhook-nonce": "nonce-header-examples-003",
        "x-webhook-signature": signature
      },
      nonceStore,
      now: "2026-06-30T13:05:05.000Z",
      secret
    });
    const missingNonce = await normalizeSignedInboundWebhookFromRoute({
      body,
      channel: "vk",
      conversationService,
      endpointId: "vk-inbound",
      headers: {
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp
      },
      nonceStore,
      now: "2026-06-30T13:05:06.000Z",
      secret
    });
    const deniedJson = JSON.stringify({ missingNonce, missingSignature, missingTimestamp });

    assert.equal(accepted.status, "ok");
    assert.equal(accepted.data.normalizationDescriptor.id, "signed_webhook_vk-inbound_nonce-header-examples-001");
    assert.equal(missingSignature.status, "denied");
    assert.equal(missingSignature.error?.code, "webhook_signature_required");
    assert.equal(missingTimestamp.status, "denied");
    assert.equal(missingTimestamp.error?.code, "webhook_timestamp_required");
    assert.equal(missingNonce.status, "denied");
    assert.equal(missingNonce.error?.code, "webhook_nonce_required");
    assert.equal(deniedJson.includes(secret), false);
    assert.equal(deniedJson.includes(signature), false);
  });

  it("routes verified signed inbound webhooks through normalization descriptors", async () => {
    const conversationRepository = ConversationRepository.inMemory(bootstrapConversationState());
    const conversationService = new ConversationService(conversationRepository);
    const nonceStore = new InMemorySignedWebhookNonceStore();
    const body = JSON.stringify({
      conversationId: "maria",
      eventId: "vk_evt_route_verified_001",
      text: "Route verified webhook"
    });
    const secret = "signed_route_secret";
    const timestamp = "2026-06-30T13:06:00.000Z";
    const signature = `sha256=${createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex")}`;

    const normalized = await normalizeSignedInboundWebhookFromRoute({
      body,
      channel: "vk",
      conversationService,
      endpointId: "vk-inbound",
      headers: {
        "x-webhook-nonce": "nonce-route-001",
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp
      },
      nonceStore,
      now: "2026-06-30T13:06:03.000Z",
      secret
    });
    const duplicate = await normalizeSignedInboundWebhookFromRoute({
      body,
      channel: "vk",
      conversationService,
      endpointId: "vk-inbound",
      headers: {
        "x-webhook-nonce": "nonce-route-001",
        "x-webhook-signature": signature,
        "x-webhook-timestamp": timestamp
      },
      nonceStore,
      now: "2026-06-30T13:06:04.000Z",
      secret
    });

    assert.equal(normalized.status, "ok");
    assert.equal(normalized.operation, "normalizeInboundEvent");
    assert.equal(normalized.data.eventId, "vk_evt_route_verified_001");
    assert.equal(normalized.data.message.text, "Route verified webhook");
    assert.equal(normalized.data.normalizationDescriptor.id, "signed_webhook_vk-inbound_nonce-route-001");
    assert.equal(normalized.data.normalizationDescriptor.target.operation, "normalizeInboundEvent");
    assert.equal(JSON.stringify(normalized.data.normalizationDescriptor).includes(secret), false);
    assert.equal(JSON.stringify(normalized.data.normalizationDescriptor).includes(signature), false);
    assert.equal(Object.hasOwn(normalized.data.normalizationDescriptor, "body"), false);
    assert.equal(duplicate.status, "denied");
    assert.equal(duplicate.operation, "receiveSignedInboundWebhook");
    assert.equal(duplicate.error?.code, "webhook_nonce_replay");
    assert.equal(duplicate.data.endpointId, "vk-inbound");
    assert.equal(duplicate.data.firstSeenAt, "2026-06-30T13:06:00.000Z");
    assert.equal(duplicate.data.nonce, "nonce-route-001");
    assert.equal(duplicate.data.normalizationDescriptor, null);
    assert.equal(duplicate.data.replay, true);
  });

  it("returns conflict envelopes for verified inbound webhook event duplicates", async () => {
    const conversationRepository = ConversationRepository.inMemory(bootstrapConversationState());
    const conversationService = new ConversationService(conversationRepository);
    const nonceStore = new InMemorySignedWebhookNonceStore();
    const secret = "signed_route_secret";
    const timestamp = "2026-06-30T13:07:00.000Z";
    const firstBody = JSON.stringify({
      conversationId: "maria",
      eventId: "vk_evt_route_conflict_001",
      text: "First route webhook"
    });
    const conflictBody = JSON.stringify({
      conversationId: "maria",
      eventId: "vk_evt_route_conflict_001",
      text: "Conflicting route webhook"
    });
    const firstSignature = `sha256=${createHmac("sha256", secret)
      .update(`${timestamp}.${firstBody}`)
      .digest("hex")}`;
    const conflictSignature = `sha256=${createHmac("sha256", secret)
      .update(`${timestamp}.${conflictBody}`)
      .digest("hex")}`;

    await normalizeSignedInboundWebhookFromRoute({
      body: firstBody,
      channel: "vk",
      conversationService,
      endpointId: "vk-inbound",
      headers: {
        "x-webhook-nonce": "nonce-route-conflict-001",
        "x-webhook-signature": firstSignature,
        "x-webhook-timestamp": timestamp
      },
      nonceStore,
      now: "2026-06-30T13:07:03.000Z",
      secret
    });
    const conflict = await normalizeSignedInboundWebhookFromRoute({
      body: conflictBody,
      channel: "vk",
      conversationService,
      endpointId: "vk-inbound",
      headers: {
        "x-webhook-nonce": "nonce-route-conflict-002",
        "x-webhook-signature": conflictSignature,
        "x-webhook-timestamp": timestamp
      },
      nonceStore,
      now: "2026-06-30T13:07:04.000Z",
      secret
    });

    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.operation, "receiveSignedInboundWebhook");
    assert.equal(conflict.error?.code, "webhook_event_already_processed");
    assert.equal(conflict.data.eventId, "vk_evt_route_conflict_001");
    assert.equal(conflict.data.duplicate, true);
    assert.equal(conflict.data.normalizationDescriptor.id, "signed_webhook_vk-inbound_nonce-route-conflict-002");
    assert.equal(JSON.stringify(conflict.data.normalizationDescriptor).includes(secret), false);
    assert.equal(JSON.stringify(conflict.data.normalizationDescriptor).includes(conflictSignature), false);
  });
});

function publicApiKey(input: {
  environment: "production" | "stage";
  keyId: string;
  rawSecret: string;
  scopes: string[];
  tenantId: string;
}): PublicApiKeyRecord {
  return {
    environment: input.environment,
    keyId: input.keyId,
    secretHash: hashPublicApiKeySecret(input.rawSecret),
    scopes: input.scopes,
    status: "active",
    tenantId: input.tenantId
  };
}

function publicApiKeyLookup(keys: PublicApiKeyRecord[]) {
  return {
    async listActiveKeys() {
      return keys.filter((key) => key.status === "active");
    }
  };
}
