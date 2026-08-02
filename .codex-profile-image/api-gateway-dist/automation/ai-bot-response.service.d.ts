import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { KnowledgeSourceRepository } from "../knowledge-sources/knowledge-source.repository.js";
import { type KnowledgeRetrievalMode, type LlmKnowledgeSearchInvoker, type SemanticKnowledgeSearchInvoker } from "../knowledge-sources/knowledge-retrieval.service.js";
import { McpReadOnlyConnectorService } from "../knowledge-sources/mcp-readonly-connector.service.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { AgentSessionStateRepository } from "./agent-session-state.repository.js";
import type { KnowledgeSourceBinding } from "./automation.types.js";
export interface AiBotResponseInput {
    basePrompt?: string;
    behaviorRules?: string;
    conversationId?: string;
    instructions?: string;
    /** BAI-879: потолок токенов ответа (policy «максимальная длина ответа»); без него — 1000. */
    maxResponseTokens?: number;
    message: string;
    /** BAI-875: "llm" = поиск дорогой моделью, "semantic" = эмбеддинг-ранжирование; оба с fallback в лексику, по умолчанию лексика. */
    retrievalMode?: KnowledgeRetrievalMode;
    retrievalScoreThreshold?: number;
    scenarioId?: string;
    scenarioRevisionId?: string;
    sourceBindings: KnowledgeSourceBinding[];
    tenantId: string;
}
export interface AiBotResponse {
    citations: Array<{
        endOffset: number;
        sourceId: string;
        startOffset: number;
        title: string;
        version: number;
    }>;
    handoffRequested?: boolean;
    resolveRequested?: boolean;
    model: string;
    text: string;
    usage?: {
        totalTokens: number | null;
    };
    materialsAvailable?: number;
}
export declare const AI_HANDOFF_MARKER = "[[HANDOFF]]";
export declare const AI_RESOLVE_MARKER = "[[RESOLVED]]";
/**
 * Модель сигналит машинными маркерами в конце ответа: [[HANDOFF]] — передать
 * диалог оператору, [[RESOLVED]] — клиент подтвердил решение, обращение можно
 * закрыть. Маркеры вырезаются из текста до любой доставки клиенту — клиент
 * видит только человеческую фразу; решение принимает рантайм по флагам
 * (при обоих маркерах приоритет у передачи оператору). Парсится только вывод
 * модели: echo-инъекция маркера клиентом в худшем случае передаст диалог
 * оператору или закроет подтверждённое обращение, что безопасно.
 */
export declare function extractAiDirectives(text: string): {
    handoffRequested: boolean;
    resolveRequested: boolean;
    text: string;
};
/** Builds a bounded, tenant-scoped grounded prompt; it never sends keys or unrelated tenant data. */
export declare class AiBotResponseService {
    private readonly connections;
    private readonly sources;
    private readonly workspace;
    private readonly environment;
    private readonly usage;
    private readonly sessions;
    private readonly mcpConnectors;
    private readonly llmSearch;
    private readonly semanticSearch;
    constructor(connections?: AiConnectionRepository, sources?: KnowledgeSourceRepository, workspace?: WorkspaceRepository, environment?: NodeJS.ProcessEnv, usage?: AiUsageRepository, sessions?: AgentSessionStateRepository, mcpConnectors?: McpReadOnlyConnectorService, llmSearch?: LlmKnowledgeSearchInvoker, semanticSearch?: SemanticKnowledgeSearchInvoker);
    respond(input: AiBotResponseInput): Promise<AiBotResponse>;
    private materials;
    private mcpInvoker;
}
/** Selects one compact passage per source. The provider receives the question separately, so the full dialog is never replayed. */
export declare function extractRelevantKnowledge(document: string, question: string, budget: number): string;
/**
 * Order: tenant base prompt → tenant behavior rules → platform safety rails →
 * node instructions → session → knowledge. Safety rails deliberately follow the
 * tenant-configurable text so behavior rules cannot override them (BAI-840).
 */
export declare function buildAiBotSystemPrompt(input: {
    basePrompt?: string;
    behaviorRules?: string;
    instructions?: string;
    knowledge: string;
    sessionState?: string;
}): string;
