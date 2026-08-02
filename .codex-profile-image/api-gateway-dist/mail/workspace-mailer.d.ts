import { SecretStore } from "../ai-connections/secret-store.js";
import { MailSettingsRepository, type WorkspaceMailSettingsRecord } from "./mail-settings.repository.js";
import { type SmtpTransportConfig } from "./smtp-transport.js";
/** Секрет-хранилище паролей служебной почты: свой ключ, затем общие мастер-ключи. */
export declare function mailSecretStore(environment?: NodeJS.ProcessEnv): SecretStore;
/**
 * Собирает SMTP-конфиг из настроек воркспейса. Бросает SecretStoreError, если
 * пароль сохранён, но мастер-ключ недоступен или не расшифровывает секрет.
 */
export declare function transportConfigFromSettings(record: WorkspaceMailSettingsRecord, environment?: NodeJS.ProcessEnv): SmtpTransportConfig;
/** Env-фолбэк служебной почты (MAIL_*); null, если MAIL_HOST/MAIL_FROM не заданы. */
export declare function loadEnvironmentTransportConfig(source?: NodeJS.ProcessEnv): SmtpTransportConfig | null;
/**
 * Готовый к отправке транспорт тенанта: настройки воркспейса, если включены,
 * иначе env-фолбэк, иначе null. Ошибки секрет-хранилища переводят на env-фолбэк
 * с warn-логом — служебные письма важнее строгости.
 */
export declare function resolveTenantTransportConfig(tenantId: string | undefined, options?: {
    environment?: NodeJS.ProcessEnv;
    repository?: () => MailSettingsRepository;
}): Promise<{
    config: SmtpTransportConfig;
    source: "environment" | "workspace";
} | null>;
export interface WorkspaceMailOverride {
    from: string;
    send(to: string, message: string): Promise<string>;
}
export type WorkspaceMailOverrideResolver = (recipient: {
    email: string;
    tenantId?: string;
}) => Promise<WorkspaceMailOverride | null>;
/**
 * Резолвер «через какую почту слать письмо этому адресату». Если tenantId не
 * передан (self-service вход/восстановление), тенант ищется по email; когда
 * email принадлежит нескольким тенантам с включённой почтой — неоднозначность,
 * возвращаем null (env-фолбэк). Любая ошибка тоже даёт null: рассылка кода
 * важнее источника отправки.
 */
export declare function createWorkspaceMailOverrideResolver(options?: {
    environment?: NodeJS.ProcessEnv;
    findTenantIdsByEmail?: (email: string) => Promise<string[]> | string[];
    repository?: () => MailSettingsRepository;
}): WorkspaceMailOverrideResolver;
export interface InviteMailDeliveryInput {
    code: string;
    email: string;
    expiresAt: string;
    inviteeName?: string;
    tenantId: string;
}
export interface InviteMailDelivery {
    sendInvite(input: InviteMailDeliveryInput): Promise<{
        providerMessageId: string;
    }>;
}
/**
 * Доставка письма-приглашения. Режим управляется SERVICE_MAIL_DELIVERY_MODE
 * (фолбэк — MFA_OTP_DELIVERY_MODE, чтобы pilot-контур со включённым SMTP сразу
 * рассылал и приглашения); в staging/production обязателен smtp, в test/dev по
 * умолчанию детерминированный no-op.
 */
export declare function createInviteMailDeliveryFromEnv(source?: NodeJS.ProcessEnv, options?: {
    repository?: () => MailSettingsRepository;
}): InviteMailDelivery;
/** Опциональная база ссылок в письмах (PUBLIC_APP_BASE_URL); невалидный URL игнорируется. */
export declare function applicationBaseUrl(source?: NodeJS.ProcessEnv): string | null;
