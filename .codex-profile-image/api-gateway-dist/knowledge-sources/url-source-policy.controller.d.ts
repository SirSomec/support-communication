import { KnowledgeSourcesService, type UrlSourcePolicyWriteInput } from "./knowledge-sources.service.js";
export declare class UrlSourcePolicyController {
    private readonly service;
    constructor(service: KnowledgeSourcesService);
    get(tenantId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    set(tenantId: string, body: UrlSourcePolicyWriteInput): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
