import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { resolveServiceAdminContextAsync } from "@support-communication/auth-context";
import { configureIdentityRepository } from "../apps/api-gateway/src/identity/bootstrap.ts";
import { ServiceAdminSessionGuard } from "../apps/api-gateway/src/identity/service-admin-session.guard.ts";
import { IdentityRepository, hashAuthFlowToken, hashServiceAdminToken } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { PermissionService } from "../apps/api-gateway/src/identity/permission.service.ts";
import { TenantService } from "../apps/api-gateway/src/identity/tenant.service.ts";
import { ServiceAdminService } from "../apps/api-gateway/src/service-admin/service-admin.service.ts";

describe("Prisma-backed identity repository contracts", () => {
  it("keeps tenant metadata in the Prisma schema and initial migration", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../prisma/migrations/202606270001_init_identity_outbox/migration.sql", import.meta.url), "utf8");

    assert.match(schema, /metadata\s+Json\?\s+@map\("metadata"\)/);
    assert.match(migration, /"metadata" JSONB/);
  });

  it("maps Prisma tenant rows without dropping fixture-level tenant fields", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });

    const tenants = await repository.listTenants();
    const tenant = tenants.find((item) => item.id === "tenant-volga");

    assert.ok(tenant);
    assert.equal(tenant.name, "Volga Logistics");
    assert.equal(tenant.status, "watch");
    assert.equal(tenant.legalName, "AO Volga Logistics");
    assert.equal(tenant.region, "ru-west");
    assert.equal(tenant.healthScore, 76);
    assert.deepEqual(tenant.domains, ["volga.example"]);
    assert.deepEqual(client.calls.tenantFindMany, [{ orderBy: { name: "asc" } }]);
  });

  it("maps sparse Prisma tenant rows to frontend-safe tenant defaults", async () => {
    const { client } = createFakePrismaIdentityClient({
      tenants: [{
        healthScore: null,
        id: "tenant-sparse",
        metadata: null,
        name: "Sparse Tenant",
        status: "active"
      }]
    });
    const repository = IdentityRepository.prisma({ client });

    const tenant = await repository.findTenant("tenant-sparse");

    assert.ok(tenant);
    assert.equal(tenant.legalName, "Sparse Tenant");
    assert.equal(tenant.planId, "unknown");
    assert.equal(tenant.region, "unknown");
    assert.equal(tenant.owner, "");
    assert.equal(tenant.ownerEmail, "");
    assert.equal(tenant.workspaces, 0);
    assert.equal(tenant.users, 0);
    assert.equal(tenant.activeUsers, 0);
    assert.equal(tenant.monthlyRevenue, 0);
    assert.equal(tenant.arr, 0);
    assert.equal(tenant.healthScore, 0);
    assert.equal(tenant.sla, 0);
    assert.equal(tenant.lastSeenAt, "");
    assert.deepEqual(tenant.domains, []);
    assert.deepEqual(tenant.flags, []);
    assert.deepEqual(tenant.incidentIds, []);
    assert.equal(tenant.notes, "");
  });

  it("normalizes malformed Prisma tenant status and array metadata", async () => {
    const { client } = createFakePrismaIdentityClient({
      tenants: [{
        healthScore: 50,
        id: "tenant-malformed",
        metadata: {
          domains: ["volga.example", "", 42, "volga.example", " support.volga.example "],
          flags: [" ff-risk-rules ", "ff-risk-rules", null],
          incidentIds: ["inc-auth-degrade", " ", "inc-auth-degrade"],
          legalName: "Malformed Tenant",
          region: "eu-west"
        },
        name: "Malformed Tenant",
        status: "deleted"
      }]
    });
    const repository = IdentityRepository.prisma({ client });
    const service = new TenantService(repository);

    const tenant = await repository.findTenant("tenant-malformed");
    assert.ok(tenant);
    assert.equal(tenant.status, "restricted");
    assert.deepEqual(tenant.domains, ["volga.example", "support.volga.example"]);
    assert.deepEqual(tenant.flags, ["ff-risk-rules"]);
    assert.deepEqual(tenant.incidentIds, ["inc-auth-degrade"]);

    const unsupportedStatus = await service.fetchTenants({ status: "deleted" });
    assert.deepEqual(unsupportedStatus.data.items, []);
    assert.equal(unsupportedStatus.data.totals.restricted, 1);
  });

  it("keeps tenant list filters safe when Prisma metadata is missing", async () => {
    const { client } = createFakePrismaIdentityClient({
      tenants: [{
        healthScore: null,
        id: "tenant-sparse",
        metadata: null,
        name: "Sparse Tenant",
        status: "active"
      }]
    });
    const service = new TenantService(IdentityRepository.prisma({ client }));

    const result = await service.fetchTenants({ query: "not-present" });

    assert.equal(result.status, "ok");
    assert.deepEqual(result.data.items, []);
    assert.equal(result.data.totals.all, 1);
    assert.equal(result.data.totals.active, 1);
  });

  it("uses Prisma-backed tenant users and permission roles in tenant detail and RBAC decisions", async () => {
    const { client } = createFakePrismaIdentityClient({
      permissionRoles: [{
        actions: ["settings.manage"],
        aliases: ["custom-admin"],
        description: "Custom admin policy",
        groupIds: ["custom-admins"],
        key: "custom_admin",
        metadata: { source: "test" }
      }],
      tenantUsers: [{
        device: "Firefox, Linux",
        email: "live-user@volga.example",
        id: "usr-live-volga",
        inviteStatus: "accepted",
        lastActiveAt: new Date("2026-06-27T08:00:00.000Z"),
        mfa: "enabled",
        metadata: { source: "test" },
        name: "Live Volga User",
        risk: "low",
        role: "Operator",
        sessions: 1,
        status: "active",
        supportNotes: "Loaded from Prisma",
        tenantId: "tenant-volga"
      }]
    });
    const repository = IdentityRepository.prisma({ client });
    const tenantService = new TenantService(repository);
    const permissionService = new PermissionService(repository);

    const users = await repository.findTenantUsers("tenant-volga");
    assert.deepEqual(users.map((user) => user.id), ["usr-live-volga"]);

    const detail = await tenantService.fetchTenantDetail("tenant-volga");
    assert.equal(detail.status, "ok");
    assert.deepEqual(detail.data.users.map((user) => user.id), ["usr-live-volga"]);

    const decision = await permissionService.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "custom-admin"
    });
    assert.equal(decision.status, "ok");
    assert.equal(decision.data.allowed, true);
    assert.equal(decision.data.role, "custom_admin");
    assert.deepEqual(decision.data.groupIds, ["custom-admins"]);

    const model = await permissionService.fetchPermissionModel();
    assert.deepEqual(model.data.roles.map((role) => role.key), ["custom_admin"]);
    assert.deepEqual(model.data.groups, ["custom-admins"]);
    assert.deepEqual(client.calls.tenantUserFindMany, [{
      orderBy: { name: "asc" },
      where: { tenantId: "tenant-volga" }
    }, {
      orderBy: { name: "asc" },
      where: { tenantId: "tenant-volga" }
    }]);
    assert.deepEqual(client.calls.permissionRoleFindMany, [
      { orderBy: { key: "asc" } },
      { orderBy: { key: "asc" } }
    ]);
  });

  it("persists RBAC policy versions, role grants and permission denial rows through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client }) as IdentityRepository & {
      getActiveRbacPolicyVersion(): unknown;
      listPermissionDenialEvents(input?: { tenantId?: string }): unknown;
      listRbacRoleGrants(input?: { policyVersionId?: string; roleKey?: string; tenantId?: string | null }): unknown;
      recordPermissionDenialEvent(input: Record<string, unknown>): unknown;
      recordRbacRoleGrant(input: Record<string, unknown>): unknown;
      saveRbacPolicyVersion(input: Record<string, unknown>): unknown;
    };

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
    await repository.recordPermissionDenialEvent({
      action: "settings.manage",
      actorId: "svc-admin-001",
      at: "2026-06-29T14:02:00.000Z",
      id: "rbac-denial-aurora-settings",
      immutable: true,
      policyVersionId: "rbac-policy-volga",
      reason: "No tenant-scoped grant matched.",
      resource: "settings",
      roleKey: "admin",
      tenantId: "tenant-aurora",
      traceId: "trc_rbac_denial_aurora"
    });

    const active = await repository.getActiveRbacPolicyVersion() as Record<string, unknown> | undefined;
    const grants = await repository.listRbacRoleGrants({ policyVersionId: "rbac-policy-volga", roleKey: "admin" }) as Array<Record<string, unknown>>;
    const denials = await repository.listPermissionDenialEvents({ tenantId: "tenant-aurora" }) as Array<Record<string, unknown>>;

    assert.equal(active?.id, "rbac-policy-volga");
    assert.equal(grants.length, 1);
    assert.equal(grants[0].tenantId, "tenant-volga");
    assert.equal(denials.length, 1);
    assert.equal(denials[0].id, "rbac-denial-aurora-settings");
    assert.equal(denials[0].immutable, true);
    assert.equal(client.calls.rbacPolicyVersionUpserts.length, 1);
    assert.equal(client.calls.rbacRoleGrantCreates.length, 1);
    assert.equal(client.calls.permissionDenialCreates.length, 1);
  });

  it("fails closed when a persisted RBAC grant has a malformed effect value", async () => {
    const { client } = createFakePrismaIdentityClient({
      permissionRoles: [{
        actions: ["settings.manage"],
        aliases: ["admin"],
        description: "Tenant admin",
        groupIds: ["admins"],
        key: "admin",
        metadata: null
      }],
      rbacRoleGrants: [{
        action: "settings.manage",
        createdAt: new Date("2026-06-29T14:01:00.000Z"),
        createdBy: "svc-admin-001",
        effect: "alow",
        id: "rbac-grant-malformed-effect",
        policyVersionId: "rbac-policy-default",
        resource: "settings",
        roleKey: "admin",
        tenantId: "tenant-volga",
        traceId: "trc_rbac_grant_malformed"
      }]
    });
    const repository = IdentityRepository.prisma({ client }) as IdentityRepository & {
      listPermissionDenialEvents(input?: { tenantId?: string }): unknown;
    };
    const permissions = new PermissionService(repository);

    const decision = await permissions.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "admin",
      tenantId: "tenant-volga"
    } as Parameters<PermissionService["validatePermission"]>[0] & { tenantId: string });

    assert.equal(decision.status, "denied");
    assert.equal(decision.error?.code, "permission_denied");
    assert.equal(decision.data.allowed, false);
    assert.equal((decision.data as Record<string, unknown>).grantId, undefined);

    const denials = await repository.listPermissionDenialEvents({ tenantId: "tenant-volga" }) as Array<Record<string, unknown>>;
    assert.equal(denials.length, 1);
    assert.equal(denials[0].reason, "No tenant-scoped grant matched.");
  });

  it("retires existing active RBAC policies before saving a new active policy through Prisma", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client }) as IdentityRepository & {
      getActiveRbacPolicyVersion(): unknown;
      saveRbacPolicyVersion(input: Record<string, unknown>): unknown;
    };

    await repository.saveRbacPolicyVersion({
      activatedAt: "2026-06-29T15:00:00.000Z",
      checksum: "sha256:rbac-policy-next",
      createdAt: "2026-06-29T15:00:00.000Z",
      createdBy: "svc-admin-001",
      description: "Next active RBAC policy",
      id: "rbac-policy-next",
      status: "active",
      version: "2026.06.29-next"
    });

    const active = await repository.getActiveRbacPolicyVersion() as Record<string, unknown> | undefined;

    assert.equal(active?.id, "rbac-policy-next");
    assert.equal(client.calls.rbacPolicyVersionUpdateMany.length, 1);
    assert.deepEqual(client.calls.rbacPolicyVersionUpdateMany[0], {
      data: { status: "retired" },
      where: { id: { not: "rbac-policy-next" }, status: "active" }
    });
  });

  it("rejects dangling RBAC grant and denial references through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient({
      permissionRoles: [{
        actions: ["settings.manage"],
        aliases: ["admin"],
        description: "Tenant admin",
        groupIds: ["admins"],
        key: "admin",
        metadata: null
      }]
    });
    const repository = IdentityRepository.prisma({ client }) as IdentityRepository & {
      recordPermissionDenialEvent(input: Record<string, unknown>): unknown;
      recordRbacRoleGrant(input: Record<string, unknown>): unknown;
    };
    const validGrant = {
      action: "settings.manage",
      createdAt: "2026-06-29T14:01:00.000Z",
      createdBy: "svc-admin-001",
      effect: "allow",
      id: "rbac-grant-valid-reference",
      policyVersionId: "rbac-policy-default",
      resource: "settings",
      roleKey: "admin",
      tenantId: "tenant-volga",
      traceId: "trc_rbac_grant_valid_reference"
    };

    await assert.rejects(() => repository.recordRbacRoleGrant({
      ...validGrant,
      id: "rbac-grant-missing-policy",
      policyVersionId: "rbac-policy-missing"
    }), /RBAC policy version rbac-policy-missing was not found/);
    await assert.rejects(() => repository.recordRbacRoleGrant({
      ...validGrant,
      id: "rbac-grant-missing-role",
      roleKey: "missing_role"
    }), /Permission role missing_role was not found/);
    await assert.rejects(() => repository.recordRbacRoleGrant({
      ...validGrant,
      id: "rbac-grant-missing-tenant",
      tenantId: "tenant-missing"
    }), /Tenant tenant-missing was not found/);
    await assert.rejects(() => repository.recordPermissionDenialEvent({
      action: "settings.manage",
      actorId: "svc-admin-001",
      at: "2026-06-29T14:02:00.000Z",
      id: "rbac-denial-missing-policy",
      immutable: true,
      policyVersionId: "rbac-policy-missing",
      reason: "No tenant-scoped grant matched.",
      resource: "settings",
      roleKey: "admin",
      tenantId: "tenant-volga",
      traceId: "trc_rbac_denial_missing_policy"
    }), /RBAC policy version rbac-policy-missing was not found/);
  });

  it("persists Prisma permission denials for unknown roles without violating role-key references", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client }) as IdentityRepository & {
      listPermissionDenialEvents(input?: { tenantId?: string }): unknown;
    };
    const permissions = new PermissionService(repository);

    const decision = await permissions.validatePermission({
      action: "settings.manage",
      resource: "settings",
      roleMode: "non-admin",
      tenantId: "tenant-volga"
    } as Parameters<PermissionService["validatePermission"]>[0] & { tenantId: string });

    assert.equal(decision.status, "denied");
    assert.equal(decision.error?.code, "role_unrecognized");
    assert.equal(decision.data.role, "unknown");
    const denials = await repository.listPermissionDenialEvents({ tenantId: "tenant-volga" }) as Array<Record<string, unknown>>;
    assert.equal(denials.length, 1);
    assert.equal(denials[0].roleKey, null);
  });

  it("canonicalizes service-admin session aliases before writing Prisma guard permission denials", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client }) as IdentityRepository & {
      listPermissionDenialEvents(): unknown;
    };
    IdentityRepository.useDefault(repository);
    const session = await repository.createServiceAdminSession({
      actorId: "svc-admin-prod",
      actorName: "Production Admin",
      adminEmail: "production-admin@example.com",
      allowedActions: ["tenants.manage"],
      availableOrganizations: [{ id: "tenant-volga", name: "Volga Logistics", role: "service_admin" }],
      currentTenantId: "tenant-volga",
      mfaVerified: true,
      ttlMinutes: 30
    });
    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-12-31T23:59:59.000Z",
      accessTokenHash: hashServiceAdminToken("prisma-guard-access-token"),
      id: "prisma-guard-token-pair",
      issuedAt: "2026-07-02T00:00:00.000Z",
      refreshTokenExpiresAt: "2100-01-01T23:59:59.000Z",
      refreshTokenHash: hashServiceAdminToken("prisma-guard-refresh-token"),
      sessionId: session.id,
      subjectId: session.adminId
    });
    const guard = new ServiceAdminSessionGuard(reflectorForAction("billing.change"));

    try {
      await assert.rejects(
        () => guard.canActivate(executionContextForRequest({ headers: { authorization: "Bearer prisma-guard-access-token" } })),
        /permission_denied|permission/
      );
      const denials = await repository.listPermissionDenialEvents() as Array<Record<string, unknown>>;
      assert.equal(denials.length, 1);
      assert.equal(denials[0].roleKey, "admin");
      assert.equal(denials[0].action, "billing.change");
    } finally {
      IdentityRepository.useDefault(IdentityRepository.inMemory());
    }
  });

  it("persists service-admin user actions and audit rows through Prisma transaction", async () => {
    const { client } = createFakePrismaIdentityClient({
      tenantUsers: [{
        device: "Chrome, Windows",
        email: "sergey@volga.example",
        id: "usr-volga-admin",
        inviteStatus: "accepted",
        lastActiveAt: new Date("2026-06-27T08:00:00.000Z"),
        mfa: "enabled",
        metadata: {},
        name: "Sergey Volga",
        risk: "medium",
        role: "admin",
        sessions: 4,
        status: "active",
        supportNotes: "Primary admin",
        tenantId: "tenant-volga"
      }]
    });
    const repository = IdentityRepository.prisma({ client });

    const result = await repository.applyServiceAdminUserAction({
      action: "user.mfa.reset",
      auditEvent: {
        action: "user.mfa.reset",
        actor: "svc-admin",
        actorName: "Service Admin",
        at: "2026-06-28T08:00:00.000Z",
        id: "evt_service_admin_test",
        immutable: true,
        reason: "Persistent MFA reset audit",
        result: "applied",
        severity: "warning",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        traceId: "trc_service_admin_test",
        userId: "usr-volga-admin"
      },
      changes: { mfa: "reset_pending" },
      userId: "usr-volga-admin"
    });

    assert.equal(client.calls.transactions, 1);
    assert.equal(result.user.mfa, "reset_pending");
    assert.equal(result.auditEvent.id, "evt_service_admin_test");
    assert.equal(client.calls.tenantUserUpdates.length, 1);
    assert.deepEqual(client.calls.tenantUserUpdates[0].data, { mfa: "reset_pending" });
    assert.equal(client.calls.serviceAdminAuditCreates.length, 1);
    assert.equal(client.calls.serviceAdminAuditCreates[0].data.at instanceof Date, true);
  });

  it("persists service-admin impersonations and break-glass approvals through Prisma transactions", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });
    const startedAt = "2026-06-28T10:00:00.000Z";
    const expiresAt = "2026-06-28T10:15:00.000Z";
    const startAudit = fakeServiceAdminAuditEvent({
      action: "impersonation.start",
      at: startedAt,
      id: "evt_impersonation_start_test",
      result: "started",
      target: "imp_tenant-volga_test"
    });

    const created = await repository.createServiceAdminImpersonation({
      auditEvent: startAudit,
      session: {
        auditEventId: startAudit.id,
        approvalId: "bg_prisma_test",
        banner: "Break-glass write access for Volga Logistics",
        durationMinutes: 15,
        expiresAt,
        id: "imp_tenant-volga_test",
        mode: "break_glass_write",
        startedAt,
        stoppedAt: null,
        stopAuditEvent: null,
        tenantId: "tenant-volga",
        tenantName: "Volga Logistics",
        userId: "usr-volga-admin",
        userName: "Sergey Volga"
      }
    });
    assert.equal(created.session.id, "imp_tenant-volga_test");
    assert.equal(created.session.auditEventId, startAudit.id);
    assert.equal(created.session.approvalId, "bg_prisma_test");
    assert.equal(created.session.mode, "break_glass_write");
    assert.equal(created.auditEvent.id, startAudit.id);

    const active = await repository.findActiveServiceAdminImpersonation({
      now: new Date("2026-06-28T10:05:00.000Z"),
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    assert.equal(active?.id, "imp_tenant-volga_test");
    assert.equal(active?.auditEventId, startAudit.id);
    assert.equal(active?.approvalId, "bg_prisma_test");
    assert.equal(active?.mode, "break_glass_write");

    const stopAudit = fakeServiceAdminAuditEvent({
      action: "impersonation.stop",
      at: "2026-06-28T10:06:00.000Z",
      id: "evt_impersonation_stop_test",
      result: "stopped",
      target: "imp_tenant-volga_test"
    });
    const stopped = await repository.stopServiceAdminImpersonation({
      auditEvent: stopAudit,
      impersonationId: "imp_tenant-volga_test",
      stoppedAt: "2026-06-28T10:06:00.000Z"
    });
    assert.equal(stopped.session.stoppedAt, "2026-06-28T10:06:00.000Z");
    assert.equal(stopped.session.stopAuditEvent?.id, stopAudit.id);
    assert.equal(stopped.auditEvent.id, stopAudit.id);

    const approvalAudit = fakeServiceAdminAuditEvent({
      action: "break_glass.request",
      at: "2026-06-28T10:07:00.000Z",
      id: "evt_break_glass_test",
      result: "pending",
      target: "usr-volga-admin"
    });
    const approval = await repository.createBreakGlassApproval({
      approval: {
        action: "impersonation.write",
        auditEventId: approvalAudit.id,
        durationMinutes: 15,
        expiresAt: "2026-06-28T10:22:00.000Z",
        id: "bg_prisma_test",
        requestedAt: "2026-06-28T10:07:00.000Z",
        status: "pending",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      },
      auditEvent: approvalAudit
    });
    assert.equal(approval.approval.id, "bg_prisma_test");
    assert.equal(approval.auditEvent.id, approvalAudit.id);

    const approvalDecisionAudit = fakeServiceAdminAuditEvent({
      action: "break_glass.approve",
      at: "2026-06-28T10:08:00.000Z",
      id: "evt_break_glass_approve_test",
      result: "approved",
      target: "bg_prisma_test"
    });
    const decision = await repository.decideBreakGlassApproval({
      approvalId: "bg_prisma_test",
      auditEvent: approvalDecisionAudit,
      status: "approved"
    });
    assert.equal(decision.approval.status, "approved");
    assert.equal(decision.auditEvent.id, approvalDecisionAudit.id);

    const persistedApproval = await repository.findBreakGlassApproval("bg_prisma_test");
    assert.equal(persistedApproval?.status, "approved");

    assert.equal(client.calls.transactions, 4);
    assert.equal(client.calls.serviceAdminImpersonationCreates.length, 1);
    assert.equal(client.calls.serviceAdminImpersonationCreates[0].data.approvalId, "bg_prisma_test");
    assert.equal(client.calls.serviceAdminImpersonationCreates[0].data.mode, "break_glass_write");
    assert.deepEqual(client.calls.serviceAdminImpersonationFindFirst[0], {
      where: {
        expiresAt: { gt: new Date(startedAt) },
        stoppedAt: null,
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      }
    });
    assert.equal(client.calls.rawUnsafe.some((call) => call.query.includes("pg_advisory_xact_lock") && call.values.includes("tenant-volga") && call.values.includes("usr-volga-admin")), true);
    assert.equal(client.calls.serviceAdminImpersonationUpdates.length, 1);
    assert.equal(client.calls.breakGlassApprovalCreates.length, 1);
    assert.equal(client.calls.breakGlassApprovalUpdates.length, 1);
    assert.deepEqual(client.calls.breakGlassApprovalUpdates[0].where, {
      id: "bg_prisma_test",
      status: "pending"
    });
    assert.equal(client.calls.serviceAdminAuditCreates.length, 4);
  });

  it("records standalone service-admin audit rows through the Prisma adapter", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });
    const auditEvent = fakeServiceAdminAuditEvent({
      action: "user.mfa.reset",
      at: "2026-06-28T10:09:00.000Z",
      id: "evt_service_admin_denied_test",
      result: "blocked_reason_required",
      target: "usr-volga-admin"
    });

    const persisted = await repository.recordServiceAdminAuditEvent(auditEvent);

    assert.equal(persisted.id, "evt_service_admin_denied_test");
    assert.equal(persisted.result, "blocked_reason_required");
    assert.equal(client.calls.serviceAdminAuditCreates.length, 1);
    assert.equal(client.calls.serviceAdminAuditCreates[0].data.id, "evt_service_admin_denied_test");
  });

  it("rejects duplicate active service-admin impersonation creates inside the repository transaction", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });

    await repository.createServiceAdminImpersonation({
      auditEvent: fakeServiceAdminAuditEvent({
        action: "impersonation.start",
        at: "2026-06-28T10:00:00.000Z",
        id: "evt_impersonation_first",
        result: "started",
        target: "imp_first"
      }),
      session: {
        approvalId: null,
        banner: "Read-only support view for Volga Logistics",
        durationMinutes: 15,
        expiresAt: "2026-06-28T10:15:00.000Z",
        id: "imp_first",
        mode: "read_only_by_default",
        startedAt: "2026-06-28T10:00:00.000Z",
        stoppedAt: null,
        stopAuditEvent: null,
        tenantId: "tenant-volga",
        tenantName: "Volga Logistics",
        userId: "usr-volga-admin",
        userName: "Sergey Volga"
      }
    });

    await assert.rejects(() => repository.createServiceAdminImpersonation({
      auditEvent: fakeServiceAdminAuditEvent({
        action: "impersonation.start",
        at: "2026-06-28T10:01:00.000Z",
        id: "evt_impersonation_second",
        result: "started",
        target: "imp_second"
      }),
      session: {
        approvalId: null,
        banner: "Read-only support view for Volga Logistics",
        durationMinutes: 15,
        expiresAt: "2026-06-28T10:16:00.000Z",
        id: "imp_second",
        mode: "read_only_by_default",
        startedAt: "2026-06-28T10:01:00.000Z",
        stoppedAt: null,
        stopAuditEvent: null,
        tenantId: "tenant-volga",
        tenantName: "Volga Logistics",
        userId: "usr-volga-admin",
        userName: "Sergey Volga"
      }
    }), /Active service-admin impersonation already exists/);

    assert.equal(client.calls.serviceAdminImpersonationCreates.length, 1);
    assert.equal(client.calls.serviceAdminAuditCreates.length, 1);
    assert.equal(client.calls.rawUnsafe.filter((call) => call.query.includes("pg_advisory_xact_lock")).length, 2);
  });

  it("fails closed when a Prisma transaction client cannot take advisory locks", async () => {
    const { client } = createFakePrismaIdentityClient({ omitTransactionRawSql: true });
    const repository = IdentityRepository.prisma({ client });

    await assert.rejects(() => repository.createServiceAdminImpersonation({
      auditEvent: fakeServiceAdminAuditEvent({
        action: "impersonation.start",
        at: "2026-06-28T10:00:00.000Z",
        id: "evt_impersonation_no_lock",
        result: "started",
        target: "imp_no_lock"
      }),
      session: {
        approvalId: null,
        banner: "Read-only support view for Volga Logistics",
        durationMinutes: 15,
        expiresAt: "2026-06-28T10:15:00.000Z",
        id: "imp_no_lock",
        mode: "read_only_by_default",
        startedAt: "2026-06-28T10:00:00.000Z",
        stoppedAt: null,
        stopAuditEvent: null,
        tenantId: "tenant-volga",
        tenantName: "Volga Logistics",
        userId: "usr-volga-admin",
        userName: "Sergey Volga"
      }
    }), /advisory locks/);

    assert.equal(client.calls.serviceAdminAuditCreates.length, 0);
    assert.equal(client.calls.serviceAdminImpersonationCreates.length, 0);
  });

  it("updates tenant status, audit event and outbox in one Prisma transaction", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });

    const result = await repository.updateTenantStatus({
      reason: "Prisma tenant restriction audit",
      status: "restricted",
      tenantId: "tenant-volga",
      traceId: "trc_prisma_tenant_status"
    });

    assert.equal(client.calls.transactions, 1);
    assert.equal(result.tenant.status, "restricted");
    assert.equal(result.tenant.legalName, "AO Volga Logistics");
    assert.equal(result.auditEvent.tenantId, "tenant-volga");
    assert.equal(result.auditEvent.action, "tenant.status.change");
    assert.equal(result.auditEvent.reason, "Prisma tenant restriction audit");
    assert.equal(result.outbox.queue, "identity-events");
    assert.equal(result.outbox.payload.from, "watch");
    assert.equal(result.outbox.payload.status, "restricted");

    assert.equal(client.calls.tenantUpdates.length, 1);
    assert.equal(client.calls.tenantUpdates[0].where.id, "tenant-volga");
    assert.equal(client.calls.tenantUpdates[0].data.status, "restricted");
    assert.equal(client.calls.tenantUpdates[0].data.metadata.status, "restricted");
    assert.equal(client.calls.tenantAuditCreates.length, 1);
    assert.equal(client.calls.tenantAuditCreates[0].data.at instanceof Date, true);
    assert.equal(client.calls.tenantAuditCreates[0].data.immutable, true);
    assert.equal(client.calls.outboxCreates.length, 1);
    assert.equal(client.calls.outboxCreates[0].data.status, "pending");
    assert.equal(client.calls.outboxCreates[0].data.occurredAt instanceof Date, true);
  });

  it("persists MFA challenges and service-admin sessions through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });

    const otpHash = `hmac-sha256:${"a".repeat(64)}`;
    const challenge = await repository.createMfaChallenge({
      email: "service-admin@example.com",
      otpHash
    });
    assert.match(challenge.id, /^mfa_/);
    assert.equal(client.calls.mfaCreates[0].data.email, "service-admin@example.com");
    assert.equal(client.calls.mfaCreates[0].data.otpHash, otpHash);
    assert.equal(client.calls.mfaCreates[0].data.expiresAt instanceof Date, true);

    const consumed = await repository.consumeMfaChallenge({
      challengeId: challenge.id,
      email: "service-admin@example.com",
      now: new Date("2026-06-27T10:00:00.000Z"),
      otpHash
    });
    assert.equal(consumed.valid, true);
    assert.equal(client.calls.mfaUpdateMany[0].where.id, challenge.id);
    assert.equal(client.calls.mfaUpdateMany[0].where.consumedAt, null);

    const reused = await repository.consumeMfaChallenge({
      challengeId: challenge.id,
      email: "service-admin@example.com",
      now: new Date("2026-06-27T10:01:00.000Z"),
      otpHash
    });
    assert.equal(reused.valid, false);
    assert.equal(reused.code, "mfa_challenge_consumed");

    const session = await repository.createServiceAdminSession({
      actorId: "svc-prisma-admin",
      actorName: "Prisma Admin",
      adminEmail: "prisma-admin@example.com",
      allowedActions: ["tenants.manage"],
      availableOrganizations: [{ id: "tenant-volga", name: "Volga Logistics", role: "service_admin" }],
      currentTenantId: "tenant-volga",
      mfaVerified: true,
      ttlMinutes: 30
    });
    assert.match(session.id, /^svc-session_/);
    assert.equal(session.actorId, "svc-prisma-admin");
    assert.deepEqual(client.calls.sessionCreates[0].data.allowedActions, ["tenants.manage"]);
    assert.equal(client.calls.sessionCreates[0].data.availableOrganizations.length > 0, true);

    const found = await repository.findServiceAdminSession(session.id);
    assert.equal(found?.actorName, "Prisma Admin");

    const revoked = await repository.revokeServiceAdminSession(session.id);
    assert.equal(revoked?.id, session.id);
    assert.match(revoked?.revokedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(client.calls.sessionUpdates[0].where.id, session.id);
    assert.equal(client.calls.sessionUpdates[0].data.revokedAt instanceof Date, true);
  });

  it("persists invite and recovery auth-flow tokens through Prisma delegates without raw secrets", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });

    const invite = await repository.createInviteToken({
      code: "invite-prisma-contract",
      email: "Prisma.Invite@Volga.Example",
      expiresAt: "2099-07-04T12:00:00.000Z",
      tenantId: "tenant-volga"
    });
    assert.equal(invite.code, "invite-prisma-contract");
    assert.equal(invite.email, "prisma.invite@volga.example");
    assert.equal(client.calls.authInviteTokenUpserts.length, 1);
    assert.equal(client.calls.authInviteTokenUpserts[0].where.codeHash, hashAuthFlowToken("invite-prisma-contract"));
    assert.equal("code" in client.calls.authInviteTokenUpserts[0].create, false);

    const consumedInvite = await repository.consumeInviteToken({
      code: "invite-prisma-contract",
      email: "prisma.invite@volga.example",
      now: new Date("2026-07-04T12:00:00.000Z")
    });
    assert.equal(consumedInvite.status, "consumed");
    assert.equal(consumedInvite.token.tenantId, "tenant-volga");
    assert.equal(client.calls.authInviteTokenUpdateMany[0].where.id, invite.id);
    assert.equal(client.calls.authInviteTokenUpdateMany[0].where.consumedAt, null);

    const replayedInvite = await repository.consumeInviteToken({
      code: "invite-prisma-contract",
      email: "prisma.invite@volga.example",
      now: new Date("2026-07-04T12:01:00.000Z")
    });
    assert.equal(replayedInvite.status, "denied");
    assert.equal(replayedInvite.code, "invite_expired");

    const recovery = await repository.createRecoveryToken("Prisma.Recovery@Volga.Example");
    assert.match(recovery.token, /^recovery_/);
    assert.equal(recovery.email, "prisma.recovery@volga.example");
    assert.equal(client.calls.authRecoveryTokenUpserts.length, 1);
    assert.equal(client.calls.authRecoveryTokenUpserts[0].where.tokenHash, hashAuthFlowToken(recovery.token));
    assert.equal("token" in client.calls.authRecoveryTokenUpserts[0].create, false);

    const consumedRecovery = await repository.consumeRecoveryToken({
      email: "prisma.recovery@volga.example",
      now: new Date("2026-07-04T12:00:00.000Z"),
      token: recovery.token
    });
    assert.equal(consumedRecovery.status, "consumed");
    assert.equal(consumedRecovery.token.email, "prisma.recovery@volga.example");
    assert.equal(client.calls.authRecoveryTokenUpdateMany[0].where.id, recovery.id);
    assert.equal(client.calls.authRecoveryTokenUpdateMany[0].where.consumedAt, null);

    const replayedRecovery = await repository.consumeRecoveryToken({
      email: "prisma.recovery@volga.example",
      now: new Date("2026-07-04T12:01:00.000Z"),
      token: recovery.token
    });
    assert.equal(replayedRecovery.status, "denied");
    assert.equal(replayedRecovery.code, "recovery_expired");
  });

  it("persists service-admin token lifecycle through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });
    const session = await repository.createServiceAdminSession({
      actorId: "svc-prisma-token-admin",
      actorName: "Prisma Token Admin",
      adminEmail: "prisma-token-admin@example.com",
      allowedActions: ["tenants.manage"],
      availableOrganizations: [{ id: "tenant-volga", name: "Volga Logistics", role: "service_admin" }],
      currentTenantId: "tenant-volga",
      mfaVerified: true,
      ttlMinutes: 30
    });

    await repository.createServiceAdminTokenPair({
      accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
      accessTokenHash: hashServiceAdminTokenForPrismaTest("prisma-access-1"),
      id: "sat_pair_prisma_1",
      issuedAt: "2026-06-29T10:00:00.000Z",
      refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z",
      refreshTokenHash: hashServiceAdminTokenForPrismaTest("prisma-refresh-1"),
      sessionId: session.id,
      subjectId: "svc-prisma-token-admin"
    });
    await assert.rejects(
      () => repository.createServiceAdminTokenPair({
        accessTokenExpiresAt: "2099-06-29T11:00:00.000Z",
        accessTokenHash: hashServiceAdminTokenForPrismaTest("prisma-same-secret"),
        id: "sat_pair_prisma_same_secret",
        issuedAt: "2026-06-29T10:01:00.000Z",
        refreshTokenExpiresAt: "2099-07-29T10:01:00.000Z",
        refreshTokenHash: hashServiceAdminTokenForPrismaTest("prisma-same-secret"),
        sessionId: session.id,
        subjectId: "svc-prisma-token-admin"
      }),
      /token hash conflict/
    );
    await assert.rejects(
      () => repository.createServiceAdminTokenPair({
        accessTokenExpiresAt: "2099-06-29T11:01:00.000Z",
        accessTokenHash: hashServiceAdminTokenForPrismaTest("prisma-access-reused-id"),
        id: "sat_pair_prisma_1",
        issuedAt: "2026-06-29T10:01:00.000Z",
        refreshTokenExpiresAt: "2099-07-29T10:01:00.000Z",
        refreshTokenHash: hashServiceAdminTokenForPrismaTest("prisma-refresh-reused-id"),
        sessionId: session.id,
        subjectId: "svc-prisma-token-admin"
      }),
      /token pair id conflict/
    );

    const bearerDecision = await resolveServiceAdminContextAsync({
      headers: { authorization: "Bearer prisma-access-1" },
      requiredAction: "tenants.manage",
      sessionLookup: (accessToken) => repository.findServiceAdminSessionByAccessToken(accessToken)
    });
    assert.equal(bearerDecision.allowed, true);
    assert.equal(bearerDecision.sessionId, session.id);

    const rotated = await repository.rotateServiceAdminRefreshToken({
      idempotencyKey: "rotate-prisma-token-1",
      nextAccessTokenExpiresAt: "2099-06-29T11:05:00.000Z",
      nextAccessTokenHash: hashServiceAdminTokenForPrismaTest("prisma-access-2"),
      nextRefreshTokenExpiresAt: "2099-07-29T10:05:00.000Z",
      nextRefreshTokenHash: hashServiceAdminTokenForPrismaTest("prisma-refresh-2"),
      refreshTokenHash: hashServiceAdminTokenForPrismaTest("prisma-refresh-1"),
      rotatedAt: "2026-06-29T10:05:00.000Z"
    });
    const duplicateRotate = await repository.rotateServiceAdminRefreshToken({
      idempotencyKey: "rotate-prisma-token-1",
      nextAccessTokenExpiresAt: "2099-06-29T11:05:00.000Z",
      nextAccessTokenHash: hashServiceAdminTokenForPrismaTest("prisma-access-2"),
      nextRefreshTokenExpiresAt: "2099-07-29T10:05:00.000Z",
      nextRefreshTokenHash: hashServiceAdminTokenForPrismaTest("prisma-refresh-2"),
      refreshTokenHash: hashServiceAdminTokenForPrismaTest("prisma-refresh-1"),
      rotatedAt: "2026-06-29T10:05:00.000Z"
    });

    assert.equal(rotated?.status, "rotated");
    assert.equal(duplicateRotate?.status, "duplicate");
    assert.equal(await repository.findServiceAdminSessionByAccessToken("prisma-access-1"), undefined);
    assert.equal(Boolean(await repository.findServiceAdminSessionByAccessToken("prisma-access-2")), true);

    const revoked = await repository.revokeServiceAdminToken({
      idempotencyKey: "revoke-prisma-token-2",
      revokedAt: "2026-06-29T10:06:00.000Z",
      tokenHash: hashServiceAdminTokenForPrismaTest("prisma-access-2")
    });
    const duplicateRevoke = await repository.revokeServiceAdminToken({
      idempotencyKey: "revoke-prisma-token-2",
      revokedAt: "2026-06-29T10:06:00.000Z",
      tokenHash: hashServiceAdminTokenForPrismaTest("prisma-access-2")
    });

    assert.equal(revoked?.status, "revoked");
    assert.equal(duplicateRevoke?.status, "duplicate");
    assert.equal(await repository.findServiceAdminSessionByAccessToken("prisma-access-2"), undefined);
  });

  it("persists OIDC provider config and callback descriptors through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client }) as IdentityRepository & {
      findOidcCallbackDescriptor(state: string): unknown;
      findOidcProviderConfig(providerId: string): unknown;
      recordOidcCallbackDescriptor(input: {
        consumedAt: string | null;
        expiresAt: string;
        id: string;
        nonceHash: string;
        providerId: string;
        redirectUri: string;
        requestedAt: string;
        state: string;
        traceId: string;
      }): unknown;
      saveOidcProviderConfig(input: {
        audience: string;
        clientId: string;
        enabled: boolean;
        issuer: string;
        jwksUri: string;
        providerId: string;
        scopes: string[];
        tenantId: string;
        updatedAt: string;
      }): unknown;
      consumeOidcCallbackDescriptor(input: {
        now?: Date;
        state: string;
      }): unknown;
    };

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
    await repository.recordOidcCallbackDescriptor({
      consumedAt: null,
      expiresAt: "2026-06-29T12:10:00.000Z",
      id: "oidc_cb_001",
      nonceHash: "sha256:nonce-001",
      providerId: "oidc-main",
      redirectUri: "https://support.example.com/auth/oidc/callback",
      requestedAt: "2026-06-29T12:00:30.000Z",
      state: "state-oidc-001",
      traceId: "trc_oidc_callback_001"
    });

    const provider = await repository.findOidcProviderConfig("oidc-main") as Record<string, unknown> | undefined;
    const callback = await repository.findOidcCallbackDescriptor("state-oidc-001") as Record<string, unknown> | undefined;

    assert.equal(provider?.issuer, "https://idp.example.com/");
    assert.deepEqual(provider?.scopes, ["openid", "email", "profile"]);
    assert.equal(callback?.providerId, "oidc-main");
    assert.equal(callback?.state, "state-oidc-001");
    await assert.rejects(() => repository.recordOidcCallbackDescriptor({
      consumedAt: null,
      expiresAt: "2026-06-29T12:12:00.000Z",
      id: "oidc_cb_002",
      nonceHash: "sha256:nonce-duplicate-state",
      providerId: "oidc-main",
      redirectUri: "https://support.example.com/auth/oidc/callback",
      requestedAt: "2026-06-29T12:01:00.000Z",
      state: "state-oidc-001",
      traceId: "trc_oidc_callback_duplicate_state"
    }), /OIDC callback descriptor already exists/);
    await assert.rejects(() => repository.recordOidcCallbackDescriptor({
      consumedAt: null,
      expiresAt: "2026-06-29T12:12:00.000Z",
      id: "oidc_cb_001",
      nonceHash: "sha256:nonce-duplicate-id",
      providerId: "oidc-main",
      redirectUri: "https://support.example.com/auth/oidc/callback",
      requestedAt: "2026-06-29T12:01:30.000Z",
      state: "state-oidc-002",
      traceId: "trc_oidc_callback_duplicate_id"
    }), /OIDC callback descriptor already exists/);

    const preservedCallback = await repository.findOidcCallbackDescriptor("state-oidc-001") as Record<string, unknown> | undefined;
    assert.equal(preservedCallback?.id, "oidc_cb_001");
    assert.equal(preservedCallback?.nonceHash, "sha256:nonce-001");

    const consumed = await repository.consumeOidcCallbackDescriptor({
      now: new Date("2026-06-29T12:02:00.000Z"),
      state: "state-oidc-001"
    }) as Record<string, unknown>;
    assert.equal(consumed.status, "consumed");
    assert.equal((consumed.descriptor as Record<string, unknown>).consumedAt, "2026-06-29T12:02:00.000Z");

    const replay = await repository.consumeOidcCallbackDescriptor({
      now: new Date("2026-06-29T12:03:00.000Z"),
      state: "state-oidc-001"
    }) as Record<string, unknown>;
    assert.equal(replay.status, "replayed");
  });

  it("persists SAML provider metadata, ACS descriptors and assertion replay ids through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client }) as IdentityRepository & {
      consumeSamlAcsRequestDescriptor(input: { now?: Date; requestId?: string }): unknown;
      findSamlAcsRequestDescriptor(requestId: string): unknown;
      findSamlAssertionReplay(providerId: string, assertionId: string): unknown;
      findSamlProviderMetadata(providerId: string): unknown;
      recordSamlAcsRequestDescriptor(input: {
        acsUrl: string;
        consumedAt: string | null;
        expiresAt: string;
        id: string;
        providerId: string;
        relayState: string;
        requestId: string;
        requestedAt: string;
        traceId: string;
      }): unknown;
      recordSamlAssertionReplay(input: {
        assertionId: string;
        audience: string;
        expiresAt: string;
        providerId: string;
        receivedAt: string;
        requestId: string;
        subjectId: string;
        traceId: string;
      }): unknown;
      saveSamlProviderMetadata(input: {
        acsUrl: string;
        audience: string;
        certificateFingerprint: string;
        enabled: boolean;
        entityId: string;
        providerId: string;
        ssoUrl: string;
        tenantId: string;
        updatedAt: string;
      }): unknown;
    };

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
    await repository.recordSamlAssertionReplay({
      assertionId: "assertion-001",
      audience: "support-api",
      expiresAt: "2026-06-29T13:15:00.000Z",
      providerId: "saml-main",
      receivedAt: "2026-06-29T13:02:00.000Z",
      requestId: "saml-request-001",
      subjectId: "svc-admin-001",
      traceId: "trc_saml_assertion_001"
    });

    const provider = await repository.findSamlProviderMetadata("saml-main") as Record<string, unknown> | undefined;
    const acs = await repository.findSamlAcsRequestDescriptor("saml-request-001") as Record<string, unknown> | undefined;
    const replay = await repository.findSamlAssertionReplay("saml-main", "assertion-001") as Record<string, unknown> | undefined;

    assert.equal(provider?.entityId, "https://idp.example.com/saml/metadata");
    assert.equal(provider?.certificateFingerprint, "sha256:saml-cert-001");
    assert.equal(acs?.providerId, "saml-main");
    assert.equal(acs?.relayState, "relay-state-001");
    assert.equal(replay?.subjectId, "svc-admin-001");
    assert.equal(replay?.requestId, "saml-request-001");

    const consumed = await repository.consumeSamlAcsRequestDescriptor({
      now: new Date("2026-06-29T13:02:00.000Z"),
      requestId: "saml-request-001"
    }) as Record<string, unknown>;
    assert.equal(consumed.status, "consumed");
    assert.equal((consumed.descriptor as Record<string, unknown>).consumedAt, "2026-06-29T13:02:00.000Z");

    const acsAfterConsume = await repository.findSamlAcsRequestDescriptor("saml-request-001") as Record<string, unknown> | undefined;
    assert.equal(acsAfterConsume?.consumedAt, "2026-06-29T13:02:00.000Z");

    const acsReplay = await repository.consumeSamlAcsRequestDescriptor({
      now: new Date("2026-06-29T13:03:00.000Z"),
      requestId: "saml-request-001"
    }) as Record<string, unknown>;
    assert.equal(acsReplay.status, "replayed");
    assert.equal(client.calls.samlAcsRequestUpdateMany.length, 1);

    await assert.rejects(() => repository.recordSamlAcsRequestDescriptor({
      acsUrl: "https://support.example.com/auth/saml/acs",
      consumedAt: null,
      expiresAt: "2026-06-29T13:11:00.000Z",
      id: "saml_acs_001",
      providerId: "saml-main",
      relayState: "relay-state-duplicate-id",
      requestId: "saml-request-duplicate-id",
      requestedAt: "2026-06-29T13:04:00.000Z",
      traceId: "trc_saml_acs_duplicate_id"
    }), /SAML ACS request descriptor already exists/);
    await assert.rejects(() => repository.recordSamlAcsRequestDescriptor({
      acsUrl: "https://support.example.com/auth/saml/acs",
      consumedAt: null,
      expiresAt: "2026-06-29T13:11:00.000Z",
      id: "saml_acs_duplicate_request",
      providerId: "saml-main",
      relayState: "relay-state-duplicate-request",
      requestId: "saml-request-001",
      requestedAt: "2026-06-29T13:04:30.000Z",
      traceId: "trc_saml_acs_duplicate_request"
    }), /SAML ACS request descriptor already exists/);
    await assert.rejects(() => repository.recordSamlAcsRequestDescriptor({
      acsUrl: "https://support.example.com/auth/saml/acs",
      consumedAt: null,
      expiresAt: "2026-06-29T13:11:00.000Z",
      id: "saml_acs_duplicate_relay",
      providerId: "saml-main",
      relayState: "relay-state-001",
      requestId: "saml-request-duplicate-relay",
      requestedAt: "2026-06-29T13:05:00.000Z",
      traceId: "trc_saml_acs_duplicate_relay"
    }), /SAML ACS request descriptor already exists/);
    await assert.rejects(() => repository.recordSamlAssertionReplay({
      assertionId: "assertion-001",
      audience: "support-api",
      expiresAt: "2026-06-29T13:20:00.000Z",
      providerId: "saml-main",
      receivedAt: "2026-06-29T13:03:00.000Z",
      requestId: "saml-request-001",
      subjectId: "svc-admin-001",
      traceId: "trc_saml_assertion_duplicate"
    }), /SAML assertion replay already exists/);
  });

  it("persists password credentials, password policy state and credential audit rows through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });

    const credential = await repository.savePasswordCredential({
      algorithm: "sha256",
      email: "service-admin@example.com",
      hash: "sha256:9246aa9be8de7b40d64eb664986430793b6cc13a19d2a456981e44f28303f9cf",
      subjectId: "svc-admin-001",
      updatedAt: "2026-06-28T09:00:00.000Z",
      version: 1
    });
    const foundCredential = await repository.findPasswordCredentialByEmail("SERVICE-ADMIN@example.com");

    assert.deepEqual(foundCredential, credential);
    assert.equal(client.calls.passwordCredentialUpserts.length, 1);
    assert.equal(client.calls.passwordCredentialUpserts[0].where.email, "service-admin@example.com");
    assert.equal(client.calls.passwordCredentialUpserts[0].create.updatedAt instanceof Date, true);

    const policy = await repository.savePasswordPolicy({
      maxFailedAttempts: 5,
      minLength: 12,
      requireMfa: true,
      scope: "service-admin",
      updatedAt: "2026-06-28T09:00:00.000Z"
    });
    const foundPolicy = await repository.getPasswordPolicy("service-admin");

    assert.deepEqual(foundPolicy, policy);
    assert.equal(client.calls.passwordPolicyUpserts.length, 1);
    assert.equal(client.calls.passwordPolicyUpserts[0].where.scope, "service-admin");

    const auditEvent = await repository.recordCredentialAuditEvent({
      action: "credential.password.verify",
      actor: "svc-admin-001",
      at: "2026-06-28T09:01:00.000Z",
      id: "evt_credential_prisma",
      immutable: true,
      reason: "Password hash matched policy credential.",
      result: "ok",
      subjectId: "svc-admin-001",
      traceId: "trc_credential_prisma"
    });
    const auditEvents = await repository.listCredentialAuditEvents("svc-admin-001");

    assert.equal(auditEvent.id, "evt_credential_prisma");
    assert.deepEqual(auditEvents.map((event) => event.id), ["evt_credential_prisma"]);
    assert.equal(client.calls.credentialAuditCreates.length, 1);
    assert.equal(client.calls.credentialAuditFindMany[0].where.subjectId, "svc-admin-001");
  });

  it("fails closed when Prisma password credential rows use unsupported hash algorithms", async () => {
    const { client } = createFakePrismaIdentityClient({
      passwordCredentials: [{
        algorithm: "argon2id",
        email: "service-admin@example.com",
        hash: "argon2id:not-supported-in-this-slice",
        subjectId: "svc-admin-001",
        updatedAt: new Date("2026-06-28T09:00:00.000Z"),
        version: 1
      }]
    });
    const repository = IdentityRepository.prisma({ client });

    const credential = await repository.findPasswordCredentialByEmail("service-admin@example.com");

    assert.equal(credential, undefined);
  });

  it("bootstraps the default identity repository from a Prisma client factory", async () => {
    const { client } = createFakePrismaIdentityClient();
    const factoryCalls: unknown[] = [];

    const repository = configureIdentityRepository({
      DATABASE_URL: "postgresql://support:support@127.0.0.1:5432/support_communication",
      IDENTITY_REPOSITORY: "prisma",
      NODE_ENV: "test",
      PORT: "4191",
      SERVICE_NAME: "api-gateway"
    }, {
      prismaClientFactory: (options) => {
        factoryCalls.push(options);
        return client;
      }
    });

    assert.equal(IdentityRepository.default(), repository);
    assert.deepEqual(factoryCalls, [{
      datasourceUrl: "postgresql://support:support@127.0.0.1:5432/support_communication"
    }]);

    const tenant = await IdentityRepository.default().findTenant("tenant-volga");
    assert.equal(tenant?.status, "watch");
  });

  it("replays service-admin audit export descriptors safely across Prisma repository instances", async () => {
    const { client } = createFakePrismaIdentityClient();
    const firstRepository = IdentityRepository.prisma({ client });
    const firstSupport = new ServiceAdminService(firstRepository);

    await firstRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-prisma-replay",
      actorName: "Audit Prisma Replay Actor",
      at: "2026-07-01T08:20:00.000Z",
      id: "audit-export-prisma-replay-row",
      immutable: true,
      reason: "Prisma replay export descriptor",
      result: "applied",
      severity: "critical",
      target: "usr-lumen-invite",
      tenantId: "tenant-volga",
      traceId: "trace-audit-prisma-replay",
      userId: "usr-lumen-invite"
    });

    const firstExport = await firstSupport.requestAuditExport({
      action: "user.block",
      tenantId: "tenant-volga"
    });
    const replaySupport = new ServiceAdminService(IdentityRepository.prisma({ client }));
    const replayExport = await replaySupport.requestAuditExport({
      action: "user.block",
      tenantId: "tenant-volga"
    });

    assert.equal(replayExport.status, "ok");
    assert.equal(replayExport.data.export.descriptor.id, firstExport.data.export.descriptor.id);
    assert.equal(replayExport.data.export.descriptor.downloadUrl, firstExport.data.export.descriptor.downloadUrl);
    assert.deepEqual(replayExport.data.export.sourceEventIds, firstExport.data.export.sourceEventIds);
    assert.deepEqual(replayExport.data.export.payload.rows, firstExport.data.export.payload.rows);
  });

  it("rejects deciding a terminal break-glass approval through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });
    const requestAudit = fakeServiceAdminAuditEvent({
      action: "break_glass.request",
      at: "2026-06-28T10:00:00.000Z",
      id: "evt_bg_terminal_request",
      result: "pending",
      target: "usr-volga-admin"
    });
    await repository.createBreakGlassApproval({
      approval: {
        action: "impersonation.write",
        auditEventId: requestAudit.id,
        durationMinutes: 15,
        expiresAt: "2026-06-28T10:15:00.000Z",
        id: "bg_prisma_terminal",
        requestedAt: "2026-06-28T10:00:00.000Z",
        status: "pending",
        target: "usr-volga-admin",
        tenantId: "tenant-volga",
        userId: "usr-volga-admin"
      },
      auditEvent: requestAudit
    });
    await repository.decideBreakGlassApproval({
      approvalId: "bg_prisma_terminal",
      auditEvent: fakeServiceAdminAuditEvent({
        action: "break_glass.approve",
        at: "2026-06-28T10:01:00.000Z",
        id: "evt_bg_terminal_approve",
        result: "approved",
        target: "bg_prisma_terminal"
      }),
      status: "approved"
    });
    await assert.rejects(() => repository.decideBreakGlassApproval({
      approvalId: "bg_prisma_terminal",
      auditEvent: fakeServiceAdminAuditEvent({
        action: "break_glass.reject",
        at: "2026-06-28T10:02:00.000Z",
        id: "evt_bg_terminal_reject",
        result: "rejected",
        target: "bg_prisma_terminal"
      }),
      status: "rejected"
    }), /was not pending|not pending/);
    const persisted = await repository.findBreakGlassApproval("bg_prisma_terminal");
    assert.equal(persisted?.status, "approved");
  });

  it("rejects reusing a service-admin token revoke idempotency key for a different active token through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });
    const firstSession = await repository.createServiceAdminSession({ actorId: "svc-admin-first-token", actorName: "First Token Admin", allowedActions: ["tenants.manage"], mfaVerified: true, ttlMinutes: 30 });
    const secondSession = await repository.createServiceAdminSession({ actorId: "svc-admin-second-token", actorName: "Second Token Admin", allowedActions: ["tenants.manage"], mfaVerified: true, ttlMinutes: 30 });
    await repository.createServiceAdminTokenPair({ accessTokenExpiresAt: "2099-06-29T11:00:00.000Z", accessTokenHash: hashServiceAdminTokenForPrismaTest("revoke-access-1"), id: "sat_pair_revoke_1", issuedAt: "2026-06-29T10:00:00.000Z", refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z", refreshTokenHash: hashServiceAdminTokenForPrismaTest("revoke-refresh-1"), sessionId: firstSession.id, subjectId: "svc-admin-first-token" });
    await repository.createServiceAdminTokenPair({ accessTokenExpiresAt: "2099-06-29T11:00:00.000Z", accessTokenHash: hashServiceAdminTokenForPrismaTest("revoke-access-2"), id: "sat_pair_revoke_2", issuedAt: "2026-06-29T10:00:00.000Z", refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z", refreshTokenHash: hashServiceAdminTokenForPrismaTest("revoke-refresh-2"), sessionId: secondSession.id, subjectId: "svc-admin-second-token" });
    const revoked = await repository.revokeServiceAdminToken({ idempotencyKey: "revoke-reused-key", revokedAt: "2026-06-29T10:06:00.000Z", tokenHash: hashServiceAdminTokenForPrismaTest("revoke-access-1") });
    const conflict = await repository.revokeServiceAdminToken({ idempotencyKey: "revoke-reused-key", revokedAt: "2026-06-29T10:07:00.000Z", tokenHash: hashServiceAdminTokenForPrismaTest("revoke-access-2") });
    assert.equal(revoked?.status, "revoked");
    assert.equal(conflict, undefined);
    assert.equal(await repository.findServiceAdminSessionByAccessToken("revoke-access-1"), undefined);
    assert.equal(Boolean(await repository.findServiceAdminSessionByAccessToken("revoke-access-2")), true);
  });

  it("rejects service-admin token hash reuse during rotate and keeps revoked/rotated hashes reserved through Prisma delegates", async () => {
    const { client } = createFakePrismaIdentityClient();
    const repository = IdentityRepository.prisma({ client });
    const firstSession = await repository.createServiceAdminSession({ actorId: "svc-admin-hash-first", actorName: "Hash First Admin", allowedActions: ["tenants.manage"], mfaVerified: true, ttlMinutes: 30 });
    const secondSession = await repository.createServiceAdminSession({ actorId: "svc-admin-hash-second", actorName: "Hash Second Admin", allowedActions: ["tenants.manage"], mfaVerified: true, ttlMinutes: 30 });
    await repository.createServiceAdminTokenPair({ accessTokenExpiresAt: "2099-06-29T11:00:00.000Z", accessTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-access-1"), id: "sat_pair_hash_1", issuedAt: "2026-06-29T10:00:00.000Z", refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z", refreshTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-refresh-1"), sessionId: firstSession.id, subjectId: "svc-admin-hash-first" });
    await repository.createServiceAdminTokenPair({ accessTokenExpiresAt: "2099-06-29T11:00:00.000Z", accessTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-access-2"), id: "sat_pair_hash_2", issuedAt: "2026-06-29T10:00:00.000Z", refreshTokenExpiresAt: "2099-07-29T10:00:00.000Z", refreshTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-refresh-2"), sessionId: secondSession.id, subjectId: "svc-admin-hash-second" });
    const rotateConflict = await repository.rotateServiceAdminRefreshToken({ idempotencyKey: "rotate-hash-conflict", nextAccessTokenExpiresAt: "2099-06-29T11:05:00.000Z", nextAccessTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-access-2"), nextRefreshTokenExpiresAt: "2099-07-29T10:05:00.000Z", nextRefreshTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-refresh-3"), refreshTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-refresh-1"), rotatedAt: "2026-06-29T10:05:00.000Z" });
    assert.equal(rotateConflict, undefined);
    assert.equal(Boolean(await repository.findServiceAdminSessionByAccessToken("hash-conflict-access-1")), true);
    assert.equal(Boolean(await repository.findServiceAdminSessionByAccessToken("hash-conflict-access-2")), true);
    await repository.revokeServiceAdminToken({ idempotencyKey: "revoke-hash-conflict-2", revokedAt: "2026-06-29T10:06:00.000Z", tokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-access-2") });
    await assert.rejects(() => repository.createServiceAdminTokenPair({ accessTokenExpiresAt: "2099-06-29T11:10:00.000Z", accessTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-access-2"), id: "sat_pair_hash_revoked_reuse", issuedAt: "2026-06-29T10:10:00.000Z", refreshTokenExpiresAt: "2099-07-29T10:10:00.000Z", refreshTokenHash: hashServiceAdminTokenForPrismaTest("hash-conflict-refresh-5"), sessionId: firstSession.id, subjectId: "svc-admin-hash-first" }), /token hash conflict/);
  });
});

function createFakePrismaIdentityClient(options: { omitTransactionRawSql?: boolean; passwordCredentials?: FakePasswordCredentialRow[]; permissionRoles?: FakePermissionRoleRow[]; rbacRoleGrants?: FakeRbacRoleGrantRow[]; tenants?: FakeTenantRow[]; tenantUsers?: FakeTenantUserRow[] } = {}) {
  const tenantRows = options.tenants ?? [{
      id: "tenant-volga",
      name: "Volga Logistics",
      status: "watch",
      healthScore: 76,
      metadata: {
        legalName: "AO Volga Logistics",
        planId: "scale",
        region: "ru-west",
        owner: "Sergey Markin",
        ownerEmail: "sergey@volga.example",
        workspaces: 14,
        users: 312,
        activeUsers: 204,
        monthlyRevenue: 1140000,
        arr: 13680000,
        sla: 91.4,
        lastSeenAt: "2026-06-27T07:31:00.000Z",
        domains: ["volga.example"],
        flags: ["ff-priority-routing"],
        incidentIds: ["inc-webhook-retry"],
        notes: "High webhook volume. Incident notices must remain visible."
      }
    }, {
      id: "tenant-aurora",
      name: "Aurora Retail",
      status: "active",
      healthScore: 82,
      metadata: {
        legalName: "Aurora Retail",
        planId: "growth",
        region: "ru-central",
        owner: "Aurora Admin",
        ownerEmail: "admin@aurora.example",
        workspaces: 3,
        users: 42,
        activeUsers: 31,
        monthlyRevenue: 320000,
        arr: 3840000,
        sla: 96.2,
        lastSeenAt: "2026-06-27T08:10:00.000Z",
        domains: ["aurora.example"],
        flags: [],
        incidentIds: [],
        notes: "Default fake tenant for RBAC FK tests."
      }
    }];
  const tenants = new Map<string, FakeTenantRow>(tenantRows.map((tenant) => [tenant.id, tenant]));
  const tenantUsers = options.tenantUsers ?? [];
  const permissionRoles = options.permissionRoles ?? [{
    actions: ["settings.manage", "service-admin.users.read", "service-admin.users.write"],
    aliases: ["admin", "service_admin"],
    description: "Default fake admin role",
    groupIds: ["admins"],
    key: "admin",
    metadata: null
  }];
  const rbacPolicyVersions = new Map<string, FakeRbacPolicyVersionRow>([["rbac-policy-default", {
    activatedAt: new Date("2026-06-28T00:00:00.000Z"),
    checksum: "sha256:default-rbac-policy",
    createdAt: new Date("2026-06-28T00:00:00.000Z"),
    createdBy: "system",
    description: "Default RBAC policy generated from fake permission roles.",
    id: "rbac-policy-default",
    status: "active",
    version: "2026.06.28-default"
  }]]);
  const rbacRoleGrants: FakeRbacRoleGrantRow[] = options.rbacRoleGrants ?? permissionRoles.flatMap((role, roleIndex) => role.actions.map((action, actionIndex) => ({
    action,
    createdAt: new Date("2026-06-28T00:00:00.000Z"),
    createdBy: "system",
    effect: "allow",
    id: `rbac-grant-default-${roleIndex}-${actionIndex}`,
    policyVersionId: "rbac-policy-default",
    resource: "*",
    roleKey: role.key,
    tenantId: null,
    traceId: "trc_rbac_default"
  })));
  const permissionDenialEvents: FakePermissionDenialEventRow[] = [];
  const authInviteTokensByHash = new Map<string, FakeAuthInviteTokenRow>();
  const authRecoveryTokensByHash = new Map<string, FakeAuthRecoveryTokenRow>();
  const breakGlassApprovals = new Map<string, FakeBreakGlassApprovalRow>();
  const credentialAuditEvents: FakeCredentialAuditEventRow[] = [];
  const impersonations = new Map<string, FakeServiceAdminImpersonationRow>();
  const mfaChallenges = new Map<string, FakeMfaChallengeRow>();
  const passwordCredentials = new Map<string, FakePasswordCredentialRow>((options.passwordCredentials ?? []).map((credential) => [credential.email, credential]));
  const passwordPolicies = new Map<string, FakePasswordPolicyRow>();
  const oidcCallbackDescriptorsById = new Map<string, FakeOidcCallbackDescriptorRow>();
  const oidcCallbackDescriptorsByState = new Map<string, FakeOidcCallbackDescriptorRow>();
  const oidcProviderConfigs = new Map<string, FakeOidcProviderConfigRow>();
  const samlAcsRequestDescriptorsById = new Map<string, FakeSamlAcsRequestDescriptorRow>();
  const samlAcsRequestDescriptorsByRelayState = new Map<string, FakeSamlAcsRequestDescriptorRow>();
  const samlAcsRequestDescriptorsByRequestId = new Map<string, FakeSamlAcsRequestDescriptorRow>();
  const samlAssertionReplays = new Map<string, FakeSamlAssertionReplayRow>();
  const samlProviderMetadata = new Map<string, FakeSamlProviderMetadataRow>();
  const sessions = new Map<string, FakeServiceAdminSessionRow>();
  const serviceAdminAuditEvents = new Map<string, FakeServiceAdminAuditEventRow>();
  const serviceAdminAuditExports = new Map<string, Record<string, unknown>>();
  const serviceAdminAuditRedactions = new Map<string, Record<string, unknown>>();
  const serviceAdminTokenPairs = new Map<string, FakeServiceAdminTokenPairRow>();
  const serviceAdminTokenRevocations = new Map<string, FakeServiceAdminTokenRevocationRow>();
  const serviceAdminTokenRotations = new Map<string, FakeServiceAdminTokenRotationRow>();
  const calls = {
    authInviteTokenUpserts: [] as Array<{
      create: FakeAuthInviteTokenCreateInput;
      update: FakeAuthInviteTokenUpdateInput;
      where: { codeHash: string };
    }>,
    authInviteTokenUpdateMany: [] as Array<{ data: { consumedAt: Date }; where: { consumedAt: null; id: string } }>,
    authRecoveryTokenUpserts: [] as Array<{
      create: FakeAuthRecoveryTokenCreateInput;
      update: FakeAuthRecoveryTokenUpdateInput;
      where: { tokenHash: string };
    }>,
    authRecoveryTokenUpdateMany: [] as Array<{ data: { consumedAt: Date }; where: { consumedAt: null; id: string } }>,
    breakGlassApprovalCreates: [] as Array<{ data: FakeBreakGlassApprovalCreateInput }>,
    breakGlassApprovalUpdates: [] as Array<{ data: { status: string }; where: { id: string; status: string } }>,
    credentialAuditCreates: [] as Array<{ data: FakeCredentialAuditEventCreateInput }>,
    credentialAuditFindMany: [] as Array<{ orderBy: { at: "desc" }; where: { subjectId: string } }>,
    mfaCreates: [] as unknown[],
    mfaUpdateMany: [] as unknown[],
    oidcCallbackCreates: [] as Array<{ data: FakeOidcCallbackDescriptorCreateInput }>,
    oidcCallbackUpdateMany: [] as Array<{ data: { consumedAt: Date }; where: { consumedAt: null; state: string } }>,
    oidcProviderUpserts: [] as Array<{
      create: FakeOidcProviderConfigCreateInput;
      update: FakeOidcProviderConfigCreateInput;
      where: { providerId: string };
    }>,
    outboxCreates: [] as unknown[],
    passwordCredentialUpserts: [] as Array<{
      create: FakePasswordCredentialCreateInput;
      update: FakePasswordCredentialCreateInput;
      where: { email: string };
    }>,
    passwordPolicyUpserts: [] as Array<{
      create: FakePasswordPolicyCreateInput;
      update: FakePasswordPolicyCreateInput;
      where: { scope: string };
    }>,
    permissionRoleFindMany: [] as unknown[],
    permissionDenialCreates: [] as Array<{ data: FakePermissionDenialEventCreateInput }>,
    rawUnsafe: [] as Array<{ query: string; values: unknown[] }>,
    rbacPolicyVersionUpserts: [] as Array<{
      create: FakeRbacPolicyVersionCreateInput;
      update: FakeRbacPolicyVersionCreateInput;
      where: { id: string };
    }>,
    rbacPolicyVersionUpdateMany: [] as Array<{
      data: { status: string };
      where: { id: { not: string }; status: string };
    }>,
    rbacRoleGrantCreates: [] as Array<{ data: FakeRbacRoleGrantCreateInput }>,
    samlAcsRequestCreates: [] as Array<{ data: FakeSamlAcsRequestDescriptorCreateInput }>,
    samlAcsRequestUpdateMany: [] as Array<{ data: { consumedAt: Date }; where: { consumedAt: null; requestId: string } }>,
    samlAssertionReplayCreates: [] as Array<{ data: FakeSamlAssertionReplayCreateInput }>,
    samlProviderUpserts: [] as Array<{
      create: FakeSamlProviderMetadataCreateInput;
      update: FakeSamlProviderMetadataCreateInput;
      where: { providerId: string };
    }>,
    serviceAdminAuditCreates: [] as Array<{ data: unknown }>,
    serviceAdminImpersonationCreates: [] as Array<{ data: FakeServiceAdminImpersonationCreateInput }>,
    serviceAdminImpersonationFindFirst: [] as Array<{ where: { expiresAt: { gt: Date }; stoppedAt: null; tenantId: string; userId: string | null } }>,
    serviceAdminImpersonationUpdates: [] as Array<{ data: Partial<FakeServiceAdminImpersonationRow>; where: { id: string } }>,
    serviceAdminTokenPairCreates: [] as Array<{ data: FakeServiceAdminTokenPairCreateInput }>,
    serviceAdminTokenPairFindFirst: [] as Array<{ orderBy?: { issuedAt: "asc" | "desc" }; where: Record<string, unknown> }>,
    serviceAdminTokenPairUpdates: [] as Array<{ data: Partial<FakeServiceAdminTokenPairRow>; where: { id: string } }>,
    serviceAdminTokenRevocationCreates: [] as Array<{ data: FakeServiceAdminTokenRevocationCreateInput }>,
    serviceAdminTokenRotationCreates: [] as Array<{ data: FakeServiceAdminTokenRotationCreateInput }>,
    sessionCreates: [] as unknown[],
    sessionUpdates: [] as unknown[],
    tenantAuditCreates: [] as unknown[],
    tenantFindMany: [] as unknown[],
    tenantUpdates: [] as unknown[],
    tenantUserFindMany: [] as unknown[],
    tenantUserUpdates: [] as Array<{ data: Partial<FakeTenantUserRow>; where: { id: string } }>,
    transactions: 0
  };

  const delegates = {
    authInviteToken: {
      findUnique: async (input: { where: { codeHash: string } }) => authInviteTokensByHash.get(input.where.codeHash) ?? null,
      updateMany: async (input: { data: { consumedAt: Date }; where: { consumedAt: null; id: string } }) => {
        calls.authInviteTokenUpdateMany.push(input);
        const row = [...authInviteTokensByHash.values()].find((item) => item.id === input.where.id);
        if (!row || row.consumedAt !== null) {
          return { count: 0 };
        }

        authInviteTokensByHash.set(row.codeHash, { ...row, consumedAt: input.data.consumedAt });
        return { count: 1 };
      },
      upsert: async (input: {
        create: FakeAuthInviteTokenCreateInput;
        update: FakeAuthInviteTokenUpdateInput;
        where: { codeHash: string };
      }) => {
        calls.authInviteTokenUpserts.push(input);
        const existing = authInviteTokensByHash.get(input.where.codeHash);
        const row = existing ? { ...existing, ...input.update } : input.create;
        authInviteTokensByHash.set(input.where.codeHash, row);
        return row;
      }
    },
    authRecoveryToken: {
      findUnique: async (input: { where: { tokenHash: string } }) => authRecoveryTokensByHash.get(input.where.tokenHash) ?? null,
      updateMany: async (input: { data: { consumedAt: Date }; where: { consumedAt: null; id: string } }) => {
        calls.authRecoveryTokenUpdateMany.push(input);
        const row = [...authRecoveryTokensByHash.values()].find((item) => item.id === input.where.id);
        if (!row || row.consumedAt !== null) {
          return { count: 0 };
        }

        authRecoveryTokensByHash.set(row.tokenHash, { ...row, consumedAt: input.data.consumedAt });
        return { count: 1 };
      },
      upsert: async (input: {
        create: FakeAuthRecoveryTokenCreateInput;
        update: FakeAuthRecoveryTokenUpdateInput;
        where: { tokenHash: string };
      }) => {
        calls.authRecoveryTokenUpserts.push(input);
        const existing = authRecoveryTokensByHash.get(input.where.tokenHash);
        const row = existing ? { ...existing, ...input.update } : input.create;
        authRecoveryTokensByHash.set(input.where.tokenHash, row);
        return row;
      }
    },
    breakGlassApproval: {
      create: async (input: { data: FakeBreakGlassApprovalCreateInput }) => {
        calls.breakGlassApprovalCreates.push(input);
        breakGlassApprovals.set(input.data.id, input.data);
        return input.data;
      },
      findUnique: async (input: { where: { id: string } }) => breakGlassApprovals.get(input.where.id) ?? null,
      updateMany: async (input: { data: { status: string }; where: { id: string; status: string } }) => {
        calls.breakGlassApprovalUpdates.push(input);
        const row = breakGlassApprovals.get(input.where.id);
        if (!row) {
          throw new Error(`Missing fake break-glass approval ${input.where.id}`);
        }
        if (row.status !== input.where.status) {
          return { count: 0 };
        }

        const next = { ...row, ...input.data };
        breakGlassApprovals.set(next.id, next);
        return { count: 1 };
      }
    },
    mfaChallenge: {
      create: async (input: { data: FakeMfaChallengeCreateInput }) => {
        calls.mfaCreates.push(input);
        const row = {
          attempts: input.data.attempts,
          consumedAt: input.data.consumedAt ?? null,
          createdAt: input.data.createdAt,
          email: input.data.email,
          expiresAt: input.data.expiresAt,
          id: input.data.id,
          maxAttempts: input.data.maxAttempts,
          otpHash: input.data.otpHash
        };
        mfaChallenges.set(row.id, row);
        return row;
      },
      findUnique: async (input: { where: { id: string } }) => mfaChallenges.get(input.where.id) ?? null,
      updateMany: async (input: {
        data: { attempts?: { increment: number }; consumedAt?: Date };
        where: { attempts?: number; consumedAt: null; id: string };
      }) => {
        calls.mfaUpdateMany.push(input);
        const row = mfaChallenges.get(input.where.id);
        if (!row || row.consumedAt !== null || (input.where.attempts !== undefined && row.attempts !== input.where.attempts)) {
          return { count: 0 };
        }

        mfaChallenges.set(row.id, {
          ...row,
          attempts: input.data.attempts ? row.attempts + input.data.attempts.increment : row.attempts,
          consumedAt: input.data.consumedAt ?? row.consumedAt
        });
        return { count: 1 };
      }
    },
    oidcCallbackDescriptor: {
      create: async (input: { data: FakeOidcCallbackDescriptorCreateInput }) => {
        calls.oidcCallbackCreates.push(input);
        oidcCallbackDescriptorsById.set(input.data.id, input.data);
        oidcCallbackDescriptorsByState.set(input.data.state, input.data);
        return input.data;
      },
      findUnique: async (input: { where: { id: string } } | { where: { state: string } }) => {
        if ("id" in input.where) {
          return oidcCallbackDescriptorsById.get(input.where.id) ?? null;
        }
        return oidcCallbackDescriptorsByState.get(input.where.state) ?? null;
      },
      updateMany: async (input: { data: { consumedAt: Date }; where: { consumedAt: null; state: string } }) => {
        calls.oidcCallbackUpdateMany.push(input);
        const row = oidcCallbackDescriptorsByState.get(input.where.state);
        if (!row || row.consumedAt !== null) {
          return { count: 0 };
        }

        const next = { ...row, consumedAt: input.data.consumedAt };
        oidcCallbackDescriptorsById.set(next.id, next);
        oidcCallbackDescriptorsByState.set(next.state, next);
        return { count: 1 };
      }
    },
    oidcProviderConfig: {
      findUnique: async (input: { where: { providerId: string } }) => oidcProviderConfigs.get(input.where.providerId) ?? null,
      upsert: async (input: {
        create: FakeOidcProviderConfigCreateInput;
        update: FakeOidcProviderConfigCreateInput;
        where: { providerId: string };
      }) => {
        calls.oidcProviderUpserts.push(input);
        const row = oidcProviderConfigs.has(input.where.providerId)
          ? { ...oidcProviderConfigs.get(input.where.providerId), ...input.update } as FakeOidcProviderConfigRow
          : input.create;
        oidcProviderConfigs.set(input.where.providerId, row);
        return row;
      }
    },
    samlAcsRequestDescriptor: {
      create: async (input: { data: FakeSamlAcsRequestDescriptorCreateInput }) => {
        calls.samlAcsRequestCreates.push(input);
        if (samlAcsRequestDescriptorsById.has(input.data.id)
          || samlAcsRequestDescriptorsByRelayState.has(input.data.relayState)
          || samlAcsRequestDescriptorsByRequestId.has(input.data.requestId)) {
          throw new Error("SAML ACS request descriptor already exists.");
        }
        samlAcsRequestDescriptorsById.set(input.data.id, input.data);
        samlAcsRequestDescriptorsByRelayState.set(input.data.relayState, input.data);
        samlAcsRequestDescriptorsByRequestId.set(input.data.requestId, input.data);
        return input.data;
      },
      findUnique: async (input: { where: { id: string } } | { where: { relayState: string } } | { where: { requestId: string } }) => {
        if ("id" in input.where) {
          return samlAcsRequestDescriptorsById.get(input.where.id) ?? null;
        }
        if ("relayState" in input.where) {
          return samlAcsRequestDescriptorsByRelayState.get(input.where.relayState) ?? null;
        }
        return samlAcsRequestDescriptorsByRequestId.get(input.where.requestId) ?? null;
      },
      updateMany: async (input: { data: { consumedAt: Date }; where: { consumedAt: null; requestId: string } }) => {
        calls.samlAcsRequestUpdateMany.push(input);
        const row = samlAcsRequestDescriptorsByRequestId.get(input.where.requestId);
        if (!row || row.consumedAt !== null) {
          return { count: 0 };
        }

        const next = { ...row, consumedAt: input.data.consumedAt };
        samlAcsRequestDescriptorsById.set(next.id, next);
        samlAcsRequestDescriptorsByRelayState.set(next.relayState, next);
        samlAcsRequestDescriptorsByRequestId.set(next.requestId, next);
        return { count: 1 };
      }
    },
    samlAssertionReplay: {
      create: async (input: { data: FakeSamlAssertionReplayCreateInput }) => {
        calls.samlAssertionReplayCreates.push(input);
        const key = `${input.data.providerId}:${input.data.assertionId}`;
        if (samlAssertionReplays.has(key)) {
          throw new Error("SAML assertion replay already exists.");
        }
        samlAssertionReplays.set(key, input.data);
        return input.data;
      },
      findUnique: async (input: { where: { providerId_assertionId: { assertionId: string; providerId: string } } }) => {
        const key = `${input.where.providerId_assertionId.providerId}:${input.where.providerId_assertionId.assertionId}`;
        return samlAssertionReplays.get(key) ?? null;
      }
    },
    samlProviderMetadata: {
      findUnique: async (input: { where: { providerId: string } }) => samlProviderMetadata.get(input.where.providerId) ?? null,
      upsert: async (input: {
        create: FakeSamlProviderMetadataCreateInput;
        update: FakeSamlProviderMetadataCreateInput;
        where: { providerId: string };
      }) => {
        calls.samlProviderUpserts.push(input);
        const row = samlProviderMetadata.has(input.where.providerId)
          ? { ...samlProviderMetadata.get(input.where.providerId), ...input.update } as FakeSamlProviderMetadataRow
          : input.create;
        samlProviderMetadata.set(input.where.providerId, row);
        return row;
      }
    },
    outboxEvent: {
      create: async (input: { data: unknown }) => {
        calls.outboxCreates.push(input);
        return input.data;
      }
    },
    credentialAuditEvent: {
      create: async (input: { data: FakeCredentialAuditEventCreateInput }) => {
        calls.credentialAuditCreates.push(input);
        credentialAuditEvents.unshift(input.data);
        return input.data;
      },
      findMany: async (input: { orderBy: { at: "desc" }; where: { subjectId: string } }) => {
        calls.credentialAuditFindMany.push(input);
        return credentialAuditEvents
          .filter((event) => event.subjectId === input.where.subjectId)
          .sort((left, right) => right.at.getTime() - left.at.getTime());
      }
    },
    passwordCredential: {
      findUnique: async (input: { where: { email: string } }) => passwordCredentials.get(input.where.email) ?? null,
      upsert: async (input: {
        create: FakePasswordCredentialCreateInput;
        update: FakePasswordCredentialCreateInput;
        where: { email: string };
      }) => {
        calls.passwordCredentialUpserts.push(input);
        const row = passwordCredentials.has(input.where.email)
          ? { ...passwordCredentials.get(input.where.email), ...input.update } as FakePasswordCredentialRow
          : input.create;
        passwordCredentials.set(input.where.email, row);
        return row;
      }
    },
    passwordPolicy: {
      findUnique: async (input: { where: { scope: string } }) => passwordPolicies.get(input.where.scope) ?? null,
      upsert: async (input: {
        create: FakePasswordPolicyCreateInput;
        update: FakePasswordPolicyCreateInput;
        where: { scope: string };
      }) => {
        calls.passwordPolicyUpserts.push(input);
        const row = passwordPolicies.has(input.where.scope)
          ? { ...passwordPolicies.get(input.where.scope), ...input.update } as FakePasswordPolicyRow
          : input.create;
        passwordPolicies.set(input.where.scope, row);
        return row;
      }
    },
    permissionRole: {
      findMany: async (input: unknown) => {
        calls.permissionRoleFindMany.push(input);
        return [...permissionRoles].sort((left, right) => left.key.localeCompare(right.key));
      }
    },
    rbacPolicyVersion: {
      findFirst: async (input: { orderBy: Array<{ activatedAt: "desc" } | { createdAt: "desc" } | { id: "desc" }>; where: { status: string } }) => {
        return Array.from(rbacPolicyVersions.values())
          .filter((policy) => policy.status === input.where.status)
          .sort((left, right) =>
            ((right.activatedAt?.getTime() ?? 0) - (left.activatedAt?.getTime() ?? 0))
            || (right.createdAt.getTime() - left.createdAt.getTime())
            || right.id.localeCompare(left.id)
          )[0] ?? null;
      },
      updateMany: async (input: { data: { status: string }; where: { id: { not: string }; status: string } }) => {
        calls.rbacPolicyVersionUpdateMany.push(input);
        let count = 0;
        for (const [id, policy] of rbacPolicyVersions.entries()) {
          if (id !== input.where.id.not && policy.status === input.where.status) {
            rbacPolicyVersions.set(id, { ...policy, status: input.data.status });
            count += 1;
          }
        }
        return { count };
      },
      upsert: async (input: {
        create: FakeRbacPolicyVersionCreateInput;
        update: FakeRbacPolicyVersionCreateInput;
        where: { id: string };
      }) => {
        calls.rbacPolicyVersionUpserts.push(input);
        const row = rbacPolicyVersions.has(input.where.id)
          ? { ...rbacPolicyVersions.get(input.where.id), ...input.update } as FakeRbacPolicyVersionRow
          : input.create;
        rbacPolicyVersions.set(input.where.id, row);
        return row;
      }
    },
    rbacRoleGrant: {
      create: async (input: { data: FakeRbacRoleGrantCreateInput }) => {
        assertFakeRbacReferences({
          permissionRoles,
          policyVersions: rbacPolicyVersions,
          tenantRows: tenants,
          policyVersionId: input.data.policyVersionId,
          roleKey: input.data.roleKey,
          tenantId: input.data.tenantId
        });
        calls.rbacRoleGrantCreates.push(input);
        rbacRoleGrants.unshift(input.data);
        return input.data;
      },
      findMany: async (input: { orderBy: { createdAt: "asc" }; where: { policyVersionId?: string; roleKey?: string; tenantId?: string | null } }) => {
        return rbacRoleGrants
          .filter((grant) => input.where.policyVersionId === undefined || grant.policyVersionId === input.where.policyVersionId)
          .filter((grant) => input.where.roleKey === undefined || grant.roleKey === input.where.roleKey)
          .filter((grant) => input.where.tenantId === undefined || grant.tenantId === input.where.tenantId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      }
    },
    permissionDenialEvent: {
      create: async (input: { data: FakePermissionDenialEventCreateInput }) => {
        assertFakeRbacReferences({
          permissionRoles,
          policyVersions: rbacPolicyVersions,
          tenantRows: tenants,
          policyVersionId: input.data.policyVersionId,
          roleKey: input.data.roleKey,
          tenantId: input.data.tenantId
        });
        if (input.data.immutable !== true) {
          throw new Error("Permission denial event must be immutable.");
        }
        calls.permissionDenialCreates.push(input);
        permissionDenialEvents.unshift(input.data);
        return input.data;
      },
      findMany: async (input: { orderBy: { at: "desc" }; where?: { tenantId?: string } }) => {
        return permissionDenialEvents
          .filter((event) => input.where?.tenantId === undefined || event.tenantId === input.where.tenantId)
          .sort((left, right) => right.at.getTime() - left.at.getTime());
      }
    },
    serviceAdminSession: {
      create: async (input: { data: FakeServiceAdminSessionCreateInput }) => {
        calls.sessionCreates.push(input);
        const row = { ...input.data, revokedAt: input.data.revokedAt ?? null };
        sessions.set(row.id, row);
        return row;
      },
      findUnique: async (input: { where: { id: string } }) => sessions.get(input.where.id) ?? null,
      update: async (input: { data: { revokedAt: Date }; where: { id: string } }) => {
        calls.sessionUpdates.push(input);
        const row = sessions.get(input.where.id);
        if (!row) {
          throw new Error(`Missing fake session ${input.where.id}`);
        }

        const next = { ...row, revokedAt: input.data.revokedAt };
        sessions.set(next.id, next);
        return next;
      }
    },
    serviceAdminTokenPair: {
      create: async (input: { data: FakeServiceAdminTokenPairCreateInput }) => {
        calls.serviceAdminTokenPairCreates.push(input);
        const row = { ...input.data };
        serviceAdminTokenPairs.set(row.id, row);
        return row;
      },
      findFirst: async (input: { orderBy?: { issuedAt: "asc" | "desc" }; where: Record<string, unknown> }) => {
        calls.serviceAdminTokenPairFindFirst.push(input);
        const rows = Array.from(serviceAdminTokenPairs.values()).filter((row) => matchesFakeTokenPairWhere(row, input.where));
        if (input.orderBy?.issuedAt === "desc") {
          rows.sort((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime());
        }
        if (input.orderBy?.issuedAt === "asc") {
          rows.sort((left, right) => left.issuedAt.getTime() - right.issuedAt.getTime());
        }
        return rows[0] ?? null;
      },
      update: async (input: { data: Partial<FakeServiceAdminTokenPairRow>; where: { id: string } }) => {
        calls.serviceAdminTokenPairUpdates.push(input);
        const row = serviceAdminTokenPairs.get(input.where.id);
        if (!row) {
          throw new Error(`Missing fake service-admin token pair ${input.where.id}`);
        }

        const next = { ...row, ...input.data };
        serviceAdminTokenPairs.set(next.id, next);
        return next;
      }
    },
    serviceAdminTokenRevocation: {
      create: async (input: { data: FakeServiceAdminTokenRevocationCreateInput }) => {
        calls.serviceAdminTokenRevocationCreates.push(input);
        serviceAdminTokenRevocations.set(input.data.idempotencyKey, input.data);
        return input.data;
      },
      findUnique: async (input: { include: { tokenPair: true }; where: { idempotencyKey: string } }) => {
        const row = serviceAdminTokenRevocations.get(input.where.idempotencyKey);
        if (!row) {
          return null;
        }
        const tokenPair = serviceAdminTokenPairs.get(row.tokenPairId);
        if (!tokenPair) {
          throw new Error(`Missing fake token pair ${row.tokenPairId}`);
        }
        return { ...row, tokenPair };
      }
    },
    serviceAdminTokenRotation: {
      create: async (input: { data: FakeServiceAdminTokenRotationCreateInput }) => {
        calls.serviceAdminTokenRotationCreates.push(input);
        serviceAdminTokenRotations.set(input.data.idempotencyKey, input.data);
        return input.data;
      },
      findUnique: async (input: { include: { nextTokenPair: true; previousTokenPair: true }; where: { idempotencyKey: string } }) => {
        const row = serviceAdminTokenRotations.get(input.where.idempotencyKey);
        if (!row) {
          return null;
        }
        const nextTokenPair = serviceAdminTokenPairs.get(row.nextTokenPairId);
        const previousTokenPair = serviceAdminTokenPairs.get(row.previousTokenPairId);
        if (!nextTokenPair || !previousTokenPair) {
          throw new Error(`Missing fake rotation token pairs for ${row.idempotencyKey}`);
        }
        return { ...row, nextTokenPair, previousTokenPair };
      }
    },
    serviceAdminAuditEvent: {
      create: async (input: { data: FakeServiceAdminAuditEventCreateInput }) => {
        calls.serviceAdminAuditCreates.push(input);
        serviceAdminAuditEvents.set(input.data.id, input.data);
        return input.data;
      },
      findMany: async () => Array.from(serviceAdminAuditEvents.values())
        .sort((left, right) => right.at.getTime() - left.at.getTime())
    },
    serviceAdminAuditExport: {
      create: async (input: { data: Record<string, unknown> }) => {
        serviceAdminAuditExports.set(String(input.data.id), input.data);
        return input.data;
      },
      findMany: async () => Array.from(serviceAdminAuditExports.values())
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    },
    serviceAdminAuditRedaction: {
      create: async (input: { data: Record<string, unknown> }) => {
        serviceAdminAuditRedactions.set(String(input.data.id), input.data);
        return input.data;
      },
      findMany: async () => Array.from(serviceAdminAuditRedactions.values())
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    },
    serviceAdminImpersonation: {
      create: async (input: { data: FakeServiceAdminImpersonationCreateInput }) => {
        calls.serviceAdminImpersonationCreates.push(input);
        impersonations.set(input.data.id, input.data);
        return input.data;
      },
      findFirst: async (input: { where: { expiresAt: { gt: Date }; stoppedAt: null; tenantId: string; userId: string | null } }) => {
        calls.serviceAdminImpersonationFindFirst.push(input);
        return Array.from(impersonations.values()).find((session) => (
          session.tenantId === input.where.tenantId
          && session.userId === input.where.userId
          && session.stoppedAt === null
          && session.expiresAt > input.where.expiresAt.gt
        )) ?? null;
      },
      findUnique: async (input: { where: { id: string } }) => impersonations.get(input.where.id) ?? null,
      update: async (input: { data: Partial<FakeServiceAdminImpersonationRow>; where: { id: string } }) => {
        calls.serviceAdminImpersonationUpdates.push(input);
        const row = impersonations.get(input.where.id);
        if (!row) {
          throw new Error(`Missing fake impersonation ${input.where.id}`);
        }

        const next = { ...row, ...input.data };
        impersonations.set(next.id, next);
        return next;
      }
    },
    tenant: {
      findMany: async (input: unknown) => {
        calls.tenantFindMany.push(input);
        return Array.from(tenants.values());
      },
      findUnique: async (input: { where: { id: string } }) => tenants.get(input.where.id) ?? null,
      update: async (input: { data: Partial<FakeTenantRow>; where: { id: string } }) => {
        calls.tenantUpdates.push(input);
        const row = tenants.get(input.where.id);
        if (!row) {
          throw new Error(`Missing fake tenant ${input.where.id}`);
        }

        const next = { ...row, ...input.data } as FakeTenantRow;
        tenants.set(next.id, next);
        return next;
      }
    },
    tenantAuditEvent: {
      create: async (input: { data: unknown }) => {
        calls.tenantAuditCreates.push(input);
        return input.data;
      },
      findMany: async () => []
    },
    tenantUser: {
      findUnique: async (input: { where: { id: string } }) => tenantUsers.find((user) => user.id === input.where.id) ?? null,
      findMany: async (input: { where: { tenantId: string } }) => {
        calls.tenantUserFindMany.push(input);
        return tenantUsers
          .filter((user) => user.tenantId === input.where.tenantId)
          .sort((left, right) => left.name.localeCompare(right.name));
      },
      update: async (input: { data: Partial<FakeTenantUserRow>; where: { id: string } }) => {
        calls.tenantUserUpdates.push(input);
        const index = tenantUsers.findIndex((user) => user.id === input.where.id);
        if (index === -1) {
          throw new Error(`Missing fake tenant user ${input.where.id}`);
        }

        tenantUsers[index] = { ...tenantUsers[index], ...input.data };
        return tenantUsers[index];
      }
    }
  };

  const client = {
    ...delegates,
    calls,
    $executeRawUnsafe: async (query: string, ...values: unknown[]) => {
      calls.rawUnsafe.push({ query, values });
      return 1;
    },
    $transaction: async <T>(operation: (transactionClient: typeof delegates) => Promise<T>) => {
      calls.transactions += 1;
      return operation({
        ...delegates,
        ...(options.omitTransactionRawSql ? {} : { $executeRawUnsafe: client.$executeRawUnsafe })
      } as typeof delegates);
    }
  };

  return { calls, client };
}

function assertFakeRbacReferences({
  permissionRoles,
  policyVersionId,
  policyVersions,
  roleKey,
  tenantId,
  tenantRows
}: {
  permissionRoles: FakePermissionRoleRow[];
  policyVersionId: string | null;
  policyVersions: Map<string, FakeRbacPolicyVersionRow>;
  roleKey: string | null;
  tenantId: string | null;
  tenantRows: Map<string, FakeTenantRow>;
}): void {
  if (policyVersionId !== null && !policyVersions.has(policyVersionId)) {
    throw new Error(`RBAC policy version ${policyVersionId} was not found.`);
  }
  if (roleKey !== null && !permissionRoles.some((role) => role.key === roleKey)) {
    throw new Error(`Permission role ${roleKey} was not found.`);
  }
  if (tenantId !== null && !tenantRows.has(tenantId)) {
    throw new Error(`Tenant ${tenantId} was not found.`);
  }
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

interface FakeTenantRow {
  healthScore: number | null;
  id: string;
  metadata: Record<string, unknown> | null;
  name: string;
  status: string;
}

interface FakeTenantUserRow {
  device: string;
  email: string;
  id: string;
  inviteStatus: string;
  lastActiveAt: Date | string | null;
  metadata: Record<string, unknown> | null;
  mfa: string;
  name: string;
  risk: string;
  role: string;
  sessions: number;
  status: string;
  supportNotes: string;
  tenantId: string;
}

interface FakePermissionRoleRow {
  actions: string[];
  aliases: string[];
  description: string | null;
  groupIds: string[];
  key: string;
  metadata: Record<string, unknown> | null;
}

interface FakeRbacPolicyVersionCreateInput {
  activatedAt: Date | null;
  checksum: string;
  createdAt: Date;
  createdBy: string;
  description: string;
  id: string;
  status: string;
  version: string;
}

interface FakeRbacPolicyVersionRow extends FakeRbacPolicyVersionCreateInput {}

interface FakeRbacRoleGrantCreateInput {
  action: string;
  createdAt: Date;
  createdBy: string;
  effect: string;
  id: string;
  policyVersionId: string;
  resource: string;
  roleKey: string;
  tenantId: string | null;
  traceId: string;
}

interface FakeRbacRoleGrantRow extends FakeRbacRoleGrantCreateInput {}

interface FakePermissionDenialEventCreateInput {
  action: string;
  actorId: string | null;
  at: Date;
  id: string;
  immutable: boolean;
  policyVersionId: string | null;
  reason: string;
  resource: string;
  roleKey: string | null;
  tenantId: string | null;
  traceId: string;
}

interface FakePermissionDenialEventRow extends FakePermissionDenialEventCreateInput {}

interface FakeAuthInviteTokenCreateInput {
  codeHash: string;
  consumedAt: Date | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  tenantId: string;
}

type FakeAuthInviteTokenUpdateInput = Omit<FakeAuthInviteTokenCreateInput, "createdAt" | "id">;

interface FakeAuthInviteTokenRow extends FakeAuthInviteTokenCreateInput {}

interface FakeAuthRecoveryTokenCreateInput {
  consumedAt: Date | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  tokenHash: string;
}

type FakeAuthRecoveryTokenUpdateInput = Omit<FakeAuthRecoveryTokenCreateInput, "createdAt" | "id">;

interface FakeAuthRecoveryTokenRow extends FakeAuthRecoveryTokenCreateInput {}

interface FakeMfaChallengeCreateInput {
  attempts: number;
  consumedAt?: Date | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  maxAttempts: number;
  otpHash: string;
}

interface FakeMfaChallengeRow extends FakeMfaChallengeCreateInput {
  consumedAt: Date | null;
}

interface FakePasswordCredentialCreateInput {
  algorithm: string;
  email: string;
  hash: string;
  subjectId: string;
  updatedAt: Date;
  version: number;
}

interface FakePasswordCredentialRow extends FakePasswordCredentialCreateInput {}

interface FakePasswordPolicyCreateInput {
  maxFailedAttempts: number;
  minLength: number;
  requireMfa: boolean;
  scope: string;
  updatedAt: Date;
}

interface FakePasswordPolicyRow extends FakePasswordPolicyCreateInput {}

interface FakeCredentialAuditEventCreateInput {
  action: string;
  actor: string;
  at: Date;
  id: string;
  immutable: boolean;
  reason: string;
  result: string;
  subjectId: string;
  traceId: string;
}

interface FakeCredentialAuditEventRow extends FakeCredentialAuditEventCreateInput {}

interface FakeServiceAdminAuditEventCreateInput {
  action: string;
  actor: string;
  actorName: string;
  at: Date;
  id: string;
  immutable: boolean;
  reason: string | null;
  result: string;
  severity: string;
  target: string;
  tenantId: string | null;
  traceId: string;
  userId: string | null;
}

interface FakeServiceAdminAuditEventRow extends FakeServiceAdminAuditEventCreateInput {}

interface FakeOidcProviderConfigCreateInput {
  audience: string;
  clientId: string;
  enabled: boolean;
  issuer: string;
  jwksUri: string;
  providerId: string;
  scopes: string[];
  tenantId: string;
  updatedAt: Date;
}

interface FakeOidcProviderConfigRow extends FakeOidcProviderConfigCreateInput {}

interface FakeOidcCallbackDescriptorCreateInput {
  consumedAt: Date | null;
  expiresAt: Date;
  id: string;
  nonceHash: string;
  providerId: string;
  redirectUri: string;
  requestedAt: Date;
  state: string;
  traceId: string;
}

interface FakeOidcCallbackDescriptorRow extends FakeOidcCallbackDescriptorCreateInput {}

interface FakeSamlProviderMetadataCreateInput {
  acsUrl: string;
  audience: string;
  certificateFingerprint: string;
  enabled: boolean;
  entityId: string;
  providerId: string;
  ssoUrl: string;
  tenantId: string;
  updatedAt: Date;
}

interface FakeSamlProviderMetadataRow extends FakeSamlProviderMetadataCreateInput {}

interface FakeSamlAcsRequestDescriptorCreateInput {
  acsUrl: string;
  consumedAt: Date | null;
  expiresAt: Date;
  id: string;
  providerId: string;
  relayState: string;
  requestedAt: Date;
  requestId: string;
  traceId: string;
}

interface FakeSamlAcsRequestDescriptorRow extends FakeSamlAcsRequestDescriptorCreateInput {}

interface FakeSamlAssertionReplayCreateInput {
  assertionId: string;
  audience: string;
  expiresAt: Date;
  providerId: string;
  receivedAt: Date;
  requestId: string;
  subjectId: string;
  traceId: string;
}

interface FakeSamlAssertionReplayRow extends FakeSamlAssertionReplayCreateInput {}

interface FakeServiceAdminSessionCreateInput {
  actorId: string;
  actorName: string;
  adminEmail: string;
  adminId: string;
  adminName: string;
  allowedActions: string[];
  authState: "mfa_verified";
  availableOrganizations: unknown[];
  currentTenantId: string;
  expiresAt: Date;
  id: string;
  mfaVerifiedAt: Date | null;
  revokedAt?: Date | null;
  role: string;
  tenantScope: string;
}

interface FakeServiceAdminSessionRow extends FakeServiceAdminSessionCreateInput {
  revokedAt: Date | null;
}

interface FakeServiceAdminTokenPairCreateInput {
  accessTokenExpiresAt: Date;
  accessTokenHash: string;
  id: string;
  issuedAt: Date;
  refreshTokenExpiresAt: Date;
  refreshTokenHash: string;
  revokedAt: Date | null;
  rotatedAt: Date | null;
  sessionId: string;
  subjectId: string;
}

interface FakeServiceAdminTokenPairRow extends FakeServiceAdminTokenPairCreateInput {}

interface FakeServiceAdminTokenRotationCreateInput {
  idempotencyKey: string;
  nextTokenPairId: string;
  previousTokenPairId: string;
  rotatedAt: Date;
}

interface FakeServiceAdminTokenRotationRow extends FakeServiceAdminTokenRotationCreateInput {}

interface FakeServiceAdminTokenRevocationCreateInput {
  idempotencyKey: string;
  revokedAt: Date;
  tokenHash: string;
  tokenPairId: string;
}

interface FakeServiceAdminTokenRevocationRow extends FakeServiceAdminTokenRevocationCreateInput {}

interface FakeServiceAdminImpersonationCreateInput {
  auditEventId?: string | null;
  approvalId: string | null;
  banner: string;
  durationMinutes: number;
  expiresAt: Date;
  id: string;
  mode: string;
  startedAt: Date;
  stoppedAt: Date | null;
  stopAuditEvent: Record<string, unknown> | null;
  tenantId: string;
  tenantName: string;
  userId: string | null;
  userName: string | null;
}

interface FakeServiceAdminImpersonationRow extends FakeServiceAdminImpersonationCreateInput {}

interface FakeBreakGlassApprovalCreateInput {
  action: string;
  auditEventId: string;
  durationMinutes: number;
  expiresAt: Date;
  id: string;
  requestedAt: Date;
  status: string;
  target: string;
  tenantId: string | null;
  userId: string | null;
}

interface FakeBreakGlassApprovalRow extends FakeBreakGlassApprovalCreateInput {}

function fakeServiceAdminAuditEvent(overrides: Partial<{
  action: string;
  at: string;
  id: string;
  result: string;
  target: string;
}> = {}) {
  return {
    action: overrides.action ?? "service-admin.test",
    actor: "svc-admin",
    actorName: "Service Admin",
    at: overrides.at ?? "2026-06-28T10:00:00.000Z",
    id: overrides.id ?? "evt_service_admin_test",
    immutable: true,
    reason: "Prisma service-admin audit",
    result: overrides.result ?? "ok",
    severity: "critical" as const,
    target: overrides.target ?? "tenant-volga",
    tenantId: "tenant-volga",
    traceId: "trc_service_admin_prisma_test",
    userId: "usr-volga-admin"
  };
}

function hashServiceAdminTokenForPrismaTest(token: string): string {
  return `sha256:${createHash("sha256").update(token).digest("hex")}`;
}

function matchesFakeTokenPairWhere(row: FakeServiceAdminTokenPairRow, where: Record<string, unknown>): boolean {
  if (typeof where.id === "string" && row.id !== where.id) {
    return false;
  }
  if (where.accessTokenHash && row.accessTokenHash !== where.accessTokenHash) {
    return false;
  }
  if (where.refreshTokenHash && row.refreshTokenHash !== where.refreshTokenHash) {
    return false;
  }
  if (where.revokedAt === null && row.revokedAt !== null) {
    return false;
  }
  if (where.rotatedAt === null && row.rotatedAt !== null) {
    return false;
  }
  if (isDateGreaterThanWhere(where.accessTokenExpiresAt) && !(row.accessTokenExpiresAt > isDateGreaterThanWhere(where.accessTokenExpiresAt)!)) {
    return false;
  }
  if (isDateGreaterThanWhere(where.refreshTokenExpiresAt) && !(row.refreshTokenExpiresAt > isDateGreaterThanWhere(where.refreshTokenExpiresAt)!)) {
    return false;
  }
  if (matchesIgnoredId(row, where.id)) {
    return false;
  }
  if (Array.isArray(where.OR)) {
    return where.OR.some((item) => matchesFakeTokenPairWhere(row, item as Record<string, unknown>));
  }

  return true;
}

function isDateGreaterThanWhere(value: unknown): Date | null {
  if (!value || typeof value !== "object" || !("gt" in value)) {
    return null;
  }

  const candidate = (value as { gt: unknown }).gt;
  return candidate instanceof Date ? candidate : null;
}

function matchesIgnoredId(row: FakeServiceAdminTokenPairRow, value: unknown): boolean {
  if (!value || typeof value !== "object" || !("not" in value)) {
    return false;
  }

  return row.id === (value as { not: unknown }).not;
}
