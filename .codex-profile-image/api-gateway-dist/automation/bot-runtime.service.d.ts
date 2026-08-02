import type { BotFlowNode, BotScenario, BotTriggerRule } from "./automation.types.js";
import { AutomationRepository, type AutomationBotRuntimeCommitResult } from "./automation.repository.js";
import { AiBotResponseService } from "./ai-bot-response.service.js";
import type { FeatureFlag } from "../platform/platform.types.js";
export interface BotRuntimeInboundEvent {
    channel: string;
    conversationId: string;
    eventId: string;
    payload?: Record<string, unknown>;
    scenarioId?: string;
    tenantId: string;
    traceId: string;
}
export interface BotRuntimeOptions {
    aiResponder?: Pick<AiBotResponseService, "respond">;
    featureFlags?: FeatureFlag[];
    fetch?: typeof fetch;
    maxAttempts?: number;
    now?: () => Date;
    webhookAllowlist?: string[];
    webhookTimeoutMs?: number;
}
export declare class BotRuntimeService {
    private readonly repository;
    private readonly options;
    constructor(repository: AutomationRepository, options?: BotRuntimeOptions);
    handleInboundEvent(event: BotRuntimeInboundEvent): Promise<AutomationBotRuntimeCommitResult>;
    retryInboundEvent(event: BotRuntimeInboundEvent): Promise<AutomationBotRuntimeCommitResult>;
    rollbackToPublishedVersion(tenantId: string, scenarioId: string, versionId: string): Promise<BotScenario>;
    private resolveScenario;
    private executeNode;
    private callWebhook;
    private commitFailure;
}
/** Consultation mode keeps the dialog on the ai_reply node across client messages. Opt-in per node. */
export declare function isConsultationNode(node: Pick<BotFlowNode, "config" | "type">): boolean;
export declare function consultationMaxTurns(node: Pick<BotFlowNode, "config">): number;
export declare function wantsHumanOperator(message: string, node?: Pick<BotFlowNode, "config">): boolean;
/**
 * Wizard stores the selected trigger as the first flow-node title. Older publishes
 * sometimes persisted an empty triggerRules array; recover the intended rule so
 * runtime still matches instead of failing with bot_runtime_published_scenario_not_found.
 */
export declare function effectiveTriggerRules(scenario: Pick<BotScenario, "flowNodes" | "triggerRules">): BotTriggerRule[];
