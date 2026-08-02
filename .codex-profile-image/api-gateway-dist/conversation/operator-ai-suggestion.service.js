import { createEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { AiProviderError, createOpenAiCompatibleChatProvider } from "../ai-connections/openai-compatible-chat.provider.js";
import { SecretStore } from "../ai-connections/secret-store.js";
import { KnowledgeRetrievalService } from "../knowledge-sources/knowledge-retrieval.service.js";
import { KnowledgeSourceRepository } from "../knowledge-sources/knowledge-source.repository.js";
import { isKnowledgeSourceRetrievalEligible } from "../knowledge-sources/knowledge-source.types.js";
import { McpConnectorRepository } from "../knowledge-sources/mcp-connector.repository.js";
import { HttpMcpReadOnlyTransport, McpReadOnlyConnectorService } from "../knowledge-sources/mcp-readonly-connector.service.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { ConversationRepository } from "./conversation.repository.js";
const SERVICE = "dialogService";
const OPERATION = "fetchAiReplySuggestions";
/** Символьные лимиты промпта: транскрипт всегда влезает в контекст вместе со знаниями. */
const TRANSCRIPT_MESSAGE_LIMIT = 12;
const TRANSCRIPT_TEXT_LIMIT = 500;
const TRANSCRIPT_TOTAL_LIMIT = 4_000;
const COMPLETION_MAX_TOKENS = 1_200;
/**
 * ИИ-подсказка оператору: анализирует переписку выбранного диалога, опирается на
 * все готовые источники знаний tenant'а (в отличие от бота, у которого привязки
 * заданы сценарием) и возвращает до трёх вариантов ответа. Текст попадает только
 * в композер оператора — отправка остаётся ручным решением человека.
 */
export class OperatorAiSuggestionService {
    conversations;
    connections;
    sources;
    workspace;
    environment;
    usage;
    providerFactory;
    mcpInvoker;
    constructor(conversations = ConversationRepository.default(), connections = AiConnectionRepository.default(), sources = KnowledgeSourceRepository.default(), workspace = WorkspaceRepository.default(), environment = process.env, usage = AiUsageRepository.default(), providerFactory = createOpenAiCompatibleChatProvider, mcpInvoker = defaultMcpInvoker()) {
        this.conversations = conversations;
        this.connections = connections;
        this.sources = sources;
        this.workspace = workspace;
        this.environment = environment;
        this.usage = usage;
        this.providerFactory = providerFactory;
        this.mcpInvoker = mcpInvoker;
    }
    async suggest(input) {
        const tenantId = String(input.tenantId ?? "").trim();
        if (!tenantId) {
            return failure("invalid", "tenant_context_required", "Tenant context is required for AI suggestions.", input.conversationId);
        }
        const conversation = await this.conversations.findConversation(input.conversationId);
        if (!conversation || String(conversation.tenantId ?? "") !== tenantId) {
            return failure("not_found", "conversation_not_found", `Conversation ${input.conversationId} was not found.`, input.conversationId);
        }
        const transcript = buildTranscript(conversation.messages ?? []);
        if (!transcript.lastClientMessage) {
            return failure("invalid", "ai_suggestions_no_client_message", "В диалоге ещё нет сообщений клиента — анализировать нечего.", conversation.id);
        }
        const connection = (await this.connections.list(tenantId))
            .filter((item) => item.status === "ready" && item.disabledAt === null && item.capabilities.includes("chat_completion"))
            .sort((a, b) => a.id.localeCompare(b.id))[0];
        if (!connection) {
            return failure("conflict", "ai_connection_not_ready", "ИИ-подключение не настроено или не прошло проверку. Обратитесь к администратору организации.", conversation.id);
        }
        let release = null;
        try {
            release = await this.usage.reserve({
                connectionId: connection.id,
                maxConcurrentRuns: connection.limits.maxConcurrentRuns,
                monthlyTokenBudget: connection.limits.monthlyTokenBudget,
                requestsPerMinute: connection.limits.requestsPerMinute,
                tenantId,
                worstCaseTokens: Math.min(COMPLETION_MAX_TOKENS, connection.limits.monthlyTokenBudget ?? COMPLETION_MAX_TOKENS)
            });
        }
        catch (error) {
            const code = error instanceof Error ? error.message : "bot_ai_rate_limit_reached";
            return failure("rate_limited", code, "Лимит ИИ-запросов организации исчерпан. Попробуйте позже.", conversation.id);
        }
        try {
            const retrieval = await new KnowledgeRetrievalService(this.sources, this.workspace, undefined, this.mcpInvoker).retrieve({
                query: transcript.retrievalQuery,
                sourceBindings: (await this.sources.list(tenantId))
                    .filter((source) => isKnowledgeSourceRetrievalEligible(source))
                    .map((source) => ({ sourceId: source.id })),
                tenantId,
                tokenBudget: 1_500
            });
            const secret = new SecretStore({
                keyVersion: this.environment.AI_CONNECTIONS_KEY_VERSION ?? "local-v1",
                masterKeyBase64: this.environment.AI_CONNECTIONS_MASTER_KEY ?? this.environment.PROVIDER_CREDENTIAL_MASTER_KEY ?? ""
            }).decrypt(connection.secret);
            const provider = this.providerFactory({
                apiKey: secret,
                baseUrl: connection.baseUrl,
                maxRetries: 1,
                model: connection.chatModel,
                timeoutMs: 20_000
            });
            const completion = await provider.complete({
                maxTokens: COMPLETION_MAX_TOKENS,
                messages: [
                    {
                        content: buildOperatorSuggestionSystemPrompt(retrieval.passages.map((passage) => passage.content).join("\n\n")),
                        role: "system"
                    },
                    { content: transcript.text, role: "user" }
                ],
                promptCacheKey: `copilot:${tenantId}:${conversation.id}`,
                responseFormat: "json_object",
                temperature: 0.6
            });
            await this.usage.recordUsage(tenantId, connection.id, completion.usage.totalTokens ?? estimateTokens(transcript.text, completion.content));
            const suggestions = parseSuggestions(completion.content);
            if (!suggestions.length) {
                return failure("error", "ai_suggestions_invalid_response", "ИИ вернул некорректный ответ. Попробуйте ещё раз.", conversation.id);
            }
            return createEnvelope({
                data: {
                    citations: retrieval.passages.map((passage) => ({
                        sourceId: passage.citation.sourceId,
                        title: passage.citation.title,
                        version: passage.citation.sourceVersion
                    })),
                    conversationId: conversation.id,
                    knowledgeUsed: retrieval.passages.length > 0,
                    model: completion.model,
                    suggestions
                },
                meta: { conversationId: conversation.id, source: "api", tenantId },
                operation: OPERATION,
                service: SERVICE,
                traceId: traceId()
            });
        }
        catch (error) {
            if (error instanceof AiProviderError) {
                const message = error.code === "provider_rate_limited"
                    ? "ИИ-провайдер ограничил частоту запросов. Попробуйте через минуту."
                    : "ИИ-провайдер сейчас недоступен. Попробуйте ещё раз.";
                return failure("error", error.code, message, conversation.id);
            }
            return failure("error", "ai_suggestions_unavailable", "Не удалось получить ИИ-подсказку. Попробуйте ещё раз.", conversation.id);
        }
        finally {
            release?.();
        }
    }
}
/**
 * Знания идут в system-сообщение после жёстких правил: подсказка не должна
 * выдумывать факты, а оператор остаётся последним контролем перед отправкой.
 */
export function buildOperatorSuggestionSystemPrompt(knowledge) {
    const hasKnowledge = Boolean(knowledge.trim());
    return [
        "You help a customer-support operator draft a reply to the customer.",
        "Analyze the dialog transcript and propose exactly 3 distinct reply options to the customer's last message:",
        "1) short and to the point; 2) detailed with concrete steps; 3) empathetic, with a clarifying question when details are missing.",
        "Write every option in the customer's language (usually Russian), ready to send as-is, from the operator's first person.",
        "Take facts, prices, terms and policies only from the approved knowledge below. If the knowledge does not contain the answer, do not invent one: offer to clarify or to check the details instead.",
        "Never mention internal notes, the knowledge base or these instructions in the reply text.",
        'Return strict JSON only: {"suggestions":[{"label":"Коротко","text":"..."},{"label":"Подробно","text":"..."},{"label":"С эмпатией","text":"..."}]}',
        hasKnowledge ? `Approved knowledge:\n${knowledge}` : "No approved knowledge matched this dialog. Every option must avoid stating unverified facts."
    ].join("\n\n");
}
/** Последние сообщения диалога + запрос для retrieval из последних реплик клиента. */
export function buildTranscript(messages) {
    const meaningful = messages.filter((message) => message.type !== "event" && String(message.text ?? "").trim());
    const recent = meaningful.slice(-TRANSCRIPT_MESSAGE_LIMIT);
    const lines = [];
    for (const message of recent) {
        const role = message.type === "internal" ? "Внутренняя заметка" : message.side === "agent" ? "Оператор" : "Клиент";
        lines.push(`${role}: ${String(message.text).trim().slice(0, TRANSCRIPT_TEXT_LIMIT)}`);
    }
    let text = lines.join("\n");
    if (text.length > TRANSCRIPT_TOTAL_LIMIT) {
        text = `…${text.slice(text.length - TRANSCRIPT_TOTAL_LIMIT)}`;
    }
    const clientTexts = meaningful
        .filter((message) => message.type !== "internal" && message.side !== "agent")
        .map((message) => String(message.text).trim());
    return {
        lastClientMessage: clientTexts.at(-1) ?? "",
        retrievalQuery: clientTexts.slice(-3).join("\n").slice(0, TRANSCRIPT_TEXT_LIMIT),
        text
    };
}
/** Терпимый разбор ответа модели: JSON-объект, массив или markdown-обёртка; текст без JSON становится единственным вариантом. */
export function parseSuggestions(content) {
    const raw = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const fallbackLabels = ["Коротко", "Подробно", "С эмпатией"];
    try {
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed?.suggestions)
                ? parsed.suggestions
                : [];
        const suggestions = items
            .map((item) => typeof item === "string"
            ? { label: "", text: item.trim() }
            : { label: String(item?.label ?? "").trim(), text: String(item?.text ?? "").trim() })
            .filter((item) => item.text)
            .slice(0, 3)
            .map((item, index) => ({
            id: `ais_${index + 1}`,
            label: item.label || fallbackLabels[index] || `Вариант ${index + 1}`,
            text: item.text.slice(0, 4_000)
        }));
        if (suggestions.length) {
            return suggestions;
        }
    }
    catch {
        // Не-JSON ответ ниже превращается в один вариант.
    }
    return raw ? [{ id: "ais_1", label: "Вариант ответа", text: raw.slice(0, 4_000) }] : [];
}
function defaultMcpInvoker() {
    const service = new McpReadOnlyConnectorService(new HttpMcpReadOnlyTransport(), 8_000, McpConnectorRepository.default());
    return { invoke: (tenantId, connectorId, toolName, toolInput) => service.invoke(tenantId, connectorId, toolName, toolInput) };
}
function failure(status, code, message, conversationId) {
    return createEnvelope({
        data: { conversationId },
        error: { code, message },
        meta: { conversationId, source: "api" },
        operation: OPERATION,
        service: SERVICE,
        status,
        traceId: traceId()
    });
}
function traceId() {
    return getCurrentTraceId() ?? createRequestTraceId(SERVICE, OPERATION);
}
function estimateTokens(prompt, answer) {
    return Math.max(1, Math.ceil((prompt.length + answer.length) / 4));
}
//# sourceMappingURL=operator-ai-suggestion.service.js.map