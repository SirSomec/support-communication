import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import type { BotSandboxSession, BotSandboxUsageRecord } from "./bot-sandbox.types.js";

interface BotSandboxStore {
  sessions: BotSandboxSession[];
  usage: BotSandboxUsageRecord[];
}

const EMPTY_STORE: BotSandboxStore = { sessions: [], usage: [] };
export const BOT_SANDBOX_SESSION_TTL_MS = 2 * 60 * 60 * 1_000;
const MAX_SESSIONS_PER_TENANT = 50;

let defaultRepository: BotSandboxSessionRepository | null = null;

/** Tenant-scoped sandbox chat sessions. Ephemeral by design: TTL-bound, never part of production dialogs. */
export class BotSandboxSessionRepository {
  constructor(private readonly store: DurableStore<BotSandboxStore>) {}

  static default(): BotSandboxSessionRepository {
    if (!defaultRepository) {
      defaultRepository = new BotSandboxSessionRepository(new JsonFileStore({
        filePath: process.env.BOT_SANDBOX_STORE_FILE ?? ".runtime/bot-sandbox-sessions.json",
        seed: { ...EMPTY_STORE }
      }));
    }
    return defaultRepository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: BotSandboxStore = { sessions: [], usage: [] }): BotSandboxSessionRepository {
    return new BotSandboxSessionRepository(new InMemoryStore(seed));
  }

  find(tenantId: string, sessionId: string, now = new Date()): BotSandboxSession | null {
    const session = this.store.read().sessions.find((item) => item.tenantId === tenantId && item.id === sessionId) ?? null;
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= now.getTime()) {
      this.delete(tenantId, sessionId);
      return null;
    }
    return session;
  }

  save(session: BotSandboxSession): BotSandboxSession {
    this.store.update((current) => {
      const others = current.sessions.filter((item) => !(item.tenantId === session.tenantId && item.id === session.id));
      const tenantSessions = others.filter((item) => item.tenantId === session.tenantId);
      const overflow = Math.max(0, tenantSessions.length + 1 - MAX_SESSIONS_PER_TENANT);
      const dropped = new Set(
        tenantSessions
          .slice()
          .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))
          .slice(0, overflow)
          .map((item) => item.id)
      );
      return {
        sessions: [...others.filter((item) => item.tenantId !== session.tenantId || !dropped.has(item.id)), session],
        usage: current.usage
      };
    });
    return session;
  }

  delete(tenantId: string, sessionId: string): void {
    this.store.update((current) => ({
      sessions: current.sessions.filter((item) => !(item.tenantId === tenantId && item.id === sessionId)),
      usage: current.usage
    }));
  }

  purgeExpired(now = new Date()): number {
    let removed = 0;
    this.store.update((current) => {
      const sessions = current.sessions.filter((item) => {
        const keep = Date.parse(item.expiresAt) > now.getTime();
        if (!keep) removed += 1;
        return keep;
      });
      return { sessions, usage: current.usage };
    });
    return removed;
  }

  /** Tokens spent by sandbox chats this month. Counted on top of the connection's shared monthly budget. */
  sandboxUsage(tenantId: string, now = new Date()): number {
    const month = now.toISOString().slice(0, 7);
    return this.store.read().usage.find((item) => item.tenantId === tenantId && item.month === month)?.usedTokens ?? 0;
  }

  recordSandboxUsage(tenantId: string, tokens: number, now = new Date()): void {
    const amount = Math.max(0, Math.floor(tokens));
    if (!amount) return;
    const month = now.toISOString().slice(0, 7);
    this.store.update((current) => {
      const index = current.usage.findIndex((item) => item.tenantId === tenantId && item.month === month);
      const usage = index >= 0
        ? current.usage.map((item, itemIndex) => itemIndex === index ? { ...item, usedTokens: item.usedTokens + amount } : item)
        : [...current.usage, { month, tenantId, usedTokens: amount }];
      return { sessions: current.sessions, usage };
    });
  }
}
