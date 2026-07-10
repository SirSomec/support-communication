import {
  IdentityRepository,
  type IdentityTenantUser
} from "./identity.repository.js";

export interface IdentityTenantMembershipChoice {
  email: string;
  id: string;
  role: string;
  selectedAt: string | null;
  tenantId: string;
  tenantName: string;
}

export function resetIdentityAuthFlowStore(): void {
  // Tenant membership selection is stateless; this reset remains for test helpers
  // that simulate auth-flow restarts.
}

export async function listTenantMembershipsForEmail(
  email: string,
  repository: IdentityRepository = IdentityRepository.default()
): Promise<IdentityTenantMembershipChoice[]> {
  const normalizedEmail = email.trim().toLowerCase();

  const memberships: IdentityTenantMembershipChoice[] = [];
  const tenants = await repository.listTenants();
  for (const tenant of tenants) {
    const tenantUsers = await repository.findTenantUsers(tenant.id);
    for (const user of tenantUsers) {
      if (user.email.toLowerCase() === normalizedEmail && user.status === "active") {
        memberships.push({
          email: normalizedEmail,
          id: `${tenant.id}:${user.id}`,
          role: user.role,
          selectedAt: null,
          tenantId: tenant.id,
          tenantName: tenant.name
        });
      }
    }
  }

  return memberships;
}

export async function selectTenantMembership(input: {
  email: string;
  tenantId: string;
}, repository: IdentityRepository = IdentityRepository.default()): Promise<IdentityTenantMembershipChoice | null> {
  const normalizedEmail = input.email.trim().toLowerCase();
  const choices = await listTenantMembershipsForEmail(normalizedEmail, repository);
  const selected = choices.find((choice) => choice.tenantId === input.tenantId);
  if (!selected) {
    return null;
  }

  return {
    ...selected,
    selectedAt: new Date().toISOString()
  };
}

export async function findTenantUserForMembership(
  email: string,
  tenantId: string,
  repository: IdentityRepository = IdentityRepository.default()
): Promise<IdentityTenantUser | undefined> {
  const normalizedEmail = email.trim().toLowerCase();
  const tenantUsers = await repository.findTenantUsers(tenantId.trim());
  return tenantUsers.find((user) => user.email.toLowerCase() === normalizedEmail && user.status === "active");
}
