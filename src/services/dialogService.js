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

  async fetchDialogDetail(conversationId) {
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}`, {
      operation: "fetchDialogDetail",
      service: SERVICE
    });
  },

  async appendMessage({ conversationId, ...payload }) {
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/messages`, {
      body: payload,
      method: "POST",
      operation: "appendMessage",
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

  async fetchAssignees() {
    return apiRequest("/dialogs/assignees", {
      operation: "fetchAssignees",
      service: SERVICE
    });
  },

  async assignConversation({ conversationId, ...payload }) {
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/assignment`, {
      body: payload,
      method: "PATCH",
      operation: "assignConversation",
      service: SERVICE
    });
  },

  async finalizeAttachmentUpload({ fileId, ...payload }) {
    return apiRequest(`/dialogs/attachments/${encodeURIComponent(fileId)}/finalize`, {
      body: payload,
      method: "POST",
      operation: "finalizeAttachmentUpload",
      service: SERVICE
    });
  },

  async fetchAttachmentStatus(fileId) {
    return apiRequest(`/dialogs/attachments/${encodeURIComponent(fileId)}/status`, {
      operation: "fetchAttachmentUploadStatus",
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
      operations: [
        "fetchDialogs",
        "fetchDialogDetail",
        "fetchAssignees",
        "assignConversation",
        "appendMessage",
        "transitionConversationStatus",
        "uploadAttachment",
        "finalizeAttachmentUpload",
        "fetchAttachmentUploadStatus",
        "createOutboundConversationRequest"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway dialog routes."
    };
  }
};
