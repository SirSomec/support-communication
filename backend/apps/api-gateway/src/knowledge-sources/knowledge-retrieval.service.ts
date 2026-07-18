import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { isKnowledgeSourceRetrievalEligible, type KnowledgeSourceRecord } from "./knowledge-source.types.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { buildRetrievalCacheKey, KnowledgeRetrievalCache } from "./knowledge-retrieval-cache.js";
import {
  buildKnowledgeCorpus,
  extractKnowledgeSourceText,
  lexicalRelevance,
  lexicalTerms,
  type KnowledgeCorpus,
  type KnowledgeCorpusEntry
} from "./knowledge-corpus.js";
import { recordBotRetrieval } from "../automation/bot-observability.js";
import type { McpReadOnlyResult } from "./mcp-readonly-connector.service.js";

/** BAI-833: live read-only MCP call used as a knowledge source. Injected so tests never hit the network. */
export interface McpRetrievalInvoker {
  invoke(tenantId: string, connectorId: string, toolName: string, toolInput: Record<string, unknown>): Promise<McpReadOnlyResult>;
}

/** BAI-874/875: LLM chunk selector. Injected so tests never hit the network; failures fall back to lexical. */
export interface LlmKnowledgeSearchResult {
  cachedTokens?: number;
  cacheWriteTokens?: number;
  passages: KnowledgeRetrievalPassage[];
}
export interface LlmKnowledgeSearchInvoker {
  search(input: { corpus: KnowledgeCorpus; query: string; scenarioId?: string; tenantId: string }): Promise<LlmKnowledgeSearchResult>;
}

/** Semantic embedding ranker. Injected so tests never hit the network; failures fall back to lexical. */
export interface SemanticKnowledgeSearchResult {
  passages: KnowledgeRetrievalPassage[];
}
export interface SemanticKnowledgeSearchInvoker {
  search(input: { corpus: KnowledgeCorpus; query: string; scenarioId?: string; tenantId: string }): Promise<SemanticKnowledgeSearchResult>;
}

export type KnowledgeRetrievalMode = "lexical" | "llm" | "semantic";

export interface KnowledgeRetrievalInput {
  /** BAI-875: retrieval strategy; "llm" needs an injected selector, otherwise silently stays lexical. */
  mode?: KnowledgeRetrievalMode;
  query: string;
  scenarioId?: string;
  /** BAI-843: минимальный lexical score фрагмента; ниже него доказательства недостаточны. */
  scoreThreshold?: number;
  sourceBindings: Array<{ sourceId: string; sourceVersion?: string }>;
  tenantId: string;
  tokenBudget?: number;
}

export interface KnowledgeRetrievalPassage {
  citation: { endOffset: number; sourceId: string; sourceVersion: number; startOffset: number; title: string };
  content: string;
  score: number;
}

export interface KnowledgeRetrievalResult {
  cache: "hit" | "miss";
  /** BAI-875: provider prompt-cache stats of the LLM selector call (absent for lexical). */
  cachedTokens?: number;
  cacheWriteTokens?: number;
  corpusTruncated?: boolean;
  /** BAI-875: set when mode="llm"/"semantic" failed and lexical answered instead. */
  fallbackReason?: string;
  mode: "lexical" | "llm" | "llm_fallback" | "semantic" | "semantic_fallback";
  passages: KnowledgeRetrievalPassage[];
  tokenBudget: number;
  tokensUsed: number;
}

/** Tenant- and scenario-bound retrieval with an explicit provider token budget: lexical by default, embedding ranker or LLM-selector by mode. */
export class KnowledgeRetrievalService {
  private readonly workspace: WorkspaceRepository;
  private readonly cache: KnowledgeRetrievalCache;

  constructor(
    private readonly sources = KnowledgeSourceRepository.default(),
    workspace?: WorkspaceRepository,
    cache?: KnowledgeRetrievalCache,
    private readonly mcpInvoker?: McpRetrievalInvoker,
    private readonly llmSearch?: LlmKnowledgeSearchInvoker,
    private readonly corpusMaxTokens: number | undefined = envCorpusMaxTokens(),
    private readonly semanticSearch?: SemanticKnowledgeSearchInvoker
  ) {
    this.workspace = workspace ?? WorkspaceRepository.default();
    this.cache = cache ?? KnowledgeRetrievalCache.default();
  }

  async retrieve(input: KnowledgeRetrievalInput): Promise<KnowledgeRetrievalResult> {
    const budget = clampInteger(input.tokenBudget, 1_500, 100, 6_000);
    const scoreThreshold = Math.max(0.05, Number.isFinite(input.scoreThreshold) ? Number(input.scoreThreshold) : 0);
    const mode: KnowledgeRetrievalMode = input.mode === "llm" && this.llmSearch
      ? "llm"
      : input.mode === "semantic" && this.semanticSearch ? "semantic" : "lexical";
    const cacheKey = buildRetrievalCacheKey({
      mode,
      query: input.query,
      scoreThreshold,
      sourceBindings: input.sourceBindings,
      tenantId: input.tenantId,
      tokenBudget: budget
    });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const hit = { cache: "hit" as const, ...cached, mode: cached.mode ?? "lexical" };
      recordBotRetrieval({
        cache: "hit",
        mode: hit.mode,
        passageCount: hit.passages.length,
        scenarioId: input.scenarioId,
        tenantId: input.tenantId,
        topScore: hit.passages[0]?.score
      });
      return hit;
    }

    let fallbackReason: string | undefined;
    let fallbackMode: "llm_fallback" | "semantic_fallback" | undefined;
    if (mode === "semantic") {
      try {
        const result = await this.semanticRetrieve(input, budget, scoreThreshold);
        // В отличие от LLM-селектора пустой семантический результат кешируем:
        // эмбеддинги детерминированы, пустота означает «в знаниях правда нет
        // близкого по смыслу», и повторный вызов вернул бы то же самое.
        this.cache.set(cacheKey, result, {
          sourceIds: input.sourceBindings.map((binding) => binding.sourceId),
          tenantId: input.tenantId
        });
        recordBotRetrieval({
          cache: "miss",
          mode: "semantic",
          passageCount: result.passages.length,
          scenarioId: input.scenarioId,
          tenantId: input.tenantId,
          topScore: result.passages[0]?.score
        });
        return { cache: "miss", ...result, mode: "semantic" };
      } catch (error) {
        // Сбой эмбеддингов (нет подключения, бюджет, таймаут провайдера) не
        // должен ронять бота: молча отвечаем лексикой, причина видна в trace.
        fallbackReason = error instanceof Error ? error.message : "semantic_retrieval_unavailable";
        fallbackMode = "semantic_fallback";
      }
    }
    if (mode === "llm") {
      try {
        const result = await this.llmRetrieve(input, budget);
        // Пустой выбор LLM не кэшируем: селектор недетерминирован, и разовый
        // пустой ответ модели иначе залипает на весь TTL «бот молчит по знаниям».
        if (result.passages.length) {
          this.cache.set(cacheKey, result, {
            sourceIds: input.sourceBindings.map((binding) => binding.sourceId),
            tenantId: input.tenantId
          });
        }
        recordBotRetrieval({
          cache: "miss",
          mode: "llm",
          passageCount: result.passages.length,
          scenarioId: input.scenarioId,
          tenantId: input.tenantId,
          topScore: result.passages[0]?.score
        });
        return { cache: "miss", ...result, mode: "llm" };
      } catch (error) {
        // Любой сбой селектора (нет подключения, бюджет, таймаут, кривой JSON)
        // не должен ронять бота: молча отвечаем лексикой, причина видна в trace.
        fallbackReason = error instanceof Error ? error.message : "llm_retrieval_unavailable";
        fallbackMode = "llm_fallback";
      }
    }

    const queryTerms = lexicalTerms(input.query);
    const candidates: KnowledgeRetrievalPassage[] = [];
    for (const binding of input.sourceBindings) {
      const source = await this.sources.find(input.tenantId, binding.sourceId);
      if (!source || !isKnowledgeSourceRetrievalEligible(source)) continue;
      if (binding.sourceVersion && String(source.version) !== binding.sourceVersion) continue;
      if (source.kind === "mcp") {
        const passage = await this.mcpPassage(source, input.query, input.tenantId);
        if (passage) candidates.push(passage);
        continue;
      }
      const text = await extractKnowledgeSourceText(source, this.workspace, input.tenantId);
      for (const chunk of chunks(text)) {
        const score = lexicalRelevance(queryTerms, chunk.content);
        if (score < scoreThreshold) continue;
        candidates.push({ citation: { endOffset: chunk.endOffset, sourceId: source.id, sourceVersion: source.version, startOffset: chunk.startOffset, title: source.title }, content: chunk.content, score });
      }
    }
    // Short/typoed queries can score 0 against ready sources; surface a lead chunk
    // so AI bots can answer instead of hard-failing with bot_ai_knowledge_not_ready.
    // Guarded by word-prefix overlap: без единого морфологически близкого слова
    // («доставка»/«доставку») это был бы ответ не по теме, а не ответ по знаниям.
    // Lead-chunk fallback уважает явный порог: при строгом policy-threshold мы не
    // подсовываем слабое совпадение — лучше честный handoff, чем ответ невпопад.
    const queryPrefixes = queryTerms.map((term) => term.slice(0, 4)).filter((prefix) => prefix.length >= 4);
    if (candidates.length === 0 && queryPrefixes.length > 0 && scoreThreshold <= 0.05) {
      for (const binding of input.sourceBindings) {
        const source = await this.sources.find(input.tenantId, binding.sourceId);
        if (!source || !isKnowledgeSourceRetrievalEligible(source)) continue;
        if (binding.sourceVersion && String(source.version) !== binding.sourceVersion) continue;
        const text = await extractKnowledgeSourceText(source, this.workspace, input.tenantId);
        const [chunk] = chunks(text);
        if (!chunk?.content) continue;
        const chunkTerms = lexicalTerms(chunk.content);
        if (!chunkTerms.some((term) => queryPrefixes.some((prefix) => term.startsWith(prefix)))) continue;
        candidates.push({
          citation: {
            endOffset: chunk.endOffset,
            sourceId: source.id,
            sourceVersion: source.version,
            startOffset: chunk.startOffset,
            title: source.title
          },
          content: chunk.content,
          score: 0.01
        });
        break;
      }
    }
    candidates.sort((a, b) => b.score - a.score || a.citation.sourceId.localeCompare(b.citation.sourceId) || a.citation.startOffset - b.citation.startOffset);
    const passages: KnowledgeRetrievalPassage[] = []; let tokensUsed = 0;
    for (const candidate of candidates) {
      const tokens = estimateTokens(candidate.content);
      if (tokensUsed + tokens > budget) continue;
      passages.push(candidate); tokensUsed += tokens;
      if (passages.length >= 8) break;
    }
    const result = {
      ...(fallbackReason && fallbackMode ? { fallbackReason, mode: fallbackMode } : { mode: "lexical" as const }),
      passages,
      tokenBudget: budget,
      tokensUsed
    };
    this.cache.set(cacheKey, result, {
      sourceIds: input.sourceBindings.map((binding) => binding.sourceId),
      tenantId: input.tenantId
    });
    recordBotRetrieval({
      cache: "miss",
      mode: result.mode,
      passageCount: passages.length,
      scenarioId: input.scenarioId,
      tenantId: input.tenantId,
      topScore: passages[0]?.score
    });
    return { cache: "miss", ...result };
  }

  /**
   * BAI-874/875: LLM-selector strategy. Строит детерминированный корпус из
   * привязанных источников (MCP-источники остаются живыми вызовами и
   * добавляются отдельными пассажами) и спрашивает дорогую модель, какие чанки
   * отвечают на вопрос. Пустой корпус без MCP — валидный «нет знаний», не сбой.
   */
  private async llmRetrieve(input: KnowledgeRetrievalInput, budget: number): Promise<Omit<KnowledgeRetrievalResult, "cache">> {
    const entries: KnowledgeCorpusEntry[] = [];
    const mcpPassages: KnowledgeRetrievalPassage[] = [];
    for (const binding of input.sourceBindings) {
      const source = await this.sources.find(input.tenantId, binding.sourceId);
      if (!source || !isKnowledgeSourceRetrievalEligible(source)) continue;
      if (binding.sourceVersion && String(source.version) !== binding.sourceVersion) continue;
      if (source.kind === "mcp") {
        const passage = await this.mcpPassage(source, input.query, input.tenantId);
        if (passage) mcpPassages.push(passage);
        continue;
      }
      const text = await extractKnowledgeSourceText(source, this.workspace, input.tenantId);
      if (text.trim()) entries.push({ source, text });
    }
    const corpus = buildKnowledgeCorpus(entries, { maxTokens: this.corpusMaxTokens, prefilterQuery: input.query });
    const llm = corpus.chunks.length
      ? await this.llmSearch!.search({ corpus, query: input.query, scenarioId: input.scenarioId, tenantId: input.tenantId })
      : { passages: [] as KnowledgeRetrievalPassage[] };
    const passages: KnowledgeRetrievalPassage[] = []; let tokensUsed = 0;
    for (const candidate of [...llm.passages, ...mcpPassages]) {
      const tokens = estimateTokens(candidate.content);
      if (tokensUsed + tokens > budget) continue;
      passages.push(candidate); tokensUsed += tokens;
      if (passages.length >= 8) break;
    }
    return {
      ...(llm.cachedTokens === undefined ? {} : { cachedTokens: llm.cachedTokens }),
      ...(llm.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: llm.cacheWriteTokens }),
      ...(corpus.truncated ? { corpusTruncated: true } : {}),
      mode: "llm",
      passages,
      tokenBudget: budget,
      tokensUsed
    };
  }

  /**
   * Семантическая стратегия: эмбеддинг-ранжирование корпуса вместо чтения его
   * дорогой моделью. Чанки эмбеддятся один раз (кеш по контент-хешу в
   * SemanticKnowledgeSearchService), на запрос тратится только вектор вопроса.
   * Отсев здесь агрессивнее лексического: абсолютный порог плюс относительный
   * (доля от лучшего скора) — боту уходит несколько действительно близких
   * чанков, а не всё, что формально пролезло в токен-бюджет.
   */
  private async semanticRetrieve(input: KnowledgeRetrievalInput, budget: number, scoreThreshold: number): Promise<Omit<KnowledgeRetrievalResult, "cache">> {
    const entries: KnowledgeCorpusEntry[] = [];
    const mcpPassages: KnowledgeRetrievalPassage[] = [];
    for (const binding of input.sourceBindings) {
      const source = await this.sources.find(input.tenantId, binding.sourceId);
      if (!source || !isKnowledgeSourceRetrievalEligible(source)) continue;
      if (binding.sourceVersion && String(source.version) !== binding.sourceVersion) continue;
      if (source.kind === "mcp") {
        const passage = await this.mcpPassage(source, input.query, input.tenantId);
        if (passage) mcpPassages.push(passage);
        continue;
      }
      const text = await extractKnowledgeSourceText(source, this.workspace, input.tenantId);
      if (text.trim()) entries.push({ source, text });
    }
    const corpus = buildKnowledgeCorpus(entries, { maxTokens: this.corpusMaxTokens, prefilterQuery: input.query });
    const semantic = corpus.chunks.length
      ? await this.semanticSearch!.search({ corpus, query: input.query, scenarioId: input.scenarioId, tenantId: input.tenantId })
      : { passages: [] as KnowledgeRetrievalPassage[] };
    const ranked = [...semantic.passages].sort((a, b) => b.score - a.score || a.citation.sourceId.localeCompare(b.citation.sourceId) || a.citation.startOffset - b.citation.startOffset);
    // Гибридный скор фонового шума держится ниже ~0.2 даже при частичном
    // словесном совпадении, поэтому дефолтный порог выше лексического 0.05;
    // явный policy-threshold может только ужесточить отсев.
    const minScore = Math.max(SEMANTIC_MIN_SCORE, scoreThreshold);
    const topScore = ranked[0]?.score ?? 0;
    const relevant = ranked.filter((passage) => passage.score >= minScore && passage.score >= topScore * SEMANTIC_RELATIVE_CUTOFF);
    const passages: KnowledgeRetrievalPassage[] = []; let tokensUsed = 0;
    for (const candidate of [...relevant, ...mcpPassages]) {
      const tokens = estimateTokens(candidate.content);
      if (tokensUsed + tokens > budget) continue;
      passages.push(candidate); tokensUsed += tokens;
      if (passages.length >= SEMANTIC_MAX_PASSAGES) break;
    }
    return {
      ...(corpus.truncated ? { corpusTruncated: true } : {}),
      mode: "semantic",
      passages,
      tokenBudget: budget,
      tokensUsed
    };
  }

  /**
   * BAI-833: MCP-источник — живой read-only вызов. Ошибка/таймаут даёт пустой
   * результат (отсутствие доказательств → handoff), а не выдуманный ответ.
   */
  private async mcpPassage(source: KnowledgeSourceRecord, query: string, tenantId: string): Promise<KnowledgeRetrievalPassage | null> {
    if (!this.mcpInvoker) return null;
    const connectorId = String(source.sourceConfig.connectorId ?? "").trim();
    const toolName = String(source.sourceConfig.tool ?? source.sourceConfig.toolName ?? "").trim();
    if (!connectorId || !toolName) return null;
    try {
      const result = await this.mcpInvoker.invoke(tenantId, connectorId, toolName, { query });
      if (!result.ok || !result.result.content.trim()) return null;
      const content = result.result.content.trim().slice(0, 4_000);
      return {
        citation: { endOffset: content.length, sourceId: source.id, sourceVersion: source.version, startOffset: 0, title: `MCP: ${source.title}` },
        content,
        score: 0.9
      };
    } catch {
      return null;
    }
  }
}

/** Экономия контекста бота: ниже этого гибридного скора чанк — шум, не знание. */
const SEMANTIC_MIN_SCORE = 0.2;
/** Чанки заметно слабее лучшего не передаются, даже если проходят абсолютный порог. */
const SEMANTIC_RELATIVE_CUTOFF = 0.6;
/** Жёстче лексических 8: семантический топ либо отвечает первыми чанками, либо не отвечает вовсе. */
const SEMANTIC_MAX_PASSAGES = 6;

function chunks(text: string): Array<{ content: string; endOffset: number; startOffset: number }> {
  const normalized = text.replace(/\s+/g, " ").trim(); const result = [];
  for (let start = 0; start < normalized.length; start += 1_200) {
    const end = Math.min(normalized.length, start + 1_500); result.push({ content: normalized.slice(start, end), endOffset: end, startOffset: start });
  }
  return result;
}
function estimateTokens(value: string): number { return Math.max(1, Math.ceil(value.length / 4)); }
function envCorpusMaxTokens(): number | undefined { const parsed = Number(process.env.RETRIEVAL_CORPUS_MAX_TOKENS); return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined; }
function clampInteger(value: unknown, fallback: number, min: number, max: number): number { const parsed = Number(value ?? fallback); return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
