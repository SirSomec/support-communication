import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import { applySessionUpdate, DEFAULT_AGENT_SESSION_POLICY, isSessionExpired } from "./agent-session-state.js";
import type {
  AgentSessionPolicy,
  AgentSessionState,
  AgentSessionUpdateInput,
  AgentSessionUpdateResult
} from "./agent-session-state.types.js";

interface AgentSessionStateStore {
  sessions: AgentSessionState[];
}

let defaultRepository: AgentSessionStateRepository | null = null;

/** Tenant- and conversation-scoped compact agent memory. Never a full transcript store. */
export class AgentSessionStateRepository {
  constructor(
    private readonly store: DurableStore<AgentSessionStateStore>,
    private readonly policy: AgentSessionPolicy = DEFAULT_AGENT_SESSION_POLICY
  ) {}

  static default(): AgentSessionStateRepository {
    if (!defaultRepository) {
      defaultRepository = new AgentSessionStateRepository(new JsonFileStore({
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

  get(tenantId: string, conversationId: string, now = new Date()): AgentSessionState | null {
    const session = this.store.read().sessions.find((item) => item.tenantId === tenantId && item.conversationId === conversationId) ?? null;
    if (!session) return null;
    if (isSessionExpired(session, now)) {
      this.delete(tenantId, conversationId);
      return null;
    }
    return session;
  }

  save(state: AgentSessionState): AgentSessionState {
    this.store.update((current) => {
      const sessions = current.sessions.filter((item) => !(item.tenantId === state.tenantId && item.conversationId === state.conversationId));
      return { sessions: [...sessions, state] };
    });
    return state;
  }

  updateAfterRun(input: AgentSessionUpdateInput): AgentSessionUpdateResult {
    const current = this.get(input.tenantId, input.conversationId, input.now);
    const result = applySessionUpdate(current, input, this.policy);
    this.save(result.state);
    return result;
  }

  delete(tenantId: string, conversationId: string): void {
    this.store.update((current) => ({
      sessions: current.sessions.filter((item) => !(item.tenantId === tenantId && item.conversationId === conversationId))
    }));
  }

  purgeExpired(now = new Date()): number {
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
}
