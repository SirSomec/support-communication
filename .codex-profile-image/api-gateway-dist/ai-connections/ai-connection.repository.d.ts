import { type DurableStore } from "@support-communication/database";
import type { SecretEnvelope } from "./secret-store.js";
type MaybePromise<T> = Promise<T> | T;
export type AiConnectionCapability = "chat_completion" | "embeddings" | "retrieval";
export type AiConnectionStatus = "disabled" | "error" | "limited" | "ready";
export interface AiConnectionRecord {
    baseUrl: string;
    capabilities: AiConnectionCapability[];
    chatModel: string;
    createdAt: string;
    disabledAt: string | null;
    embeddingModel: string | null;
    id: string;
    keyVersion: string;
    lastTestMessage: string | null;
    lastTestStatus: "failed" | "passed" | null;
    lastTestedAt: string | null;
    limits: {
        maxConcurrentRuns?: number;
        monthlyTokenBudget?: number;
        requestsPerMinute?: number;
        sandboxMonthlyTokenBudget?: number;
    };
    providerType: "openai_compatible";
    /** BAI-870: expensive model used for LLM knowledge search; null = lexical retrieval only. */
    retrievalModel: string | null;
    secret: SecretEnvelope;
    status: AiConnectionStatus;
    tenantId: string;
    updatedAt: string;
}
interface AiConnectionsState {
    connections: AiConnectionRecord[];
}
export interface PrismaAiConnectionRow {
    baseUrl: string;
    capabilities: unknown;
    chatModel: string;
    createdAt: Date;
    disabledAt: Date | null;
    embeddingModel: string | null;
    id: string;
    keyVersion: string | null;
    lastTestMessage: string | null;
    lastTestStatus: string | null;
    lastTestedAt: Date | null;
    limits: unknown;
    providerType: string;
    retrievalModel: string | null;
    secretAlgorithm: string | null;
    secretAuthTag: string | null;
    secretCiphertext: string | null;
    secretEnvelopeVersion: number | null;
    secretIv: string | null;
    status: string;
    tenantId: string;
    updatedAt: Date;
}
export interface PrismaAiConnectionCreateInput {
    baseUrl: string;
    capabilities: AiConnectionCapability[];
    chatModel: string;
    createdAt: Date;
    disabledAt: Date | null;
    embeddingModel: string | null;
    id: string;
    keyVersion: string;
    lastTestMessage: string | null;
    lastTestStatus: string | null;
    lastTestedAt: Date | null;
    limits: AiConnectionRecord["limits"];
    providerType: string;
    retrievalModel: string | null;
    secretAlgorithm: string;
    secretAuthTag: string;
    secretCiphertext: string;
    secretEnvelopeVersion: number;
    secretIv: string;
    status: string;
    tenantId: string;
    updatedAt: Date;
}
export interface AiConnectionPrismaClient {
    aiConnection: {
        delete(input: {
            where: {
                tenantId_id: {
                    id: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaAiConnectionRow>;
        findMany(input: {
            orderBy?: {
                createdAt: "asc";
            };
            where?: {
                tenantId: string;
            };
        }): MaybePromise<PrismaAiConnectionRow[]>;
        upsert(input: {
            create: PrismaAiConnectionCreateInput;
            update: Omit<PrismaAiConnectionCreateInput, "createdAt" | "id" | "tenantId">;
            where: {
                tenantId_id: {
                    id: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaAiConnectionRow>;
    };
}
export declare class AiConnectionRepository {
    private readonly store;
    private readonly prismaClient?;
    constructor(store: DurableStore<AiConnectionsState>, prismaClient?: AiConnectionPrismaClient | undefined);
    static default(): AiConnectionRepository;
    static clearDefault(): void;
    static inMemory(seed?: AiConnectionsState): AiConnectionRepository;
    static prisma({ client }: {
        client: AiConnectionPrismaClient;
    }): AiConnectionRepository;
    static useDefault(repository: AiConnectionRepository): void;
    list(tenantId: string): MaybePromise<AiConnectionRecord[]>;
    find(tenantId: string, id: string): MaybePromise<AiConnectionRecord | undefined>;
    save(record: AiConnectionRecord): MaybePromise<AiConnectionRecord>;
    remove(tenantId: string, id: string): MaybePromise<boolean>;
}
export {};
