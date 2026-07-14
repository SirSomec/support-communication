import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";

export interface McpConnectorRecord {
  allowedHosts: string[];
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  description?: string;
  endpoint: string;
  id: string;
  name?: string;
  rateLimitPerMinute: number;
  rejectedReason?: string | null;
  /** Set when a tenant admin requested the connector; the service admin approves it. */
  requestedBy?: string | null;
  status: "disabled" | "enabled";
  tenantId: string;
  tools: Array<{ mode: "read"; name: string }>;
  updatedAt: string;
}

interface McpConnectorState { connectors: McpConnectorRecord[]; }
let defaultRepository: McpConnectorRepository | null = null;

export class McpConnectorRepository {
  constructor(private readonly store: DurableStore<McpConnectorState>) {}

  static default(): McpConnectorRepository {
    if (!defaultRepository) defaultRepository = McpConnectorRepository.open(process.env.MCP_CONNECTORS_STORE_FILE ?? ".runtime/mcp-connectors.json");
    return defaultRepository;
  }
  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: McpConnectorState = { connectors: [] }): McpConnectorRepository { return new McpConnectorRepository(new InMemoryStore(normalizeState(seed))); }
  static open(filePath: string): McpConnectorRepository { return new McpConnectorRepository(new JsonFileStore({ filePath, seed: { connectors: [] } })); }
  static useDefault(repository: McpConnectorRepository): void { defaultRepository = repository; }

  list(tenantId: string): McpConnectorRecord[] { return clone(this.store.read().connectors.filter((item) => item.tenantId === required(tenantId))); }
  find(tenantId: string, id: string): McpConnectorRecord | undefined {
    const found = this.store.read().connectors.find((item) => item.tenantId === required(tenantId) && item.id === required(id));
    return found ? clone(found) : undefined;
  }
  save(record: McpConnectorRecord): McpConnectorRecord {
    const value = normalize(record);
    this.store.update((state) => {
      const current = normalizeState(state); const exists = current.connectors.some((item) => item.tenantId === value.tenantId && item.id === value.id);
      return { connectors: exists ? current.connectors.map((item) => item.tenantId === value.tenantId && item.id === value.id ? value : item) : [...current.connectors, value] };
    });
    return clone(value);
  }
}

function normalizeState(state: Partial<McpConnectorState>): McpConnectorState { return { connectors: (state.connectors ?? []).map(normalize) }; }
function normalize(record: McpConnectorRecord): McpConnectorRecord {
  const endpoint = new URL(record.endpoint); if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("mcp_connector_endpoint_invalid");
  return {
    ...clone(record),
    allowedHosts: [...new Set(record.allowedHosts.map((value) => value.trim().toLowerCase()).filter(Boolean))],
    ...(record.description ? { description: String(record.description).trim().slice(0, 300) } : {}),
    endpoint: endpoint.toString(),
    id: required(record.id),
    ...(record.name ? { name: String(record.name).trim().slice(0, 120) } : {}),
    rateLimitPerMinute: Math.min(300, Math.max(1, Math.floor(record.rateLimitPerMinute || 60))),
    ...(record.rejectedReason ? { rejectedReason: String(record.rejectedReason).trim().slice(0, 300) } : {}),
    ...(record.requestedBy ? { requestedBy: String(record.requestedBy).trim() } : {}),
    tenantId: required(record.tenantId),
    tools: record.tools.map((tool) => ({ mode: "read", name: required(tool.name) }))
  };
}
function required(value: unknown): string { const result = String(value ?? "").trim(); if (!result) throw new Error("mcp_connector_identity_required"); return result; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
