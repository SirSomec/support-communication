import { type DurableStore } from "@support-communication/database";
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
    tools: Array<{
        mode: "read";
        name: string;
    }>;
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
    tools: Array<{
        mode: "read";
        name: string;
    }>;
    updatedAt: Date;
}
export interface McpConnectorPrismaClient {
    mcpConnector: {
        findMany(input: {
            orderBy?: {
                createdAt: "asc";
            };
            where?: {
                tenantId: string;
            };
        }): MaybePromise<PrismaMcpConnectorRow[]>;
        upsert(input: {
            create: PrismaMcpConnectorCreateInput;
            update: Omit<PrismaMcpConnectorCreateInput, "createdAt" | "id" | "tenantId">;
            where: {
                tenantId_id: {
                    id: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaMcpConnectorRow>;
    };
}
interface McpConnectorState {
    connectors: McpConnectorRecord[];
}
export declare class McpConnectorRepository {
    private readonly store;
    private readonly prismaClient?;
    constructor(store: DurableStore<McpConnectorState>, prismaClient?: McpConnectorPrismaClient | undefined);
    static default(): McpConnectorRepository;
    static clearDefault(): void;
    static inMemory(seed?: McpConnectorState): McpConnectorRepository;
    static prisma({ client }: {
        client: McpConnectorPrismaClient;
    }): McpConnectorRepository;
    static useDefault(repository: McpConnectorRepository): void;
    list(tenantId: string): MaybePromise<McpConnectorRecord[]>;
    find(tenantId: string, id: string): MaybePromise<McpConnectorRecord | undefined>;
    save(record: McpConnectorRecord): MaybePromise<McpConnectorRecord>;
}
export {};
