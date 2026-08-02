export interface OperatorHandoffCitation {
    sourceId: string;
    title: string;
    version?: number;
}
export interface OperatorHandoffViewInput {
    aiOutcome?: string | null;
    citations?: OperatorHandoffCitation[] | null;
    collectedFields?: Record<string, unknown> | null;
    goal?: string | null;
    phone?: string | null;
    queue?: string | null;
    reason?: string | null;
    scenarioName?: string | null;
    sessionState?: string | null;
    topic?: string | null;
}
export interface OperatorHandoffView {
    aiOutcome: string;
    citations: OperatorHandoffCitation[];
    collectedFields: Array<{
        key: string;
        value: string;
    }>;
    goal: string;
    phone: string;
    queue: string;
    reason: string;
    scenarioName: string;
    sessionState: string;
    title: string;
    topic: string;
}
/** Compact operator-facing handoff card: goal, state, AI outcome, citations, transfer reason. */
export declare function buildOperatorHandoffView(input?: OperatorHandoffViewInput): OperatorHandoffView;
