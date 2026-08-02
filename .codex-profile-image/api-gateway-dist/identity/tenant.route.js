import { IdentityRepository } from "./identity.repository.js";
import { authorizeServiceAdminPolicy } from "./privileged-policy.js";
export async function updateTenantStatusFromRoute(tenantService, payload, request, identityRepository = IdentityRepository.default()) {
    const tenantId = String(payload.tenantId ?? "").trim();
    const denied = await authorizeServiceAdminPolicy({
        action: "tenants.manage",
        identityRepository,
        request,
        resource: "tenant",
        tenantId
    });
    if (denied) {
        return denied;
    }
    return tenantService.updateTenantStatus({
        ...payload,
        tenantId
    });
}
//# sourceMappingURL=tenant.route.js.map