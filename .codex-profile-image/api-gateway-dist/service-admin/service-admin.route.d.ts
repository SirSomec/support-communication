import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
import type { ServiceAdminActor, ServiceAdminRequest } from "../identity/service-admin-auth.js";
import type { ServiceAdminService } from "./service-admin.service.js";
type TenantBoundServiceAdminPayload = {
    actor?: ServiceAdminActor;
    tenantId?: string;
};
export declare function bindServiceAdminTenantContext<TPayload extends TenantBoundServiceAdminPayload>(payload: TPayload, request: ServiceAdminRequest): TPayload;
export declare function startServiceAdminImpersonationFromRoute<TPayload extends TenantBoundServiceAdminPayload>(serviceAdminService: ServiceAdminService, payload: TPayload, request: ServiceAdminRequest, identityRepository?: IdentityRepository): BackendEnvelope<Record<string, unknown>> | Promise<BackendEnvelope<Record<string, unknown>>>;
export declare function requestServiceAdminBreakGlassApprovalFromRoute<TPayload extends TenantBoundServiceAdminPayload>(serviceAdminService: ServiceAdminService, payload: TPayload, request: ServiceAdminRequest, identityRepository?: IdentityRepository): BackendEnvelope<Record<string, unknown>> | Promise<BackendEnvelope<Record<string, unknown>>>;
export {};
