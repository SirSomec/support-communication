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

  async createBotScenario(scenario = {}) {
    return apiRequest("/automation/bot-scenarios", {
      body: scenario,
      method: "POST",
      operation: "createBotScenario",
      service: SERVICE
    });
  },

  async updateBotScenario(scenarioId, scenario = {}) {
    if (!hasRouteId(scenarioId)) {
      return missingIdEnvelope("updateBotScenario", "Bot scenario id is required.");
    }

    return apiRequest(`/automation/bot-scenarios/${encodeURIComponent(scenarioId)}`, {
      body: scenario,
      method: "PATCH",
      operation: "updateBotScenario",
      service: SERVICE
    });
  },

  async listBotScenarios() {
    return apiRequest("/automation/bot-scenarios", { operation: "listBotScenarios", service: SERVICE });
  },

  async fetchBotScenario(scenarioId) {
    if (!hasRouteId(scenarioId)) return missingIdEnvelope("fetchBotScenario", "Bot scenario id is required.");
    return apiRequest(`/automation/bot-scenarios/${encodeURIComponent(scenarioId)}`, { operation: "fetchBotScenario", service: SERVICE });
  },

  async archiveBotScenario(scenarioId, options = {}) {
    if (!hasRouteId(scenarioId)) return missingIdEnvelope("archiveBotScenario", "Bot scenario id is required.");
    return lifecycleRequest(`/automation/bot-scenarios/${encodeURIComponent(scenarioId)}`, "DELETE", "archiveBotScenario", options);
  },

  async restoreBotScenario(scenarioId, options = {}) {
    if (!hasRouteId(scenarioId)) return missingIdEnvelope("restoreBotScenario", "Bot scenario id is required.");
    return lifecycleRequest(`/automation/bot-scenarios/${encodeURIComponent(scenarioId)}/restore`, "POST", "restoreBotScenario", options);
  },

  async disableBotScenario(scenarioId, options = {}) {
    if (!hasRouteId(scenarioId)) return missingIdEnvelope("disableBotScenario", "Bot scenario id is required.");
    return lifecycleRequest(`/automation/bot-scenarios/${encodeURIComponent(scenarioId)}/disable`, "POST", "disableBotScenario", options);
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [
        "fetchAutomationWorkspace",
        "listBotScenarios",
        "fetchBotScenario",
        "validateBotFlowImport",
        "publishBotScenario",
        "testBotScenario",
        "createBotScenario",
        "updateBotScenario",
        "disableBotScenario",
        "archiveBotScenario",
        "restoreBotScenario"
      ],
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

function lifecycleRequest(path, method, operation, options = {}) {
  const idempotencyKey = String(options.idempotencyKey ?? "").trim();
  const reason = String(options.reason ?? "").trim();
  return apiRequest(path, {
    ...(reason ? { body: { reason } } : {}),
    ...(idempotencyKey ? { headers: { "idempotency-key": idempotencyKey } } : {}),
    method,
    operation,
    service: SERVICE
  });
}
