import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { type OpenAiCompatibleChatConnection, type OpenAiCompatibleChatProvider } from "../ai-connections/openai-compatible-chat.provider.js";
import type { KnowledgeCorpus, KnowledgeCorpusChunk } from "./knowledge-corpus.js";
import type { KnowledgeRetrievalPassage, LlmKnowledgeSearchInvoker, LlmKnowledgeSearchResult } from "./knowledge-retrieval.service.js";
export type LlmSearchProviderFactory = (connection: OpenAiCompatibleChatConnection) => OpenAiCompatibleChatProvider;
export declare class LlmKnowledgeSearchService implements LlmKnowledgeSearchInvoker {
    private readonly connections;
    private readonly environment;
    private readonly usage;
    private readonly providerFactory;
    constructor(connections?: AiConnectionRepository, environment?: NodeJS.ProcessEnv, usage?: AiUsageRepository, providerFactory?: LlmSearchProviderFactory);
    search(input: {
        corpus: KnowledgeCorpus;
        query: string;
        scenarioId?: string;
        tenantId: string;
    }): Promise<LlmKnowledgeSearchResult>;
}
/**
 * Терпимый разбор вывода селектора: JSON-объект с chunks, markdown-обёртка
 * допускается; всё невалидное отбрасывается. Модели периодически возвращают
 * вместо chunk-id идентификатор ИСТОЧНИКА из заголовка корпуса («ks_…@v3») —
 * такой выбор честный, просто в другом формате, поэтому разворачиваем его в
 * чанки этого источника, а не молча теряем найденное знание.
 */
export declare function selectPassages(content: string, chunks: KnowledgeCorpusChunk[]): KnowledgeRetrievalPassage[];
