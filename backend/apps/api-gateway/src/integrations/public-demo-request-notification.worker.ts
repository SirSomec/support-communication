import { createHash } from "node:crypto";
import { connect, isIP, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import type {
  PublicDemoRequestNotificationDescriptor,
  PublicDemoRequestNotificationStatus
} from "./integration.repository.js";

const PUBLIC_DEMO_EMAIL_BOUNDARY = "----=_SupportCommunication_PublicDemo_09d5b3e1";

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
  to: string | string[];
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
      const recipients = smtpRecipients(options.to);
      const message = buildPublicDemoRequestEmail({
        descriptor,
        from: options.from,
        now,
        to: recipients
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
        to: recipients
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
  to: string[];
}): string {
  const payload = input.descriptor.payload;
  const company = emailText(payload.company, "Unknown company");
  const name = emailText(payload.name, "Unknown requester");
  const email = emailText(payload.email, "unknown@example.invalid");
  const planInterest = emailText(payload.planInterest, "not specified");
  const source = emailText(payload.source, "unknown");
  const messagePreview = emailText(payload.messagePreview, "");
  const subject = `Новая заявка на демонстрацию: ${company}`;
  const from = sanitizeAddress(input.from);
  const bodyLines = [
    "Новая заявка на демонстрацию сервиса.",
    "",
    `Компания: ${company}`,
    `Контакт: ${name}`,
    `Email: ${email}`,
    `Интересующий тариф: ${planInterest}`,
    `Источник: ${source}`,
    "",
    "Сообщение:",
    messagePreview || "(не указано)",
    "",
    `Идентификатор заявки: ${input.descriptor.leadId}`,
    `Время отправки: ${input.now}`
  ];
  const lines = [
    `From: ${from}`,
    `To: ${input.to.map(sanitizeAddress).join(", ")}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    `Date: ${smtpMessageDate(input.now)}`,
    `Message-ID: ${smtpMessageId(input.descriptor.id, from)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${PUBLIC_DEMO_EMAIL_BOUNDARY}\"`,
    "",
    `--${PUBLIC_DEMO_EMAIL_BOUNDARY}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    ...bodyLines,
    "",
    `--${PUBLIC_DEMO_EMAIL_BOUNDARY}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    buildPublicDemoRequestEmailHtml({ company, email, leadId: input.descriptor.leadId, messagePreview, name, planInterest, source, sentAt: input.now }),
    "",
    `--${PUBLIC_DEMO_EMAIL_BOUNDARY}--`
  ];

  return `${lines.join("\r\n")}\r\n`;
}

function buildPublicDemoRequestEmailHtml(input: {
  company: string;
  email: string;
  leadId: string;
  messagePreview: string;
  name: string;
  planInterest: string;
  sentAt: string;
  source: string;
}): string {
  const rows = [
    ["Компания", input.company],
    ["Контакт", input.name],
    ["Email", input.email],
    ["Интересующий тариф", input.planInterest],
    ["Источник", input.source]
  ].map(([label, value]) => `<tr><td style=\"padding:10px 0;border-bottom:1px solid #e5eaf2;font-size:14px;line-height:20px;color:#66738a;\">${escapeHtml(label)}</td><td align=\"right\" style=\"padding:10px 0 10px 16px;border-bottom:1px solid #e5eaf2;font-size:14px;line-height:20px;font-weight:600;color:#172033;\">${escapeHtml(value)}</td></tr>`).join("");
  const message = escapeHtml(input.messagePreview || "Не указано").replace(/\r?\n/g, "<br>");

  return [
    "<!doctype html>",
    "<html lang=\"ru\">",
    "<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"></head>",
    "<body style=\"margin:0;padding:0;background-color:#f4f7fb;color:#172033;font-family:Arial,Helvetica,sans-serif;\">",
    "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;background-color:#f4f7fb;\"><tr><td align=\"center\" style=\"padding:32px 16px;\">",
    "<table role=\"presentation\" width=\"600\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;max-width:600px;background-color:#ffffff;border-radius:16px;\"><tr><td style=\"padding:40px 32px;\">",
    "<p style=\"margin:0 0 12px;font-size:14px;line-height:20px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#52627d;\">Новая заявка</p>",
    "<h1 style=\"margin:0 0 24px;font-size:28px;line-height:34px;font-weight:700;color:#172033;\">Заявка на демонстрацию</h1>",
    `<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" border=\"0\" style=\"width:100%;\">${rows}</table>`,
    "<p style=\"margin:28px 0 8px;font-size:14px;line-height:20px;font-weight:700;color:#172033;\">Сообщение</p>",
    `<p style=\"margin:0;padding:16px;background-color:#f7f9fc;border-radius:10px;font-size:16px;line-height:24px;color:#46536b;\">${message}</p>`,
    `<p style=\"margin:24px 0 0;font-size:12px;line-height:18px;color:#7b879b;\">Идентификатор заявки: ${escapeHtml(input.leadId)}<br>Время отправки: ${escapeHtml(input.sentAt)}</p>`,
    "</td></tr></table>",
    "</td></tr></table>",
    "</body></html>"
  ].join("");
}

function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(sanitizeHeader(value), "utf8").toString("base64")}?=`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character] ?? character);
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
  to: string[];
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
          for (const recipient of input.to) {
            await writeSmtpCommand(socket, reader.readLine, `RCPT TO:<${smtpAddress(recipient)}>`, 250);
          }
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

function smtpMessageId(descriptorId: string, from: string): string {
  const domain = from.slice(from.lastIndexOf("@") + 1);
  const token = createHash("sha256").update(descriptorId).digest("hex").slice(0, 32);
  return `<lead-notification-${token}@${domain}>`;
}

function smtpMessageDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
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

function smtpRecipients(value: string | string[]): string[] {
  const candidates = (Array.isArray(value) ? value : [value])
    .flatMap((item) => item.split(/[;,]/));
  const recipients: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const recipient = smtpAddress(candidate);
    const key = recipient.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      recipients.push(recipient);
    }
  }

  if (recipients.length === 0) {
    throw new Error("smtp_recipient_required");
  }

  return recipients;
}
