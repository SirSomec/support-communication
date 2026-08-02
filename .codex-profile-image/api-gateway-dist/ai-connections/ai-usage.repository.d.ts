import { type DurableStore } from "@support-communication/database";
type MaybePromise<T> = Promise<T> | T;
export interface AiUsageRecord {
    activeRequests?: number;
    connectionId: string;
    month: string;
    requestTimes: string[];
    tenantId: string;
    usedTokens: number;
}
interface AiUsageState {
    records: AiUsageRecord[];
}
export interface ReserveInput {
    connectionId: string;
    maxConcurrentRuns?: number;
    monthlyTokenBudget?: number;
    now?: Date;
    requestsPerMinute?: number;
    tenantId: string;
    worstCaseTokens: number;
}
export interface AiUsageSnapshot {
    month: string;
    requestsThisMinute: number;
    usedTokens: number;
}
export interface PrismaAiUsageRow {
    connectionId: string;
    month: string;
    requestTimes: unknown;
    tenantId: string;
    usedTokens: number;
}
export interface PrismaAiUsageUpsertInput {
    create: {
        connectionId: string;
        month: string;
        requestTimes: string[];
        tenantId: string;
        updatedAt: Date;
        usedTokens: number;
    };
    update: {
        requestTimes?: string[];
        updatedAt: Date;
        usedTokens?: number | {
            increment: number;
        };
    };
    where: {
        tenantId_connectionId_month: {
            connectionId: string;
            month: string;
            tenantId: string;
        };
    };
}
export interface AiUsagePrismaClient {
    $transaction<T>(operation: (client: Pick<AiUsagePrismaClient, "aiUsageCounter">) => Promise<T>, options: {
        isolationLevel: "Serializable";
    }): Promise<T>;
    aiUsageCounter: {
        findUnique(input: {
            where: {
                tenantId_connectionId_month: {
                    connectionId: string;
                    month: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaAiUsageRow | null>;
        upsert(input: PrismaAiUsageUpsertInput): MaybePromise<PrismaAiUsageRow>;
    };
}
/** Durable, tenant-scoped counter used before a provider request is made. */
export declare class AiUsageRepository {
    private readonly store;
    private readonly prismaClient?;
    private readonly activeRequests;
    constructor(store: DurableStore<AiUsageState>, prismaClient?: AiUsagePrismaClient | undefined);
    static default(): AiUsageRepository;
    static clearDefault(): void;
    static inMemory(seed?: AiUsageState): AiUsageRepository;
    static prisma({ client }: {
        client: AiUsagePrismaClient;
    }): AiUsageRepository;
    reserve(input: ReserveInput): MaybePromise<() => void>;
    recordUsage(tenantId: string, connectionId: string, tokens: number, now?: Date): MaybePromise<void>;
    current(tenantId: string, connectionId: string, now?: Date): MaybePromise<AiUsageSnapshot>;
    private reservePrisma;
    private recordUsagePrisma;
    private runSerializable;
}
export {};
