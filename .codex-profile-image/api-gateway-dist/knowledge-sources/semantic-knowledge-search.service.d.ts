import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { type OpenAiCompatibleEmbeddingConnection, type OpenAiCompatibleEmbeddingProvider } from "../ai-connections/openai-compatible-embedding.provider.js";
import { type KnowledgeCorpus } from "./knowledge-corpus.js";
import type { SemanticKnowledgeSearchInvoker, SemanticKnowledgeSearchResult } from "./knowledge-retrieval.service.js";
/**
 * Кеш векторов чанков: ключ — модель + sha256 контента, поэтому изменённый
 * чанк автоматически получает новый вектор, а инвалидация не нужна вовсе.
 * Значения вытесняются по LRU; при ~12КБ на вектор потолок в 5000 записей
 * держит кеш в пределах десятков мегабайт.
 */
export declare class EmbeddingVectorCache {
    private readonly maxEntries;
    private readonly entries;
    private static shared;
    constructor(maxEntries?: number);
    static default(): EmbeddingVectorCache;
    static clearDefault(): void;
    get(model: string, contentHash: string): number[] | undefined;
    set(model: string, contentHash: string, vector: number[]): void;
    get size(): number;
}
export type SemanticSearchProviderFactory = (connection: OpenAiCompatibleEmbeddingConnection) => OpenAiCompatibleEmbeddingProvider;
export declare class SemanticKnowledgeSearchService implements SemanticKnowledgeSearchInvoker {
    private readonly connections;
    private readonly environment;
    private readonly usage;
    private readonly providerFactory;
    private readonly vectors;
    constructor(connections?: AiConnectionRepository, environment?: NodeJS.ProcessEnv, usage?: AiUsageRepository, providerFactory?: SemanticSearchProviderFactory, vectors?: EmbeddingVectorCache);
    search(input: {
        corpus: KnowledgeCorpus;
        query: string;
        scenarioId?: string;
        tenantId: string;
    }): Promise<SemanticKnowledgeSearchResult>;
}
/** Честный косинус с нормами: OpenAI-векторы юнит-нормированы, но совместимые
 * провайдеры этого не гарантируют. Разные размерности (смена модели у
 * провайдера при том же имени) дают 0, а не мусорное произведение. */
export declare function cosineSimilarity(left: number[], right: number[]): number;
