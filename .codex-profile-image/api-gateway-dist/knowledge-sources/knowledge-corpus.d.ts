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
export declare const DEFAULT_CORPUS_MAX_TOKENS = 60000;
export declare function buildKnowledgeCorpus(entries: KnowledgeCorpusEntry[], options?: {
    maxTokens?: number;
    prefilterQuery?: string;
}): KnowledgeCorpus;
/**
 * Shared source-text extraction (moved from knowledge-retrieval.service).
 * Чанки исторически хранились строками; ingestion (BAI-402+) пишет объекты
 * {content, offsets}. Поддерживаем оба вида — иначе document-источники немы.
 */
export declare function extractKnowledgeSourceText(source: KnowledgeSourceRecord, workspace: WorkspaceRepository, tenantId: string): Promise<string>;
/** Shared lexical primitives (moved from knowledge-retrieval.service; behavior unchanged). */
export declare function lexicalTerms(value: string): string[];
export declare function lexicalRelevance(query: string[], content: string): number;
export declare function estimateCorpusTokens(value: string): number;
