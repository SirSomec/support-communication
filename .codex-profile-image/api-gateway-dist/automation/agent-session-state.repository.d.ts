import { type DurableStore } from "@support-communication/database";
import type { AgentSessionFact, AgentSessionPolicy, AgentSessionState, AgentSessionTurn, AgentSessionUpdateInput, AgentSessionUpdateResult } from "./agent-session-state.types.js";
type MaybePromise<T> = Promise<T> | T;
interface AgentSessionStateStore {
    sessions: AgentSessionState[];
}
export interface PrismaAgentSessionRow {
    conversationId: string;
    createdAt: Date;
    expiresAt: Date;
    facts: unknown;
    intent: string | null;
    openQuestion: string | null;
    recentTurns: unknown;
    scenarioRevisionId: string | null;
    schemaVersion: number;
    summary: string;
    tenantId: string;
    tokenEstimate: number;
    turnCount: number;
    updatedAt: Date;
    version: number;
}
export interface PrismaAgentSessionCreateInput {
    conversationId: string;
    createdAt: Date;
    expiresAt: Date;
    facts: AgentSessionFact[];
    intent: string | null;
    openQuestion: string | null;
    recentTurns: AgentSessionTurn[];
    scenarioRevisionId: string | null;
    schemaVersion: number;
    summary: string;
    tenantId: string;
    tokenEstimate: number;
    turnCount: number;
    updatedAt: Date;
    version: number;
}
export interface AgentSessionPrismaClient {
    agentSessionState: {
        count(input: {
            where: {
                expiresAt: {
                    lt: Date;
                };
            };
        }): MaybePromise<number>;
        deleteMany(input: {
            where: {
                conversationId?: string;
                expiresAt?: {
                    lt: Date;
                };
                tenantId?: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
        findUnique(input: {
            where: {
                tenantId_conversationId: {
                    conversationId: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaAgentSessionRow | null>;
        upsert(input: {
            create: PrismaAgentSessionCreateInput;
            update: Omit<PrismaAgentSessionCreateInput, "conversationId" | "createdAt" | "tenantId">;
            where: {
                tenantId_conversationId: {
                    conversationId: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaAgentSessionRow>;
    };
}
/** Tenant- and conversation-scoped compact agent memory. Never a full transcript store. */
export declare class AgentSessionStateRepository {
    private readonly store;
    private readonly policy;
    private readonly prismaClient?;
    constructor(store: DurableStore<AgentSessionStateStore>, policy?: AgentSessionPolicy, prismaClient?: AgentSessionPrismaClient | undefined);
    static default(): AgentSessionStateRepository;
    static clearDefault(): void;
    static inMemory(seed?: AgentSessionStateStore, policy?: AgentSessionPolicy): AgentSessionStateRepository;
    static prisma({ client, policy }: {
        client: AgentSessionPrismaClient;
        policy?: AgentSessionPolicy;
    }): AgentSessionStateRepository;
    get(tenantId: string, conversationId: string, now?: Date): MaybePromise<AgentSessionState | null>;
    save(state: AgentSessionState): MaybePromise<AgentSessionState>;
    updateAfterRun(input: AgentSessionUpdateInput): Promise<AgentSessionUpdateResult>;
    delete(tenantId: string, conversationId: string): MaybePromise<void>;
    purgeExpired(now?: Date): MaybePromise<number>;
    private getPrisma;
}
export {};
