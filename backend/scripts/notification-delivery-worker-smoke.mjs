import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "notification_delivery_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  descriptorId: `notif_delivery_${runId}`,
  endpoint: `https://push.smoke.test/subscription/${runId}`,
  endpointHash: `sha256:${runId}`,
  keyAuth: `auth_${runId}`,
  keyP256dh: `p256dh_${runId}`,
  notificationId: `notif_${runId}`,
  queue: `browser_push_${runId}`,
  subscriptionId: `push_sub_${runId}`,
  tenantId: `tenant_${runId}`,
  traceId: `trc_${runId}`,
  userId: `usr_${runId}`
};

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeNotificationDelivery(client, smoke);

  const output = await runWorkerOnce();
  const result = parseWorkerRunResult(output.stdout);
  if (result.scanned !== 1 || result.delivered !== 1 || result.failed !== 0 || result.retried !== 0) {
    throw new Error(`notification_delivery_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const descriptor = await assertPersistedDelivery(client, smoke);
  process.stdout.write(`notification delivery worker smoke passed ${JSON.stringify({
    descriptorId: smoke.descriptorId,
    providerMessageId: descriptor.providerMessageId,
    result,
    status: descriptor.status,
    subscriptionId: smoke.subscriptionId
  })}\n`);
} finally {
  if (process.env.NOTIFICATION_DELIVERY_WORKER_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
  }
  await client.$disconnect?.();
}

async function seedSmokeNotificationDelivery(prisma, input) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  await prisma.$transaction(async (transaction) => {
    await transaction.browserPushSubscription.create({
      data: {
        createdAt,
        endpoint: input.endpoint,
        endpointHash: input.endpointHash,
        expirationTime: null,
        id: input.subscriptionId,
        keyAuth: input.keyAuth,
        keyP256dh: input.keyP256dh,
        revokedAt: null,
        status: "active",
        tenantId: input.tenantId,
        updatedAt: createdAt,
        userAgent: "notification-delivery-worker-smoke",
        userId: input.userId
      }
    });

    await transaction.notificationDeliveryDescriptor.create({
      data: {
        attempts: 0,
        createdAt,
        deliveredAt: null,
        endpointHash: input.endpointHash,
        failedAt: null,
        id: input.descriptorId,
        lastError: null,
        nextAttemptAt: null,
        notificationId: input.notificationId,
        payload: {
          body: "Notification delivery worker smoke body",
          title: "Notification smoke",
          url: "/#/app"
        },
        providerMessageId: null,
        queue: input.queue,
        status: "queued",
        subscriptionId: input.subscriptionId,
        tenantId: input.tenantId,
        traceId: input.traceId,
        type: "browser-push.critical-alert.test",
        updatedAt: createdAt,
        userId: input.userId
      }
    });
  });
}

async function runWorkerOnce() {
  const env = {
    ...process.env,
    NODE_ENV: "development",
    NOTIFICATION_DELIVERY_LIMIT: "1",
    NOTIFICATION_DELIVERY_PROVIDER_MODE: "local",
    NOTIFICATION_DELIVERY_QUEUE: smoke.queue,
    NOTIFICATION_REPOSITORY: "prisma",
    RUNTIME_PROFILE: "local"
  };
  const child = spawn(process.execPath, [
    "apps/api-gateway/dist/notifications/notification-delivery.main.js",
    "--once"
  ], {
    cwd: backendRoot,
    env,
    windowsHide: true
  });
  let stdout = "";
  let stderr = "";

  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
    process.stdout.write(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
    process.stderr.write(chunk);
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(`notification_delivery_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
        return;
      }
      resolve({ stderr, stdout });
    });
  });
}

function parseWorkerRunResult(stdout) {
  const records = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();
  const workerRecord = records.find((record) => record.service === "notification-delivery-worker" && record.result);
  if (!workerRecord) {
    throw new Error("notification_delivery_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDelivery(prisma, input) {
  const descriptor = await prisma.notificationDeliveryDescriptor.findUnique({
    where: { id: input.descriptorId }
  });
  if (!descriptor || descriptor.status !== "delivered") {
    throw new Error(`notification_delivery_worker_smoke_not_delivered:${descriptor?.status ?? "missing"}`);
  }
  if (descriptor.attempts !== 1 || !descriptor.deliveredAt) {
    throw new Error("notification_delivery_worker_smoke_delivery_attempt_not_persisted");
  }
  const providerMessageId = String(descriptor.providerMessageId ?? "");
  if (!providerMessageId.startsWith("deterministic_push_")) {
    throw new Error(`notification_delivery_worker_smoke_provider_message_missing:${providerMessageId || "missing"}`);
  }
  if (descriptor.lastError || descriptor.failedAt || descriptor.nextAttemptAt) {
    throw new Error("notification_delivery_worker_smoke_unexpected_failure_state");
  }

  return descriptor;
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.notificationDeliveryDescriptor.deleteMany({
      where: {
        OR: [
          { id: { startsWith: `notif_delivery_${smokePrefix}_` } },
          { notificationId: { startsWith: `notif_${smokePrefix}_` } },
          { queue: { startsWith: `browser_push_${smokePrefix}_` } },
          { subscriptionId: { startsWith: `push_sub_${smokePrefix}_` } }
        ]
      }
    }),
    prisma.browserPushSubscription.deleteMany({
      where: { id: { startsWith: `push_sub_${smokePrefix}_` } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, input) {
  await prisma.$transaction([
    prisma.notificationDeliveryDescriptor.deleteMany({
      where: { id: input.descriptorId }
    }),
    prisma.browserPushSubscription.deleteMany({
      where: { id: input.subscriptionId }
    })
  ]);
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireConfigured(value, name) {
  const configured = stringValue(value);
  if (!configured) {
    throw new Error(`${name}_required`);
  }
  return configured;
}
