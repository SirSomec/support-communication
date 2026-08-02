import { IdentityRepository } from "./identity.repository.js";
export function resetIdentityAuthFlowStore() {
    // Tenant membership selection is stateless; this reset remains for test helpers
    // that simulate auth-flow restarts.
}
export async function listTenantMembershipsForEmail(email, repository = IdentityRepository.default()) {
    const normalizedEmail = email.trim().toLowerCase();
    const [tenants, users] = await Promise.all([
        repository.listTenants(),
        repository.findTenantUsersByEmail(normalizedEmail)
    ]);
    return tenantMembershipsFromUsers(normalizedEmail, users, tenants);
}
export function tenantMembershipsFromUsers(email, users, tenants) {
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
export async function selectTenantMembership(input, repository = IdentityRepository.default()) {
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
export async function findTenantUserForMembership(email, tenantId, repository = IdentityRepository.default()) {
    const normalizedEmail = email.trim().toLowerCase();
    const tenantUsers = await repository.findTenantUsersByEmail(normalizedEmail);
    return tenantUsers.find((user) => user.tenantId === tenantId.trim() && user.status === "active");
}
//# sourceMappingURL=identity-auth-flow.repository.js.map