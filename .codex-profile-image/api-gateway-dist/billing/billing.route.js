import { IdentityRepository } from "../identity/identity.repository.js";
import { authorizeServiceAdminPolicy } from "../identity/privileged-policy.js";
export async function changeTenantTariffFromRoute(billingService, payload, request, identityRepository = IdentityRepository.default()) {
    const tenantId = request.serviceAdminContext?.currentTenantId ?? payload.tenantId;
    const denied = await authorizeServiceAdminPolicy({
        action: "billing.change",
        identityRepository,
        request,
        resource: "billing",
        tenantId
    });
    if (denied) {
        return denied;
    }
    return billingService.changeTenantTariff({
        ...payload,
        actor: request.serviceAdminContext?.actor,
        tenantId
    });
}
//# sourceMappingURL=billing.route.js.map