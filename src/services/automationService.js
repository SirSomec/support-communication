import { auditEvents, botScenarios, proactiveRules } from "../data.js";
import { createEnvelope, makeAuditId } from "./mockBackend.js";

const SERVICE = "automationService";
const validNodeTypes = new Set(["message", "quick_replies", "condition", "contact_request", "webhook", "handoff", "fallback"]);

export const automationService = {
  async fetchAutomationWorkspace() {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchAutomationWorkspace",
      data: {
        botScenarios,
        proactiveRules,
        auditEvents
      },
      partial: true
    });
  },

  async validateBotFlowImport(input) {
    let payload;
    const errors = [];

    try {
      payload = typeof input === "string" ? JSON.parse(input) : input;
    } catch (error) {
      errors.push(error.message || "invalid JSON");
    }

    if (payload) {
      if (!payload.name) {
        errors.push("name is required");
      }

      if (!Array.isArray(payload.flowNodes) || !payload.flowNodes.length) {
        errors.push("flowNodes are required");
      } else {
        for (const node of payload.flowNodes) {
          if (!node.id || !validNodeTypes.has(node.type)) {
            errors.push(`node ${node.id ?? "unknown"} has invalid type`);
          }
        }
      }

      if (payload.flowEdges !== undefined && (!Array.isArray(payload.flowEdges) || payload.flowEdges.some((edge) => !edge.from || !edge.to))) {
        errors.push("flowEdges must contain from and to");
      }
    }

    return createEnvelope({
      service: SERVICE,
      operation: "validateBotFlowImport",
      status: errors.length ? "invalid" : "ok",
      error: errors.length ? { code: "bot_flow_invalid", message: errors.join("; ") } : null,
      data: {
        valid: errors.length === 0,
        errors,
        payload: errors.length ? null : payload
      }
    });
  },

  async publishBotScenario(scenario) {
    return createEnvelope({
      service: SERVICE,
      operation: "publishBotScenario",
      data: {
        scenarioId: scenario.id,
        runtimeVersion: `runtime-${scenario.id}-${Date.now().toString(36)}`,
        channels: scenario.channels ?? [],
        versionState: "published",
        handoffEvents: "production_enabled",
        auditId: makeAuditId("bot")
      }
    });
  },

  async testBotScenario(scenario) {
    return createEnvelope({
      service: SERVICE,
      operation: "testBotScenario",
      data: {
        scenarioId: scenario.id,
        testRunId: `bot_test_${Date.now().toString(36)}`,
        cases: scenario.testCases ?? [],
        status: "running",
        auditId: makeAuditId("bot")
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchAutomationWorkspace", "validateBotFlowImport", "publishBotScenario", "testBotScenario"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Bot import/test/publish actions expose runtime version and audit ids."
    };
  }
};
