import { type BackendEnvelope } from "@support-communication/envelope";
export interface TelegramConnectionRecord {
    channelConnectionId: string;
    botId: string | null;
    botToken: string;
    botUsername: string | null;
    pollingOffset?: number;
    createdAt: string;
    status: "active" | "disabled";
    tenantId: string;
    tokenPreview: string;
    updatedAt: string;
    webhookSecret: string;
}
export interface TelegramConnectionPublicView {
    botId: string | null;
    botUsername: string | null;
    createdAt: string;
    status: "active" | "disabled" | "not_configured";
    tenantId: string;
    tokenConfigured: boolean;
    tokenPreview: string | null;
    updatedAt: string | null;
    webhookSecret: string | null;
    webhookUrl: string;
}
export interface TelegramGetMeResponse {
    ok: boolean;
    result?: {
        id?: number;
        username?: string;
    };
}
export interface SaveTelegramConnectionInput {
    botToken: string;
    channelConnectionId: string;
    fetcher?: TelegramHttpFetch;
    now?: Date;
    publicWebhookBaseUrl: string;
    tenantId: string;
}
export interface TelegramHttpFetch {
    (input: string, init?: {
        signal?: AbortSignal;
    }): Promise<{
        json(): Promise<unknown>;
        ok: boolean;
        status: number;
    }>;
}
export declare function maskTelegramBotToken(rawToken: string): string;
export declare function createTelegramWebhookSecret(): string;
export declare function buildTelegramWebhookUrl(publicWebhookBaseUrl: string): string;
export declare function toTelegramConnectionPublicView(record: TelegramConnectionRecord | undefined, publicWebhookBaseUrl: string): TelegramConnectionPublicView;
export declare function verifyTelegramWebhookSecretToken(provided: string | undefined, expected: string): boolean;
export declare function resolveTelegramTenantByWebhookSecret(connections: TelegramConnectionRecord[], providedSecret: string | undefined): TelegramConnectionRecord | undefined;
export declare function validateTelegramBotToken(botToken: string, fetcher: TelegramHttpFetch, apiBaseUrl?: string, timeoutMs?: number): Promise<{
    botId: string;
    botUsername: string | null;
}>;
export declare function saveTelegramConnectionRecord(input: SaveTelegramConnectionInput, existing?: TelegramConnectionRecord): Promise<TelegramConnectionRecord>;
export declare function disableTelegramConnectionRecord(existing: TelegramConnectionRecord, now?: Date): TelegramConnectionRecord;
export declare function findActiveTelegramBotToken(connections: TelegramConnectionRecord[], tenantId: string, channelConnectionId?: string): string | undefined;
export declare function telegramConnectionFingerprint(tenantId: string, botId: string | null): string;
export declare function telegramConnectionEnvelope(operation: string, data: Record<string, unknown>, status?: BackendEnvelope<Record<string, unknown>>["status"]): BackendEnvelope<Record<string, unknown>>;
