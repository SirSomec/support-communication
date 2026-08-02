import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
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
export declare function changeTenantTariffFromRoute(billingService: BillingService, payload: TariffChangeRoutePayload, request: ServiceAdminRequest, identityRepository?: IdentityRepository): Promise<BackendEnvelope<Record<string, unknown>>>;
export {};
