import { validateUrlKnowledgeSourceConfig } from "./url-source-config.js";
import { assertPublicResolution } from "./knowledge-sources.service.js";
/** Fixed-shape Streamable HTTP call: callers cannot add headers, redirect the
 * request or replace the persisted endpoint. */
export class HttpMcpReadOnlyTransport {
    fetcher;
    resolveHostname;
    constructor(fetcher = fetch, resolveHostname) {
        this.fetcher = fetcher;
        this.resolveHostname = resolveHostname;
    }
    async call(input) {
        await assertPublicResolution(new URL(input.endpoint).hostname, this.resolveHostname);
        const response = await this.fetcher(input.endpoint, {
            body: JSON.stringify({ id: `read-${crypto.randomUUID()}`, jsonrpc: "2.0", method: "tools/call", params: { arguments: input.toolInput, name: input.toolName } }),
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            method: "POST",
            redirect: "error",
            signal: input.signal
        });
        if (!response.ok)
            throw new Error("mcp_transport_failed");
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (!contentType.includes("application/json"))
            throw new Error("mcp_transport_failed");
        const payload = await response.json();
        if (payload.error !== undefined || payload.result === undefined)
            throw new Error("mcp_transport_failed");
        return payload.result;
    }
}
const MAX_INPUT_CHARS = 8_000;
const MAX_RESULT_CHARS = 20_000;
const DEFAULT_TIMEOUT_MS = 8_000;
const WRITE_TOOL_PATTERN = /(write|create|update|delete|remove|insert|patch|put|post|send|publish|execute|mutate|set)/i;
/**
 * In-memory registry is intentionally a narrow foundation.  Persistence and
 * credential storage belong to the connector administration layer; callers
 * get tenant-scoped invocations only.
 */
export class McpReadOnlyConnectorService {
    transport;
    timeoutMs;
    repository;
    connectors = new Map();
    usage = new Map();
    constructor(transport, timeoutMs = DEFAULT_TIMEOUT_MS, repository) {
        this.transport = transport;
        this.timeoutMs = timeoutMs;
        this.repository = repository;
    }
    register(connector) {
        if (!isValidConnector(connector))
            return { ok: false, code: "mcp_connector_invalid" };
        this.connectors.set(key(connector.tenantId, connector.id), freezeConnector(connector));
        return { ok: true };
    }
    async invoke(tenantId, connectorId, toolName, toolInput = {}) {
        const persisted = await this.repository?.find(tenantId, connectorId);
        const connector = persisted ? { ...persisted, approved: Boolean(persisted.approvedAt) } : this.connectors.get(key(tenantId, connectorId));
        if (!connector)
            return { ok: false, code: "mcp_connector_not_found" };
        if (!connector.approved)
            return { ok: false, code: "mcp_connector_unapproved" };
        if (connector.status === "disabled")
            return { ok: false, code: "mcp_connector_disabled" };
        if (!this.allow(key(tenantId, connectorId), persisted?.rateLimitPerMinute ?? 60))
            return { ok: false, code: "mcp_rate_limited" };
        if (!connector.tools.some((tool) => tool.name === toolName))
            return { ok: false, code: "mcp_tool_forbidden" };
        if (serializedLength(toolInput) > MAX_INPUT_CHARS)
            return { ok: false, code: "mcp_input_too_large" };
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), normalizedTimeout(this.timeoutMs));
        try {
            const raw = await this.transport.call({ endpoint: connector.endpoint, signal: controller.signal, toolName, toolInput });
            const content = stringifyResult(raw);
            if (content === null)
                return { ok: false, code: "mcp_result_rejected" };
            return { ok: true, result: { content: content.slice(0, MAX_RESULT_CHARS), truncated: content.length > MAX_RESULT_CHARS } };
        }
        catch (error) {
            return { ok: false, code: isAbortError(error, controller.signal) ? "mcp_timeout" : "mcp_transport_failed" };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    allow(scope, limit) {
        const now = Date.now();
        const prior = this.usage.get(scope);
        const state = !prior || now - prior.window >= 60_000 ? { count: 0, window: now } : prior;
        if (state.count >= Math.max(1, Math.min(300, limit)))
            return false;
        state.count += 1;
        this.usage.set(scope, state);
        return true;
    }
}
export function validateMcpConnector(value) {
    return isValidConnector(value) ? { ok: true } : { ok: false, code: "mcp_connector_invalid" };
}
function isValidConnector(value) {
    if (!value || !value.tenantId.trim() || !value.id.trim() || !Array.isArray(value.tools) || value.tools.length === 0)
        return false;
    const endpoint = validateUrlKnowledgeSourceConfig({ url: value.endpoint }, { allowedHosts: value.allowedHosts });
    if (!endpoint.ok)
        return false;
    const names = new Set();
    return value.tools.every((tool) => {
        const name = String(tool?.name ?? "").trim();
        if (tool?.mode !== "read" || !name || WRITE_TOOL_PATTERN.test(name) || names.has(name))
            return false;
        names.add(name);
        return true;
    });
}
function freezeConnector(connector) {
    const endpoint = validateUrlKnowledgeSourceConfig({ url: connector.endpoint }, { allowedHosts: connector.allowedHosts });
    if (!endpoint.ok)
        throw new Error("mcp_connector_invalid");
    return Object.freeze({ ...connector, endpoint: endpoint.config.url, allowedHosts: Object.freeze([...connector.allowedHosts]), tools: Object.freeze(connector.tools.map((tool) => Object.freeze({ ...tool }))) });
}
function key(tenantId, connectorId) { return `${tenantId}\u0000${connectorId}`; }
function normalizedTimeout(value) { return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 30_000) : DEFAULT_TIMEOUT_MS; }
function serializedLength(value) { try {
    return JSON.stringify(value).length;
}
catch {
    return Number.MAX_SAFE_INTEGER;
} }
function stringifyResult(value) {
    if (typeof value === "string")
        return value;
    try {
        return JSON.stringify(value);
    }
    catch {
        return null;
    }
}
function isAbortError(error, signal) {
    return signal.aborted || (error instanceof Error && error.name === "AbortError");
}
//# sourceMappingURL=mcp-readonly-connector.service.js.map