import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionService } from "../apps/api-gateway/src/identity/permission.service.ts";

describe("permission model contracts", () => {
  it("returns role profiles with mapped section access", async () => {
    const permission = new PermissionService();

    const model = await permission.fetchPermissionModel();

    assert.equal(model.status, "ok");
    assert.ok(Array.isArray(model.data.roles));
    const employee = model.data.roles.find((role) => role.key === "employee");
    const senior = model.data.roles.find((role) => role.key === "senior");
    const admin = model.data.roles.find((role) => role.key === "admin");

    assert.ok(employee?.sections.includes("dialogs"));
    assert.ok(employee?.sections.includes("templates"));
    assert.equal(employee?.sections.includes("reports"), false);

    assert.ok(senior?.sections.includes("panel"));
    assert.ok(senior?.sections.includes("reports"));
    assert.ok(senior?.sections.includes("visitors"));

    assert.deepEqual(admin?.sections, model.data.sections);
    assert.equal(model.data.actionSectionMap["reports.read"], "reports");
  });

  it("denies employee export while allowing senior export validation path", async () => {
    const permission = new PermissionService();

    const denied = await permission.validatePermission({
      action: "reports.export",
      roleMode: "employee",
      resource: "reports"
    });
    const allowed = await permission.validatePermission({
      action: "reports.export",
      roleMode: "senior",
      resource: "reports"
    });

    assert.equal(denied.status, "denied");
    assert.equal(allowed.status, "ok");
    assert.equal(allowed.data.allowed, true);
  });

  it("keeps an RBAC denial controlled when denial audit persistence fails", async () => {
    const permission = new PermissionService({
      getActiveRbacPolicyVersion: async () => undefined,
      listPermissionRoles: async () => [{
        actions: ["impersonation.start"],
        aliases: ["service_admin"],
        description: "Platform service administrator",
        groupIds: ["service-admins"],
        key: "service_admin",
        metadata: {}
      }],
      recordPermissionDenialEvent: async () => {
        throw new Error("permission_denial_audit_unavailable");
      }
    } as never);

    const decision = await permission.validatePermission({
      action: "impersonation.start",
      resource: "impersonation",
      roleMode: "service_admin"
    });

    assert.equal(decision.status, "denied");
    assert.equal(decision.error?.code, "rbac_policy_unavailable");
  });
});
