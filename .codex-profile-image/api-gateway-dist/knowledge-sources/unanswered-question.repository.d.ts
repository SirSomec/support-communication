import { type DurableStore } from "@support-communication/database";
type MaybePromise<T> = Promise<T> | T;
export type UnansweredQuestionStatus = "dismissed" | "open" | "resolved";
export interface UnansweredQuestionRecord {
    channel: string | null;
    count: number;
    firstAskedAt: string;
    id: string;
    lastAskedAt: string;
    normalizedKey: string;
    question: string;
    reason: string;
    resolvedArticleId: string | null;
    scenarioId: string | null;
    status: UnansweredQuestionStatus;
    tenantId: string;
}
interface UnansweredQuestionsState {
    questions: UnansweredQuestionRecord[];
}
export interface PrismaUnansweredQuestionRow {
    channel: string | null;
    count: number;
    firstAskedAt: Date;
    id: string;
    lastAskedAt: Date;
    normalizedKey: string;
    question: string;
    reason: string;
    resolvedArticleId: string | null;
    scenarioId: string | null;
    status: string;
    tenantId: string;
}
export interface PrismaUnansweredQuestionCreateInput {
    channel: string | null;
    count: number;
    firstAskedAt: Date;
    id: string;
    lastAskedAt: Date;
    normalizedKey: string;
    question: string;
    reason: string;
    resolvedArticleId: string | null;
    scenarioId: string | null;
    status: string;
    tenantId: string;
}
export interface UnansweredQuestionPrismaClient {
    unansweredQuestion: {
        create(input: {
            data: PrismaUnansweredQuestionCreateInput;
        }): MaybePromise<PrismaUnansweredQuestionRow>;
        deleteMany(input: {
            where: {
                id: {
                    in: string[];
                };
            };
        }): MaybePromise<{
            count: number;
        }>;
        findFirst(input: {
            where: {
                normalizedKey?: string;
                status?: string;
                tenantId?: string;
            };
        }): MaybePromise<PrismaUnansweredQuestionRow | null>;
        findMany(input: {
            orderBy?: {
                lastAskedAt: "asc" | "desc";
            };
            where?: {
                status?: string;
                tenantId?: string;
            };
        }): MaybePromise<PrismaUnansweredQuestionRow[]>;
        update(input: {
            data: Partial<Omit<PrismaUnansweredQuestionCreateInput, "id">>;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaUnansweredQuestionRow>;
        updateMany(input: {
            data: {
                resolvedArticleId: string | null;
                status: string;
            };
            where: {
                id: string;
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
    };
}
/**
 * BAI-826: очередь «вопросов без ответа» — обращения, на которые бот не смог
 * ответить из-за отсутствия готовых знаний. Текст редактируется от PII и
 * усечён; полная переписка остаётся только в системе диалогов.
 */
export declare class UnansweredQuestionRepository {
    private readonly store;
    private readonly prismaClient?;
    constructor(store: DurableStore<UnansweredQuestionsState>, prismaClient?: UnansweredQuestionPrismaClient | undefined);
    static default(): UnansweredQuestionRepository;
    static clearDefault(): void;
    static useDefault(repository: UnansweredQuestionRepository): void;
    static inMemory(seed?: UnansweredQuestionsState): UnansweredQuestionRepository;
    static prisma({ client }: {
        client: UnansweredQuestionPrismaClient;
    }): UnansweredQuestionRepository;
    list(tenantId: string): MaybePromise<UnansweredQuestionRecord[]>;
    record(input: {
        channel?: string;
        question: string;
        reason: string;
        scenarioId?: string;
        tenantId: string;
    }): MaybePromise<UnansweredQuestionRecord | null>;
    setStatus(tenantId: string, questionId: string, status: UnansweredQuestionStatus, resolvedArticleId?: string | null): MaybePromise<UnansweredQuestionRecord | null>;
    private recordPrisma;
    private setStatusPrisma;
}
export {};
