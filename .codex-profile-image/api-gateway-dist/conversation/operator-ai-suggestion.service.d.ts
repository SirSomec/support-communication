import { type BackendEnvelope } from "@support-communication/envelope";
import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { type OpenAiCompatibleChatConnection, type OpenAiCompatibleChatProvider } from "../ai-connections/openai-compatible-chat.provider.js";
import { type McpRetrievalInvoker } from "../knowledge-sources/knowledge-retrieval.service.js";
import { KnowledgeSourceRepository } from "../knowledge-sources/knowledge-source.repository.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { ConversationRepository } from "./conversation.repository.js";
import type { ConversationMessage } from "./conversation.types.js";
export interface OperatorAiSuggestion {
    id: string;
    label: string;
    text: string;
}
export type OperatorAiSuggestionProviderFactory = (connection: OpenAiCompatibleChatConnection) => OpenAiCompatibleChatProvider;
/**
 * ИИ-подсказка оператору: анализирует переписку выбранного диалога, опирается на
 * все готовые источники знаний tenant'а (в отличие от бота, у которого привязки
 * заданы сценарием) и возвращает до трёх вариантов ответа. Текст попадает только
 * в композер оператора — отправка остаётся ручным решением человека.
 */
export declare class OperatorAiSuggestionService {
    private readonly conversations;
    private readonly connections;
    private readonly sources;
    private readonly workspace;
    private readonly environment;
    private readonly usage;
    private readonly providerFactory;
    private readonly mcpInvoker;
    constructor(conversations?: ConversationRepository, connections?: AiConnectionRepository, sources?: KnowledgeSourceRepository, workspace?: WorkspaceRepository, environment?: NodeJS.ProcessEnv, usage?: AiUsageRepository, providerFactory?: OperatorAiSuggestionProviderFactory, mcpInvoker?: McpRetrievalInvoker);
    suggest(input: {
        conversationId: string;
        tenantId?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
}
/**
 * Знания идут в system-сообщение после жёстких правил: подсказка не должна
 * выдумывать факты, а оператор остаётся последним контролем перед отправкой.
 */
export declare function buildOperatorSuggestionSystemPrompt(knowledge: string): string;
/** Последние сообщения диалога + запрос для retrieval из последних реплик клиента. */
export declare function buildTranscript(messages: ConversationMessage[]): {
    lastClientMessage: string;
    retrievalQuery: string;
    text: string;
};
/** Терпимый разбор ответа модели: JSON-объект, массив или markdown-обёртка; текст без JSON становится единственным вариантом. */
export declare function parseSuggestions(content: string): OperatorAiSuggestion[];
