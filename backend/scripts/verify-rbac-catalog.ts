import { createPrismaClient } from "@support-communication/database";
import { fileURLToPath } from "node:url";
import { findRbacCatalogIntegrityViolations } from "../apps/api-gateway/src/identity/rbac-catalog-integrity.js";
import { identityPermissionRoleCatalog } from "../apps/api-gateway/src/identity/runtime-catalog.js";

export async function verifyRbacCatalog(client: {
  permissionRole: { findMany(): Promise<Array<{ actions: string[]; aliases: string[]; description: string | null; groupIds: string[]; key: string; metadata: unknown }>> };
  rbacPolicyVersion: { findFirst(input: { orderBy: Array<{ activatedAt: "desc" } | { createdAt: "desc" } | { id: "desc" }>; where: { status: "active" } }): Promise<{ id: string } | null> };
  rbacRoleGrant: { findMany(input: { where: { policyVersionId: string } }): Promise<Array<{ action: string; effect: string; policyVersionId: string; resource: string; roleKey: string | null; tenantId: string | null }>> };
}): Promise<void> {
  const activePolicy = await client.rbacPolicyVersion.findFirst({
    orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    where: { status: "active" }
  });
  const [storedRoles, grants] = await Promise.all([
    client.permissionRole.findMany(),
    activePolicy ? client.rbacRoleGrant.findMany({ where: { policyVersionId: activePolicy.id } }) : Promise.resolve([])
  ]);
  const permissionRoles = storedRoles.map((role) => ({
    actions: role.actions,
    aliases: role.aliases,
    description: role.description ?? "",
    groupIds: role.groupIds,
    key: role.key,
    metadata: typeof role.metadata === "object" && role.metadata !== null ? role.metadata as Record<string, unknown> : {}
  }));
  const violations = findRbacCatalogIntegrityViolations({
    activePolicyId: activePolicy?.id,
    grants,
    permissionRoles,
    requiredRoles: identityPermissionRoleCatalog
  });
  if (violations.length > 0) {
    throw new Error(`rbac_catalog_integrity_failed: ${violations.join(", ")}`);
  }
}

async function main(): Promise<void> {
  const client = createPrismaClient();
  try {
    await verifyRbacCatalog(client);
    process.stdout.write("RBAC catalog integrity verified.\n");
  } finally {
    await client.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], "file:"))) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
