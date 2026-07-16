import { type DurableStore, InMemoryStore, createPrismaClient } from "@support-communication/database";

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

type MaybePromise<T> = Promise<T> | T;

export interface PrismaMcpConnectorRow {
  allowedHosts: unknown;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  description: string | null;
  endpoint: string;
  id: string;
  name: string | null;
  rateLimitPerMinute: number;
  rejectedReason: string | null;
  requestedBy: string | null;
  status: string;
  tenantId: string;
  tools: unknown;
  updatedAt: Date;
}

export interface PrismaMcpConnectorCreateInput {
  allowedHosts: string[];
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  description: string | null;
  endpoint: string;
  id: string;
  name: string | null;
  rateLimitPerMinute: number;
  rejectedReason: string | null;
  requestedBy: string | null;
  status: string;
  tenantId: string;
  tools: Array<{ mode: "read"; name: string }>;
  updatedAt: Date;
}

export interface McpConnectorPrismaClient {
  mcpConnector: {
    findMany(input: { orderBy?: { createdAt: "asc" }; where?: { tenantId: string } }): MaybePromise<PrismaMcpConnectorRow[]>;
    upsert(input: {
      create: PrismaMcpConnectorCreateInput;
      update: Omit<PrismaMcpConnectorCreateInput, "createdAt" | "id" | "tenantId">;
      where: { tenantId_id: { id: string; tenantId: string } };
    }): MaybePromise<PrismaMcpConnectorRow>;
  };
}

interface McpConnectorState { connectors: McpConnectorRecord[]; }
let defaultRepository: McpConnectorRepository | null = null;

export class McpConnectorRepository {
  constructor(
    private readonly store: DurableStore<McpConnectorState>,
    private readonly prismaClient?: McpConnectorPrismaClient
  ) {}

  static default(): McpConnectorRepository {
    if (!defaultRepository) {
      // Prisma-only рантайм (план 2026-07-15): дефолтный репозиторий всегда
      // персистится в Postgres; json-файловая ветка выпилена.
      defaultRepository = McpConnectorRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as McpConnectorPrismaClient });
    }
    return defaultRepository;
  }
  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: McpConnectorState = { connectors: [] }): McpConnectorRepository { return new McpConnectorRepository(new InMemoryStore(normalizeState(seed))); }
  static prisma({ client }: { client: McpConnectorPrismaClient }): McpConnectorRepository {
    return new McpConnectorRepository(new InMemoryStore({ connectors: [] }), client);
  }
  static useDefault(repository: McpConnectorRepository): void { defaultRepository = repository; }

  list(tenantId: string): MaybePromise<McpConnectorRecord[]> {
    const tenant = required(tenantId);
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.mcpConnector.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId: tenant } }))
        .then((rows) => rows.map(toRecord));
    }
    return clone(this.store.read().connectors.filter((item) => item.tenantId === tenant));
  }

  find(tenantId: string, id: string): MaybePromise<McpConnectorRecord | undefined> {
    const tenant = required(tenantId);
    const connectorId = required(id);
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.mcpConnector.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId: tenant } }))
        .then((rows) => {
          const row = rows.find((item) => item.id === connectorId);
          return row ? toRecord(row) : undefined;
        });
    }
    const found = this.store.read().connectors.find((item) => item.tenantId === tenant && item.id === connectorId);
    return found ? clone(found) : undefined;
  }

  save(record: McpConnectorRecord): MaybePromise<McpConnectorRecord> {
    const value = normalize(record);
    if (this.prismaClient) {
      const create = toCreateInput(value);
      const { createdAt: _createdAt, id: _id, tenantId: _tenantId, ...update } = create;
      return Promise.resolve(this.prismaClient.mcpConnector.upsert({
        create,
        update,
        where: { tenantId_id: { id: value.id, tenantId: value.tenantId } }
      })).then(toRecord);
    }
    this.store.update((state) => {
      const current = normalizeState(state); const exists = current.connectors.some((item) => item.tenantId === value.tenantId && item.id === value.id);
      return { connectors: exists ? current.connectors.map((item) => item.tenantId === value.tenantId && item.id === value.id ? value : item) : [...current.connectors, value] };
    });
    return clone(value);
  }
}

function toCreateInput(record: McpConnectorRecord): PrismaMcpConnectorCreateInput {
  return {
    allowedHosts: record.allowedHosts,
    approvedAt: record.approvedAt ? new Date(record.approvedAt) : null,
    approvedBy: record.approvedBy ?? null,
    createdAt: new Date(record.createdAt),
    description: record.description ?? null,
    endpoint: record.endpoint,
    id: record.id,
    name: record.name ?? null,
    rateLimitPerMinute: record.rateLimitPerMinute,
    rejectedReason: record.rejectedReason ?? null,
    requestedBy: record.requestedBy ?? null,
    status: record.status,
    tenantId: record.tenantId,
    tools: record.tools,
    updatedAt: new Date(record.updatedAt)
  };
}

function toRecord(row: PrismaMcpConnectorRow): McpConnectorRecord {
  return normalize({
    allowedHosts: toStringArray(row.allowedHosts),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    approvedBy: row.approvedBy,
    createdAt: row.createdAt.toISOString(),
    ...(row.description ? { description: row.description } : {}),
    endpoint: row.endpoint,
    id: row.id,
    ...(row.name ? { name: row.name } : {}),
    rateLimitPerMinute: row.rateLimitPerMinute,
    ...(row.rejectedReason ? { rejectedReason: row.rejectedReason } : {}),
    ...(row.requestedBy ? { requestedBy: row.requestedBy } : {}),
    status: row.status === "enabled" ? "enabled" : "disabled",
    tenantId: row.tenantId,
    tools: toTools(row.tools),
    updatedAt: row.updatedAt.toISOString()
  });
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function toTools(value: unknown): Array<{ mode: "read"; name: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({ mode: "read" as const, name: String((item as { name?: unknown })?.name ?? "").trim() }))
    .filter((item) => Boolean(item.name));
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
