export * from "./seed-catalog.js";
import { identityPermissionRoleCatalog, identityServiceAdminTariffCatalog, serviceAdminPrivilegedActions } from "./runtime-catalog.js";
import { createEmptyIdentityState, hashPasswordCredential, IdentityRepository } from "./identity.repository.js";
import { featureFlags, incidents, serviceAdminSession, tenantAuditEvents, tenants, tenantUsers } from "./seed-catalog.js";
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function bootstrapIdentityState(base) {
    const empty = createEmptyIdentityState();
    return {
        ...empty,
        ...base,
        passwordCredentials: base?.passwordCredentials ?? seedIdentityPasswordCredentials(),
        permissionRoles: base?.permissionRoles ?? clone(identityPermissionRoleCatalog),
        privilegedServiceAdminActions: base?.privilegedServiceAdminActions ?? [...serviceAdminPrivilegedActions],
        serviceAdminFeatureFlags: base?.serviceAdminFeatureFlags ?? clone(featureFlags),
        serviceAdminIncidents: base?.serviceAdminIncidents ?? clone(incidents),
        serviceAdminTariffs: base?.serviceAdminTariffs ?? clone(identityServiceAdminTariffCatalog),
        tenantAuditEvents: base?.tenantAuditEvents ?? clone(tenantAuditEvents),
        tenantUsers: base?.tenantUsers ?? clone(tenantUsers),
        tenants: base?.tenants ?? clone(tenants)
    };
}
export function createSeededIdentityRepository(base) {
    return IdentityRepository.inMemory(bootstrapIdentityState(base));
}
function seedIdentityPasswordCredentials() {
    return [
        {
            algorithm: "scrypt",
            email: serviceAdminSession.adminEmail,
            hash: hashPasswordCredential("correct-password"),
            subjectId: serviceAdminSession.adminId,
            updatedAt: "2026-06-28T00:00:00.000Z",
            version: 1
        },
        ...tenantUsers.map((user) => ({
            algorithm: "scrypt",
            email: user.email,
            hash: hashPasswordCredential("correct-password"),
            subjectId: user.id,
            updatedAt: "2026-06-28T00:00:00.000Z",
            version: 1
        }))
    ];
}
//# sourceMappingURL=seed.js.map