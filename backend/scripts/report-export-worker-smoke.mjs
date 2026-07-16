import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const objectRoot = ".runtime/report-export-worker-smoke";
const objectRootPath = join(backendRoot, objectRoot);
const smokePrefix = "report_export_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  auditId: `evt_${runId}`,
  backendQueueId: `report_${runId}`,
  exportJobId: `export_${runId}`,
  queue: `report-export-smoke-${runId}`,
  tenantId: `tenant_${runId}`
};

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeExportJob(client, smoke);

  const output = await runWorkerOnce(smoke);
  const result = parseWorkerRunResult(output.stdout);
  if (result.scanned !== 1 || result.ready !== 1 || result.failed !== 0) {
    throw new Error(`report_export_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const persisted = await assertPersistedExportRun(client, smoke);
  process.stdout.write(`report export worker smoke passed ${JSON.stringify({
    descriptorId: persisted.descriptor.id,
    fileName: persisted.descriptor.fileName,
    jobId: persisted.job.id,
    result,
    status: persisted.job.statusKey
  })}\n`);
} finally {
  if (process.env.REPORT_EXPORT_WORKER_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
    await rm(objectRootPath, { force: true, recursive: true });
  }
  await client.$disconnect?.();
}

async function seedSmokeExportJob(prisma, input) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  await prisma.reportExportJob.create({
    data: {
      auditId: input.auditId,
      backendQueueId: input.backendQueueId,
      columns: ["metric", "today"],
      createdAt,
      filters: { tenantId: input.tenantId },
      format: "XLSX",
      id: input.exportJobId,
      metricDefinitionVersion: "metrics/v1",
      name: "Report export worker smoke",
      period: "today",
      progress: 8,
      queue: input.queue,
      requestedBy: "smoke",
      rows: 0,
      status: "Queued",
      statusKey: "queued"
    }
  });
}

async function runWorkerOnce(input) {
  const env = {
    ...process.env,
    REPORT_EXPORT_OBJECT_ROOT: objectRoot,
    REPORT_EXPORT_WORKER_LIMIT: "1",
    REPORT_EXPORT_WORKER_NOW: "2026-07-04T12:00:00.000Z",
    REPORT_EXPORT_WORKER_QUEUE: input.queue,
    RUNTIME_PROFILE: "local"
  };
  const child = spawn(process.execPath, ["apps/api-gateway/dist/reports/report-export.main.js", "--once"], {
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
        reject(new Error(`report_export_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
  const workerRecord = records.find((record) => record.service === "report-export-worker" && record.result);
  if (!workerRecord) {
    throw new Error("report_export_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedExportRun(prisma, input) {
  const job = await prisma.reportExportJob.findUnique({
    where: { id: input.exportJobId }
  });
  if (!job || job.statusKey !== "ready") {
    throw new Error(`report_export_worker_smoke_not_ready:${job?.statusKey ?? "missing"}`);
  }
  if (job.progress !== 100 || job.rows <= 0 || !job.fileName?.endsWith(".xlsx")) {
    throw new Error("report_export_worker_smoke_job_mismatch");
  }

  const descriptor = await prisma.reportFileDescriptor.findUnique({
    where: { jobId: input.exportJobId }
  });
  if (!descriptor || descriptor.tenantId !== input.tenantId) {
    throw new Error("report_export_worker_smoke_descriptor_missing");
  }
  if (
    descriptor.contentType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || descriptor.format !== "XLSX"
    || !descriptor.checksum.startsWith("sha256:")
    || descriptor.sizeBytes <= 0
  ) {
    throw new Error("report_export_worker_smoke_descriptor_mismatch");
  }

  const storedFile = await stat(join(objectRootPath, descriptor.objectKey));
  if (!storedFile.isFile() || storedFile.size !== descriptor.sizeBytes) {
    throw new Error("report_export_worker_smoke_object_file_mismatch");
  }

  return { descriptor, job };
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.reportFileDescriptor.deleteMany({
      where: { jobId: { startsWith: `export_${smokePrefix}_` } }
    }),
    prisma.reportExportJob.deleteMany({
      where: { id: { startsWith: `export_${smokePrefix}_` } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, input) {
  await prisma.$transaction([
    prisma.reportFileDescriptor.deleteMany({
      where: { jobId: input.exportJobId }
    }),
    prisma.reportExportJob.deleteMany({
      where: { id: input.exportJobId }
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
