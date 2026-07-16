import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { configureNotificationRepository } from "../apps/api-gateway/src/notifications/bootstrap.ts";
import {
  NotificationRepository,
  type BrowserPushSubscriptionRecord,
  type NotificationDeliveryDescriptor,
  type NotificationPreferenceAuditEvent,
  type NotificationPreferencesRecord,
  type NotificationRecord
} from "../apps/api-gateway/src/notifications/notification.repository.ts";

describe("Prisma-backed notification repository contracts", () => {
  it("bootstraps the default notification repository from a Prisma client factory", async () => {
    const { calls, client } = createFakePrismaNotificationClient();

    const repository = configureNotificationRepository({
      DATABASE_URL: "postgresql://support:support@127.0.0.1:56432/support_communication",
      NODE_ENV: "test"
    }, {
      prismaClientFactory(options) {
        calls.datasourceUrl = options.datasourceUrl;
        return client;
      }
    });

    await repository.saveNotificationAsync(notificationRecord({ id: "notif_prisma_bootstrap" }));
    const fetched = await NotificationRepository.default().listNotificationsAsync({ tenantId: "tenant-volga" });

    assert.equal(repository, NotificationRepository.default());
    assert.equal(calls.datasourceUrl, "postgresql://support:support@127.0.0.1:56432/support_communication");
    assert.deepEqual(fetched.map((notification) => notification.id), ["notif_prisma_bootstrap"]);
    assert.equal(calls.notificationUpserts.length, 1);
  });

  it("persists notification runtime state through Prisma delegates without JSON fallback", async () => {
    const { calls, client } = createFakePrismaNotificationClient();
    const repository = NotificationRepository.prisma({ client });
    const secondRepository = NotificationRepository.prisma({ client });
    const notification = notificationRecord({ id: "notif_prisma_runtime" });
    const preferences: NotificationPreferencesRecord = {
      browserPushEnabled: true,
      browserPushEndpoint: "https://push.example.test/subscription/runtime",
      browserPushPermission: "granted",
      browserPushSubscriptionId: "push_sub_prisma_runtime",
      enabledExternalChannelIds: ["conn_telegram_active"],
      mutedSoundRuleIds: ["sound-critical"],
      mutedTypeKeys: ["sla"],
      tenantId: "tenant-volga",
      updatedAt: "2026-07-03T10:01:00.000Z",
      userId: "usr-volga-admin"
    };
    const subscription: BrowserPushSubscriptionRecord = {
      createdAt: "2026-07-03T10:02:00.000Z",
      endpoint: "https://push.example.test/subscription/runtime",
      endpointHash: "sha256:runtime",
      expirationTime: null,
      id: "push_sub_prisma_runtime",
      keys: {
        auth: "runtime-auth-secret",
        p256dh: "runtime-p256dh-key"
      },
      revokedAt: null,
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-03T10:02:00.000Z",
      userAgent: "prisma-notification-test",
      userId: "usr-volga-admin"
    };
    const descriptor: NotificationDeliveryDescriptor = {
      createdAt: "2026-07-03T10:03:00.000Z",
      endpointHash: "sha256:runtime",
      id: "notif_delivery_prisma_runtime",
      notificationId: "notif_prisma_runtime",
      payload: {
        body: "Critical body",
        title: "Critical title",
        url: "/#/app"
      },
      queue: "browser-push",
      status: "queued",
      subscriptionId: "push_sub_prisma_runtime",
      tenantId: "tenant-volga",
      traceId: "trc_notification_prisma_runtime",
      type: "browser-push.critical-alert.test",
      userId: "usr-volga-admin"
    };
    const auditEvent: NotificationPreferenceAuditEvent = {
      action: "notifications.preferences.update",
      at: "2026-07-03T10:04:00.000Z",
      id: "notif_pref_prisma_runtime",
      immutable: true,
      reason: "Prisma notification preferences test.",
      result: "ok",
      tenantId: "tenant-volga",
      traceId: "trc_notification_prisma_runtime",
      userId: "usr-volga-admin"
    };

    await repository.saveNotificationAsync(notification);
    await repository.saveNotificationPreferencesAsync(preferences);
    await repository.saveBrowserPushSubscriptionAsync(subscription);
    await repository.saveNotificationDeliveryDescriptorAsync(descriptor);
    await repository.recordPreferenceAuditEventAsync(auditEvent);
    await repository.markNotificationsReadAsync({
      notificationIds: ["notif_prisma_runtime"],
      readAt: "2026-07-03T10:05:00.000Z",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    await repository.markNotificationDeliveryDescriptorFailedAsync({
      descriptorId: "notif_delivery_prisma_runtime",
      lastError: "provider temporarily unavailable",
      nextAttemptAt: "2026-07-03T10:06:00.000Z",
      retriable: true
    });
    await repository.markNotificationDeliveryDescriptorDeliveredAsync({
      deliveredAt: "2026-07-03T10:07:00.000Z",
      descriptorId: "notif_delivery_prisma_runtime",
      providerMessageId: "provider-message-runtime"
    });
    await repository.revokeBrowserPushSubscriptionAsync({
      revokedAt: "2026-07-03T10:08:00.000Z",
      subscriptionId: "push_sub_prisma_runtime",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    const notifications = await secondRepository.listNotificationsAsync({ tenantId: "tenant-volga" });
    const fetchedPreferences = await secondRepository.getNotificationPreferencesAsync({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const subscriptions = await secondRepository.listBrowserPushSubscriptionsAsync({
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });
    const descriptors = await secondRepository.listNotificationDeliveryDescriptorsAsync({ tenantId: "tenant-volga" });
    const foundDescriptorSubscription = await secondRepository.findBrowserPushSubscriptionAsync({
      subscriptionId: "push_sub_prisma_runtime",
      tenantId: "tenant-volga",
      userId: "usr-volga-admin"
    });

    assert.equal(notifications[0]?.readAt, "2026-07-03T10:05:00.000Z");
    assert.deepEqual(notifications[0]?.actionTarget, {
      fileName: "notif-prisma-runtime.xlsx",
      format: "XLSX",
      jobId: "export-prisma-runtime",
      kind: "download",
      service: "reports"
    });
    assert.deepEqual(calls.notificationUpserts[0]?.create.actionTarget, {
      fileName: "notif-prisma-runtime.xlsx",
      format: "XLSX",
      jobId: "export-prisma-runtime",
      kind: "download",
      service: "reports"
    });
    assert.deepEqual(fetchedPreferences.enabledExternalChannelIds, ["conn_telegram_active"]);
    assert.equal(subscriptions[0]?.status, "revoked");
    assert.equal(foundDescriptorSubscription?.revokedAt, "2026-07-03T10:08:00.000Z");
    assert.equal(descriptors[0]?.status, "delivered");
    assert.equal(descriptors[0]?.attempts, 2);
    assert.equal(descriptors[0]?.providerMessageId, "provider-message-runtime");
    assert.equal(calls.notificationUpserts.length, 2);
    assert.equal(calls.notificationPreferenceUpserts.length, 1);
    assert.equal(calls.browserPushSubscriptionUpserts.length, 2);
    assert.equal(calls.notificationDeliveryDescriptorUpserts.length, 3);
    assert.equal(calls.notificationPreferenceAuditEventUpserts.length, 1);
  });
});

function notificationRecord(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
  return {
    action: "Open",
    actionTarget: {
      fileName: "notif-prisma-runtime.xlsx",
      format: "XLSX",
      jobId: "export-prisma-runtime",
      kind: "download",
      service: "reports"
    },
    category: "sla_risk",
    createdAt: "2026-07-03T10:00:00.000Z",
    detail: "Prisma notification detail",
    history: "10:00 · created",
    id: "notif_prisma",
    meta: "Telegram",
    readAt: null,
    recipientUserId: "usr-volga-admin",
    tenantId: "tenant-volga",
    title: "Prisma notification",
    tone: "danger",
    type: "SLA",
    typeKey: "sla",
    ...overrides
  };
}

function createFakePrismaNotificationClient() {
  const notifications = new Map<string, FakeNotificationCreateInput>();
  const notificationPreferences = new Map<string, FakeNotificationPreferenceCreateInput>();
  const browserPushSubscriptions = new Map<string, FakeBrowserPushSubscriptionCreateInput>();
  const notificationDeliveryDescriptors = new Map<string, FakeNotificationDeliveryDescriptorCreateInput>();
  const notificationPreferenceAuditEvents = new Map<string, FakeNotificationPreferenceAuditEventCreateInput>();
  const calls = {
    browserPushSubscriptionUpserts: [] as Array<{
      create: FakeBrowserPushSubscriptionCreateInput;
      update: FakeBrowserPushSubscriptionUpdateInput;
      where: { id: string };
    }>,
    datasourceUrl: undefined as string | undefined,
    notificationDeliveryDescriptorUpserts: [] as Array<{
      create: FakeNotificationDeliveryDescriptorCreateInput;
      update: FakeNotificationDeliveryDescriptorUpdateInput;
      where: { id: string };
    }>,
    notificationPreferenceAuditEventUpserts: [] as Array<{
      create: FakeNotificationPreferenceAuditEventCreateInput;
      update: FakeNotificationPreferenceAuditEventUpdateInput;
      where: { id: string };
    }>,
    notificationPreferenceUpserts: [] as Array<{
      create: FakeNotificationPreferenceCreateInput;
      update: FakeNotificationPreferenceUpdateInput;
      where: { id: string };
    }>,
    notificationUpserts: [] as Array<{
      create: FakeNotificationCreateInput;
      update: FakeNotificationUpdateInput;
      where: { id: string };
    }>
  };

  return {
    calls,
    client: {
      browserPushSubscription: {
        findMany(input: { orderBy?: { createdAt: "desc" }; where?: Record<string, unknown> }) {
          return Promise.resolve(Array.from(browserPushSubscriptions.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          return Promise.resolve(browserPushSubscriptions.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeBrowserPushSubscriptionCreateInput;
          update: FakeBrowserPushSubscriptionUpdateInput;
          where: { id: string };
        }) {
          calls.browserPushSubscriptionUpserts.push(input);
          const current = browserPushSubscriptions.get(input.where.id);
          const next = current ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt } : input.create;
          browserPushSubscriptions.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      notification: {
        findMany(input: { orderBy: { createdAt: "desc" }; where?: Record<string, unknown> }) {
          return Promise.resolve(Array.from(notifications.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()));
        },
        findUnique(input: { where: { id: string } }) {
          return Promise.resolve(notifications.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeNotificationCreateInput;
          update: FakeNotificationUpdateInput;
          where: { id: string };
        }) {
          calls.notificationUpserts.push(input);
          const current = notifications.get(input.where.id);
          const next = current ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt } : input.create;
          notifications.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      notificationDeliveryDescriptor: {
        findMany(input: { orderBy: { createdAt: "asc" }; take?: number; where?: Record<string, unknown> }) {
          const rows = Array.from(notificationDeliveryDescriptors.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
          return Promise.resolve(Number.isInteger(input.take) ? rows.slice(0, input.take) : rows);
        },
        findUnique(input: { where: { id: string } }) {
          return Promise.resolve(notificationDeliveryDescriptors.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeNotificationDeliveryDescriptorCreateInput;
          update: FakeNotificationDeliveryDescriptorUpdateInput;
          where: { id: string };
        }) {
          calls.notificationDeliveryDescriptorUpserts.push(input);
          const current = notificationDeliveryDescriptors.get(input.where.id);
          const next = current ? { ...current, ...input.update, id: current.id, createdAt: current.createdAt } : input.create;
          notificationDeliveryDescriptors.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      notificationPreference: {
        findUnique(input: { where: { id: string } }) {
          return Promise.resolve(notificationPreferences.get(input.where.id) ?? null);
        },
        upsert(input: {
          create: FakeNotificationPreferenceCreateInput;
          update: FakeNotificationPreferenceUpdateInput;
          where: { id: string };
        }) {
          calls.notificationPreferenceUpserts.push(input);
          const current = notificationPreferences.get(input.where.id);
          const next = current ? { ...current, ...input.update, id: current.id } : input.create;
          notificationPreferences.set(input.where.id, next);
          return Promise.resolve(next);
        }
      },
      notificationPreferenceAuditEvent: {
        findMany(input: { orderBy: { at: "desc" }; where?: Record<string, unknown> }) {
          return Promise.resolve(Array.from(notificationPreferenceAuditEvents.values())
            .filter((row) => matchesWhere(row, input.where))
            .sort((left, right) => right.at.getTime() - left.at.getTime()));
        },
        upsert(input: {
          create: FakeNotificationPreferenceAuditEventCreateInput;
          update: FakeNotificationPreferenceAuditEventUpdateInput;
          where: { id: string };
        }) {
          calls.notificationPreferenceAuditEventUpserts.push(input);
          const current = notificationPreferenceAuditEvents.get(input.where.id);
          const next = current ? { ...current, ...input.update, id: current.id } : input.create;
          notificationPreferenceAuditEvents.set(input.where.id, next);
          return Promise.resolve(next);
        }
      }
    }
  };
}

interface FakeNotificationCreateInput {
  action: string;
  actionTarget: Record<string, unknown> | null;
  category: string;
  createdAt: Date;
  detail: string;
  history: string;
  id: string;
  meta: string;
  readAt: Date | null;
  recipientUserId: string | null;
  tenantId: string;
  title: string;
  tone: string;
  type: string;
  typeKey: string;
}

type FakeNotificationUpdateInput = Omit<FakeNotificationCreateInput, "createdAt" | "id">;

interface FakeNotificationPreferenceCreateInput {
  browserPushEnabled: boolean;
  browserPushEndpoint: string | null;
  browserPushPermission: string | null;
  browserPushSubscriptionId: string | null;
  enabledExternalChannelIds: string[];
  id: string;
  mutedSoundRuleIds: string[];
  mutedTypeKeys: string[];
  tenantId: string;
  updatedAt: Date;
  userId: string | null;
}

type FakeNotificationPreferenceUpdateInput = Omit<FakeNotificationPreferenceCreateInput, "id">;

interface FakeBrowserPushSubscriptionCreateInput {
  createdAt: Date;
  endpoint: string;
  endpointHash: string;
  expirationTime: number | null;
  id: string;
  keyAuth: string;
  keyP256dh: string;
  revokedAt: Date | null;
  status: string;
  tenantId: string;
  updatedAt: Date;
  userAgent: string | null;
  userId: string | null;
}

type FakeBrowserPushSubscriptionUpdateInput = Omit<FakeBrowserPushSubscriptionCreateInput, "createdAt" | "id">;

interface FakeNotificationDeliveryDescriptorCreateInput {
  attempts: number;
  createdAt: Date;
  deliveredAt: Date | null;
  endpointHash: string;
  failedAt: Date | null;
  id: string;
  lastError: string | null;
  nextAttemptAt: Date | null;
  notificationId: string;
  payload: Record<string, unknown>;
  providerMessageId: string | null;
  queue: string;
  status: string;
  subscriptionId: string;
  tenantId: string;
  traceId: string;
  type: string;
  updatedAt: Date;
  userId: string | null;
}

type FakeNotificationDeliveryDescriptorUpdateInput = Omit<FakeNotificationDeliveryDescriptorCreateInput, "createdAt" | "id">;

interface FakeNotificationPreferenceAuditEventCreateInput {
  action: string;
  at: Date;
  id: string;
  immutable: boolean;
  reason: string;
  result: string;
  tenantId: string;
  traceId: string;
  userId: string | null;
}

type FakeNotificationPreferenceAuditEventUpdateInput = Omit<FakeNotificationPreferenceAuditEventCreateInput, "id">;

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, value]) => {
    const rowValue = row[key];
    if (value && typeof value === "object" && "lte" in value) {
      const limit = (value as { lte: unknown }).lte;
      return rowValue instanceof Date && limit instanceof Date && rowValue.getTime() <= limit.getTime();
    }
    if (value && typeof value === "object" && "in" in value) {
      const allowed = (value as { in: unknown }).in;
      return Array.isArray(allowed) && allowed.includes(rowValue);
    }

    return rowValue === value;
  });
}
