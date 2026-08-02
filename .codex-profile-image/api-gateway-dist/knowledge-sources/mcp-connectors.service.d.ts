import { type BackendEnvelope } from "@support-communication/envelope";
import { IdentityRepository } from "../identity/identity.repository.js";
import type { ServiceAdminActor } from "../identity/service-admin-auth.js";
import { McpConnectorRepository } from "./mcp-connector.repository.js";
export interface McpConnectorWriteInput {
    description?: string;
    endpoint?: string;
    name?: string;
    rateLimitPerMinute?: number;
    requestedBy?: string;
    tools?: Array<{
        name?: string;
        mode?: string;
    }>;
}
export declare class McpConnectorsService {
    private readonly repository;
    private readonly identity;
    private readonly environment;
    constructor(repository?: McpConnectorRepository, identity?: IdentityRepository, environment?: NodeJS.ProcessEnv);
    list(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    /**
     * BAI-831: заявка тенант-администратора. Коннектор создаётся неодобренным и
     * выключенным; включить его сможет только Service Admin после одобрения.
     * Хост всё равно должен быть в глобальном allowlist — это защита от SSRF.
     */
    request(tenantId: string, input: McpConnectorWriteInput, requestedBy: string): Promise<BackendEnvelope<Record<string, unknown>>>;
    create(tenantId: string, input: McpConnectorWriteInput, actor: ServiceAdminActor): Promise<BackendEnvelope<Record<string, unknown>>>;
    update(tenantId: string, id: string, input: McpConnectorWriteInput, actor: ServiceAdminActor): Promise<BackendEnvelope<Record<string, unknown>>>;
    approve(tenantId: string, id: string, actor: ServiceAdminActor): Promise<BackendEnvelope<Record<string, unknown>>>;
    setEnabled(tenantId: string, id: string, enabled: boolean, actor: ServiceAdminActor): Promise<BackendEnvelope<Record<string, unknown>>>;
    private build;
    private audit;
}
