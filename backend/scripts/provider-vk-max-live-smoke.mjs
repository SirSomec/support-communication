import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

if (process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED !== "true") {
  process.stdout.write("VK/MAX live provider smoke skipped {\"reason\":\"OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_ENABLED is not true\"}\n");
  process.exit(0);
}

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "provider_vk_max_live_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const queue = `message_delivery_${runId}`;
const enabledProviders = [
  providerEnabled("VK") ? createVkProviderSmoke() : undefined,
  providerEnabled("MAX") ? createMaxProviderSmoke() : undefined
].filter(Boolean);

if (!enabledProviders.length) {
  process.stdout.write("VK/MAX live provider smoke skipped {\"reason\":\"no OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_*_ENABLED providers selected\"}\n");
  process.exit(0);
}

const { createPrismaClient } = await import("../packages/database/dist/index.js");
const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  const seeded = await seedSmokeOutboxEvents(client, enabledProviders);

  try {
    const output = await runWorkerOnce(enabledProviders);
    const result = parseWorkerRunResult(output.stdout);
    if (result.scanned !== enabledProviders.length || result.published !== enabledProviders.length || result.failed !== 0) {
      throw new Error(`provider_vk_max_live_smoke_unexpected_result:${JSON.stringify(result)}`);
    }

    const persisted = await assertPersistedDispatches(client, enabledProviders);
    process.stdout.write(`VK/MAX live provider smoke passed ${JSON.stringify({
      providers: enabledProviders.map((provider) => provider.key),
      publishedEvents: persisted,
      result
    })}\n`);
  } finally {
    if (process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_KEEP_DATA !== "true") {
      await cleanupSmokeRows(client, enabledProviders, seeded.createdConversations);
    }
  }
} finally {
  await client.$disconnect?.();
}

function createVkProviderSmoke() {
  return createMessageProviderSmoke({
    channel: stringValue(process.env.OUTBOX_VK_CHANNEL) || "VK",
    channelConnectionId: requireConfigured(process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_CONNECTION_ID, "OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_CONNECTION_ID"),
    conversationId: requireConfigured(
      process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_PEER_ID,
      "OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_PEER_ID"
    ),
    key: "vk",
    text: stringValue(process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_VK_TEXT)
      || `Support Communication VK live smoke ${runId}`
  });
}

function createMaxProviderSmoke() {
  return createMessageProviderSmoke({
    channel: stringValue(process.env.OUTBOX_MAX_CHANNEL) || "MAX",
    channelConnectionId: requireConfigured(process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_CONNECTION_ID, "OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_CONNECTION_ID"),
    conversationId: requireConfigured(
      process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_DIALOG_ID,
      "OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_DIALOG_ID"
    ),
    key: "max",
    text: stringValue(process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_MAX_TEXT)
      || `Support Communication MAX live smoke ${runId}`
  });
}

function createMessageProviderSmoke({ channel, channelConnectionId, conversationId, key, text }) {
  return {
    auditId: `audit_${key}_${runId}`,
    channel,
    channelConnectionId,
    conversationId,
    descriptorId: `descriptor_${key}_${runId}`,
    idempotencyKey: `idempotency_${key}_${runId}`,
    key,
    messageId: `message_${key}_${runId}`,
    outboxEventId: `outbox_${key}_${runId}`,
    requestFingerprint: `fingerprint_${key}_${runId}`,
    tenantId: stringValue(process.env.OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_TENANT_ID) || "tenant-volga",
    text,
    traceId: `trc_${key}_${runId}`
  };
}

async function seedSmokeOutboxEvents(prisma, providers) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  const createdConversations = [];
  await prisma.$transaction(async (transaction) => {
    for (const provider of providers) {
      const conversation = await transaction.conversation.findUnique({
        where: { id: provider.conversationId }
      });
      if (!conversation) {
        await transaction.conversation.create({
          data: {
            channel: provider.channel,
            clientSince: "2026-07-05",
            device: "provider-proxy",
            entry: "provider-live-smoke",
            id: provider.conversationId,
            initials: provider.key === "vk" ? "VK" : "MX",
            language: "ru",
            metadata: {
              provider: provider.key,
              runId,
              smoke: true
            },
            name: `${provider.channel} Live Smoke`,
            phone: "+70000000000",
            preview: provider.text,
            previous: {},
            sla: "ok",
            slaTone: "neutral",
            status: "open",
            tags: ["smoke", provider.key],
            tenantId: provider.tenantId,
            time: "12:00",
            topic: "Provider live smoke"
          }
        });
        createdConversations.push(provider.conversationId);
      }

      await transaction.conversationOutboundDescriptor.create({
        data: {
          auditId: provider.auditId,
          channel: provider.channel,
          conversationId: provider.conversationId,
          deliveryState: "queued",
          id: provider.descriptorId,
          idempotencyKey: provider.idempotencyKey,
          kind: "message_delivery",
          messageId: provider.messageId,
          outboxEventId: provider.outboxEventId,
          payload: {
            channel: provider.channel,
            channelConnectionId: provider.channelConnectionId,
            conversationId: provider.conversationId,
            messageId: provider.messageId,
            providerConversationId: provider.conversationId,
            text: provider.text
          },
          requestFingerprint: provider.requestFingerprint,
          retryable: true,
          status: "delivery_queued",
          tenantId: provider.tenantId,
          traceId: provider.traceId
        }
      });

      await transaction.outboxEvent.create({
        data: {
          aggregateId: provider.messageId,
          aggregateType: "conversation_message",
          id: provider.outboxEventId,
          occurredAt: createdAt,
          payload: {
            descriptorId: provider.descriptorId,
            messageId: provider.messageId
          },
          queue,
          status: "pending",
          traceId: provider.traceId,
          type: "message.delivery.requested"
        }
      });
    }
  });

  return { createdConversations };
}

async function runWorkerOnce(providers) {
  const env = {
    ...process.env,
    OUTBOX_BATCH_SIZE: String(providers.length),
    OUTBOX_MAX_CHANNEL: stringValue(process.env.OUTBOX_MAX_CHANNEL) || "MAX",
    OUTBOX_MAX_ENABLED: providerSelected(providers, "max") ? "true" : "false",
    OUTBOX_MAX_ENDPOINT: providerSelected(providers, "max")
      ? requireConfigured(process.env.OUTBOX_MAX_ENDPOINT, "OUTBOX_MAX_ENDPOINT")
      : stringValue(process.env.OUTBOX_MAX_ENDPOINT),
    OUTBOX_ONCE: "true",
    OUTBOX_QUEUE: queue,
    OUTBOX_VK_CHANNEL: stringValue(process.env.OUTBOX_VK_CHANNEL) || "VK",
    OUTBOX_VK_ENABLED: providerSelected(providers, "vk") ? "true" : "false",
    OUTBOX_VK_ENDPOINT: providerSelected(providers, "vk")
      ? requireConfigured(process.env.OUTBOX_VK_ENDPOINT, "OUTBOX_VK_ENDPOINT")
      : stringValue(process.env.OUTBOX_VK_ENDPOINT)
  };

  const child = spawn(process.execPath, ["apps/outbox-worker/dist/main.js", "--once"], {
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
        reject(new Error(`provider_vk_max_live_worker_failed:${code ?? 1}:${stderr || stdout}`));
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
  const workerRecord = records.find((record) => record.service === "outbox-worker" && record.result);
  if (!workerRecord) {
    throw new Error("provider_vk_max_live_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDispatches(prisma, providers) {
  const published = [];
  for (const provider of providers) {
    const event = await prisma.outboxEvent.findUnique({
      where: { id: provider.outboxEventId }
    });
    if (!event || event.status !== "published" || !event.publishedAt) {
      throw new Error(`provider_vk_max_live_event_not_published:${provider.key}:${event?.status ?? "missing"}`);
    }
    if (event.lastError) {
      throw new Error(`provider_vk_max_live_unexpected_last_error:${provider.key}:${event.lastError}`);
    }
    published.push({
      eventId: event.id,
      provider: provider.key,
      publishedAt: event.publishedAt
    });
  }
  return published;
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { id: { startsWith: `outbox_vk_${smokePrefix}_` } },
          { id: { startsWith: `outbox_max_${smokePrefix}_` } },
          { aggregateId: { startsWith: `message_vk_${smokePrefix}_` } },
          { aggregateId: { startsWith: `message_max_${smokePrefix}_` } },
          { queue: { startsWith: `message_delivery_${smokePrefix}_` } }
        ]
      }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: {
        OR: [
          { id: { startsWith: `descriptor_vk_${smokePrefix}_` } },
          { id: { startsWith: `descriptor_max_${smokePrefix}_` } }
        ]
      }
    }),
    prisma.conversation.deleteMany({
      where: {
        OR: [
          { id: { startsWith: `vk_peer_${smokePrefix}_` } },
          { id: { startsWith: `max_dialog_${smokePrefix}_` } }
        ]
      }
    })
  ]);
}

async function cleanupSmokeRows(prisma, providers, createdConversations) {
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({
      where: { id: { in: providers.map((provider) => provider.outboxEventId) } }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: { id: { in: providers.map((provider) => provider.descriptorId) } }
    }),
    ...(createdConversations.length
      ? [prisma.conversation.deleteMany({ where: { id: { in: createdConversations } } })]
      : [])
  ]);
}

function providerEnabled(name) {
  return process.env[`OUTBOX_PROVIDER_VK_MAX_LIVE_SMOKE_${name}_ENABLED`] !== "false";
}

function providerSelected(providers, key) {
  return providers.some((provider) => provider.key === key);
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
