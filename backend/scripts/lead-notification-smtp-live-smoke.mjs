import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "lead_notification_smtp_live_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  auditId: `audit_${runId}`,
  company: "External SMTP Smoke Co",
  descriptorId: `lead_notification_${runId}`,
  email: `lead-smtp-live-${runId}@example.test`,
  leadId: `demo_req_${runId}`,
  requestFingerprint: `fingerprint_${runId}`,
  source: "external-smtp-smoke",
  to: stringValue(process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_TO)
};

if (process.env.LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED !== "true") {
  process.stdout.write(`external SMTP lead notification smoke skipped ${JSON.stringify({
    reason: "LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_ENABLED is not true"
  })}\n`);
  process.exit(0);
}

const { createPrismaClient } = await import("../packages/database/dist/index.js");
const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeLeadNotification(client, smoke);

  const output = await runWorkerOnce();
  const result = parseWorkerRunResult(output.stdout);
  if (result.scanned !== 1 || result.delivered !== 1 || result.failed !== 0) {
    throw new Error(`lead_notification_smtp_live_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const descriptor = await assertPersistedDelivery(client, smoke);
  process.stdout.write(`external SMTP lead notification smoke passed ${JSON.stringify({
    descriptorId: smoke.descriptorId,
    leadId: smoke.leadId,
    providerMessageId: descriptor.payload.delivery.providerMessageId,
    result,
    status: descriptor.status
  })}\n`);
} finally {
  if (process.env.LEAD_NOTIFICATION_SMTP_LIVE_SMOKE_KEEP_DATA !== "true") {
    await cleanupSmokeRows(client, smoke);
  }
  await client.$disconnect?.();
}

async function seedSmokeLeadNotification(prisma, input) {
  const createdAt = new Date("1970-01-01T00:00:00.000Z");
  await prisma.$transaction(async (transaction) => {
    await transaction.publicDemoRequest.create({
      data: {
        company: input.company,
        consent: true,
        createdAt,
        email: input.email,
        id: input.leadId,
        idempotencyKey: `idem_${input.leadId}`,
        ipHash: "sha256:smtp-live-smoke-ip",
        message: "Need a product demo for external SMTP smoke verification.",
        name: "External SMTP Smoke",
        planInterest: "enterprise",
        requestFingerprint: input.requestFingerprint,
        source: input.source,
        status: "queued",
        updatedAt: createdAt,
        userAgentHash: "sha256:smtp-live-smoke-user-agent"
      }
    });

    await transaction.publicDemoRequestAuditEvent.create({
      data: {
        action: "public_demo_request.created",
        at: createdAt,
        id: input.auditId,
        immutable: true,
        leadId: input.leadId,
        requestFingerprint: input.requestFingerprint,
        result: "ok",
        source: input.source
      }
    });

    await transaction.publicDemoRequestNotificationDescriptor.create({
      data: {
        createdAt,
        id: input.descriptorId,
        leadId: input.leadId,
        payload: {
          company: input.company,
          email: input.email,
          messagePreview: "Need a product demo for external SMTP smoke verification.",
          name: "External SMTP Smoke",
          planInterest: "enterprise",
          source: input.source
        },
        queue: "lead-notification",
        status: "queued",
        type: "public.demo_request.notification.requested",
        updatedAt: createdAt
      }
    });
  });
}

async function runWorkerOnce() {
  const env = {
    ...process.env,
    INTEGRATION_REPOSITORY: "prisma",
    NODE_ENV: "development",
    PUBLIC_DEMO_NOTIFICATION_DELIVERY_LIMIT: "1",
    PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE: "smtp",
    PUBLIC_DEMO_NOTIFICATION_SMTP_FROM: requireConfigured(
      process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_FROM,
      "PUBLIC_DEMO_NOTIFICATION_SMTP_FROM"
    ),
    PUBLIC_DEMO_NOTIFICATION_SMTP_HOST: requireConfigured(
      process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_HOST,
      "PUBLIC_DEMO_NOTIFICATION_SMTP_HOST"
    ),
    PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD: stringValue(process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD),
    PUBLIC_DEMO_NOTIFICATION_SMTP_PORT: requireConfigured(
      process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_PORT,
      "PUBLIC_DEMO_NOTIFICATION_SMTP_PORT"
    ),
    PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE: stringValue(process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE) || "false",
    PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED:
      stringValue(process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED) || "true",
    PUBLIC_DEMO_NOTIFICATION_SMTP_TO: requireConfigured(
      process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_TO,
      "PUBLIC_DEMO_NOTIFICATION_SMTP_TO"
    ),
    PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME: stringValue(process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME),
    RUNTIME_PROFILE: "local"
  };
  const child = spawn(process.execPath, [
    "apps/api-gateway/dist/integrations/public-demo-request-notification.main.js",
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
        reject(new Error(`lead_notification_smtp_live_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
  const workerRecord = records.find((record) => record.service === "lead-notification-worker" && record.result);
  if (!workerRecord) {
    throw new Error("lead_notification_smtp_live_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDelivery(prisma, input) {
  const descriptor = await prisma.publicDemoRequestNotificationDescriptor.findUnique({
    where: { id: input.descriptorId }
  });
  if (!descriptor || descriptor.status !== "delivered") {
    throw new Error(`lead_notification_smtp_live_smoke_not_delivered:${descriptor?.status ?? "missing"}`);
  }

  const payload = toJsonRecord(descriptor.payload);
  const delivery = toJsonRecord(payload.delivery);
  if (delivery.attempts !== 1 || typeof delivery.deliveredAt !== "string") {
    throw new Error("lead_notification_smtp_live_smoke_delivery_attempt_not_persisted");
  }
  if (delivery.lastError) {
    throw new Error("lead_notification_smtp_live_smoke_delivery_last_error_persisted");
  }

  const providerMessageId = String(delivery.providerMessageId ?? "");
  if (!providerMessageId.startsWith("smtp-")) {
    throw new Error(`lead_notification_smtp_live_smoke_provider_message_missing:${providerMessageId || "missing"}`);
  }

  return {
    ...descriptor,
    payload: {
      ...payload,
      delivery
    }
  };
}

async function cleanupStaleSmokeRows(prisma) {
  await prisma.$transaction([
    prisma.publicDemoRequestNotificationDescriptor.deleteMany({
      where: { id: { startsWith: `lead_notification_${smokePrefix}_` } }
    }),
    prisma.publicDemoRequestAuditEvent.deleteMany({
      where: { id: { startsWith: `audit_${smokePrefix}_` } }
    }),
    prisma.publicDemoRequest.deleteMany({
      where: { id: { startsWith: `demo_req_${smokePrefix}_` } }
    })
  ]);
}

async function cleanupSmokeRows(prisma, input) {
  await prisma.$transaction([
    prisma.publicDemoRequestNotificationDescriptor.deleteMany({
      where: { id: input.descriptorId }
    }),
    prisma.publicDemoRequestAuditEvent.deleteMany({
      where: { id: input.auditId }
    }),
    prisma.publicDemoRequest.deleteMany({
      where: { id: input.leadId }
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
