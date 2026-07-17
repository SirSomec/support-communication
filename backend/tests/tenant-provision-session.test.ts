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
class TenantProvisionSessionTestModule {}

describe("tenant provision session contracts", () => {
  const apps: INestApplication[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  it("returns owner session and rejects duplicate slug and admin email", async () => {
    const { baseUrl } = await createTestApiApp(apps);
    const first = await provisionTenant(baseUrl, {
      tenant: { name: "Acme Pilot", slug: "acme-pilot", region: "ru-1" },
      admin: { name: "Owner", email: "owner@acme-pilot.test", password: "Owner-2026!" },
      channel: { type: "sdk", domain: "acme.example" },
      plan: { id: "trial", trial: true }
    });

    assert.equal(first.response.status, 200);
    assert.equal(typeof first.envelope.data.session?.accessToken, "string");
    assert.equal("refreshToken" in first.envelope.data.session, false);
    assert.equal(first.envelope.data.tenantId, "tenant-acme-pilot");
    assert.equal(Array.isArray(first.envelope.data.defaultWorkspaceIds), true);

    const duplicateSlug = await provisionTenant(baseUrl, {
      tenant: { name: "Acme Pilot 2", slug: "acme-pilot", region: "ru-1" },
      admin: { name: "Other Owner", email: "other@acme-pilot.test", password: "Owner-2026!" },
      plan: { id: "trial", trial: true }
    });
    assert.equal(duplicateSlug.envelope.error?.code, "tenant_slug_duplicate");

    const duplicateEmail = await provisionTenant(baseUrl, {
      tenant: { name: "Another Pilot", slug: "another-pilot", region: "ru-1" },
      admin: { name: "Owner", email: "owner@acme-pilot.test", password: "Owner-2026!" },
      plan: { id: "trial", trial: true }
    });
    assert.equal(duplicateEmail.envelope.error?.code, "tenant_admin_email_duplicate");

    const invalidDomain = await provisionTenant(baseUrl, {
      tenant: { name: "Bad Domain", slug: "bad-domain", region: "ru-1" },
      admin: { name: "Owner", email: "owner@bad-domain.test", password: "Owner-2026!" },
      channel: { type: "sdk", domain: "not-a-domain" },
      plan: { id: "trial", trial: true }
    });
    assert.equal(invalidDomain.envelope.error?.code, "tenant_provision_channel_domain_invalid");

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
    assert.equal(Array.isArray(tenantLoginEnvelope.data.permissions), true);
    assert.equal((tenantLoginEnvelope.data.permissions as string[]).includes("*"), true);
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
  const envelope = await response.json() as { data: Record<string, any>; error?: { code?: string } };

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

  const app = await NestFactory.create(TenantProvisionSessionTestModule, {
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

