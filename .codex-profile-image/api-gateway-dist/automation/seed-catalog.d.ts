import type { BotScenario, ProactiveRule } from "./automation.types.js";
import type { AutomationBotRuntimeInstance, AutomationBotScenarioVersion } from "./automation.repository.js";
export declare const botScenarioVersions: AutomationBotScenarioVersion[];
export declare const botRuntimeInstances: AutomationBotRuntimeInstance[];
export declare const botScenarios: BotScenario[];
export declare const proactiveRules: ProactiveRule[];
export declare const automationAuditEvents: {
    id: string;
    action: string;
    actor: string;
    target: string;
    immutable: boolean;
    tenantId: string;
}[];
export declare const runtimeMetrics: {
    id: string;
    label: string;
    queue: string;
    value: string;
    detail: string;
}[];
