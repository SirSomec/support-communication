import { validateUrlKnowledgeSourceConfig } from "./url-source-config.js";
import { McpConnectorRepository } from "./mcp-connector.repository.js";
import { assertPublicResolution } from "./knowledge-sources.service.js";

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
  call(input: { endpoint: string; signal: AbortSignal; toolName: string; toolInput: Record<string, unknown> }): Promise<unknown>;
}

/** Fixed-shape Streamable HTTP call: callers cannot add headers, redirect the
 * request or replace the persisted endpoint. */
export class HttpMcpReadOnlyTransport implements McpReadOnlyTransport {
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly resolveHostname?: (hostname: string) => Promise<Array<{ address: string }>>) {}
  async call(input: { endpoint: string; signal: AbortSignal; toolName: string; toolInput: Record<string, unknown> }): Promise<unknown> {
    await assertPublicResolution(new URL(input.endpoint).hostname, this.resolveHostname);
    const response = await this.fetcher(input.endpoint, {
      body: JSON.stringify({ id: `read-${crypto.randomUUID()}`, jsonrpc: "2.0", method: "tools/call", params: { arguments: input.toolInput, name: input.toolName } }),
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: input.signal
    });
    if (!response.ok) throw new Error("mcp_transport_failed");
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) throw new Error("mcp_transport_failed");
    const payload = await response.json() as { error?: unknown; result?: unknown };
    if (payload.error !== undefined || payload.result === undefined) throw new Error("mcp_transport_failed");
    return payload.result;
  }
}

export type McpReadOnlyResult =
  | { ok: true; result: { content: string; truncated: boolean } }
  | { ok: false; code: McpReadOnlyFailureCode };

export type McpReadOnlyFailureCode =
  | "mcp_connector_invalid"
  | "mcp_connector_not_found"
  | "mcp_connector_disabled"
  | "mcp_connector_unapproved"
  | "mcp_rate_limited"
  | "mcp_tool_forbidden"
  | "mcp_input_too_large"
  | "mcp_result_rejected"
  | "mcp_timeout"
  | "mcp_transport_failed";

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
  private readonly connectors = new Map<string, ReadOnlyMcpConnector>();
  private readonly usage = new Map<string, { count: number; window: number }>();

  constructor(private readonly transport: McpReadOnlyTransport, private readonly timeoutMs = DEFAULT_TIMEOUT_MS, private readonly repository?: McpConnectorRepository) {}

  register(connector: ReadOnlyMcpConnector): { ok: true } | { ok: false; code: "mcp_connector_invalid" } {
    if (!isValidConnector(connector)) return { ok: false, code: "mcp_connector_invalid" };
    this.connectors.set(key(connector.tenantId, connector.id), freezeConnector(connector));
    return { ok: true };
  }

  async invoke(
    tenantId: string,
    connectorId: string,
    toolName: string,
    toolInput: Record<string, unknown> = {}
  ): Promise<McpReadOnlyResult> {
    const persisted = this.repository?.find(tenantId, connectorId);
    const connector: ReadOnlyMcpConnector | undefined = persisted ? { ...persisted, approved: Boolean(persisted.approvedAt) } : this.connectors.get(key(tenantId, connectorId));
    if (!connector) return { ok: false, code: "mcp_connector_not_found" };
    if (!connector.approved) return { ok: false, code: "mcp_connector_unapproved" };
    if (connector.status === "disabled") return { ok: false, code: "mcp_connector_disabled" };
    if (!this.allow(key(tenantId, connectorId), persisted?.rateLimitPerMinute ?? 60)) return { ok: false, code: "mcp_rate_limited" };
    if (!connector.tools.some((tool) => tool.name === toolName)) return { ok: false, code: "mcp_tool_forbidden" };
    if (serializedLength(toolInput) > MAX_INPUT_CHARS) return { ok: false, code: "mcp_input_too_large" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), normalizedTimeout(this.timeoutMs));
    try {
      const raw = await this.transport.call({ endpoint: connector.endpoint, signal: controller.signal, toolName, toolInput });
      const content = stringifyResult(raw);
      if (content === null) return { ok: false, code: "mcp_result_rejected" };
      return { ok: true, result: { content: content.slice(0, MAX_RESULT_CHARS), truncated: content.length > MAX_RESULT_CHARS } };
    } catch (error) {
      return { ok: false, code: isAbortError(error, controller.signal) ? "mcp_timeout" : "mcp_transport_failed" };
    } finally {
      clearTimeout(timeout);
    }
  }

  private allow(scope: string, limit: number): boolean {
    const now = Date.now(); const prior = this.usage.get(scope);
    const state = !prior || now - prior.window >= 60_000 ? { count: 0, window: now } : prior;
    if (state.count >= Math.max(1, Math.min(300, limit))) return false;
    state.count += 1; this.usage.set(scope, state); return true;
  }
}

export function validateMcpConnector(value: ReadOnlyMcpConnector): { ok: true } | { ok: false; code: "mcp_connector_invalid" } {
  return isValidConnector(value) ? { ok: true } : { ok: false, code: "mcp_connector_invalid" };
}

function isValidConnector(value: ReadOnlyMcpConnector): boolean {
  if (!value || !value.tenantId.trim() || !value.id.trim() || !Array.isArray(value.tools) || value.tools.length === 0) return false;
  const endpoint = validateUrlKnowledgeSourceConfig({ url: value.endpoint }, { allowedHosts: value.allowedHosts });
  if (!endpoint.ok) return false;
  const names = new Set<string>();
  return value.tools.every((tool) => {
    const name = String(tool?.name ?? "").trim();
    if (tool?.mode !== "read" || !name || WRITE_TOOL_PATTERN.test(name) || names.has(name)) return false;
    names.add(name);
    return true;
  });
}

function freezeConnector(connector: ReadOnlyMcpConnector): ReadOnlyMcpConnector {
  const endpoint = validateUrlKnowledgeSourceConfig({ url: connector.endpoint }, { allowedHosts: connector.allowedHosts });
  if (!endpoint.ok) throw new Error("mcp_connector_invalid");
  return Object.freeze({ ...connector, endpoint: endpoint.config.url, allowedHosts: Object.freeze([...connector.allowedHosts]), tools: Object.freeze(connector.tools.map((tool) => Object.freeze({ ...tool }))) });
}

function key(tenantId: string, connectorId: string): string { return `${tenantId}\u0000${connectorId}`; }
function normalizedTimeout(value: number): number { return Number.isSafeInteger(value) && value > 0 ? Math.min(value, 30_000) : DEFAULT_TIMEOUT_MS; }
function serializedLength(value: unknown): number { try { return JSON.stringify(value).length; } catch { return Number.MAX_SAFE_INTEGER; } }
function stringifyResult(value: unknown): string | null {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return null; }
}
function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === "AbortError");
}
