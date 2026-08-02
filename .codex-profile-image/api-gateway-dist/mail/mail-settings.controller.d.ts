import { MailSettingsService, type MailSettingsWriteInput } from "./mail-settings.service.js";
export declare class MailSettingsController {
    private readonly mailSettingsService;
    constructor(mailSettingsService: MailSettingsService);
    fetchMailSettings(): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    saveMailSettings(payload: MailSettingsWriteInput): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
    testMailSettings(payload?: {
        recipient?: string;
    }): Promise<import("@support-communication/envelope").BackendEnvelope<Record<string, unknown>>>;
}
