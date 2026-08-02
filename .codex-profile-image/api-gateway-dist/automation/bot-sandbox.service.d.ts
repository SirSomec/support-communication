import type { FeatureFlag } from "../platform/platform.types.js";
import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { KnowledgeRetrievalService } from "../knowledge-sources/knowledge-retrieval.service.js";
import { AutomationRepository, type AutomationBotTestRun } from "./automation.repository.js";
import { AiBotResponseService } from "./ai-bot-response.service.js";
import { BotSandboxSessionRepository } from "./bot-sandbox-session.repository.js";
import type { BotSandboxSession, BotSandboxTurn } from "./bot-sandbox.types.js";
export interface BotSandboxServiceOptions {
    aiResponder?: Pick<AiBotResponseService, "respond">;
    connections?: AiConnectionRepository;
    environment?: NodeJS.ProcessEnv;
    fetch?: typeof fetch;
    now?: () => Date;
    retrieval?: KnowledgeRetrievalService;
    sessions?: BotSandboxSessionRepository;
}
export interface BotSandboxCreateInput {
    actor: string;
    channel?: string;
    locale?: string;
    mode?: string;
    scenarioId: string;
    tenantId: string;
}
export interface BotSandboxMessageInput {
    featureFlags?: FeatureFlag[];
    messageId?: string;
    quickReply?: string;
    scenarioId: string;
    sessionId: string;
    tenantId: string;
    text: string;
    traceId?: string;
    value?: unknown;
    webhooksEnabled?: boolean;
}
/**
 * Live sandbox chat (BAI-801/802). Every message runs the real runtime and the
 * real AI provider against an ephemeral in-memory repository: production
 * dialogs, queues, workers and channel delivery are never touched.
 */
export declare class BotSandboxService {
    private readonly automationRepository;
    private readonly options;
    private readonly sessions;
    private readonly connections;
    private readonly environment;
    constructor(automationRepository: AutomationRepository, options?: BotSandboxServiceOptions);
    createSession(input: BotSandboxCreateInput): Promise<BotSandboxSession>;
    getSession(tenantId: string, scenarioId: string, sessionId: string): Promise<BotSandboxSession>;
    deleteSession(tenantId: string, scenarioId: string, sessionId: string): Promise<void>;
    postMessage(input: BotSandboxMessageInput): Promise<{
        session: BotSandboxSession;
        turn: BotSandboxTurn;
    }>;
    saveRegression(input: {
        actor: string;
        name?: string;
        scenarioId: string;
        sessionId: string;
        tenantId: string;
    }): Promise<AutomationBotTestRun>;
    private now;
    private assertSandboxBudget;
    private appendTurn;
    private traceRetrieval;
    private buildEphemeralRepository;
    private resolveScenarioConfig;
}
