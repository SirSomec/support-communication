export declare const AI_CLOSED_CONVERSATION_OPERATOR = "ai-bot";
export interface QualityMetric {
    channel: string;
    client: string;
    conversationId: string;
    id: string;
    operator: string;
    scale: "CSAT" | "CSI" | "QA";
    score: number;
    status: string;
    topic: string;
}
