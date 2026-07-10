import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { ServiceAdminService } from "../apps/api-gateway/src/service-admin/service-admin.service.ts";

describe("service-admin workspace contracts", () => {
  it("loads support users and tenants from repository state", async () => {
    const repository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(repository);

    const users = await support.fetchSupportUsers({ tenantId: "tenant-northstar" });

    assert.equal(users.status, "ok");
    assert.ok(Array.isArray(users.data.items));
    assert.ok(Array.isArray(users.data.tenants));
    assert.equal(users.data.tenants.some((tenant) => tenant.id === "tenant-northstar"), true);
  });

  it("supports MFA reset, forced logout, block/unblock and invite resend", async () => {
    const repository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(repository);
    const userId = "usr-lumen-invite";

    const reset = await support.resetTwoFactor({
      actor: { id: "svc-admin", name: "Service Admin" },
      confirmed: true,
      reason: "Identity verified in support ticket",
      userId
    });
    const logout = await support.forceLogout({
      actor: { id: "svc-admin", name: "Service Admin" },
      confirmed: true,
      reason: "Forced logout after compromise report",
      userId
    });
    const blocked = await support.blockUser({
      actor: { id: "svc-admin", name: "Service Admin" },
      confirmed: true,
      reason: "Account blocked after abuse investigation",
      userId
    });
    const unblocked = await support.unblockUser({
      actor: { id: "svc-admin", name: "Service Admin" },
      confirmed: true,
      reason: "Account restored after review completion",
      userId
    });
    const invite = await support.resendInvite({
      actor: { id: "svc-admin", name: "Service Admin" },
      confirmed: true,
      reason: "Invite resent after mailbox correction",
      userId
    });

    assert.equal(reset.status, "ok");
    assert.equal(logout.status, "ok");
    assert.equal(blocked.status, "ok");
    assert.equal(unblocked.status, "ok");
    assert.equal(invite.status, "ok");
  });

  it("starts and stops impersonation with audit evidence", async () => {
    const repository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(repository);

    const started = await support.startImpersonation({
      actor: { id: "svc-admin", name: "Service Admin" },
      confirmed: true,
      durationMinutes: 15,
      reason: "Read-only support investigation approved",
      tenantId: "tenant-lumen",
      userId: "usr-lumen-invite"
    });
    assert.equal(started.status, "ok");

    const stopped = await support.stopImpersonation({
      actor: { id: "svc-admin", name: "Service Admin" },
      impersonationId: started.data.impersonation.id,
      reason: "Investigation completed by service admin"
    });
    assert.equal(stopped.status, "ok");
  });

  it("returns denied envelopes when privileged actions miss confirmation", async () => {
    const repository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(repository);

    const denied = await support.blockUser({
      actor: { id: "svc-admin", name: "Service Admin" },
      confirmed: false,
      reason: "Too short",
      userId: "usr-lumen-invite"
    });

    assert.equal(denied.status, "invalid");
    assert.equal(denied.error?.code, "confirmation_required");
  });

  it("streams service-admin audit events for privileged actions", async () => {
    const repository = IdentityRepository.inMemory();
    const support = new ServiceAdminService(repository);

    await repository.recordServiceAdminAuditEvent({
      action: "impersonation.start",
      actor: "svc-admin",
      actorName: "Service Admin",
      at: "2026-07-01T10:00:00.000Z",
      id: "audit-stream-001",
      immutable: true,
      reason: "Support impersonation started",
      result: "started",
      severity: "critical",
      target: "imp_test",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-stream-001",
      userId: "usr-lumen-invite"
    });

    const audit = await support.fetchAuditEvents({ tenantId: "tenant-lumen", limit: 5 });
    assert.equal(audit.status, "ok");
    assert.ok(audit.data.items.some((event) => event.id === "audit-stream-001"));
    assert.equal(typeof audit.data.page.nextCursor === "string" || audit.data.page.nextCursor === null, true);
  });
});
