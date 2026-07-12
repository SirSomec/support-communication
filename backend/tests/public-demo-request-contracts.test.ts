import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createServer as createTlsServer } from "node:tls";
import { fileURLToPath } from "node:url";
import { IntegrationRepository } from "../apps/api-gateway/src/integrations/integration.repository.ts";
import {
  createDisabledPublicDemoRequestNotificationProvider,
  createDeterministicPublicDemoRequestNotificationProvider,
  executePublicDemoRequestNotificationWorker,
  type PublicDemoRequestNotificationProvider
} from "../apps/api-gateway/src/integrations/public-demo-request-notification.worker.ts";
import { PublicDemoRequestService } from "../apps/api-gateway/src/integrations/public-demo-request.service.ts";

describe("public demo request contracts", () => {
  beforeEach(() => {
    IntegrationRepository.useDefault(IntegrationRepository.inMemory());
  });

  afterEach(() => {
    IntegrationRepository.clearDefault();
  });

  it("persists a sanitized public lead with immutable audit and queued notification descriptor", async () => {
    const repository = IntegrationRepository.inMemory();
    const service = new PublicDemoRequestService(repository);

    const response = await service.createDemoRequest(
      {
        company: "Acme Retail",
        consent: true,
        email: " OWNER@ACME.EXAMPLE ",
        message: "Need a demo for 20 operators and web SDK migration.",
        name: "Jane Owner",
        planInterest: "Growth",
        source: "landing-hero"
      },
      {
        idempotencyKey: "lead-acme-growth",
        ip: "203.0.113.42",
        userAgent: "Contract Browser/1.0"
      }
    );

    assert.equal(response.service, "publicLeadService");
    assert.equal(response.operation, "createDemoRequest");
    assert.equal(response.status, "ok");
    assert.equal(response.data.accepted, true);
    assert.equal(response.data.duplicate, false);
    assert.match(String(response.data.leadId), /^demo_req_/);
    assert.match(String(response.data.requestFingerprint), /^[a-f0-9]{64}$/);
    assert.equal(response.data.auditEvent.immutable, true);
    assert.equal(response.data.auditEvent.action, "public_demo_request.created");
    assert.equal(response.data.notificationDescriptor.status, "queued");
    assert.equal(response.data.notificationDescriptor.type, "public.demo_request.notification.requested");

    const state = repository.readState();
    assert.equal(state.publicDemoRequests.length, 1);
    assert.equal(state.publicDemoRequestAuditEvents.length, 1);
    assert.equal(state.publicDemoRequestNotificationDescriptors.length, 1);
    assert.equal(state.publicDemoRequests[0].email, "owner@acme.example");
    assert.equal(state.publicDemoRequests[0].consent, true);
    assert.equal(typeof state.publicDemoRequests[0].ipHash, "string");
    assert.equal(typeof state.publicDemoRequests[0].userAgentHash, "string");

    const serialized = JSON.stringify(state);
    assert.equal(serialized.includes("203.0.113.42"), false);
    assert.equal(serialized.includes("Contract Browser/1.0"), false);
  });

  it("rejects invalid email and missing consent without storing a lead", async () => {
    const repository = IntegrationRepository.inMemory();
    const service = new PublicDemoRequestService(repository);

    const response = await service.createDemoRequest({
      company: "Acme Retail",
      consent: false,
      email: "not-an-email",
      message: "Need demo",
      name: "Jane Owner",
      source: "landing-hero"
    });

    assert.equal(response.status, "invalid");
    assert.equal(response.error?.code, "public_demo_request_invalid");
    assert.equal(repository.readState().publicDemoRequests.length, 0);
  });

  it("rate-limits honeypot and duplicate fingerprints", async () => {
    const repository = IntegrationRepository.inMemory();
    const service = new PublicDemoRequestService(repository);
    const payload = {
      company: "Acme Retail",
      consent: true,
      email: "owner@acme.example",
      message: "Need a demo for 20 operators and web SDK migration.",
      name: "Jane Owner",
      planInterest: "Growth",
      source: "landing-hero"
    };

    const honeypot = await service.createDemoRequest({ ...payload, website: "spam.test" });
    assert.equal(honeypot.status, "rate_limited");
    assert.equal(repository.readState().publicDemoRequests.length, 0);

    const first = await service.createDemoRequest(payload, { ip: "203.0.113.42" });
    const duplicate = await service.createDemoRequest(payload, { ip: "203.0.113.42" });

    assert.equal(first.status, "ok");
    assert.equal(duplicate.status, "rate_limited");
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.leadId, first.data.leadId);
    assert.equal(repository.readState().publicDemoRequests.length, 1);
  });

  it("detects idempotency-key conflicts when payload fingerprint changes", async () => {
    const repository = IntegrationRepository.inMemory();
    const service = new PublicDemoRequestService(repository);
    const base = {
      company: "Acme Retail",
      consent: true,
      email: "owner@acme.example",
      message: "Need a demo for 20 operators and web SDK migration.",
      name: "Jane Owner",
      source: "landing-hero"
    };

    const first = await service.createDemoRequest(base, { idempotencyKey: "lead-acme-growth" });
    const conflict = await service.createDemoRequest(
      { ...base, email: "other@acme.example" },
      { idempotencyKey: "lead-acme-growth" }
    );

    assert.equal(first.status, "ok");
    assert.equal(conflict.status, "conflict");
    assert.equal(conflict.error?.code, "public_demo_request_idempotency_conflict");
    assert.equal(repository.readState().publicDemoRequests.length, 1);
  });

  it("delivers queued public demo request notification descriptors idempotently", async () => {
    const repository = IntegrationRepository.inMemory();
    const service = new PublicDemoRequestService(repository);
    const created = await service.createDemoRequest({
      company: "Acme Retail",
      consent: true,
      email: "owner@acme.example",
      message: "Need a demo for 20 operators and web SDK migration.",
      name: "Jane Owner",
      source: "landing-hero"
    });
    const descriptorId = String(created.data.notificationDescriptor.id);

    const firstRun = await executePublicDemoRequestNotificationWorker({
      limit: 5,
      now: "2026-07-03T12:00:00.000Z",
      provider: createDeterministicPublicDemoRequestNotificationProvider(),
      repository
    });
    const secondRun = await executePublicDemoRequestNotificationWorker({
      limit: 5,
      now: "2026-07-03T12:01:00.000Z",
      provider: createDeterministicPublicDemoRequestNotificationProvider(),
      repository
    });

    assert.deepEqual(firstRun, { delivered: 1, failed: 0, scanned: 1 });
    assert.deepEqual(secondRun, { delivered: 0, failed: 0, scanned: 0 });

    const descriptor = repository.readState().publicDemoRequestNotificationDescriptors.find((item) => item.id === descriptorId);
    assert.equal(descriptor?.status, "delivered");
    assert.equal(descriptor?.payload.delivery?.attempts, 1);
    assert.match(descriptor?.payload.delivery?.providerMessageId ?? "", /^local-lead-notification-/);
    assert.equal(descriptor?.payload.delivery?.deliveredAt, "2026-07-03T12:00:00.000Z");
  });

  it("records redacted public demo request notification delivery failures", async () => {
    const repository = IntegrationRepository.inMemory();
    const service = new PublicDemoRequestService(repository);
    const created = await service.createDemoRequest({
      company: "Acme Retail",
      consent: true,
      email: "owner@acme.example",
      message: "Need a demo for 20 operators and web SDK migration.",
      name: "Jane Owner",
      source: "landing-hero"
    });
    const descriptorId = String(created.data.notificationDescriptor.id);
    const failingProvider: PublicDemoRequestNotificationProvider = {
      async send() {
        throw new Error("smtp failed for token secret-demo-provider-token and owner@acme.example");
      }
    };

    const result = await executePublicDemoRequestNotificationWorker({
      limit: 5,
      now: "2026-07-03T12:05:00.000Z",
      provider: failingProvider,
      repository
    });

    assert.deepEqual(result, { delivered: 0, failed: 1, scanned: 1 });
    const descriptor = repository.readState().publicDemoRequestNotificationDescriptors.find((item) => item.id === descriptorId);
    assert.equal(descriptor?.status, "failed");
    assert.equal(descriptor?.payload.delivery?.attempts, 1);
    assert.equal(descriptor?.payload.delivery?.lastError?.code, "public_demo_request_notification_delivery_failed");
    const lastError = JSON.stringify(descriptor?.payload.delivery?.lastError);
    assert.equal(lastError.includes("secret-demo-provider-token"), false);
    assert.equal(lastError.includes("owner@acme.example"), false);
  });

  it("does not consume queued public demo request notifications when provider dispatch is disabled", async () => {
    const repository = IntegrationRepository.inMemory();
    const service = new PublicDemoRequestService(repository);
    const created = await service.createDemoRequest({
      company: "Acme Retail",
      consent: true,
      email: "owner@acme.example",
      message: "Need a demo for 20 operators and web SDK migration.",
      name: "Jane Owner",
      source: "landing-hero"
    });
    const descriptorId = String(created.data.notificationDescriptor.id);

    const result = await executePublicDemoRequestNotificationWorker({
      limit: 5,
      now: "2026-07-05T12:00:00.000Z",
      provider: createDisabledPublicDemoRequestNotificationProvider("provider_not_configured"),
      repository
    });

    assert.deepEqual(result, { delivered: 0, failed: 0, scanned: 0 });
    const descriptor = repository.readState().publicDemoRequestNotificationDescriptors.find((item) => item.id === descriptorId);
    assert.equal(descriptor?.status, "queued");
    assert.equal(descriptor?.payload.delivery, undefined);
  });

  it("sends public demo request notifications through an SMTP provider", async () => {
    const smtp = await startFakeSmtpServer();
    try {
      const {
        createSmtpPublicDemoRequestNotificationProvider
      } = await import("../apps/api-gateway/src/integrations/public-demo-request-notification.worker.ts");
      const provider = createSmtpPublicDemoRequestNotificationProvider({
        from: "noreply@support.local",
        host: "127.0.0.1",
        port: smtp.port,
        timeoutMs: 1000,
        to: "sales@support.local"
      });

      const result = await provider.send({
        descriptor: {
          createdAt: "2026-07-05T10:00:00.000Z",
          id: "lead-notification-smtp-001",
          leadId: "demo_req_smtp_001",
          payload: {
            company: "Acme Retail",
            email: "owner@acme.example",
            messagePreview: "Need a demo for 20 operators.",
            name: "Jane Owner",
            planInterest: "enterprise",
            source: "landing-hero"
          },
          queue: "lead-notification",
          status: "queued",
          type: "public.demo_request.notification.requested",
          updatedAt: "2026-07-05T10:00:00.000Z"
        },
        now: "2026-07-05T10:01:00.000Z"
      });

      assert.match(result.providerMessageId, /^smtp-/);
      assert.equal(smtp.messages.length, 1);
      assert.match(smtp.messages[0], /To: sales@support\.local/);
      assert.match(smtp.messages[0], /From: noreply@support\.local/);
      assert.match(smtp.messages[0], /Subject: New public demo request from Acme Retail/);
      assert.match(smtp.messages[0], /owner@acme\.example/);
      assert.match(smtp.commands.join("\n"), /MAIL FROM:<noreply@support\.local>/);
      assert.match(smtp.commands.join("\n"), /RCPT TO:<sales@support\.local>/);
    } finally {
      await smtp.close();
    }
  });

  it("loads SMTP credentials from env and authenticates before delivering public demo request notifications", async () => {
    const smtp = await startAuthSmtpServer({
      password: "smtp-secret",
      username: "smtp-user"
    });
    try {
      const {
        createPublicDemoRequestNotificationProviderFromEnv
      } = await import("../apps/api-gateway/src/integrations/public-demo-request-notification.main.ts");
      assert.equal(typeof createPublicDemoRequestNotificationProviderFromEnv, "function");

      const provider = createPublicDemoRequestNotificationProviderFromEnv({
        NODE_ENV: "staging",
        PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE: "smtp",
        PUBLIC_DEMO_NOTIFICATION_SMTP_FROM: "noreply@support.local",
        PUBLIC_DEMO_NOTIFICATION_SMTP_HOST: "127.0.0.1",
        PUBLIC_DEMO_NOTIFICATION_SMTP_PASSWORD: "smtp-secret",
        PUBLIC_DEMO_NOTIFICATION_SMTP_PORT: String(smtp.port),
        PUBLIC_DEMO_NOTIFICATION_SMTP_TO: "sales@support.local",
        PUBLIC_DEMO_NOTIFICATION_SMTP_USERNAME: "smtp-user"
      }, "smtp");

      const result = await provider.send({
        descriptor: {
          createdAt: "2026-07-05T10:00:00.000Z",
          id: "lead-notification-smtp-auth-001",
          leadId: "demo_req_smtp_auth_001",
          payload: {
            company: "Acme Retail",
            email: "owner@acme.example",
            messagePreview: "Need authenticated SMTP delivery.",
            name: "Jane Owner",
            planInterest: "enterprise",
            source: "landing-hero"
          },
          queue: "lead-notification",
          status: "queued",
          type: "public.demo_request.notification.requested",
          updatedAt: "2026-07-05T10:00:00.000Z"
        },
        now: "2026-07-05T10:02:00.000Z"
      });

      const expectedAuth = Buffer.from("\u0000smtp-user\u0000smtp-secret", "utf8").toString("base64");
      const commands = smtp.commands.join("\n");
      assert.match(result.providerMessageId, /^smtp-/);
      assert.equal(smtp.messages.length, 1);
      assert.match(commands, new RegExp(`AUTH PLAIN ${expectedAuth}`));
      assert.ok(
        smtp.commands.findIndex((command) => command.startsWith("AUTH PLAIN ")) < smtp.commands.findIndex((command) => command.startsWith("MAIL FROM:")),
        "SMTP AUTH must run before MAIL FROM"
      );
      assert.match(commands, /MAIL FROM:<noreply@support\.local>/);
      assert.match(smtp.messages[0], /owner@acme\.example/);
    } finally {
      await smtp.close();
    }
  });

  it("uses implicit TLS when SMTP secure mode is enabled", async () => {
    const smtp = await startTlsSmtpServer();
    try {
      const {
        createPublicDemoRequestNotificationProviderFromEnv
      } = await import("../apps/api-gateway/src/integrations/public-demo-request-notification.main.ts");
      const provider = createPublicDemoRequestNotificationProviderFromEnv({
        NODE_ENV: "staging",
        PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE: "smtp",
        PUBLIC_DEMO_NOTIFICATION_SMTP_FROM: "noreply@support.local",
        PUBLIC_DEMO_NOTIFICATION_SMTP_HOST: "127.0.0.1",
        PUBLIC_DEMO_NOTIFICATION_SMTP_PORT: String(smtp.port),
        PUBLIC_DEMO_NOTIFICATION_SMTP_SECURE: "true",
        PUBLIC_DEMO_NOTIFICATION_SMTP_TIMEOUT_MS: "1000",
        PUBLIC_DEMO_NOTIFICATION_SMTP_TLS_REJECT_UNAUTHORIZED: "false",
        PUBLIC_DEMO_NOTIFICATION_SMTP_TO: "sales@support.local"
      }, "smtp");

      const result = await provider.send({
        descriptor: {
          createdAt: "2026-07-05T10:00:00.000Z",
          id: "lead-notification-smtp-tls-001",
          leadId: "demo_req_smtp_tls_001",
          payload: {
            company: "Acme Retail",
            email: "owner@acme.example",
            messagePreview: "Need secure SMTP delivery.",
            name: "Jane Owner",
            planInterest: "enterprise",
            source: "landing-hero"
          },
          queue: "lead-notification",
          status: "queued",
          type: "public.demo_request.notification.requested",
          updatedAt: "2026-07-05T10:00:00.000Z"
        },
        now: "2026-07-05T10:03:00.000Z"
      });

      assert.match(result.providerMessageId, /^smtp-/);
      assert.equal(smtp.secureConnections, 1);
      assert.equal(smtp.messages.length, 1);
      assert.match(smtp.commands.join("\n"), /EHLO support-communication\.local/);
      assert.match(smtp.commands.join("\n"), /MAIL FROM:<noreply@support\.local>/);
      assert.match(smtp.messages[0], /owner@acme\.example/);
    } finally {
      await smtp.close();
    }
  });

  it("fails SMTP public demo request notifications promptly when the SMTP peer closes mid-dialog", async () => {
    const smtp = await startClosingSmtpServer();
    try {
      const {
        createSmtpPublicDemoRequestNotificationProvider
      } = await import("../apps/api-gateway/src/integrations/public-demo-request-notification.worker.ts");
      const provider = createSmtpPublicDemoRequestNotificationProvider({
        from: "noreply@support.local",
        host: "127.0.0.1",
        port: smtp.port,
        timeoutMs: 1000,
        to: "sales@support.local"
      });
      const startedAt = Date.now();
      const sendPromise = provider.send({
        descriptor: {
          createdAt: "2026-07-05T10:00:00.000Z",
          id: "lead-notification-smtp-close-001",
          leadId: "demo_req_smtp_close_001",
          payload: {
            company: "Acme Retail",
            email: "owner@acme.example",
            messagePreview: "Need a demo for 20 operators.",
            name: "Jane Owner",
            planInterest: "enterprise",
            source: "landing-hero"
          },
          queue: "lead-notification",
          status: "queued",
          type: "public.demo_request.notification.requested",
          updatedAt: "2026-07-05T10:00:00.000Z"
        },
        now: "2026-07-05T10:01:00.000Z"
      }).then(
        () => "resolved",
        (error) => error instanceof Error ? error.message : String(error)
      );

      const result = await Promise.race([
        sendPromise,
        new Promise((resolve) => setTimeout(() => resolve("timeout"), 500))
      ]);

      assert.match(String(result), /smtp_connection_closed|smtp_unexpected_response/);
      assert.ok(Date.now() - startedAt < 500, "SMTP close should not wait for the full timeout");
    } finally {
      await smtp.close();
    }
  });

  it("exposes public demo request notification worker once command in the release checklist", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const releaseChecklist = readFileSync("scripts/release-checklist.mjs", "utf8");

    assert.equal(
      packageJson.scripts["start:lead-notification-worker"],
      "npm run build && node --env-file=.env.example apps/api-gateway/dist/integrations/public-demo-request-notification.main.js"
    );
    assert.equal(
      packageJson.scripts["lead-notification:worker:once"],
      "npm run build && node --env-file=.env.example scripts/lead-notification-worker-smoke.mjs"
    );
    assert.equal(existsSync("scripts/lead-notification-worker-smoke.mjs"), true);
    assert.match(releaseChecklist, /script: "lead-notification:worker:once"/);

    const smokeScript = readFileSync("scripts/lead-notification-worker-smoke.mjs", "utf8");
    assert.match(smokeScript, /publicDemoRequestNotificationDescriptor\.(?:create|upsert)/);
    assert.match(smokeScript, /scanned\s*!==\s*1/);
    assert.match(smokeScript, /delivered\s*!==\s*1/);
    assert.match(smokeScript, /failed\s*!==\s*0/);
    assert.match(smokeScript, /status\s*!==\s*["']delivered["']/);
    assert.match(smokeScript, /providerMessageId/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE:\s*["']smtp["']/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_SMTP_HOST/);
    assert.match(smokeScript, /startSmtpSmokeServer/);
    assert.match(smokeScript, /smtpMessages/);
  });

  it("exposes a Mailpit-backed public demo request notification staging smoke", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const releaseChecklist = readFileSync("scripts/release-checklist.mjs", "utf8");
    const releaseGate = readFileSync("../scripts/release-gate.mjs", "utf8");

    assert.equal(
      packageJson.scripts["lead-notification:mailpit-smoke"],
      "npm run build && node --env-file=.env.example scripts/lead-notification-mailpit-smoke.mjs"
    );
    assert.equal(existsSync("scripts/lead-notification-mailpit-smoke.mjs"), true);
    assert.doesNotMatch(releaseChecklist, /lead-notification:mailpit-smoke/);
    assert.match(releaseGate, /npm run lead-notification:mailpit-smoke/);
    assert.match(releaseGate, /LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED:\s*"true"/);
    assert.match(releaseGate, /MAILPIT_API_BASE_URL:\s*"http:\/\/127\.0\.0\.1:18025"/);
    assert.match(releaseGate, /PUBLIC_DEMO_NOTIFICATION_SMTP_HOST:\s*"127\.0\.0\.1"/);
    assert.match(releaseGate, /PUBLIC_DEMO_NOTIFICATION_SMTP_PORT:\s*"11025"/);

    const smokeScript = readFileSync("scripts/lead-notification-mailpit-smoke.mjs", "utf8");
    assert.match(smokeScript, /MAILPIT_API_BASE_URL/);
    assert.match(smokeScript, /\/api\/v1\/messages/);
    assert.match(smokeScript, /\/api\/v1\/message\//);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE:\s*["']smtp["']/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_SMTP_HOST/);
    assert.match(smokeScript, /PUBLIC_DEMO_NOTIFICATION_SMTP_PORT/);
    assert.match(smokeScript, /mailpitMessages/);
    assert.match(smokeScript, /lead notification Mailpit smoke skipped/);
    assert.match(smokeScript, /lead notification Mailpit smoke passed/);
  });

  it("skips Mailpit staging smoke without requiring database or Mailpit credentials", () => {
    const backendRoot = fileURLToPath(new URL("..", import.meta.url));
    const result = spawnSync(process.execPath, ["scripts/lead-notification-mailpit-smoke.mjs"], {
      cwd: backendRoot,
      env: {
        ...process.env,
        DATABASE_URL: "",
        LEAD_NOTIFICATION_MAILPIT_SMOKE_ENABLED: "false",
        MAILPIT_API_BASE_URL: ""
      },
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /lead notification Mailpit smoke skipped/);
    assert.doesNotMatch(result.stderr, /DATABASE_URL_required|MAILPIT_API_BASE_URL_required/);
  });

  it("loads a long-running interval for the public demo request notification worker", async () => {
    const {
      loadPublicDemoRequestNotificationWorkerRuntimeConfig
    } = await import("../apps/api-gateway/src/integrations/public-demo-request-notification.main.ts");

    const config = loadPublicDemoRequestNotificationWorkerRuntimeConfig({
      PUBLIC_DEMO_NOTIFICATION_DELIVERY_INTERVAL_MS: "2500",
      PUBLIC_DEMO_NOTIFICATION_DELIVERY_LIMIT: "7",
      PUBLIC_DEMO_NOTIFICATION_PROVIDER_MODE: "smtp"
    }, ["node", "public-demo-request-notification.main.js"]);

    assert.equal(config.intervalMs, 2500);
    assert.equal(config.limit, 7);
    assert.equal(config.once, false);
    assert.equal(config.providerMode, "smtp");
  });
});

function startFakeSmtpServer(): Promise<{
  close(): Promise<void>;
  commands: string[];
  messages: string[];
  port: number;
}> {
  const commands: string[] = [];
  const messages: string[] = [];
  const server = createServer((socket) => {
    let buffer = "";
    let dataMode = false;
    let dataBuffer = "";

    socket.setEncoding("utf8");
    socket.write("220 fake-smtp.local ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let lineEnd = buffer.indexOf("\r\n");
      while (lineEnd >= 0) {
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);

        if (dataMode) {
          if (line === ".") {
            messages.push(dataBuffer);
            dataBuffer = "";
            dataMode = false;
            socket.write("250 2.0.0 queued as fake-message-001\r\n");
          } else {
            dataBuffer += `${line}\n`;
          }
        } else {
          commands.push(line);
          if (/^(EHLO|HELO)\b/i.test(line)) {
            socket.write("250-fake-smtp.local\r\n250 OK\r\n");
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

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("fake_smtp_port_unavailable"));
        return;
      }
      resolve({
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => error ? closeReject(error) : closeResolve());
        }),
        commands,
        messages,
        port: address.port
      });
    });
  });
}

function startAuthSmtpServer(input: { password: string; username: string }): Promise<{
  close(): Promise<void>;
  commands: string[];
  messages: string[];
  port: number;
}> {
  const commands: string[] = [];
  const messages: string[] = [];
  const expectedAuth = Buffer.from(`\u0000${input.username}\u0000${input.password}`, "utf8").toString("base64");
  const server = createServer((socket) => {
    let authenticated = false;
    let buffer = "";
    let dataBuffer = "";
    let dataMode = false;

    socket.setEncoding("utf8");
    socket.write("220 auth-smtp.local ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let lineEnd = buffer.indexOf("\r\n");
      while (lineEnd >= 0) {
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);

        if (dataMode) {
          if (line === ".") {
            messages.push(dataBuffer);
            dataBuffer = "";
            dataMode = false;
            socket.write("250 2.0.0 queued as AUTH123\r\n");
          } else {
            dataBuffer += `${line}\r\n`;
          }
          lineEnd = buffer.indexOf("\r\n");
          continue;
        }

        commands.push(line);
        if (line.startsWith("EHLO")) {
          socket.write("250-auth-smtp.local\r\n250 AUTH PLAIN\r\n");
        } else if (line === `AUTH PLAIN ${expectedAuth}`) {
          authenticated = true;
          socket.write("235 2.7.0 authentication successful\r\n");
        } else if (line.startsWith("AUTH PLAIN ")) {
          socket.write("535 5.7.8 authentication failed\r\n");
        } else if (line.startsWith("MAIL FROM:") && !authenticated) {
          socket.write("530 5.7.0 authentication required\r\n");
        } else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) {
          socket.write("250 OK\r\n");
        } else if (line === "DATA") {
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
          dataMode = true;
        } else if (line === "QUIT") {
          socket.write("221 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 OK\r\n");
        }

        lineEnd = buffer.indexOf("\r\n");
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("auth_smtp_port_unavailable"));
        return;
      }
      resolve({
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => error ? closeReject(error) : closeResolve());
        }),
        commands,
        messages,
        port: address.port
      });
    });
  });
}

function startTlsSmtpServer(): Promise<{
  close(): Promise<void>;
  commands: string[];
  messages: string[];
  port: number;
  secureConnections: number;
}> {
  const commands: string[] = [];
  const messages: string[] = [];
  let secureConnections = 0;
  const server = createTlsServer({
    passphrase: "smtp-test",
    pfx: Buffer.from(SMTP_TLS_TEST_PFX_BASE64.replace(/\s/g, ""), "base64")
  }, (socket) => {
    secureConnections += 1;
    let buffer = "";
    let dataBuffer = "";
    let dataMode = false;

    socket.setEncoding("utf8");
    socket.write("220 tls-smtp.local ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk;
      let lineEnd = buffer.indexOf("\r\n");
      while (lineEnd >= 0) {
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);

        if (dataMode) {
          if (line === ".") {
            messages.push(dataBuffer);
            dataBuffer = "";
            dataMode = false;
            socket.write("250 2.0.0 queued as TLS123\r\n");
          } else {
            dataBuffer += `${line}\r\n`;
          }
          lineEnd = buffer.indexOf("\r\n");
          continue;
        }

        commands.push(line);
        if (line.startsWith("EHLO")) {
          socket.write("250-tls-smtp.local\r\n250 OK\r\n");
        } else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:")) {
          socket.write("250 OK\r\n");
        } else if (line === "DATA") {
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
          dataMode = true;
        } else if (line === "QUIT") {
          socket.write("221 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 OK\r\n");
        }

        lineEnd = buffer.indexOf("\r\n");
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("tls_smtp_port_unavailable"));
        return;
      }
      resolve({
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => error ? closeReject(error) : closeResolve());
        }),
        commands,
        messages,
        port: address.port,
        get secureConnections() {
          return secureConnections;
        }
      });
    });
  });
}

function startClosingSmtpServer(): Promise<{
  close(): Promise<void>;
  port: number;
}> {
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
    });
    socket.write("220 fake-smtp.local ESMTP\r\n");
    setTimeout(() => {
      socket.end();
    }, 10);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("fake_smtp_port_unavailable"));
        return;
      }
      resolve({
        close: () => new Promise((closeResolve, closeReject) => {
          for (const socket of sockets) {
            socket.destroy();
          }
          server.close((error) => error ? closeReject(error) : closeResolve());
        }),
        port: address.port
      });
    });
  });
}

const SMTP_TLS_TEST_PFX_BASE64 = "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";
