import type { AutomationBotPublishAuditEvent, AutomationBotRuntimeInstance, AutomationBotRuntimeStep, AutomationState } from "./automation.repository.js";
import type { BotScenario } from "./automation.types.js";
export type AiUsageCostBucket = "none" | "low" | "medium" | "high";
export interface ScenarioOperationalViewer {
    isServiceAdmin?: boolean;
    permissions?: string[];
}
export interface ScenarioOperationalAiUsage {
    estimatedCostBucket: AiUsageCostBucket;
    estimatedCostUsd: number;
    month: string;
    monthlyTokenBudget: number | null;
    usedTokens: number;
}
export interface ScenarioOperationalFailure {
    at: string;
    conversationId: string;
    error: string | null;
    outcome: string;
}
export interface ScenarioOperationalHandoff {
    at: string;
    conversationId: string;
    queue: string | null;
    reason: string | null;
}
export interface ScenarioOperationalPublish {
    action: string;
    actor: string;
    at: string;
    versionId: string;
}
export interface ScenarioOperationalCitation {
    sourceId: string;
    title: string;
    version: number;
}
export interface ScenarioOperationalSummary {
    aiUsage: ScenarioOperationalAiUsage | null;
    lastCitations: ScenarioOperationalCitation[];
    lastFallbackReason: string | null;
    recentFailures: ScenarioOperationalFailure[];
    recentHandoffs: ScenarioOperationalHandoff[];
    recentPublishes: ScenarioOperationalPublish[];
    scenarioId: string;
    status: string;
}
export declare function canViewAiUsage(viewer?: ScenarioOperationalViewer): boolean;
export declare function estimateAiCostBucket(usedTokens: number): AiUsageCostBucket;
export declare function estimateAiCostUsd(usedTokens: number): number;
export declare function buildTenantAiUsageSummary(input: {
    monthlyTokenBudget?: number | null;
    month?: string;
    usedTokens?: number;
    viewer?: ScenarioOperationalViewer;
}): ScenarioOperationalAiUsage | null;
export declare function buildScenarioOperationalSummaries(input: {
    aiUsage?: ScenarioOperationalAiUsage | null;
    publishEvents?: AutomationBotPublishAuditEvent[];
    runtimeInstances?: AutomationBotRuntimeInstance[];
    runtimeSteps?: AutomationBotRuntimeStep[];
    scenarios: BotScenario[];
    tenantId: string;
}): ScenarioOperationalSummary[];
export declare function buildScenarioOperationalSummariesFromState(state: Pick<AutomationState, "botPublishAuditEvents" | "botRuntimeInstances" | "botRuntimeSteps" | "botScenarios">, tenantId: string, aiUsage?: ScenarioOperationalAiUsage | null): ScenarioOperationalSummary[];
