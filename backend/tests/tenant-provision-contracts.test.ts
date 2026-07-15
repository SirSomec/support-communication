import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { Module } from "@nestjs/common";
import { NestFactory, type INestApplication } from "@nestjs/core";
import { BillingRepository } from "../apps/api-gateway/dist/billing/billing.repository.js";
import { EnvelopeHttpExceptionFilter } from "../apps/api-gateway/dist/http-exception.filter.js";
import { IdentityModule } from "../apps/api-gateway/dist/identity/identity.module.js";
import { IdentityRepository } from "../apps/api-gateway/dist/identity/identity.repository.js";
import { IntegrationRepository } from "../apps/api-gateway/dist/integrations/integration.repository.js";

@Module({
  imports: [IdentityModule]
})
class TenantProvisionContractTestModule {}

describe("tenant provision contracts", () => {
  const apps: INestApplication[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  it("provisions tenant with admin and sdk key", async () => {
    const { baseUrl } = await createTestApiApp(apps);
    const provisionResponse = await fetch(`${baseUrl}/api/v1/tenants/provision`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        tenant: { name: "Acme Pilot", slug: "acme-pilot", region: "ru-1" },
        admin: { name: "Owner", email: "owner@acme-pilot.test", password: "Owner-2026!" },
        channel: { type: "sdk", domain: "acme.example" },
        plan: { id: "trial", trial: true }
      })
    });
    const provisionEnvelope = await provisionResponse.json() as { data: Record<string, any> };

    assert.equal(provisionResponse.status, 200);
    assert.equal(provisionEnvelope.data.tenant.id, "tenant-acme-pilot");
    assert.equal(provisionEnvelope.data.admin.email, "owner@acme-pilot.test");
    assert.equal(typeof provisionEnvelope.data.publicApiKey, "string");
    assert.equal(/^sk_stage_[a-f0-9]+$/i.test(String(provisionEnvelope.data.publicApiKey)), true);
    assert.equal(String(provisionEnvelope.data.embedSnippet).includes("data-api-key"), true);
    assert.equal((await IdentityRepository.default().findTenant("tenant-acme-pilot"))?.id, "tenant-acme-pilot");

    // The tenant owner grant must reference the canonical "admin" role key: it
    // satisfies the rbac_role_grants → permission_roles(key) FK on Postgres and
    // is actually matched at auth time (permission checks resolve "Owner" → admin).
    const activePolicy = await IdentityRepository.default().getActiveRbacPolicyVersion();
    const ownerGrants = await IdentityRepository.default().listRbacRoleGrants({ policyVersionId: activePolicy?.id, tenantId: "tenant-acme-pilot" });
    assert.equal(ownerGrants.length >= 1, true);
    assert.equal(ownerGrants.every((grant) => grant.roleKey === "admin"), true);
    assert.equal(ownerGrants.some((grant) => grant.roleKey === "owner"), false);

    const tenantLogin = await fetch(`${baseUrl}/api/v1/auth/tenant/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "owner@acme-pilot.test",
        password: "Owner-2026!"
      })
    });
    const tenantLoginEnvelope = await tenantLogin.json() as { data: Record<string, unknown> };

    assert.equal(tenantLogin.status, 200);
    assert.equal(tenantLoginEnvelope.data.authenticated, true);
    assert.equal(tenantLoginEnvelope.data.tenantId, "tenant-acme-pilot");
  });

  it("provisions separate admins for consecutive onboarding runs", async () => {
    const { baseUrl } = await createTestApiApp(apps);

    const first = await provisionTenant(baseUrl, {
      tenant: { name: "First Pilot", slug: "first-pilot", region: "ru-1" },
      admin: { name: "First Owner", email: "owner@first-pilot.test", password: "Owner-2026!" },
      channel: { type: "sdk", domain: "first.example" },
      plan: { id: "trial", trial: true }
    });
    const second = await provisionTenant(baseUrl, {
      tenant: { name: "Second Pilot", slug: "second-pilot", region: "ru-1" },
      admin: { name: "Second Owner", email: "owner@second-pilot.test", password: "Owner-2026!" },
      channel: { type: "sdk", domain: "second.example" },
      plan: { id: "trial", trial: true }
    });

    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 200);
    assert.notEqual(first.envelope.data.admin.id, second.envelope.data.admin.id);

    const firstUsers = await IdentityRepository.default().findTenantUsers("tenant-first-pilot");
    const secondUsers = await IdentityRepository.default().findTenantUsers("tenant-second-pilot");

    assert.equal(firstUsers.some((user) => user.email === "owner@first-pilot.test"), true);
    assert.equal(secondUsers.some((user) => user.email === "owner@second-pilot.test"), true);
  });
});

async function provisionTenant(baseUrl: string, payload: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/api/v1/tenants/provision`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const envelope = await response.json() as { data: Record<string, any> };

  return { envelope, response };
}
async function createTestApiApp(apps: INestApplication[]): Promise<{ baseUrl: string }> {
  process.env.NODE_ENV = "test";
  process.env.API_VERSION = "v1";
  process.env.DATABASE_URL = "https://example.invalid/database";
  process.env.REDIS_URL = "https://example.invalid/redis";
  process.env.S3_ENDPOINT = "https://example.invalid/s3";
  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_ACCESS_KEY = "test-access-key";
  process.env.S3_SECRET_KEY = "test-secret-key";
  process.env.DEMO_SERVICE_ADMIN_KEY = "dev-service-admin-key-0001";
  process.env.PILOT_SKIP_MFA = "true";

  IdentityRepository.useDefault(IdentityRepository.inMemory());
  BillingRepository.useDefault(BillingRepository.inMemory());
  IntegrationRepository.useDefault(IntegrationRepository.inMemory());

  const app = await NestFactory.create(TenantProvisionContractTestModule, {
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
