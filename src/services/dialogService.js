import { apiRequest } from "./apiClient.js";

const SERVICE = "dialogService";

export const dialogService = {
  async fetchDialogs(filters = {}) {
    return apiRequest("/dialogs", {
      operation: "fetchDialogs",
      query: filters,
      service: SERVICE
    });
  },

  async transitionConversationStatus({ conversationId, ...payload }) {
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/status`, {
      body: payload,
      method: "PATCH",
      operation: "transitionConversationStatus",
      service: SERVICE
    });
  },

  async uploadAttachment(payload) {
    return apiRequest("/dialogs/attachments", {
      body: payload,
      method: "POST",
      operation: "uploadAttachment",
      service: SERVICE
    });
  },

  async createOutboundConversationRequest(payload) {
    return apiRequest("/dialogs/outbound", {
      body: payload,
      method: "POST",
      operation: "createOutboundConversationRequest",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchDialogs", "transitionConversationStatus", "uploadAttachment", "createOutboundConversationRequest"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway dialog routes."
    };
  }
};
