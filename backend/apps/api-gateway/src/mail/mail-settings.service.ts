import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { writeStructuredLog } from "@support-communication/observability";
import { SecretStoreError } from "../ai-connections/secret-store.js";
import { makeAuditId } from "../identity/backend-ids.js";
import { apiMeta, identityTraceId } from "../identity/identity-meta.js";
import { MailSettingsRepository, type MailEncryption, type WorkspaceMailSettingsRecord } from "./mail-settings.repository.js";
import {
  composeMailMessage,
  sendSmtpMail,
  smtpMailAddress,
  smtpMailHost,
  type SmtpTransportConfig
} from "./smtp-transport.js";
import { loadEnvironmentTransportConfig, mailSecretStore, transportConfigFromSettings } from "./workspace-mailer.js";

const SERVICE = "mailSettingsService";
const SMTP_DIAGNOSTIC_CODES = new Set([
  "smtp_timeout",
  "smtp_connection_closed",
  "smtp_unexpected_response",
  "smtp_response_too_large"
]);

export interface MailSettingsWriteInput {
  enabled?: boolean;
  encryption?: string;
  fromAddress?: string;
  fromName?: string | null;
  host?: string;
  /** undefined — не менять пароль; null/"" — удалить; строка — сохранить новый. */
  password?: string | null;
  port?: number | string;
  replyTo?: string | null;
  timeoutMs?: number | string;
  tlsRejectUnauthorized?: boolean;
  username?: string | null;
}

export type MailTestTransport = (config: SmtpTransportConfig, mail: { message: string; to: string }) => Promise<string>;

export class MailSettingsService {
  constructor(
    private readonly repository = MailSettingsRepository.default(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly testTransport: MailTestTransport = sendSmtpMail
  ) {}

  async fetch(tenantId: string): Promise<BackendEnvelope<Record<string, unknown>>> {
    const record = await this.repository.find(tenantId);
    return createEnvelope({
      service: SERVICE,
      operation: "fetchMailSettings",
      traceId: identityTraceId(SERVICE, "fetchMailSettings"),
      meta: apiMeta({ tenantId }),
      data: {
        environmentFallback: this.environmentFallback(),
        settings: record ? maskSettings(record) : null
      }
    });
  }

  async save(tenantId: string, input: MailSettingsWriteInput = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const existing = await this.repository.find(tenantId);

    let host: string;
    let fromAddress: string;
    let replyTo: string | null;
    try {
      host = smtpMailHost(String(input.host ?? ""), "mail_settings_host_invalid");
      fromAddress = smtpMailAddress(String(input.fromAddress ?? ""), "mail_settings_from_invalid");
      const replyToRaw = String(input.replyTo ?? "").trim();
      replyTo = replyToRaw ? smtpMailAddress(replyToRaw, "mail_settings_reply_to_invalid") : null;
    } catch (error) {
      return this.invalid("saveMailSettings", tenantId, errorCode(error), validationMessage(errorCode(error)));
    }

    const port = parsePort(input.port);
    if (port === null) {
      return this.invalid("saveMailSettings", tenantId, "mail_settings_port_invalid", validationMessage("mail_settings_port_invalid"));
    }
    const timeoutMs = parseTimeout(input.timeoutMs, existing?.timeoutMs ?? 10_000);
    if (timeoutMs === null) {
      return this.invalid("saveMailSettings", tenantId, "mail_settings_timeout_invalid", validationMessage("mail_settings_timeout_invalid"));
    }
    const encryption = parseEncryption(input.encryption);
    if (!encryption) {
      return this.invalid("saveMailSettings", tenantId, "mail_settings_encryption_invalid", validationMessage("mail_settings_encryption_invalid"));
    }

    const username = String(input.username ?? "").trim().slice(0, 254) || null;
    let secret = existing?.secret ?? null;
    if (input.password !== undefined) {
      const password = String(input.password ?? "");
      if (!password) {
        secret = null;
      } else {
        try {
          secret = mailSecretStore(this.environment).encrypt(password);
        } catch (error) {
          this.logFailure("saveMailSettings", tenantId, error);
          return this.invalid("saveMailSettings", tenantId, "mail_settings_secret_unavailable", "Secret storage is unavailable.");
        }
      }
    }
    if (!username) {
      secret = null;
    }
    if (username && !secret) {
      return this.invalid("saveMailSettings", tenantId, "mail_settings_auth_incomplete", validationMessage("mail_settings_auth_incomplete"));
    }

    const now = new Date().toISOString();
    const connectionChanged = !existing
      || existing.host !== host
      || existing.port !== port
      || existing.encryption !== encryption
      || existing.username !== username
      || existing.secret !== secret
      || existing.tlsRejectUnauthorized !== Boolean(input.tlsRejectUnauthorized ?? existing.tlsRejectUnauthorized);

    const record: WorkspaceMailSettingsRecord = {
      createdAt: existing?.createdAt ?? now,
      enabled: Boolean(input.enabled ?? existing?.enabled ?? false),
      encryption,
      fromAddress,
      fromName: String(input.fromName ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 120) || null,
      host,
      keyVersion: secret?.keyVersion ?? null,
      lastTestMessage: connectionChanged ? null : existing?.lastTestMessage ?? null,
      lastTestStatus: connectionChanged ? null : existing?.lastTestStatus ?? null,
      lastTestedAt: connectionChanged ? null : existing?.lastTestedAt ?? null,
      port,
      replyTo,
      secret,
      tenantId,
      timeoutMs,
      tlsRejectUnauthorized: Boolean(input.tlsRejectUnauthorized ?? existing?.tlsRejectUnauthorized ?? true),
      updatedAt: now,
      username
    };

    try {
      const saved = await this.repository.save(record);
      return createEnvelope({
        service: SERVICE,
        operation: "saveMailSettings",
        traceId: identityTraceId(SERVICE, "saveMailSettings"),
        meta: apiMeta({ tenantId }),
        data: {
          auditEvent: auditEvent("settings.mail.update", tenantId, input.password !== undefined ? "password_rotated" : "updated"),
          environmentFallback: this.environmentFallback(),
          settings: maskSettings(saved)
        }
      });
    } catch (error) {
      this.logFailure("saveMailSettings", tenantId, error);
      return this.invalid("saveMailSettings", tenantId, "mail_settings_save_failed", "Mail settings could not be saved safely.");
    }
  }

  async sendTest(tenantId: string, payload: { recipient?: string } = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const record = await this.repository.find(tenantId);
    if (!record) {
      return this.invalid("testMailSettings", tenantId, "mail_settings_not_configured", "Save mail settings before sending a test email.");
    }

    let recipient: string;
    try {
      recipient = smtpMailAddress(String(payload.recipient ?? ""), "mail_settings_recipient_invalid");
    } catch (error) {
      return this.invalid("testMailSettings", tenantId, errorCode(error), validationMessage("mail_settings_recipient_invalid"));
    }

    const traceId = `trc_mail_settings_test_${randomUUID()}`;
    const now = new Date().toISOString();

    let config: SmtpTransportConfig;
    try {
      config = transportConfigFromSettings(record, this.environment);
    } catch (error) {
      const diagnostic = error instanceof SecretStoreError ? "secret_storage_unavailable" : errorCode(error);
      const saved = await this.repository.save({ ...record, lastTestMessage: diagnostic, lastTestStatus: "failed", lastTestedAt: now, updatedAt: now });
      this.logFailure("testMailSettings", tenantId, error);
      return this.testFailedEnvelope(tenantId, saved, diagnostic, traceId);
    }

    const message = composeMailMessage(config, {
      bodyLines: [
        "Это тестовое письмо служебной почты рабочего пространства поддержки.",
        "",
        `SMTP-сервер: ${config.host}:${config.port}`,
        `Отправитель: ${config.from}`,
        `Трассировка: ${traceId}`,
        "",
        "Если вы читаете это письмо, настройки подключения работают."
      ],
      subject: "Тестовое письмо служебной почты",
      to: recipient
    });

    try {
      await this.testTransport(config, { message, to: recipient });
      const saved = await this.repository.save({ ...record, lastTestMessage: null, lastTestStatus: "passed", lastTestedAt: now, updatedAt: now });
      return createEnvelope({
        service: SERVICE,
        operation: "testMailSettings",
        traceId,
        meta: apiMeta({ tenantId }),
        data: {
          auditEvent: auditEvent("settings.mail.test", tenantId, "passed"),
          settings: maskSettings(saved),
          test: { diagnostic: { code: "ok", traceId }, status: "passed" }
        }
      });
    } catch (error) {
      const rawCode = errorCode(error);
      const diagnostic = SMTP_DIAGNOSTIC_CODES.has(rawCode) ? rawCode : "smtp_unavailable";
      const saved = await this.repository.save({ ...record, lastTestMessage: diagnostic, lastTestStatus: "failed", lastTestedAt: now, updatedAt: now });
      this.logFailure("testMailSettings", tenantId, error);
      return this.testFailedEnvelope(tenantId, saved, diagnostic, traceId);
    }
  }

  private testFailedEnvelope(
    tenantId: string,
    record: WorkspaceMailSettingsRecord,
    diagnostic: string,
    traceId: string
  ): BackendEnvelope<Record<string, unknown>> {
    return createEnvelope({
      service: SERVICE,
      operation: "testMailSettings",
      traceId,
      status: "invalid",
      meta: apiMeta({ tenantId }),
      data: {
        auditEvent: auditEvent("settings.mail.test", tenantId, diagnostic),
        settings: maskSettings(record),
        test: { diagnostic: { code: diagnostic, traceId }, status: "failed" }
      },
      error: { code: "mail_settings_test_failed", message: "Test email failed. Check the SMTP connection settings." }
    });
  }

  private environmentFallback(): Record<string, unknown> {
    try {
      const config = loadEnvironmentTransportConfig(this.environment);
      return config
        ? { configured: true, fromAddress: config.from, host: config.host, port: config.port }
        : { configured: false };
    } catch {
      return { configured: false };
    }
  }

  private invalid(operation: string, tenantId: string, code: string, message: string): BackendEnvelope<Record<string, unknown>> {
    return createEnvelope({
      service: SERVICE,
      operation,
      traceId: identityTraceId(SERVICE, operation),
      status: "invalid",
      meta: apiMeta({ tenantId }),
      data: { tenantId },
      error: { code, message }
    });
  }

  private logFailure(operation: string, tenantId: string, error: unknown): void {
    // В лог только имя/код ошибки: message может содержать аргументы запроса
    // с шифртекстом секрета или ответ SMTP-сервера.
    const code = (error as { code?: unknown } | null)?.code;
    writeStructuredLog("error", "Mail settings operation failed", {
      errorCode: typeof code === "string" || typeof code === "number" ? String(code) : null,
      errorName: error instanceof Error ? error.name : typeof error,
      operation,
      service: SERVICE,
      tenantId
    });
  }
}

/** Публичное представление настроек: без секрета, с признаком его наличия. */
function maskSettings(record: WorkspaceMailSettingsRecord): Record<string, unknown> {
  return {
    enabled: record.enabled,
    encryption: record.encryption,
    fromAddress: record.fromAddress,
    fromName: record.fromName,
    host: record.host,
    lastTestMessage: record.lastTestMessage,
    lastTestStatus: record.lastTestStatus,
    lastTestedAt: record.lastTestedAt,
    passwordConfigured: Boolean(record.secret),
    port: record.port,
    replyTo: record.replyTo,
    tenantId: record.tenantId,
    timeoutMs: record.timeoutMs,
    tlsRejectUnauthorized: record.tlsRejectUnauthorized,
    updatedAt: record.updatedAt,
    username: record.username
  };
}

function auditEvent(action: string, tenantId: string, reason: string) {
  return {
    action,
    at: new Date().toISOString(),
    id: makeAuditId("mail_settings"),
    immutable: true,
    reason,
    result: "ok",
    targetId: tenantId,
    tenantId
  };
}

function parsePort(value: number | string | undefined): number | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return 587;
  }
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 1 && normalized <= 65_535 ? normalized : null;
}

function parseTimeout(value: number | string | undefined, fallback: number): number | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 1 && normalized <= 120_000 ? normalized : null;
}

function parseEncryption(value: string | undefined): MailEncryption | null {
  const normalized = String(value ?? "starttls").trim().toLowerCase();
  return normalized === "none" || normalized === "ssl" || normalized === "starttls" ? normalized : null;
}

function errorCode(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "mail_settings_unknown_error";
}

function validationMessage(code: string): string {
  switch (code) {
    case "mail_settings_host_invalid":
      return "SMTP host is required and must contain only hostname characters.";
    case "mail_settings_from_invalid":
      return "Sender address must be a valid email.";
    case "mail_settings_reply_to_invalid":
      return "Reply-To must be a valid email.";
    case "mail_settings_port_invalid":
      return "SMTP port must be an integer between 1 and 65535.";
    case "mail_settings_timeout_invalid":
      return "Timeout must be an integer between 1 and 120000 ms.";
    case "mail_settings_encryption_invalid":
      return "Encryption must be one of: none, ssl, starttls.";
    case "mail_settings_auth_incomplete":
      return "SMTP username requires a password.";
    case "mail_settings_recipient_invalid":
      return "Test recipient must be a valid email.";
    default:
      return "Mail settings payload is invalid.";
  }
}
