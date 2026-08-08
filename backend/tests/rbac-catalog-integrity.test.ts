import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findRbacCatalogIntegrityViolations } from "../apps/api-gateway/src/identity/rbac-catalog-integrity.ts";
import { identityPermissionRoleCatalog } from "../apps/api-gateway/src/identity/runtime-catalog.ts";

function baselineGrants() {
  return identityPermissionRoleCatalog.flatMap((role) => role.actions.map((action) => ({
    action,
    effect: "allow",
    policyVersionId: "policy-active",
    resource: "*",
    roleKey: role.key,
    tenantId: null
  })));
}

describe("RBAC catalog integrity", () => {
  it("accepts the complete tenant and service-admin role baseline", () => {
    assert.deepEqual(findRbacCatalogIntegrityViolations({
      activePolicyId: "policy-active",
      grants: baselineGrants(),
      permissionRoles: identityPermissionRoleCatalog,
      requiredRoles: identityPermissionRoleCatalog
    }), []);
  });

  it("rejects the service-admin-only catalog that removes all tenant access", () => {
    const violations = findRbacCatalogIntegrityViolations({
      activePolicyId: "policy-active",
      grants: baselineGrants().filter((grant) => grant.roleKey === "service_admin"),
      permissionRoles: identityPermissionRoleCatalog.filter((role) => role.key === "service_admin"),
      requiredRoles: identityPermissionRoleCatalog
    });

    assert.ok(violations.includes("permission_role_missing:admin"));
    assert.ok(violations.includes("permission_role_missing:employee"));
    assert.ok(violations.includes("permission_role_missing:senior"));
  });
});
