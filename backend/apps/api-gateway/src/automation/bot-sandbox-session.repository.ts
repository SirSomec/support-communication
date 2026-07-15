import { type DurableStore, InMemoryStore, JsonFileStore, createPrismaClient } from "@support-communication/database";
import type { BotSandboxSession, BotSandboxSessionMode, BotSandboxSessionStatus, BotSandboxTurn, BotSandboxUsageRecord } from "./bot-sandbox.types.js";

type MaybePromise<T> = Promise<T> | T;

interface BotSandboxStore {
  sessions: BotSandboxSession[];
  usage: BotSandboxUsageRecord[];
}

const EMPTY_STORE: BotSandboxStore = { sessions: [], usage: [] };
export const BOT_SANDBOX_SESSION_TTL_MS = 2 * 60 * 60 * 1_000;
const MAX_SESSIONS_PER_TENANT = 50;

export interface PrismaBotSandboxSessionRow {
  channel: string;
  context: unknown;
  createdAt: Date;
  createdBy: string;
  currentNodeId: string | null;
  expiresAt: Date;
  id: string;
  locale: string;
  mode: string;
  scenarioId: string;
  scenarioName: string;
  status: string;
  tenantId: string;
  turns: unknown;
  updatedAt: Date;
  usage: unknown;
  versionId: string;
  webhooksEnabled: boolean;
}

export interface PrismaBotSandboxSessionCreateInput {
  channel: string;
  context: Record<string, unknown>;
  createdAt: Date;
  createdBy: string;
  currentNodeId: string | null;
  expiresAt: Date;
  id: string;
  locale: string;
  mode: string;
  scenarioId: string;
  scenarioName: string;
  status: string;
  tenantId: string;
  turns: BotSandboxTurn[];
  updatedAt: Date;
  usage: { totalTokens: number };
  versionId: string;
  webhooksEnabled: boolean;
}

export interface PrismaBotSandboxUsageRow { month: string; tenantId: string; usedTokens: number; }

export interface BotSandboxPrismaClient {
  botSandboxSession: {
    deleteMany(input: { where: { expiresAt?: { lte: Date }; id?: string; tenantId?: string } }): MaybePromise<{ count: number }>;
    findFirst(input: { where: { id: string; tenantId: string } }): MaybePromise<PrismaBotSandboxSessionRow | null>;
    findMany(input: { orderBy: { updatedAt: "asc" }; where: { tenantId: string } }): MaybePromise<PrismaBotSandboxSessionRow[]>;
    upsert(input: {
      create: PrismaBotSandboxSessionCreateInput;
      update: Omit<PrismaBotSandboxSessionCreateInput, "createdAt" | "id" | "tenantId">;
      where: { id: string };
    }): MaybePromise<PrismaBotSandboxSessionRow>;
  };
  botSandboxUsageCounter: {
    findUnique(input: { where: { tenantId_month: { month: string; tenantId: string } } }): MaybePromise<PrismaBotSandboxUsageRow | null>;
    upsert(input: {
      create: { month: string; tenantId: string; usedTokens: number };
      update: { usedTokens: number };
      where: { tenantId_month: { month: string; tenantId: string } };
    }): MaybePromise<PrismaBotSandboxUsageRow>;
  };
}

let defaultRepository: BotSandboxSessionRepository | null = null;

function isPrismaRuntimeProfile(env: NodeJS.ProcessEnv): boolean {
  return String(env.RUNTIME_PROFILE ?? "").trim().toLowerCase() === "production-like";
}

/** Tenant-scoped sandbox chat sessions. Ephemeral by design: TTL-bound, never part of production dialogs. */
export class BotSandboxSessionRepository {
  constructor(private readonly store: DurableStore<BotSandboxStore>, private readonly prismaClient?: BotSandboxPrismaClient) {}

  static default(): BotSandboxSessionRepository {
    if (!defaultRepository) {
      // Prisma-only рантайм (план 2026-07-15, фаза A3): production-like профиль
      // всегда персистится в Postgres; json-store остаётся тестовым бэкендом.
      defaultRepository = isPrismaRuntimeProfile(process.env)
        ? BotSandboxSessionRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as BotSandboxPrismaClient })
        : new BotSandboxSessionRepository(new JsonFileStore({
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

  static prisma({ client }: { client: BotSandboxPrismaClient }): BotSandboxSessionRepository {
    return new BotSandboxSessionRepository(new InMemoryStore({ sessions: [], usage: [] }), client);
  }

  find(tenantId: string, sessionId: string, now = new Date()): MaybePromise<BotSandboxSession | null> {
    if (this.prismaClient) return this.findPrisma(tenantId, sessionId, now);
    const session = this.store.read().sessions.find((item) => item.tenantId === tenantId && item.id === sessionId) ?? null;
    if (!session) return null;
    if (Date.parse(session.expiresAt) <= now.getTime()) {
      this.delete(tenantId, sessionId);
      return null;
    }
    return session;
  }

  save(session: BotSandboxSession): MaybePromise<BotSandboxSession> {
    if (this.prismaClient) return this.savePrisma(session);
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

  delete(tenantId: string, sessionId: string): MaybePromise<void> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.botSandboxSession.deleteMany({ where: { id: sessionId, tenantId } })).then(() => undefined);
    }
    this.store.update((current) => ({
      sessions: current.sessions.filter((item) => !(item.tenantId === tenantId && item.id === sessionId)),
      usage: current.usage
    }));
  }

  purgeExpired(now = new Date()): MaybePromise<number> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.botSandboxSession.deleteMany({ where: { expiresAt: { lte: now } } })).then((result) => result.count);
    }
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
  sandboxUsage(tenantId: string, now = new Date()): MaybePromise<number> {
    const month = now.toISOString().slice(0, 7);
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.botSandboxUsageCounter.findUnique({ where: { tenantId_month: { month, tenantId } } }))
        .then((row) => row?.usedTokens ?? 0);
    }
    return this.store.read().usage.find((item) => item.tenantId === tenantId && item.month === month)?.usedTokens ?? 0;
  }

  recordSandboxUsage(tenantId: string, tokens: number, now = new Date()): MaybePromise<void> {
    const amount = Math.max(0, Math.floor(tokens));
    if (!amount) return;
    const month = now.toISOString().slice(0, 7);
    if (this.prismaClient) return this.recordSandboxUsagePrisma(tenantId, amount, month);
    this.store.update((current) => {
      const index = current.usage.findIndex((item) => item.tenantId === tenantId && item.month === month);
      const usage = index >= 0
        ? current.usage.map((item, itemIndex) => itemIndex === index ? { ...item, usedTokens: item.usedTokens + amount } : item)
        : [...current.usage, { month, tenantId, usedTokens: amount }];
      return { sessions: current.sessions, usage };
    });
  }

  private async findPrisma(tenantId: string, sessionId: string, now: Date): Promise<BotSandboxSession | null> {
    const row = await this.prismaClient!.botSandboxSession.findFirst({ where: { id: sessionId, tenantId } });
    if (!row) return null;
    const session = fromRow(row);
    if (Date.parse(session.expiresAt) <= now.getTime()) {
      await this.prismaClient!.botSandboxSession.deleteMany({ where: { id: sessionId, tenantId } });
      return null;
    }
    return session;
  }

  private async savePrisma(session: BotSandboxSession): Promise<BotSandboxSession> {
    const create = toCreateInput(session);
    const { createdAt: _createdAt, id: _id, tenantId: _tenantId, ...update } = create;
    await this.prismaClient!.botSandboxSession.upsert({ create, update, where: { id: session.id } });
    // Cap sessions per tenant, dropping the oldest by updatedAt. The row just
    // written has the newest updatedAt, so it is never in the eviction slice.
    const tenantRows = await this.prismaClient!.botSandboxSession.findMany({ orderBy: { updatedAt: "asc" }, where: { tenantId: session.tenantId } });
    const overflow = Math.max(0, tenantRows.length - MAX_SESSIONS_PER_TENANT);
    for (const row of tenantRows.slice(0, overflow)) {
      if (row.id === session.id) continue;
      await this.prismaClient!.botSandboxSession.deleteMany({ where: { id: row.id, tenantId: session.tenantId } });
    }
    return session;
  }

  private async recordSandboxUsagePrisma(tenantId: string, amount: number, month: string): Promise<void> {
    const where = { tenantId_month: { month, tenantId } };
    const row = await this.prismaClient!.botSandboxUsageCounter.findUnique({ where });
    const usedTokens = (row?.usedTokens ?? 0) + amount;
    await this.prismaClient!.botSandboxUsageCounter.upsert({ create: { month, tenantId, usedTokens }, update: { usedTokens }, where });
  }
}

function toCreateInput(session: BotSandboxSession): PrismaBotSandboxSessionCreateInput {
  return {
    channel: session.channel,
    context: session.context,
    createdAt: new Date(session.createdAt),
    createdBy: session.createdBy,
    currentNodeId: session.currentNodeId,
    expiresAt: new Date(session.expiresAt),
    id: session.id,
    locale: session.locale,
    mode: session.mode,
    scenarioId: session.scenarioId,
    scenarioName: session.scenarioName,
    status: session.status,
    tenantId: session.tenantId,
    turns: session.turns,
    updatedAt: new Date(session.updatedAt),
    usage: session.usage,
    versionId: session.versionId,
    webhooksEnabled: session.webhooksEnabled
  };
}

function fromRow(row: PrismaBotSandboxSessionRow): BotSandboxSession {
  return {
    channel: row.channel,
    context: row.context !== null && typeof row.context === "object" ? row.context as Record<string, unknown> : {},
    createdAt: iso(row.createdAt),
    createdBy: row.createdBy,
    currentNodeId: row.currentNodeId,
    expiresAt: iso(row.expiresAt),
    id: row.id,
    locale: row.locale,
    mode: row.mode as BotSandboxSessionMode,
    scenarioId: row.scenarioId,
    scenarioName: row.scenarioName,
    status: row.status as BotSandboxSessionStatus,
    tenantId: row.tenantId,
    turns: Array.isArray(row.turns) ? row.turns as BotSandboxTurn[] : [],
    updatedAt: iso(row.updatedAt),
    usage: toUsage(row.usage),
    versionId: row.versionId,
    webhooksEnabled: Boolean(row.webhooksEnabled)
  };
}

function iso(value: Date | string): string { return value instanceof Date ? value.toISOString() : String(value ?? ""); }
function toUsage(value: unknown): { totalTokens: number } {
  if (value !== null && typeof value === "object" && "totalTokens" in value) {
    return { totalTokens: Math.max(0, Math.floor(Number((value as { totalTokens: unknown }).totalTokens) || 0)) };
  }
  return { totalTokens: 0 };
}
