import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "proactive_delivery_prisma_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const evaluatedAt = new Date().toISOString();
const smoke = {
  capId: `cap_${runId}`,
  conversationId: `visitor_${runId}`,
  descriptorId: `proactive_rule_${runId}_tenant_${runId}_visitor_${runId}`,
  idempotencyKey: `proactive-delivery:tenant_${runId}:rule_${runId}:visitor_${runId}`,
  ruleId: `rule_${runId}`,
  tenantId: `tenant_${runId}`,
  tracePrefix: `trc_${runId}`
};
const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeRows(client);

  const workerOutputs = await Promise.all(
    Array.from({ length: 4 }, (_, index) => runWorkerOnce(index + 1))
  );
  const results = workerOutputs.map(({ stdout }) => parseWorkerRunResult(stdout));
  assertWorkerResults(results);
  const evidence = await assertPersistedDelivery(client);

  process.stdout.write(`proactive delivery Prisma concurrency smoke passed ${JSON.stringify({
    assignmentId: evidence.assignment.assignmentId,
    descriptorId: evidence.descriptor.id,
    outboxEventId: evidence.outbox.id,
    results
  })}\n`);
} finally {
  if (process.env.PROACTIVE_DELIVERY_PRISMA_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke.tenantId, smoke.tracePrefix);
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
        entry: "prisma concurrency smoke",
        id: smoke.conversationId,
        initials: "PS",
        language: "ru",
        metadata: { smoke: true },
        name: "Proactive Prisma Smoke",
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

async function runWorkerOnce(workerIndex) {
  const env = {
    ...process.env,
    AUTOMATION_REPOSITORY: "prisma",
    CONVERSATION_REPOSITORY: "prisma",
    NODE_ENV: "production",
    PROACTIVE_DELIVERY_ACTIVE_VARIANTS: "A",
    PROACTIVE_DELIVERY_EVALUATED_AT: evaluatedAt,
    PROACTIVE_DELIVERY_LIMIT: "1",
    PROACTIVE_DELIVERY_TRACE_ID: `${smoke.tracePrefix}_${workerIndex}`,
    PROACTIVE_DELIVERY_VISITOR_TTL_MS: String(60 * 60 * 1000),
    SERVICE_NAME: `proactive-delivery-prisma-smoke-${workerIndex}`
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
  });
  child.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
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
        reject(new Error(`proactive_delivery_prisma_worker_timeout:${workerIndex}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`proactive_delivery_prisma_worker_failed:${workerIndex}:${code ?? 1}:${stderr || stdout}`));
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
    throw new Error(`proactive_delivery_prisma_worker_result_missing:${stdout}`);
  }
  return workerRecord.result;
}

function assertWorkerResults(results) {
  const totals = results.reduce((sum, result) => ({
    conflicted: sum.conflicted + Number(result.conflicted ?? 0),
    duplicate: sum.duplicate + Number(result.duplicate ?? 0),
    failed: sum.failed + Number(result.failed ?? 0),
    queued: sum.queued + Number(result.queued ?? 0),
    scanned: sum.scanned + Number(result.scanned ?? 0),
    skipped: sum.skipped + Number(result.skipped ?? 0)
  }), { conflicted: 0, duplicate: 0, failed: 0, queued: 0, scanned: 0, skipped: 0 });

  if (
    totals.queued !== 1
    || totals.failed !== 0
    || totals.conflicted !== 0
    || totals.scanned !== results.length
    || totals.duplicate + totals.skipped !== results.length - 1
  ) {
    throw new Error(`proactive_delivery_prisma_worker_results_unexpected:${JSON.stringify({ results, totals })}`);
  }
}

async function assertPersistedDelivery(prisma) {
  const [descriptors, outboxEvents, attempts, idempotencyKeys, attributions, assignments, cap] = await Promise.all([
    prisma.conversationOutboundDescriptor.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.outboxEvent.findMany({ where: { aggregateId: smoke.descriptorId } }),
    prisma.proactiveDeliveryAttempt.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.proactiveDeliveryIdempotencyKey.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.proactiveDeliveryAttribution.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.proactiveExperimentAssignment.findMany({ where: { tenantId: smoke.tenantId } }),
    prisma.proactiveFrequencyCap.findUnique({ where: { capId: smoke.capId } })
  ]);

  assertExactlyOne(descriptors, "descriptor");
  assertExactlyOne(outboxEvents, "outbox_event");
  assertExactlyOne(attempts, "attempt");
  assertExactlyOne(idempotencyKeys, "idempotency_key");
  assertExactlyOne(attributions, "attribution");
  assertExactlyOne(assignments, "assignment");

  const descriptor = descriptors[0];
  const outbox = outboxEvents[0];
  if (
    descriptor.id !== smoke.descriptorId
    || descriptor.idempotencyKey !== smoke.idempotencyKey
    || descriptor.outboxEventId !== outbox.id
    || descriptor.status !== "queued"
    || outbox.status !== "pending"
    || cap?.used !== 1
  ) {
    throw new Error(`proactive_delivery_prisma_persistence_mismatch:${JSON.stringify({ cap, descriptor, outbox })}`);
  }

  return { assignment: assignments[0], descriptor, outbox };
}

function assertExactlyOne(records, name) {
  if (records.length !== 1) {
    throw new Error(`proactive_delivery_prisma_${name}_count:${records.length}`);
  }
}

async function cleanupStaleSmokeRows(prisma) {
  const tenantPrefix = `tenant_${smokePrefix}_`;
  const tracePrefix = `trc_${smokePrefix}_`;
  await cleanupSmokeRows(prisma, { startsWith: tenantPrefix }, tracePrefix);
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
