import { AiProviderError } from "./openai-compatible-chat.provider.js";

/**
 * A small, tenant-agnostic OpenAI-compatible embeddings transport.
 *
 * Как и chat-провайдер, ничего не знает о подключениях и секретах — вызывающий
 * передаёт одну разрешённую connection. Векторы детерминированы моделью,
 * поэтому кешируются вызывающим по контент-хешу, а не здесь.
 */
export const OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID = "openai-compatible-embedding" as const;

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES = 3;
/** Потолок символов одного входа: чанки корпуса ~1200, запрос обрезается вызывающим. */
const MAX_INPUT_CHARS = 8_000;
const MAX_INPUTS_PER_CALL = 256;

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

export function createOpenAiCompatibleEmbeddingProvider(
  connection: OpenAiCompatibleEmbeddingConnection,
  options: OpenAiCompatibleEmbeddingProviderOptions = {}
): OpenAiCompatibleEmbeddingProvider {
  const apiKey = requiredText(connection.apiKey, "ai_connection_api_key_required");
  const model = requiredText(connection.model, "ai_connection_model_required");
  const endpoint = embeddingsEndpoint(connection.baseUrl);
  const timeoutMs = clampInteger(connection.timeoutMs ?? DEFAULT_TIMEOUT_MS, 100, 120_000);
  const maxRetries = clampInteger(connection.maxRetries ?? DEFAULT_MAX_RETRIES, 0, MAX_RETRIES);
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  return {
    model,
    providerId: OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID,
    async embed(inputs) {
      const body = requestBody(inputs, model);
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(endpoint, {
            body: JSON.stringify(body),
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            method: "POST",
            signal: controller.signal
          });
          if (!response.ok) {
            const error = httpError(response.status);
            if (error.retryable && attempt < maxRetries) {
              await sleep(retryDelay(attempt));
              continue;
            }
            throw error;
          }
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            throw new AiProviderError("invalid_response", false, "AI provider returned an invalid response.");
          }
          return parseEmbeddings(payload, model, inputs.length);
        } catch (error) {
          const safeError = toSafeError(error);
          if (safeError.retryable && attempt < maxRetries) {
            await sleep(retryDelay(attempt));
            continue;
          }
          throw safeError;
        } finally {
          clearTimeout(timer);
        }
      }
      throw new AiProviderError("provider_unavailable", true, "AI provider is unavailable.");
    }
  };
}

/** Exported for contract tests; builds the raw provider request body. */
export function buildEmbeddingRequestBody(inputs: string[], model: string): Record<string, unknown> {
  return requestBody(inputs, model);
}

function requestBody(inputs: string[], model: string): Record<string, unknown> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error("ai_embedding_inputs_required");
  if (inputs.length > MAX_INPUTS_PER_CALL) throw new Error("ai_embedding_inputs_too_many");
  const input = inputs.map((item) => {
    const text = String(item ?? "").trim();
    if (!text) throw new Error("ai_embedding_input_invalid");
    return text.slice(0, MAX_INPUT_CHARS);
  });
  return { input, model };
}

/**
 * Провайдеры возвращают data в произвольном порядке — вектор сопоставляется
 * входу по полю index, а не позиции. Расхождение количества или нечисловые
 * координаты — invalid_response: молчаливая дырка в матрице сопоставила бы
 * вектор чужому чанку и цитаты указывали бы не на тот источник.
 */
function parseEmbeddings(value: unknown, configuredModel: string, expectedCount: number): EmbeddingResult {
  const payload = record(value);
  const data = Array.isArray(payload.data) ? payload.data : [];
  if (data.length !== expectedCount) throw new AiProviderError("invalid_response", false, "AI provider returned an invalid response.");
  const vectors: number[][] = new Array(expectedCount);
  for (const [position, item] of data.entries()) {
    const row = record(item);
    const index = Number.isInteger(Number(row.index)) ? Number(row.index) : position;
    const embedding = Array.isArray(row.embedding) ? row.embedding.map(Number) : [];
    if (index < 0 || index >= expectedCount || vectors[index] || !embedding.length || embedding.some((coordinate) => !Number.isFinite(coordinate))) {
      throw new AiProviderError("invalid_response", false, "AI provider returned an invalid response.");
    }
    vectors[index] = embedding;
  }
  const usage = record(payload.usage);
  const inputTokens = nonNegativeInteger(usage.prompt_tokens);
  const totalTokens = nonNegativeInteger(usage.total_tokens);
  return {
    model: text(payload.model) ?? configuredModel,
    providerId: OPENAI_COMPATIBLE_EMBEDDING_PROVIDER_ID,
    providerRequestId: text(payload.id),
    usage: {
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens })
    },
    vectors
  };
}

function httpError(status: number): AiProviderError {
  if (status === 429) return new AiProviderError("provider_rate_limited", true, "AI provider rate limit reached.");
  if (status >= 500) return new AiProviderError("provider_unavailable", true, "AI provider is unavailable.");
  return new AiProviderError("provider_error", false, "AI provider rejected the request.");
}

function toSafeError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  if (error instanceof Error && error.name === "AbortError") return new AiProviderError("provider_timeout", true, "AI provider timed out.");
  return new AiProviderError("provider_unavailable", true, "AI provider is unavailable.");
}

function embeddingsEndpoint(baseUrl: string): string {
  const normalized = requiredText(baseUrl, "ai_connection_base_url_required").replace(/\/+$/, "");
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new Error("ai_connection_base_url_invalid"); }
  if (parsed.username || parsed.password) throw new Error("ai_connection_base_url_invalid");
  return `${normalized}/embeddings`;
}
function requiredText(value: string, code: string): string { if (!value?.trim()) throw new Error(code); return value.trim(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function nonNegativeInteger(value: unknown): number | undefined { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : undefined; }
function clampInteger(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Math.trunc(value))); }
function retryDelay(attempt: number): number { return Math.min(1_000, 100 * (2 ** attempt)); }
