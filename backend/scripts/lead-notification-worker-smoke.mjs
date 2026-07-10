import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { createPrismaClient } from "../packages/database/dist/index.js";

const backendRoot = fileURLToPath(new URL("..", import.meta.url));
const smokePrefix = "lead_notification_worker_smoke";
const runId = `${smokePrefix}_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
const smoke = {
  auditId: `audit_${runId}`,
  company: "Lead Smoke Co",
  descriptorId: `lead_notification_${runId}`,
  email: `lead-smoke-${runId}@example.test`,
  leadId: `demo_req_${runId}`,
  requestFingerprint: `fingerprint_${runId}`,
  source: "release-smoke"
};

const client = createPrismaClient({
  datasourceUrl: requireConfigured(process.env.DATABASE_URL, "DATABASE_URL")
});

try {
  await cleanupStaleSmokeRows(client);
  await seedSmokeLeadNotification(client, smoke);

  const smtp = await startSmtpSmokeServer(smoke);
  try {
    const output = await runWorkerOnce(smtp.port);
    const result = parseWorkerRunResult(output.stdout);
    if (result.scanned !== 1 || result.delivered !== 1 || result.failed !== 0) {
      throw new Error(`lead_notification_worker_smoke_unexpected_result:${JSON.stringify(result)}`);
    }
    if (smtp.smtpMessages.length !== 1) {
      throw new Error(`lead_notification_worker_smtp_message_missing:${smtp.smtpMessages.length}`);
    }
    if (!smtp.smtpMessages[0].includes(smoke.email) || !smtp.smtpMessages[0].includes(smoke.company)) {
      throw new Error("lead_notification_worker_smtp_payload_mismatch");
    }

    const descriptor = await assertPersistedDelivery(client, smoke);
    process.stdout.write(`lead notification worker smoke passed ${JSON.stringify({
      descriptorId: smoke.descriptorId,
      leadId: smoke.leadId,
      providerMessageId: descriptor.payload.delivery.providerMessageId,
      result,
      smtpMessages: smtp.smtpMessages.length,
      status: descriptor.status
    })}\n`);
  } finally {
    await smtp.close();
  }
} finally {
  if (process.env.LEAD_NOTIFICATION_WORKER_SMOKE_KEEP_DATA !== "true") {
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
        ipHash: "sha256:lead-smoke-ip",
        message: "Need a product demo for release smoke verification.",
        name: "Lead Smoke",
        planInterest: "enterprise",
        requestFingerprint: input.requestFingerprint,
        source: input.source,
        status: "queued",
        updatedAt: createdAt,
        userAgentHash: "sha256:lead-smoke-user-agent"
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
          messagePreview: "Need a product demo for release smoke verification.",
          name: "Lead Smoke",
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

async function runWorkerOnce(smtpPort) {
  const env = {
    ...process.env,
    INTEGRATION_REPOSITORY: "prisma",
    NODE_ENV: "development",
    PUBLIC_DEMO_NOTIFICATION_DELIVERY_LIMIT: "1",
    PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE: "smtp",
    PUBLIC_DEMO_NOTIFICATION_SMTP_FROM: "noreply@support.local",
    PUBLIC_DEMO_NOTIFICATION_SMTP_HOST: "127.0.0.1",
    PUBLIC_DEMO_NOTIFICATION_SMTP_PORT: String(smtpPort),
    PUBLIC_DEMO_NOTIFICATION_SMTP_TO: "sales@support.local",
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
        reject(new Error(`lead_notification_worker_process_failed:${code ?? 1}:${stderr || stdout}`));
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
    throw new Error("lead_notification_worker_result_not_found");
  }
  return workerRecord.result;
}

async function assertPersistedDelivery(prisma, input) {
  const descriptor = await prisma.publicDemoRequestNotificationDescriptor.findUnique({
    where: { id: input.descriptorId }
  });
  if (!descriptor || descriptor.status !== "delivered") {
    throw new Error(`lead_notification_worker_smoke_not_delivered:${descriptor?.status ?? "missing"}`);
  }

  const payload = toJsonRecord(descriptor.payload);
  const delivery = toJsonRecord(payload.delivery);
  if (delivery.attempts !== 1 || typeof delivery.deliveredAt !== "string") {
    throw new Error("lead_notification_worker_smoke_delivery_attempt_not_persisted");
  }

  const providerMessageId = String(delivery.providerMessageId ?? "");
  if (!providerMessageId.startsWith("smtp-")) {
    throw new Error(`lead_notification_worker_smoke_provider_message_missing:${providerMessageId || "missing"}`);
  }

  return {
    ...descriptor,
    payload: {
      ...payload,
      delivery
    }
  };
}

async function startSmtpSmokeServer(input) {
  const smtpCommands = [];
  const smtpMessages = [];
  const server = createServer((socket) => {
    let buffer = "";
    let dataBuffer = "";
    let dataMode = false;

    socket.setEncoding("utf8");
    socket.write("220 lead-notification-smoke ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let lineEnd = buffer.indexOf("\r\n");
      while (lineEnd >= 0) {
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);

        if (dataMode) {
          if (line === ".") {
            smtpMessages.push(dataBuffer);
            dataBuffer = "";
            dataMode = false;
            socket.write(`250 2.0.0 queued as ${input.descriptorId}\r\n`);
          } else {
            dataBuffer += `${line}\n`;
          }
        } else {
          smtpCommands.push(line);
          if (/^(EHLO|HELO)\b/i.test(line)) {
            socket.write("250-lead-notification-smoke\r\n250 OK\r\n");
          } else if (/^(MAIL FROM|RCPT TO):/i.test(line)) {
            socket.write("250 OK\r\n");
          } else if (/^DATA$/i.test(line)) {
            dataMode = true;
            socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
          } else if (/^QUIT$/i.test(line)) {
            socket.write("221 Bye\r\n");
            socket.end();
          } else {
            socket.write("250 OK\r\n");
          }
        }

        lineEnd = buffer.indexOf("\r\n");
      }
    });
  });

  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("lead_notification_worker_smtp_port_unavailable"));
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
    smtpCommands,
    smtpMessages
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
