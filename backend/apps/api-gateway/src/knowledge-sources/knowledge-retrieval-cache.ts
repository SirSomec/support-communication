export interface RetrievalCacheMetrics {
  hits: number;
  misses: number;
  purges: number;
}

export interface RetrievalCacheValue {
  /** BAI-875: LLM-selector metadata; absent for lexical results. */
  cachedTokens?: number;
  cacheWriteTokens?: number;
  corpusTruncated?: boolean;
  fallbackReason?: string;
  mode?: "lexical" | "llm" | "llm_fallback" | "semantic" | "semantic_fallback";
  passages: Array<{
    citation: { endOffset: number; sourceId: string; sourceVersion: number; startOffset: number; title: string };
    content: string;
    score: number;
  }>;
  tokenBudget: number;
  tokensUsed: number;
}

interface RetrievalCacheEntry {
  expiresAt: number;
  sourceIds: string[];
  tenantId: string;
  value: RetrievalCacheValue;
}

export interface RetrievalCacheKeyInput {
  /** BAI-875: retrieval strategy; different strategies never share a cache entry. */
  mode?: "lexical" | "llm" | "semantic";
  query: string;
  scoreThreshold?: number;
  sourceBindings: Array<{ sourceId: string; sourceVersion?: string }>;
  tenantId: string;
  tokenBudget: number;
}

/** Tenant + source-revision keyed cache for retrieval results. Never a substitute for policy checks. */
export class KnowledgeRetrievalCache {
  private readonly entries = new Map<string, RetrievalCacheEntry>();
  readonly metrics: RetrievalCacheMetrics = { hits: 0, misses: 0, purges: 0 };
  private static shared: KnowledgeRetrievalCache | null = null;

  constructor(private readonly ttlMs = 5 * 60_000, private readonly now: () => number = Date.now) {}

  static default(): KnowledgeRetrievalCache {
    if (!KnowledgeRetrievalCache.shared) {
      KnowledgeRetrievalCache.shared = new KnowledgeRetrievalCache();
    }
    return KnowledgeRetrievalCache.shared;
  }

  static clearDefault(): void {
    KnowledgeRetrievalCache.shared = null;
  }

  static useDefault(cache: KnowledgeRetrievalCache | null): void {
    KnowledgeRetrievalCache.shared = cache;
  }

  get(key: string): RetrievalCacheValue | null {
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

  set(key: string, value: RetrievalCacheValue, meta: { sourceIds: string[]; tenantId: string }): void {
    this.entries.set(key, {
      expiresAt: this.now() + this.ttlMs,
      sourceIds: [...new Set(meta.sourceIds)].sort(),
      tenantId: meta.tenantId,
      value: clone(value)
    });
  }

  purgeTenant(tenantId: string): number {
    return this.purgeWhere((entry) => entry.tenantId === tenantId);
  }

  purgeSource(tenantId: string, sourceId: string): number {
    return this.purgeWhere((entry) => entry.tenantId === tenantId && entry.sourceIds.includes(sourceId));
  }

  clear(): void {
    const size = this.entries.size;
    this.entries.clear();
    this.metrics.purges += size;
  }

  private purgeWhere(predicate: (entry: RetrievalCacheEntry) => boolean): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (!predicate(entry)) continue;
      this.entries.delete(key);
      removed += 1;
    }
    this.metrics.purges += removed;
    return removed;
  }
}

export function buildRetrievalCacheKey(input: RetrievalCacheKeyInput): string {
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

function clone<T>(value: T): T {
  return structuredClone(value);
}
