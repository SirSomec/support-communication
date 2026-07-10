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

const PUBLIC_API_KEY = "sk_test_public_sdk_contract_secret";
const PUBLIC_KEY_ID = "pak_public_sdk_contract_stage";
const TENANT_ID = "tenant-pilot-001";

@Module({
  imports: [IdentityModule, ConversationModule, IntegrationModule]
})
class PublicSdkMessagesContractTestModule {}

describe("public sdk message ingress and widget poll contracts", () => {
  const apps: INestApplication[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }

    IntegrationRepository.clearDefault();
  });

  it("accepts sdk message and returns conversationId", async () => {
    const { baseUrl } = await createTestApiApp(apps);

    const identify = await publicPost(baseUrl, "/public/sdk/identify", { externalId: "visitor-001" });
    const send = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-001",
      text: "Нужна помощь с заказом",
      pageUrl: "https://acme.example/checkout"
    });

    assert.equal(send.data.conversationId, identify.data.conversationId);
    assert.equal(send.data.accepted, true);
    assert.equal(typeof send.data.visitorSessionToken, "string");
    assert.equal(send.data.visitorSessionToken.length > 20, true);
  });

  it("polls only operator replies after sdk message ingress", async () => {
    const { baseUrl } = await createTestApiApp(apps);

    const identify = await publicPost(baseUrl, "/public/sdk/identify", { externalId: "visitor-002" });
    const send = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-002",
      text: "Подскажите статус заказа 4921",
      pageUrl: "https://acme.example/orders/4921"
    });
    assert.equal(send.data.conversationId, identify.data.conversationId);

    const appendReply = await fetch(`${baseUrl}/api/v1/dialogs/${encodeURIComponent(send.data.conversationId)}/messages`, {
      method: "POST",
      headers: {
        ...demoServiceAdminHeaders("dialogs.manage"),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        mode: "reply",
        text: "Здравствуйте! Проверяю заказ и вернусь с обновлением в течение 5 минут."
      })
    });
    assert.equal(appendReply.status, 200);
    const appendReplyEnvelope = await appendReply.json() as { data: { message: { id: string; text: string } } };
    const replyMessageId = String(appendReplyEnvelope.data.message.id);

    const appendInternal = await fetch(`${baseUrl}/api/v1/dialogs/${encodeURIComponent(send.data.conversationId)}/messages`, {
      method: "POST",
      headers: {
        ...demoServiceAdminHeaders("dialogs.manage"),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        mode: "internal",
        text: "Internal note that must not leak to visitor poll."
      })
    });
    assert.equal(appendInternal.status, 200);

    const poll = await publicGet(
      baseUrl,
      `/public/sdk/conversations/${encodeURIComponent(send.data.conversationId)}/messages`,
      {
        visitorSessionToken: String(send.data.visitorSessionToken)
      }
    );
    const messages = poll.data.messages as Array<{ id: string; text: string }>;
    assert.equal(messages.some((message) => message.text.includes("вернусь с обновлением")), true);
    assert.equal(messages.some((message) => message.text.includes("Internal note")), false);

    const pollSince = await publicGet(
      baseUrl,
      `/public/sdk/conversations/${encodeURIComponent(send.data.conversationId)}/messages`,
      {
        since: replyMessageId,
        visitorSessionToken: String(send.data.visitorSessionToken)
      }
    );
    assert.equal(Array.isArray(pollSince.data.messages), true);
    assert.equal(pollSince.data.messages.length, 0);
  });
});

async function createTestApiApp(apps: INestApplication[]): Promise<{ baseUrl: string }> {
  process.env.NODE_ENV = "test";
  process.env.ALLOW_DEMO_SERVICE_ADMIN_HEADERS = "true";
  process.env.API_VERSION = "v1";
  process.env.DATABASE_URL = "https://example.invalid/database";
  process.env.REDIS_URL = "https://example.invalid/redis";
  process.env.S3_ENDPOINT = "https://example.invalid/s3";
  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_ACCESS_KEY = "test-access-key";
  process.env.S3_SECRET_KEY = "test-secret-key";
  process.env.DEMO_SERVICE_ADMIN_KEY = "dev-service-admin-key-0001";
  process.env.PILOT_VISITOR_TOKEN_SECRET = "pilot-visitor-token-contract-secret";

  const identityRepository = IdentityRepository.inMemory();
  IdentityRepository.useDefault(identityRepository);

  const conversationRepository = ConversationRepository.inMemory();
  ConversationRepository.useDefault(conversationRepository);

  const integrationRepository = IntegrationRepository.inMemory();
  await integrationRepository.savePublicApiKey({
    createdAt: new Date().toISOString(),
    environment: "stage",
    keyId: PUBLIC_KEY_ID,
    name: "Public SDK contract key",
    owner: "contract-tests",
    rawSecret: PUBLIC_API_KEY,
    scopes: ["clients:identify", "conversations:write"],
    status: "active",
    tenantId: TENANT_ID
  });
  IntegrationRepository.useDefault(integrationRepository);

  const app = await NestFactory.create(PublicSdkMessagesContractTestModule, {
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

  return { baseUrl: `http://127.0.0.1:${address.port}` };
}

async function publicPost(baseUrl: string, path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/v1${path}?environment=stage`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${PUBLIC_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ data: Record<string, any>; status: string }>;
}

async function publicGet(
  baseUrl: string,
  path: string,
  query: Record<string, string>
) {
  const params = new URLSearchParams({ ...query, environment: "stage" });
  const response = await fetch(`${baseUrl}/api/v1${path}?${params.toString()}`, {
    headers: {
      authorization: `Bearer ${PUBLIC_API_KEY}`
    }
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<{ data: Record<string, any>; status: string }>;
}

function demoServiceAdminHeaders(requiredAction: string): Record<string, string> {
  return {
    "x-demo-service-admin-key": "dev-service-admin-key-0001",
    "x-demo-service-admin-actor-id": "service-admin-contract",
    "x-demo-service-admin-actor-name": "Service Admin Contract",
    "x-demo-service-admin-mfa-verified": "true",
    "x-demo-service-admin-session-expires-at": "2099-12-31T23:59:59.000Z",
    "x-demo-service-admin-roles": "service_admin",
    "x-demo-service-admin-permissions": `${requiredAction},*`
  };
}
