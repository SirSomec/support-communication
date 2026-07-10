import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "webhook_delivery_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  deliveryId: `wdj_${runId}`,
  endpointId: `wep_${runId}`,
  idempotencyKey: `idem_${runId}`,
  payloadRef: `outbox_evt_${runId}`,
  queue: `webhook-delivery-${runId}`,
  tenantId: `tenant_${runId}`,
  traceId: `trc_${runId}`
};

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});
const providerRequests = [];
const provider = await startProvider();

try {
  await cleanupStaleSmokeRows(client);
  await seedWebhookDelivery(client, {
    ...smoke,
    targetUrl: provider.url
  });

  const output = await runWorkerOnce();
  const result = parseWorkerRunResult(output.stdout);
  if (result.claimed !== 1 || result.delivered !== 1 || result.retryScheduled !== 0 || result.deadLettered !== 0 || result.failed !== 0) {
    throw new Error(`webhook_delivery_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
  }
  if (providerRequests.length !== 1 || providerRequests[0]?.deliveryId !== smoke.deliveryId) {
    throw new Error(`webhook_delivery_worker_smoke_provider_request_missing:${JSON.stringify(providerRequests)}`);
  }

  const descriptor = await assertPersistedDelivery(client, smoke);
  process.stdout.write(`webhook delivery worker smoke passed ${JSON.stringify({
    deliveryId: smoke.deliveryId,
    result,
    status: descriptor.status
  })}\n`);
} finally {
  await provider.close();
  if (process.env.WEBHOOK_DELIVERY_WORKER_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
  }
  await client.$disconnect?.();
}

async function startProvider() {
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      providerRequests.push({
        deliveryId: parsed.deliveryId,
        idempotencyKey: request.headers["idempotency-key"],
        method: request.method,
        traceId: request.headers["x-webhook-trace-id"]
      });
      response.writeHead(202, { "content-type": "application/json" });
      response.end(JSON.stringify({ accepted: true, providerMessageId: `fake-webhook-${parsed.deliveryId}` }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("webhook_delivery_worker_smoke_provider_port_unavailable");
  }

  return {
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
    url: `http://127.0.0.1:${address.port}/webhook-delivery`
  };
}

async function seedWebhookDelivery(prisma, input) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  await prisma.webhookDeliveryJournalEntry.create({
    data: {
      attempts: 0,
      createdAt,
      deadLetteredAt: null,
      deliveryId: input.deliveryId,
      endpointId: input.endpointId,
      eventType: "conversation.message.created",
      idempotencyKey: input.idempotencyKey,
      lastAttemptAt: null,
      lastError: null,
      lockedAt: null,
      nextAttemptAt: null,
      payloadRef: input.payloadRef,
      queue: input.queue,
      status: "queued",
      targetUrl: input.targetUrl,
      tenantId: input.tenantId,
      traceId: input.traceId,
      updatedAt: createdAt
    }
  });
}

async function runWorkerOnce() {
  const env = {
    ...process.env,
    INTEGRATION_REPOSITORY: "prisma",
    NODE_ENV: "development",
    RUNTIME_PROFILE: "local",
    WEBHOOK_DELIVERY_LIMIT: "1",
    WEBHOOK_DELIVERY_PROVIDER_MODE: "http",
    WEBHOOK_DELIVERY_QUEUE: smoke.queue
  };
  const child = spawn(process.execPath, [
    "apps/api-gateway/dist/integrations/webhook-delivery.main.js",
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
        reject(new Error(`webhook_delivery_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
  const workerRecord = records.find((record) => record.service === "webhook-delivery-worker" && record.result);
  if (!workerRecord) {
    throw new Error("webhook_delivery_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDelivery(prisma, input) {
  const descriptor = await prisma.webhookDeliveryJournalEntry.findUnique({
    where: { deliveryId: input.deliveryId }
  });
  if (!descriptor || descriptor.status !== "delivered") {
    throw new Error(`webhook_delivery_worker_smoke_not_delivered:${descriptor?.status ?? "missing"}`);
  }
  if (descriptor.attempts !== 1 || !descriptor.lastAttemptAt) {
    throw new Error("webhook_delivery_worker_smoke_attempt_not_persisted");
  }
  if (descriptor.lastError || descriptor.lockedAt || descriptor.nextAttemptAt || descriptor.deadLetteredAt) {
    throw new Error("webhook_delivery_worker_smoke_unexpected_failure_state");
  }

  return descriptor;
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.webhookDeliveryJournalEntry.deleteMany({
    where: {
      OR: [
        { deliveryId: { startsWith: `wdj_${smokePrefix}_` } },
        { endpointId: { startsWith: `wep_${smokePrefix}_` } },
        { payloadRef: { startsWith: `outbox_evt_${smokePrefix}_` } },
        { queue: { startsWith: `webhook-delivery-${smokePrefix}_` } }
      ]
    }
  });
}

async function cleanupSmokeRows(prisma, input) {
  await prisma.webhookDeliveryJournalEntry.deleteMany({
    where: { deliveryId: input.deliveryId }
  });
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
