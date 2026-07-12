import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "file_scan_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  auditId: `audit_${runId}`,
  callbackBearerToken: `token_${runId}`,
  channel: "SMOKE",
  descriptorId: `attachment_${runId}`,
  fileId: `file_${runId}`,
  fileName: "file-scan-worker-smoke.txt",
  idempotencyKey: `idempotency_${runId}`,
  objectKey: `smoke/${runId}/file-scan-worker-smoke.txt`,
  outboxEventId: `outbox_${runId}`,
  queue: `file_scan_${runId}`,
  requestFingerprint: `fingerprint_${runId}`,
  sizeBytes: 128,
  tenantId: "tenant-volga",
  traceId: `trc_${runId}`
};

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeJob(client, smoke);

  const callback = await startFileScanCallbackServer(client, smoke);
  try {
    const output = await runWorkerOnce(callback.port, smoke);
    const result = parseWorkerRunResult(output.stdout);

    if (result.scanned !== 1 || result.published !== 1 || result.failed !== 0) {
      throw new Error(`file_scan_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
    }

    const persisted = await assertPersistedScanResult(client, smoke);
    process.stdout.write(`file scan worker smoke passed ${JSON.stringify({
      fileId: smoke.fileId,
      outboxEventId: smoke.outboxEventId,
      result,
      scanState: persisted.scanState,
      scanVerdict: persisted.scanVerdict
    })}\n`);
  } finally {
    await callback.close();
  }
} finally {
  if (process.env.FILE_SCAN_WORKER_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
  }
  await client.$disconnect?.();
}

async function seedSmokeJob(prisma, input) {
  await prisma.$transaction(async (transaction) => {
    await transaction.workspaceFile.create({
      data: {
        auditId: input.auditId,
        channel: input.channel,
        checksum: "sha256:file-scan-worker-smoke",
        fileId: input.fileId,
        fileName: input.fileName,
        mimeType: "text/plain",
        objectKey: input.objectKey,
        scanCheckedAt: null,
        scanReason: null,
        scanState: "scan_pending",
        scanVerdict: null,
        scanner: null,
        sizeBytes: BigInt(input.sizeBytes),
        storageState: "uploaded",
        tenantId: input.tenantId
      }
    });

    await transaction.conversationOutboundDescriptor.create({
      data: {
        auditId: input.auditId,
        channel: input.channel,
        conversationId: null,
        deliveryState: "not_sent",
        id: input.descriptorId,
        idempotencyKey: input.idempotencyKey,
        kind: "attachment_upload",
        messageId: null,
        outboxEventId: input.outboxEventId,
        payload: {
          antivirusState: "scan_pending",
          channel: input.channel,
          deliveryState: "not_sent",
          fileId: input.fileId,
          fileName: input.fileName,
          queue: input.queue,
          sizeBytes: input.sizeBytes,
          storageState: "uploaded"
        },
        requestFingerprint: input.requestFingerprint,
        retryable: true,
        status: "upload_queued",
        tenantId: input.tenantId,
        traceId: input.traceId
      }
    });

    await transaction.outboxEvent.create({
      data: {
        aggregateId: input.descriptorId,
        aggregateType: "attachment",
        id: input.outboxEventId,
        occurredAt: new Date("1970-01-01T00:00:00.000Z"),
        payload: {
          channel: input.channel,
          descriptorId: input.descriptorId,
          fileId: input.fileId,
          fileName: input.fileName,
          sizeBytes: input.sizeBytes
        },
        queue: input.queue,
        status: "pending",
        traceId: input.traceId,
        type: "attachment.upload.requested"
      }
    });
  });
}

async function startFileScanCallbackServer(prisma, input) {
  const server = createServer((request, response) => {
    void handleFileScanCallback(prisma, input, request, response).catch((error) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({
        error: { code: "file_scan_worker_smoke_callback_failed" },
        message: error instanceof Error ? error.message : String(error),
        status: "error"
      }));
    });
  });

  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("file_scan_worker_smoke_callback_port_unavailable"));
        return;
      }
      resolve(address.port);
    });
  });

  return {
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
    port
  };
}

async function handleFileScanCallback(prisma, input, request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  const expectedPath = `/api/v1/files/${input.fileId}/scan-result`;
  if (request.method !== "POST" || requestUrl.pathname !== expectedPath) {
    sendJson(response, 404, { error: { code: "not_found" }, status: "error" });
    return;
  }

  if (headerValue(request.headers.authorization) !== `Bearer ${input.callbackBearerToken}`) {
    sendJson(response, 401, { error: { code: "unauthorized" }, status: "error" });
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
  if (body.verdict !== "clean") {
    sendJson(response, 422, { error: { code: "scan_verdict_unsupported" }, status: "error" });
    return;
  }

  const scanCheckedAt = body.checkedAt ? new Date(String(body.checkedAt)) : new Date();
  if (!Number.isFinite(scanCheckedAt.getTime())) {
    sendJson(response, 422, { error: { code: "scan_checked_at_invalid" }, status: "error" });
    return;
  }

  const scanResult = {
    fileId: input.fileId,
    scanCheckedAt: scanCheckedAt.toISOString(),
    scanReason: stringValue(body.reason) || null,
    scanState: "scan_clean",
    scanVerdict: "clean",
    scanner: stringValue(body.scanner) || "scanner-unknown"
  };

  await prisma.$transaction(async (transaction) => {
    const file = await transaction.workspaceFile.update({
      data: {
        scanCheckedAt,
        scanReason: scanResult.scanReason,
        scanState: scanResult.scanState,
        scanVerdict: scanResult.scanVerdict,
        scanner: scanResult.scanner
      },
      where: { fileId: input.fileId }
    });
    await transaction.workspaceFileScanResultIdempotency.create({
      data: {
        fileId: input.fileId,
        fingerprint: `${input.requestFingerprint}:${scanResult.scanVerdict}:${scanResult.scanner}`,
        key: input.idempotencyKey,
        result: {
          fileId: file.fileId,
          scanCheckedAt: scanResult.scanCheckedAt,
          scanReason: scanResult.scanReason,
          scanState: scanResult.scanState,
          scanVerdict: scanResult.scanVerdict,
          scanner: scanResult.scanner
        }
      }
    });
  });

  sendJson(response, 200, {
    data: scanResult,
    status: "ok"
  });
}

async function runWorkerOnce(callbackPort, input) {
  const env = {
    ...process.env,
    OUTBOX_BATCH_SIZE: "1",
    OUTBOX_FILE_SCAN_RESULT_BASE_URL: `http://127.0.0.1:${callbackPort}/api/v1`,
    OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: input.callbackBearerToken,
    OUTBOX_ONCE: "true",
    OUTBOX_QUEUE: input.queue,
    OUTBOX_SCANNER_ENABLED: "true",
    OUTBOX_SCANNER_LOCAL_VERDICT: "clean",
    OUTBOX_SCANNER_PROVIDER_MODE: "local",
    OUTBOX_SCANNER_URL: ""
  };

  const child = spawn(process.execPath, ["apps/outbox-worker/dist/main.js", "--file-scan-scanner", "--once"], {
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
        reject(new Error(`file_scan_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
  const workerRecord = records.find((record) => record.service === "file-scan-scanner-worker" && record.result);
  if (!workerRecord) {
    throw new Error("file_scan_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedScanResult(prisma, input) {
  const [event, file, idempotency] = await Promise.all([
    prisma.outboxEvent.findUnique({ where: { id: input.outboxEventId } }),
    prisma.workspaceFile.findUnique({ where: { fileId: input.fileId } }),
    prisma.workspaceFileScanResultIdempotency.findUnique({ where: { key: input.idempotencyKey } })
  ]);

  if (!event || event.status !== "published" || !event.publishedAt) {
    throw new Error(`file_scan_worker_smoke_outbox_not_published:${event?.status ?? "missing"}`);
  }

  if (!file || file.scanVerdict !== "clean" || file.scanState !== "scan_clean") {
    throw new Error(`file_scan_worker_smoke_scan_not_persisted:${file?.scanVerdict ?? "missing"}:${file?.scanState ?? "missing"}`);
  }

  if (file.scanner !== "local-deterministic-scanner") {
    throw new Error(`file_scan_worker_smoke_unexpected_scanner:${file.scanner ?? "missing"}`);
  }

  if (!idempotency || idempotency.fileId !== input.fileId) {
    throw new Error("file_scan_worker_smoke_idempotency_not_persisted");
  }

  return file;
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.workspaceFileScanResultIdempotency.deleteMany({
      where: { key: { startsWith: `idempotency_${smokePrefix}_` } }
    }),
    prisma.outboxEvent.deleteMany({
      where: {
        OR: [
          { id: { startsWith: `outbox_${smokePrefix}_` } },
          { aggregateId: { startsWith: `attachment_${smokePrefix}_` } },
          { queue: { startsWith: `file_scan_${smokePrefix}_` } }
        ]
      }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: { id: { startsWith: `attachment_${smokePrefix}_` } }
    }),
    prisma.workspaceFile.deleteMany({
      where: { fileId: { startsWith: `file_${smokePrefix}_` } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, input) {
  await prisma.$transaction([
    prisma.workspaceFileScanResultIdempotency.deleteMany({
      where: { key: input.idempotencyKey }
    }),
    prisma.outboxEvent.deleteMany({
      where: { id: input.outboxEventId }
    }),
    prisma.conversationOutboundDescriptor.deleteMany({
      where: { id: input.descriptorId }
    }),
    prisma.workspaceFile.deleteMany({
      where: { fileId: input.fileId }
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
        reject(new Error("file_scan_worker_smoke_invalid_callback_json"));
      }
    });
  });
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
