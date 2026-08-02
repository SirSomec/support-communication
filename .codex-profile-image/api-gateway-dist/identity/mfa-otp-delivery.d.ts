import type { ServiceMailOverrideResolver } from "../mail/service-mailer.js";
export interface MfaOtpDeliveryPort {
    send(input: {
        challengeId: string;
        email: string;
        expiresAt: string;
        otp: string;
    }): Promise<{
        providerMessageId: string;
    }>;
    sendRecovery?(input: {
        email: string;
        expiresAt: string;
        recoveryToken: string;
        requestId: string;
    }): Promise<{
        providerMessageId: string;
    }>;
}
export interface MfaOtpDeliveryOptions {
    /**
     * Резолвер служебной почты сервиса: если администратор сервиса настроил и
     * включил её в админ-панели — письмо уходит через неё, иначе через env-конфиг
     * (MFA_OTP_SMTP_* / MAIL_*). Используется только в smtp-режиме.
     */
    serviceMail?: ServiceMailOverrideResolver;
}
export declare function createMfaOtpDeliveryFromEnv(source?: NodeJS.ProcessEnv, options?: MfaOtpDeliveryOptions): MfaOtpDeliveryPort;
