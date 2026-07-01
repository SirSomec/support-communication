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
  resolveOrCreateTelegramConversation
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
    assert.equal(response.data.conversationId, "99887766");

    const conversation = await ConversationRepository.default().findConversation("99887766");
    assert.ok(conversation);
    assert.equal(conversation?.channel, "Telegram");
    assert.equal(conversation?.tenantId, TENANT_ID);
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
  });

  it("resolveOrCreateTelegramConversation uses chat id as conversation id for outbound delivery", async () => {
    const repository = ConversationRepository.inMemory();
    const conversation = await resolveOrCreateTelegramConversation({
      chatId: "55667788",
      conversationRepository: repository,
      displayName: "Pavel Telegram",
      tenantId: TENANT_ID,
      username: "pavel_tg"
    });

    assert.ok(conversation);
    assert.equal(conversation?.id, "55667788");
    assert.equal(conversation?.channel, "Telegram");
    assert.ok(conversation?.tags.includes("telegram"));
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
  process.env.PILOT_TELEGRAM_TENANT_ID = TENANT_ID;

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
