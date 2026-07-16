import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "lead_notification_mailpit_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  auditId: `audit_${runId}`,
  company: "Mailpit Smoke Co",
  descriptorId: `lead_notification_${runId}`,
  email: `lead-mailpit-${runId}@example.test`,
  from: "noreply@support.local",
  leadId: `demo_req_${runId}`,
  requestFingerprint: `fingerprint_${runId}`,
  source: "mailpit-staging-smoke",
  subject: "New public demo request from Mailpit Smoke Co",
  to: `sales-${runId}@support.local`
};

if (process.env.LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED !== "true") {
  process.stdout.write(`lead notification Mailpit smoke skipped ${JSON.stringify({
    reason: "LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED is not true"
  })}\n`);
  process.exit(0);
}

const mailpitApiBaseUrl = requireConfigured(
  stringValue(process.env.MAILPIT_API_BASE_URL) || "http://127.0.0.1:18025",
  "MAILPIT_API_BASE_URL"
);
const smtpHost = stringValue(process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_HOST)
  || stringValue(process.env.MAILPIT_SMTP_HOST)
  || "127.0.0.1";
const smtpPort = stringValue(process.env.PUBLIC_DEMO_NOTIFICATION_SMTP_PORT)
  || stringValue(process.env.MAILPIT_SMTP_PORT)
  || "11025";

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeLeadNotification(client, smoke);

  const output = await runWorkerOnce({ smtpHost, smtpPort });
  const result = parseWorkerRunResult(output.stdout);
  if (result.scanned !== 1 || result.delivered !== 1 || result.failed !== 0) {
    throw new Error(`lead_notification_mailpit_smoke_unexpected_result:${JSON.stringify(result)}`);
  }

  const message = await waitForMailpitMessage({
    apiBaseUrl: mailpitApiBaseUrl,
    expectedSubject: smoke.subject,
    expectedText: smoke.email,
    expectedTo: smoke.to
  });
  const descriptor = await assertPersistedDelivery(client, smoke);

  process.stdout.write(`lead notification Mailpit smoke passed ${JSON.stringify({
    descriptorId: smoke.descriptorId,
    leadId: smoke.leadId,
    mailpitMessageId: message.ID,
    mailpitMessages: 1,
    providerMessageId: descriptor.payload.delivery.providerMessageId,
    result,
    status: descriptor.status
  })}\n`);
} finally {
  if (process.env.LEAD_NOTIFICATION_MAILPIT_SMOKE_KEEP_DATA !== "true") {
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
        ipHash: "sha256:mailpit-smoke-ip",
        message: "Need a product demo for Mailpit staging smoke verification.",
        name: "Mailpit Smoke",
        planInterest: "enterprise",
        requestFingerprint: input.requestFingerprint,
        source: input.source,
        status: "queued",
        updatedAt: createdAt,
        userAgentHash: "sha256:mailpit-smoke-user-agent"
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
          messagePreview: "Need a product demo for Mailpit staging smoke verification.",
          name: "Mailpit Smoke",
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

async function runWorkerOnce({ smtpHost, smtpPort }) {
  const env = {
    ...process.env,
    NODE_ENV: "development",
    PUBLIC_DEMO_NOTIFICATION_DELIVERY_LIMIT: "1",
    PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE: "smtp",
    PUBLIC_DEMO_NOTIFICATION_SMTP_FROM: smoke.from,
    PUBLIC_DEMO_NOTIFICATION_SMTP_HOST: smtpHost,
    PUBLIC_DEMO_NOTIFICATION_SMTP_PORT: smtpPort,
    PUBLIC_DEMO_NOTIFICATION_SMTP_TO: smoke.to,
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
        reject(new Error(`lead_notification_mailpit_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
    throw new Error("lead_notification_mailpit_worker_result_not_found");
  }
  return workerRecord.result;
}

async function waitForMailpitMessage({ apiBaseUrl, expectedSubject, expectedText, expectedTo }) {
  const deadline = Date.now() + positiveInteger(process.env.LEAD_NOTIFICATION_MAILPIT_SMOKE_TIMEOUT_MS, 10_000);
  let lastMessageCount = 0;

  while (Date.now() < deadline) {
    const messages = await listMailpitMessages(apiBaseUrl);
    lastMessageCount = messages.length;
    const summary = messages.find((message) => {
      const recipients = Array.isArray(message.To) ? message.To : [];
      return message.Subject === expectedSubject
        && recipients.some((recipient) => recipient?.Address === expectedTo);
    });

    if (summary?.ID) {
      const detail = await getMailpitMessage(apiBaseUrl, summary.ID);
      if (String(detail.Text ?? "").includes(expectedText)) {
        return detail;
      }
    }

    await delay(250);
  }

  throw new Error(`lead_notification_mailpit_message_not_found:${JSON.stringify({
    expectedSubject,
    expectedTo,
    lastMessageCount
  })}`);
}

async function listMailpitMessages(apiBaseUrl) {
  const payload = await getMailpitJson(`${apiBaseUrl.replace(/\/+$/, "")}/api/v1/messages`);
  return Array.isArray(payload.messages) ? payload.messages : [];
}

function getMailpitMessage(apiBaseUrl, id) {
  return getMailpitJson(`${apiBaseUrl.replace(/\/+$/, "")}/api/v1/message/${encodeURIComponent(id)}`);
}

async function getMailpitJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`mailpit_api_failed:${response.status}:${url}`);
  }
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`mailpit_api_invalid_json:${url}`);
  }
  return payload;
}

async function assertPersistedDelivery(prisma, input) {
  const descriptor = await prisma.publicDemoRequestNotificationDescriptor.findUnique({
    where: { id: input.descriptorId }
  });
  if (!descriptor || descriptor.status !== "delivered") {
    throw new Error(`lead_notification_mailpit_smoke_not_delivered:${descriptor?.status ?? "missing"}`);
  }

  const payload = toJsonRecord(descriptor.payload);
  const delivery = toJsonRecord(payload.delivery);
  if (delivery.attempts !== 1 || typeof delivery.deliveredAt !== "string") {
    throw new Error("lead_notification_mailpit_smoke_delivery_attempt_not_persisted");
  }

  const providerMessageId = String(delivery.providerMessageId ?? "");
  if (!providerMessageId.startsWith("smtp-")) {
    throw new Error(`lead_notification_mailpit_smoke_provider_message_missing:${providerMessageId || "missing"}`);
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

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toJsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function requireConfigured(value, name) {
  const configured = stringValue(value);
  if (!configured) {
    throw new Error(`${name}_required`);
  }
  return configured;
}
