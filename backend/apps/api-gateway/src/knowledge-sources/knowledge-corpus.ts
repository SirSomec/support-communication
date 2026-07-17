import { createHash } from "node:crypto";
import { ingestKnowledgeDocument } from "./document-ingestion.js";
import type { KnowledgeSourceRecord } from "./knowledge-source.types.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";

/**
 * BAI-873: deterministic knowledge corpus for LLM retrieval.  The corpus text
 * is the provider-cached prompt prefix, so byte stability between calls is a
 * hard requirement: sources are ordered by id, versions are pinned in the
 * header, and chunk ids are derived from stable source ids + positions.
 */
export interface KnowledgeCorpusChunk {
  chunkId: string;
  content: string;
  endOffset: number;
  sourceId: string;
  sourceVersion: number;
  startOffset: number;
  title: string;
}

export interface KnowledgeCorpus {
  checksum: string;
  chunks: KnowledgeCorpusChunk[];
  promptText: string;
  tokenEstimate: number;
  /** True when the corpus exceeded the token ceiling and was query-prefiltered (provider cache degrades). */
  truncated: boolean;
}

export interface KnowledgeCorpusEntry {
  source: Pick<KnowledgeSourceRecord, "id" | "title" | "version">;
  text: string;
}

export const DEFAULT_CORPUS_MAX_TOKENS = 60_000;

export function buildKnowledgeCorpus(
  entries: KnowledgeCorpusEntry[],
  options: { maxTokens?: number; prefilterQuery?: string } = {}
): KnowledgeCorpus {
  const maxTokens = clampInteger(options.maxTokens, DEFAULT_CORPUS_MAX_TOKENS, 1_000, 200_000);
  const ordered = [...entries].sort((a, b) => a.source.id.localeCompare(b.source.id));
  let chunks: KnowledgeCorpusChunk[] = [];
  for (const entry of ordered) {
    const prepared = ingestKnowledgeDocument(entry.text, { chunkChars: 1_200 });
    if (!prepared) continue;
    for (const [index, chunk] of prepared.chunks.entries()) {
      chunks.push({
        chunkId: `c:${entry.source.id}:${index + 1}`,
        content: chunk.content,
        endOffset: chunk.endOffset,
        sourceId: entry.source.id,
        sourceVersion: entry.source.version,
        startOffset: chunk.startOffset,
        title: entry.source.title
      });
    }
  }

  let truncated = false;
  if (totalTokens(chunks) > maxTokens) {
    // Над потолком корпус фильтруется ПОД ВОПРОС — префикс становится
    // запрос-зависимым и провайдерский кеш на таких корпусах не переиспользуется
    // между вопросами. Это осознанная деградация для сверхбольших баз (см. план
    // 2026-07-17): честный флаг truncated виден в trace и результате retrieval.
    truncated = true;
    const queryTerms = lexicalTerms(options.prefilterQuery ?? "");
    const scored = chunks
      .map((chunk) => ({ chunk, score: lexicalRelevance(queryTerms, chunk.content) }))
      .sort((a, b) => b.score - a.score || a.chunk.sourceId.localeCompare(b.chunk.sourceId) || a.chunk.startOffset - b.chunk.startOffset);
    const kept: KnowledgeCorpusChunk[] = [];
    let used = 0;
    for (const { chunk } of scored) {
      const tokens = estimateCorpusTokens(chunk.content);
      if (used + tokens > maxTokens) continue;
      kept.push(chunk);
      used += tokens;
    }
    chunks = kept.sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.startOffset - b.startOffset);
  }

  const header = `Knowledge corpus, sources: ${ordered.map((entry) => `${entry.source.id}@v${entry.source.version}`).join(", ") || "none"}.`;
  const promptText = [header, ...chunks.map((chunk) => `[${chunk.chunkId}] ${chunk.content}`)].join("\n");
  return {
    checksum: createHash("sha256").update(promptText).digest("hex"),
    chunks,
    promptText,
    tokenEstimate: estimateCorpusTokens(promptText),
    truncated
  };
}

/**
 * Shared source-text extraction (moved from knowledge-retrieval.service).
 * Чанки исторически хранились строками; ingestion (BAI-402+) пишет объекты
 * {content, offsets}. Поддерживаем оба вида — иначе document-источники немы.
 */
export async function extractKnowledgeSourceText(
  source: KnowledgeSourceRecord,
  workspace: WorkspaceRepository,
  tenantId: string
): Promise<string> {
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

/** Shared lexical primitives (moved from knowledge-retrieval.service; behavior unchanged). */
export function lexicalTerms(value: string): string[] {
  return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 32);
}

export function lexicalRelevance(query: string[], content: string): number {
  if (!query.length) return 0;
  const haystack = new Set(lexicalTerms(content));
  return query.filter((term) => haystack.has(term)).length / query.length;
}

export function estimateCorpusTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function totalTokens(chunks: KnowledgeCorpusChunk[]): number {
  return chunks.reduce((sum, chunk) => sum + estimateCorpusTokens(chunk.content), 0);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
