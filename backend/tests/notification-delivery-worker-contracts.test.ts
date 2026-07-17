import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { NotificationRepository } from "../apps/api-gateway/src/notifications/notification.repository.ts";
import {
  createDeterministicNotificationDeliveryProviderAdapter,
  createWebPushNotificationDeliveryProviderAdapter,
  createNotificationDeliveryProviderPort,
  executeNotificationDeliveryWorker
} from "../apps/api-gateway/src/notifications/notification-delivery.worker.ts";

describe("notification delivery worker contracts", () => {
  it("exposes a seeded notification delivery worker release smoke", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const releaseChecklist = readFileSync(new URL("../scripts/release-checklist.mjs", import.meta.url), "utf8");

    assert.equal(packageJson.scripts["notification:worker:once"], "npm run build && node --env-file=.env.example scripts/notification-delivery-worker-smoke.mjs");
    assert.equal(existsSync(new URL("../scripts/notification-delivery-worker-smoke.mjs", import.meta.url)), true);
    const smoke = readFileSync(new URL("../scripts/notification-delivery-worker-smoke.mjs", import.meta.url), "utf8");
    assert.match(smoke, /browserPushSubscription\.create/);
    assert.match(smoke, /notificationDeliveryDescriptor\.create/);
    assert.doesNotMatch(smoke, /NOTIFICATION_REPOSITORY/);
    assert.match(smoke, /NOTIFICATION_DELIVERY_PROVIDER_MODE: "local"/);
    assert.match(smoke, /result\.scanned !== 1/);
    assert.match(smoke, /result\.delivered !== 1/);
    assert.match(smoke, /result\.failed !== 0/);
    assert.match(smoke, /descriptor\.status !== "delivered"/);
    assert.match(releaseChecklist, /script: "notification:worker:once"/);
  });

  it("creates a fail-closed notification delivery provider port", () => {
    assert.throws(
      () => createNotificationDeliveryProviderPort({}),
      /notification_delivery_provider_send_required/
    );
  });

  it("delivers queued browser-push descriptors through the provider boundary", async () => {
    const repository = seedNotificationDeliveryRepository();
    const adapter = createDeterministicNotificationDeliveryProviderAdapter({
      now: () => new Date("2026-07-03T10:00:00.000Z")
    });
    const result = await executeNotificationDeliveryWorker({
      notificationRepository: repository,
      now: new Date("2026-07-03T10:00:00.000Z"),
      provider: createNotificationDeliveryProviderPort(adapter)
    });
    const descriptor = repository.readState().deliveryDescriptors.find((item) => item.id === "notif_delivery_worker_001");

    assert.deepEqual(result, {
      delivered: 1,
      failed: 0,
      retried: 0,
      scanned: 1
    });
    assert.equal(adapter.listDeliveries().length, 1);
    assert.deepEqual(adapter.listDeliveries()[0], {
      descriptorId: "notif_delivery_worker_001",
      endpoint: "https://push.worker.test/subscription/001",
      keys: {
        auth: "worker-auth-secret",
        p256dh: "worker-p256dh-key"
      },
      payload: {
        body: "Critical alert delivery body",
        title: "Critical alert test",
        url: "/#/app"
      },
      subscriptionId: "push_sub_worker_001",
      tenantId: "tenant-volga",
      traceId: "trc_notification_delivery_worker"
    });
    assert.equal(descriptor?.status, "delivered");
    assert.equal(descriptor?.attempts, 1);
    assert.equal(descriptor?.deliveredAt, "2026-07-03T10:00:00.000Z");
    assert.match(descriptor?.providerMessageId ?? "", /^deterministic_push_/);
  });

  it("claims a descriptor before provider I/O so overlapping workers cannot send it twice", async () => {
    const repository = seedNotificationDeliveryRepository();
    let releaseProvider!: () => void;
    let notifyEntered!: () => void;
    const entered = new Promise<void>((resolve) => {
      notifyEntered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    let sends = 0;
    const provider = createNotificationDeliveryProviderPort({
      async send() {
        sends += 1;
        notifyEntered();
        await blocked;
        return { providerMessageId: "provider-message-once" };
      }
    });

    const first = executeNotificationDeliveryWorker({
      notificationRepository: repository,
      now: new Date("2026-07-03T10:00:00.000Z"),
      provider
    });
    await entered;
    const overlapping = await executeNotificationDeliveryWorker({
      notificationRepository: repository,
      now: new Date("2026-07-03T10:00:01.000Z"),
      provider
    });
    releaseProvider();
    const completed = await first;

    assert.equal(sends, 1);
    assert.equal(overlapping.scanned, 0);
    assert.equal(completed.delivered, 1);
    assert.equal(repository.readState().deliveryDescriptors[0]?.attempts, 1);
  });

  it("recovers a processing descriptor after its worker lease expires", async () => {
    const repository = seedNotificationDeliveryRepository();
    const descriptor = repository.readState().deliveryDescriptors[0]!;
    repository.saveNotificationDeliveryDescriptor({
      ...descriptor,
      status: "processing",
      updatedAt: "2026-07-03T09:50:00.000Z"
    });

    const claimed = await repository.claimNotificationDeliveryDescriptorsAsync({
      leaseMs: 60_000,
      now: "2026-07-03T10:00:00.000Z",
      queue: "browser-push"
    });
    const duplicate = await repository.claimNotificationDeliveryDescriptorsAsync({
      leaseMs: 60_000,
      now: "2026-07-03T10:00:00.000Z",
      queue: "browser-push"
    });

    assert.deepEqual(claimed.map((item) => item.id), ["notif_delivery_worker_001"]);
    assert.equal(claimed[0]?.status, "processing");
    assert.equal(claimed[0]?.updatedAt, "2026-07-03T10:00:00.000Z");
    assert.deepEqual(duplicate, []);
  });

  it("adapts browser-push delivery requests to a web-push provider client", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const provider = createWebPushNotificationDeliveryProviderAdapter({
      sendNotification: async (subscription, payload, options) => {
        calls.push({ options, payload, subscription });
        return {
          headers: {
            location: "https://push.provider.test/messages/provider-message-001"
          },
          statusCode: 201
        };
      }
    });

    const delivered = await provider.send({
      descriptorId: "notif_delivery_web_push_001",
      endpoint: "https://push.provider.test/subscription/001",
      keys: {
        auth: "provider-auth-secret",
        p256dh: "provider-p256dh-key"
      },
      payload: {
        body: "Provider body",
        title: "Provider title",
        url: "/#/app"
      },
      subscriptionId: "push_sub_provider_001",
      tenantId: "tenant-volga",
      traceId: "trc_provider"
    });

    assert.equal(delivered.providerMessageId, "https://push.provider.test/messages/provider-message-001");
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].subscription, {
      endpoint: "https://push.provider.test/subscription/001",
      keys: {
        auth: "provider-auth-secret",
        p256dh: "provider-p256dh-key"
      }
    });
    assert.deepEqual(JSON.parse(String(calls[0].payload)), {
      body: "Provider body",
      title: "Provider title",
      url: "/#/app"
    });
    assert.deepEqual(calls[0].options, {
      TTL: 60,
      urgency: "high"
    });
  });

  it("retries provider failures without leaking push subscription secrets", async () => {
    const repository = seedNotificationDeliveryRepository();
    const result = await executeNotificationDeliveryWorker({
      notificationRepository: repository,
      now: new Date("2026-07-03T10:05:00.000Z"),
      provider: createNotificationDeliveryProviderPort({
        async send(request) {
          throw new Error(`provider failed for ${request.endpoint} ${request.keys.auth} ${request.keys.p256dh}`);
        }
      }),
      retryDelayMs: 60_000
    });
    const descriptor = repository.readState().deliveryDescriptors.find((item) => item.id === "notif_delivery_worker_001");

    assert.deepEqual(result, {
      delivered: 0,
      failed: 0,
      retried: 1,
      scanned: 1
    });
    assert.equal(descriptor?.status, "queued");
    assert.equal(descriptor?.attempts, 1);
    assert.equal(descriptor?.nextAttemptAt, "2026-07-03T10:06:00.000Z");
    assert.match(descriptor?.lastError ?? "", /provider failed/);
    assert.doesNotMatch(descriptor?.lastError ?? "", /https:\/\/push\.worker\.test/);
    assert.doesNotMatch(descriptor?.lastError ?? "", /worker-auth-secret/);
    assert.doesNotMatch(descriptor?.lastError ?? "", /worker-p256dh-key/);
  });

  it("claims only due queued browser-push descriptors and respects the worker limit", async () => {
    const repository = seedNotificationDeliveryRepository();
    repository.saveNotificationDeliveryDescriptor({
      createdAt: "2026-07-03T09:59:30.000Z",
      endpointHash: "sha256:worker-endpoint",
      id: "notif_delivery_worker_future",
      nextAttemptAt: "2026-07-03T10:30:00.000Z",
      notificationId: "notif-critical-worker",
      payload: {
        body: "Future delivery",
        title: "Critical alert test",
        url: "/#/app"
      },
      queue: "browser-push",
      status: "queued",
      subscriptionId: "push_sub_worker_001",
      tenantId: "tenant-volga",
      traceId: "trc_notification_delivery_worker",
      type: "browser-push.critical-alert.test",
      userId: "usr-volga-admin"
    });
    repository.saveNotificationDeliveryDescriptor({
      createdAt: "2026-07-03T10:00:00.000Z",
      endpointHash: "sha256:worker-endpoint",
      id: "notif_delivery_worker_second",
      notificationId: "notif-critical-worker",
      payload: {
        body: "Second due delivery",
        title: "Critical alert test",
        url: "/#/app"
      },
      queue: "browser-push",
      status: "queued",
      subscriptionId: "push_sub_worker_001",
      tenantId: "tenant-volga",
      traceId: "trc_notification_delivery_worker",
      type: "browser-push.critical-alert.test",
      userId: "usr-volga-admin"
    });
    const adapter = createDeterministicNotificationDeliveryProviderAdapter();

    const result = await executeNotificationDeliveryWorker({
      limit: 1,
      notificationRepository: repository,
      now: new Date("2026-07-03T10:05:00.000Z"),
      provider: createNotificationDeliveryProviderPort(adapter)
    });
    const state = repository.readState();

    assert.deepEqual(result, {
      delivered: 1,
      failed: 0,
      retried: 0,
      scanned: 1
    });
    assert.deepEqual(adapter.listDeliveries().map((delivery) => delivery.descriptorId), ["notif_delivery_worker_001"]);
    assert.equal(state.deliveryDescriptors.find((descriptor) => descriptor.id === "notif_delivery_worker_future")?.status, "queued");
    assert.equal(state.deliveryDescriptors.find((descriptor) => descriptor.id === "notif_delivery_worker_second")?.status, "queued");
  });

  it("delivers descriptors only from the explicitly configured notification queue", async () => {
    const repository = seedNotificationDeliveryRepository();
    repository.saveBrowserPushSubscription({
      createdAt: "2026-07-03T10:01:00.000Z",
      endpoint: "https://push.worker.test/subscription/smoke",
      endpointHash: "sha256:worker-smoke-endpoint",
      expirationTime: null,
      id: "push_sub_worker_smoke_queue",
      keys: {
        auth: "worker-smoke-auth-secret",
        p256dh: "worker-smoke-p256dh-key"
      },
      revokedAt: null,
      status: "active",
      tenantId: "tenant-volga",
      updatedAt: "2026-07-03T10:01:00.000Z",
      userAgent: "worker-smoke-test",
      userId: "usr-volga-admin"
    });
    repository.saveNotificationDeliveryDescriptor({
      createdAt: "2026-07-03T10:02:00.000Z",
      endpointHash: "sha256:worker-smoke-endpoint",
      id: "notif_delivery_worker_smoke_queue",
      notificationId: "notif-critical-worker-smoke",
      payload: {
        body: "Smoke queue delivery",
        title: "Critical alert smoke",
        url: "/#/app"
      },
      queue: "browser-push-smoke",
      status: "queued",
      subscriptionId: "push_sub_worker_smoke_queue",
      tenantId: "tenant-volga",
      traceId: "trc_notification_delivery_worker_smoke_queue",
      type: "browser-push.critical-alert.test",
      userId: "usr-volga-admin"
    });
    const adapter = createDeterministicNotificationDeliveryProviderAdapter();

    const result = await executeNotificationDeliveryWorker({
      notificationRepository: repository,
      now: new Date("2026-07-03T10:05:00.000Z"),
      provider: createNotificationDeliveryProviderPort(adapter),
      queue: "browser-push-smoke"
    });
    const state = repository.readState();

    assert.deepEqual(result, {
      delivered: 1,
      failed: 0,
      retried: 0,
      scanned: 1
    });
    assert.deepEqual(adapter.listDeliveries().map((delivery) => delivery.descriptorId), ["notif_delivery_worker_smoke_queue"]);
    assert.equal(state.deliveryDescriptors.find((descriptor) => descriptor.id === "notif_delivery_worker_smoke_queue")?.status, "delivered");
    assert.equal(state.deliveryDescriptors.find((descriptor) => descriptor.id === "notif_delivery_worker_001")?.status, "queued");
  });

  it("marks exhausted provider failures as terminal failed descriptors", async () => {
    const repository = seedNotificationDeliveryRepository();
    repository.saveNotificationDeliveryDescriptor({
      ...repository.readState().deliveryDescriptors.find((descriptor) => descriptor.id === "notif_delivery_worker_001")!,
      attempts: 2
    });

    const result = await executeNotificationDeliveryWorker({
      maxAttempts: 3,
      notificationRepository: repository,
      now: new Date("2026-07-03T10:15:00.000Z"),
      provider: createNotificationDeliveryProviderPort({
        async send() {
          throw new Error("provider still unavailable");
        }
      })
    });
    const descriptor = repository.readState().deliveryDescriptors.find((item) => item.id === "notif_delivery_worker_001");

    assert.deepEqual(result, {
      delivered: 0,
      failed: 1,
      retried: 0,
      scanned: 1
    });
    assert.equal(descriptor?.status, "failed");
    assert.equal(descriptor?.attempts, 3);
    assert.equal(descriptor?.failedAt, "2026-07-03T10:15:00.000Z");
    assert.equal(descriptor?.nextAttemptAt, null);
  });

  it("fails descriptors permanently when the active push subscription is missing", async () => {
    const repository = NotificationRepository.inMemory();
    repository.saveNotificationDeliveryDescriptor({
      createdAt: "2026-07-03T09:59:00.000Z",
      endpointHash: "sha256:missing",
      id: "notif_delivery_missing_subscription",
      notificationId: "notif-critical-worker",
      payload: {
        body: "Critical alert delivery body",
        title: "Critical alert test",
        url: "/#/app"
      },
      queue: "browser-push",
      status: "queued",
      subscriptionId: "push_sub_missing",
      tenantId: "tenant-volga",
      traceId: "trc_notification_delivery_worker",
      type: "browser-push.critical-alert.test",
      userId: "usr-volga-admin"
    });

    const result = await executeNotificationDeliveryWorker({
      notificationRepository: repository,
      now: new Date("2026-07-03T10:10:00.000Z"),
      provider: createNotificationDeliveryProviderPort(createDeterministicNotificationDeliveryProviderAdapter())
    });
    const descriptor = repository.readState().deliveryDescriptors.find((item) => item.id === "notif_delivery_missing_subscription");

    assert.deepEqual(result, {
      delivered: 0,
      failed: 1,
      retried: 0,
      scanned: 1
    });
    assert.equal(descriptor?.status, "failed");
    assert.equal(descriptor?.failedAt, "2026-07-03T10:10:00.000Z");
    assert.match(descriptor?.lastError ?? "", /browser_push_subscription_unavailable/);
  });
});

function seedNotificationDeliveryRepository(): NotificationRepository {
  const repository = NotificationRepository.inMemory();
  repository.saveBrowserPushSubscription({
    createdAt: "2026-07-03T09:58:00.000Z",
    endpoint: "https://push.worker.test/subscription/001",
    endpointHash: "sha256:worker-endpoint",
    expirationTime: null,
    id: "push_sub_worker_001",
    keys: {
      auth: "worker-auth-secret",
      p256dh: "worker-p256dh-key"
    },
    revokedAt: null,
    status: "active",
    tenantId: "tenant-volga",
    updatedAt: "2026-07-03T09:58:00.000Z",
    userAgent: "worker-test",
    userId: "usr-volga-admin"
  });
  repository.saveNotificationDeliveryDescriptor({
    createdAt: "2026-07-03T09:59:00.000Z",
    endpointHash: "sha256:worker-endpoint",
    id: "notif_delivery_worker_001",
    notificationId: "notif-critical-worker",
    payload: {
      body: "Critical alert delivery body",
      title: "Critical alert test",
      url: "/#/app"
    },
    queue: "browser-push",
    status: "queued",
    subscriptionId: "push_sub_worker_001",
    tenantId: "tenant-volga",
    traceId: "trc_notification_delivery_worker",
    type: "browser-push.critical-alert.test",
    userId: "usr-volga-admin"
  });

  return repository;
}
