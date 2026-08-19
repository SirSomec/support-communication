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
    const first = await receive(runtime, "VK", body);
    const replay = await receive(runtime, "VK", body);
    assert.equal(first, "ok");
    assert.equal(replay, "ok");
    assert.equal((await runtime.conversations.listConversations({ tenantId: "tenant-a" })).length, 1);
  });

  it("uses the VK public profile name when the resolver returns it", async () => {
    const runtime = providerRuntime("vk", "conn-vk", "vk-secret", "vk-confirm");
    runtime.resolveVkUserProfile = async () => ({ displayName: "Анна Иванова" });
    await receive(runtime, "VK", {
      event_id: "vk-profile-1",
      object: { message: { from_id: 77, id: 12, peer_id: 77, text: "Hello" } },
      secret: "vk-secret",
      type: "message_new"
    });

    assert.equal((await runtime.conversations.listConversations({ tenantId: "tenant-a" }))[0]?.name, "Анна Иванова");
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

  it("runs a configured bot runtime for both MAX and VK inbound messages", async () => {
    const max = providerRuntime("max", "conn-max", "max-secret");
    const vk = providerRuntime("vk", "conn-vk", "vk-secret", "vk-confirm");
    const events: Array<Record<string, unknown>> = [];
    max.runBotRuntime = async (event: Record<string, unknown>) => { events.push(event); return { instance: { status: "completed" }, outcome: "replied" }; };
    vk.runBotRuntime = max.runBotRuntime;

    await receive(max, "MAX", {
      message: { body: { mid: "max-bot-1", text: "MAX hello" }, recipient: { chat_id: 501 }, sender: { user_id: 91 } },
      update_type: "message_created"
    }, { "x-max-bot-api-secret": "max-secret" });
    await receive(vk, "VK", {
      event_id: "vk-bot-1", object: { message: { from_id: 77, id: 12, peer_id: 77, text: "VK hello" } }, secret: "vk-secret", type: "message_new"
    });

    assert.deepEqual(events.map((event) => event.channel), ["MAX", "VK"]);
    assert.deepEqual(events.map((event) => event.payload), [
      { isNewConversation: true, text: "MAX hello" },
      { isNewConversation: true, text: "VK hello" }
    ]);
  });

  it("asks for a phone in VK and MAX, then saves a phone sent as text without rerunning the bot", async () => {
    for (const channel of ["MAX", "VK"] as const) {
      const runtime = channel === "MAX"
        ? providerRuntime("max", "conn-max", "max-secret")
        : providerRuntime("vk", "conn-vk", "vk-secret", "vk-confirm");
      runtime.phoneCollectionEnabled = true;
      const botEvents: Array<Record<string, unknown>> = [];
      runtime.runBotRuntime = async (event: Record<string, unknown>) => {
        botEvents.push(event);
        return { instance: { status: "active" }, outcome: "replied" };
      };
      const headers = channel === "MAX" ? { "x-max-bot-api-secret": "max-secret" } : {};
      const first = channel === "MAX"
        ? { message: { body: { mid: "max-phone-1", text: "Help" }, recipient: { chat_id: 888 }, sender: { user_id: 91 } }, update_type: "message_created" }
        : { event_id: "vk-phone-1", object: { message: { from_id: 77, id: 1, peer_id: 888, text: "Help" } }, secret: "vk-secret", type: "message_new" };
      await receive(runtime, channel, first, headers);
      const conversation = (await runtime.conversations.listConversations({ tenantId: "tenant-a" }))[0];
      assert.ok(conversation.messages.some((message: { text: string }) => message.text.includes("номер телефона")));

      const phoneReply = channel === "MAX"
        ? { message: { body: { mid: "max-phone-2", text: "+7 999 555-66-77" }, recipient: { chat_id: 888 }, sender: { user_id: 91 } }, update_type: "message_created" }
        : { event_id: "vk-phone-2", object: { message: { from_id: 77, id: 2, peer_id: 888, text: "Телефон: +7 999 555-66-77" } }, secret: "vk-secret", type: "message_new" };
      await receive(runtime, channel, phoneReply, headers);

      assert.equal((await runtime.conversations.findConversation(conversation.id))?.phone, "+7 999 555-66-77");
      assert.equal(botEvents.length, 1);
    }
  });

  it("records a MAX CSAT callback and requires an explicit feedback action", async () => {
    const runtime = providerRuntime("max", "conn-max", "max-secret");
    const first = await receive(runtime, "MAX", {
      message: { body: { mid: "max-csat-1", text: "Help" }, recipient: { chat_id: 601 }, sender: { name: "Client", user_id: 92 } },
      update_type: "message_created"
    }, { "x-max-bot-api-secret": "max-secret" });
    assert.equal(first.status, "ok");
    const conversation = (await runtime.conversations.listConversations({ tenantId: "tenant-a" }))[0];
    await runtime.conversations.saveConversation({ ...conversation, operatorId: "operator-1", status: "closed" });
    runtime.recordQualityRating = async (payload: Record<string, unknown>) => {
      runtime.ratings.push(payload);
      return { status: "ok", data: { ratingId: "max-rating-1" } };
    };

    const rated = await receive(runtime, "MAX", {
      updates: [{
        callback: {
          callback_id: "max-callback-1",
          message: { recipient: { chat_id: 601 }, sender: { name: "Client", user_id: 92 } },
          payload: "quality:csat:5"
        },
        update_type: "message_callback"
      }]
    }, { "x-max-bot-api-secret": "max-secret" });
    assert.equal(rated.data.processed, 1);
    assert.deepEqual(runtime.ratings[0], {
      channel: "MAX", clientId: "92", conversationId: conversation.id,
      idempotencyKey: "max:conn-max:max-callback-1", operator: "operator-1", scale: "CSAT", score: 5, topic: conversation.topic
    });
    assert.equal((await runtime.conversations.findConversation(conversation.id))?.metadata?.csatFeedback?.state, "offered");

    const feedback = await receive(runtime, "MAX", {
      message: { body: { mid: "max-csat-feedback", text: "Спасибо" }, recipient: { chat_id: 601 }, sender: { name: "Client", user_id: 92 } },
      update_type: "message_created"
    }, { "x-max-bot-api-secret": "max-secret" });
    assert.equal(feedback.data.recordedAsFeedback, false);
    assert.notEqual(feedback.data.conversationId, conversation.id);
  });

  it("records a VK CSAT callback and offers the feedback flow", async () => {
    const runtime = providerRuntime("vk", "conn-vk", "vk-secret", "vk-confirm");
    await receive(runtime, "VK", {
      event_id: "vk-csat-message", object: { message: { from_id: 77, id: 12, peer_id: 701, text: "Help" } }, secret: "vk-secret", type: "message_new"
    });
    const conversation = (await runtime.conversations.listConversations({ tenantId: "tenant-a" }))[0];
    await runtime.conversations.saveConversation({ ...conversation, operatorId: "operator-1", status: "closed" });
    runtime.recordQualityRating = async (payload: Record<string, unknown>) => {
      runtime.ratings.push(payload);
      return { status: "ok", data: { ratingId: "vk-rating-1" } };
    };
    const messages: Array<Record<string, unknown>> = [];
    const answers: Array<Record<string, unknown>> = [];
    runtime.sendVkMessage = async (input: Record<string, unknown>) => { messages.push(input); return true; };
    runtime.answerVkMessageEvent = async (input: Record<string, unknown>) => { answers.push(input); return true; };

    const rated = await receive(runtime, "VK", {
      event_id: "vk-csat-event", object: { event_id: "vk-callback-1", peer_id: 701, payload: { callback: "quality:csat:4" }, user_id: 77 }, secret: "vk-secret", type: "message_event"
    });
    assert.equal(rated, "ok");
    assert.deepEqual(runtime.ratings[0], {
      channel: "VK", clientId: "77", conversationId: conversation.id,
      idempotencyKey: "vk:conn-vk:vk-callback-1", operator: "operator-1", scale: "CSAT", score: 4, topic: conversation.topic
    });
    assert.equal((await runtime.conversations.findConversation(conversation.id))?.metadata?.csatFeedback?.state, "offered");
    assert.equal(messages[0]?.peerId, "701");
    assert.equal((messages[0]?.keyboard as any)?.inline, true);
    assert.deepEqual(answers[0], {
      accessToken: "token", apiVersion: "5.199", eventId: "vk-callback-1", peerId: "701", text: "Спасибо за оценку!", userId: "77"
    });
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
  const runtime: any = { answerMaxCallback: async () => true, answerVkMessageEvent: async () => true, binding: null, conversations, integrations, phoneCollectionEnabled: false, ratings: [], recordQualityRating: undefined, resolveVkUserProfile: undefined, runBotRuntime: undefined, sendVkMessage: undefined, service: new ConversationService(conversations) };
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
    headers, integrationRepository: runtime.integrations, providerMessageBindings: runtime.providerMessageBindings,
    answerMaxCallback: runtime.answerMaxCallback, answerVkMessageEvent: runtime.answerVkMessageEvent, phoneCollectionEnabled: runtime.phoneCollectionEnabled, recordQualityRating: runtime.recordQualityRating, resolveVkUserProfile: runtime.resolveVkUserProfile, runBotRuntime: runtime.runBotRuntime, sendVkMessage: runtime.sendVkMessage
  });
}
