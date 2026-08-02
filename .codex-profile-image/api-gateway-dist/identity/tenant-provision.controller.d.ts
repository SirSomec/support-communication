import type { ServiceAdminRequest } from "./service-admin-auth.js";
import { TenantProvisionService } from "./tenant-provision.service.js";
export declare class TenantProvisionController {
    private readonly tenantProvisionService;
    constructor(tenantProvisionService: TenantProvisionService);
    provisionTenant(payload: {
        admin?: {
            email?: string;
            name?: string;
            password?: string;
        };
        channel?: {
            domain?: string;
            type?: string;
        };
        employees?: Array<{
            email?: string;
            name?: string;
            role?: string;
            team?: string;
        }>;
        plan?: {
            id?: string;
            trial?: boolean;
        };
        tenant?: {
            name?: string;
            region?: string;
            slug?: string;
        };
    }, request: Partial<ServiceAdminRequest>): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, never> | import("./tenant-provision.service.js").TenantProvisionData>>;
}
