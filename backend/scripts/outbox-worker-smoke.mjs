import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "outbox_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  channel: "SMOKE",
  conversationId: `conversation_${runId}`,
  descriptorId: `descriptor_${runId}`,
  idempotencyKey: `idempotency_${runId}`,
  messageId: `message_${runId}`,
  outboxEventId: `outbox_${runId}`,
  queue: `message_delivery_${runId}`,
  requestFingerprint: `fingerprint_${runId}`,
  tenantId: `tenant_${runId}`,
  text: "Outbox worker smoke delivery",
  traceId: `trc_${runId}`
};

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeOutboxEvent(client, smoke);

  const connector = await startChannelConnectorServer(smoke);
  try {
    const output = await runWorkerOnce(connector.port, smoke);
    const result = parseWorkerRunResult(output.stdout);
    if (result.scanned !== 1 || result.published !== 1 || result.failed !== 0) {
      throw new Error(`outbox_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
    }
    if (connector.requests.length !== 1) {
      throw new Error(`outbox_worker_smoke_connector_not_called:${connector.requests.length}`);
    }

    const event = await assertPersistedDispatch(client, smoke);
    process.stdout.write(`outbox worker smoke passed ${JSON.stringify({
      connectorCalls: connector.requests.length,
      descriptorId: smoke.descriptorId,
      outboxEventId: smoke.outboxEventId,
      result,
      status: event.status
    })}\n`);
  } finally {
    await connector.close();
  }
} finally {
  if (process.env.OUTBOX_WORKER_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
  }
  await client.$disconnect?.();
}

async function seedSmokeOutboxEvent(prisma, input) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  await prisma.$transaction(async (transaction) => {
    await transaction.conversation.create({
      data: {
        channel: input.channel,
        clientSince: "2026-07-04",
        device: "web",
        entry: "smoke",
        id: input.conversationId,
        initials: "OS",
        language: "ru",
        metadata: {
          smoke: true
        },
        name: "Outbox Smoke",
        phone: "+70000000000",
        preview: input.text,
        previous: {},
        sla: "ok",
        slaTone: "neutral",
        status: "open",
        tags: ["smoke"],
        tenantId: input.tenantId,
        time: "12:00",
        topic: "Runtime smoke"
      }
    });

    await transaction.conversationOutboundDescriptor.create({
      data: {
        auditId: `audit_${input.descriptorId}`,
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
        occurredAt: createdAt,
        payload: {
          descriptorId: input.descriptorId,
          messageId: input.messageId
        },
        queue: input.queue,
        status: "pending",
        traceId: input.traceId,
        type: "message.delivery.requested"
      }
    });
  });
}

async function startChannelConnectorServer(input) {
  const requests = [];
  const server = createServer((request, response) => {
    void handleConnectorRequest(input, requests, request, response).catch((error) => {
      sendJson(response, 500, {
        error: { code: "outbox_worker_smoke_connector_failed" },
        message: error instanceof Error ? error.message : String(error),
        status: "error"
      });
    });
  });

  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("outbox_worker_smoke_connector_port_unavailable"));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
    port,
    requests
  };
}

async function handleConnectorRequest(input, requests, request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "POST" || requestUrl.pathname !== "/deliver") {
    sendJson(response, 404, { error: { code: "not_found" }, status: "error" });
    return;
  }

  if (headerValue(request.headers["idempotency-key"]) !== input.idempotencyKey) {
    sendJson(response, 409, { error: { code: "idempotency_key_mismatch" }, status: "error" });
    return;
  }

  if (headerValue(request.headers["x-trace-id"]) !== input.traceId) {
    sendJson(response, 409, { error: { code: "trace_id_mismatch" }, status: "error" });
    return;
  }

  const body = await readJsonBody(request);
  const delivery = toJsonRecord(body.request);
  if (body.operation !== "deliverMessage" || delivery.descriptorId !== input.descriptorId) {
    sendJson(response, 422, { error: { code: "outbox_worker_smoke_delivery_mismatch" }, status: "error" });
    return;
  }
  if (delivery.text !== input.text || delivery.channel !== input.channel || delivery.outboxEventId !== input.outboxEventId) {
    sendJson(response, 422, { error: { code: "outbox_worker_smoke_payload_mismatch" }, status: "error" });
    return;
  }

  requests.push(body);
  sendJson(response, 202, { data: { accepted: true, descriptorId: input.descriptorId }, status: "ok" });
}

async function runWorkerOnce(connectorPort, input) {
  const env = {
    ...process.env,
    OUTBOX_BATCH_SIZE: "1",
    OUTBOX_CHANNEL_CONNECTORS: `${input.channel}=http://127.0.0.1:${connectorPort}/deliver`,
    OUTBOX_ONCE: "true",
    OUTBOX_QUEUE: input.queue
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
        reject(new Error(`outbox_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
    throw new Error("outbox_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDispatch(prisma, input) {
  const event = await prisma.outboxEvent.findUnique({ where: { id: input.outboxEventId } });
  if (!event || event.status !== "published" || !event.publishedAt) {
    throw new Error(`outbox_worker_smoke_event_not_published:${event?.status ?? "missing"}`);
  }
  if (event.lastError) {
    throw new Error(`outbox_worker_smoke_unexpected_last_error:${event.lastError}`);
  }
  const descriptor = await prisma.conversationOutboundDescriptor.findUnique({ where: { id: input.descriptorId } });
  if (!descriptor || descriptor.status !== "delivered" || descriptor.deliveryState !== "delivered" || descriptor.retryable) {
    throw new Error(`outbox_worker_smoke_descriptor_not_delivered:${descriptor?.status ?? "missing"}`);
  }
  return event;
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { id: { startsWith: `outbox_${smokePrefix}_` } },
          { aggregateId: { startsWith: `message_${smokePrefix}_` } }
        ],
        queue: { startsWith: `message_delivery_${smokePrefix}_` }
      }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: { id: { startsWith: `descriptor_${smokePrefix}_` } }
    }),
    prisma.conversation.deleteMany({
      where: { id: { startsWith: `conversation_${smokePrefix}_` } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, input) {
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({
      where: { id: input.outboxEventId }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: { id: input.descriptorId }
    }),
    prisma.conversation.deleteMany({
      where: { id: input.conversationId }
    })
  ]);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("error", reject);
    request.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text.trim() ? JSON.parse(text) : {});
      } catch {
        reject(new Error("outbox_worker_smoke_invalid_connector_json"));
      }
    });
  });
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function toJsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
