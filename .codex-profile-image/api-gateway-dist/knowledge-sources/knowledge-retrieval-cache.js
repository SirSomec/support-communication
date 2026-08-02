/** Tenant + source-revision keyed cache for retrieval results. Never a substitute for policy checks. */
export class KnowledgeRetrievalCache {
    ttlMs;
    now;
    entries = new Map();
    metrics = { hits: 0, misses: 0, purges: 0 };
    static shared = null;
    constructor(ttlMs = 5 * 60_000, now = Date.now) {
        this.ttlMs = ttlMs;
        this.now = now;
    }
    static default() {
        if (!KnowledgeRetrievalCache.shared) {
            KnowledgeRetrievalCache.shared = new KnowledgeRetrievalCache();
        }
        return KnowledgeRetrievalCache.shared;
    }
    static clearDefault() {
        KnowledgeRetrievalCache.shared = null;
    }
    static useDefault(cache) {
        KnowledgeRetrievalCache.shared = cache;
    }
    get(key) {
        const entry = this.entries.get(key);
        if (!entry) {
            this.metrics.misses += 1;
            return null;
        }
        if (entry.expiresAt <= this.now()) {
            this.entries.delete(key);
            this.metrics.misses += 1;
            this.metrics.purges += 1;
            return null;
        }
        this.metrics.hits += 1;
        return clone(entry.value);
    }
    set(key, value, meta) {
        this.entries.set(key, {
            expiresAt: this.now() + this.ttlMs,
            sourceIds: [...new Set(meta.sourceIds)].sort(),
            tenantId: meta.tenantId,
            value: clone(value)
        });
    }
    purgeTenant(tenantId) {
        return this.purgeWhere((entry) => entry.tenantId === tenantId);
    }
    purgeSource(tenantId, sourceId) {
        return this.purgeWhere((entry) => entry.tenantId === tenantId && entry.sourceIds.includes(sourceId));
    }
    clear() {
        const size = this.entries.size;
        this.entries.clear();
        this.metrics.purges += size;
    }
    purgeWhere(predicate) {
        let removed = 0;
        for (const [key, entry] of this.entries) {
            if (!predicate(entry))
                continue;
            this.entries.delete(key);
            removed += 1;
        }
        this.metrics.purges += removed;
        return removed;
    }
}
export function buildRetrievalCacheKey(input) {
    const bindings = [...input.sourceBindings]
        .map((binding) => `${binding.sourceId}@${binding.sourceVersion ?? "*"}`)
        .sort((left, right) => left.localeCompare(right))
        .join(",");
    const normalizedQuery = [...new Set(input.query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])]
        .sort((left, right) => left.localeCompare(right))
        .join(" ");
    const scoreThreshold = Number.isFinite(input.scoreThreshold)
        ? Math.max(0.05, Number(input.scoreThreshold))
        : 0.05;
    return `kr:v3:${input.tenantId}:${input.mode ?? "lexical"}:${bindings}:${input.tokenBudget}:${scoreThreshold}:${normalizedQuery}`;
}
function clone(value) {
    return structuredClone(value);
}
//# sourceMappingURL=knowledge-retrieval-cache.js.map