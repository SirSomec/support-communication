import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { isKnowledgeSourceRetrievalEligible, type KnowledgeSourceRecord } from "./knowledge-source.types.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { buildRetrievalCacheKey, KnowledgeRetrievalCache } from "./knowledge-retrieval-cache.js";
import { recordBotRetrieval } from "../automation/bot-observability.js";
import type { McpReadOnlyResult } from "./mcp-readonly-connector.service.js";

/** BAI-833: live read-only MCP call used as a knowledge source. Injected so tests never hit the network. */
export interface McpRetrievalInvoker {
  invoke(tenantId: string, connectorId: string, toolName: string, toolInput: Record<string, unknown>): Promise<McpReadOnlyResult>;
}

export interface KnowledgeRetrievalInput {
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
  passages: KnowledgeRetrievalPassage[];
  tokenBudget: number;
  tokensUsed: number;
}

/** Tenant- and scenario-bound lexical retrieval with an explicit provider token budget. */
export class KnowledgeRetrievalService {
  private readonly workspace: WorkspaceRepository;
  private readonly cache: KnowledgeRetrievalCache;

  constructor(
    private readonly sources = KnowledgeSourceRepository.default(),
    workspace?: WorkspaceRepository,
    cache?: KnowledgeRetrievalCache,
    private readonly mcpInvoker?: McpRetrievalInvoker
  ) {
    this.workspace = workspace ?? WorkspaceRepository.default();
    this.cache = cache ?? KnowledgeRetrievalCache.default();
  }

  async retrieve(input: KnowledgeRetrievalInput): Promise<KnowledgeRetrievalResult> {
    const budget = clampInteger(input.tokenBudget, 1_500, 100, 6_000);
    const scoreThreshold = Math.max(0.05, Number.isFinite(input.scoreThreshold) ? Number(input.scoreThreshold) : 0);
    const cacheKey = buildRetrievalCacheKey({
      query: input.query,
      scoreThreshold,
      sourceBindings: input.sourceBindings,
      tenantId: input.tenantId,
      tokenBudget: budget
    });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const hit = { cache: "hit" as const, ...cached };
      recordBotRetrieval({
        cache: "hit",
        passageCount: hit.passages.length,
        scenarioId: input.scenarioId,
        tenantId: input.tenantId,
        topScore: hit.passages[0]?.score
      });
      return hit;
    }

    const queryTerms = terms(input.query);
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
      const text = await sourceText(source, this.workspace, input.tenantId);
      for (const chunk of chunks(text)) {
        const score = relevance(queryTerms, chunk.content);
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
        const text = await sourceText(source, this.workspace, input.tenantId);
        const [chunk] = chunks(text);
        if (!chunk?.content) continue;
        const chunkTerms = terms(chunk.content);
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
    const result = { passages, tokenBudget: budget, tokensUsed };
    this.cache.set(cacheKey, result, {
      sourceIds: input.sourceBindings.map((binding) => binding.sourceId),
      tenantId: input.tenantId
    });
    recordBotRetrieval({
      cache: "miss",
      passageCount: passages.length,
      scenarioId: input.scenarioId,
      tenantId: input.tenantId,
      topScore: passages[0]?.score
    });
    return { cache: "miss", ...result };
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

async function sourceText(source: KnowledgeSourceRecord, workspace: WorkspaceRepository, tenantId: string): Promise<string> {
  // Чанки исторически хранились строками; ingestion (BAI-402+) пишет объекты
  // {content, offsets}. Поддерживаем оба вида — иначе document-источники немы.
  if (Array.isArray(source.metadata.chunks)) {
    return source.metadata.chunks
      .map((item) => typeof item === "string" ? item : String((item as { content?: unknown })?.content ?? ""))
      .filter(Boolean)
      .join("\n\n");
  }
  if (source.kind === "url") return String(source.metadata.extractedText ?? "");
  if (!source.sourceRef) return "";
  const article = await workspace.findKnowledgeArticle(source.sourceRef, { tenantId });
  return article?.status === "published" ? article.body : "";
}

function chunks(text: string): Array<{ content: string; endOffset: number; startOffset: number }> {
  const normalized = text.replace(/\s+/g, " ").trim(); const result = [];
  for (let start = 0; start < normalized.length; start += 1_200) {
    const end = Math.min(normalized.length, start + 1_500); result.push({ content: normalized.slice(start, end), endOffset: end, startOffset: start });
  }
  return result;
}
function relevance(query: string[], content: string): number { if (!query.length) return 0; const haystack = new Set(terms(content)); return query.filter((term) => haystack.has(term)).length / query.length; }
function terms(value: string): string[] { return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 32); }
function estimateTokens(value: string): number { return Math.max(1, Math.ceil(value.length / 4)); }
function clampInteger(value: unknown, fallback: number, min: number, max: number): number { const parsed = Number(value ?? fallback); return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
