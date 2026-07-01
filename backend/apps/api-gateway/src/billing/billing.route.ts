import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
import { authorizeServiceAdminPolicy } from "../identity/privileged-policy.js";
import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type BillingService } from "./billing.service.js";

interface TariffChangeRoutePayload {
  approvalId?: string;
  confirmationText?: string;
  confirmed?: boolean;
  nextPlanId?: string;
  reason?: string;
  tenantId?: string;
}

export async function changeTenantTariffFromRoute(
  billingService: BillingService,
  payload: TariffChangeRoutePayload,
  request: ServiceAdminRequest,
  identityRepository = IdentityRepository.default()
): Promise<BackendEnvelope<Record<string, unknown>>> {
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
