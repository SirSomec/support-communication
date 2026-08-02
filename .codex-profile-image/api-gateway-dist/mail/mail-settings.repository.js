import { InMemoryStore, createPrismaClient } from "@support-communication/database";
/** Singleton-идентификатор: у сервиса ровно одно SMTP-подключение. */
export const SERVICE_MAIL_SETTINGS_ID = "service";
let defaultRepository = null;
export class MailSettingsRepository {
    store;
    prismaClient;
    constructor(store, prismaClient) {
        this.store = store;
        this.prismaClient = prismaClient;
    }
    static default() {
        if (!defaultRepository) {
            // Prisma-only рантайм: дефолтный репозиторий всегда персистится в Postgres.
            defaultRepository = MailSettingsRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) });
        }
        return defaultRepository;
    }
    static clearDefault() { defaultRepository = null; }
    static inMemory(seed = { settings: null }) {
        return new MailSettingsRepository(new InMemoryStore(normalizeState(seed)));
    }
    static prisma({ client }) {
        return new MailSettingsRepository(new InMemoryStore({ settings: null }), client);
    }
    static useDefault(repository) { defaultRepository = repository; }
    find() {
        if (this.prismaClient) {
            return Promise.resolve(this.prismaClient.serviceMailSettings.findUnique({ where: { id: SERVICE_MAIL_SETTINGS_ID } }))
                .then((row) => row ? toRecord(row) : undefined);
        }
        const record = this.store.read().settings;
        return record ? clone(record) : undefined;
    }
    save(record) {
        const normalized = normalizeRecord(record);
        if (this.prismaClient) {
            const create = toWriteInput(normalized);
            const { createdAt: _createdAt, id: _id, ...update } = create;
            return Promise.resolve(this.prismaClient.serviceMailSettings.upsert({
                create,
                update,
                where: { id: SERVICE_MAIL_SETTINGS_ID }
            })).then(toRecord);
        }
        this.store.update(() => ({ settings: normalized }));
        return clone(normalized);
    }
}
function toWriteInput(record) {
    return {
        createdAt: new Date(record.createdAt),
        enabled: record.enabled,
        encryption: record.encryption,
        fromAddress: record.fromAddress,
        fromName: record.fromName,
        host: record.host,
        id: SERVICE_MAIL_SETTINGS_ID,
        keyVersion: record.secret ? record.keyVersion : null,
        lastTestMessage: record.lastTestMessage,
        lastTestStatus: record.lastTestStatus,
        lastTestedAt: record.lastTestedAt ? new Date(record.lastTestedAt) : null,
        port: record.port,
        replyTo: record.replyTo,
        secretAlgorithm: record.secret?.algorithm ?? null,
        secretAuthTag: record.secret?.authTag ?? null,
        secretCiphertext: record.secret?.ciphertext ?? null,
        secretEnvelopeVersion: record.secret?.envelopeVersion ?? null,
        secretIv: record.secret?.iv ?? null,
        timeoutMs: record.timeoutMs,
        tlsRejectUnauthorized: record.tlsRejectUnauthorized,
        updatedAt: new Date(record.updatedAt),
        username: record.username
    };
}
function toRecord(row) {
    const hasSecret = Boolean(row.secretCiphertext && row.secretIv && row.secretAuthTag);
    return normalizeRecord({
        createdAt: row.createdAt.toISOString(),
        enabled: row.enabled,
        encryption: toEncryption(row.encryption),
        fromAddress: row.fromAddress,
        fromName: row.fromName,
        host: row.host,
        keyVersion: row.keyVersion,
        lastTestMessage: row.lastTestMessage,
        lastTestStatus: row.lastTestStatus === "passed" || row.lastTestStatus === "failed" ? row.lastTestStatus : null,
        lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
        port: row.port,
        replyTo: row.replyTo,
        secret: hasSecret
            ? {
                algorithm: (row.secretAlgorithm ?? "aes-256-gcm"),
                authTag: String(row.secretAuthTag),
                ciphertext: String(row.secretCiphertext),
                envelopeVersion: (row.secretEnvelopeVersion ?? 1),
                iv: String(row.secretIv),
                keyVersion: String(row.keyVersion ?? "")
            }
            : null,
        timeoutMs: row.timeoutMs,
        tlsRejectUnauthorized: row.tlsRejectUnauthorized,
        updatedAt: row.updatedAt.toISOString(),
        username: row.username
    });
}
function toEncryption(value) {
    return value === "none" || value === "ssl" || value === "starttls" ? value : "starttls";
}
function normalizeState(input) {
    return { settings: input.settings ? normalizeRecord(input.settings) : null };
}
function normalizeRecord(record) {
    if (record.secret && (!record.secret.ciphertext || !record.secret.iv || !record.secret.authTag)) {
        throw new Error("service_mail_settings_secret_invalid");
    }
    return {
        ...clone(record),
        encryption: toEncryption(record.encryption),
        fromAddress: String(record.fromAddress).trim(),
        host: String(record.host).trim(),
        keyVersion: record.secret ? String(record.keyVersion ?? record.secret.keyVersion).trim() || null : null,
        username: String(record.username ?? "").trim() || null
    };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
//# sourceMappingURL=mail-settings.repository.js.map