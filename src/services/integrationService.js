import {
  activeSecuritySessions,
  apiChangelog,
  apiEnvironmentKeys,
  channelDetails,
  securityAlerts,
  securityControls,
  webhookDeliveryLog,
  webhookEndpoints
} from "../data.js";
import { createBackendErrorEnvelope, createEnvelope, makeAuditId, makeQueueId, makeRequestId } from "./mockBackend.js";

const SERVICE = "integrationService";

export const integrationService = {
  async fetchIntegrationWorkspace() {
    return createEnvelope({
      service: SERVICE,
      operation: "fetchIntegrationWorkspace",
      data: {
        channelDetails,
        apiEnvironmentKeys,
        webhookEndpoints,
        webhookDeliveryLog,
        apiChangelog,
        securityControls,
        activeSecuritySessions,
        securityAlerts
      },
      partial: true
    });
  },

  async testChannelConnection({ channel, message, mode = "receive", recipient }) {
    if (!recipient?.trim() || !message?.trim()) {
      return createBackendErrorEnvelope({
        service: SERVICE,
        operation: "testChannelConnection",
        code: "recipient_and_message_required",
        message: "recipient and message are required",
        data: { channel: channel?.channel ?? channel?.id ?? "unknown" }
      });
    }

    const channelId = channel?.id ?? String(channel?.channel ?? "channel").toLowerCase();
    const connection = channel?.connections?.[0]?.rawId ?? channel?.rawId ?? "conn_mock";

    return createEnvelope({
      service: SERVICE,
      operation: "testChannelConnection",
      data: {
        delivery: {
          channel: channel?.channel ?? channelId,
          connection,
          direction: mode,
          recipient,
          requestId: makeRequestId(channelId),
          status: mode === "receive" ? "accepted_to_queue" : "sent_to_channel"
        },
        auditId: makeAuditId("channel")
      }
    });
  },

  async rotateApiKey(keyId) {
    return createEnvelope({
      service: SERVICE,
      operation: "rotateApiKey",
      data: {
        keyId,
        status: "rotation_queued",
        rotationId: makeQueueId("key_rotation"),
        auditId: makeAuditId("key"),
        requires2fa: true
      }
    });
  },

  async replayWebhookDelivery(delivery) {
    return createEnvelope({
      service: SERVICE,
      operation: "replayWebhookDelivery",
      data: {
        deliveryId: delivery.id,
        originalTraceId: delivery.traceId,
        status: "replay_queued",
        replayId: makeQueueId("webhook_replay"),
        auditId: makeAuditId("webhook")
      }
    });
  },

  async revokeSecuritySession(sessionId) {
    return createEnvelope({
      service: SERVICE,
      operation: "revokeSecuritySession",
      data: {
        sessionId,
        status: "revoked",
        revokedAt: new Date().toISOString(),
        auditId: makeAuditId("session")
      }
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: ["fetchIntegrationWorkspace", "testChannelConnection", "rotateApiKey", "replayWebhookDelivery", "revokeSecuritySession"],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Channel tests, webhook replay, key rotation and session revoke now use service contracts."
    };
  }
};
