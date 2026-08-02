import type { FeatureFlag } from "../platform/platform.types.js";
export declare const AI_AGENTS_FLAG_KEY = "ai_agents_v1";
export declare const AI_AGENTS_LEGACY_FLAG_KEY = "ai_bots";
export interface AiAgentsPilotEvaluation {
    eligible: boolean;
    flagKey: string;
    killSwitchArmed: boolean;
    reason: string;
}
export declare function resolveAiAgentsFeatureFlag(flags?: FeatureFlag[]): FeatureFlag | undefined;
export declare function evaluateAiAgentsPilot(input: {
    flags?: FeatureFlag[];
    planId?: string;
    tenantId: string;
}): AiAgentsPilotEvaluation;
/** Kill-switch / rollback checklist for pilot ops (documented in runbook). */
export declare function aiAgentsKillSwitchSteps(): string[];
