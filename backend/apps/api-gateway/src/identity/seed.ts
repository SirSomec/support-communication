export * from "./seed-catalog.js";

import { identityPermissionRoleCatalog, identityServiceAdminTariffCatalog, serviceAdminPrivilegedActions } from "./runtime-catalog.js";
import { createEmptyIdentityState, hashPasswordCredential, IdentityRepository, type IdentityPasswordCredential, type IdentityState } from "./identity.repository.js";
import type { IdentityServiceAdminFeatureFlag, IdentityServiceAdminIncident, IdentityTenant, IdentityTenantAuditEvent, IdentityTenantUser } from "./identity.types.js";
import { featureFlags, incidents, serviceAdminSession, tenantAuditEvents, tenants, tenantUsers } from "./seed-catalog.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function bootstrapIdentityState(base?: Partial<IdentityState>): IdentityState {
  const empty = createEmptyIdentityState();
  return {
    ...empty,
    ...base,
    passwordCredentials: base?.passwordCredentials ?? seedIdentityPasswordCredentials(),
    permissionRoles: base?.permissionRoles ?? clone(identityPermissionRoleCatalog),
    privilegedServiceAdminActions: base?.privilegedServiceAdminActions ?? [...serviceAdminPrivilegedActions],
    serviceAdminFeatureFlags: base?.serviceAdminFeatureFlags ?? clone(featureFlags) as IdentityServiceAdminFeatureFlag[],
    serviceAdminIncidents: base?.serviceAdminIncidents ?? clone(incidents) as IdentityServiceAdminIncident[],
    serviceAdminTariffs: base?.serviceAdminTariffs ?? clone(identityServiceAdminTariffCatalog),
    tenantAuditEvents: base?.tenantAuditEvents ?? clone(tenantAuditEvents) as IdentityTenantAuditEvent[],
    tenantUsers: base?.tenantUsers ?? clone(tenantUsers) as IdentityTenantUser[],
    tenants: base?.tenants ?? clone(tenants) as IdentityTenant[]
  };
}

export function createSeededIdentityRepository(base?: Partial<IdentityState>): IdentityRepository {
  return IdentityRepository.inMemory(bootstrapIdentityState(base));
}

function seedIdentityPasswordCredentials(): IdentityPasswordCredential[] {
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
      algorithm: "scrypt" as const,
      email: user.email,
      hash: hashPasswordCredential("correct-password"),
      subjectId: user.id,
      updatedAt: "2026-06-28T00:00:00.000Z",
      version: 1
    }))
  ];
}
