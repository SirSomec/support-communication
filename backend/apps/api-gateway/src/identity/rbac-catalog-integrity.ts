import type { IdentityPermissionRole } from "./identity.types.js";

export interface RbacCatalogGrant {
  action: string;
  effect: string;
  policyVersionId: string;
  resource: string;
  roleKey: string | null;
  tenantId: string | null;
}

/**
 * Returns actionable violations for the global RBAC baseline needed by tenant
 * users. The service-admin role alone is not sufficient: tenant owners resolve
 * to the `admin` role during sign-in.
 */
export function findRbacCatalogIntegrityViolations({
  activePolicyId,
  grants,
  permissionRoles,
  requiredRoles
}: {
  activePolicyId: string | null | undefined;
  grants: RbacCatalogGrant[];
  permissionRoles: IdentityPermissionRole[];
  requiredRoles: IdentityPermissionRole[];
}): string[] {
  const violations: string[] = [];
  if (!activePolicyId) {
    return ["active_rbac_policy_missing"];
  }

  for (const requiredRole of requiredRoles) {
    const storedRole = permissionRoles.find((role) => role.key === requiredRole.key);
    if (!storedRole) {
      violations.push(`permission_role_missing:${requiredRole.key}`);
      continue;
    }

    for (const action of requiredRole.actions) {
      if (!storedRole.actions.includes(action)) {
        violations.push(`permission_role_action_missing:${requiredRole.key}:${action}`);
      }

      const isGranted = grants.some((grant) => (
        grant.policyVersionId === activePolicyId
        && grant.roleKey === requiredRole.key
        && grant.tenantId === null
        && grant.effect === "allow"
        && (grant.action === action || grant.action === "*")
        && (grant.resource === "*" || grant.resource === "tenant")
      ));
      if (!isGranted) {
        violations.push(`rbac_grant_missing:${requiredRole.key}:${action}`);
      }
    }
  }

  return violations;
}
