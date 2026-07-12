import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ServiceAdminSessionGuard } from "../apps/api-gateway/src/identity/service-admin-session.guard.ts";
import { IdentityRepository, hashServiceAdminToken } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { createSeededIdentityRepository } from "../apps/api-gateway/src/identity/seed.ts";

describe("service admin session guard", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it("rejects demo headers in production even when env flag is set", async () => {
    Object.assign(process.env, requiredConfigEnv({
      ALLOW_DEMO_SERVICE_ADMIN_HEADERS: "true",
      DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key-0001",
      NODE_ENV: "production"
    }));

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    await assert.rejects(
      () => guard.canActivate(executionContextForRequest({
        headers: {
          "x-demo-service-admin-key": "dev-service-admin-key-0001",
          "x-demo-service-admin-actor-id": "demo-admin",
          "x-demo-service-admin-actor-name": "Demo Admin",
          "x-demo-service-admin-mfa-verified": "true",
          "x-demo-service-admin-session-expires-at": "2099-12-31T23:59:59.000Z",
          "x-demo-service-admin-permissions": "*"
        }
      })),
      /Bearer service-admin session is required/
    );
  });

  it("allows demo headers in test mode when explicitly enabled", async () => {
    Object.assign(process.env, requiredConfigEnv({
      ALLOW_DEMO_SERVICE_ADMIN_HEADERS: "true",
      DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key-0001",
      NODE_ENV: "test"
    }));

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    const request = {
      headers: {
        "x-demo-service-admin-key": "dev-service-admin-key-0001",
        "x-demo-service-admin-actor-id": "demo-admin",
        "x-demo-service-admin-actor-name": "Demo Admin",
        "x-demo-service-admin-mfa-verified": "true",
        "x-demo-service-admin-session-expires-at": "2099-12-31T23:59:59.000Z",
        "x-demo-service-admin-permissions": "tenants.manage,*"
      }
    };

    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);
    assert.equal(request.serviceAdminContext?.actor.id, "demo-admin");
  });

  it("rejects tenant admin bearer sessions even when they have wildcard permissions", async () => {
    Object.assign(process.env, requiredConfigEnv({ NODE_ENV: "test" }));
    const repository = createSeededIdentityRepository();
    IdentityRepository.useDefault(repository);
    const tenantSession = await repository.createTenantOperatorSession({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const resolvedTenantSession = await repository.findTenantOperatorSessionByAccessToken(tenantSession.accessToken);

    assert.ok(resolvedTenantSession?.session.id.startsWith("top-session_"));
    assert.deepEqual(resolvedTenantSession.permissions, ["*"]);

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    await assert.rejects(
      () => guard.canActivate(executionContextForRequest({
        headers: { authorization: `Bearer ${tenantSession.accessToken}` }
      })),
      /session_not_found/
    );
  });

  it("allows service-admin bearer sessions with wildcard permissions", async () => {
    Object.assign(process.env, requiredConfigEnv({ NODE_ENV: "test" }));
    const repository = createSeededIdentityRepository();
    IdentityRepository.useDefault(repository);
    const session = await repository.createServiceAdminSession({
      actorId: "svc-admin-wildcard",
      actorName: "Wildcard Service Admin",
      adminEmail: "wildcard-service-admin@example.com",
      allowedActions: ["*"],
      availableOrganizations: [],
      currentTenantId: "",
      mfaVerified: true,
      ttlMinutes: 30
    });
    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-12-31T23:59:59.000Z",
      accessTokenHash: hashServiceAdminToken("svc-wildcard-access-token"),
      id: "svc-token-pair-wildcard",
      issuedAt: "2026-07-10T00:00:00.000Z",
      refreshTokenExpiresAt: "2100-01-01T23:59:59.000Z",
      refreshTokenHash: hashServiceAdminToken("svc-wildcard-refresh-token"),
      sessionId: session.id,
      subjectId: session.adminId
    });

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    const request = { headers: { authorization: "Bearer svc-wildcard-access-token" } };

    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);
    assert.equal(request.serviceAdminContext?.sessionId, session.id);
    assert.deepEqual(request.serviceAdminContext?.permissions, ["*"]);
  });

  it("accepts bearer service-admin access tokens, rejects raw session ids and records permission denials", async () => {
    Object.assign(process.env, requiredConfigEnv({ NODE_ENV: "test" }));
    const repository = createSeededIdentityRepository();
    IdentityRepository.useDefault(repository);
    const session = await repository.createServiceAdminSession({
      actorId: "svc-admin-prod",
      actorName: "Production Admin",
      adminEmail: "production-admin@example.com",
      allowedActions: ["tenants.manage"],
      availableOrganizations: [],
      currentTenantId: "",
      mfaVerified: true,
      ttlMinutes: 30
    });
    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-12-31T23:59:59.000Z",
      accessTokenHash: hashServiceAdminToken("svc-access-token"),
      id: "svc-token-pair-001",
      issuedAt: "2026-07-02T00:00:00.000Z",
      refreshTokenExpiresAt: "2100-01-01T23:59:59.000Z",
      refreshTokenHash: hashServiceAdminToken("svc-refresh-token"),
      sessionId: session.id,
      subjectId: session.adminId
    });

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    const request = { headers: { authorization: "Bearer svc-access-token" } };
    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);

    await assert.rejects(
      () => guard.canActivate(executionContextForRequest({ headers: { authorization: `Bearer ${session.id}` } })),
      /session_not_found|Unauthorized/
    );

    const deniedGuard = new ServiceAdminSessionGuard(reflectorForAction("billing.change"));
    await assert.rejects(
      () => deniedGuard.canActivate(executionContextForRequest({ headers: { authorization: "Bearer svc-access-token" } })),
      /permission_denied|permission/
    );

    repository.revokeServiceAdminSession(session.id);
    await assert.rejects(
      () => guard.canActivate(executionContextForRequest({ headers: { authorization: "Bearer svc-access-token" } })),
      /session_revoked|revoked/
    );
  });
});

function requiredConfigEnv(overrides: Record<string, string>): Record<string, string> {
  return {
    API_VERSION: "v1",
    DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
    DEMO_SERVICE_ADMIN_KEY: "dev-service-admin-key",
    JWT_ACCESS_SECRET: "test-access-secret-16chars",
    JWT_REFRESH_SECRET: "test-refresh-secret-16chars",
    LOG_LEVEL: "info",
    MAIL_HOST: "127.0.0.1",
    MAIL_PORT: "1025",
    NODE_ENV: "test",
    PORT: "4191",
    PUBLIC_API_KEY_SECRET: "test-public-api-secret",
    REDIS_URL: "redis://127.0.0.1:6379",
    S3_ACCESS_KEY: "test-access-key",
    S3_BUCKET: "test-bucket",
    S3_ENDPOINT: "https://example.invalid/s3",
    S3_SECRET_KEY: "test-secret-key",
    ...overrides
  };
}

function reflectorForAction(action: string) {
  return {
    getAllAndOverride: () => action
  } as never;
}

function executionContextForRequest(request: { headers: Record<string, string> }) {
  return {
    getClass: () => ({}),
    getHandler: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request
    })
  };
}
