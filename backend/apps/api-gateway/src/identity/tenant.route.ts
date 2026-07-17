import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "./identity.repository.js";
import { authorizeServiceAdminPolicy } from "./privileged-policy.js";
import { type ServiceAdminRequest } from "./service-admin-auth.js";
import { type TenantService } from "./tenant.service.js";

interface TenantStatusRoutePayload {
  confirmed?: boolean;
  reason?: string;
  status: string;
  tenantId: string;
}

export async function updateTenantStatusFromRoute(
  tenantService: TenantService,
  payload: TenantStatusRoutePayload,
  request: ServiceAdminRequest,
  identityRepository = IdentityRepository.default()
): Promise<BackendEnvelope<Record<string, unknown>>> {
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
  }) as Promise<BackendEnvelope<Record<string, unknown>>>;
}
