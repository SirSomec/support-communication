import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory, type INestApplication } from "@nestjs/core";
import { EnvelopeHttpExceptionFilter } from "../apps/api-gateway/dist/http-exception.filter.js";
import { IdentityModule } from "../apps/api-gateway/dist/identity/identity.module.js";
import { IdentityRepository } from "../apps/api-gateway/dist/identity/identity.repository.js";
import { resolveTenantOperatorPermissions } from "../apps/api-gateway/dist/identity/tenant-operator-auth.js";

const PILOT_TENANT_ID = "tenant-pilot-001";
const PILOT_OPERATOR_EMAIL = "operator@pilot-client.test";
const PILOT_OPERATOR_PASSWORD = "Pilot-Operator-2026!";
const PILOT_OPERATOR_USER_ID = "usr-volga-admin";

@Module({
  imports: [IdentityModule]
})
class IdentityContractTestModule {}

describe("tenant operator auth contracts", () => {
  const apps: INestApplication[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  it("returns bearer tokens, resolves state with Bearer and revokes on logout", async () => {
    const { baseUrl } = await createTestApiApp(apps);

    const anonymousSelectionResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/select`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: PILOT_OPERATOR_EMAIL, tenantId: PILOT_TENANT_ID })
    });
    assert.equal(anonymousSelectionResponse.status, 401);

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: PILOT_OPERATOR_EMAIL,
        password: PILOT_OPERATOR_PASSWORD
      })
    });
    const loginEnvelope = await loginResponse.json() as { data: Record<string, unknown> };

    assert.equal(loginResponse.status, 200);
    assert.equal(loginEnvelope.data.authenticated, true);
    assert.equal(typeof loginEnvelope.data.accessToken, "string");
    assert.equal(String(loginEnvelope.data.accessToken).length > 0, true);
    assert.equal(loginEnvelope.data.tenantId, PILOT_TENANT_ID);

    const invalidPasswordResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: PILOT_OPERATOR_EMAIL,
        password: "wrong-password"
      })
    });
    const invalidPasswordEnvelope = await invalidPasswordResponse.json() as { status: string };
    assert.equal(invalidPasswordResponse.status, 200);
    assert.equal(invalidPasswordEnvelope.status, "denied");

    const accessToken = String(loginEnvelope.data.accessToken);
    const stateResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/state`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const stateEnvelope = await stateResponse.json() as { data: Record<string, unknown> };

    assert.equal(stateResponse.status, 200);
    assert.equal(stateEnvelope.data.authenticated, true);
    assert.equal(stateEnvelope.data.tenantId, PILOT_TENANT_ID);
    assert.equal(typeof stateEnvelope.data.operator, "object");
    assert.equal((stateEnvelope.data.operator as Record<string, unknown>).email, PILOT_OPERATOR_EMAIL);

    const selectionResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/select`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ email: "untrusted@example.test", tenantId: PILOT_TENANT_ID })
    });
    const selectionEnvelope = await selectionResponse.json() as { data: Record<string, unknown>; status: string };
    assert.equal(selectionResponse.status, 200);
    assert.equal(selectionEnvelope.status, "ok");
    assert.equal(selectionEnvelope.data.tenantId, PILOT_TENANT_ID);

    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(logoutResponse.status, 200);

    const revokedStateResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/state`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(revokedStateResponse.status, 401);
  });

  it("completes tenant operator MFA challenge when pilot skip is disabled", async () => {
    const { baseUrl } = await createTestApiApp(apps, { nodeEnv: "test", skipTenantMfa: false });

    const passwordOnlyResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: PILOT_OPERATOR_EMAIL,
        password: PILOT_OPERATOR_PASSWORD
      })
    });
    const passwordOnlyEnvelope = await passwordOnlyResponse.json() as { data: Record<string, unknown>; partial?: boolean; status: string };
    assert.equal(passwordOnlyResponse.status, 200);
    assert.equal(passwordOnlyEnvelope.status, "ok");
    assert.equal(passwordOnlyEnvelope.partial, true);
    assert.equal(passwordOnlyEnvelope.data.authenticated, false);
    assert.equal(passwordOnlyEnvelope.data.tenantId, PILOT_TENANT_ID);
    assert.match(String(passwordOnlyEnvelope.data.mfaChallengeId), /^mfa_/);
    assert.equal(passwordOnlyEnvelope.data.nextStep, "otp");

    const completedResponse = await fetch(`${baseUrl}/api/v1/auth/tenant/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mfaChallengeId: passwordOnlyEnvelope.data.mfaChallengeId,
        otp: "123456"
      })
    });
    const completedEnvelope = await completedResponse.json() as { data: Record<string, unknown>; status: string };
    assert.equal(completedResponse.status, 200);
    assert.equal(completedEnvelope.status, "ok");
    assert.equal(completedEnvelope.data.authenticated, true);
    assert.equal(completedEnvelope.data.tenantId, PILOT_TENANT_ID);
    assert.equal(typeof completedEnvelope.data.accessToken, "string");
  });

  it("maps provisioned owner role to tenant administrator permissions even with stale role aliases", () => {
    const permissions = resolveTenantOperatorPermissions("Owner", [{
      actions: ["*"],
      aliases: ["admin", "administrator"],
      description: "Tenant administrator",
      groupIds: ["admins"],
      key: "admin",
      metadata: {}
    }]);

    assert.deepEqual(permissions, ["*"]);
  });

  it("maps seeded senior operator display role to senior permissions", () => {
    const permissions = resolveTenantOperatorPermissions("Senior operator", [{
      actions: ["dialogs.read", "templates.read", "quality.read"],
      aliases: ["senior", "senior_operator", "lead"],
      description: "Senior support operator",
      groupIds: ["senior-shifts"],
      key: "senior",
      metadata: {}
    }]);

    assert.deepEqual(permissions, ["dialogs.read", "templates.read", "quality.read"]);
  });
});

async function createTestApiApp(
  apps: INestApplication[],
  options: { nodeEnv?: string; skipTenantMfa?: boolean } = {}
): Promise<{ app: INestApplication; baseUrl: string }> {
  process.env.NODE_ENV = options.nodeEnv ?? "test";
  process.env.API_VERSION = "v1";
  process.env.DATABASE_URL = "https://example.invalid/database";
  process.env.REDIS_URL = "https://example.invalid/redis";
  process.env.S3_ENDPOINT = "https://example.invalid/s3";
  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_ACCESS_KEY = "test-access-key";
  process.env.S3_SECRET_KEY = "test-secret-key";
  process.env.DEMO_SERVICE_ADMIN_KEY = "dev-service-admin-key-0001";
  process.env.PILOT_SKIP_MFA = options.skipTenantMfa === false ? "false" : "true";
  process.env.AUTH_REQUIRE_TENANT_MFA = options.skipTenantMfa === false ? "true" : "false";

  const repository = IdentityRepository.inMemory();
  await seedPilotOperator(repository);
  IdentityRepository.useDefault(repository);

  const app = await NestFactory.create(IdentityContractTestModule, {
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
    app,
    baseUrl: `http://127.0.0.1:${address.port}`
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
    supportNotes: "Explicit tenant auth contract fixture.",
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
