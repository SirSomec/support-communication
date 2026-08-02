import { type DurableStore } from "@support-communication/database";
import type { SecretEnvelope } from "../ai-connections/secret-store.js";
type MaybePromise<T> = Promise<T> | T;
export type MailEncryption = "none" | "ssl" | "starttls";
export type MailTestStatus = "failed" | "passed" | null;
/** Singleton-идентификатор: у сервиса ровно одно SMTP-подключение. */
export declare const SERVICE_MAIL_SETTINGS_ID = "service";
export interface ServiceMailSettingsRecord {
    createdAt: string;
    enabled: boolean;
    encryption: MailEncryption;
    fromAddress: string;
    fromName: string | null;
    host: string;
    keyVersion: string | null;
    lastTestMessage: string | null;
    lastTestStatus: MailTestStatus;
    lastTestedAt: string | null;
    port: number;
    replyTo: string | null;
    /** Зашифрованный SMTP-пароль; null — подключение без аутентификации. */
    secret: SecretEnvelope | null;
    timeoutMs: number;
    tlsRejectUnauthorized: boolean;
    updatedAt: string;
    username: string | null;
}
interface ServiceMailSettingsState {
    settings: ServiceMailSettingsRecord | null;
}
export interface PrismaServiceMailSettingsRow {
    createdAt: Date;
    enabled: boolean;
    encryption: string;
    fromAddress: string;
    fromName: string | null;
    host: string;
    id: string;
    keyVersion: string | null;
    lastTestMessage: string | null;
    lastTestStatus: string | null;
    lastTestedAt: Date | null;
    port: number;
    replyTo: string | null;
    secretAlgorithm: string | null;
    secretAuthTag: string | null;
    secretCiphertext: string | null;
    secretEnvelopeVersion: number | null;
    secretIv: string | null;
    timeoutMs: number;
    tlsRejectUnauthorized: boolean;
    updatedAt: Date;
    username: string | null;
}
export interface PrismaServiceMailSettingsWriteInput {
    createdAt: Date;
    enabled: boolean;
    encryption: string;
    fromAddress: string;
    fromName: string | null;
    host: string;
    id: string;
    keyVersion: string | null;
    lastTestMessage: string | null;
    lastTestStatus: string | null;
    lastTestedAt: Date | null;
    port: number;
    replyTo: string | null;
    secretAlgorithm: string | null;
    secretAuthTag: string | null;
    secretCiphertext: string | null;
    secretEnvelopeVersion: number | null;
    secretIv: string | null;
    timeoutMs: number;
    tlsRejectUnauthorized: boolean;
    updatedAt: Date;
    username: string | null;
}
export interface ServiceMailSettingsPrismaClient {
    serviceMailSettings: {
        findUnique(input: {
            where: {
                id: string;
            };
        }): MaybePromise<PrismaServiceMailSettingsRow | null>;
        upsert(input: {
            create: PrismaServiceMailSettingsWriteInput;
            update: Omit<PrismaServiceMailSettingsWriteInput, "createdAt" | "id">;
            where: {
                id: string;
            };
        }): MaybePromise<PrismaServiceMailSettingsRow>;
    };
}
export declare class MailSettingsRepository {
    private readonly store;
    private readonly prismaClient?;
    constructor(store: DurableStore<ServiceMailSettingsState>, prismaClient?: ServiceMailSettingsPrismaClient | undefined);
    static default(): MailSettingsRepository;
    static clearDefault(): void;
    static inMemory(seed?: ServiceMailSettingsState): MailSettingsRepository;
    static prisma({ client }: {
        client: ServiceMailSettingsPrismaClient;
    }): MailSettingsRepository;
    static useDefault(repository: MailSettingsRepository): void;
    find(): MaybePromise<ServiceMailSettingsRecord | undefined>;
    save(record: ServiceMailSettingsRecord): MaybePromise<ServiceMailSettingsRecord>;
}
export {};
