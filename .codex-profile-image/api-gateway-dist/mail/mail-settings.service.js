import { randomUUID } from "node:crypto";
import { createEnvelope } from "@support-communication/envelope";
import { writeStructuredLog } from "@support-communication/observability";
import { SecretStoreError } from "../ai-connections/secret-store.js";
import { makeAuditId } from "../identity/backend-ids.js";
import { apiMeta, identityTraceId } from "../identity/identity-meta.js";
import { MailSettingsRepository, SERVICE_MAIL_SETTINGS_ID } from "./mail-settings.repository.js";
import { SMTP_TRANSPORT_ERROR_CODES, composeMailMessage, sendSmtpMail, smtpMailAddress, smtpMailHost } from "./smtp-transport.js";
import { loadEnvironmentTransportConfig, mailSecretStore, transportConfigFromSettings } from "./service-mailer.js";
const SERVICE = "mailSettingsService";
const SMTP_DIAGNOSTIC_CODES = new Set(SMTP_TRANSPORT_ERROR_CODES);
/**
 * Единые настройки служебной почты сервиса (singleton). Управляются только
 * администратором сервиса; рассылки всех воркспейсов идут через них.
 */
export class MailSettingsService {
    repository;
    environment;
    testTransport;
    constructor(repository = MailSettingsRepository.default(), environment = process.env, testTransport = sendSmtpMail) {
        this.repository = repository;
        this.environment = environment;
        this.testTransport = testTransport;
    }
    async fetch() {
        const record = await this.repository.find();
        return createEnvelope({
            service: SERVICE,
            operation: "fetchMailSettings",
            traceId: identityTraceId(SERVICE, "fetchMailSettings"),
            meta: apiMeta({ scope: SERVICE_MAIL_SETTINGS_ID }),
            data: {
                environmentFallback: this.environmentFallback(),
                settings: record ? maskSettings(record) : null
            }
        });
    }
    async save(input = {}) {
        const existing = await this.repository.find();
        let host;
        let fromAddress;
        let replyTo;
        try {
            host = smtpMailHost(String(input.host ?? ""), "mail_settings_host_invalid");
            fromAddress = smtpMailAddress(String(input.fromAddress ?? ""), "mail_settings_from_invalid");
            const replyToRaw = String(input.replyTo ?? "").trim();
            replyTo = replyToRaw ? smtpMailAddress(replyToRaw, "mail_settings_reply_to_invalid") : null;
        }
        catch (error) {
            return this.invalid("saveMailSettings", errorCode(error), validationMessage(errorCode(error)));
        }
        const port = parsePort(input.port);
        if (port === null) {
            return this.invalid("saveMailSettings", "mail_settings_port_invalid", validationMessage("mail_settings_port_invalid"));
        }
        const timeoutMs = parseTimeout(input.timeoutMs, existing?.timeoutMs ?? 10_000);
        if (timeoutMs === null) {
            return this.invalid("saveMailSettings", "mail_settings_timeout_invalid", validationMessage("mail_settings_timeout_invalid"));
        }
        const encryption = parseEncryption(input.encryption);
        if (!encryption) {
            return this.invalid("saveMailSettings", "mail_settings_encryption_invalid", validationMessage("mail_settings_encryption_invalid"));
        }
        const username = String(input.username ?? "").trim().slice(0, 254) || null;
        let secret = existing?.secret ?? null;
        if (input.password !== undefined) {
            const password = String(input.password ?? "");
            if (!password) {
                secret = null;
            }
            else {
                try {
                    secret = mailSecretStore(this.environment).encrypt(password);
                }
                catch (error) {
                    this.logFailure("saveMailSettings", error);
                    return this.invalid("saveMailSettings", "mail_settings_secret_unavailable", "Secret storage is unavailable.");
                }
            }
        }
        if (!username) {
            secret = null;
        }
        if (username && !secret) {
            return this.invalid("saveMailSettings", "mail_settings_auth_incomplete", validationMessage("mail_settings_auth_incomplete"));
        }
        const now = new Date().toISOString();
        const connectionChanged = !existing
            || existing.host !== host
            || existing.port !== port
            || existing.encryption !== encryption
            || existing.username !== username
            || existing.secret !== secret
            || existing.tlsRejectUnauthorized !== Boolean(input.tlsRejectUnauthorized ?? existing.tlsRejectUnauthorized);
        const record = {
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
                meta: apiMeta({ scope: SERVICE_MAIL_SETTINGS_ID }),
                data: {
                    auditEvent: auditEvent("service.mail.update", input.password !== undefined ? "password_rotated" : "updated"),
                    environmentFallback: this.environmentFallback(),
                    settings: maskSettings(saved)
                }
            });
        }
        catch (error) {
            this.logFailure("saveMailSettings", error);
            return this.invalid("saveMailSettings", "mail_settings_save_failed", "Mail settings could not be saved safely.");
        }
    }
    async sendTest(payload = {}) {
        const record = await this.repository.find();
        if (!record) {
            return this.invalid("testMailSettings", "mail_settings_not_configured", "Save mail settings before sending a test email.");
        }
        let recipient;
        try {
            recipient = smtpMailAddress(String(payload.recipient ?? ""), "mail_settings_recipient_invalid");
        }
        catch {
            return this.invalid("testMailSettings", "mail_settings_recipient_invalid", validationMessage("mail_settings_recipient_invalid"));
        }
        const traceId = `trc_mail_settings_test_${randomUUID()}`;
        const now = new Date().toISOString();
        let config;
        try {
            config = transportConfigFromSettings(record, this.environment);
        }
        catch (error) {
            const diagnostic = error instanceof SecretStoreError ? "secret_storage_unavailable" : errorCode(error);
            const saved = await this.repository.save({ ...record, lastTestMessage: diagnostic, lastTestStatus: "failed", lastTestedAt: now, updatedAt: now });
            this.logFailure("testMailSettings", error);
            return this.testFailedEnvelope(saved, diagnostic, traceId);
        }
        const message = composeMailMessage(config, {
            bodyLines: [
                "Это тестовое письмо служебной почты сервиса поддержки.",
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
                meta: apiMeta({ scope: SERVICE_MAIL_SETTINGS_ID }),
                data: {
                    auditEvent: auditEvent("service.mail.test", "passed"),
                    settings: maskSettings(saved),
                    test: { diagnostic: { code: "ok", traceId }, status: "passed" }
                }
            });
        }
        catch (error) {
            const rawCode = errorCode(error);
            const diagnostic = SMTP_DIAGNOSTIC_CODES.has(rawCode) ? rawCode : "smtp_unavailable";
            const saved = await this.repository.save({ ...record, lastTestMessage: diagnostic, lastTestStatus: "failed", lastTestedAt: now, updatedAt: now });
            this.logFailure("testMailSettings", error);
            return this.testFailedEnvelope(saved, diagnostic, traceId);
        }
    }
    testFailedEnvelope(record, diagnostic, traceId) {
        return createEnvelope({
            service: SERVICE,
            operation: "testMailSettings",
            traceId,
            status: "invalid",
            meta: apiMeta({ scope: SERVICE_MAIL_SETTINGS_ID }),
            data: {
                auditEvent: auditEvent("service.mail.test", diagnostic),
                settings: maskSettings(record),
                test: { diagnostic: { code: diagnostic, traceId }, status: "failed" }
            },
            error: { code: "mail_settings_test_failed", message: "Test email failed. Check the SMTP connection settings." }
        });
    }
    environmentFallback() {
        try {
            const config = loadEnvironmentTransportConfig(this.environment);
            return config
                ? { configured: true, fromAddress: config.from, host: config.host, port: config.port }
                : { configured: false };
        }
        catch {
            return { configured: false };
        }
    }
    invalid(operation, code, message) {
        return createEnvelope({
            service: SERVICE,
            operation,
            traceId: identityTraceId(SERVICE, operation),
            status: "invalid",
            meta: apiMeta({ scope: SERVICE_MAIL_SETTINGS_ID }),
            data: { scope: SERVICE_MAIL_SETTINGS_ID },
            error: { code, message }
        });
    }
    logFailure(operation, error) {
        // В лог только имя/код ошибки: message может содержать аргументы запроса
        // с шифртекстом секрета или ответ SMTP-сервера.
        const code = error?.code;
        writeStructuredLog("error", "Mail settings operation failed", {
            errorCode: typeof code === "string" || typeof code === "number" ? String(code) : null,
            errorName: error instanceof Error ? error.name : typeof error,
            operation,
            service: SERVICE
        });
    }
}
/** Публичное представление настроек: без секрета, с признаком его наличия. */
function maskSettings(record) {
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
        timeoutMs: record.timeoutMs,
        tlsRejectUnauthorized: record.tlsRejectUnauthorized,
        updatedAt: record.updatedAt,
        username: record.username
    };
}
function auditEvent(action, reason) {
    return {
        action,
        at: new Date().toISOString(),
        id: makeAuditId("mail_settings"),
        immutable: true,
        reason,
        result: "ok",
        targetId: SERVICE_MAIL_SETTINGS_ID
    };
}
function parsePort(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return 587;
    }
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized >= 1 && normalized <= 65_535 ? normalized : null;
}
function parseTimeout(value, fallback) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return fallback;
    }
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized >= 1 && normalized <= 120_000 ? normalized : null;
}
function parseEncryption(value) {
    const normalized = String(value ?? "starttls").trim().toLowerCase();
    return normalized === "none" || normalized === "ssl" || normalized === "starttls" ? normalized : null;
}
function errorCode(error) {
    return error instanceof Error && error.message ? error.message : "mail_settings_unknown_error";
}
function validationMessage(code) {
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
//# sourceMappingURL=mail-settings.service.js.map