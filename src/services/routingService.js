import { apiRequest } from "./apiClient.js";

const SERVICE = "routingService";

export const routingService = {
  async fetchWorkload(filters = {}) {
    return apiRequest("/routing/workload", {
      operation: "fetchWorkload",
      query: filters,
      service: SERVICE
    });
  },

  async simulateAssignment(payload = {}) {
    return apiRequest("/routing/assignments/simulate", {
      body: payload,
      method: "POST",
      operation: "simulateAssignment",
      service: SERVICE
    });
  },

  async createAssignment(payload = {}) {
    return apiRequest("/routing/assignments", {
      body: payload,
      method: "POST",
      operation: "createAssignment",
      service: SERVICE
    });
  },

  async previewRedistribution(payload = {}) {
    return apiRequest("/routing/redistribution/preview", {
      body: normalizeRedistributionPayload(payload),
      method: "POST",
      operation: "previewRedistribution",
      service: SERVICE
    });
  },

  async commitRedistribution(payload = {}) {
    return apiRequest("/routing/redistribution/commit", {
      body: normalizeRedistributionPayload(payload),
      method: "POST",
      operation: "commitRedistribution",
      service: SERVICE
    });
  },

  async pauseSla(payload = {}) {
    return apiRequest("/routing/sla/pause", {
      body: payload,
      method: "POST",
      operation: "pauseSla",
      service: SERVICE
    });
  },

  async startRescue(payload = {}) {
    return apiRequest("/routing/rescue/start", {
      body: payload,
      method: "POST",
      operation: "startRescue",
      service: SERVICE
    });
  },

  async resolveRescue(payload = {}) {
    return apiRequest("/routing/rescue/resolve", {
      body: payload,
      method: "POST",
      operation: "resolveRescue",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [
        "fetchWorkload",
        "simulateAssignment",
        "createAssignment",
        "previewRedistribution",
        "commitRedistribution",
        "pauseSla",
        "startRescue",
        "resolveRescue"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function normalizeRedistributionPayload(payload = {}) {
  return {
    idempotencyKey: String(payload.idempotencyKey ?? "").trim(),
    ...(payload.previewId ? { previewId: String(payload.previewId).trim() } : {}),
    reason: String(payload.reason ?? "Shift queue redistribution requested from panel").trim(),
    selectedQueues: Array.isArray(payload.selectedQueues) ? payload.selectedQueues.filter(Boolean) : [],
    targetRule: String(payload.targetRule ?? "least_loaded").trim() || "least_loaded"
  };
}
