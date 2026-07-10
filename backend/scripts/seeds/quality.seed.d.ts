import type { QualityMetric } from "../../apps/api-gateway/src/quality/quality.types.ts";
export declare const qualityMetrics: QualityMetric[];
export declare const aiSuggestions: {
    id: string;
    conversationId: string;
    type: string;
    title: string;
    suggestedTopic: string;
    tone: string;
    risk: string;
    confidence: number;
}[];
export declare const knowledgeArticles: {
    id: string;
    title: string;
    status: string;
    topics: string[];
    channels: string[];
    version: string;
}[];
export declare const aiRealtimeChecks: {
    id: string;
    label: string;
    score: number;
    state: string;
}[];
export declare const aiCoachingQueue: {
    id: string;
    channel: string;
    client: string;
    severity: string;
    topic: string;
    trigger: string;
}[];
export declare const aiEffectivenessMetrics: {
    id: string;
    label: string;
    value: string;
    detail: string;
}[];
