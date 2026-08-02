import { KnowledgeSourceRepository } from "./knowledge-source.repository.js";
import { isKnowledgeSourceRetrievalEligible } from "./knowledge-source.types.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { buildRetrievalCacheKey, KnowledgeRetrievalCache } from "./knowledge-retrieval-cache.js";
import { buildKnowledgeCorpus, extractKnowledgeSourceText, lexicalRelevance, lexicalTerms } from "./knowledge-corpus.js";
import { recordBotRetrieval } from "../automation/bot-observability.js";
/** Tenant- and scenario-bound retrieval with an explicit provider token budget: lexical by default, embedding ranker or LLM-selector by mode. */
export class KnowledgeRetrievalService {
    sources;
    mcpInvoker;
    llmSearch;
    corpusMaxTokens;
    semanticSearch;
    workspace;
    cache;
    constructor(sources = KnowledgeSourceRepository.default(), workspace, cache, mcpInvoker, llmSearch, corpusMaxTokens = envCorpusMaxTokens(), semanticSearch) {
        this.sources = sources;
        this.mcpInvoker = mcpInvoker;
        this.llmSearch = llmSearch;
        this.corpusMaxTokens = corpusMaxTokens;
        this.semanticSearch = semanticSearch;
        this.workspace = workspace ?? WorkspaceRepository.default();
        this.cache = cache ?? KnowledgeRetrievalCache.default();
    }
    async retrieve(input) {
        const budget = clampInteger(input.tokenBudget, 1_500, 100, 6_000);
        const scoreThreshold = Math.max(0.05, Number.isFinite(input.scoreThreshold) ? Number(input.scoreThreshold) : 0);
        const mode = input.mode === "llm" && this.llmSearch
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
            const hit = { cache: "hit", ...cached, mode: cached.mode ?? "lexical" };
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
        let fallbackReason;
        let fallbackMode;
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
            }
            catch (error) {
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
            }
            catch (error) {
                // Любой сбой селектора (нет подключения, бюджет, таймаут, кривой JSON)
                // не должен ронять бота: молча отвечаем лексикой, причина видна в trace.
                fallbackReason = error instanceof Error ? error.message : "llm_retrieval_unavailable";
                fallbackMode = "llm_fallback";
            }
        }
        const queryTerms = lexicalTerms(input.query);
        const candidates = [];
        for (const binding of input.sourceBindings) {
            const source = await this.sources.find(input.tenantId, binding.sourceId);
            if (!source || !isKnowledgeSourceRetrievalEligible(source))
                continue;
            if (binding.sourceVersion && String(source.version) !== binding.sourceVersion)
                continue;
            if (source.kind === "mcp") {
                const passage = await this.mcpPassage(source, input.query, input.tenantId);
                if (passage)
                    candidates.push(passage);
                continue;
            }
            const text = await extractKnowledgeSourceText(source, this.workspace, input.tenantId);
            for (const chunk of chunks(text)) {
                const score = lexicalRelevance(queryTerms, chunk.content);
                if (score < scoreThreshold)
                    continue;
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
                if (!source || !isKnowledgeSourceRetrievalEligible(source))
                    continue;
                if (binding.sourceVersion && String(source.version) !== binding.sourceVersion)
                    continue;
                const text = await extractKnowledgeSourceText(source, this.workspace, input.tenantId);
                const [chunk] = chunks(text);
                if (!chunk?.content)
                    continue;
                const chunkTerms = lexicalTerms(chunk.content);
                if (!chunkTerms.some((term) => queryPrefixes.some((prefix) => term.startsWith(prefix))))
                    continue;
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
        const passages = [];
        let tokensUsed = 0;
        for (const candidate of candidates) {
            const tokens = estimateTokens(candidate.content);
            if (tokensUsed + tokens > budget)
                continue;
            passages.push(candidate);
            tokensUsed += tokens;
            if (passages.length >= 8)
                break;
        }
        const result = {
            ...(fallbackReason && fallbackMode ? { fallbackReason, mode: fallbackMode } : { mode: "lexical" }),
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
    async llmRetrieve(input, budget) {
        const entries = [];
        const mcpPassages = [];
        for (const binding of input.sourceBindings) {
            const source = await this.sources.find(input.tenantId, binding.sourceId);
            if (!source || !isKnowledgeSourceRetrievalEligible(source))
                continue;
            if (binding.sourceVersion && String(source.version) !== binding.sourceVersion)
                continue;
            if (source.kind === "mcp") {
                const passage = await this.mcpPassage(source, input.query, input.tenantId);
                if (passage)
                    mcpPassages.push(passage);
                continue;
            }
            const text = await extractKnowledgeSourceText(source, this.workspace, input.tenantId);
            if (text.trim())
                entries.push({ source, text });
        }
        const corpus = buildKnowledgeCorpus(entries, { maxTokens: this.corpusMaxTokens, prefilterQuery: input.query });
        const llm = corpus.chunks.length
            ? await this.llmSearch.search({ corpus, query: input.query, scenarioId: input.scenarioId, tenantId: input.tenantId })
            : { passages: [] };
        const passages = [];
        let tokensUsed = 0;
        for (const candidate of [...llm.passages, ...mcpPassages]) {
            const tokens = estimateTokens(candidate.content);
            if (tokensUsed + tokens > budget)
                continue;
            passages.push(candidate);
            tokensUsed += tokens;
            if (passages.length >= 8)
                break;
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
    async semanticRetrieve(input, budget, scoreThreshold) {
        const entries = [];
        const mcpPassages = [];
        for (const binding of input.sourceBindings) {
            const source = await this.sources.find(input.tenantId, binding.sourceId);
            if (!source || !isKnowledgeSourceRetrievalEligible(source))
                continue;
            if (binding.sourceVersion && String(source.version) !== binding.sourceVersion)
                continue;
            if (source.kind === "mcp") {
                const passage = await this.mcpPassage(source, input.query, input.tenantId);
                if (passage)
                    mcpPassages.push(passage);
                continue;
            }
            const text = await extractKnowledgeSourceText(source, this.workspace, input.tenantId);
            if (text.trim())
                entries.push({ source, text });
        }
        const corpus = buildKnowledgeCorpus(entries, { maxTokens: this.corpusMaxTokens, prefilterQuery: input.query });
        const semantic = corpus.chunks.length
            ? await this.semanticSearch.search({ corpus, query: input.query, scenarioId: input.scenarioId, tenantId: input.tenantId })
            : { passages: [] };
        const ranked = [...semantic.passages].sort((a, b) => b.score - a.score || a.citation.sourceId.localeCompare(b.citation.sourceId) || a.citation.startOffset - b.citation.startOffset);
        // Гибридный скор фонового шума держится ниже ~0.2 даже при частичном
        // словесном совпадении, поэтому дефолтный порог выше лексического 0.05;
        // явный policy-threshold может только ужесточить отсев.
        const minScore = Math.max(SEMANTIC_MIN_SCORE, scoreThreshold);
        const topScore = ranked[0]?.score ?? 0;
        const relevant = ranked.filter((passage) => passage.score >= minScore && passage.score >= topScore * SEMANTIC_RELATIVE_CUTOFF);
        const passages = [];
        let tokensUsed = 0;
        for (const candidate of [...relevant, ...mcpPassages]) {
            const tokens = estimateTokens(candidate.content);
            if (tokensUsed + tokens > budget)
                continue;
            passages.push(candidate);
            tokensUsed += tokens;
            if (passages.length >= SEMANTIC_MAX_PASSAGES)
                break;
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
    async mcpPassage(source, query, tenantId) {
        if (!this.mcpInvoker)
            return null;
        const connectorId = String(source.sourceConfig.connectorId ?? "").trim();
        const toolName = String(source.sourceConfig.tool ?? source.sourceConfig.toolName ?? "").trim();
        if (!connectorId || !toolName)
            return null;
        try {
            const result = await this.mcpInvoker.invoke(tenantId, connectorId, toolName, { query });
            if (!result.ok || !result.result.content.trim())
                return null;
            const content = result.result.content.trim().slice(0, 4_000);
            return {
                citation: { endOffset: content.length, sourceId: source.id, sourceVersion: source.version, startOffset: 0, title: `MCP: ${source.title}` },
                content,
                score: 0.9
            };
        }
        catch {
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
function chunks(text) {
    const normalized = text.replace(/\s+/g, " ").trim();
    const result = [];
    for (let start = 0; start < normalized.length; start += 1_200) {
        const end = Math.min(normalized.length, start + 1_500);
        result.push({ content: normalized.slice(start, end), endOffset: end, startOffset: start });
    }
    return result;
}
function estimateTokens(value) { return Math.max(1, Math.ceil(value.length / 4)); }
function envCorpusMaxTokens() { const parsed = Number(process.env.RETRIEVAL_CORPUS_MAX_TOKENS); return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined; }
function clampInteger(value, fallback, min, max) { const parsed = Number(value ?? fallback); return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
//# sourceMappingURL=knowledge-retrieval.service.js.map