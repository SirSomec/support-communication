import { type DurableStore, InMemoryStore, JsonFileStore, createPrismaClient } from "@support-communication/database";
import { applySessionUpdate, DEFAULT_AGENT_SESSION_POLICY, isSessionExpired } from "./agent-session-state.js";
import type {
  AgentSessionFact,
  AgentSessionPolicy,
  AgentSessionState,
  AgentSessionTurn,
  AgentSessionUpdateInput,
  AgentSessionUpdateResult
} from "./agent-session-state.types.js";

type MaybePromise<T> = Promise<T> | T;

interface AgentSessionStateStore {
  sessions: AgentSessionState[];
}

export interface PrismaAgentSessionRow {
  conversationId: string;
  createdAt: Date;
  expiresAt: Date;
  facts: unknown;
  intent: string | null;
  openQuestion: string | null;
  recentTurns: unknown;
  scenarioRevisionId: string | null;
  schemaVersion: number;
  summary: string;
  tenantId: string;
  tokenEstimate: number;
  turnCount: number;
  updatedAt: Date;
  version: number;
}

export interface PrismaAgentSessionCreateInput {
  conversationId: string;
  createdAt: Date;
  expiresAt: Date;
  facts: AgentSessionFact[];
  intent: string | null;
  openQuestion: string | null;
  recentTurns: AgentSessionTurn[];
  scenarioRevisionId: string | null;
  schemaVersion: number;
  summary: string;
  tenantId: string;
  tokenEstimate: number;
  turnCount: number;
  updatedAt: Date;
  version: number;
}

export interface AgentSessionPrismaClient {
  agentSessionState: {
    count(input: { where: { expiresAt: { lt: Date } } }): MaybePromise<number>;
    deleteMany(input: { where: { conversationId?: string; expiresAt?: { lt: Date }; tenantId?: string } }): MaybePromise<{ count: number }>;
    findUnique(input: { where: { tenantId_conversationId: { conversationId: string; tenantId: string } } }): MaybePromise<PrismaAgentSessionRow | null>;
    upsert(input: {
      create: PrismaAgentSessionCreateInput;
      update: Omit<PrismaAgentSessionCreateInput, "conversationId" | "createdAt" | "tenantId">;
      where: { tenantId_conversationId: { conversationId: string; tenantId: string } };
    }): MaybePromise<PrismaAgentSessionRow>;
  };
}

let defaultRepository: AgentSessionStateRepository | null = null;

function isPrismaRuntimeProfile(env: NodeJS.ProcessEnv): boolean {
  return String(env.RUNTIME_PROFILE ?? "").trim().toLowerCase() === "production-like";
}

/** Tenant- and conversation-scoped compact agent memory. Never a full transcript store. */
export class AgentSessionStateRepository {
  constructor(
    private readonly store: DurableStore<AgentSessionStateStore>,
    private readonly policy: AgentSessionPolicy = DEFAULT_AGENT_SESSION_POLICY,
    private readonly prismaClient?: AgentSessionPrismaClient
  ) {}

  static default(): AgentSessionStateRepository {
    if (!defaultRepository) {
      // Prisma-only рантайм (план 2026-07-15): production-like профиль всегда
      // персистится в Postgres; json-store остаётся тестовым бэкендом.
      defaultRepository = isPrismaRuntimeProfile(process.env)
        ? AgentSessionStateRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as AgentSessionPrismaClient })
        : new AgentSessionStateRepository(new JsonFileStore({
          filePath: process.env.AGENT_SESSION_STORE_FILE ?? ".runtime/agent-session-state.json",
          seed: { sessions: [] }
        }));
    }
    return defaultRepository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static inMemory(seed: AgentSessionStateStore = { sessions: [] }, policy?: AgentSessionPolicy): AgentSessionStateRepository {
    return new AgentSessionStateRepository(new InMemoryStore(seed), policy);
  }

  static prisma({ client, policy }: { client: AgentSessionPrismaClient; policy?: AgentSessionPolicy }): AgentSessionStateRepository {
    return new AgentSessionStateRepository(new InMemoryStore({ sessions: [] }), policy ?? DEFAULT_AGENT_SESSION_POLICY, client);
  }

  get(tenantId: string, conversationId: string, now = new Date()): MaybePromise<AgentSessionState | null> {
    if (this.prismaClient) {
      return this.getPrisma(tenantId, conversationId, now);
    }
    const session = this.store.read().sessions.find((item) => item.tenantId === tenantId && item.conversationId === conversationId) ?? null;
    if (!session) return null;
    if (isSessionExpired(session, now)) {
      this.delete(tenantId, conversationId);
      return null;
    }
    return session;
  }

  save(state: AgentSessionState): MaybePromise<AgentSessionState> {
    if (this.prismaClient) {
      const create = toCreateInput(state);
      const { conversationId: _c, createdAt: _cr, tenantId: _t, ...update } = create;
      return Promise.resolve(this.prismaClient.agentSessionState.upsert({
        create,
        update,
        where: { tenantId_conversationId: { conversationId: state.conversationId, tenantId: state.tenantId } }
      })).then(fromRow);
    }
    this.store.update((current) => {
      const sessions = current.sessions.filter((item) => !(item.tenantId === state.tenantId && item.conversationId === state.conversationId));
      return { sessions: [...sessions, state] };
    });
    return state;
  }

  async updateAfterRun(input: AgentSessionUpdateInput): Promise<AgentSessionUpdateResult> {
    const current = await this.get(input.tenantId, input.conversationId, input.now);
    const result = applySessionUpdate(current, input, this.policy);
    await this.save(result.state);
    return result;
  }

  delete(tenantId: string, conversationId: string): MaybePromise<void> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.agentSessionState.deleteMany({ where: { conversationId, tenantId } })).then(() => undefined);
    }
    this.store.update((current) => ({
      sessions: current.sessions.filter((item) => !(item.tenantId === tenantId && item.conversationId === conversationId))
    }));
  }

  purgeExpired(now = new Date()): MaybePromise<number> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.agentSessionState.deleteMany({ where: { expiresAt: { lt: now } } })).then((result) => result.count);
    }
    let removed = 0;
    this.store.update((current) => {
      const sessions = current.sessions.filter((item) => {
        const keep = !isSessionExpired(item, now);
        if (!keep) removed += 1;
        return keep;
      });
      return { sessions };
    });
    return removed;
  }

  private async getPrisma(tenantId: string, conversationId: string, now: Date): Promise<AgentSessionState | null> {
    const row = await this.prismaClient!.agentSessionState.findUnique({
      where: { tenantId_conversationId: { conversationId, tenantId } }
    });
    if (!row) return null;
    const session = fromRow(row);
    if (isSessionExpired(session, now)) {
      await this.prismaClient!.agentSessionState.deleteMany({ where: { conversationId, tenantId } });
      return null;
    }
    return session;
  }
}

function toCreateInput(state: AgentSessionState): PrismaAgentSessionCreateInput {
  return {
    conversationId: state.conversationId,
    createdAt: new Date(state.createdAt),
    expiresAt: new Date(state.expiresAt),
    facts: state.facts,
    intent: state.intent,
    openQuestion: state.openQuestion,
    recentTurns: state.recentTurns,
    scenarioRevisionId: state.scenarioRevisionId,
    schemaVersion: state.schemaVersion,
    summary: state.summary,
    tenantId: state.tenantId,
    tokenEstimate: state.tokenEstimate,
    turnCount: state.turnCount,
    updatedAt: new Date(state.updatedAt),
    version: state.version
  };
}

function fromRow(row: PrismaAgentSessionRow): AgentSessionState {
  return {
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    facts: toFacts(row.facts),
    intent: row.intent,
    openQuestion: row.openQuestion,
    recentTurns: toTurns(row.recentTurns),
    scenarioRevisionId: row.scenarioRevisionId,
    schemaVersion: 1,
    summary: row.summary,
    tenantId: row.tenantId,
    tokenEstimate: row.tokenEstimate,
    turnCount: row.turnCount,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version
  };
}

function toFacts(value: unknown): AgentSessionFact[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is { key: unknown; value: unknown } => item !== null && typeof item === "object")
      .map((item) => ({ key: String(item.key ?? ""), value: String(item.value ?? "") }))
      .filter((item) => item.key.length > 0)
    : [];
}

function toTurns(value: unknown): AgentSessionTurn[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is { at: unknown; role: unknown; text: unknown } => item !== null && typeof item === "object")
      .map((item) => ({ at: String(item.at ?? ""), role: item.role === "assistant" ? "assistant" as const : "user" as const, text: String(item.text ?? "") }))
    : [];
}
