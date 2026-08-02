import { IdentityRepository } from "./identity.repository.js";
import { type ServiceAdminRequest } from "./service-admin-auth.js";
import { type BackendEnvelope } from "@support-communication/envelope";
export interface ServiceAdminPolicyInput {
    action: string;
    identityRepository?: IdentityRepository;
    request: ServiceAdminRequest;
    resource: string;
    tenantId?: string;
}
export declare function authorizeServiceAdminPolicy({ action, identityRepository, request, resource, tenantId }: ServiceAdminPolicyInput): Promise<BackendEnvelope<Record<string, unknown>> | null>;
