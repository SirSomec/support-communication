import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { KnowledgeRetrievalApiService } from "./knowledge-retrieval-api.service.js";
export declare class KnowledgeRetrievalController {
    private readonly service;
    constructor(service: KnowledgeRetrievalApiService);
    retrieve(body: {
        mode?: string;
        query?: string;
        scenarioId?: string;
        sourceIds?: string[];
        tokenBudget?: number;
    }, request: TenantOperatorRequest & ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
