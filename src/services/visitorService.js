import { apiRequest } from "./apiClient.js";

const SERVICE = "visitorService";

export const visitorService = {
  async fetchVisitorWorkspace() {
    return apiRequest("/automation/workspace", {
      operation: "fetchVisitorWorkspace",
      service: SERVICE
    });
  },

  async saveProactiveRule(rule = {}) {
    return apiRequest("/automation/proactive-rules", {
      body: rule,
      method: "POST",
      operation: "saveProactiveRule",
      service: SERVICE
    });
  },

  async triggerRescueReturn(chat = {}) {
    return apiRequest("/automation/handoff-events", {
      body: normalizeHandoffEventPayload(chat),
      method: "POST",
      operation: "triggerRescueReturn",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchVisitorWorkspace", "saveProactiveRule", "triggerRescueReturn"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function normalizeHandoffEventPayload(chat) {
  return {
    botId: chat.botId ?? `bot-${safeId(chat.id ?? chat.channel ?? "visitor")}`,
    conversationId: chat.conversationId ?? chat.id,
    queue: chat.queue ?? chat.channel,
    reason: chat.reason ?? chat.nextAction,
    collectedFields: removeUndefined({
      client: chat.client,
      channel: chat.channel,
      operator: chat.operator,
      priority: chat.priority,
      timer: chat.timer,
      nextAction: chat.nextAction
    })
  };
}

function safeId(value) {
  return String(value ?? "visitor")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "visitor";
}

function removeUndefined(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}
