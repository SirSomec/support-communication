/**
 * A small, tenant-agnostic OpenAI-compatible chat-completions transport.
 *
 * Connection lookup, tenant authorization and secret storage deliberately live
 * outside this adapter. Callers pass one resolved connection at a time.
 */
export declare const OPENAI_COMPATIBLE_CHAT_PROVIDER_ID: "openai-compatible-chat";
export type ChatCompletionRole = "assistant" | "system" | "user";
export interface ChatCompletionMessage {
    content: string;
    role: ChatCompletionRole;
}
export interface OpenAiCompatibleChatConnection {
    /** Secret resolved by the server-side connection store; never persist it in requests or errors. */
    apiKey: string;
    baseUrl: string;
    maxRetries?: number;
    model: string;
    timeoutMs?: number;
}
/** BAI-871: provider prompt-cache directive (AITunnel/Anthropic style `cache_control`). */
export interface ChatCompletionCacheControl {
    ttl?: "1h" | "5m";
}
/**
 * BAI-871: провайдерский prompt-кеш включается по-разному (docs.aitunnel.ru):
 * Anthropic/Gemini/Qwen требуют явные cache_control-брейкпоинты, OpenAI-,
 * DeepSeek-, Grok-семейства кешируют префикс автоматически, а лишний
 * cache_control в content-частях может сломать нормализацию у агрегатора.
 * Отправляйте брейкпоинты только когда эта функция вернула true.
 */
export declare function usesExplicitPromptCacheBreakpoints(model: string): boolean;
/**
 * BAI-871: one text block of the system message. A block with `cacheControl`
 * becomes an explicit cache breakpoint — everything up to and including it is
 * cached by the provider (AITunnel serializes it as `cache_control` on the
 * content part). Keep cacheable blocks byte-stable between calls.
 */
export interface ChatCompletionSystemBlock {
    cacheControl?: ChatCompletionCacheControl;
    text: string;
}
export interface ChatCompletionRequest {
    /** BAI-871: top-level cache_control — enables automatic caching where supported. */
    cacheControl?: ChatCompletionCacheControl;
    maxTokens?: number;
    messages: ChatCompletionMessage[];
    /** BAI-851: cache hint sent to providers that support prefix caching; never contains PII. */
    promptCacheKey?: string;
    responseFormat?: "json_object" | "text";
    /** BAI-871: sticky-routing hint (AITunnel `session_id`, ≤256 chars); never contains PII. */
    sessionId?: string;
    /** BAI-871: prepended as one system message made of content blocks with optional cache breakpoints. */
    systemBlocks?: ChatCompletionSystemBlock[];
    temperature?: number;
}
export interface ChatCompletionUsage {
    /** BAI-871: tokens newly written to the provider cache this call (prompt_tokens_details.cache_write_tokens). */
    cacheWriteTokens?: number;
    cachedTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
}
export interface ChatCompletionResult {
    content: string;
    model: string;
    providerId: typeof OPENAI_COMPATIBLE_CHAT_PROVIDER_ID;
    providerRequestId: string | null;
    usage: ChatCompletionUsage;
}
export type AiProviderErrorCode = "invalid_response" | "provider_error" | "provider_rate_limited" | "provider_timeout" | "provider_unavailable";
/** Safe to show in telemetry or an operator-facing diagnostic; never includes provider response text or credentials. */
export declare class AiProviderError extends Error {
    readonly code: AiProviderErrorCode;
    readonly retryable: boolean;
    constructor(code: AiProviderErrorCode, retryable: boolean, message: string);
}
export interface OpenAiCompatibleChatProvider {
    complete(request: ChatCompletionRequest): Promise<ChatCompletionResult>;
    readonly model: string;
    readonly providerId: typeof OPENAI_COMPATIBLE_CHAT_PROVIDER_ID;
}
export interface OpenAiCompatibleChatProviderOptions {
    fetch?: typeof fetch;
    sleep?: (milliseconds: number) => Promise<void>;
}
export declare function createOpenAiCompatibleChatProvider(connection: OpenAiCompatibleChatConnection, options?: OpenAiCompatibleChatProviderOptions): OpenAiCompatibleChatProvider;
/** Exported for contract tests; builds the raw provider request body. */
export declare function buildRequestBody(request: ChatCompletionRequest, model: string): Record<string, unknown>;
