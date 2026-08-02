import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { McpConnectorsService, type McpConnectorWriteInput } from "./mcp-connectors.service.js";
export declare class McpConnectorsController {
    private readonly service;
    constructor(service: McpConnectorsService);
    list(tenantId: string): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    create(tenantId: string, body: McpConnectorWriteInput, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    update(tenantId: string, id: string, body: McpConnectorWriteInput, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    approve(tenantId: string, id: string, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    enable(tenantId: string, id: string, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    disable(tenantId: string, id: string, request: ServiceAdminRequest): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
