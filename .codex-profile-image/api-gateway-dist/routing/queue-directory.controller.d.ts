import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { QueueDirectoryService, type QueueDirectoryPayload } from "./queue-directory.service.js";
type QueueDirectoryRequest = TenantOperatorRequest & ServiceAdminRequest;
export declare class QueueDirectoryController {
    private readonly queueDirectoryService;
    constructor(queueDirectoryService: QueueDirectoryService);
    fetchQueues(query: {
        status?: string;
    }, request: QueueDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    createQueue(payload: QueueDirectoryPayload, request: QueueDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateQueueFromBody(payload: QueueDirectoryPayload, request: QueueDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    updateQueue(queueId: string, payload: QueueDirectoryPayload, request: QueueDirectoryRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
export {};
