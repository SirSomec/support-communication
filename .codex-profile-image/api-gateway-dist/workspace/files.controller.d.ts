import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { WorkspaceService } from "./workspace.service.js";
export declare class FilesController {
    private readonly workspaceService;
    constructor(workspaceService: WorkspaceService);
    createUploadDescriptor(payload: {
        channel: string;
        fileName: string;
        mimeType?: string;
        sizeBytes?: number;
    }, request: ServiceAdminRequest): Promise<unknown>;
    finalizeUpload(fileId: string, payload: {
        checksum?: string;
    }, request: ServiceAdminRequest): Promise<unknown>;
    getDownloadPolicy(fileId: string, request: ServiceAdminRequest): Promise<unknown>;
}
export declare class FileScanCallbackController {
    private readonly workspaceService;
    constructor(workspaceService: WorkspaceService);
    recordScanResult(fileId: string, idempotencyKey: string | undefined, payload: {
        checkedAt?: string;
        idempotencyKey?: string;
        reason?: string;
        scanner?: string;
        verdict: "clean" | "error" | "infected";
    }): Promise<unknown>;
}
