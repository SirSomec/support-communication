import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { KnowledgeRetrievalCache } from "./knowledge-retrieval-cache.js";
import { type KnowledgeCorpus } from "./knowledge-corpus.js";
import type { McpReadOnlyResult } from "./mcp-readonly-connector.service.js";
/** BAI-833: live read-only MCP call used as a knowledge source. Injected so tests never hit the network. */
export interface McpRetrievalInvoker {
    invoke(tenantId: string, connectorId: string, toolName: string, toolInput: Record<string, unknown>): Promise<McpReadOnlyResult>;
}
/** BAI-874/875: LLM chunk selector. Injected so tests never hit the network; failures fall back to lexical. */
export interface LlmKnowledgeSearchResult {
    cachedTokens?: number;
    cacheWriteTokens?: number;
    passages: KnowledgeRetrievalPassage[];
}
export interface LlmKnowledgeSearchInvoker {
    search(input: {
        corpus: KnowledgeCorpus;
        query: string;
        scenarioId?: string;
        tenantId: string;
    }): Promise<LlmKnowledgeSearchResult>;
}
/** Semantic embedding ranker. Injected so tests never hit the network; failures fall back to lexical. */
export interface SemanticKnowledgeSearchResult {
    passages: KnowledgeRetrievalPassage[];
}
export interface SemanticKnowledgeSearchInvoker {
    search(input: {
        corpus: KnowledgeCorpus;
        query: string;
        scenarioId?: string;
        tenantId: string;
    }): Promise<SemanticKnowledgeSearchResult>;
}
export type KnowledgeRetrievalMode = "lexical" | "llm" | "semantic";
export interface KnowledgeRetrievalInput {
    /** BAI-875: retrieval strategy; "llm" needs an injected selector, otherwise silently stays lexical. */
    mode?: KnowledgeRetrievalMode;
    query: string;
    scenarioId?: string;
    /** BAI-843: минимальный lexical score фрагмента; ниже него доказательства недостаточны. */
    scoreThreshold?: number;
    sourceBindings: Array<{
        sourceId: string;
        sourceVersion?: string;
    }>;
    tenantId: string;
    tokenBudget?: number;
}
export interface KnowledgeRetrievalPassage {
    citation: {
        endOffset: number;
        sourceId: string;
        sourceVersion: number;
        startOffset: number;
        title: string;
    };
    content: string;
    score: number;
}
export interface KnowledgeRetrievalResult {
    cache: "hit" | "miss";
    /** BAI-875: provider prompt-cache stats of the LLM selector call (absent for lexical). */
    cachedTokens?: number;
    cacheWriteTokens?: number;
    corpusTruncated?: boolean;
    /** BAI-875: set when mode="llm"/"semantic" failed and lexical answered instead. */
    fallbackReason?: string;
    mode: "lexical" | "llm" | "llm_fallback" | "semantic" | "semantic_fallback";
    passages: KnowledgeRetrievalPassage[];
    tokenBudget: number;
    tokensUsed: number;
}
/** Tenant- and scenario-bound retrieval with an explicit provider token budget: lexical by default, embedding ranker or LLM-selector by mode. */
export declare class KnowledgeRetrievalService {
    private readonly sources;
    private readonly mcpInvoker?;
    private readonly llmSearch?;
    private readonly corpusMaxTokens;
    private readonly semanticSearch?;
    private readonly workspace;
    private readonly cache;
    constructor(sources?: KnowledgeSourceRepository, workspace?: WorkspaceRepository, cache?: KnowledgeRetrievalCache, mcpInvoker?: McpRetrievalInvoker | undefined, llmSearch?: LlmKnowledgeSearchInvoker | undefined, corpusMaxTokens?: number | undefined, semanticSearch?: SemanticKnowledgeSearchInvoker | undefined);
    retrieve(input: KnowledgeRetrievalInput): Promise<KnowledgeRetrievalResult>;
    /**
     * BAI-874/875: LLM-selector strategy. Строит детерминированный корпус из
     * привязанных источников (MCP-источники остаются живыми вызовами и
     * добавляются отдельными пассажами) и спрашивает дорогую модель, какие чанки
     * отвечают на вопрос. Пустой корпус без MCP — валидный «нет знаний», не сбой.
     */
    private llmRetrieve;
    /**
     * Семантическая стратегия: эмбеддинг-ранжирование корпуса вместо чтения его
     * дорогой моделью. Чанки эмбеддятся один раз (кеш по контент-хешу в
     * SemanticKnowledgeSearchService), на запрос тратится только вектор вопроса.
     * Отсев здесь агрессивнее лексического: абсолютный порог плюс относительный
     * (доля от лучшего скора) — боту уходит несколько действительно близких
     * чанков, а не всё, что формально пролезло в токен-бюджет.
     */
    private semanticRetrieve;
    /**
     * BAI-833: MCP-источник — живой read-only вызов. Ошибка/таймаут даёт пустой
     * результат (отсутствие доказательств → handoff), а не выдуманный ответ.
     */
    private mcpPassage;
}
