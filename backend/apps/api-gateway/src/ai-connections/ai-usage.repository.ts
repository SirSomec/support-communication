import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";

export interface AiUsageRecord { activeRequests?: number; connectionId: string; month: string; requestTimes: string[]; tenantId: string; usedTokens: number; }
interface AiUsageState { records: AiUsageRecord[]; }
let defaultRepository: AiUsageRepository | null = null;

/** Durable, tenant-scoped counter used before a provider request is made. */
export class AiUsageRepository {
  constructor(private readonly store: DurableStore<AiUsageState>) {}
  static default(): AiUsageRepository {
    if (!defaultRepository) defaultRepository = new AiUsageRepository(new JsonFileStore({ filePath: process.env.AI_USAGE_STORE_FILE ?? ".runtime/ai-usage.json", seed: { records: [] } }));
    return defaultRepository;
  }
  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: AiUsageState = { records: [] }): AiUsageRepository { return new AiUsageRepository(new InMemoryStore(seed)); }
  reserve(input: { connectionId: string; maxConcurrentRuns?: number; monthlyTokenBudget?: number; now?: Date; requestsPerMinute?: number; tenantId: string; worstCaseTokens: number }): () => void {
    const now = input.now ?? new Date(); const month = now.toISOString().slice(0, 7); const cutoff = now.getTime() - 60_000; let failure: string | null = null;
    this.store.update((state) => {
      const records = state.records.map((record) => ({ ...record, requestTimes: record.requestTimes.filter((value) => Date.parse(value) >= cutoff) }));
      const index = records.findIndex((record) => record.tenantId === input.tenantId && record.connectionId === input.connectionId && record.month === month);
      const current = index >= 0 ? records[index]! : { connectionId: input.connectionId, month, requestTimes: [], tenantId: input.tenantId, usedTokens: 0 };
      if (input.maxConcurrentRuns && (current.activeRequests ?? 0) >= input.maxConcurrentRuns) failure = "bot_ai_concurrency_limit_reached";
      if (!failure && input.requestsPerMinute && current.requestTimes.length >= input.requestsPerMinute) failure = "bot_ai_rate_limit_reached";
      if (!failure && input.monthlyTokenBudget && current.usedTokens + input.worstCaseTokens > input.monthlyTokenBudget) failure = "bot_ai_quota_exhausted";
      if (failure) return { records };
      const next = { ...current, activeRequests: (current.activeRequests ?? 0) + 1, requestTimes: [...current.requestTimes, now.toISOString()] };
      return { records: index >= 0 ? records.map((record, itemIndex) => itemIndex === index ? next : record) : [...records, next] };
    });
    if (failure) throw new Error(failure);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.store.update((state) => ({ records: state.records.map((record) => record.tenantId === input.tenantId && record.connectionId === input.connectionId && record.month === month ? { ...record, activeRequests: Math.max(0, (record.activeRequests ?? 0) - 1) } : record) }));
    };
  }
  recordUsage(tenantId: string, connectionId: string, tokens: number, now = new Date()): void {
    const month = now.toISOString().slice(0, 7);
    this.store.update((state) => ({ records: state.records.map((record) => record.tenantId === tenantId && record.connectionId === connectionId && record.month === month ? { ...record, usedTokens: record.usedTokens + Math.max(0, Math.floor(tokens)) } : record) }));
  }
  current(tenantId: string, connectionId: string, now = new Date()): { month: string; requestsThisMinute: number; usedTokens: number } {
    const month = now.toISOString().slice(0, 7); const cutoff = now.getTime() - 60_000;
    const record = this.store.read().records.find((item) => item.tenantId === tenantId && item.connectionId === connectionId && item.month === month);
    return { month, requestsThisMinute: record?.requestTimes.filter((value) => Date.parse(value) >= cutoff).length ?? 0, usedTokens: record?.usedTokens ?? 0 };
  }
}
