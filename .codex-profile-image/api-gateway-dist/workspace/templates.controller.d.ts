import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { WorkspaceService } from "./workspace.service.js";
export declare class TemplatesController {
    private readonly workspaceService;
    constructor(workspaceService: WorkspaceService);
    fetchTemplates(filters: {
        operatorId?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    saveTemplate(payload: {
        channel: string;
        id?: string;
        scope?: string;
        text: string;
        title: string;
        topic: string;
        version?: number;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
}
