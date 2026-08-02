export type BotAlertSeverity = "critical" | "high" | "medium";
export type BotAlertKind = "provider_outage" | "ingestion_backlog" | "quota_spike" | "unsafe_source_denial" | "runtime_dead_letter" | "high_fallback_rate";
export interface BotAlertDefinition {
    id: BotAlertKind;
    owner: string;
    recoverySteps: string[];
    severity: BotAlertSeverity;
    summary: string;
    title: string;
}
/** Alert catalog for bot/AI operations — each entry has an owner and recovery actions. */
export declare const BOT_ALERT_DEFINITIONS: Record<BotAlertKind, BotAlertDefinition>;
export interface BotAlertEvaluationInput {
    aiErrorCount?: number;
    aiOkCount?: number;
    deliveryFailureCount?: number;
    handoffCount?: number;
    publishFailureCount?: number;
    quotaErrorCount?: number;
    sourceErrorCount?: number;
    unsafeDenialCount?: number;
}
export interface BotAlertEvaluation {
    active: boolean;
    definition: BotAlertDefinition;
    evidence: Record<string, number>;
    id: BotAlertKind;
}
declare const DEFAULT_THRESHOLDS: {
    aiErrorMin: number;
    fallbackRatio: number;
    handoffMin: number;
    publishFailureMin: number;
    quotaErrorMin: number;
    sourceErrorMin: number;
    unsafeDenialMin: number;
};
export declare function evaluateBotAlerts(input: BotAlertEvaluationInput, thresholds?: Partial<typeof DEFAULT_THRESHOLDS>): BotAlertEvaluation[];
export declare function summarizeBotMetricsForAlerts(snapshot: Array<{
    name: string;
    samples: Array<{
        labels: Record<string, string>;
        value?: number;
    }>;
    type: string;
}>): BotAlertEvaluationInput;
export {};
