/**
 * A small, tenant-agnostic OpenAI-compatible embeddings transport.
 *
 * Как и chat-провайдер, ничего не знает о подключениях и секретах — вызывающий
 * передаёт одну разрешённую connection. Векторы детерминированы моделью,
 * поэтому кешируются вызывающим по контент-хешу, а не здесь.
 */
export declare const OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID: "openai-compatible-embedding";
export interface OpenAiCompatibleEmbeddingConnection {
    /** Secret resolved by the server-side connection store; never persist it in requests or errors. */
    apiKey: string;
    baseUrl: string;
    maxRetries?: number;
    model: string;
    timeoutMs?: number;
}
export interface EmbeddingUsage {
    inputTokens?: number;
    totalTokens?: number;
}
export interface EmbeddingResult {
    model: string;
    providerId: typeof OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID;
    providerRequestId: string | null;
    usage: EmbeddingUsage;
    /** Векторы в порядке входных текстов (провайдерский index уважается при разборе). */
    vectors: number[][];
}
export interface OpenAiCompatibleEmbeddingProvider {
    embed(inputs: string[]): Promise<EmbeddingResult>;
    readonly model: string;
    readonly providerId: typeof OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID;
}
export interface OpenAiCompatibleEmbeddingProviderOptions {
    fetch?: typeof fetch;
    sleep?: (milliseconds: number) => Promise<void>;
}
export declare function createOpenAiCompatibleEmbeddingProvider(connection: OpenAiCompatibleEmbeddingConnection, options?: OpenAiCompatibleEmbeddingProviderOptions): OpenAiCompatibleEmbeddingProvider;
/** Exported for contract tests; builds the raw provider request body. */
export declare function buildEmbeddingRequestBody(inputs: string[], model: string): Record<string, unknown>;
