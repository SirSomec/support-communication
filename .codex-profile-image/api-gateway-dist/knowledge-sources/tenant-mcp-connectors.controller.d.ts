import { type BackendEnvelope } from "@support-communication/envelope";
import { type ServiceAdminRequest } from "../identity/service-admin-auth.js";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { McpConnectorsService, type McpConnectorWriteInput } from "./mcp-connectors.service.js";
/**
 * BAI-831: раздел «Знания» тенанта видит свои MCP-подключения и подаёт заявку.
 * Одобрение и включение остаются за Service Admin (mcp-connectors.controller).
 * Секреты/заголовки не возвращаются — только метаданные.
 */
export declare class TenantMcpConnectorsController {
    private readonly service;
    constructor(service: McpConnectorsService);
    list(request: TenantOperatorRequest & ServiceAdminRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
    request(body: McpConnectorWriteInput, request: TenantOperatorRequest & ServiceAdminRequest): Promise<BackendEnvelope<Record<string, unknown>>>;
}
