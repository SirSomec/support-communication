import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { ConversationRepository } from "../apps/api-gateway/src/conversation/conversation.repository.ts";
import { createDisabledRealtimeFanoutAdapter } from "../apps/api-gateway/src/conversation/realtime.fanout.ts";
import { conversationFixtures } from "../apps/api-gateway/src/conversation/seed-catalog.ts";
import { IntegrationRepository, type ChannelConnectionStoredRecord } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import { resolveNotificationRequestContext } from "../apps/api-gateway/src/notifications/notification.context.ts";
import { NotificationRepository } from "../apps/api-gateway/src/notifications/notification.repository.ts";
import { NotificationService } from "../apps/api-gateway/src/notifications/notification.service.ts";

let tempWorkspaces: string[] = [];

describe("notification contracts", () => {
  let publishedEvents: Array<Record<string, unknown>>;

  beforeEach(() => {
    publishedEvents = [];
    tempWorkspaces = [];
    NotificationRepository.useDefault(NotificationRepository.inMemory());
    ConversationRepository.useDefault(ConversationRepository.inMemory());
    IntegrationRepository.useDefault(IntegrationRepository.inMemory());
  });

  afterEach(() => {
    for (const workspace of tempWorkspaces) {
      rmSync(workspace, { force: true, recursive: true });
    }
    NotificationRepository.clearDefault();
    ConversationRepository.useDefault(ConversationRepository.inMemory());
    IntegrationRepository.clearDefault();
  });

  function createService() {
    return new NotificationService({
      conversationRepository: ConversationRepository.default(),
      integrationRepository: IntegrationRepository.default(),
      notificationRepository: NotificationRepository.default(),
      realtimeFanout: {
        async publish(event) {
          publishedEvents.push(event as Record<string, unknown>);
          return {
            channel: "support:realtime",
            status: "published",
            subscribers: 1
          };
        },
        async subscribe() {
          return {
            async close() {},
            status: "disabled"
          };
        }
      }
    });
  }

  function saveChannelConnection(overrides: Partial<ChannelConnectionStoredRecord> = {}): ChannelConnectionStoredRecord {
    return IntegrationRepository.default().saveChannelConnection({
      chatLimit: 8,
      createdAt: "2026-07-02T09:00:00.000Z",
      credentialsMasked: true,
      environment: "production",
      health: 100,
      id: "conn_telegram_active",
      lastSyncAt: "2026-07-02T09:00:00.000Z",
      name: "Admin Telegram",
      rawExternalId: "telegram:admin",
      routingQueueId: "queue-telegram",
      status: "active",
      tenantId: "tenant-volga",
      traffic: "0 events",
      type: "telegram",
      updatedAt: "2026-07-02T09:00:00.000Z",
      webhookUrl: "http://127.0.0.1:4100/api/v1/integrations/telegram/webhook/conn_telegram_active",
      ...overrides
    });
  }

  it("returns tenant notifications with unread count", async () => {
    const notifications = createService();

    const response = await notifications.fetchNotifications({}, { tenantId: "tenant-volga" });

    assert.equal(response.status, "ok");
    assert.equal(response.data.tenantId, "tenant-volga");
    assert.ok(Array.isArray(response.data.items));
    assert.ok(response.data.items.length >= 4);
    assert.ok(response.data.unreadCount >= 3);
    assert.equal(response.data.items.some((item) => item.id === "notif-export-ready"), false);

    assert.deepEqual(response.data.items.find((item) => item.id === "notif-sla-vladimir")?.actionTarget, {
      kind: "navigate",
      resourceId: "vladimir",
      section: "dialogs"
    });
    assert.deepEqual(response.data.items.find((item) => item.id === "notif-mention-anna")?.actionTarget, {
      kind: "navigate",
      resourceId: "irina",
      section: "dialogs"
    });
    assert.deepEqual(response.data.items.find((item) => item.id === "notif-channel-vk")?.actionTarget, {
      kind: "navigate",
      resourceId: "vk",
      section: "settings"
    });
    assert.deepEqual(response.data.items.find((item) => item.id === "notif-privileged-admin")?.actionTarget, {
      kind: "navigate",
      resourceId: "service-admin-audit",
      section: "audit"
    });
  });

  it("keeps seeded dialog notification targets connected to real seeded dialogs", async () => {
    const notifications = createService();
    const dialogIds = new Set(conversationFixtures.map((conversation) => conversation.id));

    const response = await notifications.fetchNotifications({}, { tenantId: "tenant-volga" });
    const dialogTargets = response.data.items
      .map((item) => ({ id: item.id, target: item.actionTarget }))
      .filter(({ target }) => target?.kind === "navigate" && target.section === "dialogs");

    assert.ok(dialogTargets.length > 0);
    assert.deepEqual(
      dialogTargets.filter(({ target }) => !dialogIds.has(String(target?.resourceId))).map(({ id, target }) => ({
        id,
        resourceId: target?.resourceId
      })),
      []
    );
  });

  it("backfills export-ready action targets for existing Prisma notification rows", () => {
    const migration = readFileSync(new URL("../prisma/migrations/202607040002_notification_action_target_backfill/migration.sql", import.meta.url), "utf8");

    assert.match(migration, /UPDATE "notifications"/);
    assert.match(migration, /"action_target"/);
    assert.match(migration, /notif-export-ready/);
    assert.match(migration, /export-2418/);
  });

  it("backfills navigate action targets for existing Prisma notification rows", () => {
    const migration = readFileSync(new URL("../prisma/migrations/202607040004_notification_navigate_action_targets/migration.sql", import.meta.url), "utf8");

    assert.match(migration, /UPDATE "notifications"/);
    assert.match(migration, /notif-sla-vladimir[\s\S]*'kind', 'navigate'/);
    assert.match(migration, /'section', 'dialogs'[\s\S]*WHERE "id" = 'notif-mention-anna'/);
    assert.match(migration, /'section', 'settings'[\s\S]*WHERE "id" = 'notif-channel-vk'/);
    assert.match(migration, /'section', 'audit'[\s\S]*WHERE "id" = 'notif-privileged-admin'/);
  });

  it("repairs existing mention notification rows to a real dialog target", () => {
    const migration = readFileSync(new URL("../prisma/migrations/202607040006_notification_mention_dialog_target/migration.sql", import.meta.url), "utf8");

    assert.match(migration, /UPDATE "notifications"/);
    assert.match(migration, /'resourceId', 'irina'/);
    assert.match(migration, /WHERE "id" = 'notif-mention-anna'/);
  });

  it("seeds Prisma pilot notifications so the drawer has real action rows", () => {
    const migration = readFileSync(new URL("../prisma/migrations/202607040003_notification_pilot_seed/migration.sql", import.meta.url), "utf8");

    assert.match(migration, /INSERT INTO "notifications"/);
    assert.match(migration, /ON CONFLICT \("id"\) DO UPDATE/);
    assert.match(migration, /notif-export-ready/);
    assert.match(migration, /export-2418/);
  });

  it("marks notifications as read and updates unread count", async () => {
    const notifications = createService();

    const marked = await notifications.markNotificationsRead(
      { notificationIds: ["notif-sla-vladimir", "notif-channel-vk"] },
      { tenantId: "tenant-volga" }
    );
    const inbox = await notifications.fetchNotifications({}, { tenantId: "tenant-volga" });

    assert.equal(marked.status, "ok");
    assert.equal(marked.data.readCount, 2);
    assert.equal(inbox.data.items.find((item) => item.id === "notif-sla-vladimir")?.read, true);
    assert.equal(inbox.data.items.find((item) => item.id === "notif-channel-vk")?.read, true);
    assert.ok(inbox.data.unreadCount >= 1);
  });

  it("returns default notification delivery preferences for a tenant user", async () => {
    const notifications = createService() as unknown as {
      fetchNotificationPreferences?: (context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
    };

    assert.equal(typeof notifications.fetchNotificationPreferences, "function");

    const response = await notifications.fetchNotificationPreferences({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    assert.equal(response.status, "ok");
    assert.equal(response.data.tenantId, "tenant-volga");
    assert.equal(response.data.preferences.userId, "usr-volga-admin");
    assert.deepEqual(response.data.preferences.mutedTypeKeys, []);
    assert.equal(response.data.preferences.browserPushEnabled, false);
    assert.deepEqual(response.data.preferences.enabledExternalChannelIds, []);
  });

  it("persists notification delivery preferences with immutable audit evidence", async () => {
    const notifications = createService() as unknown as {
      fetchNotificationPreferences?: (context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
      updateNotificationPreferences?: (payload: Record<string, unknown>, context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
    };

    assert.equal(typeof notifications.updateNotificationPreferences, "function");
    assert.equal(typeof notifications.fetchNotificationPreferences, "function");

    saveChannelConnection({ id: "conn_email_digest", name: "Email digest", type: "sdk" });

    const updated = await notifications.updateNotificationPreferences({
      mutedTypeKeys: ["channel"],
      mutedSoundRuleIds: ["sound-mention"],
      enabledExternalChannelIds: ["conn_email_digest"]
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const fetched = await notifications.fetchNotificationPreferences({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const otherUser = await notifications.fetchNotificationPreferences({
      tenantId: "tenant-volga",
      userId: "usr-other"
    });

    assert.equal(updated.status, "ok");
    assert.equal(updated.data.preferences.browserPushEnabled, false);
    assert.deepEqual(updated.data.preferences.mutedTypeKeys, ["channel"]);
    assert.deepEqual(updated.data.preferences.mutedSoundRuleIds, ["sound-mention"]);
    assert.deepEqual(updated.data.preferences.enabledExternalChannelIds, ["conn_email_digest"]);
    assert.equal(updated.data.auditEvent.immutable, true);
    assert.match(updated.data.auditEvent.id, /^notif_pref_/);
    assert.deepEqual(fetched.data.preferences, updated.data.preferences);
    assert.deepEqual(otherUser.data.preferences.mutedTypeKeys, []);
  });

  it("rejects notification preferences that reference unknown, disabled or foreign external channels", async () => {
    saveChannelConnection({ id: "conn_telegram_active" });
    saveChannelConnection({ id: "conn_disabled", status: "disabled" });
    saveChannelConnection({ id: "conn_foreign", tenantId: "tenant-ladoga" });
    const notifications = createService();

    const unknown = await notifications.updateNotificationPreferences({
      enabledExternalChannelIds: ["conn_missing"]
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const disabled = await notifications.updateNotificationPreferences({
      enabledExternalChannelIds: ["conn_disabled"]
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const foreign = await notifications.updateNotificationPreferences({
      enabledExternalChannelIds: ["conn_foreign"]
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const active = await notifications.updateNotificationPreferences({
      enabledExternalChannelIds: ["conn_telegram_active"]
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    assert.equal(unknown.status, "invalid");
    assert.equal(unknown.error?.code, "notification_external_channel_unavailable");
    assert.equal(disabled.status, "invalid");
    assert.equal(foreign.status, "invalid");
    assert.equal(active.status, "ok");
    assert.deepEqual(active.data.preferences.enabledExternalChannelIds, ["conn_telegram_active"]);
  });

  it("configures durable notification preferences and audit evidence from runtime store file", async () => {
    const { configureNotificationRepository } = await import("../apps/api-gateway/src/notifications/bootstrap.ts");
    const filePath = join(makeTempWorkspace(), "notifications.json");

    configureNotificationRepository({ NOTIFICATION_STORE_FILE: filePath });
    saveChannelConnection({ id: "conn_runtime_alert" });
    const first = createService();
    const updated = await first.updateNotificationPreferences({
      enabledExternalChannelIds: ["conn_runtime_alert"],
      mutedSoundRuleIds: ["sound-critical"],
      mutedTypeKeys: ["sla"]
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    configureNotificationRepository({ NOTIFICATION_STORE_FILE: filePath });
    const second = createService();
    const fetched = await second.fetchNotificationPreferences({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const state = NotificationRepository.default().readState();

    assert.equal(updated.status, "ok");
    assert.deepEqual(fetched.data.preferences, updated.data.preferences);
    assert.equal(
      state.preferenceAuditEvents.some((event) => event.id === updated.data.auditEvent.id && event.immutable === true),
      true
    );
  });

  it("creates a critical alert test notification and delivery evidence", async () => {
    const notifications = createService() as unknown as {
      sendCriticalAlertTest?: (payload: Record<string, unknown>, context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
      updateNotificationPreferences?: (payload: Record<string, unknown>, context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
    };

    assert.equal(typeof notifications.updateNotificationPreferences, "function");
    assert.equal(typeof notifications.sendCriticalAlertTest, "function");

    saveChannelConnection({ id: "conn_telegram_active" });
    saveChannelConnection({ id: "conn_email_digest", name: "Email digest", type: "sdk" });

    await notifications.updateNotificationPreferences({
      enabledExternalChannelIds: ["conn_telegram_active", "conn_email_digest"]
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    const tested = await notifications.sendCriticalAlertTest({
      message: "Notification route smoke"
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    assert.equal(tested.status, "ok");
    assert.equal(tested.data.notification.typeKey, "critical");
    assert.equal(tested.data.notification.tenantId, "tenant-volga");
    assert.deepEqual(
      tested.data.deliveryResults.map((result: Record<string, unknown>) => result.channelId),
      ["conn_telegram_active", "conn_email_digest"]
    );
    assert.equal(tested.data.auditEvent.immutable, true);
    assert.match(tested.data.auditEvent.id, /^notif_test_/);
    assert.equal(publishedEvents.some((event) => event.eventName === "notification.created"), true);
  });

  it("fails critical alert tests closed when requested channels or browser push subscriptions are not deliverable", async () => {
    saveChannelConnection({ id: "conn_disabled", status: "disabled" });
    const notifications = createService();

    const missingChannel = await notifications.sendCriticalAlertTest({
      channelIds: ["conn_missing"],
      message: "Missing channel must not be queued"
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const disabledChannel = await notifications.sendCriticalAlertTest({
      channelIds: ["conn_disabled"],
      message: "Disabled channel must not be queued"
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const invalidPushEnable = await notifications.updateNotificationPreferences({
      browserPushEnabled: true,
      browserPushPermission: "granted"
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const pushWithoutSubscription = await notifications.sendCriticalAlertTest({
      channelIds: [],
      includeBrowserPush: true,
      message: "Push without subscription must not be queued"
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    assert.equal(missingChannel.status, "invalid");
    assert.equal(missingChannel.error?.code, "notification_external_channel_unavailable");
    assert.equal(disabledChannel.status, "invalid");
    assert.equal(invalidPushEnable.status, "invalid");
    assert.equal(invalidPushEnable.error?.code, "browser_push_subscription_required");
    assert.equal(pushWithoutSubscription.status, "invalid");
    assert.equal(pushWithoutSubscription.error?.code, "browser_push_subscription_required");
  });

  it("stores browser push subscriptions with sanitized evidence and immutable audit", async () => {
    const notifications = createService() as unknown as {
      createBrowserPushSubscription?: (payload: Record<string, unknown>, context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
      fetchNotificationPreferences?: (context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
    };

    assert.equal(typeof notifications.createBrowserPushSubscription, "function");
    assert.equal(typeof notifications.fetchNotificationPreferences, "function");

    const created = await notifications.createBrowserPushSubscription(sampleBrowserPushSubscription(), {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const fetched = await notifications.fetchNotificationPreferences({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const state = NotificationRepository.default().readState();

    assert.equal(created.status, "ok");
    assert.match(created.data.subscription.id, /^push_sub_/);
    assert.match(created.data.subscription.endpointHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(created.data.subscription.endpoint, undefined);
    assert.equal(created.data.subscription.keys, undefined);
    assert.equal(created.data.preferences.browserPushEnabled, true);
    assert.equal(created.data.preferences.browserPushSubscriptionId, created.data.subscription.id);
    assert.equal(created.data.auditEvent.action, "notifications.browser-push.subscribe");
    assert.equal(created.data.auditEvent.immutable, true);
    assert.equal(fetched.data.preferences.browserPushSubscriptionId, created.data.subscription.id);
    assert.equal(state.browserPushSubscriptions[0].endpoint, "https://push.example.test/subscription/volga-admin");
    assert.deepEqual(state.browserPushSubscriptions[0].keys, {
      auth: "auth-secret",
      p256dh: "p256dh-key"
    });
  });

  it("queues browser push delivery descriptors only for stored active subscriptions", async () => {
    const notifications = createService() as unknown as {
      createBrowserPushSubscription?: (payload: Record<string, unknown>, context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
      deleteBrowserPushSubscription?: (subscriptionId: string, context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
      sendCriticalAlertTest?: (payload: Record<string, unknown>, context: { tenantId: string; userId: string }) => Promise<Record<string, any>>;
    };

    assert.equal(typeof notifications.createBrowserPushSubscription, "function");
    assert.equal(typeof notifications.deleteBrowserPushSubscription, "function");
    assert.equal(typeof notifications.sendCriticalAlertTest, "function");

    const created = await notifications.createBrowserPushSubscription(sampleBrowserPushSubscription(), {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const tested = await notifications.sendCriticalAlertTest({
      channelIds: [],
      includeBrowserPush: true,
      message: "Push route smoke"
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const revoked = await notifications.deleteBrowserPushSubscription(created.data.subscription.id, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const afterRevoke = await notifications.sendCriticalAlertTest({
      channelIds: [],
      includeBrowserPush: true,
      message: "Revoked push route smoke"
    }, {
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const state = NotificationRepository.default().readState();

    assert.equal(tested.status, "ok");
    const pushDelivery = tested.data.deliveryResults.find((result: Record<string, unknown>) => result.type === "browser-push");
    assert.equal(pushDelivery.subscriptionId, created.data.subscription.id);
    assert.equal(pushDelivery.endpointHash, created.data.subscription.endpointHash);
    assert.match(pushDelivery.descriptorId, /^notif_delivery_/);
    assert.equal(
      state.deliveryDescriptors.some((descriptor) =>
        descriptor.id === pushDelivery.descriptorId
          && descriptor.subscriptionId === created.data.subscription.id
          && descriptor.status === "queued"
      ),
      true
    );
    assert.equal(revoked.status, "ok");
    assert.equal(revoked.data.preferences.browserPushEnabled, false);
    assert.equal(afterRevoke.status, "invalid");
    assert.equal(afterRevoke.error?.code, "browser_push_subscription_required");
  });

  it("creates notifications with structured action targets", async () => {
    const notifications = createService();

    const created = await notifications.createNotification({
      action: "Download",
      actionTarget: {
        fileName: "export-contract.xlsx",
        format: "XLSX",
        jobId: "export-contract",
        kind: "download",
        service: "reports"
      },
      category: "export_completion",
      detail: "XLSX file is ready.",
      meta: "Reports",
      tenantId: "tenant-volga",
      title: "Contract export ready",
      tone: "ok",
      type: "Export",
      typeKey: "export"
    });

    assert.equal(created.status, "ok");
    assert.deepEqual(created.data.notification.actionTarget, {
      fileName: "export-contract.xlsx",
      format: "XLSX",
      jobId: "export-contract",
      kind: "download",
      service: "reports"
    });
  });

  it("creates notifications and publishes realtime delivery", async () => {
    const notifications = createService();

    const created = await notifications.createNotification({
      tenantId: "tenant-volga",
      category: "export_completion",
      type: "Export",
      typeKey: "export",
      title: "Новый export готов",
      detail: "CSV, 12 строк",
      meta: "Отчеты",
      action: "Скачать",
      tone: "ok"
    });

    assert.equal(created.status, "ok");
    assert.equal(created.data.notification.typeKey, "export");
    assert.equal(publishedEvents.length, 1);
    assert.equal(publishedEvents[0].eventName, "notification.created");
    assert.equal(publishedEvents[0].resourceType, "notification");
  });

  it("isolates notifications between tenants", async () => {
    const notifications = createService();

    const volga = await notifications.fetchNotifications({}, { tenantId: "tenant-volga" });
    const ladoga = await notifications.fetchNotifications({}, { tenantId: "tenant-ladoga" });

    assert.ok(volga.data.items.every((item) => item.tenantId === "tenant-volga"));
    assert.ok(ladoga.data.items.every((item) => item.tenantId === "tenant-ladoga"));
    assert.notEqual(volga.data.items[0]?.id, ladoga.data.items[0]?.id);
  });

  it("persists realtime replay events for notification fanout", async () => {
    const conversationRepository = ConversationRepository.inMemory();
    const notifications = new NotificationService({
      conversationRepository,
      notificationRepository: NotificationRepository.inMemory(),
      realtimeFanout: createDisabledRealtimeFanoutAdapter("test_disabled")
    });

    await notifications.createNotification({
      tenantId: "tenant-volga",
      category: "channel_failure",
      type: "Channel",
      typeKey: "channel",
      title: "Webhook failure",
      detail: "Delivery retries exceeded",
      meta: "Integrations",
      action: "Открыть канал",
      tone: "warn"
    });

    const realtimeEvents = await conversationRepository.listRealtimeEvents({ tenantId: "tenant-volga" });
    assert.ok(realtimeEvents.some((event) => event.eventName === "notification.created"));
  });

  it("uses service-admin current tenant context for notification reads and mark-read", async () => {
    const serviceAdminRequest = {
      serviceAdminContext: {
        actor: { id: "svc-admin", name: "Service Admin" },
        currentTenantId: "tenant-volga",
        permissions: ["notifications.read"],
        roles: ["service_admin"],
        sessionId: "svc-session"
      }
    } as never;
    const context = resolveNotificationRequestContext(serviceAdminRequest);
    const notifications = createService();

    assert.deepEqual(context, {
      tenantId: "tenant-volga",
      userId: "svc-admin"
    });

    const inbox = await notifications.fetchNotifications({}, context);
    assert.equal(inbox.status, "ok");
    assert.equal(inbox.data.tenantId, "tenant-volga");
    assert.ok(Array.isArray(inbox.data.items));

    const marked = await notifications.markNotificationsRead({ notificationIds: ["notif-sla-vladimir"] }, context);
    assert.equal(marked.status, "ok");
    assert.equal(marked.data.tenantId, "tenant-volga");
    assert.equal(marked.data.items.some((item) => item.id === "notif-sla-vladimir" && item.read === true), true);
  });
});

function makeTempWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "support-notifications-"));
  tempWorkspaces.push(workspace);
  return workspace;
}

function sampleBrowserPushSubscription(): Record<string, unknown> {
  return {
    endpoint: "https://push.example.test/subscription/volga-admin",
    expirationTime: null,
    keys: {
      auth: "auth-secret",
      p256dh: "p256dh-key"
    },
    userAgent: "Playwright Chromium"
  };
}
