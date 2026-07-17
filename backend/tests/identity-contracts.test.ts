import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beforeEach, describe, it } from "node:test";
import { AuthService } from "../apps/api-gateway/src/identity/auth.service.ts";
import {
  listTenantMembershipsForEmail,
  resetIdentityAuthFlowStore
} from "../apps/api-gateway/src/identity/identity-auth-flow.repository.ts";
import { IdentityRepository as RuntimeIdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { bootstrapIdentityState } from "../apps/api-gateway/src/identity/seed.ts";
import { createMfaOtpRuntime } from "../apps/api-gateway/src/identity/mfa-otp.ts";
import { PermissionService } from "../apps/api-gateway/src/identity/permission.service.ts";
import { SettingsEmployeeService } from "../apps/api-gateway/src/identity/settings-employee.service.ts";
import { SettingsRulesService } from "../apps/api-gateway/src/identity/settings-rules.service.ts";
import { TenantService } from "../apps/api-gateway/src/identity/tenant.service.ts";
import { identityPermissionRoleCatalog } from "../apps/api-gateway/src/identity/runtime-catalog.ts";

process.env.NODE_ENV = "test";
process.env.MFA_OTP_DELIVERY_MODE = "deterministic";

type IdentityRepository = RuntimeIdentityRepository;
const IdentityRepository = {
  inMemory: () => RuntimeIdentityRepository.inMemory(bootstrapIdentityState())
};

interface DeliveredRecoveryToken {
  email: string;
  expiresAt: string;
  recoveryToken: string;
  requestId: string;
}

function createTestMfaOtpRuntime(deliveredRecoveryTokens: DeliveredRecoveryToken[] = []) {
  return createMfaOtpRuntime({
    delivery: {
      async send({ challengeId }) {
        return { providerMessageId: `test-${challengeId}` };
      },
      async sendRecovery(input) {
        deliveredRecoveryTokens.push({ ...input });
        return { providerMessageId: `test-${input.requestId}` };
      }
    },
    generateOtp: () => "123456",
    hashKey: "identity-contract-mfa-otp-hash-key"
  });
}

describe("phase 1 identity, tenant and RBAC backend contracts", () => {
  beforeEach(() => {
    RuntimeIdentityRepository.useDefault(RuntimeIdentityRepository.inMemory(bootstrapIdentityState()));
  });
  it("models password and MFA login lifecycle with audit metadata", async () => {
    const auth = new AuthService();

    const missingPassword = await auth.login({ email: "service-admin@example.com" });
    assert.equal(missingPassword.status, "invalid");
    assert.equal(missingPassword.error?.code, "password_required");
    assert.equal(missingPassword.data.authenticated, false);
    assert.equal(missingPassword.data.nextStep, "password");

    const passwordOnly = await auth.login({
      email: "service-admin@example.com",
      password: "correct-password"
    });
    assert.equal(passwordOnly.status, "ok");
    assert.equal(passwordOnly.partial, true);
    assert.equal(passwordOnly.meta.source, "api");
    assert.equal(passwordOnly.meta.apiVersion, "v1");
    assert.match(passwordOnly.traceId, /^trc_authService_login_/);
    assert.equal(passwordOnly.data.authState, "mfa_required");
    assert.match(passwordOnly.data.mfaChallengeId, /^mfa_/);

    const publicOtpCompletion = await auth.login({
      email: "service-admin@example.com",
      mfaChallengeId: passwordOnly.data.mfaChallengeId,
      password: "correct-password",
      otp: "123456"
    });
    assert.equal(publicOtpCompletion.status, "ok");
    assert.equal(publicOtpCompletion.data.authenticated, true);
    assert.equal(publicOtpCompletion.data.authState, "mfa_verified");
    assert.ok(publicOtpCompletion.data.accessToken || publicOtpCompletion.data.session?.id);

    const verified = publicOtpCompletion;
    assert.equal(verified.status, "ok");
    assert.equal(verified.data.authenticated, true);
    assert.equal(verified.data.session.authState, "mfa_verified");
    assert.equal(verified.data.session.currentTenantId, "tenant-volga");
    assert.equal(verified.data.session.adminId, "svc-admin-001");
    assert.equal(verified.data.session.adminName, "service-admin@example.com");
    assert.ok(Array.isArray(verified.data.session.allowedActions));
    assert.equal(verified.data.session.allowedActions.includes("service-admin.users.read"), true);
    assert.equal(verified.data.session.allowedActions.includes("service-admin.users.write"), true);
    assert.equal(verified.data.session.allowedActions.includes("operations.read"), true);
    assert.equal(verified.data.session.allowedActions.includes("operations.write"), true);
    assert.equal(verified.data.session.allowedActions.includes("security.review"), true);
    assert.match(verified.data.auditEvent.id, /^evt_auth_/);
    assert.equal(verified.data.auditEvent.immutable, true);
  });

  it("denies invalid password attempts before MFA and records credential audit metadata", async () => {
    const repository = IdentityRepository.inMemory() as IdentityRepository & {
      listCredentialAuditEvents(subjectId: string): unknown[];
    };
    const auth = new AuthService(repository);

    const denied = await auth.login({
      email: "service-admin@example.com",
      password: "wrong-password"
    });

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "invalid_credentials");
    assert.equal(denied.data.authenticated, false);
    assert.equal(denied.data.authState, "anonymous");
    assert.equal(denied.data.nextStep, "password");
    const auditEvents = await repository.listCredentialAuditEvents("svc-admin-001");
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].action, "credential.password.verify");
    assert.equal(auditEvents[0].result, "denied");
    assert.equal(auditEvents[0].immutable, true);
  });

  it("denies tenant operator credentials on the service-admin login endpoint", async () => {
    const repository = IdentityRepository.inMemory();
    const auth = new AuthService(repository);

    const denied = await auth.login({
      email: "mira@northstar.example",
      password: "correct-password"
    });

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "service_admin_subject_required");
    assert.equal(denied.data.authenticated, false);
    assert.equal((await repository.findServiceAdminSessionByAccessToken("correct-password")), undefined);
  });

  it("completes tenant operator MFA challenges without pilot bypass", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalPilotSkipMfa = process.env.PILOT_SKIP_MFA;
    process.env.NODE_ENV = "staging";
    process.env.PILOT_SKIP_MFA = "true";
    try {
      const repository = IdentityRepository.inMemory();
      const auth = new AuthService(repository, createTestMfaOtpRuntime());

      const passwordOnly = await auth.loginTenantOperator({
        email: "sergey@volga.example",
        password: "correct-password"
      });
      assert.equal(passwordOnly.status, "ok");
      assert.equal(passwordOnly.partial, true);
      assert.equal(passwordOnly.data.authenticated, false);
      assert.equal(passwordOnly.data.tenantId, "tenant-volga");
      assert.equal(passwordOnly.data.operator, null);
      assert.match(String(passwordOnly.data.mfaChallengeId), /^mfa_/);
      assert.equal(passwordOnly.data.nextStep, "otp");

      const completed = await auth.loginTenantOperator({
        mfaChallengeId: String(passwordOnly.data.mfaChallengeId),
        otp: "123456"
      });
      assert.equal(completed.status, "ok");
      assert.equal(completed.data.authenticated, true);
      assert.equal(completed.data.tenantId, "tenant-volga");
      assert.equal(typeof completed.data.accessToken, "string");
      assert.equal("refreshToken" in completed.data, false);
      assert.equal(completed.data.operator?.email, "sergey@volga.example");
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalPilotSkipMfa === undefined) {
        delete process.env.PILOT_SKIP_MFA;
      } else {
        process.env.PILOT_SKIP_MFA = originalPilotSkipMfa;
      }
    }
  });

  it("keeps tenant membership selection stateless across auth flow store resets", async () => {
    const repository = IdentityRepository.inMemory();
    const auth = new AuthService(repository);

    const multiTenantChallenge = await auth.loginTenantOperator({
      email: "multi@example.com",
      password: "correct-password"
    });

    assert.equal(multiTenantChallenge.status, "denied");
    assert.equal(multiTenantChallenge.error?.code, "multi_tenant_membership");
    assert.equal(multiTenantChallenge.data.memberships?.length, 2);

    resetIdentityAuthFlowStore();
    const selected = await auth.selectTenant({
      email: "multi@example.com",
      tenantId: "tenant-lumen"
    });

    assert.equal(selected.status, "ok");
    assert.equal(selected.data.tenantId, "tenant-lumen");
    assert.equal(selected.data.role, "Senior operator");

    resetIdentityAuthFlowStore();
    const completed = await auth.loginTenantOperator({
      email: "multi@example.com",
      password: "correct-password",
      tenantId: "tenant-lumen"
    } as Parameters<AuthService["loginTenantOperator"]>[0] & { tenantId: string });

    assert.equal(completed.status, "ok");
    assert.equal(completed.data.authenticated, true);
    assert.equal(completed.data.tenantId, "tenant-lumen");
    assert.equal(completed.data.operator?.email, "multi@example.com");
  });

  it("queries tenant memberships with a bounded email lookup", async () => {
    const repository = IdentityRepository.inMemory();
    const originalListTenants = repository.listTenants.bind(repository);
    const originalFindTenantUsersByEmail = repository.findTenantUsersByEmail.bind(repository);
    const calls = { findTenantUsers: 0, findTenantUsersByEmail: 0, listTenants: 0 };

    (repository as unknown as { listTenants: typeof repository.listTenants }).listTenants = async () => {
      calls.listTenants += 1;
      return originalListTenants();
    };
    (repository as unknown as { findTenantUsersByEmail: typeof repository.findTenantUsersByEmail }).findTenantUsersByEmail = async (email) => {
      calls.findTenantUsersByEmail += 1;
      return originalFindTenantUsersByEmail(email);
    };
    (repository as unknown as { findTenantUsers: typeof repository.findTenantUsers }).findTenantUsers = async () => {
      calls.findTenantUsers += 1;
      throw new Error("tenant-wide membership scan must not run");
    };

    const memberships = await listTenantMembershipsForEmail("multi@example.com", repository);

    assert.deepEqual(memberships.map((membership) => membership.tenantId).sort(), ["tenant-lumen", "tenant-northstar"]);
    assert.deepEqual(calls, { findTenantUsers: 0, findTenantUsersByEmail: 1, listTenants: 1 });
  });
  it("keeps fallback permission roles aligned with presence actions and localized aliases", () => {
    const employee = identityPermissionRoleCatalog.find((role) => role.key === "employee");
    const senior = identityPermissionRoleCatalog.find((role) => role.key === "senior");
    const admin = identityPermissionRoleCatalog.find((role) => role.key === "admin");
    const serviceAdmin = identityPermissionRoleCatalog.find((role) => role.key === "service_admin");

    assert.ok(employee?.actions.includes("presence.write"));
    assert.ok(employee?.aliases.includes("сотрудник"));
    assert.ok(senior?.actions.includes("presence.read"));
    assert.ok(senior?.actions.includes("presence.write"));
    assert.ok(senior?.aliases.includes("старший сотрудник"));
    assert.ok(admin?.aliases.includes("администратор"));
    assert.ok(serviceAdmin?.actions.includes("presence.read"));
  });


  it("selects the active tenant membership even when an inactive duplicate email is stored first", async () => {
    const repository = IdentityRepository.inMemory();
    const active = await repository.findTenantUserByEmail("sergey@volga.example");
    assert.ok(active);
    await repository.saveTenantUser({
      ...active,
      id: "usr-inactive-duplicate-email",
      status: "inactive",
      tenantId: "tenant-northstar"
    });

    const login = await new AuthService(repository).loginTenantOperator({
      email: "sergey@volga.example",
      password: "correct-password"
    });
    assert.equal(login.status, "ok");
    assert.equal(login.data.tenantId, "tenant-volga");
  });

  it("does not consume a valid invite when its tenant membership is missing", async () => {
    const repository = IdentityRepository.inMemory();
    const invite = await repository.createInviteToken({
      code: "orphan-invite-code",
      email: "orphan-invite@example.com",
      tenantId: "tenant-volga"
    });
    const accepted = await new AuthService(repository).acceptInvite({
      code: invite.code,
      email: invite.email,
      password: "Orphan-Invite-2026!"
    });
    const persisted = await repository.findInviteToken(invite.code);

    assert.equal(accepted.status, "invalid");
    assert.equal(accepted.error?.code, "invite_membership_not_found");
    assert.equal(persisted?.consumedAt, null);
  });

  it("continues invite acceptance MFA without replaying the consumed invite token", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalPilotSkipMfa = process.env.PILOT_SKIP_MFA;
    process.env.NODE_ENV = "staging";
    process.env.PILOT_SKIP_MFA = "false";
    try {
      const repository = IdentityRepository.inMemory();
      const settings = new SettingsEmployeeService(repository);
      const auth = new AuthService(repository, createTestMfaOtpRuntime());
      const email = "invite-mfa@volga.example";
      const password = "Invite-Mfa-2026!";

      const invite = await settings.inviteEmployee({
        email,
        groupId: "group-line-1",
        name: "Invite MFA",
        roleKey: "employee"
      }, { tenantId: "tenant-volga" });
      assert.equal(invite.status, "ok");
      assert.equal(typeof invite.data.inviteDescriptor?.code, "string");

      const passwordAccepted = await auth.acceptInvite({
        code: invite.data.inviteDescriptor.code,
        email,
        password
      });
      assert.equal(passwordAccepted.status, "ok");
      assert.equal(passwordAccepted.partial, true);
      assert.equal(passwordAccepted.data.authenticated, false);
      assert.equal(passwordAccepted.data.nextStep, "otp");
      assert.match(String(passwordAccepted.data.mfaChallengeId), /^mfa_/);

      const completed = await auth.acceptInvite({
        code: invite.data.inviteDescriptor.code,
        email,
        mfaChallengeId: String(passwordAccepted.data.mfaChallengeId),
        otp: "123456",
        password
      });
      assert.equal(completed.status, "ok");
      assert.equal(completed.data.authenticated, true);
      assert.equal(completed.data.tenantId, "tenant-volga");
      assert.equal(completed.data.operator?.email, email);
      assert.equal(completed.error?.code, undefined);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalPilotSkipMfa === undefined) {
        delete process.env.PILOT_SKIP_MFA;
      } else {
        process.env.PILOT_SKIP_MFA = originalPilotSkipMfa;
      }
    }
  });

  it("continues password recovery MFA without replaying the consumed recovery token", async () => {
    const originalAuthRequireTenantMfa = process.env.AUTH_REQUIRE_TENANT_MFA;
    const originalNodeEnv = process.env.NODE_ENV;
    const originalPilotSkipMfa = process.env.PILOT_SKIP_MFA;
    delete process.env.AUTH_REQUIRE_TENANT_MFA;
    process.env.NODE_ENV = "test";
    process.env.PILOT_SKIP_MFA = "false";
    try {
      const repository = IdentityRepository.inMemory();
      const deliveredRecoveryTokens: DeliveredRecoveryToken[] = [];
      const auth = new AuthService(repository, createTestMfaOtpRuntime(deliveredRecoveryTokens));
      const email = "sergey@volga.example";
      const password = "Recovered-Mfa-2026!";
      const tenantUser = await repository.findTenantUserByEmail(email);
      assert.ok(tenantUser);
      const previousSession = await repository.createTenantOperatorSession({
        tenantId: tenantUser.tenantId,
        userId: tenantUser.id
      });
      assert.ok(await repository.findTenantOperatorSessionByAccessToken(previousSession.accessToken));

      const recovery = await auth.requestRecovery({ email });
      assert.equal(recovery.status, "ok");
      assert.deepEqual(recovery.data, { queued: true });
      assert.equal(deliveredRecoveryTokens.length, 1);
      const recoveryToken = deliveredRecoveryTokens[0]?.recoveryToken;
      assert.equal(typeof recoveryToken, "string");
      assert.doesNotMatch(JSON.stringify(recovery), new RegExp(String(recoveryToken)));

      const unknown = await auth.requestRecovery({ email: "unknown-recovery@example.com" });
      assert.equal(unknown.status, recovery.status);
      assert.deepEqual(unknown.data, recovery.data);
      assert.equal(unknown.error, recovery.error);
      assert.equal(deliveredRecoveryTokens.length, 1);

      const passwordReset = await auth.completeRecovery({
        email,
        password,
        token: recoveryToken
      });
      assert.equal(passwordReset.status, "ok");
      assert.equal(passwordReset.partial, true);
      assert.equal(passwordReset.data.authenticated, false);
      assert.equal(passwordReset.data.nextStep, "otp");
      assert.match(String(passwordReset.data.mfaChallengeId), /^mfa_/);
      assert.equal("accessToken" in passwordReset.data, false);
      assert.equal("refreshToken" in passwordReset.data, false);
      assert.equal(await repository.findTenantOperatorSessionByAccessToken(previousSession.accessToken), undefined);
      assert.ok((await repository.findServiceAdminSession(previousSession.sessionId))?.revokedAt);

      const replay = await auth.completeRecovery({
        email,
        password: "Replay-Must-Fail-2026!",
        token: recoveryToken
      });
      assert.equal(replay.status, "denied");
      assert.equal(replay.data.authenticated, false);
      assert.equal(replay.error?.code, "recovery_expired");

      const completed = await auth.completeRecovery({
        email,
        mfaChallengeId: String(passwordReset.data.mfaChallengeId),
        otp: "123456",
        password,
        token: recoveryToken
      });
      assert.equal(completed.status, "ok");
      assert.equal(completed.data.authenticated, true);
      assert.equal(completed.data.tenantId, "tenant-volga");
      assert.equal(completed.data.operator?.email, email);
      assert.equal(completed.error?.code, undefined);
    } finally {
      if (originalAuthRequireTenantMfa === undefined) {
        delete process.env.AUTH_REQUIRE_TENANT_MFA;
      } else {
        process.env.AUTH_REQUIRE_TENANT_MFA = originalAuthRequireTenantMfa;
      }
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
      if (originalPilotSkipMfa === undefined) {
        delete process.env.PILOT_SKIP_MFA;
      } else {
        process.env.PILOT_SKIP_MFA = originalPilotSkipMfa;
      }
    }
  });

  it("keeps invite tokens in the identity repository across auth flow store resets", async () => {
    const repository = IdentityRepository.inMemory();
    const settings = new SettingsEmployeeService(repository);
    const email = `durable-invite-${Date.now()}@volga.example`;
    const password = "Durable-Invite-2026!";

    const invite = await settings.inviteEmployee({
      email,
      groupId: "group-line-1",
      name: "Durable Invite",
      roleKey: "employee"
    }, { tenantId: "tenant-volga" });
    assert.equal(invite.status, "ok");
    assert.equal(typeof invite.data.inviteDescriptor?.code, "string");

    resetIdentityAuthFlowStore();
    const auth = new AuthService(repository);
    const accepted = await auth.acceptInvite({
      code: invite.data.inviteDescriptor.code,
      email,
      password
    });

    assert.equal(accepted.status, "ok");
    assert.notEqual(accepted.error?.code, "invite_not_found");
  });

  it("keeps recovery tokens in the identity repository across auth flow store resets", async () => {
    const repository = IdentityRepository.inMemory();
    const deliveredRecoveryTokens: DeliveredRecoveryToken[] = [];
    const issuingAuth = new AuthService(
      repository,
      createTestMfaOtpRuntime(deliveredRecoveryTokens)
    );
    const email = "sergey@volga.example";
    const password = "Durable-Recovery-2026!";

    const recovery = await issuingAuth.requestRecovery({ email });
    assert.equal(recovery.status, "ok");
    assert.deepEqual(recovery.data, { queued: true });
    assert.equal(deliveredRecoveryTokens.length, 1);
    const recoveryToken = deliveredRecoveryTokens[0]?.recoveryToken;
    assert.equal(typeof recoveryToken, "string");
    assert.doesNotMatch(JSON.stringify(recovery), new RegExp(String(recoveryToken)));

    resetIdentityAuthFlowStore();
    const completingAuth = new AuthService(repository);
    const completed = await completingAuth.completeRecovery({
      email,
      password,
      token: recoveryToken
    });

    assert.equal(completed.status, "ok");
    assert.notEqual(completed.error?.code, "recovery_not_found");
  });

  it("starts and completes OIDC callbacks with replay protection", async () => {
    const repository = IdentityRepository.inMemory();
    await repository.saveOidcProviderConfig({
      audience: "support-api",
      clientId: "support-web",
      enabled: true,
      issuer: "https://idp.example.com/",
      jwksUri: "https://idp.example.com/.well-known/jwks.json",
      providerId: "oidc-main",
      scopes: ["openid", "email", "profile"],
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T12:00:00.000Z"
    });
    const auth = new AuthService(repository);

    const started = await auth.startOidcLogin({
      domain: "volga.example",
      providerId: "oidc-main",
      redirectUri: "https://support.example.com/auth/oidc/callback"
    });

    assert.equal(started.status, "ok");
    assert.equal(started.partial, true);
    assert.equal(started.data.providerId, "oidc-main");
    assert.match(started.data.callbackDescriptorId, /^oidc_cb_/);
    assert.match(started.data.state, /^oidc_state_/);
    const authorizationUrl = new URL(started.data.authorizationUrl);
    assert.equal(authorizationUrl.origin, "https://idp.example.com");
    assert.equal(authorizationUrl.pathname, "/authorize");
    assert.equal(authorizationUrl.searchParams.get("client_id"), "support-web");
    assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "https://support.example.com/auth/oidc/callback");
    assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
    assert.equal(authorizationUrl.searchParams.get("scope"), "openid email profile");
    assert.equal(authorizationUrl.searchParams.get("state"), started.data.state);
    assert.ok(authorizationUrl.searchParams.get("nonce"));
    assert.equal(started.meta.domain, "volga.example");

    const foreignDomain = await auth.startOidcLogin({
      domain: "lumen.example",
      providerId: "oidc-main",
      redirectUri: "https://support.example.com/auth/oidc/callback"
    });
    assert.equal(foreignDomain.status, "denied");
    assert.equal(foreignDomain.error?.code, "oidc_domain_not_allowed");

    const descriptor = await repository.findOidcCallbackDescriptor(started.data.state);
    assert.equal(descriptor?.id, started.data.callbackDescriptorId);
    assert.equal(descriptor?.providerId, "oidc-main");
    assert.equal(descriptor?.consumedAt, null);
    assert.match(descriptor?.nonceHash ?? "", /^sha256:/);

    const completed = await auth.completeOidcCallback({
      code: "oidc-code-001",
      state: started.data.state
    });

    assert.equal(completed.status, "ok");
    assert.equal(completed.partial, true);
    assert.equal(completed.data.authenticated, false);
    assert.equal(completed.data.nextStep, "token_exchange");
    assert.equal(completed.data.providerId, "oidc-main");
    assert.equal(completed.data.callbackDescriptorId, started.data.callbackDescriptorId);
    assert.match(completed.data.consumedAt, /^20/);

    const replay = await auth.completeOidcCallback({
      code: "oidc-code-001",
      state: started.data.state
    });

    assert.equal(replay.status, "conflict");
    assert.equal(replay.error?.code, "oidc_callback_replayed");
    assert.equal(replay.data.authenticated, false);

    const errorStarted = await auth.startOidcLogin({
      domain: "volga.example",
      providerId: "oidc-main",
      redirectUri: "https://support.example.com/auth/oidc/callback"
    });
    const providerError = await auth.completeOidcCallback({
      error: "access_denied",
      errorDescription: "User rejected consent",
      state: errorStarted.data.state
    });

    assert.equal(providerError.status, "denied");
    assert.equal(providerError.error?.code, "oidc_provider_error");
    assert.equal(providerError.data.callbackDescriptorId, errorStarted.data.callbackDescriptorId);

    const providerErrorReplay = await auth.completeOidcCallback({
      error: "access_denied",
      errorDescription: "User rejected consent",
      state: errorStarted.data.state
    });

    assert.equal(providerErrorReplay.status, "conflict");
    assert.equal(providerErrorReplay.error?.code, "oidc_callback_replayed");
  });

  it("validates SAML assertions with replay and expiry denial envelopes", async () => {
    const repository = IdentityRepository.inMemory();
    await repository.saveSamlProviderMetadata({
      acsUrl: "https://support.example.com/auth/saml/acs",
      audience: "support-api",
      certificateFingerprint: "sha256:saml-cert-001",
      enabled: true,
      entityId: "https://idp.example.com/saml/metadata",
      providerId: "saml-main",
      ssoUrl: "https://idp.example.com/saml/sso",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T13:00:00.000Z"
    });
    await repository.recordSamlAcsRequestDescriptor({
      acsUrl: "https://support.example.com/auth/saml/acs",
      consumedAt: null,
      expiresAt: "2026-06-29T13:10:00.000Z",
      id: "saml_acs_001",
      providerId: "saml-main",
      relayState: "relay-state-001",
      requestId: "saml-request-001",
      requestedAt: "2026-06-29T13:00:30.000Z",
      traceId: "trc_saml_acs_001"
    });
    await repository.recordSamlAcsRequestDescriptor({
      acsUrl: "https://support.example.com/auth/saml/acs",
      consumedAt: null,
      expiresAt: "2026-06-29T13:10:00.000Z",
      id: "saml_acs_002",
      providerId: "saml-main",
      relayState: "relay-state-002",
      requestId: "saml-request-002",
      requestedAt: "2026-06-29T13:01:00.000Z",
      traceId: "trc_saml_acs_002"
    });
    const auth = new AuthService(repository);

    const accepted = await auth.completeSamlAcs({
      assertionExpiresAt: "2026-06-29T13:15:00.000Z",
      assertionId: "assertion-001",
      audience: "support-api",
      now: new Date("2026-06-29T13:02:00.000Z"),
      providerId: "saml-main",
      requestId: "saml-request-001",
      subjectId: "svc-admin-001"
    });

    assert.equal(accepted.status, "ok");
    assert.equal(accepted.partial, true);
    assert.equal(accepted.data.authenticated, false);
    assert.equal(accepted.data.authState, "saml_assertion_verified");
    assert.equal(accepted.data.nextStep, "session_issue");
    assert.equal(accepted.data.providerId, "saml-main");
    assert.equal(accepted.data.assertionId, "assertion-001");

    const requestReplay = await auth.completeSamlAcs({
      assertionExpiresAt: "2026-06-29T13:15:00.000Z",
      assertionId: "assertion-001b",
      audience: "support-api",
      now: new Date("2026-06-29T13:02:30.000Z"),
      providerId: "saml-main",
      requestId: "saml-request-001",
      subjectId: "svc-admin-001"
    });

    assert.equal(requestReplay.status, "conflict");
    assert.equal(requestReplay.error?.code, "saml_acs_request_replayed");
    assert.equal(requestReplay.data.authenticated, false);
    assert.equal(requestReplay.data.nextStep, "authorization");

    const replay = await auth.completeSamlAcs({
      assertionExpiresAt: "2026-06-29T13:15:00.000Z",
      assertionId: "assertion-001",
      audience: "support-api",
      now: new Date("2026-06-29T13:03:00.000Z"),
      providerId: "saml-main",
      requestId: "saml-request-001",
      subjectId: "svc-admin-001"
    });

    assert.equal(replay.status, "conflict");
    assert.equal(replay.error?.code, "saml_assertion_replayed");
    assert.equal(replay.data.authenticated, false);
    assert.equal(replay.data.nextStep, "authorization");

    const expired = await auth.completeSamlAcs({
      assertionExpiresAt: "2026-06-29T13:01:00.000Z",
      assertionId: "assertion-002",
      audience: "support-api",
      now: new Date("2026-06-29T13:03:00.000Z"),
      providerId: "saml-main",
      requestId: "saml-request-002",
      subjectId: "svc-admin-001"
    });

    assert.equal(expired.status, "denied");
    assert.equal(expired.error?.code, "saml_assertion_expired");
    assert.equal(await repository.findSamlAssertionReplay("saml-main", "assertion-002"), undefined);

    const racedRepository = IdentityRepository.inMemory();
    await racedRepository.saveSamlProviderMetadata({
      acsUrl: "https://support.example.com/auth/saml/acs",
      audience: "support-api",
      certificateFingerprint: "sha256:saml-cert-001",
      enabled: true,
      entityId: "https://idp.example.com/saml/metadata",
      providerId: "saml-race",
      ssoUrl: "https://idp.example.com/saml/sso",
      tenantId: "tenant-volga",
      updatedAt: "2026-06-29T13:00:00.000Z"
    });
    await racedRepository.recordSamlAcsRequestDescriptor({
      acsUrl: "https://support.example.com/auth/saml/acs",
      consumedAt: null,
      expiresAt: "2026-06-29T13:10:00.000Z",
      id: "saml_acs_race",
      providerId: "saml-race",
      relayState: "relay-state-race",
      requestId: "saml-request-race",
      requestedAt: "2026-06-29T13:00:30.000Z",
      traceId: "trc_saml_acs_race"
    });
    racedRepository.recordSamlAssertionReplay = () => {
      const error = new Error("Unique constraint failed");
      (error as Error & { code: string; meta: { target: string[] } }).code = "P2002";
      (error as Error & { code: string; meta: { target: string[] } }).meta = { target: ["provider_id", "assertion_id"] };
      throw error;
    };

    const raced = await new AuthService(racedRepository).completeSamlAcs({
      assertionExpiresAt: "2026-06-29T13:15:00.000Z",
      assertionId: "assertion-race",
      audience: "support-api",
      now: new Date("2026-06-29T13:02:00.000Z"),
      providerId: "saml-race",
      requestId: "saml-request-race",
      subjectId: "svc-admin-001"
    });

    assert.equal(raced.status, "conflict");
    assert.equal(raced.error?.code, "saml_assertion_replayed");
  });

  it("logs out with immutable auth audit event", async () => {
    const auth = new AuthService();
    const logout = await auth.logout({ reason: "QA logout" });

    assert.equal(logout.status, "ok");
    assert.equal(logout.data.authenticated, false);
    assert.equal(logout.data.authState, "anonymous");
    assert.equal(logout.data.auditEvent.reason, "QA logout");
    assert.equal(logout.data.auditEvent.action, "service_admin.logout");
  });

  it("filters tenant list and exposes tenant detail projections", async () => {
    const tenants = new TenantService();

    const watch = await tenants.fetchTenants({ status: "watch" });
    assert.equal(watch.service, "tenantService");
    assert.equal(watch.partial, true);
    assert.ok(watch.data.items.length > 0);
    assert.ok(watch.data.items.every((tenant) => tenant.status === "watch"));
    assert.equal(watch.data.totals.all >= watch.data.totals.watch, true);

    const all = await tenants.fetchTenants({ status: "all" });
    assert.deepEqual(
      all.data.items.map((tenant) => tenant.id).sort(),
      ["tenant-aurora", "tenant-lumen", "tenant-northstar", "tenant-volga"]
    );

    const detail = await tenants.fetchTenantDetail("tenant-volga");
    assert.equal(detail.status, "ok");
    assert.equal(detail.meta.tenantId, "tenant-volga");
    assert.equal(detail.data.tenant.id, "tenant-volga");
    assert.equal(detail.data.tenant.notes.length > 0, true);
    assert.equal(typeof detail.data.tenant.healthScore, "number");
    assert.ok(detail.data.tenant.sla);
    assert.ok(detail.data.users.length > 0);
    assert.ok(detail.data.users.every((user) => "risk" in user));
    assert.equal(typeof detail.data.tariff?.retentionDays, "number");
    assert.ok(detail.data.flags.every((flag) => "key" in flag));
    assert.ok(detail.data.incidents.length > 0);
    assert.ok(detail.data.auditEvents.length > 0);

    const missing = await tenants.fetchTenantDetail("tenant-missing");
    assert.equal(missing.status, "not_found");
    assert.equal(missing.states.error, true);
    assert.equal(missing.error?.code, "tenant_not_found");
  });

  it("requires reason and confirmation for tenant status changes", async () => {
    const tenants = new TenantService();

    const missingReason = await tenants.updateTenantStatus({
      tenantId: "tenant-volga",
      status: "restricted",
      confirmed: true,
      reason: ""
    });
    assert.equal(missingReason.status, "invalid");
    assert.equal(missingReason.error?.code, "reason_required");

    const missingStatus = await tenants.updateTenantStatus({
      tenantId: "tenant-volga",
      status: "",
      confirmed: true,
      reason: "Security restriction requested"
    });
    assert.equal(missingStatus.status, "invalid");
    assert.equal(missingStatus.error?.code, "status_required");

    const unsupportedStatus = await tenants.updateTenantStatus({
      tenantId: "tenant-volga",
      status: "owner",
      confirmed: true,
      reason: "Security restriction requested"
    });
    assert.equal(unsupportedStatus.status, "invalid");
    assert.equal(unsupportedStatus.error?.code, "status_unsupported");

    const missingConfirmation = await tenants.updateTenantStatus({
      tenantId: "tenant-volga",
      status: "restricted",
      reason: "Security restriction requested"
    });
    assert.equal(missingConfirmation.status, "invalid");
    assert.equal(missingConfirmation.error?.code, "confirmation_required");
    assert.match(missingConfirmation.traceId, /^trc_tenantService_updateTenantStatus_/);

    const updated = await tenants.updateTenantStatus({
      tenantId: "tenant-volga",
      status: "restricted",
      reason: "Security restriction requested",
      confirmed: true
    });
    assert.equal(updated.status, "ok");
    assert.equal(updated.data.tenant.status, "restricted");
    assert.match(updated.data.auditEvent.id, /^evt_tenant_status_/);
  });

  it("persists tenant status audit events as immutable privileged mutation evidence", async () => {
    const repository = IdentityRepository.inMemory();
    const tenants = new TenantService(repository);

    const updated = await tenants.updateTenantStatus({
      tenantId: "tenant-volga",
      status: "restricted",
      reason: "Security restriction requested",
      confirmed: true
    });
    assert.equal(updated.status, "ok");

    const auditEvents = await repository.findTenantAuditEvents("tenant-volga");
    const statusAudit = auditEvents.find((event) => event.id === updated.data.auditEvent.id);

    assert.ok(statusAudit);
    assert.equal(statusAudit.action, "tenant.status.change");
    assert.equal(statusAudit.immutable, true);
    assert.equal(statusAudit.tenantId, "tenant-volga");
    assert.equal(statusAudit.reason, "Security restriction requested");
    assert.equal(statusAudit.traceId, updated.traceId);
  });

  it("manages tenant employee settings with role, group, channel and reset audit evidence", async () => {
    const repository = IdentityRepository.inMemory();
    const deliveredRecoveryTokens: DeliveredRecoveryToken[] = [];
    const settings = new SettingsEmployeeService(repository, undefined, createTestMfaOtpRuntime(deliveredRecoveryTokens));

    const workspace = await settings.fetchEmployees({ tenantId: "tenant-northstar" });
    assert.equal(workspace.status, "ok");
    assert.ok(workspace.data.employees.length >= 2);
    assert.ok(workspace.data.roles.some((role) => role.key === "admin"));
    assert.ok(workspace.data.groups.some((group) => group.id === "group-vip"));

    const agent = workspace.data.employees.find((employee) => employee.id === "usr-ns-agent");
    assert.ok(agent);
    assert.equal(agent.credentials.passwordStatus, "active");
    assert.equal(agent.mfaStatus, "reset_pending");

    const updated = await settings.updateEmployee("usr-ns-agent", {
      channels: ["Telegram", "MAX"],
      chatLimit: 9,
      canOverride: true,
      groupId: "group-vip",
      roleKey: "senior",
      sensitiveData: true
    }, { tenantId: "tenant-northstar" });
    assert.equal(updated.status, "ok");
    assert.equal(updated.data.employee.chatLimit, 9);
    assert.deepEqual(updated.data.employee.channels, ["Telegram", "MAX"]);
    assert.equal(updated.data.employee.groupId, "group-vip");
    assert.equal(updated.data.employee.roleKey, "senior");
    assert.match(updated.data.auditEvent.id, /^evt_settings_employee_/);
    assert.equal(settings.listSettingsAuditEvents().some((event) => event.id === updated.data.auditEvent.id), true);

    const passwordReset = await settings.resetEmployeePassword("usr-ns-agent", {
      reason: "Operator requested password reset"
    }, { tenantId: "tenant-northstar" });
    assert.equal(passwordReset.status, "ok");
    assert.equal(passwordReset.data.employee.credentials.passwordStatus, "reset_sent");
    assert.equal(passwordReset.data.recovery.status, "queued");
    assert.equal(deliveredRecoveryTokens.length, 1);
    const passwordResetUser = await repository.findTenantUser("usr-ns-agent");
    assert.equal(String(passwordResetUser?.supportNotes ?? "").includes("Password reset sent"), false);
    assert.equal((passwordResetUser?.metadata?.passwordRecovery as Record<string, unknown>)?.requestId, passwordReset.data.recovery.requestId);

    const mfaReset = await settings.resetEmployeeMfa("usr-ns-agent", {
      reason: "Phone replacement approved"
    }, { tenantId: "tenant-northstar" });
    assert.equal(mfaReset.status, "ok");
    assert.equal(mfaReset.data.employee.mfaStatus, "reset_pending");

    const invite = await settings.inviteEmployee({
      email: "new.agent@northstar.example",
      groupId: "group-line-1",
      name: "New Agent",
      roleKey: "employee"
    }, { tenantId: "tenant-northstar" });
    assert.equal(invite.status, "ok");
    assert.equal(invite.data.employee.status, "invited");
    assert.equal(invite.data.employee.email, "new.agent@northstar.example");
    assert.equal(settings.listSettingsAuditEvents().some((event) => event.id === invite.data.auditEvent.id), true);

    const group = await settings.createGroup({
      channels: ["Telegram"],
      name: "Escalation",
      scope: "Escalation handoff"
    }, { tenantId: "tenant-northstar" });
    assert.equal(group.status, "ok");
    assert.equal(settings.listSettingsAuditEvents().some((event) => event.id === group.data.auditEvent.id), true);

    const ownerDeactivation = await settings.deactivateEmployee("usr-ns-owner", {
      reason: "Need to test guard"
    }, { tenantId: "tenant-northstar" });
    assert.equal(ownerDeactivation.status, "invalid");
    assert.equal(ownerDeactivation.error?.code, "last_admin_required");

    const ownerDemotion = await settings.updateEmployee("usr-ns-owner", { roleKey: "employee" }, { tenantId: "tenant-northstar" });
    const ownerStatusChange = await settings.updateEmployee("usr-ns-owner", { status: "inactive" }, { tenantId: "tenant-northstar" });
    const invalidStatus = await settings.updateEmployee("usr-ns-agent", { status: "suspended-forever" }, { tenantId: "tenant-northstar" });
    const invalidRole = await settings.updateEmployee("usr-ns-agent", { roleKey: "root-god" }, { tenantId: "tenant-northstar" });
    assert.equal(ownerDemotion.error?.code, "last_admin_required");
    assert.equal(ownerStatusChange.error?.code, "last_admin_required");
    assert.equal(invalidStatus.error?.code, "employee_status_invalid");
    assert.equal(invalidRole.error?.code, "employee_role_invalid");
  });

  it("scopes settings employee reads and mutations to the authenticated tenant context", async () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/identity/settings.controller.ts", import.meta.url), "utf8");

    assert.match(source, /ServiceAdminRequest/);
    assert.match(source, /tenantId: tenantIdFromRequest\(request\)/);
    assert.match(source, /updateEmployee\(employeeId, payload, \{ tenantId: tenantIdFromRequest\(request\) \}\)/);
    assert.match(source, /resetEmployeePassword\(employeeId, payload, \{ tenantId: tenantIdFromRequest\(request\) \}\)/);
    assert.match(source, /deactivateEmployee\(employeeId, payload, \{ tenantId: tenantIdFromRequest\(request\) \}\)/);
    assert.match(source, /return request\.tenantOperatorContext\?\.tenantId \?\? request\.serviceAdminContext\?\.currentTenantId/);

    const repository = IdentityRepository.inMemory();
    const settings = new SettingsEmployeeService(repository);

    const volgaInvite = await settings.inviteEmployee({
      email: "scoped-volga@volga.example",
      groupId: "group-line-1",
      name: "Scoped Volga",
      roleKey: "employee"
    }, { tenantId: "tenant-volga" });
    assert.equal(volgaInvite.status, "ok");
    assert.equal(volgaInvite.data.employee.tenantId, "tenant-volga");
    assert.equal(volgaInvite.data.inviteDescriptor.tenantId, "tenant-volga");

    const crossTenantUpdate = await settings.updateEmployee("usr-ns-agent", {
      roleKey: "admin"
    }, { tenantId: "tenant-volga" });
    assert.equal(crossTenantUpdate.status, "denied");
    assert.equal(crossTenantUpdate.error?.code, "employee_tenant_mismatch");

    const crossTenantReset = await settings.resetEmployeePassword("usr-ns-agent", {
      reason: "Cross tenant reset should be blocked"
    }, { tenantId: "tenant-volga" });
    assert.equal(crossTenantReset.status, "denied");
    assert.equal(crossTenantReset.error?.code, "employee_tenant_mismatch");

    const crossTenantDeactivate = await settings.deactivateEmployee("usr-ns-agent", {
      reason: "Cross tenant deactivate should be blocked"
    }, { tenantId: "tenant-volga" });
    assert.equal(crossTenantDeactivate.status, "denied");
    assert.equal(crossTenantDeactivate.error?.code, "employee_tenant_mismatch");
  });

  it("scopes settings groups and rules to the authenticated tenant context", async () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/identity/settings.controller.ts", import.meta.url), "utf8");

    assert.match(source, /fetchGroups\(@Query\(\) query: \{ tenantId\?: string \}, @Req\(\) request: SettingsRequest\)/);
    assert.match(source, /this\.settingsEmployeeService\.fetchGroups\(\{ tenantId: tenantIdFromRequest\(request\) \}\)/);
    assert.match(source, /this\.settingsEmployeeService\.createGroup\(payload, \{ tenantId: tenantIdFromRequest\(request\) \}\)/);
    assert.match(source, /this\.settingsEmployeeService\.updateGroup\(groupId, payload, \{ tenantId: tenantIdFromRequest\(request\) \}\)/);
    assert.match(source, /this\.settingsRulesService\.fetchRules\(\{[\s\S]*tenantId: tenantIdFromRequest\(request\)/);
    assert.match(source, /this\.settingsRulesService\.updateRule\(ruleId, payload, \{ tenantId: tenantIdFromRequest\(request\) \}\)/);
    assert.match(source, /this\.settingsRulesService\.testRule\(ruleId, payload, \{ tenantId: tenantIdFromRequest\(request\) \}\)/);

    const settings = new SettingsEmployeeService(IdentityRepository.inMemory());
    const volgaGroup = await settings.createGroup({
      channels: ["Telegram"],
      name: "Volga Escalation",
      scope: "Volga scoped group"
    }, { tenantId: "tenant-volga" });
    assert.equal(volgaGroup.status, "ok");
    assert.equal(volgaGroup.data.group.tenantId, "tenant-volga");
    assert.equal(volgaGroup.data.auditEvent.tenantId, "tenant-volga");

    const volgaGroups = await settings.fetchGroups({ tenantId: "tenant-volga" });
    const northstarGroups = await settings.fetchGroups({ tenantId: "tenant-northstar" });
    assert.equal(volgaGroups.data.groups.some((group: Record<string, unknown>) => group.id === volgaGroup.data.group.id), true);
    assert.equal(northstarGroups.data.groups.some((group: Record<string, unknown>) => group.id === volgaGroup.data.group.id), false);

    const updatedVolgaGroup = await settings.updateGroup(String(volgaGroup.data.group.id), {
      name: "Volga Priority Escalation"
    }, { tenantId: "tenant-volga" });
    assert.equal(updatedVolgaGroup.status, "ok");
    assert.equal(updatedVolgaGroup.data.group.tenantId, "tenant-volga");
    assert.equal(updatedVolgaGroup.data.auditEvent.tenantId, "tenant-volga");

    const rules = new SettingsRulesService();
    const volgaRules = await rules.fetchRules({ tenantId: "tenant-volga" });
    assert.equal(volgaRules.status, "ok");
    assert.equal(volgaRules.data.rules.length > 0, true);
    assert.equal(volgaRules.data.rules.every((rule: Record<string, unknown>) => rule.tenantId === "tenant-volga"), true);

    const updatedVolgaRule = await rules.updateRule("operator-chat-limit", {
      parameters: { defaultLimit: 5 },
      reason: "Volga scoped limit"
    }, { tenantId: "tenant-volga" });
    assert.equal(updatedVolgaRule.status, "ok");
    assert.equal(updatedVolgaRule.data.rule.tenantId, "tenant-volga");
    assert.equal(updatedVolgaRule.data.rule.parameters.defaultLimit, 5);
    assert.equal(updatedVolgaRule.data.auditEvent.tenantId, "tenant-volga");

    const northstarRules = await rules.fetchRules({ tenantId: "tenant-northstar" });
    const northstarLimit = northstarRules.data.rules.find((rule: Record<string, unknown>) => rule.id === "operator-chat-limit");
    assert.equal(northstarLimit.parameters.defaultLimit, 8);

    const testRun = await rules.testRule("operator-chat-limit", { sampleSize: 12 }, { tenantId: "tenant-volga" });
    assert.equal(testRun.status, "ok");
    assert.equal(testRun.data.rule.tenantId, "tenant-volga");
    assert.equal(testRun.data.auditEvent.tenantId, "tenant-volga");
  });

  it("manages settings rules with critical confirmation and impact tests", async () => {
    const settingsRules = new SettingsRulesService();

    const workspace = await settingsRules.fetchRules({ tenantId: "tenant-northstar" });
    assert.equal(workspace.status, "ok");
    assert.equal(workspace.data.totals.active, 8);
    assert.ok(workspace.data.rules.some((rule) => rule.id === "close-topic-required" && rule.severity === "critical"));
    assert.ok(workspace.data.rules.some((rule) => rule.id === "limit-override-allowed-roles"));
    assert.ok(workspace.data.rules.some((rule) => rule.id === "sensitive-data-masked-by-role" && rule.severity === "critical"));
    assert.ok(workspace.data.rules.some((rule) => rule.id === "route-by-channel-topic-working-time"));
    assert.ok(workspace.data.rules.some((rule) => rule.id === "overload-fallback-escalation"));

    const deniedCriticalDisable = await settingsRules.updateRule("close-topic-required", {
      enabled: false,
      reason: "QA attempts unsafe disable"
    }, { tenantId: "tenant-northstar" });
    assert.equal(deniedCriticalDisable.status, "invalid");
    assert.equal(deniedCriticalDisable.error?.code, "critical_rule_confirmation_required");

    const updatedLimit = await settingsRules.updateRule("operator-chat-limit", {
      parameters: { defaultLimit: 6 },
      reason: "Lower shared queue capacity"
    }, { tenantId: "tenant-northstar" });
    assert.equal(updatedLimit.status, "ok");
    assert.equal(updatedLimit.data.rule.parameters.defaultLimit, 6);
    assert.match(updatedLimit.data.auditEvent.id, /^evt_settings_rule_/);
    assert.equal(settingsRules.listSettingsAuditEvents().some((event) => event.id === updatedLimit.data.auditEvent.id), true);

    const testRun = await settingsRules.testRule("operator-chat-limit", { sampleSize: 50 }, { tenantId: "tenant-northstar" });
    assert.equal(testRun.status, "ok");
    assert.equal(testRun.data.result.sampleSize, 50);
    assert.equal(testRun.data.result.affectedWorkflows.includes("routing"), true);
    assert.equal(settingsRules.listSettingsAuditEvents().some((event) => event.id === testRun.data.auditEvent.id), true);

    const confirmedDisable = await settingsRules.updateRule("close-topic-required", {
      confirmed: true,
      enabled: false,
      reason: "Emergency tenant override"
    }, { tenantId: "tenant-northstar" });
    assert.equal(confirmedDisable.status, "ok");
    assert.equal(confirmedDisable.data.rule.enabled, false);
    assert.equal(confirmedDisable.data.workspace.totals.disabled, 1);
  });

  it("guards settings management and reset routes with service-admin permissions", () => {
    const source = readFileSync(new URL("../apps/api-gateway/src/identity/settings.controller.ts", import.meta.url), "utf8");

    assert.match(source, /@UseGuards\(TenantOperatorOrServiceAdminGuard\)[\s\S]*@Controller\("settings"\)/);
    assert.match(source, /@Get\("employees"\)[\s\S]*@RequireServiceAdminAction\("settings\.read"\)[\s\S]*fetchEmployees\(/);
    assert.match(source, /@Post\("employees\/invites"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*inviteEmployee\(/);
    assert.match(source, /@Patch\("employees\/:employeeId"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*updateEmployee\(/);
    assert.match(source, /@Post\("employees\/:employeeId\/password-reset"\)[\s\S]*@RequireTenantOperatorPermission\("employees\.passwordReset"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*resetEmployeePassword\(/);
    assert.match(source, /@Post\("employees\/:employeeId\/mfa-reset"\)[\s\S]*@RequireTenantOperatorPermission\("employees\.passwordReset"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*resetEmployeeMfa\(/);
    assert.match(source, /@Post\("groups"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*createGroup\(/);
    assert.match(source, /@Patch\("groups\/:groupId"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*updateGroup\(/);
    assert.match(source, /@Patch\("rules\/:ruleId"\)[\s\S]*@RequireServiceAdminAction\("settings\.manage"\)[\s\S]*updateRule\(/);
  });

  it("returns RBAC decisions with denial audit metadata", async () => {
    const permissions = new PermissionService();

    const denied = await permissions.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "employee"
    });
    assert.equal(denied.status, "denied");
    assert.equal(denied.meta.source, "api");
    assert.equal(denied.meta.apiVersion, "v1");
    assert.equal(denied.states.error, true);
    assert.equal(denied.data.allowed, false);
    assert.equal(denied.data.serverValidated, true);
    assert.equal(denied.data.auditEvent.action, "settings.manage");
    assert.match(denied.data.auditEvent.id, /^evt_perm_/);

    const allowed = await permissions.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "admin"
    });
    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.allowed, true);
    assert.equal(allowed.data.groupIds.includes("admins"), true);

    const escalation = await permissions.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "admin",
      actorRole: "employee"
    });
    assert.equal(escalation.status, "denied");
    assert.equal(escalation.data.role, "employee");
    assert.equal(escalation.data.allowed, false);

    const misleadingRole = await permissions.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "non-admin"
    });
    assert.equal(misleadingRole.status, "denied");
    assert.equal(misleadingRole.error?.code, "role_unrecognized");
    assert.equal(misleadingRole.data.role, "unknown");
    assert.equal(misleadingRole.data.allowed, false);

    const malformedRole = await permissions.validatePermission({
      action: "dialogs.read",
      resource: "dialogs",
      roleMode: "support-admin-shadow"
    });
    assert.equal(malformedRole.status, "denied");
    assert.equal(malformedRole.error?.code, "role_unrecognized");
    assert.equal(malformedRole.data.allowed, false);
    assert.equal(malformedRole.data.role, "unknown");
    assert.deepEqual(malformedRole.data.groupIds, []);
  });

  it("uses active RBAC policy grants and persists tenant-scoped permission denials", async () => {
    type RbacRepository = IdentityRepository & {
      listPermissionDenialEvents(input?: { tenantId?: string }): Promise<Array<Record<string, unknown>>>;
      recordRbacRoleGrant(input: Record<string, unknown>): Promise<Record<string, unknown>>;
      saveRbacPolicyVersion(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    };
    const repository = IdentityRepository.inMemory() as RbacRepository;
    await repository.saveRbacPolicyVersion({
      activatedAt: "2026-06-29T14:00:00.000Z",
      checksum: "sha256:rbac-policy-volga",
      createdAt: "2026-06-29T14:00:00.000Z",
      createdBy: "svc-admin-001",
      description: "Tenant-scoped RBAC policy",
      id: "rbac-policy-volga",
      status: "active",
      version: "2026.06.29-volga"
    });
    await repository.recordRbacRoleGrant({
      action: "settings.manage",
      createdAt: "2026-06-29T14:01:00.000Z",
      createdBy: "svc-admin-001",
      effect: "allow",
      id: "rbac-grant-volga-admin-settings",
      policyVersionId: "rbac-policy-volga",
      resource: "settings",
      roleKey: "admin",
      tenantId: "tenant-volga",
      traceId: "trc_rbac_grant_volga"
    });
    const permissions = new PermissionService(repository);

    const allowed = await permissions.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "admin",
      tenantId: "tenant-volga"
    } as Parameters<PermissionService["validatePermission"]>[0] & { tenantId: string });

    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.allowed, true);
    assert.equal((allowed.data as Record<string, unknown>).policyVersionId, "rbac-policy-volga");
    assert.equal((allowed.data as Record<string, unknown>).grantId, "rbac-grant-volga-admin-settings");

    const denied = await permissions.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "admin",
      tenantId: "tenant-aurora"
    } as Parameters<PermissionService["validatePermission"]>[0] & { tenantId: string });

    assert.equal(denied.status, "denied");
    assert.equal(denied.error?.code, "permission_denied");
    assert.equal(denied.data.allowed, false);
    assert.equal((denied.data as Record<string, unknown>).policyVersionId, "rbac-policy-volga");

    const denials = await repository.listPermissionDenialEvents({ tenantId: "tenant-aurora" });
    assert.equal(denials.length, 1);
    assert.equal(denials[0].action, "settings.manage");
    assert.equal(denials[0].policyVersionId, "rbac-policy-volga");
    assert.equal(denials[0].roleKey, "admin");
    assert.equal(denials[0].tenantId, "tenant-aurora");
    assert.equal(denials[0].immutable, true);
  });
});
