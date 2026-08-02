import { InMemoryStore, createPrismaClient } from "@support-communication/database";
import { applySessionUpdate, DEFAULT_AGENT_SESSION_POLICY, isSessionExpired } from "./agent-session-state.js";
let defaultRepository = null;
/** Tenant- and conversation-scoped compact agent memory. Never a full transcript store. */
export class AgentSessionStateRepository {
    store;
    policy;
    prismaClient;
    constructor(store, policy = DEFAULT_AGENT_SESSION_POLICY, prismaClient) {
        this.store = store;
        this.policy = policy;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (!defaultRepository) {
            // Prisma-only рантайм (план 2026-07-15): дефолтный репозиторий всегда
            // персистится в Postgres; json-ветка выпилена вместе с JsonFileStore.
            defaultRepository = AgentSessionStateRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) });
        }
        return defaultRepository;
    }
    static clearDefault() {
        defaultRepository = null;
    }
    static inMemory(seed = { sessions: [] }, policy) {
        return new AgentSessionStateRepository(new InMemoryStore(seed), policy);
    }
    static prisma({ client, policy }) {
        return new AgentSessionStateRepository(new InMemoryStore({ sessions: [] }), policy ?? DEFAULT_AGENT_SESSION_POLICY, client);
    }
    get(tenantId, conversationId, now = new Date()) {
        if (this.prismaClient) {
            return this.getPrisma(tenantId, conversationId, now);
        }
        const session = this.store.read().sessions.find((item) => item.tenantId === tenantId && item.conversationId === conversationId) ?? null;
        if (!session)
            return null;
        if (isSessionExpired(session, now)) {
            this.delete(tenantId, conversationId);
            return null;
        }
        return session;
    }
    save(state) {
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
    async updateAfterRun(input) {
        const current = await this.get(input.tenantId, input.conversationId, input.now);
        const result = applySessionUpdate(current, input, this.policy);
        await this.save(result.state);
        return result;
    }
    delete(tenantId, conversationId) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.agentSessionState.deleteMany({ where: { conversationId, tenantId } })).then(() => undefined);
        }
        this.store.update((current) => ({
            sessions: current.sessions.filter((item) => !(item.tenantId === tenantId && item.conversationId === conversationId))
        }));
    }
    purgeExpired(now = new Date()) {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.agentSessionState.deleteMany({ where: { expiresAt: { lt: now } } })).then((result) => result.count);
        }
        let removed = 0;
        this.store.update((current) => {
            const sessions = current.sessions.filter((item) => {
                const keep = !isSessionExpired(item, now);
                if (!keep)
                    removed += 1;
                return keep;
            });
            return { sessions };
        });
        return removed;
    }
    async getPrisma(tenantId, conversationId, now) {
        const row = await this.prismaClient.agentSessionState.findUnique({
            where: { tenantId_conversationId: { conversationId, tenantId } }
        });
        if (!row)
            return null;
        const session = fromRow(row);
        if (isSessionExpired(session, now)) {
            await this.prismaClient.agentSessionState.deleteMany({ where: { conversationId, tenantId } });
            return null;
        }
        return session;
    }
}
function toCreateInput(state) {
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
function fromRow(row) {
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
function toFacts(value) {
    return Array.isArray(value)
        ? value
            .filter((item) => item !== null && typeof item === "object")
            .map((item) => ({ key: String(item.key ?? ""), value: String(item.value ?? "") }))
            .filter((item) => item.key.length > 0)
        : [];
}
function toTurns(value) {
    return Array.isArray(value)
        ? value
            .filter((item) => item !== null && typeof item === "object")
            .map((item) => ({ at: String(item.at ?? ""), role: item.role === "assistant" ? "assistant" : "user", text: String(item.text ?? "") }))
        : [];
}
//# sourceMappingURL=agent-session-state.repository.js.map