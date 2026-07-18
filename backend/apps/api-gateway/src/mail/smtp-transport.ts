import { connect, isIP, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";

// Общий SMTP-транспорт служебной почты. Обобщение самописного клиента из
// identity/mfa-otp-delivery.ts: добавлены STARTTLS (без него реальные сервера
// на 587 порту недоступны), Reply-To и RFC 2047-кодирование не-ASCII заголовков.
// Никакого nodemailer — по конвенции репозитория весь SMTP руками поверх
// node:net / node:tls.

export type SmtpEncryption = "none" | "ssl" | "starttls";

export interface SmtpTransportConfig {
  auth?: { password: string; username: string };
  encryption: SmtpEncryption;
  from: string;
  fromName?: string | null;
  host: string;
  port: number;
  replyTo?: string | null;
  timeoutMs: number;
  tlsRejectUnauthorized: boolean;
}

const MAX_SMTP_RESPONSE_LINE_BYTES = 8_192;

/**
 * Все коды ошибок транспорта. Диагностика различает сетевой уровень (DNS,
 * закрытый порт, TLS-сертификат) и SMTP-уровень (логин, отправитель,
 * получатель) — по коду админ должен понять, какое поле настроек чинить.
 */
export const SMTP_TRANSPORT_ERROR_CODES = [
  "smtp_timeout",
  "smtp_connection_closed",
  "smtp_unexpected_response",
  "smtp_response_too_large",
  "smtp_host_not_found",
  "smtp_connection_refused",
  "smtp_network_unreachable",
  "smtp_tls_certificate_invalid",
  "smtp_tls_failed",
  "smtp_auth_failed",
  "smtp_sender_rejected",
  "smtp_recipient_rejected",
  "smtp_unavailable"
] as const;

const KNOWN_TRANSPORT_CODES = new Set<string>(SMTP_TRANSPORT_ERROR_CODES);
const TLS_CERTIFICATE_ERROR_CODES = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_SIGNATURE_FAILURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "HOSTNAME_MISMATCH"
]);

interface SmtpLineReader {
  detach(): void;
  readLine(): Promise<string>;
  rejectPending(error: unknown): void;
}

/**
 * Отправляет уже собранное MIME-сообщение. Возвращает queued-id провайдера
 * (пустая строка, если сервер его не сообщил). Ошибки — Error с кодом в
 * message (smtp_timeout, smtp_connection_closed, smtp_unexpected_response).
 */
export function sendSmtpMail(config: SmtpTransportConfig, mail: { message: string; to: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let activeSocket: Socket | null = null;
    let activeReader: SmtpLineReader | null = null;

    const finish = (error?: unknown, queuedId = "") => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        activeReader?.rejectPending(error);
        activeSocket?.destroy();
        reject(normalizeTransportError(error));
        return;
      }
      activeSocket?.end();
      resolve(queuedId);
    };

    const timeout = setTimeout(() => {
      finish(new Error("smtp_timeout"));
    }, config.timeoutMs);

    const attachLifecycle = (socket: Socket) => {
      socket.once("error", finish);
      socket.once("end", () => finish(new Error("smtp_connection_closed")));
      socket.once("close", () => finish(new Error("smtp_connection_closed")));
    };

    const servername = isIP(config.host) ? undefined : config.host;

    const run = async (socket: Socket, upgraded: boolean) => {
      activeSocket = socket;
      const reader = createSmtpLineReader(socket);
      activeReader = reader;
      try {
        if (!upgraded) {
          await expectSmtpCode(reader.readLine, 220);
        }
        await writeSmtpCommand(socket, reader.readLine, "EHLO support-communication.local", 250);
        if (!upgraded && config.encryption === "starttls") {
          await writeSmtpCommand(socket, reader.readLine, "STARTTLS", 220);
          // Дальше поток принадлежит TLS-обвязке: снимаем свой data-листенер,
          // чтобы не читать байты рукопожатия как SMTP-строки.
          reader.detach();
          const tlsSocket = connectTls({
            rejectUnauthorized: config.tlsRejectUnauthorized,
            servername,
            socket
          });
          attachLifecycle(tlsSocket);
          tlsSocket.once("secureConnect", () => {
            void run(tlsSocket, true);
          });
          return;
        }
        if (config.auth) {
          await writeSmtpCommand(socket, reader.readLine, `AUTH PLAIN ${encodeSmtpPlainAuth(config.auth)}`, 235)
            .catch((error) => { throw refineStepError(error, "smtp_auth_failed"); });
        }
        await writeSmtpCommand(socket, reader.readLine, `MAIL FROM:<${config.from}>`, 250)
          .catch((error) => { throw refineStepError(error, "smtp_sender_rejected"); });
        await writeSmtpCommand(socket, reader.readLine, `RCPT TO:<${mail.to}>`, 250)
          .catch((error) => { throw refineStepError(error, "smtp_recipient_rejected"); });
        await writeSmtpCommand(socket, reader.readLine, "DATA", 354);
        const response = await writeSmtpCommand(socket, reader.readLine, `${dotStuff(mail.message)}\r\n.`, 250);
        await writeSmtpCommand(socket, reader.readLine, "QUIT", 221);
        finish(undefined, parseSmtpQueuedId(response));
      } catch (error) {
        finish(error);
      }
    };

    const socket = config.encryption === "ssl"
      ? connectTls({
        host: config.host,
        port: config.port,
        rejectUnauthorized: config.tlsRejectUnauthorized,
        servername
      })
      : connect(config.port, config.host);
    attachLifecycle(socket);
    const readyEvent = config.encryption === "ssl" ? "secureConnect" : "connect";
    socket.once(readyEvent, () => {
      void run(socket, false);
    });
  });
}

/** Собирает plain-text MIME-письмо; не-ASCII заголовки кодируются по RFC 2047. */
export function composeMailMessage(
  config: Pick<SmtpTransportConfig, "from" | "fromName" | "replyTo">,
  mail: { bodyLines: string[]; subject: string; to: string }
): string {
  const fromName = String(config.fromName ?? "").trim();
  const fromHeader = fromName ? `${encodeMailHeaderText(fromName)} <${config.from}>` : config.from;
  const replyTo = String(config.replyTo ?? "").trim();
  const lines = [
    `From: ${sanitizeMailHeader(fromHeader)}`,
    `To: ${sanitizeMailHeader(mail.to)}`,
    ...(replyTo ? [`Reply-To: ${sanitizeMailHeader(replyTo)}`] : []),
    `Subject: ${encodeMailHeaderText(mail.subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "MIME-Version: 1.0",
    "",
    ...mail.bodyLines
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function encodeMailHeaderText(value: string): string {
  const sanitized = sanitizeMailHeader(value);
  if (/^[\x20-\x7e]*$/.test(sanitized)) {
    return sanitized;
  }
  return `=?UTF-8?B?${Buffer.from(sanitized, "utf8").toString("base64")}?=`;
}

export function sanitizeMailHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

export function smtpMailAddress(value: string, errorCode: string): string {
  const normalized = String(value ?? "").trim();
  if (
    normalized.length > 254
    || /[\r\n]/.test(normalized)
    || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(normalized)
  ) {
    throw new Error(errorCode);
  }
  return normalized;
}

export function smtpMailHost(value: string, errorCode: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > 253 || !/^[A-Za-z0-9:.-]+$/.test(normalized)) {
    throw new Error(errorCode);
  }
  return normalized;
}

function createSmtpLineReader(socket: Socket): SmtpLineReader {
  const lines: string[] = [];
  const waiters: Array<{ reject(error: unknown): void; resolve(line: string): void }> = [];
  let buffer = "";
  let terminalError: unknown = null;

  const rejectPending = (error: unknown) => {
    terminalError = error;
    while (waiters.length > 0) {
      waiters.shift()?.reject(error);
    }
  };

  // Кодировку на сокете не выставляем: при STARTTLS этот же сокет продолжает
  // жить под TLS-обвязкой, которой нужны сырые байты.
  const onData = (chunk: Buffer | string) => {
    if (terminalError) {
      return;
    }
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (Buffer.byteLength(buffer, "utf8") > MAX_SMTP_RESPONSE_LINE_BYTES) {
      rejectPending(new Error("smtp_response_too_large"));
      return;
    }

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
  };

  socket.on("data", onData);

  return {
    detach: () => {
      socket.off("data", onData);
    },
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
    rejectPending
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
        throw new Error("smtp_unexpected_response");
      }
      return lines.join("\n");
    }
  }
}

// NUL-разделители AUTH PLAIN (RFC 4616): authzid пустой, затем NUL, логин, NUL, пароль.
const SMTP_AUTH_SEPARATOR = String.fromCharCode(0);

function encodeSmtpPlainAuth(auth: { password: string; username: string }): string {
  return Buffer.from(
    `${SMTP_AUTH_SEPARATOR}${auth.username}${SMTP_AUTH_SEPARATOR}${auth.password}`,
    "utf8"
  ).toString("base64");
}

function dotStuff(message: string): string {
  return message
    .replace(/\r?\n/g, "\r\n")
    .split("\r\n")
    .map((line) => line.startsWith(".") ? `.${line}` : line)
    .join("\r\n");
}

function parseSmtpQueuedId(response: string): string {
  const match = response.match(/\b(?:queued as|id)\s+([a-z0-9._-]{1,120})/i);
  return match?.[1] ?? "";
}

/**
 * Приводит сырые сокетные/TLS-ошибки к стабильным smtp_*-кодам. Текст исходной
 * ошибки наружу не выходит: он может содержать адреса и ответы сервера.
 */
function normalizeTransportError(error: unknown): Error {
  if (error instanceof Error) {
    if (KNOWN_TRANSPORT_CODES.has(error.message)) {
      return error;
    }
    const code = String((error as NodeJS.ErrnoException).code ?? "");
    if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
      return new Error("smtp_host_not_found");
    }
    if (code === "ECONNREFUSED") {
      return new Error("smtp_connection_refused");
    }
    if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH") {
      return new Error("smtp_network_unreachable");
    }
    if (code === "ECONNRESET" || code === "EPIPE") {
      return new Error("smtp_connection_closed");
    }
    if (TLS_CERTIFICATE_ERROR_CODES.has(code)) {
      return new Error("smtp_tls_certificate_invalid");
    }
    if (code.startsWith("ERR_SSL") || code.startsWith("ERR_TLS") || /\bssl|tls|handshake\b/i.test(error.message)) {
      return new Error("smtp_tls_failed");
    }
  }
  return new Error("smtp_unavailable");
}

/**
 * Уточняет smtp_unexpected_response до кода конкретного шага диалога
 * (AUTH/MAIL FROM/RCPT TO); сетевые ошибки проходят без изменений.
 */
function refineStepError(error: unknown, stepCode: string): unknown {
  if (error instanceof Error && error.message === "smtp_unexpected_response") {
    return new Error(stepCode);
  }
  return error;
}
