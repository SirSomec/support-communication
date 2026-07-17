import { createHash, randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { RealtimeEvent } from "../conversation/conversation.repository.js";
import { ConversationRepository } from "../conversation/conversation.repository.js";
import { createDisabledRealtimeFanoutAdapter, createRealtimeFanoutAdapterFromEnv, type RealtimeFanoutAdapter } from "../conversation/realtime.fanout.js";
import { IntegrationRepository, type ChannelConnectionStoredRecord } from "../integrations/integration.repository.js";
import {
  NotificationRepository,
  type NotificationActionTarget,
  type BrowserPushSubscriptionRecord,
  type NotificationCategory,
  type NotificationPreferenceAuditEvent,
  type NotificationPreferencesRecord,
  type NotificationRecord,
  type NotificationTone
} from "./notification.repository.js";

const NOTIFICATION_SERVICE = "notificationService";
const REALTIME_SCHEMA_VERSION = "1.0";
const DEV_BROWSER_PUSH_PUBLIC_KEY = "BJ0dA02pytrMj9D5Olp1WM4xuJ-PQIZeq01YMWSX0J6gOLWoLHhbnzLZfivD_SlSjEKBDr1a-B80aXSdYHUTyEE";

export interface NotificationRequestContext {
  tenantId?: string;
  userId?: string;
}

export interface CreateNotificationInput {
  action: string;
  actionTarget?: NotificationActionTarget | null;
  category: NotificationCategory;
  detail: string;
  history?: string;
  meta: string;
  recipientUserId?: string | null;
  tenantId: string;
  title: string;
  tone: NotificationTone;
  type: string;
  typeKey: string;
}

interface MarkNotificationsReadPayload {
  all?: boolean;
  notificationIds?: string[];
}

interface NotificationPreferencesPayload {
  browserPushEnabled?: boolean;
  browserPushEndpoint?: string | null;
  browserPushPermission?: string | null;
  browserPushSubscriptionId?: string | null;
  enabledExternalChannelIds?: string[];
  mutedSoundRuleIds?: string[];
  mutedTypeKeys?: string[];
}

interface CriticalAlertTestPayload {
  channelIds?: string[];
  includeBrowserPush?: boolean;
  message?: string;
}

interface BrowserPushSubscriptionPayload {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
  userAgent?: string | null;
}

interface NotificationServiceOptions {
  conversationRepository?: ConversationRepository;
  integrationRepository?: IntegrationRepository;
  notificationRepository?: NotificationRepository;
  realtimeFanout?: RealtimeFanoutAdapter;
}

let defaultRealtimeFanout = createDisabledRealtimeFanoutAdapter("notification_realtime_fanout_not_configured");

export class NotificationService {
  private readonly conversationRepository: ConversationRepository;
  private readonly integrationRepository: IntegrationRepository;
  private readonly notificationRepository: NotificationRepository;
  private readonly realtimeFanout: RealtimeFanoutAdapter;

  constructor(options: NotificationServiceOptions = {}) {
    this.conversationRepository = options.conversationRepository ?? ConversationRepository.default();
    this.integrationRepository = options.integrationRepository ?? IntegrationRepository.default();
    this.notificationRepository = options.notificationRepository ?? NotificationRepository.default();
    this.realtimeFanout = options.realtimeFanout ?? defaultRealtimeFanout;
  }

  static configureRealtimeFanoutFromEnv(source: NodeJS.ProcessEnv = process.env): void {
    defaultRealtimeFanout = createRealtimeFanoutAdapterFromEnv(source);
  }

  async fetchNotifications(
    filters: { unreadOnly?: boolean } = {},
    context: NotificationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    if (!tenantId) {
      return invalidEnvelope("fetchNotifications", "tenant_id_required", "Tenant id is required for notification reads.", {});
    }

    const notifications = await this.notificationRepository.listNotificationsAsync({
      tenantId,
      unreadOnly: filters.unreadOnly === true,
      userId: context.userId
    });
    const unreadCount = notifications.filter((item) => !item.readAt).length;

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "fetchNotifications",
      traceId: notificationTraceId("fetchNotifications"),
      partial: false,
      meta: apiMeta({ tenantId }),
      data: {
        items: notifications.map(toNotificationView),
        notifications: notifications.map(toNotificationView),
        tenantId,
        unreadCount
      }
    });
  }

  async markNotificationsRead(
    payload: MarkNotificationsReadPayload | null | undefined,
    context: NotificationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    if (!tenantId) {
      return invalidEnvelope("markNotificationsRead", "tenant_id_required", "Tenant id is required for notification updates.", {});
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return invalidEnvelope("markNotificationsRead", "notification_payload_required", "Notification mark-read payload is required.", {});
    }

    const notificationIds = Array.isArray(payload.notificationIds)
      ? payload.notificationIds.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];

    if (!payload.all && notificationIds.length === 0) {
      return invalidEnvelope("markNotificationsRead", "notification_ids_required", "Provide notificationIds or all=true.", {});
    }

    const readAt = new Date().toISOString();
    const updated = await this.notificationRepository.markNotificationsReadAsync({
      all: payload.all === true,
      notificationIds,
      readAt,
      tenantId,
      userId: context.userId
    });
    const unreadCount = (await this.notificationRepository.listNotificationsAsync({
      tenantId,
      userId: context.userId
    })).filter((item) => !item.readAt).length;

    for (const notification of updated) {
      await this.publishRealtimeEvent("notification.read", notification, { unreadCount });
    }

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "markNotificationsRead",
      traceId: notificationTraceId("markNotificationsRead"),
      partial: false,
      meta: apiMeta({ tenantId }),
      data: {
        items: updated.map(toNotificationView),
        readCount: updated.length,
        tenantId,
        unreadCount
      }
    });
  }

  async fetchNotificationPreferences(
    context: NotificationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    if (!tenantId) {
      return invalidEnvelope("fetchNotificationPreferences", "tenant_id_required", "Tenant id is required for notification preferences.", {});
    }

    const preferences = await this.notificationRepository.getNotificationPreferencesAsync({
      tenantId,
      userId: context.userId
    });

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "fetchNotificationPreferences",
      traceId: notificationTraceId("fetchNotificationPreferences"),
      partial: false,
      meta: apiMeta({ tenantId }),
      data: {
        preferences: toNotificationPreferencesView(preferences),
        tenantId
      }
    });
  }

  async fetchBrowserPushPublicKey(
    context: NotificationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    if (!tenantId) {
      return invalidEnvelope("fetchBrowserPushPublicKey", "tenant_id_required", "Tenant id is required for browser push setup.", {});
    }

    const publicKey = resolveBrowserPushPublicKey(process.env);
    if (!publicKey) {
      return invalidEnvelope(
        "fetchBrowserPushPublicKey",
        "browser_push_public_key_required",
        "Browser push requires a configured VAPID public key.",
        { tenantId }
      );
    }

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "fetchBrowserPushPublicKey",
      traceId: notificationTraceId("fetchBrowserPushPublicKey"),
      partial: false,
      meta: apiMeta({ tenantId }),
      data: {
        publicKey,
        tenantId
      }
    });
  }

  async createBrowserPushSubscription(
    payload: BrowserPushSubscriptionPayload | null | undefined,
    context: NotificationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    if (!tenantId) {
      return invalidEnvelope("createBrowserPushSubscription", "tenant_id_required", "Tenant id is required for browser push subscriptions.", {});
    }

    if (!resolveBrowserPushPublicKey(process.env)) {
      return invalidEnvelope(
        "createBrowserPushSubscription",
        "browser_push_public_key_required",
        "Browser push requires a configured VAPID public key.",
        { tenantId }
      );
    }

    const normalized = normalizeBrowserPushSubscriptionPayload(payload);
    if (!normalized.ok) {
      return invalidEnvelope(
        "createBrowserPushSubscription",
        normalized.code,
        normalized.message,
        { fields: normalized.fields, tenantId }
      );
    }

    const now = new Date().toISOString();
    const endpointHash = hashBrowserPushEndpoint(normalized.subscription.endpoint);
    const existing = (await this.notificationRepository.listBrowserPushSubscriptionsAsync({
      endpointHash,
      status: "active",
      tenantId,
      userId: context.userId ?? null
    }))[0];
    const subscription = await this.notificationRepository.saveBrowserPushSubscriptionAsync({
      createdAt: existing?.createdAt ?? now,
      endpoint: normalized.subscription.endpoint,
      endpointHash,
      expirationTime: normalized.subscription.expirationTime,
      id: existing?.id ?? `push_sub_${randomUUID()}`,
      keys: normalized.subscription.keys,
      revokedAt: null,
      status: "active",
      tenantId,
      updatedAt: now,
      userAgent: normalized.subscription.userAgent,
      userId: context.userId ?? null
    });
    const current = await this.notificationRepository.getNotificationPreferencesAsync({
      tenantId,
      userId: context.userId
    });
    const preferences = await this.notificationRepository.saveNotificationPreferencesAsync({
      ...current,
      browserPushEnabled: true,
      browserPushEndpoint: subscription.endpoint,
      browserPushPermission: "granted",
      browserPushSubscriptionId: subscription.id,
      updatedAt: now
    });
    const auditEvent = await this.notificationRepository.recordPreferenceAuditEventAsync({
      action: "notifications.browser-push.subscribe",
      at: now,
      id: `notif_push_${randomUUID()}`,
      immutable: true,
      reason: "Browser push subscription stored.",
      result: "ok",
      tenantId,
      traceId: notificationTraceId("createBrowserPushSubscription"),
      userId: context.userId ?? null
    });

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "createBrowserPushSubscription",
      traceId: notificationTraceId("createBrowserPushSubscription"),
      partial: false,
      meta: apiMeta({ tenantId }),
      data: {
        auditEvent: toNotificationPreferenceAuditView(auditEvent),
        preferences: toNotificationPreferencesView(preferences),
        subscription: toBrowserPushSubscriptionView(subscription),
        tenantId
      }
    });
  }

  async deleteBrowserPushSubscription(
    subscriptionId: string,
    context: NotificationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    if (!tenantId) {
      return invalidEnvelope("deleteBrowserPushSubscription", "tenant_id_required", "Tenant id is required for browser push subscriptions.", {});
    }

    const normalizedSubscriptionId = String(subscriptionId ?? "").trim();
    if (!normalizedSubscriptionId) {
      return invalidEnvelope(
        "deleteBrowserPushSubscription",
        "browser_push_subscription_id_required",
        "Browser push subscription id is required.",
        { tenantId }
      );
    }

    const now = new Date().toISOString();
    const revoked = await this.notificationRepository.revokeBrowserPushSubscriptionAsync({
      revokedAt: now,
      subscriptionId: normalizedSubscriptionId,
      tenantId,
      userId: context.userId ?? null
    });
    if (!revoked) {
      return invalidEnvelope(
        "deleteBrowserPushSubscription",
        "browser_push_subscription_not_found",
        "Browser push subscription was not found for the tenant user.",
        { subscriptionId: normalizedSubscriptionId, tenantId }
      );
    }

    const current = await this.notificationRepository.getNotificationPreferencesAsync({
      tenantId,
      userId: context.userId
    });
    const preferences = await this.notificationRepository.saveNotificationPreferencesAsync({
      ...current,
      browserPushEnabled: false,
      browserPushEndpoint: current.browserPushSubscriptionId === revoked.id ? null : current.browserPushEndpoint,
      browserPushPermission: "default",
      browserPushSubscriptionId: current.browserPushSubscriptionId === revoked.id ? null : current.browserPushSubscriptionId,
      updatedAt: now
    });
    const auditEvent = await this.notificationRepository.recordPreferenceAuditEventAsync({
      action: "notifications.browser-push.unsubscribe",
      at: now,
      id: `notif_push_${randomUUID()}`,
      immutable: true,
      reason: "Browser push subscription revoked.",
      result: "ok",
      tenantId,
      traceId: notificationTraceId("deleteBrowserPushSubscription"),
      userId: context.userId ?? null
    });

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "deleteBrowserPushSubscription",
      traceId: notificationTraceId("deleteBrowserPushSubscription"),
      partial: false,
      meta: apiMeta({ tenantId }),
      data: {
        auditEvent: toNotificationPreferenceAuditView(auditEvent),
        preferences: toNotificationPreferencesView(preferences),
        subscription: toBrowserPushSubscriptionView(revoked),
        tenantId
      }
    });
  }

  async updateNotificationPreferences(
    payload: NotificationPreferencesPayload | null | undefined,
    context: NotificationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    if (!tenantId) {
      return invalidEnvelope("updateNotificationPreferences", "tenant_id_required", "Tenant id is required for notification preference updates.", {});
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return invalidEnvelope("updateNotificationPreferences", "notification_preferences_payload_required", "Notification preferences payload is required.", {});
    }

    const current = await this.notificationRepository.getNotificationPreferencesAsync({
      tenantId,
      userId: context.userId
    });
    const nextExternalChannelIds = Array.isArray(payload.enabledExternalChannelIds)
      ? normalizeStringList(payload.enabledExternalChannelIds)
      : current.enabledExternalChannelIds;
    const externalChannelValidation = await this.resolveDeliverableExternalChannels(tenantId, nextExternalChannelIds);
    if (!externalChannelValidation.ok) {
      return invalidEnvelope(
        "updateNotificationPreferences",
        "notification_external_channel_unavailable",
        "Notification delivery channel must be an active connection owned by the tenant.",
        {
          unavailableChannelIds: externalChannelValidation.unavailableChannelIds,
          tenantId
        }
      );
    }

    const nextBrowserPushEnabled = typeof payload.browserPushEnabled === "boolean" ? payload.browserPushEnabled : current.browserPushEnabled;
    const requestedBrowserPushSubscriptionId = payload.browserPushSubscriptionId === undefined
      ? current.browserPushSubscriptionId
      : nullablePayloadString(payload.browserPushSubscriptionId);
    const activeBrowserPushSubscription = requestedBrowserPushSubscriptionId
      ? await this.notificationRepository.findBrowserPushSubscriptionAsync({
        subscriptionId: requestedBrowserPushSubscriptionId,
        tenantId,
        userId: context.userId ?? null
      })
      : undefined;
    if (nextBrowserPushEnabled && activeBrowserPushSubscription?.status !== "active") {
      return invalidEnvelope(
        "updateNotificationPreferences",
        "browser_push_subscription_required",
        "Browser push can be enabled only after a deliverable push subscription is stored.",
        { tenantId }
      );
    }

    const updatedAt = new Date().toISOString();
    const preferences = await this.notificationRepository.saveNotificationPreferencesAsync({
      ...current,
      browserPushEnabled: nextBrowserPushEnabled,
      browserPushEndpoint: nextBrowserPushEnabled
        ? activeBrowserPushSubscription?.endpoint ?? null
        : payload.browserPushEndpoint === undefined
          ? current.browserPushEndpoint
          : nullablePayloadString(payload.browserPushEndpoint),
      browserPushPermission: payload.browserPushPermission === undefined ? current.browserPushPermission : nullablePayloadString(payload.browserPushPermission),
      browserPushSubscriptionId: nextBrowserPushEnabled
        ? activeBrowserPushSubscription?.id ?? null
        : payload.browserPushSubscriptionId === undefined
          ? current.browserPushSubscriptionId
          : requestedBrowserPushSubscriptionId,
      enabledExternalChannelIds: nextExternalChannelIds,
      mutedSoundRuleIds: Array.isArray(payload.mutedSoundRuleIds)
        ? normalizeStringList(payload.mutedSoundRuleIds)
        : current.mutedSoundRuleIds,
      mutedTypeKeys: Array.isArray(payload.mutedTypeKeys)
        ? normalizeStringList(payload.mutedTypeKeys)
        : current.mutedTypeKeys,
      updatedAt
    });
    const auditEvent = await this.notificationRepository.recordPreferenceAuditEventAsync({
      action: "notifications.preferences.update",
      at: updatedAt,
      id: `notif_pref_${randomUUID()}`,
      immutable: true,
      reason: "Notification delivery preferences updated.",
      result: "ok",
      tenantId,
      traceId: notificationTraceId("updateNotificationPreferences"),
      userId: context.userId ?? null
    });

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "updateNotificationPreferences",
      traceId: notificationTraceId("updateNotificationPreferences"),
      partial: false,
      meta: apiMeta({ tenantId }),
      data: {
        auditEvent: toNotificationPreferenceAuditView(auditEvent),
        preferences: toNotificationPreferencesView(preferences),
        tenantId
      }
    });
  }

  async sendCriticalAlertTest(
    payload: CriticalAlertTestPayload | null | undefined,
    context: NotificationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = context.tenantId;
    if (!tenantId) {
      return invalidEnvelope("sendCriticalAlertTest", "tenant_id_required", "Tenant id is required for critical alert tests.", {});
    }

    const preferences = await this.notificationRepository.getNotificationPreferencesAsync({
      tenantId,
      userId: context.userId
    });
    const requestedChannels = Array.isArray(payload?.channelIds)
      ? normalizeStringList(payload?.channelIds)
      : [];
    const channelIds = requestedChannels.length ? requestedChannels : preferences.enabledExternalChannelIds;
    const externalChannelValidation = await this.resolveDeliverableExternalChannels(tenantId, channelIds);
    if (!externalChannelValidation.ok) {
      return invalidEnvelope(
        "sendCriticalAlertTest",
        "notification_external_channel_unavailable",
        "Notification delivery channel must be an active connection owned by the tenant.",
        {
          unavailableChannelIds: externalChannelValidation.unavailableChannelIds,
          tenantId
        }
      );
    }

    const deliveryResults: Array<Record<string, unknown>> = externalChannelValidation.channels.map((channel) => ({
      channelId: channel.id,
      channelName: channel.name,
      mode: "test",
      status: "queued",
      tenantId,
      type: channel.type
    }));
    let browserPushSubscription: BrowserPushSubscriptionRecord | undefined;

    if (payload?.includeBrowserPush === true) {
      browserPushSubscription = preferences.browserPushSubscriptionId
        ? await this.notificationRepository.findBrowserPushSubscriptionAsync({
          subscriptionId: preferences.browserPushSubscriptionId,
          tenantId,
          userId: context.userId ?? null
        })
        : undefined;
      if (!preferences.browserPushEnabled || browserPushSubscription?.status !== "active") {
        return invalidEnvelope(
          "sendCriticalAlertTest",
          "browser_push_subscription_required",
          "Browser push test requires a stored deliverable push subscription.",
          { tenantId }
        );
      }
    }

    if (!deliveryResults.length && !browserPushSubscription) {
      return invalidEnvelope(
        "sendCriticalAlertTest",
        "notification_delivery_channel_required",
        "At least one active notification delivery channel or push subscription is required.",
        { tenantId }
      );
    }

    const created = await this.createNotification({
      action: "Проверить critical route",
      category: "privileged_admin",
      detail: String(payload?.message ?? "Notification critical alert delivery route test.").trim() || "Notification critical alert delivery route test.",
      history: `${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · critical alert route test`,
      meta: "Notifications · delivery test",
      recipientUserId: context.userId ?? null,
      tenantId,
      title: "Critical alert test",
      tone: "warn",
      type: "Critical",
      typeKey: "critical"
    });
    const notification = created.data.notification as Record<string, unknown>;
    const now = new Date().toISOString();
    if (browserPushSubscription) {
      const descriptor = await this.notificationRepository.saveNotificationDeliveryDescriptorAsync({
        createdAt: now,
        endpointHash: browserPushSubscription.endpointHash,
        id: `notif_delivery_${randomUUID()}`,
        notificationId: String(notification.id),
        payload: {
          body: String(notification.detail ?? payload?.message ?? "Critical alert test"),
          title: String(notification.title ?? "Critical alert test"),
          url: "/#/app"
        },
        queue: "browser-push",
        status: "queued",
        subscriptionId: browserPushSubscription.id,
        tenantId,
        traceId: notificationTraceId("sendCriticalAlertTest"),
        type: "browser-push.critical-alert.test",
        userId: context.userId ?? null
      });
      deliveryResults.push({
        channelId: "browser-push",
        channelName: "Browser push",
        descriptorId: descriptor.id,
        endpointHash: descriptor.endpointHash,
        mode: "test",
        queue: descriptor.queue,
        status: descriptor.status,
        subscriptionId: descriptor.subscriptionId,
        tenantId,
        type: "browser-push"
      });
    }
    const auditEvent = await this.notificationRepository.recordPreferenceAuditEventAsync({
      action: "notifications.critical-alert.test",
      at: now,
      id: `notif_test_${randomUUID()}`,
      immutable: true,
      reason: "Critical alert test route executed.",
      result: "ok",
      tenantId,
      traceId: notificationTraceId("sendCriticalAlertTest"),
      userId: context.userId ?? null
    });

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "sendCriticalAlertTest",
      traceId: notificationTraceId("sendCriticalAlertTest"),
      partial: false,
      meta: apiMeta({ tenantId }),
      data: {
        auditEvent: toNotificationPreferenceAuditView(auditEvent),
        deliveryResults,
        notification,
        tenantId
      }
    });
  }

  async createNotification(input: CreateNotificationInput): Promise<BackendEnvelope<Record<string, unknown>>> {
    if (!input.tenantId) {
      return invalidEnvelope("createNotification", "tenant_id_required", "Tenant id is required to create notifications.", {});
    }

    const notification = await this.notificationRepository.saveNotificationAsync({
      action: input.action,
      actionTarget: input.actionTarget ?? null,
      category: input.category,
      createdAt: new Date().toISOString(),
      detail: input.detail,
      history: input.history ?? `${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · ${input.type} event`,
      id: `notif-${randomUUID()}`,
      meta: input.meta,
      readAt: null,
      recipientUserId: input.recipientUserId ?? null,
      tenantId: input.tenantId,
      title: input.title,
      tone: input.tone,
      type: input.type,
      typeKey: input.typeKey
    });
    const unreadCount = (await this.notificationRepository.listNotificationsAsync({ tenantId: input.tenantId }))
      .filter((item) => !item.readAt).length;

    await this.publishRealtimeEvent("notification.created", notification, { unreadCount });

    return createEnvelope({
      service: NOTIFICATION_SERVICE,
      operation: "createNotification",
      traceId: notificationTraceId("createNotification"),
      partial: false,
      meta: apiMeta({ tenantId: input.tenantId }),
      data: {
        notification: toNotificationView(notification),
        tenantId: input.tenantId,
        unreadCount
      }
    });
  }

  private async publishRealtimeEvent(
    eventName: "notification.created" | "notification.read",
    notification: NotificationRecord,
    extra: Record<string, unknown>
  ): Promise<void> {
    const event: RealtimeEvent = {
      data: {
        notification: toNotificationView(notification),
        ...extra
      },
      eventId: `rt_${randomUUID()}`,
      eventName,
      occurredAt: new Date().toISOString(),
      resourceId: notification.id,
      resourceType: "notification",
      schemaVersion: REALTIME_SCHEMA_VERSION,
      tenantId: notification.tenantId,
      traceId: notificationTraceId(eventName)
    };

    try {
      await this.conversationRepository.appendRealtimeEvent(event);
      await this.realtimeFanout.publish(event);
    } catch {
      // Persisted replay remains available when live fan-out is degraded.
    }
  }

  private async resolveDeliverableExternalChannels(
    tenantId: string,
    channelIds: string[]
  ): Promise<{ channels: ChannelConnectionStoredRecord[]; ok: true } | { ok: false; unavailableChannelIds: string[] }> {
    const unavailableChannelIds: string[] = [];
    const channels: ChannelConnectionStoredRecord[] = [];

    for (const channelId of channelIds) {
      const channel = await this.integrationRepository.findChannelConnectionAsync(tenantId, channelId);
      if (!channel || channel.status !== "active") {
        unavailableChannelIds.push(channelId);
        continue;
      }

      channels.push(channel);
    }

    if (unavailableChannelIds.length) {
      return { ok: false, unavailableChannelIds };
    }

    return { ok: true, channels };
  }
}

function toNotificationView(notification: NotificationRecord): Record<string, unknown> {
  return {
    action: notification.action,
    actionTarget: notification.actionTarget ?? null,
    category: notification.category,
    createdAt: notification.createdAt,
    detail: notification.detail,
    history: notification.history,
    id: notification.id,
    meta: notification.meta,
    read: Boolean(notification.readAt),
    readAt: notification.readAt,
    recipientUserId: notification.recipientUserId,
    tenantId: notification.tenantId,
    title: notification.title,
    tone: notification.tone,
    type: notification.type,
    typeKey: notification.typeKey
  };
}

function toNotificationPreferencesView(preferences: NotificationPreferencesRecord): Record<string, unknown> {
  return {
    browserPushEnabled: preferences.browserPushEnabled,
    browserPushEndpoint: preferences.browserPushEndpoint,
    browserPushPermission: preferences.browserPushPermission,
    browserPushSubscriptionId: preferences.browserPushSubscriptionId,
    enabledExternalChannelIds: [...preferences.enabledExternalChannelIds],
    mutedSoundRuleIds: [...preferences.mutedSoundRuleIds],
    mutedTypeKeys: [...preferences.mutedTypeKeys],
    tenantId: preferences.tenantId,
    updatedAt: preferences.updatedAt,
    userId: preferences.userId
  };
}

function toBrowserPushSubscriptionView(subscription: BrowserPushSubscriptionRecord): Record<string, unknown> {
  return {
    createdAt: subscription.createdAt,
    endpointHash: subscription.endpointHash,
    expirationTime: subscription.expirationTime,
    id: subscription.id,
    revokedAt: subscription.revokedAt,
    status: subscription.status,
    tenantId: subscription.tenantId,
    updatedAt: subscription.updatedAt,
    userAgent: subscription.userAgent,
    userId: subscription.userId
  };
}

function toNotificationPreferenceAuditView(event: NotificationPreferenceAuditEvent): Record<string, unknown> {
  return {
    action: event.action,
    at: event.at,
    id: event.id,
    immutable: event.immutable,
    reason: event.reason,
    result: event.result,
    tenantId: event.tenantId,
    traceId: event.traceId,
    userId: event.userId
  };
}

function notificationTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(NOTIFICATION_SERVICE, operation);
}

function apiMeta(meta: Record<string, unknown>): Record<string, unknown> {
  return {
    source: "api-gateway",
    ...meta
  };
}

function invalidEnvelope(
  operation: string,
  code: string,
  message: string,
  data: Record<string, unknown>
): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: NOTIFICATION_SERVICE,
    operation,
    traceId: notificationTraceId(operation),
    partial: false,
    meta: apiMeta({}),
    data,
    error: {
      code,
      message
    },
    status: "invalid"
  });
}

function normalizeStringList(values: unknown[]): string[] {
  return Array.from(new Set(
    values
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
  ));
}

function nullablePayloadString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function resolveBrowserPushPublicKey(source: NodeJS.ProcessEnv): string | null {
  const configured = String(source.BROWSER_PUSH_PUBLIC_KEY ?? source.VAPID_PUBLIC_KEY ?? "").trim();
  if (configured) {
    return configured;
  }

  const nodeEnv = String(source.NODE_ENV ?? "development").trim();
  if (nodeEnv === "development" || nodeEnv === "test") {
    return DEV_BROWSER_PUSH_PUBLIC_KEY;
  }

  return null;
}

function normalizeBrowserPushSubscriptionPayload(
  payload: BrowserPushSubscriptionPayload | null | undefined
): {
  code: string;
  fields: string[];
  message: string;
  ok: false;
} | {
  ok: true;
  subscription: {
    endpoint: string;
    expirationTime: number | null;
    keys: {
      auth: string;
      p256dh: string;
    };
    userAgent: string | null;
  };
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {
      code: "browser_push_subscription_payload_required",
      fields: ["payload"],
      message: "Browser push subscription payload is required.",
      ok: false
    };
  }

  const endpoint = String(payload.endpoint ?? "").trim();
  const p256dh = String(payload.keys?.p256dh ?? "").trim();
  const auth = String(payload.keys?.auth ?? "").trim();
  const expirationTime = typeof payload.expirationTime === "number" && Number.isFinite(payload.expirationTime)
    ? Math.trunc(payload.expirationTime)
    : null;
  const fields: string[] = [];

  if (!isDeliverablePushEndpoint(endpoint)) {
    fields.push("endpoint");
  }
  if (!p256dh) {
    fields.push("keys.p256dh");
  }
  if (!auth) {
    fields.push("keys.auth");
  }

  if (fields.length) {
    return {
      code: "browser_push_subscription_invalid",
      fields,
      message: "Browser push subscription requires a deliverable endpoint and auth keys.",
      ok: false
    };
  }

  return {
    ok: true,
    subscription: {
      endpoint,
      expirationTime,
      keys: {
        auth: auth.slice(0, 512),
        p256dh: p256dh.slice(0, 1024)
      },
      userAgent: nullablePayloadString(payload.userAgent)?.slice(0, 240) ?? null
    }
  };
}

function isDeliverablePushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return true;
    }

    return url.protocol === "http:" && ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function hashBrowserPushEndpoint(endpoint: string): string {
  return `sha256:${createHash("sha256").update(endpoint).digest("hex")}`;
}
