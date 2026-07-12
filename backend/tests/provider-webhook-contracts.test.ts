import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { ConversationService } from "../apps/api-gateway/src/conversation/conversation.service.ts";
import { IntegrationRepository, type ProviderConnectionCredentialRecord } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { ProviderConnectionCrypto } from "../apps/api-gateway/src/integrations/provider-connection-crypto.ts";
import { handleProviderWebhookFromRoute } from "../apps/api-gateway/src/integrations/provider-webhook.route.ts";

const masterKey = Buffer.alloc(32, 17).toString("base64");

describe("VK and MAX provider webhooks", () => {
  it("confirms VK callback and creates one dialog for repeated message_new", async () => {
    const runtime = providerRuntime("vk", "conn-vk", "vk-secret", "vk-confirm");
    const confirmation = await receive(runtime, "VK", { secret: "vk-secret", type: "confirmation" });
    assert.equal(confirmation, "vk-confirm");

    const body = {
      event_id: "vk-event-1",
      object: { message: { attachments: [], from_id: 77, id: 12, peer_id: 77, text: "Hello from VK" } },
      secret: "vk-secret",
      type: "message_new"
    };
    const first = await receive(runtime, "VK", body) as Record<string, any>;
    const replay = await receive(runtime, "VK", body) as Record<string, any>;
    assert.equal(first.status, "ok");
    assert.equal(first.data.duplicate, false);
    assert.equal(replay.data.duplicate, true);
    assert.equal((await runtime.conversations.listConversations({ tenantId: "tenant-a" })).length, 1);
  });

  it("accepts a MAX attachment-only message and rejects a wrong secret", async () => {
    const runtime = providerRuntime("max", "conn-max", "max-secret");
    const body = {
      message: {
        body: { attachments: [{ payload: { token: "image-token" }, type: "image" }], mid: "mid-1" },
        recipient: { chat_id: 501 },
        sender: { name: "Max Client", user_id: 91 }
      },
      timestamp: 123,
      update_type: "message_created"
    };
    const denied = await receive(runtime, "MAX", body, { "x-max-bot-api-secret": "wrong" }) as Record<string, any>;
    const accepted = await receive(runtime, "MAX", body, { "x-max-bot-api-secret": "max-secret" }) as Record<string, any>;
    assert.equal(denied.status, "denied");
    assert.equal(accepted.status, "ok");
    const conversation = (await runtime.conversations.listConversations({ tenantId: "tenant-a" }))[0];
    assert.equal(conversation.channelConnectionId, "conn-max");
    assert.equal(conversation.messages[0].text, "Attachment received");
    assert.equal(conversation.messages[0].attachments?.[0].type, "image");

    runtime.binding = {
      channelConnectionId: "conn-max", conversationId: conversation.id, id: "binding-1", internalMessageId: "agent-message-1",
      provider: "max", providerConversationId: "501", providerMessageId: "provider-mid-7", status: "sent", tenantId: "tenant-a"
    };
    const read = await receive(runtime, "MAX", {
      message: { body: { mid: "provider-mid-7" } }, timestamp: 777, update_type: "message_read"
    }, { "x-max-bot-api-secret": "max-secret" }) as Record<string, any>;
    const lateDelivered = await receive(runtime, "MAX", {
      message: { body: { mid: "provider-mid-7" } }, timestamp: 778, update_type: "message_delivered"
    }, { "x-max-bot-api-secret": "max-secret" }) as Record<string, any>;
    assert.equal(read.data.status, "read");
    assert.equal(lateDelivered.data.status, "delivered");
    assert.equal(runtime.binding.status, "read");
    assert.equal((await runtime.conversations.listDeliveryReceipts({ tenantId: "tenant-a" })).length, 2);
  });
});

function providerRuntime(provider: "max" | "vk", connectionId: string, secret: string, confirmation?: string) {
  process.env.PROVIDER_CREDENTIAL_MASTER_KEY = masterKey;
  const crypto = ProviderConnectionCrypto.fromEnvironment("test-v1");
  const integrations = IntegrationRepository.inMemory();
  const conversations = ConversationRepository.inMemory();
  integrations.saveChannelConnection({
    chatLimit: 8, createdAt: new Date().toISOString(), credentialsMasked: true, environment: "test", health: 100,
    id: connectionId, lastSyncAt: new Date().toISOString(), name: provider, rawExternalId: `${provider}:test`,
    routingQueueId: provider.toUpperCase(), status: "active", tenantId: "tenant-a", traffic: "0 events", type: provider,
    updatedAt: new Date().toISOString(), webhookUrl: `https://example.test/${provider}/${connectionId}`
  });
  const credential: ProviderConnectionCredentialRecord = {
    accessTokenEncrypted: JSON.stringify(crypto.encrypt("token")), apiVersion: provider === "vk" ? "5.199" : null,
    channelConnectionId: connectionId, confirmationCodeEncrypted: confirmation ? JSON.stringify(crypto.encrypt(confirmation)) : null,
    createdAt: new Date().toISOString(), externalAccountId: "account", keyVersion: "test-v1", lastError: null,
    lastWebhookAt: null, provider, status: "active", tenantId: "tenant-a", updatedAt: new Date().toISOString(),
    webhookSecretEncrypted: JSON.stringify(crypto.encrypt(secret))
  };
  integrations.saveProviderConnectionCredential(credential);
  const runtime: any = { binding: null, conversations, integrations, service: new ConversationService(conversations) };
  runtime.providerMessageBindings = {
    find: async (_tenantId: string, _connectionId: string, providerMessageId: string) => runtime.binding?.providerMessageId === providerMessageId ? runtime.binding : null,
    advance: async (binding: Record<string, any>, status: string) => {
      const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };
      if ((rank[status] ?? 0) > (rank[binding.status] ?? 0)) binding.status = status;
      return binding;
    }
  };
  return runtime;
}

function receive(runtime: ReturnType<typeof providerRuntime>, channel: "MAX" | "VK", body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return handleProviderWebhookFromRoute({
    body, channel, channelConnectionId: channel === "VK" ? "conn-vk" : "conn-max",
    conversationRepository: runtime.conversations, conversationService: runtime.service,
    headers, integrationRepository: runtime.integrations, providerMessageBindings: runtime.providerMessageBindings
  });
}
