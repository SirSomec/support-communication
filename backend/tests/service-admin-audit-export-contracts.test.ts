import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { IdentityRepository } from "../apps/api-gateway/src/identity/identity.repository.ts";
import { createSeededIdentityRepository } from "../apps/api-gateway/src/identity/seed.ts";
import { ServiceAdminService } from "../apps/api-gateway/src/service-admin/service-admin.service.ts";
import { isAuditExportExpired } from "../apps/api-gateway/src/service-admin/service-admin-audit.persistence.ts";

describe("service-admin audit export contracts", () => {
  it("creates service-admin audit export contracts over filtered rows", async () => {
    const identityRepository = createSeededIdentityRepository();
    const support = new ServiceAdminService(identityRepository);

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-export",
      actorName: "Audit Export Actor",
      at: "2026-07-01T06:00:00.000Z",
      id: "audit-export-lumen-block",
      immutable: true,
      reason: "Filtered export event",
      result: "applied",
      severity: "warning",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-export-lumen-block",
      userId: "usr-lumen-invite"
    });
    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.sessions.logout",
      actor: "svc-audit-export",
      actorName: "Audit Export Actor",
      at: "2026-07-01T06:01:00.000Z",
      id: "audit-export-lumen-logout",
      immutable: true,
      reason: "Different action export event",
      result: "applied",
      severity: "warning",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-export-lumen-logout",
      userId: "usr-lumen-invite"
    });

    const auditExport = await support.requestAuditExport({
      action: "user.block",
      tenantId: "tenant-lumen"
    }, { id: "svc-admin", name: "Service Admin" });

    assert.equal(auditExport.status, "ok");
    assert.deepEqual(auditExport.data.export.sourceEventIds, ["audit-export-lumen-block"]);
    assert.equal(auditExport.data.export.descriptor.objectKeyExposed, false);
    assert.equal(JSON.stringify(auditExport.data.export.descriptor).includes("service-admin/audit-exports/"), false);
  });

  it("applies redaction overlays without mutating immutable audit rows", async () => {
    const identityRepository = createSeededIdentityRepository();
    const support = new ServiceAdminService(identityRepository);

    await identityRepository.recordServiceAdminAuditEvent({
      action: "user.block",
      actor: "svc-audit-redaction",
      actorName: "Audit Redaction Actor",
      at: "2026-07-01T09:00:00.000Z",
      id: "audit-readside-redaction",
      immutable: true,
      reason: "Review Bearer sk_live_service_admin_audit_secret",
      result: "applied",
      severity: "critical",
      target: "usr-lumen-invite",
      tenantId: "tenant-lumen",
      traceId: "trace-audit-readside-redaction",
      userId: "usr-lumen-invite"
    });

    const before = await identityRepository.listServiceAdminAuditEvents();
    const beforeRow = before.find((event) => event.id === "audit-readside-redaction");
    const redaction = await support.redactAuditEvent({
      actor: { id: "svc-admin", name: "Service Admin" },
      eventId: "audit-readside-redaction",
      reason: "Privacy redaction requested by service admin"
    });
    const readSide = await support.fetchAuditEvents({ tenantId: "tenant-lumen" });
    const after = await identityRepository.listServiceAdminAuditEvents();
    const afterRow = after.find((event) => event.id === "audit-readside-redaction");

    assert.equal(redaction.status, "ok");
    assert.deepEqual(afterRow, beforeRow);
    const redactedEvent = readSide.data.items.find((event) => event.id === "audit-readside-redaction");
    assert.equal(redactedEvent?.reason, "[REDACTED:privacy]");
    assert.equal(redactedEvent?.actorName, "[REDACTED:privacy]");
  });

  it("replays service-admin audit export descriptors safely across JSON repository instances", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "service-admin-audit-export-json-"));
    const filePath = join(tempDirectory, "identity.json");

    try {
      const firstRepository = IdentityRepository.open({ filePath });
      const firstSupport = new ServiceAdminService(firstRepository);

      await firstRepository.recordServiceAdminAuditEvent({
        action: "user.block",
        actor: "svc-audit-json-replay",
        actorName: "Audit JSON Replay Actor",
        at: "2026-07-01T08:10:00.000Z",
        id: "audit-export-json-replay-row",
        immutable: true,
        reason: "JSON replay export descriptor",
        result: "applied",
        severity: "critical",
        target: "usr-lumen-invite",
        tenantId: "tenant-lumen",
        traceId: "trace-audit-json-replay",
        userId: "usr-lumen-invite"
      });

      const firstExport = await firstSupport.requestAuditExport({
        action: "user.block",
        tenantId: "tenant-lumen"
      }, { id: "svc-admin", name: "Service Admin" });
      const replaySupport = new ServiceAdminService(IdentityRepository.open({ filePath }));
      const replayExport = await replaySupport.requestAuditExport({
        action: "user.block",
        tenantId: "tenant-lumen"
      }, { id: "svc-admin", name: "Service Admin" });

      assert.equal(replayExport.status, "ok");
      assert.equal(replayExport.data.export.descriptor.id, firstExport.data.export.descriptor.id);
      assert.deepEqual(replayExport.data.export.sourceEventIds, firstExport.data.export.sourceEventIds);
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }
  });

  it("regenerates expired audit export descriptors", async () => {
    const tempDirectory = mkdtempSync(join(tmpdir(), "service-admin-audit-export-expired-"));
    const filePath = join(tempDirectory, "identity.json");

    try {
      const repository = IdentityRepository.open({ filePath });
      const support = new ServiceAdminService(repository);

      await repository.recordServiceAdminAuditEvent({
        action: "user.block",
        actor: "svc-audit-expired",
        actorName: "Audit Expired Actor",
        at: "2026-07-01T08:00:00.000Z",
        id: "audit-export-expired-row",
        immutable: true,
        reason: "Expired descriptor event",
        result: "applied",
        severity: "warning",
        target: "usr-lumen-invite",
        tenantId: "tenant-lumen",
        traceId: "trace-audit-export-expired",
        userId: "usr-lumen-invite"
      });

      await support.requestAuditExport({ tenantId: "tenant-lumen" }, { id: "svc-admin", name: "Service Admin" });
      const state = JSON.parse(readFileSync(filePath, "utf8"));
      state.serviceAdminAuditExports = (state.serviceAdminAuditExports ?? []).map((record) => ({
        ...record,
        expiresAt: new Date(Date.now() - 60_000).toISOString()
      }));
      writeFileSync(filePath, JSON.stringify(state));

      const replaySupport = new ServiceAdminService(IdentityRepository.open({ filePath }));
      const replayExport = await replaySupport.requestAuditExport({ tenantId: "tenant-lumen" }, { id: "svc-admin", name: "Service Admin" });
      const exports = await IdentityRepository.open({ filePath }).listServiceAdminAuditExports();

      assert.equal(replayExport.status, "ok");
      assert.equal(exports.length, 2);
      assert.equal(isAuditExportExpired(exports[0]), false);
      assert.equal(isAuditExportExpired(exports[1]), true);
    } finally {
      rmSync(tempDirectory, { force: true, recursive: true });
    }
  });
});
