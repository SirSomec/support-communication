import { createHash } from "node:crypto";
import { connect, isIP, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import type {
  PublicDemoRequestNotificationDescriptor,
  PublicDemoRequestNotificationStatus
} from "./integration.repository.js";

export interface PublicDemoRequestNotificationProvider {
  disabled?: boolean;
  send(input: PublicDemoRequestNotificationProviderInput): Promise<PublicDemoRequestNotificationProviderResult>;
}

export interface PublicDemoRequestNotificationProviderInput {
  descriptor: PublicDemoRequestNotificationDescriptor;
  now: string;
}

export interface PublicDemoRequestNotificationProviderResult {
  providerMessageId: string;
}

export interface SmtpPublicDemoRequestNotificationProviderOptions {
  auth?: {
    password: string;
    username: string;
  };
  from: string;
  host: string;
  port: number;
  secure?: boolean;
  timeoutMs?: number;
  tlsRejectUnauthorized?: boolean;
  to: string;
}

export interface PublicDemoRequestNotificationWorkerRepository {
  listPublicDemoRequestNotificationDescriptorsAsync(filters: {
    limit?: number;
    queue: "lead-notification";
    status: PublicDemoRequestNotificationStatus;
  }): Promise<PublicDemoRequestNotificationDescriptor[]>;
  savePublicDemoRequestNotificationDescriptorAsync(
    descriptor: PublicDemoRequestNotificationDescriptor
  ): Promise<PublicDemoRequestNotificationDescriptor>;
}

export interface ExecutePublicDemoRequestNotificationWorkerInput {
  limit?: number;
  now?: string;
  provider: PublicDemoRequestNotificationProvider;
  repository: PublicDemoRequestNotificationWorkerRepository;
}

export interface ExecutePublicDemoRequestNotificationWorkerResult {
  delivered: number;
  failed: number;
  scanned: number;
}

export async function executePublicDemoRequestNotificationWorker(
  input: ExecutePublicDemoRequestNotificationWorkerInput
): Promise<ExecutePublicDemoRequestNotificationWorkerResult> {
  const result: ExecutePublicDemoRequestNotificationWorkerResult = {
    delivered: 0,
    failed: 0,
    scanned: 0
  };
  if (input.provider.disabled) {
    return result;
  }

  const now = input.now ?? new Date().toISOString();
  const descriptors = await input.repository.listPublicDemoRequestNotificationDescriptorsAsync({
    limit: input.limit ?? 50,
    queue: "lead-notification",
    status: "queued"
  });

  for (const descriptor of descriptors) {
    result.scanned += 1;
    const attempts = (descriptor.payload.delivery?.attempts ?? 0) + 1;

    try {
      const delivery = await input.provider.send({ descriptor, now });
      await input.repository.savePublicDemoRequestNotificationDescriptorAsync({
        ...descriptor,
        payload: {
          ...descriptor.payload,
          delivery: {
            attempts,
            deliveredAt: now,
            providerMessageId: delivery.providerMessageId
          }
        },
        status: "delivered"
      });
      result.delivered += 1;
    } catch (error) {
      await input.repository.savePublicDemoRequestNotificationDescriptorAsync({
        ...descriptor,
        payload: {
          ...descriptor.payload,
          delivery: {
            attempts,
            failedAt: now,
            lastError: {
              code: "public_demo_request_notification_delivery_failed",
              message: error instanceof Error ? error.message : String(error)
            }
          }
        },
        status: "failed"
      });
      result.failed += 1;
    }
  }

  return result;
}

export function createDeterministicPublicDemoRequestNotificationProvider(): PublicDemoRequestNotificationProvider {
  return {
    async send({ descriptor }) {
      const fingerprint = createHash("sha1")
        .update(`${descriptor.id}:${descriptor.leadId}:${descriptor.payload.email}`)
        .digest("hex")
        .slice(0, 16);
      return {
        providerMessageId: `local-lead-notification-${fingerprint}`
      };
    }
  };
}

export function createSmtpPublicDemoRequestNotificationProvider(
  options: SmtpPublicDemoRequestNotificationProviderOptions
): PublicDemoRequestNotificationProvider {
  return {
    async send({ descriptor, now }) {
      const message = buildPublicDemoRequestEmail({
        descriptor,
        from: options.from,
        now,
        to: options.to
      });
      const queuedId = await sendSmtpMessage({
        auth: options.auth,
        from: options.from,
        host: options.host,
        message,
        port: options.port,
        secure: options.secure ?? false,
        timeoutMs: options.timeoutMs ?? 10_000,
        tlsRejectUnauthorized: options.tlsRejectUnauthorized ?? true,
        to: options.to
      });

      return {
        providerMessageId: `smtp-${queuedId || hashSmtpMessage(descriptor.id, now)}`
      };
    }
  };
}

export function createDisabledPublicDemoRequestNotificationProvider(reason: string): PublicDemoRequestNotificationProvider {
  return {
    disabled: true,
    async send() {
      throw new Error(reason);
    }
  };
}

function buildPublicDemoRequestEmail(input: {
  descriptor: PublicDemoRequestNotificationDescriptor;
  from: string;
  now: string;
  to: string;
}): string {
  const payload = input.descriptor.payload;
  const company = emailText(payload.company, "Unknown company");
  const name = emailText(payload.name, "Unknown requester");
  const email = emailText(payload.email, "unknown@example.invalid");
  const planInterest = emailText(payload.planInterest, "not specified");
  const source = emailText(payload.source, "unknown");
  const messagePreview = emailText(payload.messagePreview, "");
  const subject = `New public demo request from ${company}`;
  const lines = [
    `From: ${sanitizeAddress(input.from)}`,
    `To: ${sanitizeAddress(input.to)}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "",
    `Lead id: ${input.descriptor.leadId}`,
    `Created notification: ${input.descriptor.id}`,
    `Sent at: ${input.now}`,
    `Name: ${name}`,
    `Company: ${company}`,
    `Email: ${email}`,
    `Plan interest: ${planInterest}`,
    `Source: ${source}`,
    "",
    "Message:",
    messagePreview || "(empty)"
  ];

  return `${lines.join("\r\n")}\r\n`;
}

function sendSmtpMessage(input: {
  auth?: {
    password: string;
    username: string;
  };
  from: string;
  host: string;
  message: string;
  port: number;
  secure: boolean;
  timeoutMs: number;
  tlsRejectUnauthorized: boolean;
  to: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = input.secure
      ? connectTls({
        host: input.host,
        port: input.port,
        rejectUnauthorized: input.tlsRejectUnauthorized,
        servername: isIP(input.host) ? undefined : input.host
      })
      : connect(input.port, input.host);
    const reader = createSmtpLineReader(socket);
    let settled = false;
    const readyEvent = input.secure ? "secureConnect" : "connect";
    const timeout = setTimeout(() => {
      finish(new Error("smtp_delivery_timeout"));
      socket.destroy();
    }, input.timeoutMs);

    const finish = (error?: unknown, queuedId = "") => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reader.rejectPending(error);
        socket.destroy();
        reject(error);
      } else {
        socket.end();
        resolve(queuedId);
      }
    };

    socket.once("error", finish);
    socket.once("end", () => {
      finish(new Error("smtp_connection_closed"));
    });
    socket.once("close", () => {
      finish(new Error("smtp_connection_closed"));
    });
    socket.once(readyEvent, () => {
      void (async () => {
        try {
          await expectSmtpCode(reader.readLine, 220);
          await writeSmtpCommand(socket, reader.readLine, "EHLO support-communication.local", 250);
          if (input.auth) {
            await writeSmtpCommand(socket, reader.readLine, `AUTH PLAIN ${encodeSmtpPlainAuth(input.auth)}`, 235);
          }
          await writeSmtpCommand(socket, reader.readLine, `MAIL FROM:<${smtpAddress(input.from)}>`, 250);
          await writeSmtpCommand(socket, reader.readLine, `RCPT TO:<${smtpAddress(input.to)}>`, 250);
          await writeSmtpCommand(socket, reader.readLine, "DATA", 354);
          const dataResponse = await writeSmtpCommand(socket, reader.readLine, `${dotStuff(input.message)}\r\n.`, 250);
          await writeSmtpCommand(socket, reader.readLine, "QUIT", 221);
          finish(undefined, parseSmtpQueuedId(dataResponse));
        } catch (error) {
          finish(error);
        }
      })();
    });
  });
}

function createSmtpLineReader(socket: Socket): {
  readLine(): Promise<string>;
  rejectPending(error: unknown): void;
} {
  const lines: string[] = [];
  const waiters: Array<{ reject(error: unknown): void; resolve(line: string): void }> = [];
  let buffer = "";
  let terminalError: unknown = null;

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let lineEnd = buffer.indexOf("\r\n");
    while (lineEnd >= 0) {
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve(line);
      } else {
        lines.push(line);
      }
      lineEnd = buffer.indexOf("\r\n");
    }
  });

  return {
    readLine: () => new Promise((resolve, reject) => {
      if (terminalError) {
        reject(terminalError);
        return;
      }
      const line = lines.shift();
      if (line !== undefined) {
        resolve(line);
        return;
      }
      waiters.push({ reject, resolve });
    }),
    rejectPending(error: unknown) {
      terminalError = error;
      while (waiters.length > 0) {
        waiters.shift()?.reject(error);
      }
    }
  };
}

async function writeSmtpCommand(
  socket: Socket,
  readLine: () => Promise<string>,
  command: string,
  expectedCode: number
): Promise<string> {
  socket.write(`${command}\r\n`);
  return expectSmtpCode(readLine, expectedCode);
}

async function expectSmtpCode(readLine: () => Promise<string>, expectedCode: number): Promise<string> {
  const lines: string[] = [];

  while (true) {
    const line = await readLine();
    lines.push(line);
    const code = Number(line.slice(0, 3));
    if (line[3] !== "-") {
      if (code !== expectedCode) {
        throw new Error(`smtp_unexpected_response:${line}`);
      }
      return lines.join("\n");
    }
  }
}

function parseSmtpQueuedId(response: string): string {
  const match = response.match(/\b(?:queued as|id)\s+([a-z0-9._-]+)/i);
  return match ? match[1] : "";
}

function encodeSmtpPlainAuth(input: { password: string; username: string }): string {
  return Buffer.from(`\u0000${input.username}\u0000${input.password}`, "utf8").toString("base64");
}

function dotStuff(message: string): string {
  return message
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => line.startsWith(".") ? `.${line}` : line)
    .join("\r\n");
}

function hashSmtpMessage(descriptorId: string, now: string): string {
  return createHash("sha1").update(`${descriptorId}:${now}`).digest("hex").slice(0, 16);
}

function emailText(value: unknown, fallback: string): string {
  const normalized = String(value ?? "").replace(/\r|\n/g, " ").trim();
  return normalized || fallback;
}

function sanitizeHeader(value: string): string {
  return value.replace(/\r|\n/g, " ").trim();
}

function sanitizeAddress(value: string): string {
  return smtpAddress(value);
}

function smtpAddress(value: string): string {
  const normalized = value.replace(/\r|\n/g, "").trim();
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(normalized)) {
    throw new Error("smtp_address_invalid");
  }
  return normalized;
}
