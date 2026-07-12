import type { AutomationState } from "./automation.repository.js";

import {

  automationAuditEvents,

  botScenarios,

  proactiveRules,

  runtimeMetrics

} from "./seed-catalog.js";



function clone<T>(value: T): T {

  return JSON.parse(JSON.stringify(value)) as T;

}



export function bootstrapAutomationState(base?: Partial<AutomationState>): AutomationState {

  return {

    botPublishAuditEvents: base?.botPublishAuditEvents ?? [],

    botRuntimeInstances: base?.botRuntimeInstances ?? [],

    botRuntimeSideEffects: base?.botRuntimeSideEffects ?? [],

    botRuntimeSteps: base?.botRuntimeSteps ?? [],

    botScenarios: base?.botScenarios ?? clone(botScenarios),

    botScenarioVersions: base?.botScenarioVersions ?? [],

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

    workspaceAuditEvents: base?.workspaceAuditEvents ?? clone(automationAuditEvents),

    workspaceRuntimeMetrics: base?.workspaceRuntimeMetrics ?? clone(runtimeMetrics)

  };

}



export * from "./seed-catalog.js";

