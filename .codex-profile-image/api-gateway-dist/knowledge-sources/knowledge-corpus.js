import { createHash } from "node:crypto";
import { ingestKnowledgeDocument } from "./document-ingestion.js";
export const DEFAULT_CORPUS_MAX_TOKENS = 60_000;
export function buildKnowledgeCorpus(entries, options = {}) {
    const maxTokens = clampInteger(options.maxTokens, DEFAULT_CORPUS_MAX_TOKENS, 1_000, 200_000);
    const ordered = [...entries].sort((a, b) => a.source.id.localeCompare(b.source.id));
    let chunks = [];
    for (const entry of ordered) {
        const prepared = ingestKnowledgeDocument(entry.text, { chunkChars: 1_200 });
        if (!prepared)
            continue;
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
        const kept = [];
        let used = 0;
        for (const { chunk } of scored) {
            const tokens = estimateCorpusTokens(chunk.content);
            if (used + tokens > maxTokens)
                continue;
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
export async function extractKnowledgeSourceText(source, workspace, tenantId) {
    if (Array.isArray(source.metadata.chunks)) {
        return source.metadata.chunks
            .map((item) => typeof item === "string" ? item : String(item?.content ?? ""))
            .filter(Boolean)
            .join("\n\n");
    }
    if (source.kind === "url")
        return String(source.metadata.extractedText ?? "");
    if (!source.sourceRef)
        return "";
    const article = await workspace.findKnowledgeArticle(source.sourceRef, { tenantId });
    return article?.status === "published" ? article.body : "";
}
/** Shared lexical primitives (moved from knowledge-retrieval.service; behavior unchanged). */
export function lexicalTerms(value) {
    return [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 32);
}
export function lexicalRelevance(query, content) {
    if (!query.length)
        return 0;
    const haystack = new Set(lexicalTerms(content));
    return query.filter((term) => haystack.has(term)).length / query.length;
}
export function estimateCorpusTokens(value) {
    return Math.max(1, Math.ceil(value.length / 4));
}
function totalTokens(chunks) {
    return chunks.reduce((sum, chunk) => sum + estimateCorpusTokens(chunk.content), 0);
}
function clampInteger(value, fallback, min, max) {
    const parsed = Number(value ?? fallback);
    return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
//# sourceMappingURL=knowledge-corpus.js.map