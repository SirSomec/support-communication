import { AiConnectionsService, type AiConnectionWriteInput } from "./ai-connections.service.js";
export declare class AiConnectionsController {
    private readonly service;
    constructor(service: AiConnectionsService);
    list(tenantId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    create(tenantId: string, body: AiConnectionWriteInput): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    update(tenantId: string, connectionId: string, body: AiConnectionWriteInput): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    rotate(tenantId: string, connectionId: string, body: Pick<AiConnectionWriteInput, "secret">): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    test(tenantId: string, connectionId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    disable(tenantId: string, connectionId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    remove(tenantId: string, connectionId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
