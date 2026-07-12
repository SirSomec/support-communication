import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "provider_outbox_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const queue = `message_delivery_${runId}`;
const telegramToken = "123456:PROVIDER_SMOKE";
const providerGateEnv = {
  max: "OUTBOX_PROVIDER_SMOKE_MAX_ENABLED",
  telegram: "OUTBOX_PROVIDER_SMOKE_TELEGRAM_ENABLED",
  vk: "OUTBOX_PROVIDER_SMOKE_VK_ENABLED"
};
const providerCleanupPrefixes = {
  max: {
    conversation: `max_dialog_${smokePrefix}_`,
    descriptor: `descriptor_max_${smokePrefix}_`,
    message: `message_max_${smokePrefix}_`,
    outbox: `outbox_max_${smokePrefix}_`
  },
  telegram: {
    conversation: `telegram_chat_${smokePrefix}_`,
    descriptor: `descriptor_telegram_${smokePrefix}_`,
    message: `message_telegram_${smokePrefix}_`,
    outbox: `outbox_telegram_${smokePrefix}_`
  },
  vk: {
    conversation: `vk_peer_${smokePrefix}_`,
    descriptor: `descriptor_vk_${smokePrefix}_`,
    message: `message_vk_${smokePrefix}_`,
    outbox: `outbox_vk_${smokePrefix}_`
  }
};

if (process.env.OUTBOX_PROVIDER_SMOKE_ENABLED !== "true") {
  process.stdout.write(`provider outbox smoke skipped ${JSON.stringify({
    reason: "OUTBOX_PROVIDER_SMOKE_ENABLED is not true",
    providers: ["telegram", "vk", "max"]
  })}\n`);
  process.exit(0);
}

const enabledProviders = [
  providerEnabled("TELEGRAM") ? createTelegramProviderSmoke() : undefined,
  providerEnabled("VK") ? createVkProviderSmoke() : undefined,
  providerEnabled("MAX") ? createMaxProviderSmoke() : undefined
].filter(Boolean);

if (!enabledProviders.length) {
  process.stdout.write(`provider outbox smoke skipped ${JSON.stringify({
    reason: "no OUTBOX_PROVIDER_SMOKE_*_ENABLED providers selected",
    providers: []
  })}\n`);
  process.exit(0);
}

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeOutboxEvents(client, enabledProviders);

  const providerServer = await startProviderSmokeServer();
  try {
    const output = await runWorkerOnce(providerServer.port, enabledProviders);
    const result = parseWorkerRunResult(output.stdout);
    if (result.scanned !== enabledProviders.length || result.published !== enabledProviders.length || result.failed !== 0) {
      throw new Error(`provider_outbox_smoke_unexpected_result:${JSON.stringify(result)}`);
    }

    assertProviderRequests(providerServer.requests, enabledProviders);
    await assertPersistedDispatches(client, enabledProviders);
    process.stdout.write(`provider outbox smoke passed ${JSON.stringify({
      maxRequests: providerServer.requests.maxRequests.length,
      providers: enabledProviders.map((provider) => provider.key),
      result,
      telegramRequests: providerServer.requests.telegramRequests.length,
      vkRequests: providerServer.requests.vkRequests.length
    })}\n`);
  } finally {
    await providerServer.close();
  }
} finally {
  if (process.env.OUTBOX_PROVIDER_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, enabledProviders);
  }
  await client.$disconnect?.();
}

function createTelegramProviderSmoke() {
  const key = "telegram";
  const text = "Provider outbox smoke Telegram delivery";
  return createMessageProviderSmoke({
    channel: "Telegram",
    conversationId: `telegram_chat_${runId}`,
    key,
    text
  });
}

function createVkProviderSmoke() {
  const key = "vk";
  const text = "Provider outbox smoke VK delivery";
  return createMessageProviderSmoke({
    channel: "VK",
    conversationId: `vk_peer_${runId}`,
    key,
    text
  });
}

function createMaxProviderSmoke() {
  const key = "max";
  const text = "Provider outbox smoke MAX delivery";
  return createMessageProviderSmoke({
    channel: "MAX",
    conversationId: `max_dialog_${runId}`,
    key,
    text
  });
}

function createMessageProviderSmoke({ channel, conversationId, key, text }) {
  return {
    auditId: `audit_${key}_${runId}`,
    channel,
    conversationId,
    descriptorId: `descriptor_${key}_${runId}`,
    idempotencyKey: `idempotency_${key}_${runId}`,
    key,
    messageId: `message_${key}_${runId}`,
    outboxEventId: `outbox_${key}_${runId}`,
    requestFingerprint: `fingerprint_${key}_${runId}`,
    tenantId: `tenant_${key}_${runId}`,
    text,
    traceId: `trc_${key}_${runId}`
  };
}

async function seedSmokeOutboxEvents(prisma, providers) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  await prisma.$transaction(async (transaction) => {
    for (const provider of providers) {
      await transaction.conversation.create({
        data: {
          channel: provider.channel,
          clientSince: "2026-07-05",
          device: "web",
          entry: "provider-smoke",
          id: provider.conversationId,
          initials: "PS",
          language: "ru",
          metadata: {
            provider: provider.key,
            smoke: true
          },
          name: `Provider Smoke ${provider.channel}`,
          phone: "+70000000000",
          preview: provider.text,
          previous: {},
          sla: "ok",
          slaTone: "neutral",
          status: "open",
          tags: ["smoke", provider.key],
          tenantId: provider.tenantId,
          time: "12:00",
          topic: "Provider runtime smoke"
        }
      });

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
            conversationId: provider.conversationId,
            messageId: provider.messageId,
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
}

async function startProviderSmokeServer() {
  const requests = {
    maxRequests: [],
    telegramRequests: [],
    vkRequests: []
  };
  const server = createServer((request, response) => {
    void handleProviderRequest(requests, request, response).catch((error) => {
      sendJson(response, 500, {
        error: { code: "provider_outbox_smoke_server_failed" },
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
        reject(new Error("provider_outbox_smoke_port_unavailable"));
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

async function handleProviderRequest(requests, request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "POST") {
    sendJson(response, 405, { error: { code: "method_not_allowed" }, status: "error" });
    return;
  }

  const body = await readJsonBody(request);
  const captured = {
    body,
    headers: {
      "idempotency-key": headerValue(request.headers["idempotency-key"]),
      "x-trace-id": headerValue(request.headers["x-trace-id"])
    },
    path: requestUrl.pathname
  };

  if (requestUrl.pathname === `/bot${telegramToken}/sendMessage`) {
    requests.telegramRequests.push(captured);
    sendJson(response, 200, { ok: true, result: { message_id: 1 } });
    return;
  }

  if (requestUrl.pathname === "/vk/messages.send") {
    requests.vkRequests.push(captured);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (requestUrl.pathname === "/max/messages") {
    requests.maxRequests.push(captured);
    sendJson(response, 200, { ok: true });
    return;
  }

  sendJson(response, 404, { error: { code: "provider_not_found" }, status: "error" });
}

async function runWorkerOnce(providerPort, providers) {
  const providerBaseUrl = `http://127.0.0.1:${providerPort}`;
  const env = {
    ...process.env,
    OUTBOX_BATCH_SIZE: String(providers.length),
    OUTBOX_HTTP_TIMEOUT_MS: "5000",
    OUTBOX_MAX_CHANNEL: "MAX",
    OUTBOX_MAX_ENABLED: providerSelected(providers, "max") ? "true" : "false",
    OUTBOX_MAX_ENDPOINT: `${providerBaseUrl}/max/messages`,
    OUTBOX_ONCE: "true",
    OUTBOX_QUEUE: queue,
    OUTBOX_TELEGRAM_API_BASE_URL: providerBaseUrl,
    OUTBOX_TELEGRAM_BOT_TOKEN: telegramToken,
    OUTBOX_TELEGRAM_CHANNEL: "Telegram",
    OUTBOX_TELEGRAM_ENABLED: providerSelected(providers, "telegram") ? "true" : "false",
    OUTBOX_VK_CHANNEL: "VK",
    OUTBOX_VK_ENABLED: providerSelected(providers, "vk") ? "true" : "false",
    OUTBOX_VK_ENDPOINT: `${providerBaseUrl}/vk/messages.send`
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
        reject(new Error(`provider_outbox_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
    throw new Error("provider_outbox_worker_result_not_found");
  }
  return workerRecord.result;
}

function assertProviderRequests(requests, providers) {
  for (const provider of providers) {
    if (provider.key === "telegram") {
      const request = singleRequest(requests.telegramRequests, "telegram");
      assertEqual(request.body.chat_id, provider.conversationId, "telegram_chat_id_mismatch");
      assertEqual(request.body.text, provider.text, "telegram_text_mismatch");
      assertEqual(request.headers["idempotency-key"], provider.idempotencyKey, "telegram_idempotency_key_mismatch");
      assertEqual(request.headers["x-trace-id"], provider.traceId, "telegram_trace_id_mismatch");
    }
    if (provider.key === "vk") {
      const request = singleRequest(requests.vkRequests, "vk");
      assertEqual(request.body.peer_id, provider.conversationId, "vk_peer_id_mismatch");
      assertEqual(request.body.message, provider.text, "vk_text_mismatch");
      assertEqual(request.headers["idempotency-key"], provider.idempotencyKey, "vk_idempotency_key_mismatch");
      assertEqual(request.headers["x-trace-id"], provider.traceId, "vk_trace_id_mismatch");
    }
    if (provider.key === "max") {
      const request = singleRequest(requests.maxRequests, "max");
      assertEqual(request.body.dialog_id, provider.conversationId, "max_dialog_id_mismatch");
      assertEqual(request.body.text, provider.text, "max_text_mismatch");
      assertEqual(request.headers["idempotency-key"], provider.idempotencyKey, "max_idempotency_key_mismatch");
      assertEqual(request.headers["x-trace-id"], provider.traceId, "max_trace_id_mismatch");
    }
  }
}

async function assertPersistedDispatches(prisma, providers) {
  for (const provider of providers) {
    const event = await prisma.outboxEvent.findUnique({ where: { id: provider.outboxEventId } });
    if (!event || event.status !== "published" || !event.publishedAt) {
      throw new Error(`provider_outbox_smoke_event_not_published:${provider.key}:${event?.status ?? "missing"}`);
    }
    if (event.lastError) {
      throw new Error(`provider_outbox_smoke_unexpected_last_error:${provider.key}:${event.lastError}`);
    }
    const descriptor = await prisma.conversationOutboundDescriptor.findUnique({ where: { id: provider.descriptorId } });
    if (!descriptor || descriptor.status !== "delivered" || descriptor.deliveryState !== "delivered" || descriptor.retryable) {
      throw new Error(`provider_outbox_smoke_descriptor_not_delivered:${provider.key}:${descriptor?.status ?? "missing"}`);
    }
  }
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { id: { startsWith: providerCleanupPrefixes.telegram.outbox } },
          { id: { startsWith: providerCleanupPrefixes.vk.outbox } },
          { id: { startsWith: providerCleanupPrefixes.max.outbox } },
          { aggregateId: { startsWith: providerCleanupPrefixes.telegram.message } },
          { aggregateId: { startsWith: providerCleanupPrefixes.vk.message } },
          { aggregateId: { startsWith: providerCleanupPrefixes.max.message } }
        ],
        queue: { startsWith: `message_delivery_${smokePrefix}_` }
      }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: {
        OR: [
          { id: { startsWith: providerCleanupPrefixes.telegram.descriptor } },
          { id: { startsWith: providerCleanupPrefixes.vk.descriptor } },
          { id: { startsWith: providerCleanupPrefixes.max.descriptor } }
        ]
      }
    }),
    prisma.conversation.deleteMany({
      where: { id: { startsWith: providerCleanupPrefixes.telegram.conversation } }
    }),
    prisma.conversation.deleteMany({
      where: { id: { startsWith: providerCleanupPrefixes.vk.conversation } }
    }),
    prisma.conversation.deleteMany({
      where: { id: { startsWith: providerCleanupPrefixes.max.conversation } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, providers) {
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany({
      where: { id: { in: providers.map((provider) => provider.outboxEventId) } }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: { id: { in: providers.map((provider) => provider.descriptorId) } }
    }),
    prisma.conversation.deleteMany({
      where: { id: { in: providers.map((provider) => provider.conversationId) } }
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
        reject(new Error("provider_outbox_smoke_invalid_provider_json"));
      }
    });
  });
}

function providerEnabled(name) {
  const envName = providerGateEnv[name.toLowerCase()];
  return !envName || process.env[envName] !== "false";
}

function providerSelected(providers, key) {
  return providers.some((provider) => provider.key === key);
}

function singleRequest(requests, provider) {
  if (requests.length !== 1) {
    throw new Error(`provider_outbox_smoke_${provider}_request_count:${requests.length}`);
  }
  return requests[0];
}

function assertEqual(actual, expected, code) {
  if (actual !== expected) {
    throw new Error(`${code}:${JSON.stringify({ actual, expected })}`);
  }
}

function headerValue(value) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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
