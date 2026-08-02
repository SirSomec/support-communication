import { InMemoryStore, createPrismaClient } from "@support-communication/database";
let defaultRepository = null;
export class McpConnectorRepository {
    store;
    prismaClient;
    constructor(store, prismaClient) {
        this.store = store;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (!defaultRepository) {
            // Prisma-only рантайм (план 2026-07-15): дефолтный репозиторий всегда
            // персистится в Postgres; json-файловая ветка выпилена.
            defaultRepository = McpConnectorRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) });
        }
        return defaultRepository;
    }
    static clearDefault() { defaultRepository = null; }
    static inMemory(seed = { connectors: [] }) { return new McpConnectorRepository(new InMemoryStore(normalizeState(seed))); }
    static prisma({ client }) {
        return new McpConnectorRepository(new InMemoryStore({ connectors: [] }), client);
    }
    static useDefault(repository) { defaultRepository = repository; }
    list(tenantId) {
        const tenant = required(tenantId);
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.mcpConnector.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId: tenant } }))
                .then((rows) => rows.map(toRecord));
        }
        return clone(this.store.read().connectors.filter((item) => item.tenantId === tenant));
    }
    find(tenantId, id) {
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
    save(record) {
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
            const current = normalizeState(state);
            const exists = current.connectors.some((item) => item.tenantId === value.tenantId && item.id === value.id);
            return { connectors: exists ? current.connectors.map((item) => item.tenantId === value.tenantId && item.id === value.id ? value : item) : [...current.connectors, value] };
        });
        return clone(value);
    }
}
function toCreateInput(record) {
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
function toRecord(row) {
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
function toStringArray(value) {
    return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}
function toTools(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .map((item) => ({ mode: "read", name: String(item?.name ?? "").trim() }))
        .filter((item) => Boolean(item.name));
}
function normalizeState(state) { return { connectors: (state.connectors ?? []).map(normalize) }; }
function normalize(record) {
    const endpoint = new URL(record.endpoint);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password)
        throw new Error("mcp_connector_endpoint_invalid");
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
function required(value) { const result = String(value ?? "").trim(); if (!result)
    throw new Error("mcp_connector_identity_required"); return result; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
//# sourceMappingURL=mcp-connector.repository.js.map