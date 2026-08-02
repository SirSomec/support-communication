/** Schema-only DTOs: runtime validation remains in AutomationService so old clients keep working. */
export declare class BotScenarioTriggerRuleDto {
    type: "manual" | "new_conversation" | "phrase" | "always_except";
    matchMode?: "exact" | "contains" | "tokens";
    phrases?: string[];
    priority?: number;
}
export declare class BotScenarioDto {
    id: string;
    name: string;
    channels: string[];
    status: string;
    triggerRules?: BotScenarioTriggerRuleDto[];
    flowNodes?: Array<Record<string, unknown>>;
    flowEdges?: Array<Record<string, unknown>>;
    sourceBindings?: Array<Record<string, unknown>>;
}
export declare class BotScenarioMutationDto {
    id?: string;
    name?: string;
    channels?: string[];
    triggerRules?: BotScenarioTriggerRuleDto[];
    flowNodes?: Array<Record<string, unknown>>;
    flowEdges?: Array<Record<string, unknown>>;
    sourceBindings?: Array<Record<string, unknown>>;
}
export declare class BotScenarioPublishDto extends BotScenarioMutationDto {
    idempotencyKey?: string;
}
export declare class BotScenarioActionDto {
    reason?: string;
}
export declare class BotScenarioTestRunDto {
    name?: string;
    testMessage?: string;
    testCases?: Array<Record<string, unknown>>;
}
export declare class BotSandboxSessionCreateDto {
    channel?: string;
    locale?: string;
    mode?: string;
}
export declare class BotSandboxMessageDto {
    messageId?: string;
    text?: string;
    quickReply?: string;
    value?: unknown;
    webhooksEnabled?: boolean;
}
export declare class AutomationEnvelopeDto {
    service: string;
    operation: string;
    status: string;
    traceId: string;
    data: Record<string, unknown>;
    error?: Record<string, unknown> | null;
    meta: Record<string, unknown>;
}
