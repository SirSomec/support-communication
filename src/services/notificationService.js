import { apiRequest, createApiErrorEnvelope } from "./apiClient.js";

const SERVICE = "notificationService";

export const notificationService = {
  async fetchNotifications(filters = {}) {
    return apiRequest("/notifications", {
      operation: "fetchNotifications",
      query: filters,
      service: SERVICE
    });
  },

  async markNotificationsRead(payload = {}) {
    return apiRequest("/notifications/mark-read", {
      body: payload,
      method: "POST",
      operation: "markNotificationsRead",
      service: SERVICE
    });
  },

  async fetchNotificationPreferences() {
    return apiRequest("/notifications/preferences", {
      operation: "fetchNotificationPreferences",
      service: SERVICE
    });
  },

  async updateNotificationPreferences(payload = {}) {
    return apiRequest("/notifications/preferences", {
      body: payload,
      method: "PATCH",
      operation: "updateNotificationPreferences",
      service: SERVICE
    });
  },

  async fetchBrowserPushPublicKey() {
    return apiRequest("/notifications/push-subscriptions/public-key", {
      operation: "fetchBrowserPushPublicKey",
      service: SERVICE
    });
  },

  async createBrowserPushSubscription(payload = {}) {
    return apiRequest("/notifications/push-subscriptions", {
      body: payload,
      method: "POST",
      operation: "createBrowserPushSubscription",
      service: SERVICE
    });
  },

  async deleteBrowserPushSubscription(subscriptionId) {
    const normalizedId = String(subscriptionId ?? "").trim();
    if (!normalizedId) {
      return missingIdEnvelope("deleteBrowserPushSubscription", "Browser push subscription id is required.");
    }

    return apiRequest(`/notifications/push-subscriptions/${encodeURIComponent(normalizedId)}`, {
      method: "DELETE",
      operation: "deleteBrowserPushSubscription",
      service: SERVICE
    });
  },

  async sendCriticalAlertTest(payload = {}) {
    return apiRequest("/notifications/test-critical-alert", {
      body: payload,
      method: "POST",
      operation: "sendCriticalAlertTest",
      service: SERVICE
    });
  },

  getReadiness() {
    return {
      id: SERVICE,
      status: "ready",
      operations: [
        "fetchNotifications",
        "markNotificationsRead",
        "fetchNotificationPreferences",
        "updateNotificationPreferences",
        "fetchBrowserPushPublicKey",
        "createBrowserPushSubscription",
        "deleteBrowserPushSubscription",
        "sendCriticalAlertTest"
      ],
      traceId: `trc_${SERVICE}_ready`,
      states: ["loading", "empty", "error", "partial"],
      note: "Connected to API Gateway routes."
    };
  }
};

function missingIdEnvelope(operation, message) {
  return createApiErrorEnvelope({
    code: "missing_id",
    message,
    operation,
    service: SERVICE
  });
}

export { missingIdEnvelope };
