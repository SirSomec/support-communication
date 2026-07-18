import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory, type INestApplication } from "@nestjs/core";
import { ConversationModule } from "../apps/api-gateway/dist/conversation/conversation.module.js";
import { ConversationRepository } from "../apps/api-gateway/dist/conversation/conversation.repository.js";
import { EnvelopeHttpExceptionFilter } from "../apps/api-gateway/dist/http-exception.filter.js";
import { IdentityModule } from "../apps/api-gateway/dist/identity/identity.module.js";
import { IdentityRepository } from "../apps/api-gateway/dist/identity/identity.repository.js";
import { IntegrationModule } from "../apps/api-gateway/dist/integrations/integration.module.js";
import { IntegrationRepository } from "../apps/api-gateway/dist/integrations/integration.repository.js";
import {
  handleTelegramWebhookFromRoute,
  loadTelegramWebhookConfig,
  resolveOrCreateTelegramConversation,
  telegramConversationId
} from "../apps/api-gateway/dist/integrations/telegram-webhook.route.js";
import { ConversationService } from "../apps/api-gateway/dist/conversation/conversation.service.js";

const TENANT_ID = "tenant-pilot-001";
const WEBHOOK_SECRET = "pilot-telegram-secret-token";

@Module({
  imports: [IdentityModule, ConversationModule, IntegrationModule]
})
class TelegramWebhookContractTestModule {}

describe("telegram webhook ingress contracts", () => {
  const apps: INestApplication[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  it("accepts telegram text update and creates a tenant-scoped conversation", async () => {
    const { baseUrl } = await createTestApiApp(apps);

    const response = await postTelegramUpdate(baseUrl, {
      message: {
        chat: { id: 99887766, type: "private" },
        from: { first_name: "Anna", id: 12345, username: "anna_client" },
        message_id: 42,
        text: "Здравствуйте, где мой заказ?"
      },
      update_id: 9001
    });

    assert.equal(response.status, "ok");
    assert.equal(response.data.accepted, true);
    assert.equal(response.data.chatId, "99887766");
    const conversationId = telegramConversationId(TENANT_ID, "123456789", "99887766");
    assert.equal(response.data.conversationId, conversationId);

    const repository = ConversationRepository.default();
    const conversation = await repository.findConversation(conversationId);
    assert.ok(conversation);
    assert.equal(conversation?.channel, "Telegram");
    assert.equal(conversation?.phone, "");
    assert.equal(conversation?.providerConversationId, "99887766");
    assert.equal(conversation?.tenantId, TENANT_ID);

    const lifecycleEvents = await repository.listLifecycleEvents({ conversationId, tenantId: TENANT_ID });
    assert.deepEqual(lifecycleEvents.map((event) => event.eventType).sort(), ["conversation.created", "message.received"].sort());
    const realtimeEvents = (await repository.listRealtimeEvents({ tenantId: TENANT_ID }))
      .filter((event) => event.resourceId === conversationId);
    assert.deepEqual(realtimeEvents.map((event) => event.eventName).sort(), ["conversation.created", "message.created"].sort());
    assert.equal(lifecycleEvents[0]?.sourceEventId, realtimeEvents[0]?.eventId);
    assert.equal(lifecycleEvents[0]?.traceId, realtimeEvents[0]?.traceId);
    assert.equal(lifecycleEvents[1]?.sourceEventId, realtimeEvents[1]?.eventId);
    assert.equal(lifecycleEvents[1]?.traceId, realtimeEvents[1]?.traceId);
    assert.equal(conversation?.messages.at(-1)?.text, "Здравствуйте, где мой заказ?");
  });

  it("rejects telegram webhook when secret token is invalid", async () => {
    const { baseUrl } = await createTestApiApp(apps);

    const response = await postTelegramUpdate(
      baseUrl,
      {
        message: {
          chat: { id: 445566, type: "private" },
          from: { first_name: "Bob", id: 99 },
          message_id: 7,
          text: "test"
        },
        update_id: 9002
      },
      "wrong-secret"
    );

    assert.equal(response.status, "denied");
    assert.equal(response.error?.code, "telegram_webhook_secret_invalid");
  });

  it("deduplicates repeated telegram updates by event id", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);
    const integrationRepository = IntegrationRepository.inMemory(seedTelegramIntegrationState());
    const config = loadTelegramWebhookConfig({
      TELEGRAM_WEBHOOK_ENABLED: "true"
    });

    const body = {
      message: {
        chat: { id: 112233, type: "private" },
        from: { first_name: "Elena", id: 55 },
        message_id: 3,
        text: "Повторный webhook"
      },
      update_id: 9010
    };

    const first = await handleTelegramWebhookFromRoute({
      body,
      conversationRepository: repository,
      conversationService: conversations,
      headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
      integrationRepository
    }, config);
    const duplicate = await handleTelegramWebhookFromRoute({
      body,
      conversationRepository: repository,
      conversationService: conversations,
      headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
      integrationRepository
    }, config);

    assert.equal(first.status, "ok");
    assert.equal(duplicate.data.duplicate, true);

    const conversationId = telegramConversationId(TENANT_ID, "123456789", "112233");
    const lifecycleEvents = await repository.listLifecycleEvents({ conversationId, tenantId: TENANT_ID });
    assert.deepEqual(lifecycleEvents.map((event) => event.eventType).sort(), ["conversation.created", "message.received"].sort());
    const realtimeEvents = (await repository.listRealtimeEvents({ tenantId: TENANT_ID }))
      .filter((event) => event.resourceId === conversationId);
    assert.deepEqual(realtimeEvents.map((event) => event.eventName).sort(), ["conversation.created", "message.created"].sort());
  });

  it("uses a tenant-scoped conversation id and keeps provider chat id for outbound delivery", async () => {
    const repository = ConversationRepository.inMemory();
    const conversation = await resolveOrCreateTelegramConversation({
      chatId: "55667788",
      conversationRepository: repository,
      displayName: "Pavel Telegram",
      tenantId: TENANT_ID,
      username: "pavel_tg"
    });

    assert.ok(conversation);
    assert.equal(conversation?.id, telegramConversationId(TENANT_ID, undefined, "55667788"));
    assert.equal(conversation?.phone, "");
    assert.equal(conversation?.providerConversationId, "55667788");
    assert.equal(conversation?.channel, "Telegram");
    assert.ok(conversation?.tags.includes("telegram"));

    const lifecycleEvents = await repository.listLifecycleEvents({
      conversationId: String(conversation?.id),
      tenantId: TENANT_ID
    });
    assert.deepEqual(lifecycleEvents.map((event) => event.eventType), ["conversation.created"]);
    const realtimeEvents = await repository.listRealtimeEvents({ tenantId: TENANT_ID });
    assert.deepEqual(realtimeEvents.map((event) => event.eventName), ["conversation.created"]);
  });

  it("accepts an idempotent CSAT callback only for the canonical assigned conversation", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);
    const integrationRepository = IntegrationRepository.inMemory(seedTelegramIntegrationState());
    const config = loadTelegramWebhookConfig({ TELEGRAM_WEBHOOK_ENABLED: "true" });
    const conversation = await resolveOrCreateTelegramConversation({
      botId: "123456789",
      chatId: "445566",
      conversationRepository: repository,
      displayName: "Rated Client",
      tenantId: TENANT_ID
    });
    assert.ok(conversation);
    await repository.saveConversation({ ...conversation!, operatorId: "operator-1", operatorName: "Operator One" });
    const ratings: Array<Record<string, unknown>> = [];

    const response = await handleTelegramWebhookFromRoute({
      body: {
        callback_query: { data: "quality:csat:5", id: "callback-55", message: { chat: { id: 445566 } } },
        update_id: 9055
      },
      conversationRepository: repository,
      conversationService: conversations,
      headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
      integrationRepository,
      recordQualityRating: async (payload) => {
        ratings.push(payload);
        return { data: { ratingId: "rating-55" }, error: null, meta: {}, operation: "record", service: "quality", status: "ok", traceId: "trace-rating" } as any;
      }
    }, config);

    assert.equal(response.status, "ok");
    assert.equal(response.data.ratingId, "rating-55");
    assert.equal(ratings[0]?.conversationId, conversation!.id);
    assert.equal(ratings[0]?.operator, "operator-1");
    assert.equal(ratings[0]?.score, 5);
    assert.equal(ratings[0]?.idempotencyKey, "telegram:123456789:callback-55");
  });

  it("hides the survey after a rating, stores the next message as feedback and lets the client opt into a new appeal", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);
    const integrationRepository = IntegrationRepository.inMemory(seedTelegramIntegrationState());
    const config = loadTelegramWebhookConfig({ TELEGRAM_WEBHOOK_ENABLED: "true" });
    const conversation = await resolveOrCreateTelegramConversation({
      botId: "123456789",
      chatId: "445577",
      conversationRepository: repository,
      displayName: "Feedback Client",
      tenantId: TENANT_ID
    });
    assert.ok(conversation);
    await repository.saveConversation({ ...conversation!, operatorId: "operator-1", status: "closed" });

    const telegramCalls: string[] = [];
    const telegramApi = {
      fetcher: async (input: string) => {
        telegramCalls.push(input);
        return { json: async () => ({ ok: true, result: true }), ok: true, status: 200 };
      }
    };
    let botRuns = 0;
    let assignments = 0;
    const baseInput = (body: Record<string, unknown>) => ({
      autoAssignConversation: async () => { assignments += 1; return { data: {}, meta: {}, operation: "assign", service: "routing", status: "ok", traceId: "trace-assign" } as any; },
      body,
      conversationRepository: repository,
      conversationService: conversations,
      headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
      integrationRepository,
      recordQualityRating: async () => ({ data: { ratingId: "rating-77" }, error: null, meta: {}, operation: "record", service: "quality", status: "ok", traceId: "trace-rating" } as any),
      runBotRuntime: async () => { botRuns += 1; return { instance: { status: "handoff" }, outcome: "handoff" }; },
      telegramApi
    });

    // 1. Оценка: опрос скрыт, промпт комментария отправлен, диалог ждет отзыв.
    const rated = await handleTelegramWebhookFromRoute(baseInput({
      callback_query: { data: "quality:csat:5", id: "callback-77", message: { chat: { id: 445577 }, message_id: 801 } },
      update_id: 9060
    }), config);
    assert.equal(rated.status, "ok");
    assert.equal(rated.data.feedbackPromptOffered, true);
    assert.ok(telegramCalls.some((url) => url.includes("/deleteMessage") && url.includes("message_id=801")), "the survey must be hidden");
    assert.ok(telegramCalls.some((url) => url.includes("/sendMessage") && decodeURIComponent(url).includes("quality:feedback:new_appeal")), "the prompt must offer the new appeal button");
    assert.equal((await repository.findConversation(conversation!.id))?.metadata?.csatFeedback?.state, "awaiting");

    // 2. Сообщение в окне ожидания — отзыв в том же закрытом обращении.
    const feedback = await handleTelegramWebhookFromRoute(baseInput({
      message: { chat: { id: 445577 }, from: { first_name: "Feedback" }, message_id: 802, text: "Очень быстро помогли" },
      update_id: 9061
    }), config);
    assert.equal(feedback.status, "ok");
    assert.equal(feedback.data.recordedAsFeedback, true);
    assert.equal(feedback.data.conversationId, conversation!.id);
    assert.equal(botRuns, 0, "a feedback message must not wake the bot runtime");
    assert.equal(assignments, 0, "a feedback message must not trigger auto-assignment");
    const ratedConversation = await repository.findConversation(conversation!.id);
    assert.equal(ratedConversation?.status, "closed");
    assert.equal(ratedConversation?.messages.at(-1)?.type, "csat_feedback");
    assert.equal(ratedConversation?.messages.at(-1)?.text, "Очень быстро помогли");
    assert.equal(ratedConversation?.metadata?.csatFeedback?.state, "received");
    assert.equal((await repository.listConversations({ tenantId: TENANT_ID })).filter((item) => item.tags.includes("telegram")).length, 1, "the feedback must not fork a new appeal");

    // 3. После полученного отзыва следующее сообщение открывает новое обращение.
    const followUp = await handleTelegramWebhookFromRoute(baseInput({
      message: { chat: { id: 445577 }, from: { first_name: "Feedback" }, message_id: 803, text: "Новый вопрос" },
      update_id: 9062
    }), config);
    assert.equal(followUp.status, "ok");
    assert.notEqual(followUp.data.conversationId, conversation!.id, "a message after the feedback must open a new appeal");
    assert.equal(botRuns, 1, "a regular follow-up message must reach the bot runtime again");
  });

  it("expires a stale feedback window so a late message opens a new appeal", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);
    const integrationRepository = IntegrationRepository.inMemory(seedTelegramIntegrationState());
    const config = loadTelegramWebhookConfig({ TELEGRAM_WEBHOOK_ENABLED: "true" });
    const conversation = await resolveOrCreateTelegramConversation({
      botId: "123456789",
      chatId: "445599",
      conversationRepository: repository,
      displayName: "Stale Client",
      tenantId: TENANT_ID
    });
    assert.ok(conversation);
    await repository.saveConversation({
      ...conversation!,
      metadata: {
        ...(conversation!.metadata ?? {}),
        csatFeedback: {
          // Окно комментария (30 минут) давно истекло.
          offeredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          ratingId: "rating-stale",
          state: "awaiting" as const
        }
      },
      operatorId: "operator-1",
      status: "closed"
    });

    const response = await handleTelegramWebhookFromRoute({
      body: {
        message: { chat: { id: 445599 }, from: { first_name: "Stale" }, message_id: 821, text: "Здравствуйте, снова я" },
        update_id: 9080
      },
      conversationRepository: repository,
      conversationService: conversations,
      headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
      integrationRepository
    }, config);

    assert.equal(response.status, "ok");
    assert.equal("recordedAsFeedback" in response.data, false);
    assert.notEqual(response.data.conversationId, conversation!.id, "a message after the expired window must open a new appeal");
  });

  it("declines the feedback prompt via the new appeal callback", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);
    const integrationRepository = IntegrationRepository.inMemory(seedTelegramIntegrationState());
    const config = loadTelegramWebhookConfig({ TELEGRAM_WEBHOOK_ENABLED: "true" });
    const conversation = await resolveOrCreateTelegramConversation({
      botId: "123456789",
      chatId: "445588",
      conversationRepository: repository,
      displayName: "Decline Client",
      tenantId: TENANT_ID
    });
    assert.ok(conversation);
    await repository.saveConversation({ ...conversation!, operatorId: "operator-1", status: "closed" });

    const telegramCalls: string[] = [];
    const input = (body: Record<string, unknown>) => ({
      body,
      conversationRepository: repository,
      conversationService: conversations,
      headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
      integrationRepository,
      recordQualityRating: async () => ({ data: { ratingId: "rating-88" }, error: null, meta: {}, operation: "record", service: "quality", status: "ok", traceId: "trace-rating" } as any),
      telegramApi: {
        fetcher: async (url: string) => {
          telegramCalls.push(url);
          return { json: async () => ({ ok: true, result: true }), ok: true, status: 200 };
        }
      }
    });

    await handleTelegramWebhookFromRoute(input({
      callback_query: { data: "quality:csat:3", id: "callback-88", message: { chat: { id: 445588 }, message_id: 811 } },
      update_id: 9070
    }), config);
    assert.equal((await repository.findConversation(conversation!.id))?.metadata?.csatFeedback?.state, "awaiting");

    telegramCalls.length = 0;
    const declined = await handleTelegramWebhookFromRoute(input({
      callback_query: { data: "quality:feedback:new_appeal", id: "callback-89", message: { chat: { id: 445588 }, message_id: 812 } },
      update_id: 9071
    }), config);
    assert.equal(declined.status, "ok");
    assert.equal(declined.data.declined, true);
    assert.equal((await repository.findConversation(conversation!.id))?.metadata?.csatFeedback?.state, "declined");
    assert.ok(telegramCalls.some((url) => url.includes("/deleteMessage") && url.includes("message_id=812")), "the feedback prompt must be hidden");
    assert.ok(telegramCalls.some((url) => url.includes("/answerCallbackQuery") && url.includes("callback_query_id=callback-89")));

    const followUp = await handleTelegramWebhookFromRoute(input({
      message: { chat: { id: 445588 }, from: { first_name: "Decline" }, message_id: 813, text: "Новая проблема" },
      update_id: 9072
    }), config);
    assert.equal(followUp.status, "ok");
    assert.notEqual(followUp.data.conversationId, conversation!.id, "after the decline a message must open a new appeal");
  });

  it("keeps an active bot dialog unassigned and assigns it after bot handoff", async () => {
    const repository = ConversationRepository.inMemory();
    const conversations = new ConversationService(repository);
    const integrationRepository = IntegrationRepository.inMemory(seedTelegramIntegrationState());
    const config = loadTelegramWebhookConfig({ TELEGRAM_WEBHOOK_ENABLED: "true" });
    let assignments = 0;
    const newConversationFlags: boolean[] = [];
    const input = (updateId: number, status: "active" | "handoff") => ({
      autoAssignConversation: async () => { assignments += 1; return { data: {}, meta: {}, operation: "assign", service: "routing", status: "ok", traceId: "trace-assign" } as any; },
      body: { message: { chat: { id: 778899 }, from: { first_name: "Bot Client" }, message_id: updateId, text: `message-${updateId}` }, update_id: updateId },
      conversationRepository: repository,
      conversationService: conversations,
      headers: { "x-telegram-bot-api-secret-token": WEBHOOK_SECRET },
      integrationRepository,
      runBotRuntime: async (event) => {
        newConversationFlags.push(event.payload?.isNewConversation === true);
        return { instance: { status }, outcome: "committed" };
      }
    });

    const active = await handleTelegramWebhookFromRoute(input(9101, "active"), config);
    const handoff = await handleTelegramWebhookFromRoute(input(9102, "handoff"), config);

    assert.equal(active.data.botRuntime?.status, "active");
    assert.equal(active.data.autoAssignment, null);
    assert.equal(handoff.data.botRuntime?.status, "handoff");
    assert.equal(assignments, 1);
    assert.deepEqual(newConversationFlags, [true, false]);
  });
});

async function createTestApiApp(apps: INestApplication[]) {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://support:support@127.0.0.1:5432/support_communication";
  process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
  process.env.S3_ENDPOINT = process.env.S3_ENDPOINT ?? "https://example.invalid/s3";
  process.env.S3_BUCKET = process.env.S3_BUCKET ?? "test-bucket";
  process.env.S3_ACCESS_KEY = process.env.S3_ACCESS_KEY ?? "test-access-key";
  process.env.S3_SECRET_KEY = process.env.S3_SECRET_KEY ?? "test-secret-key";
  process.env.DEMO_SERVICE_ADMIN_KEY = process.env.DEMO_SERVICE_ADMIN_KEY ?? "dev-service-admin-key-0001";
  process.env.TELEGRAM_WEBHOOK_ENABLED = "true";
  process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.TELEGRAM_LEGACY_TENANT_ID = TENANT_ID;

  IdentityRepository.useDefault(IdentityRepository.inMemory());
  ConversationRepository.useDefault(ConversationRepository.inMemory());
  IntegrationRepository.useDefault(IntegrationRepository.inMemory(seedTelegramIntegrationState()));

  const app = await NestFactory.create(TelegramWebhookContractTestModule, {
    logger: false
  });
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new EnvelopeHttpExceptionFilter());
  await app.listen(0, "127.0.0.1");
  apps.push(app);

  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test HTTP port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function postTelegramUpdate(
  baseUrl: string,
  body: Record<string, unknown>,
  secret: string = WEBHOOK_SECRET
) {
  const response = await fetch(`${baseUrl}/api/v1/webhooks/telegram`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": secret
    },
    body: JSON.stringify(body)
  });

  assert.equal(response.status, 200);
  return response.json() as Promise<{
    status: string;
    data: Record<string, unknown>;
    error?: { code?: string };
  }>;
}

function seedTelegramIntegrationState() {
  const now = new Date().toISOString();
  return {
    apiKeyRotationAuditEvents: [],
    apiKeyRotationJobs: [],
    publicApiKeys: [],
    publicApiKeyRevealStates: [],
    securitySessions: [],
    telegramConnections: [{
      botId: "123456789",
      botToken: "123456789:TESTTOKEN",
      botUsername: "pilot_support_bot",
      createdAt: now,
      status: "active" as const,
      tenantId: TENANT_ID,
      tokenPreview: "123456789:****",
      updatedAt: now,
      webhookSecret: WEBHOOK_SECRET
    }],
    webhookDeliveryJournal: [],
    webhookReplayAuditEvents: [],
    webhookReplayJournal: []
  };
}
