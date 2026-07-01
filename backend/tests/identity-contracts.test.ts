import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthService } from "../apps/api-gateway/src/identity/auth.service.ts";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { PermissionService } from "../apps/api-gateway/src/identity/permission.service.ts";
import { TenantService } from "../apps/api-gateway/src/identity/tenant.service.ts";

describe("phase 1 identity, tenant and RBAC backend contracts", () => {
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
      password: "correct-password",
      otp: "123456"
    });
    assert.equal(publicOtpCompletion.status, "denied");
    assert.equal(publicOtpCompletion.error?.code, "service_admin_key_required");
    assert.equal(publicOtpCompletion.data.authenticated, false);
    assert.equal(publicOtpCompletion.data.authState, "mfa_required");

    const verified = await auth.login({
      email: "service-admin@example.com",
      mfaChallengeId: passwordOnly.data.mfaChallengeId,
      password: "correct-password",
      otp: "123456"
    }, { privileged: true });
    assert.equal(verified.status, "ok");
    assert.equal(verified.data.authenticated, true);
    assert.equal(verified.data.session.authState, "mfa_verified");
    assert.equal(verified.data.session.currentTenantId, "tenant-volga");
    assert.equal(verified.data.session.adminId, "svc-admin-001");
    assert.equal(verified.data.session.adminName, "Надя Орлова");
    assert.ok(Array.isArray(verified.data.session.allowedActions));
    assert.equal(verified.data.session.allowedActions.includes("service-admin.users.read"), true);
    assert.equal(verified.data.session.allowedActions.includes("service-admin.users.write"), true);
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
