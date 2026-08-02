import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { WorkspaceService } from "./workspace.service.js";
export declare class ClientsController {
    private readonly workspaceService;
    constructor(workspaceService: WorkspaceService);
    fetchClientProfiles(filters: {
        maskSensitive?: string;
        page?: string;
        pageSize?: string;
        segmentId?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    fetchClientSegments(request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    createClientExport(payload: {
        format?: string;
        reason?: string;
        segmentId?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    mergeClientProfiles(payload: {
        candidateProfileId: string;
        primaryProfileId: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
    unmergeClientProfile(payload: {
        detachedProfileId: string;
        primaryProfileId: string;
        reason?: string;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<unknown>;
}
