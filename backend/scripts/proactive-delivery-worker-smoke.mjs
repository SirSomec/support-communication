import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

// Single-run proactive delivery worker smoke on the Prisma runtime: seeds one
// eligible visitor rule, runs the worker once and verifies the persisted
// delivery evidence in Postgres (phase D: the JSON-store runtime is removed).
const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "proactive_delivery_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const evaluatedAt = new Date().toISOString();
const smoke = {
  capId: `cap_${runId}`,
  conversationId: `visitor_${runId}`,
  descriptorId: `proactive_rule_${runId}_tenant_${runId}_visitor_${runId}`,
  idempotencyKey: `proactive-delivery:tenant_${runId}:rule_${runId}:visitor_${runId}`,
  ruleId: `rule_${runId}`,
  tenantId: `tenant_${runId}`,
  traceId: `trc_${runId}`
};
const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeRows(client);

  const output = await runWorkerOnce();
  const result = parseWorkerRunResult(output.stdout);
  if (
    result.queued !== 1
    || result.failed !== 0
    || result.scanned !== 1
    || result.skipped !== 0
    || result.duplicate !== 0
    || result.conflicted !== 0
  ) {
    throw new Error(`proactive_delivery_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const evidence = await assertPersistedDelivery(client);

  process.stdout.write(`proactive delivery worker smoke passed ${JSON.stringify({
    descriptorId: evidence.descriptor.id,
    outboxEventId: evidence.outbox.id,
    result
  })}\n`);
} finally {
  if (process.env.PROACTIVE_DELIVERY_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke.tenantId, smoke.traceId);
  }
  await client.$disconnect?.();
}

async function seedSmokeRows(prisma) {
  const resetAt = new Date(Date.parse(evaluatedAt) + 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.proactiveRule.create({
      data: {
        activeVariant: "A",
        channels: ["SDK"],
        id: smoke.ruleId,
        segment: "checkout",
        status: "enabled",
        tenantId: smoke.tenantId
      }
    }),
    prisma.proactiveFrequencyCap.create({
      data: {
        active: true,
        capId: smoke.capId,
        limit: 1,
        period: "day",
        resetAt,
        ruleId: smoke.ruleId,
        tenantId: smoke.tenantId,
        used: 0
      }
    }),
    prisma.conversation.create({
      data: {
        channel: "SDK",
        clientSince: evaluatedAt.slice(0, 10),
        device: "web",
        entry: "proactive delivery worker smoke",
        id: smoke.conversationId,
        initials: "PS",
        language: "ru",
        metadata: { smoke: true },
        name: "Proactive Worker Smoke",
        phone: "+70000000000",
        preview: "Checkout assistance",
        previous: {},
        sla: "ok",
        slaTone: "neutral",
        status: "open",
        tags: ["smoke", "segment:checkout", "page:checkout"],
        tenantId: smoke.tenantId,
        time: "12:00",
        topic: "Checkout assistance",
        updatedAt: new Date(evaluatedAt)
      }
    })
  ]);
}

async function runWorkerOnce() {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PROACTIVE_DELIVERY_ACTIVE_VARIANTS: "A",
    PROACTIVE_DELIVERY_EVALUATED_AT: evaluatedAt,
    PROACTIVE_DELIVERY_LIMIT: "1",
    PROACTIVE_DELIVERY_TRACE_ID: smoke.traceId,
    PROACTIVE_DELIVERY_VISITOR_TTL_MS: String(60 * 60 * 1000),
    SERVICE_NAME: "proactive-delivery-worker-smoke"
  };
  const child = spawn(process.execPath, [
    "apps/api-gateway/dist/automation/proactive-delivery.main.js",
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
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30_000);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error("proactive_delivery_worker_process_timeout"));
        return;
      }
      if (code !== 0) {
        reject(new Error(`proactive_delivery_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
  const workerRecord = records.find((record) => record.service === "proactive-delivery-worker" && record.result);
  if (!workerRecord) {
    throw new Error("proactive_delivery_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDelivery(prisma) {
  const [descriptors, outboxEvents, attempts, idempotencyKeys, attributions, cap] = await Promise.all([
    prisma.conversationOutboundDescriptor.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.outboxEvent.findMany({ where: { aggregateId: smoke.descriptorId } }),
    prisma.proactiveDeliveryAttempt.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.proactiveDeliveryIdempotencyKey.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.proactiveDeliveryAttribution.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.proactiveFrequencyCap.findUnique({ where: { capId: smoke.capId } })
  ]);

  assertExactlyOne(descriptors, "outbound_descriptor");
  assertExactlyOne(outboxEvents, "outbox_event");
  assertExactlyOne(attempts, "delivery_attempt");
  assertExactlyOne(idempotencyKeys, "delivery_idempotency_key");
  assertExactlyOne(attributions, "delivery_attribution");

  const descriptor = descriptors[0];
  const outbox = outboxEvents[0];
  const attempt = attempts[0];
  const idempotency = idempotencyKeys[0];
  const attribution = attributions[0];

  if (
    descriptor.id !== smoke.descriptorId
    || descriptor.idempotencyKey !== smoke.idempotencyKey
    || descriptor.tenantId !== smoke.tenantId
    || descriptor.traceId !== smoke.traceId
    || descriptor.status !== "queued"
    || descriptor.outboxEventId !== outbox.id
  ) {
    throw new Error(`proactive_delivery_worker_smoke_descriptor_mismatch:${JSON.stringify(descriptor)}`);
  }
  if (
    outbox.aggregateId !== descriptor.id
    || outbox.queue !== "message-delivery"
    || outbox.traceId !== smoke.traceId
    || outbox.type !== "conversation.outbound.requested"
  ) {
    throw new Error(`proactive_delivery_worker_smoke_outbox_mismatch:${JSON.stringify(outbox)}`);
  }
  if (
    attempt.descriptorId !== descriptor.id
    || attempt.ruleId !== smoke.ruleId
    || attempt.status !== "queued"
    || attempt.tenantId !== smoke.tenantId
  ) {
    throw new Error(`proactive_delivery_worker_smoke_attempt_mismatch:${JSON.stringify(attempt)}`);
  }
  if (idempotency.key !== smoke.idempotencyKey) {
    throw new Error(`proactive_delivery_worker_smoke_idempotency_mismatch:${JSON.stringify(idempotency)}`);
  }
  if (
    attribution.descriptorId !== descriptor.id
    || attribution.ruleId !== smoke.ruleId
    || attribution.tenantId !== smoke.tenantId
    || attribution.variant !== "A"
  ) {
    throw new Error(`proactive_delivery_worker_smoke_attribution_mismatch:${JSON.stringify(attribution)}`);
  }
  if (cap?.used !== 1) {
    throw new Error(`proactive_delivery_worker_smoke_frequency_cap_mismatch:${JSON.stringify(cap)}`);
  }

  return { descriptor, outbox };
}

function assertExactlyOne(records, name) {
  if (records.length !== 1) {
    throw new Error(`proactive_delivery_worker_smoke_${name}_count:${records.length}`);
  }
}

async function cleanupStaleSmokeRows(prisma) {
  await cleanupSmokeRows(prisma, { startsWith: `tenant_${smokePrefix}_` }, `trc_${smokePrefix}_`);
}

async function cleanupSmokeRows(prisma, tenantId, tracePrefix) {
  await prisma.$transaction([
    prisma.proactiveDeliveryAttribution.deleteMany({ where: { tenantId } }),
    prisma.proactiveDeliveryAttempt.deleteMany({ where: { tenantId } }),
    prisma.proactiveDeliveryIdempotencyKey.deleteMany({ where: { tenantId } }),
    prisma.proactiveExperimentAssignment.deleteMany({ where: { tenantId } }),
    prisma.conversationOutboundDescriptor.deleteMany({ where: { tenantId } }),
    prisma.outboxEvent.deleteMany({ where: { traceId: { startsWith: tracePrefix } } }),
    prisma.proactiveFrequencyCap.deleteMany({ where: { tenantId } }),
    prisma.proactiveExecutionWindow.deleteMany({ where: { tenantId } }),
    prisma.proactiveRule.deleteMany({ where: { tenantId } }),
    prisma.conversation.deleteMany({ where: { tenantId } })
  ]);
}

function requireConfigured(value, name) {
  const configured = typeof value === "string" ? value.trim() : "";
  if (!configured) {
    throw new Error(`${name}_required`);
  }
  return configured;
}
