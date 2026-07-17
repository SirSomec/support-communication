import { writeStructuredLog } from "@support-communication/observability";
import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { SecretStore } from "../ai-connections/secret-store.js";
import {
  createOpenAiCompatibleChatProvider,
  usesExplicitPromptCacheBreakpoints,
  type ChatCompletionRequest,
  type OpenAiCompatibleChatConnection,
  type OpenAiCompatibleChatProvider
} from "../ai-connections/openai-compatible-chat.provider.js";
import type { KnowledgeCorpus, KnowledgeCorpusChunk } from "./knowledge-corpus.js";
import type {
  KnowledgeRetrievalPassage,
  LlmKnowledgeSearchInvoker,
  LlmKnowledgeSearchResult
} from "./knowledge-retrieval.service.js";

/**
 * BAI-874: LLM chunk selector.  The expensive retrieval model receives the full
 * corpus as a provider-cached prompt prefix and returns ONLY chunk ids — never
 * a rewrite — so passages stay literal and citations keep offsets/versions.
 * Every failure mode throws; the caller (KnowledgeRetrievalService) falls back
 * to lexical retrieval, so the bot never dies because of the selector.
 */
const SELECTOR_INSTRUCTIONS = [
  "You are a retrieval selector for a customer-support bot.",
  "The knowledge corpus below is a list of chunks; each chunk starts with its id in square brackets, like [c:source:3].",
  "Given the customer's message, select the chunks that contain the information needed to answer it.",
  'Return STRICT JSON only: {"chunks":[{"id":"<chunk id>","confidence":<0..1>}],"insufficient":<boolean>}.',
  "Rules: at most 8 chunks ordered by relevance; never answer the question; never quote, translate or rewrite chunk text; ids must be copied exactly from the corpus.",
  'If the corpus does not contain the answer, return {"chunks":[],"insufficient":true}.'
].join("\n");

export type LlmSearchProviderFactory = (connection: OpenAiCompatibleChatConnection) => OpenAiCompatibleChatProvider;

export class LlmKnowledgeSearchService implements LlmKnowledgeSearchInvoker {
  constructor(
    private readonly connections = AiConnectionRepository.default(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly usage = AiUsageRepository.default(),
    private readonly providerFactory: LlmSearchProviderFactory = createOpenAiCompatibleChatProvider
  ) {}

  async search(input: { corpus: KnowledgeCorpus; query: string; scenarioId?: string; tenantId: string }): Promise<LlmKnowledgeSearchResult> {
    const connection = (await this.connections.list(input.tenantId))
      .filter((item) => item.status === "ready" && item.disabledAt === null && Boolean(item.retrievalModel) && item.capabilities.includes("retrieval"))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!connection) throw new Error("llm_retrieval_connection_not_ready");

    // Первый вызов на новом корпусе пишет кеш (prompt = весь корпус), поэтому
    // worst case честно включает корпус; на кеш-хитах фактический расход на
    // порядок ниже и бюджет вернёт разницу следующим reserve'ам.
    const worstCaseTokens = Math.min(
      input.corpus.tokenEstimate + 500,
      connection.limits.monthlyTokenBudget ?? input.corpus.tokenEstimate + 500
    );
    const release = await this.usage.reserve({
      connectionId: connection.id,
      maxConcurrentRuns: connection.limits.maxConcurrentRuns,
      monthlyTokenBudget: connection.limits.monthlyTokenBudget,
      requestsPerMinute: connection.limits.requestsPerMinute,
      tenantId: input.tenantId,
      worstCaseTokens
    });
    try {
      const secret = new SecretStore({
        keyVersion: this.environment.AI_CONNECTIONS_KEY_VERSION ?? "local-v1",
        masterKeyBase64: this.environment.AI_CONNECTIONS_MASTER_KEY ?? this.environment.PROVIDER_CREDENTIAL_MASTER_KEY ?? ""
      }).decrypt(connection.secret);
      const provider = this.providerFactory({
        apiKey: secret,
        baseUrl: connection.baseUrl,
        maxRetries: 1,
        model: String(connection.retrievalModel),
        timeoutMs: 20_000
      });
      // Ключ кеша/роутинга без PII: тенант + сценарий + checksum корпуса. Смена
      // корпуса меняет ключ → прогрев виден в метриках как cache_write_tokens.
      const cacheKey = `kr:${input.tenantId}:${input.scenarioId ?? "none"}:${input.corpus.checksum.slice(0, 16)}`;
      // Форма кеш-запроса зависит от семейства модели: Anthropic/Gemini/Qwen —
      // явный брейкпоинт на корпусе; OpenAI/DeepSeek и прочие кешируют префикс
      // автоматически, а посторонний cache_control им только мешает — шлём
      // обычную system-строку с тем же стабильным префиксом.
      const request: ChatCompletionRequest = usesExplicitPromptCacheBreakpoints(String(connection.retrievalModel))
        ? {
          maxTokens: 300,
          messages: [{ content: input.query.slice(0, 4_000), role: "user" }],
          promptCacheKey: cacheKey,
          responseFormat: "json_object",
          sessionId: cacheKey,
          systemBlocks: [
            { text: SELECTOR_INSTRUCTIONS },
            { cacheControl: { ttl: "1h" }, text: input.corpus.promptText }
          ],
          temperature: 0
        }
        : {
          maxTokens: 300,
          messages: [
            { content: `${SELECTOR_INSTRUCTIONS}\n\n${input.corpus.promptText}`, role: "system" },
            { content: input.query.slice(0, 4_000), role: "user" }
          ],
          promptCacheKey: cacheKey,
          responseFormat: "json_object",
          sessionId: cacheKey,
          temperature: 0
        };
      const completion = await provider.complete(request);
      // Диагностика кеш-экономики: hit-rate виден прямо в логах гейтвея
      // (cachedTokens > 0 = префикс читается из кеша провайдера).
      writeStructuredLog("info", "LLM knowledge search completed", {
        cacheWriteTokens: completion.usage.cacheWriteTokens ?? null,
        cachedTokens: completion.usage.cachedTokens ?? null,
        corpusChecksum: input.corpus.checksum.slice(0, 16),
        corpusTokens: input.corpus.tokenEstimate,
        inputTokens: completion.usage.inputTokens ?? null,
        model: String(connection.retrievalModel),
        operation: "llmKnowledgeSearch",
        scenarioId: input.scenarioId ?? null,
        service: "knowledgeRetrievalService",
        tenantId: input.tenantId
      });
      await this.usage.recordUsage(
        input.tenantId,
        connection.id,
        completion.usage.totalTokens ?? Math.ceil((input.corpus.promptText.length + input.query.length) / 4)
      );
      return {
        cachedTokens: completion.usage.cachedTokens,
        cacheWriteTokens: completion.usage.cacheWriteTokens,
        passages: selectPassages(completion.content, input.corpus.chunks)
      };
    } finally {
      release?.();
    }
  }
}

/** Терпимый разбор вывода селектора: JSON-объект с chunks, markdown-обёртка допускается; всё невалидное отбрасывается. */
export function selectPassages(content: string, chunks: KnowledgeCorpusChunk[]): KnowledgeRetrievalPassage[] {
  const raw = String(content ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("llm_retrieval_invalid_response");
  }
  const items = Array.isArray((parsed as { chunks?: unknown })?.chunks) ? (parsed as { chunks: unknown[] }).chunks : [];
  const byId = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const passages: KnowledgeRetrievalPassage[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const id = String((item as { id?: unknown })?.id ?? "").trim();
    const chunk = byId.get(id);
    if (!chunk || seen.has(id)) continue;
    seen.add(id);
    const confidence = Number((item as { confidence?: unknown })?.confidence);
    passages.push({
      citation: {
        endOffset: chunk.endOffset,
        sourceId: chunk.sourceId,
        sourceVersion: chunk.sourceVersion,
        startOffset: chunk.startOffset,
        title: chunk.title
      },
      content: chunk.content,
      score: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.8
    });
    if (passages.length >= 8) break;
  }
  return passages;
}
