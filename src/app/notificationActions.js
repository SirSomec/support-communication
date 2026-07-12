import { mapNotificationItems } from "./notificationModel.js";

export function applyNotificationMarkReadResponse({ currentReadIds = [], fallbackIds = [], response }) {
  if (response.status !== "ok") {
    return {
      ok: false,
      ids: currentReadIds,
      message: response.error?.message ?? "Notification read state was not persisted."
    };
  }

  const items = mapNotificationItems(response.data?.items ?? []);
  if (!items.length) {
    if (response.data?.readCount === 0 && fallbackIds.length) {
      return {
        ok: true,
        ids: Array.from(new Set([...currentReadIds, ...fallbackIds]))
      };
    }

    return {
      ok: false,
      ids: currentReadIds,
      message: "Notification read state was not confirmed by the backend."
    };
  }

  return {
    ok: true,
    ids: Array.from(new Set([...currentReadIds, ...items.map((entry) => entry.id)]))
  };
}

export function applyNotificationPreferencesResponse({ currentPreferences = {}, response }) {
  if (response.status !== "ok") {
    return {
      ok: false,
      preferences: currentPreferences,
      message: response.error?.message ?? "Notification preference update was not persisted."
    };
  }

  const preferences = normalizeNotificationPreferences(response.data?.preferences);
  const auditEvent = response.data?.auditEvent;
  if (!preferences || !auditEvent?.id || auditEvent.immutable !== true) {
    return {
      ok: false,
      preferences: currentPreferences,
      message: "Notification preference evidence was not confirmed by the backend."
    };
  }

  return {
    ok: true,
    auditEvent,
    preferences
  };
}

export function applyCriticalAlertTestResponse({ response }) {
  if (response.status !== "ok") {
    return {
      ok: false,
      deliveredCount: 0,
      message: response.error?.message ?? "Critical alert test was not delivered."
    };
  }

  const deliveryResults = Array.isArray(response.data?.deliveryResults) ? response.data.deliveryResults : [];
  const auditEvent = response.data?.auditEvent;
  const notification = response.data?.notification;
  if (!notification?.id || !deliveryResults.length || !auditEvent?.id || auditEvent.immutable !== true) {
    return {
      ok: false,
      deliveredCount: 0,
      message: "Critical alert delivery evidence was not confirmed by the backend."
    };
  }

  return {
    ok: true,
    auditEvent,
    deliveredCount: deliveryResults.length,
    deliveryResults,
    notification
  };
}

export function applyBrowserPushSubscriptionResponse({ currentPreferences = {}, response }) {
  if (response.status !== "ok") {
    return {
      ok: false,
      preferences: currentPreferences,
      message: response.error?.message ?? "Browser push subscription was not persisted."
    };
  }

  const preferences = normalizeNotificationPreferences(response.data?.preferences);
  const auditEvent = response.data?.auditEvent;
  const subscription = normalizeBrowserPushSubscription(response.data?.subscription);
  if (!preferences || !subscription?.id || !auditEvent?.id || auditEvent.immutable !== true) {
    return {
      ok: false,
      preferences: currentPreferences,
      message: "Browser push subscription evidence was not confirmed by the backend."
    };
  }

  if (preferences.browserPushEnabled && preferences.browserPushSubscriptionId !== subscription.id) {
    return {
      ok: false,
      preferences: currentPreferences,
      message: "Browser push subscription evidence did not match backend preferences."
    };
  }

  return {
    ok: true,
    auditEvent,
    preferences,
    subscription
  };
}

export function normalizeNotificationPreferences(preferences = {}) {
  if (!preferences || typeof preferences !== "object") {
    return null;
  }

  return {
    browserPushEnabled: preferences.browserPushEnabled === true,
    browserPushEndpoint: preferences.browserPushEndpoint ?? null,
    browserPushPermission: preferences.browserPushPermission ?? null,
    browserPushSubscriptionId: preferences.browserPushSubscriptionId ?? null,
    enabledExternalChannelIds: normalizeStringList(preferences.enabledExternalChannelIds),
    mutedSoundRuleIds: normalizeStringList(preferences.mutedSoundRuleIds),
    mutedTypeKeys: normalizeStringList(preferences.mutedTypeKeys),
    tenantId: preferences.tenantId,
    updatedAt: preferences.updatedAt,
    userId: preferences.userId ?? null
  };
}

function normalizeBrowserPushSubscription(subscription = {}) {
  if (!subscription || typeof subscription !== "object") {
    return null;
  }

  const id = String(subscription.id ?? "").trim();
  const endpointHash = String(subscription.endpointHash ?? "").trim();
  const status = String(subscription.status ?? "").trim();
  if (!id || !endpointHash || !status) {
    return null;
  }

  return {
    createdAt: subscription.createdAt,
    endpointHash,
    expirationTime: subscription.expirationTime ?? null,
    id,
    revokedAt: subscription.revokedAt ?? null,
    status,
    tenantId: subscription.tenantId,
    updatedAt: subscription.updatedAt,
    userAgent: subscription.userAgent ?? null,
    userId: subscription.userId ?? null
  };
}

export function normalizeNotificationDeliveryChannels(response) {
  if (response?.status !== "ok") {
    return [];
  }

  const connections = Array.isArray(response.data?.connections) ? response.data.connections : [];
  return connections
    .filter((connection) =>
      String(connection?.id ?? "").trim()
        && String(connection?.status ?? "").trim().toLowerCase() === "active"
    )
    .map((connection) => {
      const type = String(connection.type ?? "channel").trim() || "channel";
      const environment = String(connection.environment ?? "production").trim() || "production";
      return {
        detail: `${type} · ${environment}`,
        id: String(connection.id).trim(),
        label: String(connection.name ?? connection.id).trim() || String(connection.id).trim()
      };
    });
}

function normalizeStringList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
  ));
}
