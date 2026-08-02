import { type DurableStore } from "@support-communication/database";
import type { BotSandboxSession, BotSandboxTurn, BotSandboxUsageRecord } from "./bot-sandbox.types.js";
type MaybePromise<T> = Promise<T> | T;
interface BotSandboxStore {
    sessions: BotSandboxSession[];
    usage: BotSandboxUsageRecord[];
}
export declare const BOT_SANDBOX_SESSION_TTL_MS: number;
export interface PrismaBotSandboxSessionRow {
    channel: string;
    context: unknown;
    createdAt: Date;
    createdBy: string;
    currentNodeId: string | null;
    expiresAt: Date;
    id: string;
    locale: string;
    mode: string;
    scenarioId: string;
    scenarioName: string;
    status: string;
    tenantId: string;
    turns: unknown;
    updatedAt: Date;
    usage: unknown;
    versionId: string;
    webhooksEnabled: boolean;
}
export interface PrismaBotSandboxSessionCreateInput {
    channel: string;
    context: Record<string, unknown>;
    createdAt: Date;
    createdBy: string;
    currentNodeId: string | null;
    expiresAt: Date;
    id: string;
    locale: string;
    mode: string;
    scenarioId: string;
    scenarioName: string;
    status: string;
    tenantId: string;
    turns: BotSandboxTurn[];
    updatedAt: Date;
    usage: {
        totalTokens: number;
    };
    versionId: string;
    webhooksEnabled: boolean;
}
export interface PrismaBotSandboxUsageRow {
    month: string;
    tenantId: string;
    usedTokens: number;
}
export interface BotSandboxPrismaClient {
    botSandboxSession: {
        deleteMany(input: {
            where: {
                expiresAt?: {
                    lte: Date;
                };
                id?: string;
                tenantId?: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
        findFirst(input: {
            where: {
                id: string;
                tenantId: string;
            };
        }): MaybePromise<PrismaBotSandboxSessionRow | null>;
        findMany(input: {
            orderBy: {
                updatedAt: "asc";
            };
            where: {
                tenantId: string;
            };
        }): MaybePromise<PrismaBotSandboxSessionRow[]>;
        upsert(input: {
            create: PrismaBotSandboxSessionCreateInput;
            update: Omit<PrismaBotSandboxSessionCreateInput, "createdAt" | "id" | "tenantId">;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaBotSandboxSessionRow>;
    };
    botSandboxUsageCounter: {
        findUnique(input: {
            where: {
                tenantId_month: {
                    month: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaBotSandboxUsageRow | null>;
        upsert(input: {
            create: {
                month: string;
                tenantId: string;
                usedTokens: number;
            };
            update: {
                usedTokens: number | {
                    increment: number;
                };
            };
            where: {
                tenantId_month: {
                    month: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaBotSandboxUsageRow>;
    };
}
/** Tenant-scoped sandbox chat sessions. Ephemeral by design: TTL-bound, never part of production dialogs. */
export declare class BotSandboxSessionRepository {
    private readonly store;
    private readonly prismaClient?;
    constructor(store: DurableStore<BotSandboxStore>, prismaClient?: BotSandboxPrismaClient | undefined);
    static default(): BotSandboxSessionRepository;
    static clearDefault(): void;
    static inMemory(seed?: BotSandboxStore): BotSandboxSessionRepository;
    static prisma({ client }: {
        client: BotSandboxPrismaClient;
    }): BotSandboxSessionRepository;
    find(tenantId: string, sessionId: string, now?: Date): MaybePromise<BotSandboxSession | null>;
    save(session: BotSandboxSession): MaybePromise<BotSandboxSession>;
    delete(tenantId: string, sessionId: string): MaybePromise<void>;
    purgeExpired(now?: Date): MaybePromise<number>;
    /** Tokens spent by sandbox chats this month. Counted on top of the connection's shared monthly budget. */
    sandboxUsage(tenantId: string, now?: Date): MaybePromise<number>;
    recordSandboxUsage(tenantId: string, tokens: number, now?: Date): MaybePromise<void>;
    private findPrisma;
    private savePrisma;
    private recordSandboxUsagePrisma;
}
export {};
