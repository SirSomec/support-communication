import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "automationService";

export const automationService = {
  async fetchAutomationWorkspace() {
    return apiRequest("/automation/workspace", {
      operation: "fetchAutomationWorkspace",
      service: SERVICE
    });
  },

  async validateBotFlowImport(input) {
    return apiRequest("/automation/bot-flow/validate", {
      body: input,
      method: "POST",
      operation: "validateBotFlowImport",
      service: SERVICE
    });
  },

  async publishBotScenario(scenario = {}) {
    if (!hasRouteId(scenario.id)) {
      return missingIdEnvelope("publishBotScenario", "Bot scenario id is required.");
    }

    return apiRequest(`/automation/bot-scenarios/${encodeURIComponent(scenario.id)}/publish`, {
      body: scenario,
      method: "POST",
      operation: "publishBotScenario",
      service: SERVICE
    });
  },

  async testBotScenario(scenario = {}) {
    if (!hasRouteId(scenario.id)) {
      return missingIdEnvelope("testBotScenario", "Bot scenario id is required.");
    }

    return apiRequest(`/automation/bot-scenarios/${encodeURIComponent(scenario.id)}/test-runs`, {
      body: scenario,
      method: "POST",
      operation: "testBotScenario",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchAutomationWorkspace", "validateBotFlowImport", "publishBotScenario", "testBotScenario"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function hasRouteId(value) {
  return String(value ?? "").trim().length > 0;
}

function missingIdEnvelope(operation, message) {
  return createApiErrorEnvelope({
    code: "missing_id",
    message,
    operation,
    service: SERVICE
  });
}
