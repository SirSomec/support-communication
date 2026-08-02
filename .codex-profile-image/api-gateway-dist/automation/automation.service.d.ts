import { type BackendEnvelope } from "@support-communication/envelope";
import type { BotFlowNode, BotScenario, BotTriggerRule, ProactiveRule } from "./automation.types.js";
import { AutomationRepository } from "./automation.repository.js";
import { type BotRuntimeInboundEvent, type BotRuntimeOptions } from "./bot-runtime.service.js";
import { ProactiveExposureRepository } from "./proactive-exposure.repository.js";
import { KnowledgeSourceRepository } from "../knowledge-sources/knowledge-source.repository.js";
import { type BotFeedbackRepositoryPort } from "./bot-feedback.repository.js";
import { PlatformRepository } from "../platform/platform.repository.js";
interface BotFlowImportPayload {
    flowEdges?: Array<{
        from?: string;
        label?: string;
        to?: string;
    }>;
    flowNodes?: BotFlowNode[];
    name?: string;
    priority?: number;
    schemaVersion?: string;
    sourceBindings?: BotScenario["sourceBindings"];
    triggerRules?: BotTriggerRule[];
}
interface PublishBotScenarioPayload extends BotFlowImportPayload {
    basePrompt?: string;
    channels?: string[];
    id?: string;
    idempotencyKey?: string;
    matchMode?: string;
    testCases?: Array<Record<string, unknown>>;
    triggerPhrases?: string[];
}
interface ScenarioDraftPayload extends Partial<BotScenario> {
    matchMode?: string;
    triggerPhrases?: string[];
}
interface CreateBotHandoffPayload {
    aiOutcome?: string;
    botId?: string;
    citations?: Array<{
        sourceId?: string;
        title?: string;
        version?: number;
    }>;
    collectedFields?: Record<string, unknown>;
    conversationId?: string;
    goal?: string;
    queue?: string;
    reason?: string;
    scenarioName?: string;
    sessionState?: string;
    tenantId?: string;
    topic?: string;
}
interface RecordBotAiFeedbackPayload {
    citationSourceIds?: string[];
    comment?: string;
    conversationId?: string;
    idempotencyKey?: string;
    outcome?: string;
    scenarioId?: string;
}
export interface AutomationRequestContext {
    actor?: string;
    idempotencyKey?: string;
    isServiceAdmin?: boolean;
    permissions?: string[];
    reason?: string;
    tenantId?: string;
    traceId?: string;
}
export interface VisitorMetricsRange {
    from?: string;
    to?: string;
}
export declare class AutomationService {
    private readonly automationRepository;
    private readonly exposureRepository;
    private readonly knowledgeSourceRepository;
    private readonly botFeedbackRepository;
    private readonly platformRepository;
    private readonly scenarios;
    private readonly rules;
    private readonly publishIdempotency;
    constructor(automationRepository?: AutomationRepository, exposureRepository?: ProactiveExposureRepository, knowledgeSourceRepository?: KnowledgeSourceRepository, botFeedbackRepository?: BotFeedbackRepositoryPort, platformRepository?: PlatformRepository);
    fetchAutomationWorkspace(context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchVisitorWorkspace(context?: AutomationRequestContext, range?: VisitorMetricsRange): Promise<BackendEnvelope<Record<string, unknown>>>;
    createBotScenario(payload: ScenarioDraftPayload | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    updateBotScenario(scenarioId: string, payload: ScenarioDraftPayload | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    listBotScenarios(context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchBotScenario(scenarioId: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    disableBotScenario(scenarioId: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    archiveBotScenario(scenarioId: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    restoreBotScenario(scenarioId: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    validateBotFlowImport(input: BotFlowImportPayload | string | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    publishBotScenario(payload: PublishBotScenarioPayload | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    saveProactiveRule(rule: Partial<ProactiveRule> | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    testBotScenario(payload: PublishBotScenarioPayload | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    createBotSandboxSession(scenarioId: string, payload: {
        channel?: string;
        locale?: string;
        mode?: string;
    } | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    fetchBotSandboxSession(scenarioId: string, sessionId: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    deleteBotSandboxSession(scenarioId: string, sessionId: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    postBotSandboxMessage(scenarioId: string, sessionId: string, payload: {
        messageId?: string;
        quickReply?: string;
        text?: string;
        value?: unknown;
        webhooksEnabled?: boolean;
    } | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    saveBotSandboxRegression(scenarioId: string, sessionId: string, payload: {
        name?: string;
    } | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    /** BAI-812: правки published-сценария сохраняются как черновик следующей версии, не трогая runtime. */
    private saveScenarioDraftOverlay;
    discardBotScenarioDraft(scenarioId: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    /** BAI-813: откат опубликованного сценария к более ранней опубликованной версии. */
    rollbackBotScenarioToVersion(scenarioId: string, versionId: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    private sandboxService;
    private botRuntimeFeatureFlags;
    recordBotAiFeedback(payload: RecordBotAiFeedbackPayload | null | undefined, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    /** BAI-852: очередь ревью — что оператор отметил «не помогло»/«неверный источник». */
    listBotAiFeedback(context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    resolveBotAiFeedback(feedbackId: string, action: string, context?: AutomationRequestContext): Promise<BackendEnvelope<Record<string, unknown>>>;
    createBotHandoffSummary(payload: CreateBotHandoffPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>>;
    private upsertScenario;
    private transitionBotScenario;
    private recordScenarioActionAudit;
    private findPublishIdempotency;
    handleBotRuntimeInboundEvent(event: BotRuntimeInboundEvent, options?: BotRuntimeOptions): Promise<import("./automation.repository.js").AutomationBotRuntimeCommitResult>;
    rollbackBotRuntimeVersion(tenantId: string, scenarioId: string, versionId: string): Promise<BotScenario>;
    retryBotRuntimeInboundEvent(event: BotRuntimeInboundEvent, options?: BotRuntimeOptions): Promise<import("./automation.repository.js").AutomationBotRuntimeCommitResult>;
    private syncLocalCaches;
}
export {};
