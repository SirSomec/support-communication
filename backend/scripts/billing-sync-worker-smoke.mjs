import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "billing_sync_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  idempotencyKey: `idem_${runId}`,
  jobId: `billing_sync_${runId}`,
  provider: "smoke-billing-provider",
  providerInvoiceId: `provider_invoice_${runId}`,
  tenantId: `tenant_${runId}`,
  traceId: `trc_${runId}`
};

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeBillingSyncJob(client, smoke);

  const provider = await startBillingProviderServer(smoke);
  try {
    const output = await runWorkerOnce(provider.port);
    const result = parseWorkerRunResult(output.stdout);
    if (result.scanned !== 1 || result.published !== 1 || result.failed !== 0) {
      throw new Error(`billing_sync_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
    }
    if (provider.requests.length !== 1) {
      throw new Error(`billing_sync_worker_smoke_provider_not_called:${provider.requests.length}`);
    }

    const persisted = await assertPersistedDispatch(client, smoke);
    process.stdout.write(`billing sync worker smoke passed ${JSON.stringify({
      jobId: smoke.jobId,
      providerCalls: provider.requests.length,
      result,
      status: persisted.status
    })}\n`);
  } finally {
    await provider.close();
  }
} finally {
  if (process.env.BILLING_SYNC_WORKER_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
  }
  await client.$disconnect?.();
}

async function seedSmokeBillingSyncJob(prisma, input) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  await prisma.$transaction(async (transaction) => {
    await transaction.billingTenantState.create({
      data: {
        arr: 1548000,
        healthScore: 99,
        id: input.tenantId,
        monthlyRevenue: 129000,
        name: "Billing Worker Smoke",
        owner: "release-smoke",
        planId: "starter",
        region: "RU",
        sla: "99.9%",
        status: "active",
        usage: {
          operators: 1,
          storageGb: 1,
          workspaces: 1
        },
        users: 1,
        workspaces: 1
      }
    });

    await transaction.billingSyncJob.create({
      data: {
        actor: "billing-provider",
        actorName: input.provider,
        attempts: 0,
        auditEventId: `audit_${input.jobId}`,
        createdAt,
        deadLetteredAt: null,
        deadLetterReplayAuditEvents: [],
        fromPlanId: "starter",
        id: input.jobId,
        lastError: null,
        lockedAt: null,
        nextAttemptAt: null,
        payload: {
          eventType: "invoice.payment_succeeded",
          idempotencyKey: input.idempotencyKey,
          invoiceId: `invoice_${runId}`,
          provider: input.provider,
          providerInvoiceId: input.providerInvoiceId,
          tenantId: input.tenantId
        },
        publishedAt: null,
        queue: "billing-sync",
        reason: "invoice.payment_succeeded",
        status: "pending",
        tenantId: input.tenantId,
        toPlanId: "business",
        traceId: input.traceId,
        updatedAt: createdAt
      }
    });
  });
}

async function startBillingProviderServer(input) {
  const requests = [];
  const server = createServer((request, response) => {
    void handleProviderRequest(input, requests, request, response).catch((error) => {
      sendJson(response, 500, {
        error: { code: "billing_sync_worker_smoke_provider_failed" },
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
        reject(new Error("billing_sync_worker_smoke_provider_port_unavailable"));
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

async function handleProviderRequest(input, requests, request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "POST" || requestUrl.pathname !== "/sync") {
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
  const requestPayload = toJsonRecord(body.request);
  if (body.operation !== "syncBillingJob" || requestPayload.jobId !== input.jobId) {
    sendJson(response, 422, { error: { code: "billing_sync_job_payload_mismatch" }, status: "error" });
    return;
  }
  if (requestPayload.provider !== input.provider || requestPayload.tenantId !== input.tenantId) {
    sendJson(response, 422, { error: { code: "billing_sync_job_target_mismatch" }, status: "error" });
    return;
  }

  requests.push(body);
  sendJson(response, 202, { data: { accepted: true, jobId: input.jobId }, status: "ok" });
}

async function runWorkerOnce(providerPort) {
  const env = {
    ...process.env,
    BILLING_SYNC_PROVIDER_MODE: "http",
    BILLING_SYNC_PROVIDER_TIMEOUT_MS: "5000",
    BILLING_SYNC_PROVIDER_URL: `http://127.0.0.1:${providerPort}/sync`,
    OUTBOX_BATCH_SIZE: "1",
    OUTBOX_ONCE: "true",
    OUTBOX_QUEUE: "billing-sync"
  };
  const child = spawn(process.execPath, ["apps/outbox-worker/dist/main.js", "--billing-sync", "--once"], {
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
        reject(new Error(`billing_sync_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
  const workerRecord = records.find((record) => record.service === "billing-sync-worker" && record.result);
  if (!workerRecord) {
    throw new Error("billing_sync_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDispatch(prisma, input) {
  const job = await prisma.billingSyncJob.findUnique({ where: { id: input.jobId } });
  if (!job || job.status !== "published" || !job.publishedAt) {
    throw new Error(`billing_sync_worker_smoke_not_published:${job?.status ?? "missing"}`);
  }
  if (job.lastError) {
    throw new Error(`billing_sync_worker_smoke_unexpected_last_error:${job.lastError}`);
  }
  return job;
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.billingSyncJob.deleteMany({
      where: { id: { startsWith: `billing_sync_${smokePrefix}_` } }
    }),
    prisma.billingTenantState.deleteMany({
      where: { id: { startsWith: `tenant_${smokePrefix}_` } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, input) {
  await prisma.$transaction([
    prisma.billingSyncJob.deleteMany({
      where: { id: input.jobId }
    }),
    prisma.billingTenantState.deleteMany({
      where: { id: input.tenantId }
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
        reject(new Error("billing_sync_worker_smoke_invalid_provider_json"));
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
