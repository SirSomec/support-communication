import { PermissionService } from "./permission.service.js";
export declare class PermissionController {
    private readonly permissionService;
    constructor(permissionService: PermissionService);
    validatePermission(payload: {
        action: string;
        actorRole?: string;
        resource: string;
        roleMode?: string;
        tenantId?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown> | import("./permission.service.js").PermissionDecision>>;
    fetchPermissionModel(): Promise<import("@support-communication/envelope").BackendEnvelope<import("./permission.service.js").PermissionModel>>;
}
