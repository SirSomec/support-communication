import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";
import { waitForMailpitMfaOtp } from "../../scripts/mailpit-mfa-otp.mjs";

if (process.env.FILE_SCAN_API_CALLBACK_SMOKE_ENABLED !== "true") {
  process.stdout.write("file scan API callback smoke skipped {\"reason\":\"FILE_SCAN_API_CALLBACK_SMOKE_ENABLED is not true\"}\n");
  process.exit(0);
}

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "file_scan_api_callback_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const apiBaseUrl = requireConfigured(process.env.BACKEND_API_BASE_URL, "BACKEND_API_BASE_URL").replace(/\/+$/, "");
const smoke = {
  auditId: `audit_${runId}`,
  channel: "SMOKE",
  descriptorId: `attachment_${runId}`,
  fileId: `file_${runId}`,
  fileName: "file-scan-api-callback-smoke.txt",
  idempotencyKey: `idempotency_${runId}`,
  objectKey: `smoke/${runId}/file-scan-api-callback-smoke.txt`,
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

  const accessToken = await loginServiceAdmin(apiBaseUrl);
  const output = await runWorkerOnce(apiBaseUrl, accessToken, smoke);
  const result = parseWorkerRunResult(output.stdout);

  if (result.scanned !== 1 || result.published !== 1 || result.failed !== 0) {
    throw new Error(`file_scan_api_callback_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const persisted = await assertPersistedScanResult(client, smoke);
  process.stdout.write(`file scan API callback smoke passed ${JSON.stringify({
    fileId: smoke.fileId,
    outboxEventId: smoke.outboxEventId,
    result,
    scanState: persisted.scanState,
    scanVerdict: persisted.scanVerdict
  })}\n`);
} finally {
  if (process.env.FILE_SCAN_API_CALLBACK_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
  }
  await client.$disconnect?.();
}

async function loginServiceAdmin(baseUrl) {
  const email = stringValue(process.env.FILE_SCAN_API_CALLBACK_SMOKE_SERVICE_ADMIN_EMAIL) || "service-admin@example.com";
  const password = stringValue(process.env.FILE_SCAN_API_CALLBACK_SMOKE_SERVICE_ADMIN_PASSWORD) || "correct-password";
  const first = await postJson(`${baseUrl}/auth/login`, { email, password });
  if (first.data?.accessToken) {
    return first.data.accessToken;
  }

  const mfaChallengeId = first.data?.mfaChallengeId;
  if (!mfaChallengeId) {
    throw new Error("file_scan_api_callback_smoke_mfa_challenge_missing");
  }
  const otp = stringValue(process.env.FILE_SCAN_API_CALLBACK_SMOKE_SERVICE_ADMIN_OTP)
    || await waitForMailpitMfaOtp({ challengeId: mfaChallengeId, email });

  const second = await postJson(`${baseUrl}/auth/login`, {
    email,
    mfaChallengeId,
    otp,
    password
  });
  const accessToken = second.data?.accessToken;
  if (!accessToken) {
    throw new Error("file_scan_api_callback_smoke_access_token_missing");
  }
  return accessToken;
}

async function postJson(url, body) {
  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== "ok") {
    throw new Error(`file_scan_api_callback_smoke_http_failed:${response.status}:${JSON.stringify(payload)}`);
  }
  return payload;
}

async function seedSmokeJob(prisma, input) {
  await prisma.$transaction(async (transaction) => {
    await transaction.workspaceFile.create({
      data: {
        auditId: input.auditId,
        channel: input.channel,
        checksum: "sha256:file-scan-api-callback-smoke",
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

async function runWorkerOnce(baseUrl, accessToken, input) {
  const env = {
    ...process.env,
    OUTBOX_BATCH_SIZE: "1",
    OUTBOX_FILE_SCAN_RESULT_BASE_URL: baseUrl,
    OUTBOX_FILE_SCAN_RESULT_BEARER_TOKEN: accessToken,
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
        reject(new Error(`file_scan_api_callback_worker_failed:${code ?? 1}:${stderr || stdout}`));
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
    throw new Error("file_scan_api_callback_worker_result_not_found");
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
    throw new Error(`file_scan_api_callback_outbox_not_published:${event?.status ?? "missing"}`);
  }

  if (!file || file.scanVerdict !== "clean" || file.scanState !== "scan_clean") {
    throw new Error(`file_scan_api_callback_scan_not_persisted:${file?.scanVerdict ?? "missing"}:${file?.scanState ?? "missing"}`);
  }

  if (file.scanner !== "local-deterministic-scanner") {
    throw new Error(`file_scan_api_callback_unexpected_scanner:${file.scanner ?? "missing"}`);
  }

  if (!idempotency || idempotency.fileId !== input.fileId) {
    throw new Error("file_scan_api_callback_idempotency_not_persisted");
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
