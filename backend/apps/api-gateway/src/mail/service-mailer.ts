import { createHash } from "node:crypto";
import { writeStructuredLog } from "@support-communication/observability";
import { SecretStore, SecretStoreError } from "../ai-connections/secret-store.js";
import { MailSettingsRepository, type ServiceMailSettingsRecord } from "./mail-settings.repository.js";
import {
  composeMailMessage,
  sendSmtpMail,
  smtpMailAddress,
  type SmtpEncryption,
  type SmtpTransportConfig
} from "./smtp-transport.js";

// Маршрутизация служебных рассылок всего сервиса: если администратор сервиса
// настроил и включил служебную почту в админ-панели — письма уходят через неё;
// иначе действует env-фолбэк (MAIL_*), на котором живут pilot/staging (mailpit).
// Конфигурация одна на всю платформу — воркспейсы её не переопределяют.

const DEFAULT_MAIL_TIMEOUT_MS = 10_000;
const MAX_MAIL_TIMEOUT_MS = 120_000;

/** Секрет-хранилище пароля служебной почты: свой ключ, затем общие мастер-ключи. */
export function mailSecretStore(environment: NodeJS.ProcessEnv = process.env): SecretStore {
  return new SecretStore({
    keyVersion: environment.MAIL_SETTINGS_KEY_VERSION
      ?? environment.AI_CONNECTIONS_KEY_VERSION
      ?? "local-v1",
    masterKeyBase64: environment.MAIL_SETTINGS_MASTER_KEY
      ?? environment.AI_CONNECTIONS_MASTER_KEY
      ?? environment.PROVIDER_CREDENTIAL_MASTER_KEY
      ?? ""
  });
}

/**
 * Собирает SMTP-конфиг из настроек сервиса. Бросает SecretStoreError, если
 * пароль сохранён, но мастер-ключ недоступен или не расшифровывает секрет.
 */
export function transportConfigFromSettings(
  record: ServiceMailSettingsRecord,
  environment: NodeJS.ProcessEnv = process.env
): SmtpTransportConfig {
  let auth: SmtpTransportConfig["auth"];
  if (record.username) {
    if (!record.secret) {
      throw new Error("service_mail_settings_auth_incomplete");
    }
    auth = {
      password: mailSecretStore(environment).decrypt(record.secret),
      username: record.username
    };
  }

  return {
    auth,
    encryption: record.encryption,
    from: record.fromAddress,
    fromName: record.fromName,
    host: record.host,
    port: record.port,
    replyTo: record.replyTo,
    timeoutMs: record.timeoutMs,
    tlsRejectUnauthorized: record.tlsRejectUnauthorized
  };
}

/** Env-фолбэк служебной почты (MAIL_*); null, если MAIL_HOST/MAIL_FROM не заданы. */
export function loadEnvironmentTransportConfig(source: NodeJS.ProcessEnv = process.env): SmtpTransportConfig | null {
  const host = optionalString(source.MAIL_HOST);
  const from = optionalString(source.MAIL_FROM);
  if (!host || !from) {
    return null;
  }

  const username = optionalString(source.MAIL_USERNAME);
  const password = optionalString(source.MAIL_PASSWORD);
  if (Boolean(username) !== Boolean(password)) {
    throw new Error("mail_environment_auth_incomplete");
  }

  return {
    auth: username && password ? { password, username } : undefined,
    encryption: environmentEncryption(source),
    from: smtpMailAddress(from, "mail_environment_from_invalid"),
    fromName: optionalString(source.MAIL_FROM_NAME) || null,
    host,
    port: positiveInteger(source.MAIL_PORT, 1_025, 65_535, "mail_environment_port_invalid"),
    replyTo: null,
    timeoutMs: positiveInteger(source.MAIL_TIMEOUT_MS, DEFAULT_MAIL_TIMEOUT_MS, MAX_MAIL_TIMEOUT_MS, "mail_environment_timeout_invalid"),
    tlsRejectUnauthorized: booleanFlag(source.MAIL_TLS_REJECT_UNAUTHORIZED, true, "mail_environment_tls_flag_invalid")
  };
}

/**
 * Готовый к отправке транспорт сервиса: настройки из админ-панели, если
 * включены, иначе env-фолбэк, иначе null. Ошибки секрет-хранилища переводят
 * на env-фолбэк с warn-логом — служебные письма важнее строгости.
 */
export async function resolveServiceTransportConfig(
  options: {
    environment?: NodeJS.ProcessEnv;
    repository?: () => MailSettingsRepository;
  } = {}
): Promise<{ config: SmtpTransportConfig; source: "environment" | "settings" } | null> {
  const environment = options.environment ?? process.env;
  const repositoryFactory = options.repository ?? (() => MailSettingsRepository.default());

  try {
    const record = await repositoryFactory().find();
    if (record?.enabled) {
      return { config: transportConfigFromSettings(record, environment), source: "settings" };
    }
  } catch (error) {
    logMailFallback("service mail settings unavailable", error);
  }

  const environmentConfig = loadEnvironmentTransportConfig(environment);
  return environmentConfig ? { config: environmentConfig, source: "environment" } : null;
}

// --- Override-резолвер для доставки MFA-кодов и восстановления пароля ---

export interface ServiceMailOverride {
  from: string;
  send(to: string, message: string): Promise<string>;
}

export type ServiceMailOverrideResolver = () => Promise<ServiceMailOverride | null>;

/**
 * Резолвер «слать ли через настройки из админ-панели». Возвращает null, если
 * настройки не заведены/выключены или недоступны — тогда остаётся env-SMTP:
 * доставка кода важнее источника отправки.
 */
export function createServiceMailOverrideResolver(options: {
  environment?: NodeJS.ProcessEnv;
  repository?: () => MailSettingsRepository;
} = {}): ServiceMailOverrideResolver {
  const environment = options.environment ?? process.env;
  const repositoryFactory = options.repository ?? (() => MailSettingsRepository.default());

  return async () => {
    try {
      const record = await repositoryFactory().find();
      if (!record?.enabled) {
        return null;
      }
      const config = transportConfigFromSettings(record, environment);
      return {
        from: config.from,
        send: (to, message) => sendSmtpMail(config, { message, to })
      };
    } catch (error) {
      logMailFallback("service mail override unavailable", error);
      return null;
    }
  };
}

// --- Доставка приглашений сотрудников ---

export interface InviteMailDeliveryInput {
  code: string;
  email: string;
  expiresAt: string;
  inviteeName?: string;
  tenantId: string;
}

export interface InviteMailDelivery {
  sendInvite(input: InviteMailDeliveryInput): Promise<{ providerMessageId: string }>;
}

/**
 * Доставка письма-приглашения. Режим управляется SERVICE_MAIL_DELIVERY_MODE
 * (фолбэк — MFA_OTP_DELIVERY_MODE, чтобы pilot-контур со включённым SMTP сразу
 * рассылал и приглашения); в staging/production обязателен smtp, в test/dev по
 * умолчанию детерминированный no-op.
 */
export function createInviteMailDeliveryFromEnv(
  source: NodeJS.ProcessEnv = process.env,
  options: { repository?: () => MailSettingsRepository } = {}
): InviteMailDelivery {
  const nodeEnv = normalizeNodeEnv(source.NODE_ENV);
  const configuredMode = (optionalString(source.SERVICE_MAIL_DELIVERY_MODE) || optionalString(source.MFA_OTP_DELIVERY_MODE)).toLowerCase();

  if ((nodeEnv === "staging" || nodeEnv === "production") && configuredMode !== "smtp") {
    throw new Error("service_mail_delivery_mode_smtp_required");
  }

  const mode = configuredMode || defaultDeliveryMode(nodeEnv, source);
  if (mode === "smtp") {
    return {
      async sendInvite(input) {
        const normalized = normalizeInviteInput(input);
        const resolved = await resolveServiceTransportConfig({
          environment: source,
          repository: options.repository
        });
        if (!resolved) {
          throw new Error("service_mail_delivery_unconfigured");
        }

        const message = composeMailMessage(resolved.config, buildInviteMail(normalized, source));
        try {
          const queuedId = await sendSmtpMail(resolved.config, { message, to: normalized.email });
          return { providerMessageId: `smtp-${queuedId || inviteFingerprint(normalized)}` };
        } catch {
          // Ответ провайдера не раскрываем: он может отражать содержимое письма.
          throw new Error("invite_mail_smtp_delivery_failed");
        }
      }
    };
  }

  if ((nodeEnv === "test" || nodeEnv === "development") && isDeterministicMode(mode)) {
    return {
      async sendInvite(input) {
        const normalized = normalizeInviteInput(input);
        return { providerMessageId: `test-invite-${inviteFingerprint(normalized)}` };
      }
    };
  }

  throw new Error("service_mail_delivery_mode_invalid");
}

function buildInviteMail(
  input: Required<Pick<InviteMailDeliveryInput, "code" | "email" | "expiresAt" | "tenantId">> & { inviteeName: string },
  source: NodeJS.ProcessEnv
): { bodyLines: string[]; subject: string; to: string } {
  const appBaseUrl = applicationBaseUrl(source);
  const greeting = input.inviteeName ? `Здравствуйте, ${input.inviteeName}!` : "Здравствуйте!";

  return {
    bodyLines: [
      greeting,
      "",
      "Вас пригласили присоединиться к рабочему пространству службы поддержки.",
      "",
      `Код приглашения: ${input.code}`,
      `Email для активации: ${input.email}`,
      `Приглашение действует до: ${input.expiresAt}`,
      "",
      appBaseUrl
        ? `Чтобы принять приглашение, откройте ${appBaseUrl}, выберите «Активировать invite», введите код с email и задайте пароль.`
        : "Чтобы принять приглашение, откройте приложение поддержки, выберите «Активировать invite», введите код с email и задайте пароль.",
      "",
      "Если вы не ожидали это письмо, просто проигнорируйте его."
    ],
    subject: "Приглашение в рабочее пространство поддержки",
    to: input.email
  };
}

function normalizeInviteInput(input: InviteMailDeliveryInput) {
  const code = String(input.code ?? "").trim();
  const tenantId = String(input.tenantId ?? "").trim();
  const expiresAtMs = Date.parse(String(input.expiresAt ?? ""));

  if (!/^[A-Za-z0-9._~-]{8,512}$/.test(code)) {
    throw new Error("invite_mail_delivery_input_invalid");
  }
  if (!tenantId || tenantId.length > 200) {
    throw new Error("invite_mail_delivery_input_invalid");
  }
  if (!Number.isFinite(expiresAtMs)) {
    throw new Error("invite_mail_delivery_input_invalid");
  }

  return {
    code,
    email: smtpMailAddress(String(input.email ?? ""), "invite_mail_delivery_input_invalid"),
    expiresAt: new Date(expiresAtMs).toISOString(),
    inviteeName: String(input.inviteeName ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 120),
    tenantId
  };
}

function inviteFingerprint(input: { email: string; expiresAt: string; tenantId: string }): string {
  return createHash("sha256")
    .update(`${input.tenantId}:${input.email}:${input.expiresAt}`)
    .digest("hex")
    .slice(0, 20);
}

/** Опциональная база ссылок в письмах (PUBLIC_APP_BASE_URL); невалидный URL игнорируется. */
export function applicationBaseUrl(source: NodeJS.ProcessEnv = process.env): string | null {
  const raw = optionalString(source.PUBLIC_APP_BASE_URL);
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function logMailFallback(reason: string, error: unknown): void {
  // Секреты и содержимое писем в лог не попадают — только имя/код ошибки.
  const code = (error as { code?: unknown } | null)?.code;
  writeStructuredLog("warn", `Service mail fallback: ${reason}`, {
    errorCode: typeof code === "string" || typeof code === "number" ? String(code) : null,
    errorName: error instanceof SecretStoreError ? "SecretStoreError" : error instanceof Error ? error.name : typeof error,
    service: "serviceMailer"
  });
}

function environmentEncryption(source: NodeJS.ProcessEnv): SmtpEncryption {
  const explicit = optionalString(source.MAIL_ENCRYPTION).toLowerCase();
  if (explicit === "none" || explicit === "ssl" || explicit === "starttls") {
    return explicit;
  }
  if (explicit) {
    throw new Error("mail_environment_encryption_invalid");
  }
  return booleanFlag(source.MAIL_SECURE, false, "mail_environment_secure_invalid") ? "ssl" : "none";
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
  throw new Error("service_mail_delivery_node_env_invalid");
}

function defaultDeliveryMode(nodeEnv: "development" | "production" | "staging" | "test", source: NodeJS.ProcessEnv): string {
  if (nodeEnv === "test") {
    return "deterministic";
  }
  if (nodeEnv === "development" && optionalString(source.MAIL_HOST)) {
    return "smtp";
  }
  return "deterministic";
}

function isDeterministicMode(mode: string): boolean {
  return mode === "deterministic" || mode === "noop" || mode === "no-op" || mode === "test";
}

function optionalString(value: string | undefined): string {
  return String(value ?? "").trim();
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
