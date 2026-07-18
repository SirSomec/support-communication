import { type DurableStore, InMemoryStore, createPrismaClient } from "@support-communication/database";
import type { SecretEnvelope } from "../ai-connections/secret-store.js";

type MaybePromise<T> = Promise<T> | T;

export type MailEncryption = "none" | "ssl" | "starttls";
export type MailTestStatus = "failed" | "passed" | null;

/** Singleton-идентификатор: у сервиса ровно одно SMTP-подключение. */
export const SERVICE_MAIL_SETTINGS_ID = "service";

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

interface ServiceMailSettingsState { settings: ServiceMailSettingsRecord | null; }

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
    findUnique(input: { where: { id: string } }): MaybePromise<PrismaServiceMailSettingsRow | null>;
    upsert(input: {
      create: PrismaServiceMailSettingsWriteInput;
      update: Omit<PrismaServiceMailSettingsWriteInput, "createdAt" | "id">;
      where: { id: string };
    }): MaybePromise<PrismaServiceMailSettingsRow>;
  };
}

let defaultRepository: MailSettingsRepository | null = null;

export class MailSettingsRepository {
  constructor(
    private readonly store: DurableStore<ServiceMailSettingsState>,
    private readonly prismaClient?: ServiceMailSettingsPrismaClient
  ) {}

  static default(): MailSettingsRepository {
    if (!defaultRepository) {
      // Prisma-only рантайм: дефолтный репозиторий всегда персистится в Postgres.
      defaultRepository = MailSettingsRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as ServiceMailSettingsPrismaClient });
    }
    return defaultRepository;
  }

  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: ServiceMailSettingsState = { settings: null }): MailSettingsRepository {
    return new MailSettingsRepository(new InMemoryStore(normalizeState(seed)));
  }
  static prisma({ client }: { client: ServiceMailSettingsPrismaClient }): MailSettingsRepository {
    return new MailSettingsRepository(new InMemoryStore({ settings: null }), client);
  }
  static useDefault(repository: MailSettingsRepository): void { defaultRepository = repository; }

  find(): MaybePromise<ServiceMailSettingsRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.serviceMailSettings.findUnique({ where: { id: SERVICE_MAIL_SETTINGS_ID } }))
        .then((row) => row ? toRecord(row) : undefined);
    }
    const record = this.store.read().settings;
    return record ? clone(record) : undefined;
  }

  save(record: ServiceMailSettingsRecord): MaybePromise<ServiceMailSettingsRecord> {
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

function toWriteInput(record: ServiceMailSettingsRecord): PrismaServiceMailSettingsWriteInput {
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

function toRecord(row: PrismaServiceMailSettingsRow): ServiceMailSettingsRecord {
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
        algorithm: (row.secretAlgorithm ?? "aes-256-gcm") as SecretEnvelope["algorithm"],
        authTag: String(row.secretAuthTag),
        ciphertext: String(row.secretCiphertext),
        envelopeVersion: (row.secretEnvelopeVersion ?? 1) as SecretEnvelope["envelopeVersion"],
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

function toEncryption(value: string): MailEncryption {
  return value === "none" || value === "ssl" || value === "starttls" ? value : "starttls";
}

function normalizeState(input: Partial<ServiceMailSettingsState>): ServiceMailSettingsState {
  return { settings: input.settings ? normalizeRecord(input.settings) : null };
}

function normalizeRecord(record: ServiceMailSettingsRecord): ServiceMailSettingsRecord {
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

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
