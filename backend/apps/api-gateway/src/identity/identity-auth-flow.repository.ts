import {
  IdentityRepository,
  type IdentityTenant,
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
  const [tenants, users] = await Promise.all([
    repository.listTenants(),
    repository.findTenantUsersByEmail(normalizedEmail)
  ]);
  return tenantMembershipsFromUsers(normalizedEmail, users, tenants);
}

export function tenantMembershipsFromUsers(
  email: string,
  users: IdentityTenantUser[],
  tenants: IdentityTenant[]
): IdentityTenantMembershipChoice[] {
  const normalizedEmail = email.trim().toLowerCase();
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  return users
    .filter((user) => user.email.toLowerCase() === normalizedEmail)
    .filter((user) => user.status === "active")
    .map((user) => ({
      email: normalizedEmail,
      id: `${user.tenantId}:${user.id}`,
      role: user.role,
      selectedAt: null,
      tenantId: user.tenantId,
      tenantName: tenantNames.get(user.tenantId) ?? user.tenantId
    }));
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
  const tenantUsers = await repository.findTenantUsersByEmail(normalizedEmail);
  return tenantUsers.find((user) => user.tenantId === tenantId.trim() && user.status === "active");
}
