export type SmtpEncryption = "none" | "ssl" | "starttls";
export interface SmtpTransportConfig {
    auth?: {
        password: string;
        username: string;
    };
    encryption: SmtpEncryption;
    from: string;
    fromName?: string | null;
    host: string;
    port: number;
    replyTo?: string | null;
    timeoutMs: number;
    tlsRejectUnauthorized: boolean;
}
/**
 * Все коды ошибок транспорта. Диагностика различает сетевой уровень (DNS,
 * закрытый порт, TLS-сертификат) и SMTP-уровень (логин, отправитель,
 * получатель) — по коду админ должен понять, какое поле настроек чинить.
 */
export declare const SMTP_TRANSPORT_ERROR_CODES: readonly ["smtp_timeout", "smtp_connection_closed", "smtp_unexpected_response", "smtp_response_too_large", "smtp_host_not_found", "smtp_connection_refused", "smtp_network_unreachable", "smtp_tls_certificate_invalid", "smtp_tls_failed", "smtp_auth_failed", "smtp_sender_rejected", "smtp_recipient_rejected", "smtp_unavailable"];
/**
 * Отправляет уже собранное MIME-сообщение. Возвращает queued-id провайдера
 * (пустая строка, если сервер его не сообщил). Ошибки — Error с кодом в
 * message (smtp_timeout, smtp_connection_closed, smtp_unexpected_response).
 */
export declare function sendSmtpMail(config: SmtpTransportConfig, mail: {
    message: string;
    to: string;
}): Promise<string>;
/** Собирает plain-text MIME-письмо; не-ASCII заголовки кодируются по RFC 2047. */
export declare function composeMailMessage(config: Pick<SmtpTransportConfig, "from" | "fromName" | "replyTo">, mail: {
    bodyLines: string[];
    subject: string;
    to: string;
}): string;
export declare function encodeMailHeaderText(value: string): string;
export declare function sanitizeMailHeader(value: string): string;
export declare function smtpMailAddress(value: string, errorCode: string): string;
export declare function smtpMailHost(value: string, errorCode: string): string;
