import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";
import { resolveServiceAdminContext } from "@support-communication/auth-context";
import { configureRepositoryBootstrap } from "@support-communication/database";
import { BillingRepository as RuntimeBillingRepository } from "../apps/api-gateway/src/billing/billing.repository.ts";
import { bootstrapBillingState } from "../apps/api-gateway/src/billing/seed.ts";
import { configureIdentityRepository } from "../apps/api-gateway/src/identity/bootstrap.ts";
import { AuthService } from "../apps/api-gateway/src/identity/auth.service.ts";
import { ServiceAdminSessionGuard } from "../apps/api-gateway/src/identity/service-admin-session.guard.ts";
import { IdentityRepository as RuntimeIdentityRepository, hashServiceAdminToken } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { bootstrapIdentityState } from "../apps/api-gateway/src/identity/seed.ts";
import { createMfaOtpRuntime } from "../apps/api-gateway/src/identity/mfa-otp.ts";

const IdentityRepository = {
  default: () => RuntimeIdentityRepository.default(),
  inMemory: () => RuntimeIdentityRepository.inMemory(bootstrapIdentityState()),
  useDefault: (repository: RuntimeIdentityRepository) => RuntimeIdentityRepository.useDefault(repository)
};

describe("persistent backend foundation and identity services", () => {
  beforeEach(() => {
    RuntimeBillingRepository.useDefault(RuntimeBillingRepository.inMemory(bootstrapBillingState()));
    RuntimeIdentityRepository.useDefault(RuntimeIdentityRepository.inMemory(bootstrapIdentityState()));
  });
  it("uses the shared repository bootstrap helper for Prisma client selection", () => {
    const configuredDefaults: string[] = [];
    const prismaFactoryCalls: Array<{ datasourceUrl?: string }> = [];
    const repository = configureRepositoryBootstrap({
      createPrismaRepository: (client) => `prisma:${client}`,
      prismaClientFactory: (options) => {
        prismaFactoryCalls.push(options);
        return "client";
      },
      source: { DATABASE_URL: "postgres://support" },
      useDefault: (next) => {
        configuredDefaults.push(next);
      }
    });

    assert.equal(repository, "prisma:client");
    assert.deepEqual(configuredDefaults, ["prisma:client"]);
    assert.deepEqual(prismaFactoryCalls, [{ datasourceUrl: "postgres://support" }]);

    const withoutDatabaseUrl = configureRepositoryBootstrap({
      createPrismaRepository: (client) => `prisma:${client}`,
      prismaClientFactory: (options) => {
        assert.equal(options.datasourceUrl, undefined);
        return "client-no-url";
      },
      source: {},
      useDefault: () => undefined
    });
    assert.equal(withoutDatabaseUrl, "prisma:client-no-url");
  });

  it("auth state fails closed for unverified and expired persisted sessions", async () => {
    const repository = IdentityRepository.inMemory();
    const auth = new AuthService(repository);
    const unverified = await repository.createServiceAdminSession({
      actorId: "svc-unverified",
      actorName: "Unverified Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: false,
      ttlMinutes: 30
    });
    const expired = await repository.createServiceAdminSession({
      actorId: "svc-expired",
      actorName: "Expired Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: true,
      ttlMinutes: -1
    });

    const unverifiedState = await auth.getAuthState({ sessionId: unverified.id });
    assert.equal(unverifiedState.status, "denied");
    assert.equal(unverifiedState.data.authenticated, false);
    assert.equal(unverifiedState.error?.code, "mfa_required");

    const expiredState = await auth.getAuthState({ sessionId: expired.id });
    assert.equal(expiredState.status, "denied");
    assert.equal(expiredState.data.authenticated, false);
    assert.equal(expiredState.error?.code, "session_expired");
  });

  it("resolves production service-admin context from persisted sessions and fails closed", async () => {
    const repository = IdentityRepository.inMemory();
    const session = repository.createServiceAdminSession({
      actorId: "svc-admin-prod",
      actorName: "Production Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: true,
      ttlMinutes: 30
    });

    const allowed = resolveServiceAdminContext({
      headers: { authorization: `Bearer ${session.id}` },
      requiredAction: "tenants.manage",
      sessionLookup: (sessionId) => repository.findServiceAdminSession(sessionId)
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.actor.id, "svc-admin-prod");
    assert.deepEqual(allowed.permissions, ["tenants.manage"]);

    const deniedPermission = resolveServiceAdminContext({
      headers: { authorization: `Bearer ${session.id}` },
      requiredAction: "billing.change",
      sessionLookup: (sessionId) => repository.findServiceAdminSession(sessionId)
    });
    assert.equal(deniedPermission.allowed, false);
    assert.equal(deniedPermission.code, "permission_denied");

    const missingSession = resolveServiceAdminContext({
      headers: { authorization: "Bearer missing-session" },
      requiredAction: "tenants.manage",
      sessionLookup: (sessionId) => repository.findServiceAdminSession(sessionId)
    });
    assert.equal(missingSession.allowed, false);
    assert.equal(missingSession.code, "session_not_found");
  });

  it("production guard uses persisted bearer sessions and ignores spoofed permission headers", async () => {
    const repository = IdentityRepository.inMemory();
    IdentityRepository.useDefault(repository);
    const session = repository.createServiceAdminSession({
      actorId: "svc-admin-prod",
      actorName: "Production Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: true,
      ttlMinutes: 30
    });
    repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-12-31T23:59:59.000Z",
      accessTokenHash: hashServiceAdminToken("prod-access-token"),
      id: "prod-token-pair",
      issuedAt: "2026-07-02T00:00:00.000Z",
      refreshTokenExpiresAt: "2100-01-01T23:59:59.000Z",
      refreshTokenHash: hashServiceAdminToken("prod-refresh-token"),
      sessionId: session.id,
      subjectId: session.adminId
    });

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    const request = {
      headers: {
        authorization: "Bearer prod-access-token",
        "x-demo-service-admin-actor-id": "spoofed-admin",
        "x-demo-service-admin-actor-name": "Spoofed Admin",
        "x-demo-service-admin-mfa-verified": "true",
        "x-demo-service-admin-permissions": "*",
        "x-demo-service-admin-session-expires-at": "2999-01-01T00:00:00.000Z"
      }
    };

    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);
    assert.equal(request.serviceAdminContext.actor.id, "svc-admin-prod");
    assert.equal(request.serviceAdminContext.currentTenantId, undefined);
    assert.equal(request.serviceAdminContext.sessionId, session.id);
    assert.deepEqual(request.serviceAdminContext.permissions, ["tenants.manage"]);

    const deniedGuard = new ServiceAdminSessionGuard(reflectorForAction("billing.change"));
    await assert.rejects(
      () => deniedGuard.canActivate(executionContextForRequest({ headers: { authorization: "Bearer prod-access-token", "x-demo-service-admin-permissions": "*" } })),
      /permission_denied|permission/
    );
    const denials = await repository.listPermissionDenialEvents();
    assert.equal(denials.length, 1);
    assert.equal(denials[0].actorId, "svc-admin-prod");
    assert.equal(denials[0].action, "billing.change");
    assert.equal(denials[0].resource, "service-admin");
    assert.equal(denials[0].roleKey, "service_admin");
    assert.equal(denials[0].immutable, true);

    repository.revokeServiceAdminSession(session.id);
    await assert.rejects(
      () => guard.canActivate(executionContextForRequest({ headers: { authorization: "Bearer prod-access-token" } })),
      /session_revoked|revoked/
    );
  });

  it("production guard resolves bearer access tokens through hashed service-admin token storage", async () => {
    const repository = IdentityRepository.inMemory();
    IdentityRepository.useDefault(repository);
    const session = repository.createServiceAdminSession({
      actorId: "svc-admin-token-prod",
      actorName: "Production Token Admin",
      allowedActions: ["tenants.manage"],
      mfaVerified: true,
      ttlMinutes: 30
    });
    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
      accessTokenHash: hashServiceAdminTokenForTest("guard-access-token"),
      id: "sat_pair_guard_prod",
      issuedAt: "2026-06-29T10:00:00.000Z",
      refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
      refreshTokenHash: hashServiceAdminTokenForTest("guard-refresh-token"),
      sessionId: session.id,
      subjectId: "svc-admin-token-prod"
    });

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    const request = {
      headers: {
        authorization: "Bearer guard-access-token",
        "x-service-admin-session-id": "spoofed-session-id"
      }
    };

    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);
    assert.equal(request.serviceAdminContext.actor.id, "svc-admin-token-prod");
    assert.equal(request.serviceAdminContext.sessionId, session.id);
  });

  it("realtime socket auth resolves bearer access tokens through hashed service-admin token storage", async () => {
    const repository = IdentityRepository.inMemory();
    IdentityRepository.useDefault(repository);
    const session = repository.createServiceAdminSession({
      actorId: "svc-admin-realtime-token",
      actorName: "Realtime Token Admin",
      allowedActions: ["realtime.events.read"],
      mfaVerified: true,
      ttlMinutes: 30
    });
    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
      accessTokenHash: hashServiceAdminTokenForTest("realtime-access-token"),
      id: "sat_pair_realtime_prod",
      issuedAt: "2026-06-29T10:00:00.000Z",
      refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
      refreshTokenHash: hashServiceAdminTokenForTest("realtime-refresh-token"),
      sessionId: session.id,
      subjectId: "svc-admin-realtime-token"
    });
    const realtimeModule = await import("../apps/api-gateway/src/conversation/realtime.websocket.ts") as Record<string, unknown>;
    const authorizeRealtimeSocket = realtimeModule.authorizeRealtimeSocket as ((headers: Record<string, string>, config: Record<string, string>) => Promise<{ allowed: boolean }>) | undefined;

    assert.equal(typeof authorizeRealtimeSocket, "function");
    const auth = await authorizeRealtimeSocket({
      authorization: "Bearer realtime-access-token",
      "x-service-admin-session-id": "spoofed-session-id"
    }, {
      DEMO_SERVICE_ADMIN_KEY: "demo-key",
      NODE_ENV: "production"
    });

    assert.equal(auth.allowed, true);
  });

  it("production guard rejects empty bearer tokens even when a session-id fallback header is present", async () => {
    const previous = snapshotEnv();
    try {
      Object.assign(process.env, requiredConfigEnv({
        DEMO_SERVICE_ADMIN_KEY: "prod-service-admin-key",
        NODE_ENV: "production"
      }));
      const repository = IdentityRepository.default();
      const session = repository.createServiceAdminSession({
        actorId: "svc-admin-prod-empty-bearer",
        actorName: "Prod Empty Bearer",
        allowedActions: ["tenants.manage"],
        mfaVerified: true,
        ttlMinutes: 30
      });

      const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
      await assert.rejects(
        () => guard.canActivate(executionContextForRequest({
          headers: {
            authorization: "Bearer ",
            "x-service-admin-session-id": session.id
          }
        })),
        /Bearer service-admin session is required|session_not_found|unauthorized/i
      );
    } finally {
      restoreEnv(previous);
      configureIdentityRepository({ repository: IdentityRepository.inMemory() });
    }
  });

  it("rejects spoofable demo service-admin headers outside development and test", async () => {
    const previous = snapshotEnv();
    try {
      Object.assign(process.env, requiredConfigEnv({
        DEMO_SERVICE_ADMIN_KEY: "prod-service-admin-key",
        NODE_ENV: "production"
      }));

      const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
      await assert.rejects(
        () => guard.canActivate(executionContextForRequest({
          headers: {
            "x-demo-service-admin-key": "prod-service-admin-key",
            "x-demo-service-admin-actor-id": "spoofed-admin",
            "x-demo-service-admin-actor-name": "Spoofed Admin",
            "x-demo-service-admin-mfa-verified": "true",
            "x-demo-service-admin-permissions": "*",
            "x-demo-service-admin-session-expires-at": "2999-01-01T00:00:00.000Z"
          }
        })),
        /Bearer service-admin session is required/
      );
    } finally {
      restoreEnv(previous);
    }
  });

  it("creates persisted service-admin sessions after MFA without demo headers in production", async () => {
    const previous = snapshotEnv();
    try {
      Object.assign(process.env, requiredConfigEnv({
        DEMO_SERVICE_ADMIN_KEY: "prod-service-admin-key",
        NODE_ENV: "production"
      }));
      const repository = IdentityRepository.inMemory();
      const auth = new AuthService(repository, createMfaOtpRuntime({
        delivery: {
          async send({ challengeId }) {
            return { providerMessageId: `test-${challengeId}` };
          }
        },
        generateOtp: () => "123456",
        hashKey: "production-session-contract-mfa-key"
      }));
      const challenge = await auth.login({
        email: "service-admin@example.com",
        password: "correct-password"
      });
      let sessionsCreated = 0;
      const createServiceAdminSession = repository.createServiceAdminSession.bind(repository);
      repository.createServiceAdminSession = ((input) => {
        sessionsCreated += 1;
        return createServiceAdminSession(input);
      }) as typeof repository.createServiceAdminSession;

      const completion = await auth.login({
        email: "service-admin@example.com",
        mfaChallengeId: challenge.data.mfaChallengeId,
        otp: "123456",
        password: "correct-password"
      });

      assert.equal(completion.status, "ok");
      assert.equal(completion.data.authenticated, true);
      assert.equal(typeof completion.data.accessToken, "string");
      assert.equal(sessionsCreated, 1);
    } finally {
      restoreEnv(previous);
    }
  });

  it("requires explicit service-admin action metadata on every guarded controller route", () => {
    const controllerRoot = new URL("../apps/api-gateway/src/", import.meta.url);
    const missing: string[] = [];

    for (const fileUrl of listControllerFiles(controllerRoot)) {
      const content = readFileSync(fileUrl, "utf8");
      if (!content.includes("ServiceAdminSessionGuard")) {
        continue;
      }

      const lines = content.split(/\r?\n/);
      let classGuarded = false;
      let decorators: string[] = [];
      for (let index = 0; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        if (trimmed.startsWith("@")) {
          decorators.push(trimmed);
          continue;
        }

        if (/^export class \w+/.test(trimmed)) {
          classGuarded = decorators.some((decorator) => decorator.includes("ServiceAdminSessionGuard"));
          decorators = [];
          continue;
        }

        const routeDecorated = decorators.some((decorator) => /^@(Delete|Get|Patch|Post|Put)\b/.test(decorator));
        const methodGuarded = decorators.some((decorator) => decorator.includes("ServiceAdminSessionGuard"));
        const methodMatch = /^([a-zA-Z_$][\w$]*)\s*\(/.exec(trimmed);
        if (routeDecorated && methodMatch && (classGuarded || methodGuarded) && !decorators.some((decorator) => decorator.startsWith("@RequireServiceAdminAction"))) {
          missing.push(`${fileUrl.pathname}:${index + 1}:${methodMatch[1]}`);
        }

        if (trimmed && !trimmed.startsWith("//")) {
          decorators = [];
        }
      }
    }

    assert.deepEqual(missing, []);
  });
});

function hashServiceAdminTokenForTest(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function executionContextForRequest(request: Record<string, unknown>) {
  return {
    getClass: () => function Controller() {},
    getHandler: () => function handler() {},
    switchToHttp: () => ({
      getRequest: () => request
    })
  };
}

function reflectorForAction(action: string) {
  return {
    getAllAndOverride: () => action
  };
}

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
    S3_ACCESS_KEY: "minio",
    S3_BUCKET: "support-communication-local",
    S3_ENDPOINT: "http://127.0.0.1:9000",
    S3_SECRET_KEY: "minio-password",
    SERVICE_NAME: "api-gateway",
    ...overrides
  };
}

function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

function restoreEnv(previous: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, previous);
}

function listControllerFiles(root: URL): URL[] {
  const files: URL[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, root);
    if (entry.isDirectory()) {
      files.push(...listControllerFiles(child));
    } else if (entry.name.endsWith(".controller.ts")) {
      files.push(child);
    }
  }

  return files;
}
