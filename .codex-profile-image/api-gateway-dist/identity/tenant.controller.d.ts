import { type ServiceAdminRequest } from "./service-admin-auth.js";
import { TenantService } from "./tenant.service.js";
export declare class TenantController {
    private readonly tenantService;
    constructor(tenantService: TenantService);
    fetchTenants(filters: {
        query?: string;
        region?: string;
        status?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<import("./tenant.service.js").TenantListData>>;
    fetchTenantDetail(tenantId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, never> | import("./tenant.service.js").TenantDetailData>>;
    updateTenantStatus(tenantId: string, payload: {
        confirmed?: boolean;
        reason?: string;
        status: string;
    }, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
