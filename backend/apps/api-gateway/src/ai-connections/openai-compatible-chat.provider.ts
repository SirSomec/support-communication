/**
 * A small, tenant-agnostic OpenAI-compatible chat-completions transport.
 *
 * Connection lookup, tenant authorization and secret storage deliberately live
 * outside this adapter. Callers pass one resolved connection at a time.
 */
export const OPENAI_COMPATIBLE_CHAT_PROVIDER_ID = "openai-compatible-chat" as const;

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRIES = 3;

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

export interface ChatCompletionRequest {
  maxTokens?: number;
  messages: ChatCompletionMessage[];
  responseFormat?: "json_object" | "text";
  temperature?: number;
}

export interface ChatCompletionUsage {
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
export class AiProviderError extends Error {
  constructor(
    readonly code: AiProviderErrorCode,
    readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = "AiProviderError";
  }
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

export function createOpenAiCompatibleChatProvider(
  connection: OpenAiCompatibleChatConnection,
  options: OpenAiCompatibleChatProviderOptions = {}
): OpenAiCompatibleChatProvider {
  const apiKey = requiredText(connection.apiKey, "ai_connection_api_key_required");
  const model = requiredText(connection.model, "ai_connection_model_required");
  const endpoint = chatCompletionsEndpoint(connection.baseUrl);
  const timeoutMs = clampInteger(connection.timeoutMs ?? DEFAULT_TIMEOUT_MS, 100, 120_000);
  const maxRetries = clampInteger(connection.maxRetries ?? DEFAULT_MAX_RETRIES, 0, MAX_RETRIES);
  const fetchImpl = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));

  return {
    model,
    providerId: OPENAI_COMPATIBLE_CHAT_PROVIDER_ID,
    async complete(request) {
      const body = requestBody(request, model);
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
          return parseCompletion(payload, model);
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

function requestBody(request: ChatCompletionRequest, model: string): Record<string, unknown> {
  if (!Array.isArray(request.messages) || request.messages.length === 0) throw new Error("ai_chat_messages_required");
  const messages = request.messages.map((message) => {
    if (!isRole(message.role) || !message.content.trim()) throw new Error("ai_chat_message_invalid");
    return { content: message.content, role: message.role };
  });
  const body: Record<string, unknown> = { messages, model };
  if (request.temperature !== undefined) body.temperature = boundedNumber(request.temperature, 0, 2, "ai_chat_temperature_invalid");
  if (request.maxTokens !== undefined) body.max_tokens = clampInteger(request.maxTokens, 1, 32_768);
  if (request.responseFormat === "json_object") body.response_format = { type: "json_object" };
  return body;
}

function parseCompletion(value: unknown, configuredModel: string): ChatCompletionResult {
  const payload = record(value);
  const firstChoice = Array.isArray(payload.choices) ? record(payload.choices[0]) : {};
  const content = messageContent(record(firstChoice.message).content);
  if (!content) throw new AiProviderError("invalid_response", false, "AI provider returned an invalid response.");
  const usage = record(payload.usage);
  return {
    content,
    model: text(payload.model) ?? configuredModel,
    providerId: OPENAI_COMPATIBLE_CHAT_PROVIDER_ID,
    providerRequestId: text(payload.id),
    usage: {
      inputTokens: nonNegativeInteger(usage.prompt_tokens),
      outputTokens: nonNegativeInteger(usage.completion_tokens),
      totalTokens: nonNegativeInteger(usage.total_tokens)
    }
  };
}

function messageContent(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!Array.isArray(value)) return null;
  const content = value.map((part) => text(record(part).text) ?? "").join("").trim();
  return content || null;
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

function chatCompletionsEndpoint(baseUrl: string): string {
  const normalized = requiredText(baseUrl, "ai_connection_base_url_required").replace(/\/+$/, "");
  let parsed: URL;
  try { parsed = new URL(normalized); } catch { throw new Error("ai_connection_base_url_invalid"); }
  if (parsed.username || parsed.password) throw new Error("ai_connection_base_url_invalid");
  return `${normalized}/chat/completions`;
}
function requiredText(value: string, code: string): string { if (!value?.trim()) throw new Error(code); return value.trim(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function nonNegativeInteger(value: unknown): number | undefined { const number = Number(value); return Number.isInteger(number) && number >= 0 ? number : undefined; }
function isRole(value: unknown): value is ChatCompletionRole { return value === "assistant" || value === "system" || value === "user"; }
function clampInteger(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, Math.trunc(value))); }
function boundedNumber(value: number, min: number, max: number, code: string): number { if (!Number.isFinite(value) || value < min || value > max) throw new Error(code); return value; }
function retryDelay(attempt: number): number { return Math.min(1_000, 100 * (2 ** attempt)); }
