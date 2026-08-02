import { type BackendEnvelope } from "@support-communication/envelope";
import { MailSettingsRepository } from "./mail-settings.repository.js";
import { type SmtpTransportConfig } from "./smtp-transport.js";
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
export type MailTestTransport = (config: SmtpTransportConfig, mail: {
    message: string;
    to: string;
}) => Promise<string>;
/**
 * Единые настройки служебной почты сервиса (singleton). Управляются только
 * администратором сервиса; рассылки всех воркспейсов идут через них.
 */
export declare class MailSettingsService {
    private readonly repository;
    private readonly environment;
    private readonly testTransport;
    constructor(repository?: MailSettingsRepository, environment?: NodeJS.ProcessEnv, testTransport?: MailTestTransport);
    fetch(): Promise<BackendEnvelope<Record<string, unknown>>>;
    save(input?: MailSettingsWriteInput): Promise<BackendEnvelope<Record<string, unknown>>>;
    sendTest(payload?: {
        recipient?: string;
    }): Promise<BackendEnvelope<Record<string, unknown>>>;
    private testFailedEnvelope;
    private environmentFallback;
    private invalid;
    private logFailure;
}
