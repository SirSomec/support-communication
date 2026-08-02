export type BotAiFeedbackOutcome = "helped" | "not_helped" | "wrong_source";
export interface BotAiFeedbackRecord {
    actorId: string;
    citationSourceIds: string[];
    comment: string | null;
    conversationId: string;
    createdAt: string;
    feedbackId: string;
    idempotencyKey: string;
    /** Always false — feedback never mutates knowledge without a separate review. */
    knowledgeMutated: false;
    outcome: BotAiFeedbackOutcome;
    /** BAI-852: how a reviewer resolved the item; null until reviewed. */
    resolvedAction?: string | null;
    resolvedAt?: string | null;
    reviewRequired: boolean;
    scenarioId: string | null;
    tenantId: string;
}
export interface BotAiFeedbackFilter {
    conversationId?: string;
    tenantId?: string;
}
type MaybePromise<T> = T | Promise<T>;
export interface BotFeedbackRepositoryPort {
    listFeedback(filter?: BotAiFeedbackFilter): MaybePromise<BotAiFeedbackRecord[]>;
    saveFeedback(record: BotAiFeedbackRecord): MaybePromise<BotAiFeedbackRecord>;
    resolveFeedback?(tenantId: string, feedbackId: string, action: string): MaybePromise<BotAiFeedbackRecord | undefined>;
}
export interface PrismaBotAiFeedbackRow {
    actorId: string;
    citationSourceIds: unknown;
    comment: string | null;
    conversationId: string;
    createdAt: Date;
    feedbackId: string;
    idempotencyKey: string;
    outcome: string;
    resolvedAction: string | null;
    resolvedAt: Date | null;
    reviewRequired: boolean;
    scenarioId: string | null;
    tenantId: string;
}
export interface PrismaBotAiFeedbackCreateInput {
    actorId: string;
    citationSourceIds: string[];
    comment: string | null;
    conversationId: string;
    createdAt: Date;
    feedbackId: string;
    idempotencyKey: string;
    outcome: string;
    resolvedAction: string | null;
    resolvedAt: Date | null;
    reviewRequired: boolean;
    scenarioId: string | null;
    tenantId: string;
}
export interface BotFeedbackPrismaClient {
    botAiFeedback: {
        create(input: {
            data: PrismaBotAiFeedbackCreateInput;
        }): MaybePromise<PrismaBotAiFeedbackRow>;
        findFirst(input: {
            where: {
                idempotencyKey?: string;
                tenantId?: string;
            };
        }): MaybePromise<PrismaBotAiFeedbackRow | null>;
        findMany(input: {
            orderBy?: {
                createdAt: "desc";
            };
            where?: {
                conversationId?: string;
                tenantId?: string;
            };
        }): MaybePromise<PrismaBotAiFeedbackRow[]>;
        findUnique(input: {
            where: {
                feedbackId: string;
            };
        }): MaybePromise<PrismaBotAiFeedbackRow | null>;
        updateMany(input: {
            data: {
                resolvedAction: string;
                resolvedAt: Date;
                reviewRequired: boolean;
            };
            where: {
                feedbackId: string;
                tenantId: string;
            };
        }): MaybePromise<{
            count: number;
        }>;
    };
}
export declare function isBotAiFeedbackOutcome(value: unknown): value is BotAiFeedbackOutcome;
export declare class BotFeedbackRepository implements BotFeedbackRepositoryPort {
    private records;
    private readonly prismaClient?;
    private static defaultInstance;
    private constructor();
    static default(): BotFeedbackRepository;
    static useDefault(repository: BotFeedbackRepository): void;
    static clearDefault(): void;
    static inMemory(seed?: BotAiFeedbackRecord[]): BotFeedbackRepository;
    static prisma({ client }: {
        client: BotFeedbackPrismaClient;
    }): BotFeedbackRepository;
    listFeedback(filter?: BotAiFeedbackFilter): MaybePromise<BotAiFeedbackRecord[]>;
    saveFeedback(record: BotAiFeedbackRecord): MaybePromise<BotAiFeedbackRecord>;
    resolveFeedback(tenantId: string, feedbackId: string, action: string): MaybePromise<BotAiFeedbackRecord | undefined>;
    private savePrismaFeedback;
    private resolvePrismaFeedback;
}
export {};
