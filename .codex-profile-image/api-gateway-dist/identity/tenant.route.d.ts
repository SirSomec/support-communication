import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "./identity.repository.js";
import { type ServiceAdminRequest } from "./service-admin-auth.js";
import { type TenantService } from "./tenant.service.js";
interface TenantStatusRoutePayload {
    confirmed?: boolean;
    reason?: string;
    status: string;
    tenantId: string;
}
export declare function updateTenantStatusFromRoute(tenantService: TenantService, payload: TenantStatusRoutePayload, request: ServiceAdminRequest, identityRepository?: IdentityRepository): Promise<BackendEnvelope<Record<string, unknown>>>;
export {};
