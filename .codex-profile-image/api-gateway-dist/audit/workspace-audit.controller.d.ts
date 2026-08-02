import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { WorkspaceAuditService } from "./workspace-audit.service.js";
export declare class WorkspaceAuditController {
    private readonly workspaceAuditService;
    constructor(workspaceAuditService: WorkspaceAuditService);
    fetchWorkspaceAuditEvents(filters: {
        limit?: number | string;
        period?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
