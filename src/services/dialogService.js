import { conversations } from "../data.js";
import { cloneEntity, createEnvelope, makeAuditId, makeQueueId } from "./mockBackend.js";

const SERVICE = "dialogService";

export const dialogService = {
  async fetchDialogs(filters = {}) {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchDialogs",
      data: {
        items: conversations,
        pagination: {
          mode: "backend-ready",
          page: filters.page ?? 1,
          pageSize: filters.pageSize ?? 25,
          total: conversations.length
        },
        savedPresetId: filters.savedPresetId ?? null
      },
      partial: true,
      meta: { filters }
    });
  },

  async transitionConversationStatus({ conversationId, nextStatus, roleMode }) {
    return createEnvelope({
      service: SERVICE,
      operation: "transitionConversationStatus",
      data: {
        conversationId,
        nextStatus,
        roleMode,
        transitionId: makeQueueId("dialog_transition"),
        guard: "role_channel_topic",
        auditId: makeAuditId("dialog")
      }
    });
  },

  async uploadAttachment({ channel, fileName, sizeBytes = 0 }) {
    return createEnvelope({
      service: SERVICE,
      operation: "uploadAttachment",
      data: {
        id: makeQueueId("attachment"),
        channel,
        fileName,
        sizeBytes,
        storageState: "upload_queued",
        antivirusState: "scan_pending",
        deliveryState: "not_sent",
        auditId: makeAuditId("attachment")
      }
    });
  },

  async createOutboundConversationRequest(payload) {
    return createEnvelope({
      service: SERVICE,
      operation: "createOutboundConversationRequest",
      data: {
        ...cloneEntity(payload),
        backendQueueId: makeQueueId("outbound"),
        status: "queued",
        consentCheck: "required_before_send",
        auditId: makeAuditId("outbound")
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "partial",
      operations: ["fetchDialogs", "transitionConversationStatus", "uploadAttachment", "createOutboundConversationRequest"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Queue pagination, transitions and attachments are backend-shaped but still mock-backed."
    };
  }
};
