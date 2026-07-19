import { apiDownload, apiRequest, createApiErrorEnvelope } from "./apiClient.js";

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
    if (!hasRouteId(conversationId)) return missingIdEnvelope("fetchDialogDetail", "Conversation id is required.");
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}`, {
      operation: "fetchDialogDetail",
      service: SERVICE
    });
  },

  async appendMessage({ conversationId, ...payload } = {}) {
    if (!hasRouteId(conversationId)) return missingIdEnvelope("appendMessage", "Conversation id is required.");
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/messages`, {
      body: payload,
      method: "POST",
      operation: "appendMessage",
      service: SERVICE
    });
  },

  async transitionConversationStatus({ conversationId, ...payload } = {}) {
    if (!hasRouteId(conversationId)) return missingIdEnvelope("transitionConversationStatus", "Conversation id is required.");
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/status`, {
      body: payload,
      method: "PATCH",
      operation: "transitionConversationStatus",
      service: SERVICE
    });
  },

  async updateConversationTags({ conversationId, ...payload } = {}) {
    if (!hasRouteId(conversationId)) return missingIdEnvelope("updateConversationTags", "Conversation id is required.");
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/tags`, {
      body: payload,
      method: "PATCH",
      operation: "updateConversationTags",
      service: SERVICE
    });
  },

  async updateConversationClientPhone({ conversationId, ...payload } = {}) {
    if (!hasRouteId(conversationId)) return missingIdEnvelope("updateConversationClientPhone", "Conversation id is required.");
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/client-phone`, {
      body: payload,
      method: "PATCH",
      operation: "updateConversationClientPhone",
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

  async fetchConversationTimeline(conversationId, filters = {}) {
    if (!hasRouteId(conversationId)) return missingIdEnvelope("fetchConversationTimeline", "Conversation id is required.");
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/timeline`, {
      operation: "fetchConversationTimeline",
      query: filters,
      service: SERVICE
    });
  },

  async fetchAssignees() {
    return apiRequest("/dialogs/assignees", {
      operation: "fetchAssignees",
      service: SERVICE
    });
  },

  async assignConversation({ conversationId, ...payload } = {}) {
    if (!hasRouteId(conversationId)) return missingIdEnvelope("assignConversation", "Conversation id is required.");
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/assignment`, {
      body: payload,
      method: "PATCH",
      operation: "assignConversation",
      service: SERVICE
    });
  },

  async finalizeAttachmentUpload({ fileId, ...payload } = {}) {
    if (!hasRouteId(fileId)) return missingIdEnvelope("finalizeAttachmentUpload", "Attachment id is required.");
    return apiRequest(`/dialogs/attachments/${encodeURIComponent(fileId)}/finalize`, {
      body: payload,
      method: "POST",
      operation: "finalizeAttachmentUpload",
      service: SERVICE
    });
  },

  async fetchAttachmentStatus(fileId) {
    if (!hasRouteId(fileId)) return missingIdEnvelope("fetchAttachmentUploadStatus", "Attachment id is required.");
    return apiRequest(`/dialogs/attachments/${encodeURIComponent(fileId)}/status`, {
      operation: "fetchAttachmentUploadStatus",
      service: SERVICE
    });
  },

  async downloadInboundAttachment({ attachmentId, conversationId, messageId } = {}) {
    if (!hasRouteId(conversationId) || !hasRouteId(messageId) || !hasRouteId(attachmentId)) return missingIdEnvelope("downloadInboundAttachment", "Attachment reference is required.");
    return apiDownload(`/dialogs/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/download`, {
      operation: "downloadInboundAttachment",
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

  async fetchAiReplySuggestions(conversationId) {
    if (!hasRouteId(conversationId)) return missingIdEnvelope("fetchAiReplySuggestions", "Conversation id is required.");
    return apiRequest(`/dialogs/${encodeURIComponent(conversationId)}/ai-suggestions`, {
      method: "POST",
      operation: "fetchAiReplySuggestions",
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
        "fetchConversationTimeline",
        "fetchAssignees",
        "assignConversation",
        "appendMessage",
        "transitionConversationStatus",
        "updateConversationTags",
        "updateConversationClientPhone",
        "fetchAiReplySuggestions",
        "uploadAttachment",
        "finalizeAttachmentUpload",
        "fetchAttachmentUploadStatus",
        "downloadInboundAttachment",
        "createOutboundConversationRequest"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway dialog routes."
    };
  }
};

function hasRouteId(value) {
  return String(value ?? "").trim().length > 0;
}

function missingIdEnvelope(operation, message) {
  return createApiErrorEnvelope({ code: "missing_id", message, operation, service: SERVICE });
}
