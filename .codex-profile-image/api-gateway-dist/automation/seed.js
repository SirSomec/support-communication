import { automationAuditEvents, botRuntimeInstances, botScenarios, botScenarioVersions, proactiveRules, runtimeMetrics } from "./seed-catalog.js";
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
export function bootstrapAutomationState(base) {
    return {
        botPublishAuditEvents: base?.botPublishAuditEvents ?? [],
        botRuntimeInstances: base?.botRuntimeInstances ?? clone(botRuntimeInstances),
        botRuntimeSideEffects: base?.botRuntimeSideEffects ?? [],
        botRuntimeSteps: base?.botRuntimeSteps ?? [],
        botScenarios: base?.botScenarios ?? clone(botScenarios),
        botScenarioVersions: base?.botScenarioVersions ?? clone(botScenarioVersions),
        botTestRuns: base?.botTestRuns ?? [],
        proactiveDeliveryAttributions: base?.proactiveDeliveryAttributions ?? [],
        proactiveDeliveryAttempts: base?.proactiveDeliveryAttempts ?? [],
        proactiveDeliveryIdempotencyKeys: base?.proactiveDeliveryIdempotencyKeys ?? [],
        proactiveExecutionWindows: base?.proactiveExecutionWindows ?? [],
        proactiveExperimentAssignments: base?.proactiveExperimentAssignments ?? [],
        proactiveFrequencyCaps: base?.proactiveFrequencyCaps ?? [],
        proactiveRules: base?.proactiveRules ?? clone(proactiveRules),
        publishIdempotencyKeys: base?.publishIdempotencyKeys ?? [],
        activeVisitors: base?.activeVisitors ?? [],
        rescueChats: base?.rescueChats ?? [],
        scenarioAuditEvents: base?.scenarioAuditEvents ?? [],
        workspaceAuditEvents: base?.workspaceAuditEvents ?? clone(automationAuditEvents),
        workspaceRuntimeMetrics: base?.workspaceRuntimeMetrics ?? clone(runtimeMetrics)
    };
}
export * from "./seed-catalog.js";
//# sourceMappingURL=seed.js.map