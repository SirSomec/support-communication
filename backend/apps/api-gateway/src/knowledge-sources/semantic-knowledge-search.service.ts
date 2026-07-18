import { createHash } from "node:crypto";
import { writeStructuredLog } from "@support-communication/observability";
import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { SecretStore } from "../ai-connections/secret-store.js";
import {
  createOpenAiCompatibleEmbeddingProvider,
  type OpenAiCompatibleEmbeddingConnection,
  type OpenAiCompatibleEmbeddingProvider
} from "../ai-connections/openai-compatible-embedding.provider.js";
import { estimateCorpusTokens, lexicalRelevance, lexicalTerms, type KnowledgeCorpus, type KnowledgeCorpusChunk } from "./knowledge-corpus.js";
import type { KnowledgeRetrievalPassage, SemanticKnowledgeSearchInvoker, SemanticKnowledgeSearchResult } from "./knowledge-retrieval.service.js";

/**
 * Семантический поиск по знаниям через embeddings (третий режим retrieval).
 * В отличие от LLM-селектора (BAI-874) корпус НЕ отправляется чат-модели:
 * каждый чанк эмбеддится один раз за жизнь своего контента (кеш по хешу), на
 * запрос эмбеддится только сам вопрос (~десятки токенов) — поэтому режим
 * дешёвый и «понимает» перефразировки без общих слов с базой знаний.
 * Любой сбой бросает ошибку; вызывающий (KnowledgeRetrievalService) падает в
 * лексический поиск, так что бот никогда не умирает из-за семантики.
 */

/** Вес смысловой близости против точного совпадения слов. Лексическая
 * компонента защищает точные термы (артикулы, номера тарифов), у которых
 * может не быть осмысленного вектора. */
const SEMANTIC_WEIGHT = 0.7;
const LEXICAL_WEIGHT = 0.3;
/** Сервис ранжирует весь корпус; наружу уходит только верх списка — отсев по
 * порогам и токен-бюджету делает retrieval-сервис. */
const MAX_RANKED_PASSAGES = 16;
const MAX_QUERY_CHARS = 4_000;

/**
 * Кеш векторов чанков: ключ — модель + sha256 контента, поэтому изменённый
 * чанк автоматически получает новый вектор, а инвалидация не нужна вовсе.
 * Значения вытесняются по LRU; при ~12КБ на вектор потолок в 5000 записей
 * держит кеш в пределах десятков мегабайт.
 */
export class EmbeddingVectorCache {
  private readonly entries = new Map<string, number[]>();
  private static shared: EmbeddingVectorCache | null = null;

  constructor(private readonly maxEntries = 5_000) {}

  static default(): EmbeddingVectorCache {
    if (!EmbeddingVectorCache.shared) {
      EmbeddingVectorCache.shared = new EmbeddingVectorCache();
    }
    return EmbeddingVectorCache.shared;
  }

  static clearDefault(): void { EmbeddingVectorCache.shared = null; }

  get(model: string, contentHash: string): number[] | undefined {
    const key = `${model}:${contentHash}`;
    const vector = this.entries.get(key);
    if (!vector) return undefined;
    // LRU-touch: перевставка двигает ключ в конец порядка Map.
    this.entries.delete(key);
    this.entries.set(key, vector);
    return vector;
  }

  set(model: string, contentHash: string, vector: number[]): void {
    const key = `${model}:${contentHash}`;
    this.entries.delete(key);
    this.entries.set(key, vector);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number { return this.entries.size; }
}

export type SemanticSearchProviderFactory = (connection: OpenAiCompatibleEmbeddingConnection) => OpenAiCompatibleEmbeddingProvider;

export class SemanticKnowledgeSearchService implements SemanticKnowledgeSearchInvoker {
  constructor(
    private readonly connections = AiConnectionRepository.default(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly usage = AiUsageRepository.default(),
    private readonly providerFactory: SemanticSearchProviderFactory = createOpenAiCompatibleEmbeddingProvider,
    private readonly vectors = EmbeddingVectorCache.default()
  ) {}

  async search(input: { corpus: KnowledgeCorpus; query: string; scenarioId?: string; tenantId: string }): Promise<SemanticKnowledgeSearchResult> {
    const connection = (await this.connections.list(input.tenantId))
      .filter((item) => item.status === "ready" && item.disabledAt === null && Boolean(item.embeddingModel) && item.capabilities.includes("embeddings"))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!connection) throw new Error("semantic_retrieval_connection_not_ready");
    const model = String(connection.embeddingModel);

    const query = input.query.slice(0, MAX_QUERY_CHARS);
    const hashes = input.corpus.chunks.map((chunk) => contentHash(chunk.content));
    const missing: Array<{ chunk: KnowledgeCorpusChunk; hash: string }> = [];
    const known = new Map<string, number[]>();
    for (const [index, chunk] of input.corpus.chunks.entries()) {
      const hash = hashes[index]!;
      const cached = this.vectors.get(model, hash);
      if (cached) known.set(hash, cached);
      // Дубликаты контента (один чанк в нескольких источниках) эмбеддятся один раз.
      else if (!missing.some((item) => item.hash === hash)) missing.push({ chunk, hash });
    }

    // Worst case — только НЕзакешированные чанки + вопрос: на прогретом кеше
    // резерв в сотни раз меньше, чем у LLM-селектора с его полным корпусом.
    const embedTokens = estimateCorpusTokens(query) + missing.reduce((sum, item) => sum + estimateCorpusTokens(item.chunk.content), 0);
    const worstCaseTokens = Math.min(embedTokens, connection.limits.monthlyTokenBudget ?? embedTokens);
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
        model,
        timeoutMs: 15_000
      });
      // Один батч: вопрос + недостающие чанки. Вектор вопроса не кешируем —
      // вопросы уникальны, а результат retrieval и так живёт в 5-минутном кеше.
      const embedded = await provider.embed([query, ...missing.map((item) => item.chunk.content)]);
      const queryVector = embedded.vectors[0]!;
      for (const [index, item] of missing.entries()) {
        const vector = embedded.vectors[index + 1]!;
        this.vectors.set(model, item.hash, vector);
        known.set(item.hash, vector);
      }
      const queryTerms = lexicalTerms(query);
      const passages: KnowledgeRetrievalPassage[] = input.corpus.chunks
        .map((chunk, index) => {
          const vector = known.get(hashes[index]!);
          const similarity = vector ? Math.max(0, cosineSimilarity(queryVector, vector)) : 0;
          const score = SEMANTIC_WEIGHT * similarity + LEXICAL_WEIGHT * lexicalRelevance(queryTerms, chunk.content);
          return {
            citation: {
              endOffset: chunk.endOffset,
              sourceId: chunk.sourceId,
              sourceVersion: chunk.sourceVersion,
              startOffset: chunk.startOffset,
              title: chunk.title
            },
            content: chunk.content,
            score: Math.round(score * 1_000) / 1_000
          };
        })
        .sort((a, b) => b.score - a.score || a.citation.sourceId.localeCompare(b.citation.sourceId) || a.citation.startOffset - b.citation.startOffset)
        .slice(0, MAX_RANKED_PASSAGES);
      // Имена полей без «token» — редакция логов маскирует такие ключи как секреты.
      writeStructuredLog("info", "Semantic knowledge search completed", {
        cachedVectors: known.size - missing.length,
        corpusChecksum: input.corpus.checksum.slice(0, 16),
        embeddedInputs: missing.length + 1,
        model,
        operation: "semanticKnowledgeSearch",
        promptSize: embedded.usage.inputTokens ?? null,
        scenarioId: input.scenarioId ?? null,
        service: "knowledgeRetrievalService",
        tenantId: input.tenantId,
        topScore: passages[0]?.score ?? null
      });
      await this.usage.recordUsage(
        input.tenantId,
        connection.id,
        embedded.usage.totalTokens ?? Math.max(1, embedTokens)
      );
      return { passages };
    } finally {
      release?.();
    }
  }
}

/** Честный косинус с нормами: OpenAI-векторы юнит-нормированы, но совместимые
 * провайдеры этого не гарантируют. Разные размерности (смена модели у
 * провайдера при том же имени) дают 0, а не мусорное произведение. */
export function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftNorm += left[index]! * left[index]!;
    rightNorm += right[index]! * right[index]!;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
