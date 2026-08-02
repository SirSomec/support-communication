import { type MetricLabels, type MetricsRegistry } from "@support-communication/observability";
/** Bot/AI automation metrics with bounded labels (tenant/scenario/reason codes only). */
export declare function botMetrics(registry?: MetricsRegistry): {
    aiLatencyMs: {
        observe(labels?: MetricLabels, value?: number): void;
    };
    aiRequests: {
        inc(labels?: MetricLabels, value?: number): void;
    };
    aiTokens: {
        inc(labels?: MetricLabels, value?: number): void;
    };
    deliveryFailures: {
        inc(labels?: MetricLabels, value?: number): void;
    };
    feedback: {
        inc(labels?: MetricLabels, value?: number): void;
    };
    handoffs: {
        inc(labels?: MetricLabels, value?: number): void;
    };
    publishFailures: {
        inc(labels?: MetricLabels, value?: number): void;
    };
    retrievalPassages: {
        observe(labels?: MetricLabels, value?: number): void;
    };
    retrievalRequests: {
        inc(labels?: MetricLabels, value?: number): void;
    };
    retrievalTopScore: {
        observe(labels?: MetricLabels, value?: number): void;
    };
    sourceErrors: {
        inc(labels?: MetricLabels, value?: number): void;
    };
    triggerMatches: {
        inc(labels?: MetricLabels, value?: number): void;
    };
};
export declare function recordBotTriggerMatch(input: {
    channel?: string;
    result: "matched" | "no_match";
    scenarioId?: string;
    tenantId: string;
}): void;
export declare function recordBotRetrieval(input: {
    cache: "hit" | "miss";
    /** BAI-875: which strategy produced the passages (*_fallback = strategy failed, lexical answered). */
    mode?: "lexical" | "llm" | "llm_fallback" | "semantic" | "semantic_fallback";
    passageCount: number;
    scenarioId?: string;
    tenantId: string;
    topScore?: number;
}): void;
export declare function recordBotSourceError(input: {
    failureCode: string;
    tenantId: string;
}): void;
export declare function recordBotAiRequest(input: {
    connectionId?: string;
    errorCode?: string;
    latencyMs?: number;
    scenarioId?: string;
    status: "ok" | "error";
    tenantId: string;
    tokens?: number;
}): void;
export declare function recordBotHandoff(input: {
    reason: string;
    scenarioId?: string;
    tenantId: string;
}): void;
export declare function recordBotAiFeedback(input: {
    outcome: string;
    scenarioId?: string;
    tenantId: string;
}): void;
export declare function recordBotPublishFailure(input: {
    errorCode: string;
    scenarioId?: string;
    tenantId: string;
}): void;
export declare function recordBotDeliveryFailure(input: {
    kind: "handoff" | "message";
    scenarioId?: string;
    tenantId: string;
}): void;
