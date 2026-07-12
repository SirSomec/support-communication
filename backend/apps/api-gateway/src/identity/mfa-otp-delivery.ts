import { createHash } from "node:crypto";
import { connect, isIP, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";

export interface MfaOtpDeliveryPort {
  send(input: {
    challengeId: string;
    email: string;
    expiresAt: string;
    otp: string;
  }): Promise<{ providerMessageId: string }>;
  sendRecovery?(input: {
    email: string;
    expiresAt: string;
    recoveryToken: string;
    requestId: string;
  }): Promise<{ providerMessageId: string }>;
}

interface SmtpConfig {
  auth?: {
    password: string;
    username: string;
  };
  from: string;
  host: string;
  port: number;
  secure: boolean;
  timeoutMs: number;
  tlsRejectUnauthorized: boolean;
}

interface NormalizedDeliveryInput {
  challengeId: string;
  email: string;
  expiresAt: string;
  otp: string;
}

interface NormalizedRecoveryDeliveryInput {
  email: string;
  expiresAt: string;
  recoveryToken: string;
  requestId: string;
}

const DEFAULT_SMTP_PORT = 1025;
const DEFAULT_SMTP_TIMEOUT_MS = 10_000;
const MAX_SMTP_TIMEOUT_MS = 120_000;
const MAX_SMTP_RESPONSE_LINE_BYTES = 8_192;

export function createMfaOtpDeliveryFromEnv(
  source: NodeJS.ProcessEnv = process.env
): MfaOtpDeliveryPort {
  const nodeEnv = normalizeNodeEnv(source.NODE_ENV);
  const configuredMode = optionalString(source.MFA_OTP_DELIVERY_MODE).toLowerCase();

  if ((nodeEnv === "staging" || nodeEnv === "production") && configuredMode !== "smtp") {
    throw new Error("mfa_otp_delivery_mode_smtp_required");
  }

  const mode = configuredMode || defaultDeliveryMode(nodeEnv, source);
  if (mode === "smtp") {
    return createSmtpDelivery(loadSmtpConfig(source));
  }

  if ((nodeEnv === "test" || nodeEnv === "development") && isDeterministicMode(mode)) {
    return createDeterministicDelivery();
  }

  throw new Error("mfa_otp_delivery_mode_invalid");
}

function createDeterministicDelivery(): MfaOtpDeliveryPort {
  return {
    async send(input) {
      const normalized = normalizeDeliveryInput(input);
      const fingerprint = createHash("sha256")
        .update(`${normalized.challengeId}:${normalized.email}:${normalized.expiresAt}`)
        .digest("hex")
        .slice(0, 20);

      return { providerMessageId: `test-mfa-otp-${fingerprint}` };
    },
    async sendRecovery(input) {
      const normalized = normalizeRecoveryDeliveryInput(input);
      const fingerprint = createHash("sha256")
        .update(`${normalized.requestId}:${normalized.email}:${normalized.expiresAt}`)
        .digest("hex")
        .slice(0, 20);

      return { providerMessageId: `test-password-recovery-${fingerprint}` };
    }
  };
}

function createSmtpDelivery(config: SmtpConfig): MfaOtpDeliveryPort {
  return {
    async send(input) {
      const normalized = normalizeDeliveryInput(input);
      const message = buildOtpEmail(config.from, normalized);

      try {
        const queuedId = await sendSmtpMessage({
          ...config,
          message,
          to: normalized.email
        });
        const fallbackId = createHash("sha256")
          .update(`${normalized.challengeId}:${normalized.email}:${normalized.expiresAt}`)
          .digest("hex")
          .slice(0, 20);

        return { providerMessageId: `smtp-${queuedId || fallbackId}` };
      } catch {
        // Provider responses are deliberately hidden because they can reflect message content.
        throw new Error("mfa_otp_smtp_delivery_failed");
      }
    },
    async sendRecovery(input) {
      const normalized = normalizeRecoveryDeliveryInput(input);
      const message = buildRecoveryEmail(config.from, normalized);

      try {
        const queuedId = await sendSmtpMessage({
          ...config,
          message,
          to: normalized.email
        });
        const fallbackId = createHash("sha256")
          .update(`${normalized.requestId}:${normalized.email}:${normalized.expiresAt}`)
          .digest("hex")
          .slice(0, 20);

        return { providerMessageId: `smtp-${queuedId || fallbackId}` };
      } catch {
        throw new Error("password_recovery_smtp_delivery_failed");
      }
    }
  };
}

function loadSmtpConfig(source: NodeJS.ProcessEnv): SmtpConfig {
  const from = smtpAddress(requiredString(
    envValue(source, "MFA_OTP_SMTP_FROM", "MAIL_FROM"),
    "mfa_otp_smtp_from_required"
  ), "mfa_otp_smtp_from_invalid");
  const host = smtpHost(requiredString(
    envValue(source, "MFA_OTP_SMTP_HOST", "MAIL_HOST"),
    "mfa_otp_smtp_host_required"
  ));
  const username = optionalString(envValue(source, "MFA_OTP_SMTP_USERNAME", "MAIL_USERNAME"));
  const password = optionalString(envValue(source, "MFA_OTP_SMTP_PASSWORD", "MAIL_PASSWORD"));

  if (Boolean(username) !== Boolean(password)) {
    throw new Error("mfa_otp_smtp_auth_incomplete");
  }

  return {
    auth: username && password ? { password, username } : undefined,
    from,
    host,
    port: positiveInteger(
      envValue(source, "MFA_OTP_SMTP_PORT", "MAIL_PORT"),
      DEFAULT_SMTP_PORT,
      65_535,
      "mfa_otp_smtp_port_invalid"
    ),
    secure: booleanFlag(
      envValue(source, "MFA_OTP_SMTP_SECURE", "MAIL_SECURE"),
      false,
      "mfa_otp_smtp_secure_invalid"
    ),
    timeoutMs: positiveInteger(
      envValue(source, "MFA_OTP_SMTP_TIMEOUT_MS", "MAIL_TIMEOUT_MS"),
      DEFAULT_SMTP_TIMEOUT_MS,
      MAX_SMTP_TIMEOUT_MS,
      "mfa_otp_smtp_timeout_invalid"
    ),
    tlsRejectUnauthorized: booleanFlag(
      envValue(source, "MFA_OTP_SMTP_TLS_REJECT_UNAUTHORIZED", "MAIL_TLS_REJECT_UNAUTHORIZED"),
      true,
      "mfa_otp_smtp_tls_reject_unauthorized_invalid"
    )
  };
}

function normalizeDeliveryInput(input: {
  challengeId: string;
  email: string;
  expiresAt: string;
  otp: string;
}): NormalizedDeliveryInput {
  const challengeId = String(input.challengeId ?? "").trim();
  const otp = String(input.otp ?? "").trim();
  const expiresAtMs = Date.parse(String(input.expiresAt ?? ""));

  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(challengeId)) {
    throw new Error("mfa_otp_delivery_input_invalid");
  }
  if (!/^\d{4,10}$/.test(otp)) {
    throw new Error("mfa_otp_delivery_input_invalid");
  }
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error("mfa_otp_delivery_input_invalid");
  }

  return {
    challengeId,
    email: smtpAddress(String(input.email ?? ""), "mfa_otp_delivery_input_invalid"),
    expiresAt: new Date(expiresAtMs).toISOString(),
    otp
  };
}

function normalizeRecoveryDeliveryInput(input: {
  email: string;
  expiresAt: string;
  recoveryToken: string;
  requestId: string;
}): NormalizedRecoveryDeliveryInput {
  const requestId = String(input.requestId ?? "").trim();
  const recoveryToken = String(input.recoveryToken ?? "").trim();
  const expiresAtMs = Date.parse(String(input.expiresAt ?? ""));

  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(requestId)) {
    throw new Error("password_recovery_delivery_input_invalid");
  }
  if (!/^[A-Za-z0-9._~-]{16,512}$/.test(recoveryToken)) {
    throw new Error("password_recovery_delivery_input_invalid");
  }
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error("password_recovery_delivery_input_invalid");
  }

  return {
    email: smtpAddress(String(input.email ?? ""), "password_recovery_delivery_input_invalid"),
    expiresAt: new Date(expiresAtMs).toISOString(),
    recoveryToken,
    requestId
  };
}

function buildOtpEmail(from: string, input: NormalizedDeliveryInput): string {
  const lines = [
    `From: ${sanitizeHeader(from)}`,
    `To: ${sanitizeHeader(input.email)}`,
    "Subject: Your MFA verification code",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "MIME-Version: 1.0",
    "",
    `Your MFA verification code is: ${input.otp}`,
    `This code expires at: ${input.expiresAt}`,
    `Request reference: ${input.challengeId}`,
    "",
    "If you did not request this code, ignore this email."
  ];

  return `${lines.join("\r\n")}\r\n`;
}

function buildRecoveryEmail(from: string, input: NormalizedRecoveryDeliveryInput): string {
  const lines = [
    `From: ${sanitizeHeader(from)}`,
    `To: ${sanitizeHeader(input.email)}`,
    "Subject: Password recovery request",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "MIME-Version: 1.0",
    "",
    "Use this one-time token to reset your password:",
    input.recoveryToken,
    `This token expires at: ${input.expiresAt}`,
    `Request reference: ${input.requestId}`,
    "",
    "If you did not request a password reset, ignore this email."
  ];

  return `${lines.join("\r\n")}\r\n`;
}

function sendSmtpMessage(input: SmtpConfig & { message: string; to: string }): Promise<string> {
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
    const readyEvent = input.secure ? "secureConnect" : "connect";
    let settled = false;

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
        return;
      }
      socket.end();
      resolve(queuedId);
    };

    const timeout = setTimeout(() => {
      finish(new Error("smtp_timeout"));
    }, input.timeoutMs);

    socket.once("error", finish);
    socket.once("end", () => finish(new Error("smtp_connection_closed")));
    socket.once("close", () => finish(new Error("smtp_connection_closed")));
    socket.once(readyEvent, () => {
      void (async () => {
        try {
          await expectSmtpCode(reader.readLine, 220);
          await writeSmtpCommand(socket, reader.readLine, "EHLO support-communication.local", 250);
          if (input.auth) {
            await writeSmtpCommand(
              socket,
              reader.readLine,
              `AUTH PLAIN ${encodeSmtpPlainAuth(input.auth)}`,
              235
            );
          }
          await writeSmtpCommand(socket, reader.readLine, `MAIL FROM:<${input.from}>`, 250);
          await writeSmtpCommand(socket, reader.readLine, `RCPT TO:<${input.to}>`, 250);
          await writeSmtpCommand(socket, reader.readLine, "DATA", 354);
          const response = await writeSmtpCommand(
            socket,
            reader.readLine,
            `${dotStuff(input.message)}\r\n.`,
            250
          );
          await writeSmtpCommand(socket, reader.readLine, "QUIT", 221);
          finish(undefined, parseSmtpQueuedId(response));
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

  const rejectPending = (error: unknown) => {
    terminalError = error;
    while (waiters.length > 0) {
      waiters.shift()?.reject(error);
    }
  };

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    if (terminalError) {
      return;
    }
    buffer += chunk;
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

function encodeSmtpPlainAuth(auth: { password: string; username: string }): string {
  return Buffer.from(`\u0000${auth.username}\u0000${auth.password}`, "utf8").toString("base64");
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

function smtpAddress(value: string, errorCode: string): string {
  const normalized = value.trim();
  if (
    normalized.length > 254
    || /[\r\n]/.test(normalized)
    || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(normalized)
  ) {
    throw new Error(errorCode);
  }
  return normalized;
}

function smtpHost(value: string): string {
  const normalized = value.trim();
  if (normalized.length > 253 || !/^[A-Za-z0-9:.-]+$/.test(normalized)) {
    throw new Error("mfa_otp_smtp_host_invalid");
  }
  return normalized;
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

function defaultDeliveryMode(nodeEnv: "development" | "production" | "staging" | "test", source: NodeJS.ProcessEnv): string {
  if (nodeEnv === "test") {
    return "deterministic";
  }
  if (nodeEnv === "development" && optionalString(envValue(source, "MFA_OTP_SMTP_HOST", "MAIL_HOST"))) {
    return "smtp";
  }
  return "deterministic";
}

function isDeterministicMode(mode: string): boolean {
  return mode === "deterministic" || mode === "noop" || mode === "no-op" || mode === "test";
}

function normalizeNodeEnv(value: string | undefined): "development" | "production" | "staging" | "test" {
  const normalized = optionalString(value || "development").toLowerCase();
  if (
    normalized === "development"
    || normalized === "test"
    || normalized === "staging"
    || normalized === "production"
  ) {
    return normalized;
  }
  throw new Error("mfa_otp_delivery_node_env_invalid");
}

function envValue(source: NodeJS.ProcessEnv, primary: string, fallback: string): string | undefined {
  return source[primary] ?? source[fallback];
}

function optionalString(value: string | undefined): string {
  return String(value ?? "").trim();
}

function requiredString(value: string | undefined, errorCode: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new Error(errorCode);
  }
  return normalized;
}

function positiveInteger(value: string | undefined, fallback: number, maximum: number, errorCode: string): number {
  if (value === undefined || !value.trim()) {
    return fallback;
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0 || normalized > maximum) {
    throw new Error(errorCode);
  }
  return normalized;
}

function booleanFlag(value: string | undefined, fallback: boolean, errorCode: string): boolean {
  const normalized = optionalString(value).toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  throw new Error(errorCode);
}
