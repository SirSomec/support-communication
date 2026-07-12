import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

if (process.env.OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED !== "true") {
  process.stdout.write("Telegram live provider smoke skipped {\"reason\":\"OUTBOX_PROVIDER_LIVE_SMOKE_ENABLED is not true\"}\n");
  process.exit(0);
}

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "provider_telegram_live_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const chatId = requireConfigured(process.env.OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID, "OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_CHAT_ID");
const tenantId = stringValue(process.env.OUTBOX_PROVIDER_LIVE_SMOKE_TENANT_ID) || "tenant-volga";
const text = stringValue(process.env.OUTBOX_PROVIDER_LIVE_SMOKE_TELEGRAM_TEXT)
  || `Support Communication Telegram live smoke ${runId}`;
const queue = `message_delivery_${runId}`;
const smoke = {
  auditId: `audit_telegram_${runId}`,
  channel: stringValue(process.env.OUTBOX_TELEGRAM_CHANNEL) || "Telegram",
  conversationId: chatId,
  descriptorId: `descriptor_telegram_${runId}`,
  idempotencyKey: `idempotency_telegram_${runId}`,
  messageId: `message_telegram_${runId}`,
  outboxEventId: `outbox_telegram_${runId}`,
  requestFingerprint: `fingerprint_telegram_${runId}`,
  tenantId,
  text,
  traceId: `trc_telegram_${runId}`
};

const { createPrismaClient } = await import("../packages/database/dist/index.js");
const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

let createdConversation = false;

try {
  await cleanupStaleSmokeRows(client);
  createdConversation = await seedSmokeOutboxEvent(client, smoke);

  const output = await runWorkerOnce(smoke);
  const result = parseWorkerRunResult(output.stdout);
  if (result.scanned !== 1 || result.published !== 1 || result.failed !== 0) {
    throw new Error(`provider_telegram_live_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const persisted = await assertPersistedDispatch(client, smoke);
  process.stdout.write(`Telegram live provider smoke passed ${JSON.stringify({
    conversationId: smoke.conversationId,
    outboxEventId: smoke.outboxEventId,
    publishedAt: persisted.publishedAt,
    result
  })}\n`);
} finally {
  if (process.env.OUTBOX_PROVIDER_LIVE_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke, createdConversation);
  }
  await client.$disconnect?.();
}

async function seedSmokeOutboxEvent(prisma, input) {
  let created = false;
  await prisma.$transaction(async (transaction) => {
    const conversation = await transaction.conversation.findUnique({
      where: { id: input.conversationId }
    });
    if (!conversation) {
      await transaction.conversation.create({
        data: {
          channel: input.channel,
          clientSince: "2026-07-05",
          device: "telegram",
          entry: "provider-live-smoke",
          id: input.conversationId,
          initials: "TL",
          language: "ru",
          metadata: {
            provider: "telegram",
            runId,
            smoke: true
          },
          name: "Telegram Live Smoke",
          phone: "+70000000000",
          preview: input.text,
          previous: {},
          sla: "ok",
          slaTone: "neutral",
          status: "open",
          tags: ["smoke", "telegram"],
          tenantId: input.tenantId,
          time: "12:00",
          topic: "Provider live smoke"
        }
      });
      created = true;
    }

    await transaction.conversationOutboundDescriptor.create({
      data: {
        auditId: input.auditId,
        channel: input.channel,
        conversationId: input.conversationId,
        deliveryState: "queued",
        id: input.descriptorId,
        idempotencyKey: input.idempotencyKey,
        kind: "message_delivery",
        messageId: input.messageId,
        outboxEventId: input.outboxEventId,
        payload: {
          channel: input.channel,
          conversationId: input.conversationId,
          messageId: input.messageId,
          text: input.text
        },
        requestFingerprint: input.requestFingerprint,
        retryable: true,
        status: "delivery_queued",
        tenantId: input.tenantId,
        traceId: input.traceId
      }
    });

    await transaction.outboxEvent.create({
      data: {
        aggregateId: input.messageId,
        aggregateType: "conversation_message",
        id: input.outboxEventId,
        occurredAt: new Date("1970-01-01T00:00:00.000Z"),
        payload: {
          descriptorId: input.descriptorId,
          messageId: input.messageId
        },
        queue,
        status: "pending",
        traceId: input.traceId,
        type: "message.delivery.requested"
      }
    });
  });
  return created;
}

async function runWorkerOnce(input) {
  const env = {
    ...process.env,
    INTEGRATION_REPOSITORY: stringValue(process.env.INTEGRATION_REPOSITORY) || "prisma",
    OUTBOX_BATCH_SIZE: "1",
    OUTBOX_ONCE: "true",
    OUTBOX_QUEUE: queue,
    OUTBOX_TELEGRAM_API_BASE_URL: stringValue(process.env.OUTBOX_TELEGRAM_API_BASE_URL) || "https://api.telegram.org",
    OUTBOX_TELEGRAM_CHANNEL: input.channel,
    OUTBOX_TELEGRAM_ENABLED: "true"
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
        reject(new Error(`provider_telegram_live_worker_failed:${code ?? 1}:${stderr || stdout}`));
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
    throw new Error("provider_telegram_live_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDispatch(prisma, input) {
  const event = await prisma.outboxEvent.findUnique({
    where: { id: input.outboxEventId }
  });
  if (!event || event.status !== "published" || !event.publishedAt) {
    throw new Error(`provider_telegram_live_event_not_published:${event?.status ?? "missing"}`);
  }
  if (event.lastError) {
    throw new Error(`provider_telegram_live_unexpected_last_error:${event.lastError}`);
  }
  return event;
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { id: { startsWith: `outbox_telegram_${smokePrefix}_` } },
          { aggregateId: { startsWith: `message_telegram_${smokePrefix}_` } },
          { queue: { startsWith: `message_delivery_${smokePrefix}_` } }
        ]
      }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: { id: { startsWith: `descriptor_telegram_${smokePrefix}_` } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, input, deleteConversation) {
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({
      where: { id: input.outboxEventId }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: { id: input.descriptorId }
    }),
    ...(deleteConversation
      ? [prisma.conversation.deleteMany({ where: { id: input.conversationId } })]
      : [])
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
