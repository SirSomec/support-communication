import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { ServiceAdminSessionGuard } from "../apps/api-gateway/src/identity/service-admin-session.guard.ts";
import { TenantOperatorAuthGuard } from "../apps/api-gateway/src/identity/tenant-operator-auth.guard.ts";
import { IdentityRepository, hashServiceAdminToken } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { SESSION_IDLE_TTL_MINUTES } from "../apps/api-gateway/src/identity/tenant-operator-auth.ts";
import { createSeededIdentityRepository } from "../apps/api-gateway/src/identity/seed.ts";

const HOUR_MS = 60 * 60 * 1000;
const IDLE_TTL_MS = SESSION_IDLE_TTL_MINUTES * 60 * 1000;

describe("session idle ttl contracts", () => {
  it("keeps the 12 hour idle ttl constant", () => {
    assert.equal(SESSION_IDLE_TTL_MINUTES, 12 * 60);
  });

  it("issues tenant operator sessions that live 12 hours", async () => {
    const repository = createSeededIdentityRepository();
    const before = Date.now();
    const created = await repository.createTenantOperatorSession({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const after = Date.now();

    const expiresAt = Date.parse(created.expiresAt);
    assert.ok(expiresAt >= before + IDLE_TTL_MS - HOUR_MS, "login expiry is at least ~12h away");
    assert.ok(expiresAt <= after + IDLE_TTL_MS + HOUR_MS, "login expiry is at most ~12h away");

    const resolved = await repository.findTenantOperatorSessionByAccessToken(created.accessToken);
    assert.ok(resolved, "fresh session resolves by access token");
    const sessionExpiresAt = Date.parse(resolved.session.expiresAt);
    assert.ok(sessionExpiresAt >= before + IDLE_TTL_MS - HOUR_MS);
    assert.ok(sessionExpiresAt <= after + IDLE_TTL_MS + HOUR_MS);
  });

  it("slides both session and access token expiry on activity", async () => {
    const repository = createSeededIdentityRepository();
    const created = await repository.createTenantOperatorSession({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const resolved = await repository.findTenantOperatorSessionByAccessToken(created.accessToken);
    assert.ok(resolved);
    const sessionId = resolved.session.id;
    const initialExpiresAt = Date.parse(resolved.session.expiresAt);

    // Активность спустя 6 часов: сессия должна прожить 12 часов от неё, а не от логина.
    const sixHoursLater = new Date(Date.now() + 6 * HOUR_MS);
    await repository.touchServiceAdminSessionActivity({ accessToken: created.accessToken, now: sixHoursLater });

    const extended = await repository.findServiceAdminSession(sessionId);
    assert.ok(extended);
    const extendedExpiresAt = Date.parse(extended.expiresAt);
    assert.equal(extendedExpiresAt, sixHoursLater.getTime() + IDLE_TTL_MS);
    assert.ok(extendedExpiresAt > initialExpiresAt, "activity extends the session");

    // Продление подняло и срок access-токена: активность через 17 часов после логина
    // (токен исходно жил бы 12) всё ещё находит валидную пару и продлевает её дальше.
    const seventeenHoursLater = new Date(Date.now() + 17 * HOUR_MS);
    await repository.touchServiceAdminSessionActivity({ accessToken: created.accessToken, now: seventeenHoursLater });
    const extendedAgain = await repository.findServiceAdminSession(sessionId);
    assert.ok(extendedAgain);
    assert.equal(Date.parse(extendedAgain.expiresAt), seventeenHoursLater.getTime() + IDLE_TTL_MS);
  });

  it("throttles frequent activity extensions", async () => {
    const repository = createSeededIdentityRepository();
    const created = await repository.createTenantOperatorSession({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const resolved = await repository.findTenantOperatorSessionByAccessToken(created.accessToken);
    assert.ok(resolved);
    const sessionId = resolved.session.id;

    const sixHoursLater = new Date(Date.now() + 6 * HOUR_MS);
    await repository.touchServiceAdminSessionActivity({ accessToken: created.accessToken, now: sixHoursLater });
    const extended = await repository.findServiceAdminSession(sessionId);
    assert.ok(extended);

    // Повторная активность через две минуты не должна писать новый срок (троттлинг 5 минут).
    const twoMinutesAfter = new Date(sixHoursLater.getTime() + 2 * 60 * 1000);
    await repository.touchServiceAdminSessionActivity({ accessToken: created.accessToken, now: twoMinutesAfter });
    const untouched = await repository.findServiceAdminSession(sessionId);
    assert.ok(untouched);
    assert.equal(untouched.expiresAt, extended.expiresAt);

    // А через десять минут — уже должна.
    const tenMinutesAfter = new Date(sixHoursLater.getTime() + 10 * 60 * 1000);
    await repository.touchServiceAdminSessionActivity({ accessToken: created.accessToken, now: tenMinutesAfter });
    const movedAgain = await repository.findServiceAdminSession(sessionId);
    assert.ok(movedAgain);
    assert.equal(Date.parse(movedAgain.expiresAt), tenMinutesAfter.getTime() + IDLE_TTL_MS);
  });

  it("does not resurrect revoked or expired sessions", async () => {
    const repository = createSeededIdentityRepository();
    const created = await repository.createTenantOperatorSession({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const resolved = await repository.findTenantOperatorSessionByAccessToken(created.accessToken);
    assert.ok(resolved);
    const sessionId = resolved.session.id;

    await repository.revokeTenantOperatorSession({ sessionId, token: created.accessToken });
    const revoked = await repository.findServiceAdminSession(sessionId);
    assert.ok(revoked?.revokedAt, "session is revoked");
    const revokedExpiresAt = revoked.expiresAt;

    await repository.touchServiceAdminSessionActivity({ accessToken: created.accessToken, now: new Date(Date.now() + HOUR_MS) });
    const afterTouch = await repository.findServiceAdminSession(sessionId);
    assert.equal(afterTouch?.expiresAt, revokedExpiresAt, "revoked session is not extended");

    // Просроченный токен (активность далеко за пределами TTL) тоже не продлевается.
    const second = await repository.createTenantOperatorSession({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const secondResolved = await repository.findTenantOperatorSessionByAccessToken(second.accessToken);
    assert.ok(secondResolved);
    const farBeyondTtl = new Date(Date.now() + IDLE_TTL_MS + 2 * HOUR_MS);
    await repository.touchServiceAdminSessionActivity({ accessToken: second.accessToken, now: farBeyondTtl });
    const secondSession = await repository.findServiceAdminSession(secondResolved.session.id);
    assert.equal(secondSession?.expiresAt, secondResolved.session.expiresAt, "expired token does not extend the session");
  });

  it("tenant operator guard reports activity for authorized requests", async () => {
    const repository = createSeededIdentityRepository();
    IdentityRepository.useDefault(repository);
    const created = await repository.createTenantOperatorSession({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    const touched: string[] = [];
    const originalTouch = repository.touchServiceAdminSessionActivity.bind(repository);
    repository.touchServiceAdminSessionActivity = (input) => {
      touched.push(input.accessToken);
      return originalTouch(input);
    };

    const guard = new TenantOperatorAuthGuard(reflectorForAction(undefined));
    const request = { headers: { authorization: `Bearer ${created.accessToken}` } };
    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);
    assert.deepEqual(touched, [created.accessToken], "guard touches session activity");

    await assert.rejects(
      () => guard.canActivate(executionContextForRequest({ headers: { authorization: "Bearer unknown-token" } })),
      /invalid or expired/
    );
    assert.equal(touched.length, 1, "denied request does not touch activity");
  });

  it("service admin guard extends a session close to expiry", async () => {
    Object.assign(process.env, { NODE_ENV: "test" });
    const repository = createSeededIdentityRepository();
    IdentityRepository.useDefault(repository);
    const session = await repository.createServiceAdminSession({
      actorId: "svc-admin-sliding",
      actorName: "Sliding Service Admin",
      adminEmail: "sliding-service-admin@example.com",
      allowedActions: ["tenants.manage"],
      availableOrganizations: [],
      currentTenantId: "",
      mfaVerified: true,
      ttlMinutes: 30
    });
    const now = Date.now();
    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
      accessTokenHash: hashServiceAdminToken("svc-sliding-access-token"),
      id: "svc-token-pair-sliding",
      issuedAt: new Date(now).toISOString(),
      refreshTokenExpiresAt: new Date(now + 14 * 24 * HOUR_MS).toISOString(),
      refreshTokenHash: hashServiceAdminToken("svc-sliding-refresh-token"),
      sessionId: session.id,
      subjectId: session.adminId
    });

    const guard = new ServiceAdminSessionGuard(reflectorForAction("tenants.manage"));
    const request = { headers: { authorization: "Bearer svc-sliding-access-token" } };
    assert.equal(await guard.canActivate(executionContextForRequest(request)), true);

    const extended = await repository.findServiceAdminSession(session.id);
    assert.ok(extended);
    const extendedExpiresAt = Date.parse(extended.expiresAt);
    assert.ok(
      extendedExpiresAt >= now + IDLE_TTL_MS - HOUR_MS,
      "authorized request extends the 30-minute session towards 12 hours"
    );
  });
});

function reflectorForAction(action: string | undefined): Reflector {
  return {
    getAllAndOverride: () => action
  } as unknown as Reflector;
}

function executionContextForRequest(request: object): ExecutionContext {
  return {
    getClass: () => Object,
    getHandler: () => Object,
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as unknown as ExecutionContext;
}
