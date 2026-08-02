import type { FeatureFlag } from "../platform/platform.types.js";
export declare const AI_AGENTS_FLAG_KEY = "ai_agents_v1";
export declare const AI_AGENTS_LEGACY_FLAG_KEY = "ai_bots";
export interface AiAgentsRolloutEvaluation {
    eligible: boolean;
    flagKey: string;
    killSwitchArmed: boolean;
    reason: string;
}
export declare function resolveAiAgentsFeatureFlag(flags?: FeatureFlag[]): FeatureFlag | undefined;
export declare function evaluateAiAgentsRollout(input: {
    flags?: FeatureFlag[];
    planId?: string;
    tenantId: string;
}): AiAgentsRolloutEvaluation;
export declare const AI_LLM_RETRIEVAL_FLAG_KEY = "ai_llm_retrieval";
/**
 * BAI-877: тенант-гейт «умного» поиска. Отсутствие/выключенность флага не
 * ошибка и не handoff — бот тихо остаётся на лексическом поиске, поэтому
 * выключение флага мгновенно возвращает старое поведение.
 */
export declare function evaluateLlmRetrievalRollout(input: {
    flags?: FeatureFlag[];
    planId?: string;
    tenantId: string;
}): AiAgentsRolloutEvaluation;
export declare const AI_SEMANTIC_RETRIEVAL_FLAG_KEY = "ai_semantic_retrieval";
/**
 * Тенант-гейт семантического (embedding) поиска. Как и у ai_llm_retrieval,
 * отсутствие/выключенность флага не ошибка и не handoff — бот тихо остаётся на
 * лексическом поиске, поэтому выключение флага мгновенно возвращает старое
 * поведение.
 */
export declare function evaluateSemanticRetrievalRollout(input: {
    flags?: FeatureFlag[];
    planId?: string;
    tenantId: string;
}): AiAgentsRolloutEvaluation;
/** Kill-switch / rollback checklist for AI-agents ops (documented in runbook). */
export declare function aiAgentsKillSwitchSteps(): string[];
