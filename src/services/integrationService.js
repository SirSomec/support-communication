import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "integrationService";

export const integrationService = {
  async fetchIntegrationWorkspace() {
    return apiRequest("/integrations/workspace", {
      operation: "fetchIntegrationWorkspace",
      service: SERVICE
    });
  },

  async fetchChannelConnections(filters = {}) {
    return apiRequest("/integrations/channels", {
      operation: "fetchChannelConnections",
      query: filters,
      service: SERVICE
    });
  },

  async createChannelConnection(payload = {}) {
    return apiRequest("/integrations/channels", {
      body: payload,
      method: "POST",
      operation: "createChannelConnection",
      service: SERVICE
    });
  },

  async updateChannelConnection({ connectionId, ...payload } = {}) {
    if (!hasRouteId(connectionId)) {
      return missingIdEnvelope("updateChannelConnection", "Channel connection id is required.");
    }

    return apiRequest(`/integrations/channels/${encodeURIComponent(connectionId)}`, {
      body: payload,
      method: "PATCH",
      operation: "updateChannelConnection",
      service: SERVICE
    });
  },

  async deleteChannelConnection({ connectionId, ...payload } = {}) {
    if (!hasRouteId(connectionId)) {
      return missingIdEnvelope("deleteChannelConnection", "Channel connection id is required.");
    }

    return apiRequest(`/integrations/channels/${encodeURIComponent(connectionId)}`, {
      body: payload,
      method: "DELETE",
      operation: "deleteChannelConnection",
      service: SERVICE
    });
  },

  async testChannelConnectionInstance({ connectionId, ...payload } = {}) {
    if (!hasRouteId(connectionId)) {
      return missingIdEnvelope("testChannelConnectionInstance", "Channel connection id is required.");
    }

    return apiRequest(`/integrations/channels/${encodeURIComponent(connectionId)}/test`, {
      body: payload,
      method: "POST",
      operation: "testChannelConnectionInstance",
      service: SERVICE
    });
  },

  async fetchChannelConnectionEvents(connectionId, filters = {}) {
    if (!hasRouteId(connectionId)) {
      return missingIdEnvelope("fetchChannelConnectionEvents", "Channel connection id is required.");
    }

    return apiRequest(`/integrations/channels/${encodeURIComponent(connectionId)}/events`, {
      operation: "fetchChannelConnectionEvents",
      query: filters,
      service: SERVICE
    });
  },

  async testChannelConnection(payload = {}) {
    return apiRequest("/integrations/channel-tests", {
      body: normalizeChannelTestPayload(payload),
      method: "POST",
      operation: "testChannelConnection",
      service: SERVICE
    });
  },

  async rotateApiKey(keyId) {
    if (!hasRouteId(keyId)) {
      return missingIdEnvelope("rotateApiKey", "API key id is required.");
    }

    return apiRequest(`/integrations/api-keys/${encodeURIComponent(keyId)}/rotate`, {
      method: "POST",
      operation: "rotateApiKey",
      service: SERVICE
    });
  },

  async replayWebhookDelivery(delivery = {}) {
    const deliveryId = getDeliveryId(delivery);
    if (!hasRouteId(deliveryId)) {
      return missingIdEnvelope("replayWebhookDelivery", "Webhook delivery id is required.");
    }

    return apiRequest(`/integrations/webhooks/deliveries/${encodeURIComponent(deliveryId)}/replay`, {
      body: delivery.idempotencyKey ? { idempotencyKey: delivery.idempotencyKey } : {},
      method: "POST",
      operation: "replayWebhookDelivery",
      service: SERVICE
    });
  },

  async revokeSecuritySession(sessionId) {
    if (!hasRouteId(sessionId)) {
      return missingIdEnvelope("revokeSecuritySession", "Security session id is required.");
    }

    return apiRequest(`/integrations/security/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: "POST",
      operation: "revokeSecuritySession",
      service: SERVICE
    });
  },

  async fetchTelegramConnection() {
    return apiRequest("/integrations/channels/telegram", {
      operation: "fetchTelegramConnection",
      service: SERVICE
    });
  },

  async saveTelegramConnection(payload = {}) {
    return apiRequest("/integrations/channels/telegram", {
      body: payload,
      method: "POST",
      operation: "saveTelegramConnection",
      service: SERVICE
    });
  },

  async disconnectTelegramConnection() {
    return apiRequest("/integrations/channels/telegram", {
      method: "DELETE",
      operation: "disconnectTelegramConnection",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [
        "fetchIntegrationWorkspace",
        "fetchChannelConnections",
        "createChannelConnection",
        "updateChannelConnection",
        "deleteChannelConnection",
        "testChannelConnectionInstance",
        "fetchChannelConnectionEvents",
        "testChannelConnection",
        "rotateApiKey",
        "replayWebhookDelivery",
        "revokeSecuritySession",
        "fetchTelegramConnection",
        "saveTelegramConnection",
        "disconnectTelegramConnection"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function normalizeChannelTestPayload({ channel, channelId, connectionId, environment, message, mode, recipient } = {}) {
  return removeUndefined({
    channelId: channelId ?? getChannelId(channel),
    connectionId: connectionId ?? channel?.connections?.[0]?.rawId ?? channel?.rawId,
    message,
    mode: mode ?? "receive",
    recipient,
    environment
  });
}

function getChannelId(channel) {
  if (!channel || typeof channel !== "object") {
    return channel;
  }

  return channel.id ?? channel.channel;
}

function getDeliveryId(delivery) {
  return delivery.id ?? delivery.deliveryId;
}

function removeUndefined(payload) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

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
