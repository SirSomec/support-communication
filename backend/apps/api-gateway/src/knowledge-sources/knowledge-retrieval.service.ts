import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { isKnowledgeSourceRetrievalEligible } from "./knowledge-source.types.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { buildRetrievalCacheKey, KnowledgeRetrievalCache } from "./knowledge-retrieval-cache.js";
import { recordBotRetrieval } from "../automation/bot-observability.js";

export interface KnowledgeRetrievalInput {
  query: string;
  scenarioId?: string;
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
    cache?: KnowledgeRetrievalCache
  ) {
    this.workspace = workspace ?? WorkspaceRepository.default();
    this.cache = cache ?? KnowledgeRetrievalCache.default();
  }

  async retrieve(input: KnowledgeRetrievalInput): Promise<KnowledgeRetrievalResult> {
    const budget = clampInteger(input.tokenBudget, 1_500, 100, 6_000);
    const cacheKey = buildRetrievalCacheKey({
      query: input.query,
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
      const source = this.sources.find(input.tenantId, binding.sourceId);
      if (!source || !isKnowledgeSourceRetrievalEligible(source)) continue;
      if (binding.sourceVersion && String(source.version) !== binding.sourceVersion) continue;
      const text = await sourceText(source, this.workspace, input.tenantId);
      for (const chunk of chunks(text)) {
        const score = relevance(queryTerms, chunk.content);
        if (score < 0.05) continue;
        candidates.push({ citation: { endOffset: chunk.endOffset, sourceId: source.id, sourceVersion: source.version, startOffset: chunk.startOffset, title: source.title }, content: chunk.content, score });
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
}

async function sourceText(source: ReturnType<KnowledgeSourceRepository["find"]> & {}, workspace: WorkspaceRepository, tenantId: string): Promise<string> {
  if (Array.isArray(source.metadata.chunks)) return source.metadata.chunks.map((item) => typeof item === "string" ? item : "").filter(Boolean).join("\n\n");
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
