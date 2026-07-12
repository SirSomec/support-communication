import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "report_digest_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  descriptorId: `digest_${runId}`,
  dueAt: "1970-01-01T00:00:00.000Z",
  exportIdempotencyKey: "",
  notificationIdempotencyKey: "",
  periodKey: `period_${runId}`,
  reportType: "daily_support_digest",
  scheduleId: `schedule_${runId}`,
  tenantId: `tenant_${runId}`
};
smoke.exportIdempotencyKey = `scheduled-digest-export:${smoke.tenantId}:${smoke.scheduleId}:${smoke.periodKey}`;
smoke.notificationIdempotencyKey = `scheduled-digest-notification:${smoke.tenantId}:${smoke.scheduleId}:${smoke.periodKey}`;

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeDigest(client, smoke);

  const output = await runWorkerOnce(smoke);
  const result = parseWorkerRunResult(output.stdout);
  if (result.claimed !== 1 || result.completed !== 1 || result.failed !== 0) {
    throw new Error(`report_digest_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const persisted = await assertPersistedDigestRun(client, smoke);
  process.stdout.write(`report digest worker smoke passed ${JSON.stringify({
    descriptorId: smoke.descriptorId,
    exportJobId: persisted.exportJob.id,
    notificationId: persisted.notification.id,
    result,
    status: persisted.descriptor.status
  })}\n`);
} finally {
  if (process.env.REPORT_DIGEST_WORKER_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
  }
  await client.$disconnect?.();
}

async function seedSmokeDigest(prisma, input) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  await prisma.scheduledDigestDescriptor.create({
    data: {
      createdAt,
      dueAt: new Date(input.dueAt),
      id: input.descriptorId,
      periodKey: input.periodKey,
      reportType: input.reportType,
      scheduleId: input.scheduleId,
      status: "due",
      tenantId: input.tenantId,
      updatedAt: createdAt
    }
  });
}

async function runWorkerOnce(input) {
  const env = {
    ...process.env,
    REPORT_DIGEST_WORKER_LIMIT: "1",
    REPORT_DIGEST_WORKER_NOW: "2026-07-04T12:00:00.000Z",
    REPORT_DIGEST_WORKER_TENANT_ID: input.tenantId,
    REPORT_REPOSITORY: "prisma",
    RUNTIME_PROFILE: "local"
  };
  const child = spawn(process.execPath, ["apps/api-gateway/dist/reports/report-digest.main.js", "--once"], {
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
        reject(new Error(`report_digest_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
  const workerRecord = records.find((record) => record.service === "report-digest-worker" && record.result);
  if (!workerRecord) {
    throw new Error("report_digest_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDigestRun(prisma, input) {
  const descriptor = await prisma.scheduledDigestDescriptor.findUnique({
    where: { id: input.descriptorId }
  });
  if (!descriptor || descriptor.status !== "completed") {
    throw new Error(`report_digest_worker_smoke_not_completed:${descriptor?.status ?? "missing"}`);
  }

  const idempotency = await prisma.reportIdempotencyKey.findUnique({
    where: { key: input.exportIdempotencyKey }
  });
  if (!idempotency?.jobId) {
    throw new Error("report_digest_worker_smoke_export_idempotency_missing");
  }

  const exportJob = await prisma.reportExportJob.findFirst({
    where: { id: idempotency.jobId }
  });
  if (!exportJob || exportJob.statusKey !== "queued" || exportJob.queue !== "report-export") {
    throw new Error(`report_digest_worker_smoke_export_not_queued:${exportJob?.statusKey ?? "missing"}:${exportJob?.queue ?? "missing"}`);
  }

  const filters = toJsonRecord(exportJob.filters);
  if (filters.scheduledDigest !== true || filters.scheduleId !== input.scheduleId || filters.periodKey !== input.periodKey || filters.tenantId !== input.tenantId) {
    throw new Error("report_digest_worker_smoke_export_filters_mismatch");
  }

  const notification = await prisma.reportNotificationDescriptor.findUnique({
    where: { idempotencyKey: input.notificationIdempotencyKey }
  });
  if (!notification || notification.status !== "queued" || notification.exportJobId !== exportJob.id) {
    throw new Error(`report_digest_worker_smoke_notification_not_queued:${notification?.status ?? "missing"}`);
  }

  return { descriptor, exportJob, notification };
}

async function cleanupStaleSmokeRows(prisma) {
  const staleIdempotency = await prisma.reportIdempotencyKey.findMany({
    where: { key: { startsWith: `scheduled-digest-export:tenant_${smokePrefix}_` } }
  });
  const staleJobIds = staleIdempotency.map((item) => item.jobId).filter(Boolean);
  await prisma.$transaction([
    prisma.reportNotificationDescriptor.deleteMany({
      where: { idempotencyKey: { startsWith: `scheduled-digest-notification:tenant_${smokePrefix}_` } }
    }),
    prisma.reportIdempotencyKey.deleteMany({
      where: { key: { startsWith: `scheduled-digest-export:tenant_${smokePrefix}_` } }
    }),
    ...(staleJobIds.length
      ? [prisma.reportExportJob.deleteMany({ where: { id: { in: staleJobIds } } })]
      : []),
    prisma.scheduledDigestDescriptor.deleteMany({
      where: { id: { startsWith: `digest_${smokePrefix}_` } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, input) {
  const idempotency = await prisma.reportIdempotencyKey.findUnique({
    where: { key: input.exportIdempotencyKey }
  });
  await prisma.$transaction([
    prisma.reportNotificationDescriptor.deleteMany({
      where: { idempotencyKey: input.notificationIdempotencyKey }
    }),
    prisma.reportIdempotencyKey.deleteMany({
      where: { key: input.exportIdempotencyKey }
    }),
    ...(idempotency?.jobId
      ? [prisma.reportExportJob.deleteMany({ where: { id: idempotency.jobId } })]
      : []),
    prisma.scheduledDigestDescriptor.deleteMany({
      where: { id: input.descriptorId }
    })
  ]);
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
