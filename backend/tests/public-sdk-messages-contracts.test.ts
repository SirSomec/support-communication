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
import { QualityRepository } from "../apps/api-gateway/dist/quality/quality.repository.js";
import { WorkspaceRepository } from "../apps/api-gateway/dist/workspace/workspace.repository.js";

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
    QualityRepository.clearDefault();
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

    const conversationId = String(send.data.conversationId);
    const repository = ConversationRepository.default();
    const lifecycleEvents = await repository.listLifecycleEvents({ conversationId, tenantId: TENANT_ID });
    assert.deepEqual(lifecycleEvents.map((event) => event.eventType), ["conversation.created", "message.received"]);
    assert.equal(lifecycleEvents.every((event) => event.tenantId === TENANT_ID), true);

    const realtimeEvents = (await repository.listRealtimeEvents({ tenantId: TENANT_ID }))
      .filter((event) => event.resourceId === conversationId);
    assert.deepEqual(realtimeEvents.map((event) => event.eventName), ["conversation.created", "message.created"]);
    assert.equal(lifecycleEvents[0]?.sourceEventId, realtimeEvents[0]?.eventId);
    assert.equal(lifecycleEvents[0]?.traceId, realtimeEvents[0]?.traceId);
    assert.equal(lifecycleEvents[1]?.sourceEventId, realtimeEvents[1]?.eventId);
    assert.equal(lifecycleEvents[1]?.traceId, realtimeEvents[1]?.traceId);
  });

  it("does not let a public SDK request overwrite a conversation owned by another tenant", async () => {
    const { baseUrl } = await createTestApiApp(apps);
    const bootstrap = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "bootstrap-cross-tenant",
      text: "Bootstrap"
    });
    const repository = ConversationRepository.default();
    const source = await repository.findConversation(String(bootstrap.data.conversationId));
    assert.ok(source);
    await repository.saveConversation({
      ...source,
      id: "victim-cross-tenant-conversation",
      messages: [{ id: "victim-message", side: "client", text: "Must survive", time: "10:00" }],
      providerConversationId: "victim-external-id",
      tenantId: "tenant-other"
    });

    const attack = await publicPost(baseUrl, "/public/sdk/messages", {
      conversationId: "victim-cross-tenant-conversation",
      externalId: "attacker-external-id",
      text: "Overwrite attempt"
    });
    const victim = await repository.findConversation("victim-cross-tenant-conversation");

    assert.equal(attack.status, "denied");
    assert.equal(attack.error?.code, "sdk_conversation_tenant_mismatch");
    assert.equal(victim?.tenantId, "tenant-other");
    assert.equal(victim?.providerConversationId, "victim-external-id");
    assert.deepEqual(victim?.messages.map((message) => message.id), ["victim-message"]);
  });

  it("tracks anonymous SDK presence before a conversation exists", async () => {
    const { baseUrl, integrationRepository } = await createTestApiApp(apps);
    assert.equal((await ConversationRepository.default().listConversations({ tenantId: TENANT_ID })).length, 0);

    const first = await publicPost(baseUrl, "/public/sdk/presence/heartbeat", {
      externalId: "visitor-presence@example.test",
      pageUrl: "https://shop.example/checkout?email=secret@example.test#payment",
      referrer: "https://search.example/results?q=private",
      sessionId: "browser-session-001"
    });
    const second = await publicPost(baseUrl, "/public/sdk/presence/heartbeat", {
      externalId: "visitor-presence@example.test",
      pagePath: "/checkout?token=secret",
      sessionId: "browser-session-001"
    });

    assert.equal(first.status, "ok");
    assert.equal(second.data.firstSeenAt, first.data.firstSeenAt);
    assert.equal((await ConversationRepository.default().listConversations({ tenantId: TENANT_ID })).length, 0);
    const sessions = await integrationRepository.listLiveSdkVisitorPresence({ at: new Date().toISOString() });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.pagePath, "/checkout");
    assert.equal(sessions[0]?.pageUrl, null);
    assert.equal(sessions[0]?.subjectId.includes("visitor-presence"), false);
    assert.equal(sessions[0]?.sessionKeyHash.includes("browser-session"), false);

    const disconnected = await publicPost(baseUrl, "/public/sdk/presence/disconnect", { sessionId: "browser-session-001" });
    assert.equal(disconnected.data.connected, false);
    assert.equal((await integrationRepository.listLiveSdkVisitorPresence({ at: new Date().toISOString() })).length, 0);
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
    assert.equal(typeof poll.data.visitorSessionToken, "string");
    assert.equal(String(poll.data.visitorSessionToken).length > 20, true);

    const pollSince = await publicGet(
      baseUrl,
      `/public/sdk/conversations/${encodeURIComponent(send.data.conversationId)}/messages`,
      {
        since: replyMessageId,
        visitorSessionToken: String(poll.data.visitorSessionToken)
      }
    );
    assert.equal(Array.isArray(pollSince.data.messages), true);
    assert.equal(pollSince.data.messages.length, 0);
  });

  it("returns operator attachments with signed download links in widget poll", async () => {
    const { baseUrl } = await createTestApiApp(apps);

    const send = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-attachment-001",
      text: "Пришлите, пожалуйста, счёт"
    });
    const conversationId = String(send.data.conversationId);

    await WorkspaceRepository.default().saveFile({
      auditId: "audit-sdk-attachment-001",
      channel: "SDK",
      fileId: "file-sdk-attachment-001",
      fileName: "invoice.pdf",
      mimeType: "application/pdf",
      objectKey: "objects/obj_sdk_attachment_001",
      scanState: "clean",
      scanVerdict: "clean",
      sizeBytes: 2048,
      storageState: "uploaded",
      tenantId: TENANT_ID
    });
    await WorkspaceRepository.default().saveFile({
      auditId: "audit-sdk-attachment-002",
      channel: "SDK",
      fileId: "file-sdk-attachment-pending",
      fileName: "pending.pdf",
      mimeType: "application/pdf",
      objectKey: "objects/obj_sdk_attachment_pending",
      scanState: "pending",
      sizeBytes: 1024,
      storageState: "uploaded",
      tenantId: TENANT_ID
    });

    const appendReply = await fetch(`${baseUrl}/api/v1/dialogs/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      headers: {
        ...demoServiceAdminHeaders("dialogs.manage"),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        mode: "reply",
        text: "Отправляю счёт во вложении.",
        attachments: [{ fileId: "file-sdk-attachment-001" }]
      })
    });
    assert.equal(appendReply.status, 200);
    const appendReplyEnvelope = await appendReply.json() as { status: string };
    assert.equal(appendReplyEnvelope.status, "ok");

    const poll = await publicGet(
      baseUrl,
      `/public/sdk/conversations/${encodeURIComponent(conversationId)}/messages`,
      { visitorSessionToken: String(send.data.visitorSessionToken) }
    );
    const messages = poll.data.messages as Array<{ attachments?: Array<Record<string, any>>; text: string }>;
    const withAttachment = messages.find((message) => Array.isArray(message.attachments) && message.attachments.length > 0);
    assert.ok(withAttachment, "operator reply with attachment must be present in the poll response");

    const attachment = withAttachment.attachments![0];
    assert.equal(attachment.fileId, "file-sdk-attachment-001");
    assert.equal(attachment.fileName, "invoice.pdf");
    assert.equal(attachment.mimeType, "application/pdf");
    assert.equal(attachment.sizeBytes, 2048);
    assert.equal("signedFile" in attachment, false);
    assert.equal(typeof attachment.download?.url, "string");
    assert.equal(attachment.download.url.startsWith("http"), true);
    assert.equal(attachment.download.url.includes("X-Amz-Signature="), true);
    assert.equal(new Date(String(attachment.download.expiresAt)).getTime() > Date.now(), true);
  });

  it("records an idempotent SDK rating from canonical conversation data", async () => {
    const { baseUrl } = await createTestApiApp(apps);
    const send = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-rating-001",
      text: "Please help with my order"
    });
    const conversationId = String(send.data.conversationId);
    const conversations = ConversationRepository.default();
    const conversation = await conversations.findConversation(conversationId);
    assert.ok(conversation);
    await conversations.saveConversation({
      ...conversation,
      channel: "SDK",
      operatorId: "operator-canonical",
      operatorName: "Canonical Operator",
      topic: "Canonical topic"
    });

    const payload = {
      channel: "Telegram",
      idempotencyKey: "widget-rating-001",
      operator: "attacker-controlled",
      scale: "CSAT",
      score: 5,
      topic: "Fake topic",
      visitorSessionToken: String(send.data.visitorSessionToken)
    };
    const first = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, payload);
    const replay = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, payload);

    assert.equal(first.status, "ok");
    assert.equal(first.data.accepted, true);
    assert.equal(replay.data.ratingId, first.data.ratingId);
    assert.equal("visitorSessionToken" in first.data, false);
    const ratings = await QualityRepository.default().listQualityRatings({ tenantId: TENANT_ID });
    assert.equal(ratings.length, 1);
    assert.equal(ratings[0]?.channel, "SDK");
    assert.equal(ratings[0]?.operator, "operator-canonical");
    assert.equal(ratings[0]?.topic, "Canonical topic");
    assert.equal(ratings[0]?.clientId, "visitor-rating-001");
  });

  it("offers a feedback comment after a rating and stores the next message as feedback without a new appeal", async () => {
    const { baseUrl } = await createTestApiApp(apps);
    const send = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-feedback-001",
      text: "Помогите с доставкой"
    });
    const conversationId = String(send.data.conversationId);
    const conversations = ConversationRepository.default();
    const conversation = await conversations.findConversation(conversationId);
    assert.ok(conversation);

    // Оценка по еще открытому диалогу комментарий не предлагает.
    const early = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, {
      idempotencyKey: "widget-feedback-early",
      scale: "CSAT",
      score: 4,
      visitorSessionToken: String(send.data.visitorSessionToken)
    });
    assert.equal(early.status, "invalid", "an unassigned dialog cannot be rated at all");

    await conversations.saveConversation({ ...conversation, operatorId: "operator-feedback", status: "closed" });

    const rated = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, {
      idempotencyKey: "widget-feedback-001",
      scale: "CSAT",
      score: 5,
      visitorSessionToken: String(send.data.visitorSessionToken)
    });
    assert.equal(rated.status, "ok");
    assert.deepEqual(rated.data.feedback, { offered: true });
    assert.equal((await conversations.findConversation(conversationId))?.metadata?.csatFeedback?.state, "awaiting");

    // Сообщение в окне ожидания — отзыв: то же обращение, без бота и форка.
    const feedback = await publicPost(baseUrl, "/public/sdk/messages", {
      conversationId,
      externalId: "visitor-feedback-001",
      text: "Спасибо, все решили быстро"
    });
    assert.equal(feedback.status, "ok");
    assert.equal(feedback.data.recordedAsFeedback, true);
    assert.equal(typeof feedback.data.feedbackAck, "string");
    assert.equal(feedback.data.conversationId, conversationId);
    const rated2 = await conversations.findConversation(conversationId);
    assert.equal(rated2?.status, "closed");
    assert.equal(rated2?.messages.at(-1)?.type, "csat_feedback");
    assert.equal(rated2?.messages.at(-1)?.text, "Спасибо, все решили быстро");
    assert.equal(rated2?.metadata?.csatFeedback?.state, "received");
    assert.equal(rated2?.preview, "Отзыв: Спасибо, все решили быстро");
    assert.equal((await conversations.listConversations({ tenantId: TENANT_ID })).length, 1, "the feedback must not fork a new appeal");

    // Отзыв получен: следующее сообщение открывает новое обращение.
    const followUp = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-feedback-001",
      text: "У меня новый вопрос"
    });
    assert.equal(followUp.status, "ok");
    assert.notEqual(followUp.data.conversationId, conversationId);
    assert.equal("recordedAsFeedback" in followUp.data, false);
    assert.equal((await conversations.listConversations({ tenantId: TENANT_ID })).length, 2);
  });

  it("lets the client skip the feedback comment and start a new appeal instead", async () => {
    const { baseUrl } = await createTestApiApp(apps);
    const send = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-feedback-decline",
      text: "Вопрос по оплате"
    });
    const conversationId = String(send.data.conversationId);
    const conversations = ConversationRepository.default();
    const conversation = await conversations.findConversation(conversationId);
    assert.ok(conversation);
    await conversations.saveConversation({ ...conversation, operatorId: "operator-decline", status: "closed" });

    const rated = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, {
      idempotencyKey: "widget-decline-001",
      scale: "CSAT",
      score: 2,
      visitorSessionToken: String(send.data.visitorSessionToken)
    });
    assert.deepEqual(rated.data.feedback, { offered: true });

    const tampered = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/csat-feedback/decline`, {
      visitorSessionToken: `${send.data.visitorSessionToken}tampered`
    });
    assert.equal(tampered.status, "denied");
    assert.equal((await conversations.findConversation(conversationId))?.metadata?.csatFeedback?.state, "awaiting");

    const declined = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/csat-feedback/decline`, {
      visitorSessionToken: String(send.data.visitorSessionToken)
    });
    assert.equal(declined.status, "ok");
    assert.equal(declined.data.declined, true);
    assert.equal((await conversations.findConversation(conversationId))?.metadata?.csatFeedback?.state, "declined");

    // Ожидание снято: сообщение открывает новое обращение, а не отзыв.
    const followUp = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-feedback-decline",
      text: "Другой вопрос"
    });
    assert.equal(followUp.status, "ok");
    assert.notEqual(followUp.data.conversationId, conversationId);
    assert.equal((await conversations.listConversations({ tenantId: TENANT_ID })).length, 2);
  });

  it("rejects invalid rating input, visitor token and API key scope", async () => {
    const { baseUrl, integrationRepository } = await createTestApiApp(apps);
    const send = await publicPost(baseUrl, "/public/sdk/messages", {
      externalId: "visitor-rating-security",
      text: "Need an operator"
    });
    const conversationId = String(send.data.conversationId);
    const conversations = ConversationRepository.default();
    const conversation = await conversations.findConversation(conversationId);
    assert.ok(conversation);
    await conversations.saveConversation({ ...conversation, operatorId: "operator-security" });

    const invalidScore = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, {
      idempotencyKey: "invalid-score",
      scale: "CSAT",
      score: 6,
      visitorSessionToken: String(send.data.visitorSessionToken)
    });
    assert.equal(invalidScore.status, "invalid");
    assert.equal(invalidScore.error?.code, "quality_rating_invalid");

    const invalidToken = await publicPost(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, {
      idempotencyKey: "invalid-token",
      scale: "CSI",
      score: 4,
      visitorSessionToken: `${send.data.visitorSessionToken}tampered`
    });
    assert.equal(invalidToken.status, "denied");
    assert.equal(String(invalidToken.error?.code).startsWith("visitor_session_token_"), true);

    const noScopeKey = "sk_test_public_sdk_no_rating_scope";
    await integrationRepository.savePublicApiKey({
      createdAt: new Date().toISOString(), environment: "stage", keyId: "pak-no-rating-scope",
      name: "No rating scope", owner: "contract-tests", rawSecret: noScopeKey,
      scopes: ["clients:identify"], status: "active", tenantId: TENANT_ID
    });
    const denied = await postWithKey(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, noScopeKey, {
      idempotencyKey: "no-scope", scale: "CSAT", score: 5,
      visitorSessionToken: String(send.data.visitorSessionToken)
    });
    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "public_api_scope_denied");

    const otherTenantKey = "sk_test_public_sdk_other_tenant";
    await integrationRepository.savePublicApiKey({
      createdAt: new Date().toISOString(), environment: "stage", keyId: "pak-other-tenant",
      name: "Other tenant SDK", owner: "contract-tests", rawSecret: otherTenantKey,
      scopes: ["conversations:write"], status: "active", tenantId: "tenant-other"
    });
    const crossTenant = await postWithKey(baseUrl, `/public/sdk/conversations/${encodeURIComponent(conversationId)}/ratings`, otherTenantKey, {
      idempotencyKey: "cross-tenant", scale: "CSAT", score: 5,
      visitorSessionToken: String(send.data.visitorSessionToken)
    });
    assert.equal(crossTenant.status, "not_found");
    assert.equal(crossTenant.error?.code, "conversation_not_found");
    assert.equal((await QualityRepository.default().listQualityRatings({ tenantId: TENANT_ID })).length, 0);
  });
});

async function createTestApiApp(apps: INestApplication[]): Promise<{ baseUrl: string; integrationRepository: IntegrationRepository }> {
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
  process.env.SDK_VISITOR_TOKEN_SECRET = "sdk-visitor-token-contract-secret";

  const identityRepository = IdentityRepository.inMemory();
  IdentityRepository.useDefault(identityRepository);

  const conversationRepository = ConversationRepository.inMemory();
  ConversationRepository.useDefault(conversationRepository);

  WorkspaceRepository.useDefault(WorkspaceRepository.inMemory());

  const integrationRepository = IntegrationRepository.inMemory();
  const sdkConnectionId = "conn-public-sdk-contract";
  await integrationRepository.saveChannelConnectionAsync({
    chatLimit: 10,
    credentialsMasked: true,
    createdAt: new Date().toISOString(),
    environment: "stage",
    health: 100,
    id: sdkConnectionId,
    lastSyncAt: new Date().toISOString(),
    name: "Public SDK contract",
    rawExternalId: "sdk:contract",
    routingQueueId: "queue-public-sdk-contract",
    status: "active",
    tenantId: TENANT_ID,
    traffic: "test",
    type: "sdk",
    updatedAt: new Date().toISOString(),
    webhookUrl: ""
  });
  await integrationRepository.savePublicApiKey({
    channelConnectionId: sdkConnectionId,
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
  QualityRepository.useDefault(QualityRepository.inMemory({ aiScoringAudits: [], aiSuggestionDecisions: [], lifecycleEvents: [], manualQaReviews: [], qualityRatings: [] }));

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

  return { baseUrl: `http://127.0.0.1:${address.port}`, integrationRepository };
}

async function publicPost(baseUrl: string, path: string, payload: Record<string, unknown>) {
  return postWithKey(baseUrl, path, PUBLIC_API_KEY, payload);
}

async function postWithKey(baseUrl: string, path: string, apiKey: string, payload: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/v1${path}?environment=stage`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.text();
  assert.equal(response.status, 200, body);
  return JSON.parse(body) as { data: Record<string, any>; error?: { code?: string }; status: string };
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
