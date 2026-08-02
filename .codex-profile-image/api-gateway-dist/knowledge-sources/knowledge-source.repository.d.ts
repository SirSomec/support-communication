import { type DurableStore } from "@support-communication/database";
import { type KnowledgeSourceRecord } from "./knowledge-source.types.js";
import { KnowledgeRetrievalCache } from "./knowledge-retrieval-cache.js";
type MaybePromise<T> = Promise<T> | T;
export interface KnowledgeSourcesState {
    ingestionJobs: KnowledgeDocumentIngestionJob[];
    sources: KnowledgeSourceRecord[];
}
export interface KnowledgeDocumentIngestionJob {
    attempts: number;
    createdAt: string;
    errorCode: string | null;
    fileId: string;
    fingerprint: string;
    idempotencyKey: string;
    jobId: string;
    sourceId: string;
    status: "completed" | "failed" | "pending" | "processing";
    tenantId: string;
    updatedAt: string;
}
export interface PrismaKnowledgeSourceRow {
    approvalStatus: string;
    approvedAt: Date | null;
    approvedBy: string | null;
    archivedAt: Date | null;
    contentChecksum: string | null;
    createdAt: Date;
    disabledAt: Date | null;
    failedAt: Date | null;
    failureCode: string | null;
    id: string;
    kind: string;
    lastIndexedAt: Date | null;
    lastIngestedAt: Date | null;
    metadata: unknown;
    owner: string;
    readiness: string;
    retentionUntil: Date | null;
    sourceConfig: unknown;
    sourceRef: string | null;
    status: string;
    tenantId: string;
    title: string;
    updatedAt: Date;
    version: number;
}
export interface PrismaKnowledgeSourceCreateInput extends Omit<PrismaKnowledgeSourceRow, "metadata" | "sourceConfig"> {
    metadata: Record<string, unknown>;
    sourceConfig: Record<string, unknown>;
}
export interface PrismaKnowledgeIngestionJobRow {
    attempts: number;
    createdAt: Date;
    errorCode: string | null;
    fileId: string;
    fingerprint: string;
    idempotencyKey: string;
    jobId: string;
    sourceId: string;
    status: string;
    tenantId: string;
    updatedAt: Date;
}
export interface KnowledgeSourcePrismaClient {
    knowledgeIngestionJob: {
        create(input: {
            data: PrismaKnowledgeIngestionJobRow;
        }): MaybePromise<PrismaKnowledgeIngestionJobRow>;
        deleteMany(input: {
            where: {
                sourceId?: string;
                tenantId?: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
        findFirst(input: {
            orderBy?: {
                createdAt: "asc";
            };
            where: {
                status?: string;
                tenantId?: string;
                idempotencyKey?: string;
                updatedAt?: {
                    lt: Date;
                };
            };
        }): MaybePromise<PrismaKnowledgeIngestionJobRow | null>;
        findUnique(input: {
            where: {
                jobId: string;
            };
        }): MaybePromise<PrismaKnowledgeIngestionJobRow | null>;
        updateMany(input: {
            data: Partial<Omit<PrismaKnowledgeIngestionJobRow, "jobId" | "tenantId">>;
            where: {
                jobId: string;
                status?: string;
                updatedAt?: Date;
            };
        }): MaybePromise<{
            count: number;
        }>;
    };
    knowledgeSource: {
        deleteMany(input: {
            where: {
                id: string;
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
        findMany(input: {
            orderBy?: {
                createdAt: "asc";
            };
            where?: {
                tenantId?: string;
            };
        }): MaybePromise<PrismaKnowledgeSourceRow[]>;
        upsert(input: {
            create: PrismaKnowledgeSourceCreateInput;
            update: Omit<PrismaKnowledgeSourceCreateInput, "createdAt" | "id" | "tenantId">;
            where: {
                tenantId_id: {
                    id: string;
                    tenantId: string;
                };
            };
        }): MaybePromise<PrismaKnowledgeSourceRow>;
    };
}
/**
 * Tenant-scoped persistence for the source catalogue.  Transport, ingestion
 * and retrieval deliberately remain outside this repository.
 */
export declare class KnowledgeSourceRepository {
    private readonly store;
    private readonly prismaClient?;
    constructor(store: DurableStore<KnowledgeSourcesState>, prismaClient?: KnowledgeSourcePrismaClient | undefined);
    static default(): KnowledgeSourceRepository;
    static clearDefault(): void;
    static bindRetrievalCache(cache: KnowledgeRetrievalCache | null): void;
    static inMemory(seed?: KnowledgeSourcesState): KnowledgeSourceRepository;
    static prisma({ client }: {
        client: KnowledgeSourcePrismaClient;
    }): KnowledgeSourceRepository;
    static useDefault(repository: KnowledgeSourceRepository): void;
    list(tenantId: string): MaybePromise<KnowledgeSourceRecord[]>;
    /** Internal worker read model. Callers must keep each subsequent mutation tenant-scoped. */
    listAll(): MaybePromise<KnowledgeSourceRecord[]>;
    find(tenantId: string, id: string): MaybePromise<KnowledgeSourceRecord | undefined>;
    save(record: KnowledgeSourceRecord): MaybePromise<KnowledgeSourceRecord>;
    /** Hard delete of an archived source; ingestion jobs of the source are dropped with it. */
    delete(tenantId: string, id: string): MaybePromise<void>;
    /** BAI-827: пометить document-источники статьи, что вышла новая версия статьи. */
    markArticleUpdated(tenantId: string, articleId: string, articleVersion: string): MaybePromise<number>;
    findIngestionJob(tenantId: string, idempotencyKey: string): MaybePromise<KnowledgeDocumentIngestionJob | undefined>;
    claimNextIngestionJob(): MaybePromise<KnowledgeDocumentIngestionJob | undefined>;
    saveIngestionJob(job: KnowledgeDocumentIngestionJob): MaybePromise<KnowledgeDocumentIngestionJob>;
    completeIngestionJob(jobId: string, status: "completed" | "failed", errorCode?: string | null): MaybePromise<KnowledgeDocumentIngestionJob | undefined>;
    private claimNextPrismaIngestionJob;
    private savePrismaIngestionJob;
}
export {};
