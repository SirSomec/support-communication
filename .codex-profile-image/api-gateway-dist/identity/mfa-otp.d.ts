import { type MfaOtpDeliveryOptions, type MfaOtpDeliveryPort } from "./mfa-otp-delivery.js";
export interface MfaOtpIssue {
    otp: string;
    otpHash: string;
}
export interface MfaOtpRuntime {
    deliver(input: {
        challengeId: string;
        email: string;
        expiresAt: string;
        otp: string;
    }): Promise<{
        providerMessageId: string;
    }>;
    deliverRecovery(input: {
        email: string;
        expiresAt: string;
        recoveryToken: string;
        requestId: string;
    }): Promise<{
        providerMessageId: string;
    }>;
    hash(email: string, otp: string): string;
    issue(email: string): MfaOtpIssue;
}
interface MfaOtpRuntimeOptions {
    delivery: MfaOtpDeliveryPort;
    generateOtp?: () => string;
    hashKey: string;
}
export declare function createMfaOtpRuntime(options: MfaOtpRuntimeOptions): MfaOtpRuntime;
export declare function createMfaOtpRuntimeFromEnv(source?: NodeJS.ProcessEnv, deliveryOptions?: MfaOtpDeliveryOptions): MfaOtpRuntime;
export {};
