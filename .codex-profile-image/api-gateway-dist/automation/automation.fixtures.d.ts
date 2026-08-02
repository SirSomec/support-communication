export interface BotFlowNode {
    id: string;
    type: string;
    title?: string;
}
export interface BotFlowEdge {
    from: string;
    label?: string;
    to: string;
}
export interface BotScenario {
    channels: string[];
    createdAt?: string;
    flowEdges: BotFlowEdge[];
    flowNodes: BotFlowNode[];
    id: string;
    name: string;
    schemaVersion: "bot-flow/v1";
    status: string;
    tenantId?: string;
    updatedAt?: string;
}
export interface ProactiveRule {
    activeVariant?: string;
    channels: string[];
    cooldown?: string;
    id: string;
    segment?: string;
    status?: string;
}
export declare const botScenarios: BotScenario[];
export declare const proactiveRules: ProactiveRule[];
export declare const automationAuditEvents: {
    id: string;
    action: string;
    actor: string;
    target: string;
    immutable: boolean;
}[];
export declare const runtimeMetrics: {
    id: string;
    label: string;
    queue: string;
    value: string;
    detail: string;
}[];
