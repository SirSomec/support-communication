import { McpConnectorRepository } from "./mcp-connector.repository.js";
/**
 * The only MCP contract available to knowledge sources.  A connector is
 * explicitly configured by a service administrator: the runtime never
 * discovers tools and therefore cannot accidentally expose a write tool.
 */
export interface ReadOnlyMcpTool {
    mode: "read";
    name: string;
}
export interface ReadOnlyMcpConnector {
    approved?: boolean;
    allowedHosts: readonly string[];
    endpoint: string;
    id: string;
    tenantId: string;
    tools: readonly ReadOnlyMcpTool[];
    status?: "disabled" | "enabled";
}
export interface McpReadOnlyTransport {
    call(input: {
        endpoint: string;
        signal: AbortSignal;
        toolName: string;
        toolInput: Record<string, unknown>;
    }): Promise<unknown>;
}
/** Fixed-shape Streamable HTTP call: callers cannot add headers, redirect the
 * request or replace the persisted endpoint. */
export declare class HttpMcpReadOnlyTransport implements McpReadOnlyTransport {
    private readonly fetcher;
    private readonly resolveHostname?;
    constructor(fetcher?: typeof fetch, resolveHostname?: ((hostname: string) => Promise<Array<{
        address: string;
    }>>) | undefined);
    call(input: {
        endpoint: string;
        signal: AbortSignal;
        toolName: string;
        toolInput: Record<string, unknown>;
    }): Promise<unknown>;
}
export type McpReadOnlyResult = {
    ok: true;
    result: {
        content: string;
        truncated: boolean;
    };
} | {
    ok: false;
    code: McpReadOnlyFailureCode;
};
export type McpReadOnlyFailureCode = "mcp_connector_invalid" | "mcp_connector_not_found" | "mcp_connector_disabled" | "mcp_connector_unapproved" | "mcp_rate_limited" | "mcp_tool_forbidden" | "mcp_input_too_large" | "mcp_result_rejected" | "mcp_timeout" | "mcp_transport_failed";
/**
 * In-memory registry is intentionally a narrow foundation.  Persistence and
 * credential storage belong to the connector administration layer; callers
 * get tenant-scoped invocations only.
 */
export declare class McpReadOnlyConnectorService {
    private readonly transport;
    private readonly timeoutMs;
    private readonly repository?;
    private readonly connectors;
    private readonly usage;
    constructor(transport: McpReadOnlyTransport, timeoutMs?: number, repository?: McpConnectorRepository | undefined);
    register(connector: ReadOnlyMcpConnector): {
        ok: true;
    } | {
        ok: false;
        code: "mcp_connector_invalid";
    };
    invoke(tenantId: string, connectorId: string, toolName: string, toolInput?: Record<string, unknown>): Promise<McpReadOnlyResult>;
    private allow;
}
export declare function validateMcpConnector(value: ReadOnlyMcpConnector): {
    ok: true;
} | {
    ok: false;
    code: "mcp_connector_invalid";
};
