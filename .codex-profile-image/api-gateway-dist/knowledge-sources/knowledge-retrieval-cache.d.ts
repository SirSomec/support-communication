export interface RetrievalCacheMetrics {
    hits: number;
    misses: number;
    purges: number;
}
export interface RetrievalCacheValue {
    /** BAI-875: LLM-selector metadata; absent for lexical results. */
    cachedTokens?: number;
    cacheWriteTokens?: number;
    corpusTruncated?: boolean;
    fallbackReason?: string;
    mode?: "lexical" | "llm" | "llm_fallback" | "semantic" | "semantic_fallback";
    passages: Array<{
        citation: {
            endOffset: number;
            sourceId: string;
            sourceVersion: number;
            startOffset: number;
            title: string;
        };
        content: string;
        score: number;
    }>;
    tokenBudget: number;
    tokensUsed: number;
}
export interface RetrievalCacheKeyInput {
    /** BAI-875: retrieval strategy; different strategies never share a cache entry. */
    mode?: "lexical" | "llm" | "semantic";
    query: string;
    scoreThreshold?: number;
    sourceBindings: Array<{
        sourceId: string;
        sourceVersion?: string;
    }>;
    tenantId: string;
    tokenBudget: number;
}
/** Tenant + source-revision keyed cache for retrieval results. Never a substitute for policy checks. */
export declare class KnowledgeRetrievalCache {
    private readonly ttlMs;
    private readonly now;
    private readonly entries;
    readonly metrics: RetrievalCacheMetrics;
    private static shared;
    constructor(ttlMs?: number, now?: () => number);
    static default(): KnowledgeRetrievalCache;
    static clearDefault(): void;
    static useDefault(cache: KnowledgeRetrievalCache | null): void;
    get(key: string): RetrievalCacheValue | null;
    set(key: string, value: RetrievalCacheValue, meta: {
        sourceIds: string[];
        tenantId: string;
    }): void;
    purgeTenant(tenantId: string): number;
    purgeSource(tenantId: string, sourceId: string): number;
    clear(): void;
    private purgeWhere;
}
export declare function buildRetrievalCacheKey(input: RetrievalCacheKeyInput): string;
