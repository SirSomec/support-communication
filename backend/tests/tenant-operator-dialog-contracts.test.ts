import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory, type INestApplication } from "@nestjs/core";
import { ConversationModule } from "../apps/api-gateway/dist/conversation/conversation.module.js";
import { ConversationRepository } from "../apps/api-gateway/dist/conversation/conversation.repository.js";
import { EnvelopeHttpExceptionFilter } from "../apps/api-gateway/dist/http-exception.filter.js";
import { IdentityModule } from "../apps/api-gateway/dist/identity/identity.module.js";
import { IdentityRepository } from "../apps/api-gateway/dist/identity/identity.repository.js";

const PILOT_TENANT_ID = "tenant-pilot-001";
const OTHER_TENANT_ID = "tenant-lumen-002";
const PILOT_OPERATOR_EMAIL = "operator@pilot-client.test";
const PILOT_OPERATOR_PASSWORD = "Pilot-Operator-2026!";
const PILOT_OPERATOR_USER_ID = "usr-volga-admin";

@Module({
  imports: [IdentityModule, ConversationModule]
})
class TenantOperatorDialogContractTestModule {}

describe("tenant operator dialog and realtime contracts", () => {
  const apps: INestApplication[] = [];
  const previousRealtimeQueryToken = process.env.REALTIME_SSE_QUERY_TOKEN;
  const previousLegacyQueryToken = process.env.PILOT_SSE_QUERY_TOKEN;

  afterEach(async () => {
    process.env.REALTIME_SSE_QUERY_TOKEN = previousRealtimeQueryToken;
    process.env.PILOT_SSE_QUERY_TOKEN = previousLegacyQueryToken;

    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  it("accepts tenant operator bearer auth and demo service-admin fallback on dialog routes", async () => {
    const { baseUrl, otherTenantConversationId } = await createTestApiApp(apps);
    const accessToken = await loginPilotTenantOperator(baseUrl);

    const tenantResponse = await fetch(`${baseUrl}/api/v1/dialogs`, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    assert.equal(tenantResponse.status, 200);
    const tenantEnvelope = await tenantResponse.json() as { data: { items: Array<{ id: string }> } };
    assert.equal(tenantEnvelope.data.items.some((item) => item.id === otherTenantConversationId), false);

    const demoResponse = await fetch(`${baseUrl}/api/v1/dialogs`, {
      headers: demoServiceAdminHeaders("dialogs.read")
    });
    assert.equal(demoResponse.status, 200);
  });

  it("isolates tenant operator from foreign-tenant dialog detail and mutations", async () => {
    const { baseUrl, otherTenantConversationId } = await createTestApiApp(apps);
    const accessToken = await loginPilotTenantOperator(baseUrl);

    const detailResponse = await fetch(`${baseUrl}/api/v1/dialogs/${otherTenantConversationId}`, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    const detailEnvelope = await detailResponse.json() as { status?: string };
    const detailDenied = [403, 404].includes(detailResponse.status)
      || detailEnvelope.status === "not_found"
      || detailEnvelope.status === "forbidden";
    assert.equal(detailDenied, true, `detail status=${detailResponse.status}, envelope=${detailEnvelope.status ?? "(none)"}`);

    const appendResponse = await fetch(`${baseUrl}/api/v1/dialogs/${otherTenantConversationId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        mode: "reply",
        text: "Tenant A should not post into tenant B dialog."
      })
    });
    const appendEnvelope = await appendResponse.json() as { status?: string };
    const appendDenied = [403, 404].includes(appendResponse.status)
      || appendEnvelope.status === "not_found"
      || appendEnvelope.status === "forbidden";
    assert.equal(appendDenied, true, `append status=${appendResponse.status}, envelope=${appendEnvelope.status ?? "(none)"}`);
  });

  it("supports dual auth for realtime and optional SSE query token gating", async () => {
    const { baseUrl } = await createTestApiApp(apps);
    const accessToken = await loginPilotTenantOperator(baseUrl);

    const tenantRealtime = await fetch(`${baseUrl}/api/v1/realtime/events`, {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    assert.equal(tenantRealtime.status, 200);

    const demoRealtime = await fetch(`${baseUrl}/api/v1/realtime/events`, {
      headers: demoServiceAdminHeaders("realtime.events.read")
    });
    assert.equal(demoRealtime.status, 200);

    process.env.REALTIME_SSE_QUERY_TOKEN = "false";
    const deniedQueryStream = await fetch(`${baseUrl}/api/v1/realtime/events/stream?accessToken=${encodeURIComponent(accessToken)}`, {
      headers: {
        accept: "text/event-stream"
      }
    });
    assert.equal(deniedQueryStream.status, 401);

    process.env.REALTIME_SSE_QUERY_TOKEN = "true";
    const allowedQueryStream = await fetch(`${baseUrl}/api/v1/realtime/events/stream?accessToken=${encodeURIComponent(accessToken)}`, {
      headers: {
        accept: "text/event-stream"
      }
    });
    assert.equal(allowedQueryStream.status, 200);
    const allowedQueryStreamContentType = String(allowedQueryStream.headers.get("content-type") ?? "");
    assert.equal(allowedQueryStreamContentType.includes("text/event-stream"), true, allowedQueryStreamContentType);
    allowedQueryStream.body?.cancel();

    // Устаревшее имя PILOT_SSE_QUERY_TOKEN поддерживается один релиз.
    delete process.env.REALTIME_SSE_QUERY_TOKEN;
    process.env.PILOT_SSE_QUERY_TOKEN = "true";
    const legacyQueryStream = await fetch(`${baseUrl}/api/v1/realtime/events/stream?accessToken=${encodeURIComponent(accessToken)}`, {
      headers: {
        accept: "text/event-stream"
      }
    });
    assert.equal(legacyQueryStream.status, 200);
    legacyQueryStream.body?.cancel();
  });
});

async function createTestApiApp(apps: INestApplication[]): Promise<{ baseUrl: string; otherTenantConversationId: string }> {
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
  process.env.PILOT_SKIP_MFA = "true";
  process.env.REALTIME_SSE_QUERY_TOKEN = "false";
  delete process.env.PILOT_SSE_QUERY_TOKEN;

  const identityRepository = IdentityRepository.inMemory();
  await seedPilotOperator(identityRepository);
  IdentityRepository.useDefault(identityRepository);

  const conversationRepository = ConversationRepository.inMemory();
  const otherTenantConversationId = `foreign-${randomUUID()}`;
  await conversationRepository.saveConversation({
    channel: "SDK",
    clientSince: "2026-01-01",
    device: "Web",
    entry: "SDK",
    id: otherTenantConversationId,
    initials: "FT",
    language: "English",
    messages: [
      {
        id: "msg-foreign-1",
        side: "client",
        text: "Cross-tenant seeded conversation",
        time: "now"
      }
    ],
    name: "Foreign Tenant User",
    phone: "+1 555 101 2020",
    preview: "Cross-tenant seeded conversation",
    previous: [],
    sla: "Active",
    slaTone: "ok",
    status: "active",
    tags: ["seed"],
    tenantId: OTHER_TENANT_ID,
    time: "now",
    topic: "Isolation"
  });
  ConversationRepository.useDefault(conversationRepository);

  const app = await NestFactory.create(TenantOperatorDialogContractTestModule, {
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
    baseUrl: `http://127.0.0.1:${address.port}`,
    otherTenantConversationId
  };
}

async function loginPilotTenantOperator(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/v1/auth/tenant/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: PILOT_OPERATOR_EMAIL,
      password: PILOT_OPERATOR_PASSWORD
    })
  });
  const payload = await response.json() as { data: { accessToken?: string; tenantId?: string } };
  assert.equal(response.status, 200);
  assert.equal(typeof payload.data.accessToken, "string");
  assert.equal(payload.data.accessToken!.length > 0, true);
  assert.equal(payload.data.tenantId, PILOT_TENANT_ID);
  return payload.data.accessToken!;
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

async function seedPilotOperator(repository: IdentityRepository): Promise<void> {
  await repository.saveTenantUser({
    device: "Contract test",
    email: PILOT_OPERATOR_EMAIL,
    id: PILOT_OPERATOR_USER_ID,
    inviteStatus: "accepted",
    lastActiveAt: new Date().toISOString(),
    mfa: "enabled",
    name: "Pilot Operator",
    risk: "low",
    role: "Admin",
    sessions: 0,
    status: "active",
    supportNotes: "Explicit tenant dialog contract fixture.",
    tenantId: PILOT_TENANT_ID
  });

  await repository.savePasswordCredential({
    algorithm: "sha256",
    email: PILOT_OPERATOR_EMAIL,
    hash: `sha256:${createHash("sha256").update(PILOT_OPERATOR_PASSWORD).digest("hex")}`,
    subjectId: PILOT_OPERATOR_USER_ID,
    updatedAt: new Date().toISOString(),
    version: 1
  });
}
