import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory, type INestApplication } from "@nestjs/core";
import { ConversationRepository } from "../apps/api-gateway/dist/conversation/conversation.repository.js";
import { ConversationService } from "../apps/api-gateway/dist/conversation/conversation.service.js";
import { IdentityRepository } from "../apps/api-gateway/dist/identity/identity.repository.js";
import { OpenChannelRepository } from "../apps/api-gateway/dist/integrations/open-channel/open-channel.repository.js";
import {
  OPEN_CHAT_CHANNEL,
  handleOpenChatInbound,
  handleOpenChatStatus
} from "../apps/api-gateway/dist/integrations/open-channel/open-chat.route.js";
import {
  ExternalBotBridge,
  externalBotMessageText,
  handleExternalBotProviderEvent
} from "../apps/api-gateway/dist/integrations/open-channel/external-bot.route.js";
import { OpenChannelDeliveryService } from "../apps/api-gateway/dist/integrations/open-channel/open-channel-delivery.service.js";
import { OpenChannelEventPump } from "../apps/api-gateway/dist/integrations/open-channel/open-channel-event-pump.js";
import { handleWidgetClientInfoFromRoute } from "../apps/api-gateway/dist/integrations/open-channel/client-info.route.js";
import { stableNumericId } from "../apps/api-gateway/dist/integrations/open-channel/open-channel-payload.js";
import { OpenChannelModule } from "../apps/api-gateway/dist/integrations/open-channel/open-channel.module.js";
import { EnvelopeHttpExceptionFilter } from "../apps/api-gateway/dist/http-exception.filter.js";
import { hashPublicApiKeySecret } from "../apps/api-gateway/dist/integrations/public-api-auth.js";

const TENANT_ID = "tenant-open-channel";
const CHANNEL_TOKEN = "oc_contract_token_1";
const FAR_FUTURE = "2099-01-01T00:00:00.000Z";

before(() => {
  process.env.NODE_ENV = "test";
  process.env.API_VERSION = "v1";
  process.env.DATABASE_URL = "https://example.invalid/database";
  process.env.REDIS_URL = "https://example.invalid/redis";
  process.env.S3_ENDPOINT = "https://example.invalid/s3";
  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_ACCESS_KEY = "test-access-key";
  process.env.S3_SECRET_KEY = "test-secret-key";
});

function openChannelRuntime() {
  const repository = OpenChannelRepository.inMemory();
  repository.saveChatChannel({
    createdAt: new Date().toISOString(),
    id: "och-contract-1",
    name: "Contract channel",
    outboundUrl: "https://customer.example/events",
    status: "active",
    tenantId: TENANT_ID,
    token: CHANNEL_TOKEN,
    updatedAt: new Date().toISOString()
  });
  const conversations = ConversationRepository.inMemory();
  const service = new ConversationService(conversations);
  return { conversations, repository, service };
}

function deliveryCapture() {
  const enqueued: Array<Record<string, unknown>> = [];
  return {
    enqueue(input: Record<string, unknown>) {
      enqueued.push(input);
      return input;
    },
    enqueued
  };
}

async function receiveChatEvent(runtime: ReturnType<typeof openChannelRuntime>, body: Record<string, unknown>, token = CHANNEL_TOKEN) {
  return handleOpenChatInbound({
    body,
    channelToken: token,
    conversationRepository: runtime.conversations,
    conversationService: runtime.service,
    repository: runtime.repository
  });
}

async function mutateConversation(
  conversations: InstanceType<typeof ConversationRepository>,
  conversationId: string,
  patch: Record<string, unknown>,
  realtimeData: Record<string, unknown>,
  eventName = "conversation.updated"
) {
  const conversation = await conversations.findConversation(conversationId);
  assert.ok(conversation, `conversation ${conversationId} must exist`);
  Object.assign(conversation, patch);
  const occurredAt = new Date().toISOString();
  const eventId = `rt_test_${Math.random().toString(36).slice(2)}`;
  await conversations.saveConversationMutation({
    conversation,
    lifecycleEvent: {
      actorId: null,
      actorName: null,
      actorType: "operator",
      conversationId,
      data: realtimeData,
      eventType: eventName,
      id: `lifecycle_${eventId}`,
      ingestedAt: occurredAt,
      occurredAt,
      reason: null,
      schemaVersion: "conversation-lifecycle/v1",
      source: "contract-test",
      sourceEventId: eventId,
      tenantId: TENANT_ID,
      traceId: `trace-${eventId}`
    },
    realtimeEvent: {
      data: realtimeData,
      eventId,
      eventName,
      occurredAt,
      resourceId: conversationId,
      resourceType: "conversation",
      schemaVersion: "v1",
      tenantId: TENANT_ID,
      traceId: `trace-${eventId}`
    }
  });
  return conversation;
}

describe("open channel chat ingress", () => {
  it("accepts a text event, dedupes by message id and reports channel status", async () => {
    const runtime = openChannelRuntime();
    const event = {
      sender: { id: "client-1", name: "Иван Иванович", email: "ivan@example.com", url: "https://example.com/page" },
      message: { type: "text", id: "m-1", text: "Добрый день!" }
    };

    const first = await receiveChatEvent(runtime, event);
    assert.equal(first.statusCode, 200);
    assert.equal((first.body as Record<string, unknown>).result, "ok");

    const replay = await receiveChatEvent(runtime, event);
    assert.equal((replay.body as Record<string, unknown>).duplicate, true);

    const conversations = await runtime.conversations.listConversations({ tenantId: TENANT_ID });
    const dialog = conversations.find((item) => item.tenantId === TENANT_ID);
    assert.ok(dialog);
    assert.equal(dialog.channel, OPEN_CHAT_CHANNEL);
    assert.equal(dialog.name, "Иван Иванович");
    assert.equal(dialog.messages.filter((message) => message.side === "client").length, 1);

    const status = await handleOpenChatStatus({
      channelToken: CHANNEL_TOKEN,
      conversationRepository: runtime.conversations,
      repository: runtime.repository
    });
    assert.equal(status.body, "1");
  });

  it("acknowledges a chat message without waiting for bot generation", async () => {
    const runtime = openChannelRuntime();
    let botRuns = 0;
    let resolveBot!: () => void;
    const slowBot = new Promise<{ instance: { status: string } }>((resolve) => {
      resolveBot = () => resolve({ instance: { status: "active" } });
    });

    const result = await handleOpenChatInbound({
      body: { sender: { id: "client-async" }, message: { type: "text", id: "async-1", text: "Hello" } },
      channelToken: CHANNEL_TOKEN,
      conversationRepository: runtime.conversations,
      conversationService: runtime.service,
      repository: runtime.repository,
      runBotRuntime: async () => {
        botRuns += 1;
        return slowBot;
      }
    });

    assert.equal(result.statusCode, 200);
    assert.deepEqual((result.body as Record<string, unknown>).botRuntime, { outcome: null, status: "queued" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(botRuns, 1);
    resolveBot();
  });

  it("rejects unknown channel tokens with a plain 404", async () => {
    const runtime = openChannelRuntime();
    const denied = await receiveChatEvent(runtime, { sender: { id: "x" }, message: { type: "text", text: "hi" } }, "missing-token");
    assert.equal(denied.statusCode, 404);
    assert.equal(denied.contentType.startsWith("text/plain"), true);
  });

  it("maps media events to attachments and closes the dialog on stop", async () => {
    const runtime = openChannelRuntime();
    await receiveChatEvent(runtime, {
      sender: { id: "client-2" },
      message: {
        type: "photo", id: "p-1", file: "https://example.com/image.png",
        file_name: "image.png", file_size: 1024, mime_type: "image/png"
      }
    });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];
    const media = conversation.messages.find((message) => message.side === "client");
    assert.ok(media?.attachments?.length);
    assert.equal(media.attachments[0].fileName, "image.png");
    assert.equal(media.text.includes("https://example.com/image.png"), true);

    const stop = await receiveChatEvent(runtime, { sender: { id: "client-2" }, message: { type: "stop" } });
    assert.equal(stop.statusCode, 200);
    const closed = await runtime.conversations.findConversation(conversation.id);
    assert.equal(closed?.status, "closed");

    const status = await handleOpenChatStatus({
      channelToken: CHANNEL_TOKEN,
      conversationRepository: runtime.conversations,
      repository: runtime.repository
    });
    assert.equal(status.body, "0");
  });

  it("records a CSAT rating from a rate event when an operator is assigned", async () => {
    const runtime = openChannelRuntime();
    await receiveChatEvent(runtime, { sender: { id: "client-3" }, message: { type: "text", id: "m-3", text: "Вопрос" } });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];
    await mutateConversation(runtime.conversations, conversation.id, { operatorId: "op-1", status: "assigned" }, { action: "assignment" });

    const ratings: Array<Record<string, unknown>> = [];
    const rate = await handleOpenChatInbound({
      body: { sender: { id: "client-3" }, message: { type: "rate", id: "r-1", value: 1 } },
      channelToken: CHANNEL_TOKEN,
      conversationRepository: runtime.conversations,
      conversationService: runtime.service,
      recordQualityRating: async (payload) => {
        ratings.push(payload as Record<string, unknown>);
        return { status: "ok" };
      },
      repository: runtime.repository
    });
    assert.equal(rate.statusCode, 200);
    assert.equal(ratings.length, 1);
    assert.equal(ratings[0].scale, "CSAT");
    assert.equal(ratings[0].score, 5);
  });
});

describe("external bot exchange", () => {
  it("forwards a client message to the provider with the wire fields", async () => {
    const runtime = openChannelRuntime();
    runtime.repository.saveBotConnection({
      channels: null,
      createdAt: new Date().toISOString(),
      id: "xbc-1",
      name: "Contract bot",
      providerUrl: "https://bot.example/hooks",
      status: "active",
      tenantId: TENANT_ID,
      token: "xb_token_1",
      updatedAt: new Date().toISOString()
    });
    await receiveChatEvent(runtime, { sender: { id: "client-9" }, message: { type: "text", id: "m-9", text: "Привет" } });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];

    const delivery = deliveryCapture();
    const bridge = new ExternalBotBridge({
      agentsOnline: () => true,
      delivery,
      repository: runtime.repository
    });
    const handled = await bridge.forwardClientMessage({
      channel: OPEN_CHAT_CHANNEL,
      clientId: "client-9",
      conversation,
      tenantId: TENANT_ID,
      text: "Привет"
    });
    assert.equal(handled, true);
    assert.equal(delivery.enqueued.length, 1);
    const body = delivery.enqueued[0].body as Record<string, unknown>;
    assert.equal(delivery.enqueued[0].url, "https://bot.example/hooks/xb_token_1");
    assert.equal(body.event, "CLIENT_MESSAGE");
    assert.equal(body.chat_id, String(stableNumericId(conversation.id)));
    assert.equal(body.client_id, "client-9");
    assert.equal(body.agents_online, true);
    assert.equal((body.message as Record<string, unknown>).type, "TEXT");

    const assigned = { ...conversation, operatorId: "op-1" };
    assert.equal(await bridge.forwardClientMessage({
      channel: OPEN_CHAT_CHANNEL,
      clientId: "client-9",
      conversation: assigned,
      tenantId: TENANT_ID,
      text: "Ещё"
    }), false);
  });

  it("authenticates provider events and appends bot replies to the dialog", async () => {
    const runtime = openChannelRuntime();
    runtime.repository.saveBotConnection({
      channels: null,
      createdAt: new Date().toISOString(),
      id: "xbc-2",
      name: "Contract bot",
      providerUrl: "https://bot.example/hooks",
      status: "active",
      tenantId: TENANT_ID,
      token: "xb_token_2",
      updatedAt: new Date().toISOString()
    });
    await receiveChatEvent(runtime, { sender: { id: "client-10" }, message: { type: "text", id: "m-10", text: "Здравствуйте" } });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];
    runtime.repository.mergeConversationState({
      botState: "active",
      clientId: "client-10",
      conversationId: conversation.id,
      tenantId: TENANT_ID
    });

    const wrongToken = await handleExternalBotProviderEvent({
      body: { event: "BOT_MESSAGE", client_id: "client-10", message: { type: "TEXT", text: "hi" } },
      connectionId: "xbc-2",
      conversationRepository: runtime.conversations,
      repository: runtime.repository,
      token: "wrong"
    });
    assert.equal(wrongToken.statusCode, 401);
    assert.equal((wrongToken.body.error as Record<string, unknown>).code, "invalid_client");

    const botMessage = await handleExternalBotProviderEvent({
      body: {
        chat_id: String(stableNumericId(conversation.id)),
        client_id: "client-10",
        event: "BOT_MESSAGE",
        id: "evt-1",
        message: { type: "BUTTONS", title: "Доставка в пределах МКАД?", text: "Да / Нет", buttons: [{ text: "Да", id: 1 }, { text: "Нет", id: 2 }] }
      },
      connectionId: "xbc-2",
      conversationRepository: runtime.conversations,
      repository: runtime.repository,
      token: "xb_token_2"
    });
    assert.equal(botMessage.statusCode, 200);
    const updated = await runtime.conversations.findConversation(conversation.id);
    const reply = updated?.messages.find((message) => message.side === "agent");
    assert.ok(reply);
    assert.equal(reply.text.includes("Доставка в пределах МКАД?"), true);
    assert.equal(reply.text.includes("1) Да"), true);
    assert.equal(String(reply.author).includes("Contract bot"), true);
  });

  it("keeps the bot active and notifies the provider when no agent is available", async () => {
    const runtime = openChannelRuntime();
    runtime.repository.saveBotConnection({
      channels: null,
      createdAt: new Date().toISOString(),
      id: "xbc-3",
      name: "Contract bot",
      providerUrl: "https://bot.example/hooks",
      status: "active",
      tenantId: TENANT_ID,
      token: "xb_token_3",
      updatedAt: new Date().toISOString()
    });
    await receiveChatEvent(runtime, { sender: { id: "client-11" }, message: { type: "text", id: "m-11", text: "Оператора!" } });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];
    runtime.repository.mergeConversationState({
      attributes: { externalBotConnectionId: "xbc-9" },
      botState: "active",
      clientId: "client-11",
      conversationId: conversation.id,
      tenantId: TENANT_ID
    });

    const delivery = deliveryCapture();
    const bridge = new ExternalBotBridge({ delivery, repository: runtime.repository });
    const invite = await handleExternalBotProviderEvent({
      autoAssignConversation: async () => ({ status: "invalid" }),
      body: { client_id: "client-11", event: "INVITE_AGENT", id: "evt-2" },
      bridge,
      connectionId: "xbc-3",
      conversationRepository: runtime.conversations,
      repository: runtime.repository,
      token: "xb_token_3"
    });
    assert.equal(invite.statusCode, 200);
    assert.equal(delivery.enqueued.length, 1);
    assert.equal((delivery.enqueued[0].body as Record<string, unknown>).event, "AGENT_UNAVAILABLE");
    assert.equal(runtime.repository.findConversationState(conversation.id)?.botState, "active");
  });

  it("renders provider message payloads into transcript text", () => {
    assert.equal(externalBotMessageText({ type: "MARKDOWN", content: "**Жирный**", text: "Жирный" }), "Жирный");
    assert.equal(externalBotMessageText({ type: "PHOTO", file: "https://cdn.example/i.png" }), "https://cdn.example/i.png");
    assert.equal(externalBotMessageText({ type: "LOCATION", latitude: 53.34, longitude: -6.28 }), "Location: 53.34,-6.28");
    assert.equal(externalBotMessageText({ type: "UNSUPPORTED" }), "");
  });
});

describe("open channel delivery queue", () => {
  it("retries transient failures and dead-letters after the attempt budget", async () => {
    const repository = OpenChannelRepository.inMemory();
    const responses = [
      { ok: false, status: 502, text: async () => "bad gateway" },
      { ok: false, status: 503, text: async () => "unavailable" },
      { ok: false, status: 504, text: async () => "gateway timeout" }
    ];
    let calls = 0;
    const service = new OpenChannelDeliveryService({
      fetcher: async () => responses[Math.min(calls++, responses.length - 1)],
      repository,
      resolveHostname: async () => [{ address: "93.184.216.34" }]
    });

    service.enqueue({
      body: { event: "CLIENT_MESSAGE" },
      eventName: "CLIENT_MESSAGE",
      kind: "bot_event",
      tenantId: TENANT_ID,
      url: "https://bot.example/hooks/token"
    });

    // Each pass runs later than the previous retry backoff window.
    const base = Date.now();
    const passAt = (minutes: number) => new Date(base + minutes * 60_000).toISOString();
    const first = await service.runOnce(passAt(1));
    assert.deepEqual({ delivered: first.delivered, retryScheduled: first.retryScheduled }, { delivered: 0, retryScheduled: 1 });
    const second = await service.runOnce(passAt(10));
    assert.equal(second.retryScheduled, 1);
    const third = await service.runOnce(passAt(30));
    assert.equal(third.deadLettered, 1);
    assert.equal(repository.listDeliveries({ status: "dead_lettered" }).length, 1);
    assert.equal(calls, 3);
  });

  it("dead-letters permanent 4xx responses without retrying", async () => {
    const repository = OpenChannelRepository.inMemory();
    const service = new OpenChannelDeliveryService({
      fetcher: async () => ({ ok: false, status: 400, text: async () => "bad request" }),
      repository,
      resolveHostname: async () => [{ address: "93.184.216.34" }]
    });
    service.enqueue({
      body: { event_name: "chat_finished" },
      eventName: "chat_finished",
      kind: "webhook",
      tenantId: TENANT_ID,
      url: "https://customer.example/webhook"
    });
    const run = await service.runOnce(FAR_FUTURE);
    assert.equal(run.deadLettered, 1);
    assert.equal(repository.listDeliveries({ status: "pending" }).length, 0);
  });

  it("applies chat_accepted response enrichment to the dialog", async () => {
    const runtime = openChannelRuntime();
    await receiveChatEvent(runtime, { sender: { id: "client-20" }, message: { type: "text", id: "m-20", text: "Кто я?" } });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];

    const service = new OpenChannelDeliveryService({
      conversationRepository: runtime.conversations,
      fetcher: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          result: "ok",
          contact_info: { name: "Пётр Петров", phone: "+79990001122", email: "petr@example.com" },
          custom_data: [{ title: "LTV", content: "42000" }],
          crm_link: "https://crm.example/clients/1"
        })
      }),
      repository: runtime.repository,
      resolveHostname: async () => [{ address: "93.184.216.34" }]
    });
    service.enqueue({
      body: { event_name: "chat_accepted" },
      conversationId: conversation.id,
      eventName: "chat_accepted",
      kind: "webhook",
      tenantId: TENANT_ID,
      url: "https://customer.example/webhook"
    });
    const run = await service.runOnce(FAR_FUTURE);
    assert.equal(run.delivered, 1);

    const enriched = await runtime.conversations.findConversation(conversation.id);
    assert.equal(enriched?.name, "Пётр Петров");
    assert.equal(enriched?.phone, "+79990001122");
    const note = enriched?.messages.find((message) => message.type === "event" && message.text.includes("LTV"));
    assert.ok(note);
    assert.equal(note.text.includes("https://crm.example/clients/1"), true);
  });
});

describe("open channel event pump", () => {
  it("emits chat_accepted and chat_finished webhooks and closes the external bot", async () => {
    const runtime = openChannelRuntime();
    runtime.repository.saveWebhookSubscription({
      createdAt: new Date().toISOString(),
      events: null,
      id: "owh-1",
      status: "active",
      tenantId: TENANT_ID,
      updatedAt: new Date().toISOString(),
      url: "https://customer.example/webhook"
    });
    runtime.repository.saveBotConnection({
      channels: null,
      createdAt: new Date().toISOString(),
      id: "xbc-9",
      name: "Contract bot",
      providerUrl: "https://bot.example/hooks",
      status: "active",
      tenantId: TENANT_ID,
      token: "xb_token_9",
      updatedAt: new Date().toISOString()
    });
    await receiveChatEvent(runtime, {
      sender: { id: "client-30", name: "Клиент Тридцатый" },
      message: { type: "text", id: "m-30", text: "Мне нужна помощь" }
    });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];
    runtime.repository.mergeConversationState({
      attributes: { externalBotConnectionId: "xbc-9" },
      botState: "active",
      clientId: "client-30",
      conversationId: conversation.id,
      tenantId: TENANT_ID
    });

    const delivery = deliveryCapture();
    const pump = new OpenChannelEventPump({
      botBridge: new ExternalBotBridge({ delivery, repository: runtime.repository }),
      conversationRepository: runtime.conversations,
      delivery,
      repository: runtime.repository
    });

    await mutateConversation(runtime.conversations, conversation.id,
      { operatorId: "op-9", operatorName: "Мария", status: "assigned" },
      { action: "assignment", toOperatorId: "op-9" });
    await pump.runOnce();

    const accepted = delivery.enqueued.find((item) => item.eventName === "chat_accepted");
    assert.ok(accepted, "chat_accepted must be enqueued");
    const acceptedBody = accepted.body as Record<string, unknown>;
    assert.equal(acceptedBody.event_name, "chat_accepted");
    assert.equal(acceptedBody.chat_id, stableNumericId(conversation.id));
    assert.equal((acceptedBody.visitor as Record<string, unknown>).name, "Клиент Тридцатый");
    assert.equal((acceptedBody.agent as Record<string, unknown>).id, "op-9");
    const botClosed = delivery.enqueued.find((item) => item.eventName === "CHAT_CLOSED");
    assert.ok(botClosed, "CHAT_CLOSED must be sent to the bot provider");
    assert.equal(runtime.repository.findConversationState(conversation.id)?.botState, "closed");

    await mutateConversation(runtime.conversations, conversation.id,
      { status: "closed" },
      { fromStatus: "assigned", toStatus: "closed" });
    await pump.runOnce();

    const finished = delivery.enqueued.find((item) => item.eventName === "chat_finished");
    assert.ok(finished, "chat_finished must be enqueued");
    const finishedBody = finished.body as Record<string, unknown>;
    const chat = finishedBody.chat as Record<string, unknown>;
    assert.equal(Array.isArray(chat.messages), true);
    assert.equal((chat.messages as Array<Record<string, unknown>>)[0].type, "visitor");
    assert.equal(typeof finishedBody.plain_messages, "string");

    const before = delivery.enqueued.length;
    await pump.runOnce();
    assert.equal(delivery.enqueued.length, before, "cursor must prevent replays");
  });

  it("delivers agent replies to the customer server for open-channel dialogs", async () => {
    const runtime = openChannelRuntime();
    await receiveChatEvent(runtime, { sender: { id: "client-31" }, message: { type: "text", id: "m-31", text: "Жду ответа" } });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];

    const delivery = deliveryCapture();
    const pump = new OpenChannelEventPump({
      conversationRepository: runtime.conversations,
      delivery,
      repository: runtime.repository
    });
    await pump.runOnce();
    assert.equal(delivery.enqueued.length, 0, "client messages must not echo back");

    const withReply = await runtime.conversations.findConversation(conversation.id);
    withReply!.messages.push({
      author: "Мария",
      createdAt: new Date().toISOString(),
      id: "agent-m-1",
      side: "agent",
      text: "Здравствуйте! Смотрю ваш вопрос.",
      time: "now"
    });
    await mutateConversation(runtime.conversations, conversation.id, { messages: withReply!.messages }, { messageId: "agent-m-1", mode: "reply" }, "message.created");
    await pump.runOnce();

    const chatEvent = delivery.enqueued.find((item) => item.kind === "chat_event");
    assert.ok(chatEvent, "agent reply must be delivered to the customer server");
    assert.equal(chatEvent.url, "https://customer.example/events");
    const body = chatEvent.body as Record<string, unknown>;
    assert.equal((body.recipient as Record<string, unknown>).id, "client-31");
    assert.equal((body.message as Record<string, unknown>).type, "text");
    assert.equal((body.message as Record<string, unknown>).text, "Здравствуйте! Смотрю ваш вопрос.");
    assert.equal((body.sender as Record<string, unknown>).name, "Мария");
  });

  it("keeps a failed event at the cursor and retries it before later events", async () => {
    const runtime = openChannelRuntime();
    runtime.repository.saveWebhookSubscription({
      createdAt: new Date().toISOString(),
      events: ["chat_accepted"],
      id: "owh-retry",
      status: "active",
      tenantId: TENANT_ID,
      updatedAt: new Date().toISOString(),
      url: "https://customer.example/retry"
    });
    await receiveChatEvent(runtime, { sender: { id: "client-retry" }, message: { type: "text", id: "m-retry", text: "Retry" } });
    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];
    let shouldFail = true;
    const enqueued: Array<Record<string, unknown>> = [];
    const pump = new OpenChannelEventPump({
      conversationRepository: runtime.conversations,
      delivery: {
        enqueue: async (input) => {
          if (shouldFail) throw new Error("temporary_delivery_failure");
          enqueued.push(input);
          return {} as never;
        }
      },
      repository: runtime.repository
    });

    await pump.runOnce();
    const cursorBeforeFailure = await runtime.repository.readPumpCursor();
    await mutateConversation(runtime.conversations, conversation.id,
      { operatorId: "op-retry", operatorName: "Retry Agent", status: "assigned" },
      { action: "assignment", toOperatorId: "op-retry" });
    await pump.runOnce();
    assert.deepEqual((await runtime.repository.readPumpCursor()).seenEventIds, cursorBeforeFailure.seenEventIds);
    shouldFail = false;
    await pump.runOnce();
    assert.equal(enqueued.filter((item) => item.eventName === "chat_accepted").length, 1);
    assert.equal((await runtime.repository.readPumpCursor()).seenEventIds.length, cursorBeforeFailure.seenEventIds.length + 1);
  });

  it("coalesces overlapping ticks into one journal scan", async () => {
    const repository = OpenChannelRepository.inMemory();
    let scans = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pump = new OpenChannelEventPump({
      conversationRepository: {
        findConversation: async () => undefined,
        listRealtimeEvents: async () => {
          scans += 1;
          await gate;
          return [];
        }
      },
      delivery: { enqueue: async () => ({} as never) },
      repository
    });

    const first = pump.runOnce();
    const second = pump.runOnce();
    release();
    await Promise.all([first, second]);
    assert.equal(scans, 1);
  });

  it("sends CHAT_CLOSED only to the bot connection that owns the dialog", async () => {
    const runtime = openChannelRuntime();
    runtime.repository.saveBotConnection({
      channels: null,
      createdAt: new Date().toISOString(),
      id: "xbc-owner",
      name: "Owner bot",
      providerUrl: "https://owner.example/hooks",
      status: "active",
      tenantId: TENANT_ID,
      token: "owner-token",
      updatedAt: new Date().toISOString()
    });
    runtime.repository.saveBotConnection({
      channels: null,
      createdAt: new Date().toISOString(),
      id: "xbc-other",
      name: "Other bot",
      providerUrl: "https://other.example/hooks",
      status: "active",
      tenantId: TENANT_ID,
      token: "other-token",
      updatedAt: new Date().toISOString()
    });
    runtime.repository.mergeConversationState({
      attributes: { externalBotConnectionId: "xbc-owner" },
      botState: "active",
      clientId: "client-owner",
      conversationId: "conversation-owner",
      tenantId: TENANT_ID
    });
    const delivery = deliveryCapture();
    const bridge = new ExternalBotBridge({ delivery, repository: runtime.repository });

    await bridge.notifyChatClosed({ conversationId: "conversation-owner", tenantId: TENANT_ID });

    assert.equal(delivery.enqueued.length, 1);
    assert.equal(delivery.enqueued[0]?.url, "https://owner.example/hooks/owner-token");
  });
});

describe("widget client info", () => {
  it("updates the client card and emits chat_updated and client_attribute_updated webhooks", async () => {
    const runtime = openChannelRuntime();
    runtime.repository.saveWebhookSubscription({
      createdAt: new Date().toISOString(),
      events: null,
      id: "owh-2",
      status: "active",
      tenantId: TENANT_ID,
      updatedAt: new Date().toISOString(),
      url: "https://customer.example/webhook"
    });
    const keyRecord = {
      channelConnectionId: null,
      environment: "stage" as const,
      keyId: "pak-open-channel",
      scopes: ["conversations:write"],
      secretHash: hashPublicApiKeySecret("sk_test_open_channel"),
      status: "active" as const,
      tenantId: TENANT_ID
    };
    const delivery = deliveryCapture();

    const denied = await handleWidgetClientInfoFromRoute({
      authorization: "Bearer wrong-key",
      body: { externalId: "visitor-42" },
      conversationRepository: runtime.conversations,
      delivery,
      environment: "stage",
      lookup: { listActiveKeys: () => [keyRecord] },
      repository: runtime.repository
    });
    assert.equal(denied.status, "denied");

    const updated = await handleWidgetClientInfoFromRoute({
      authorization: "Bearer sk_test_open_channel",
      body: {
        attributes: { Vozrast: 42 },
        contactInfo: { name: "Анна", phone: "+79995556677", email: "anna@example.com" },
        customData: [{ title: "Баланс", content: "1500 ₽" }],
        externalId: "visitor-42",
        userToken: "user-token-42"
      },
      conversationRepository: runtime.conversations,
      delivery,
      environment: "stage",
      lookup: { listActiveKeys: () => [keyRecord] },
      repository: runtime.repository
    });
    assert.equal(updated.status, "ok");
    assert.equal(typeof updated.data?.visitorNumber, "number");

    const conversation = (await runtime.conversations.listConversations({ tenantId: TENANT_ID }))[0];
    assert.equal(conversation.name, "Анна");
    assert.equal(conversation.phone, "+79995556677");
    const state = runtime.repository.findConversationState(conversation.id);
    assert.equal(state?.userToken, "user-token-42");
    assert.deepEqual(state?.attributes, { Vozrast: 42 });

    const chatUpdated = delivery.enqueued.find((item) => item.eventName === "chat_updated");
    assert.ok(chatUpdated);
    assert.equal((chatUpdated.body as Record<string, unknown>).user_token, "user-token-42");
    const attributeUpdated = delivery.enqueued.find((item) => item.eventName === "client_attribute_updated");
    assert.ok(attributeUpdated);
    assert.deepEqual((attributeUpdated.body as Record<string, unknown>).attributes, { Vozrast: 42 });
  });
});

describe("open channel http surface", () => {
  const apps: INestApplication[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
    OpenChannelRepository.clearDefault();
    ConversationRepository.useDefault(ConversationRepository.inMemory());
    IdentityRepository.useDefault(IdentityRepository.inMemory());
  });

  it("serves the compat endpoints under neutral paths with raw status bodies", async () => {
    process.env.ALLOW_DEMO_SERVICE_ADMIN_HEADERS = "true";
    process.env.DEMO_SERVICE_ADMIN_KEY = "dev-service-admin-key-0001";

    const openChannelRepository = OpenChannelRepository.inMemory();
    openChannelRepository.saveChatChannel({
      createdAt: new Date().toISOString(),
      id: "och-http-1",
      name: "HTTP channel",
      outboundUrl: "",
      status: "active",
      tenantId: TENANT_ID,
      token: CHANNEL_TOKEN,
      updatedAt: new Date().toISOString()
    });
    OpenChannelRepository.useDefault(openChannelRepository);
    ConversationRepository.useDefault(ConversationRepository.inMemory());
    IdentityRepository.useDefault(IdentityRepository.inMemory());

    @Module({ imports: [OpenChannelModule] })
    class OpenChannelHttpTestModule {}

    const app = await NestFactory.create(OpenChannelHttpTestModule, { logger: false });
    apps.push(app);
    app.setGlobalPrefix("api/v1");
    app.useGlobalFilters(new EnvelopeHttpExceptionFilter());
    await app.listen(0);
    const address = app.getHttpServer().address();
    const baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;

    const accepted = await fetch(`${baseUrl}/api/v1/open-channel/${CHANNEL_TOKEN}`, {
      body: JSON.stringify({ sender: { id: "http-client" }, message: { type: "text", id: "h-1", text: "Через HTTP" } }),
      headers: { "content-type": "application/json; charset=utf-8" },
      method: "POST"
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).result, "ok");

    const status = await fetch(`${baseUrl}/api/v1/open-channel/${CHANNEL_TOKEN}/status`);
    assert.equal(status.status, 200);
    assert.equal(await status.text(), "1");

    const missing = await fetch(`${baseUrl}/api/v1/open-channel/unknown-token/status`);
    assert.equal(missing.status, 404);

    const botDenied = await fetch(`${baseUrl}/api/v1/external-bot/webhooks/nope/bad-token`, {
      body: JSON.stringify({ event: "BOT_MESSAGE" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });
    assert.equal(botDenied.status, 401);
    assert.equal((await botDenied.json()).error.code, "invalid_client");
  });
});
