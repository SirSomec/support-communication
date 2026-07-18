import { type DurableStore, InMemoryStore, createPrismaClient } from "@support-communication/database";
import type { SecretEnvelope } from "../ai-connections/secret-store.js";

type MaybePromise<T> = Promise<T> | T;

export type MailEncryption = "none" | "ssl" | "starttls";
export type MailTestStatus = "failed" | "passed" | null;

export interface WorkspaceMailSettingsRecord {
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
  tenantId: string;
  timeoutMs: number;
  tlsRejectUnauthorized: boolean;
  updatedAt: string;
  username: string | null;
}

interface WorkspaceMailSettingsState { settings: WorkspaceMailSettingsRecord[]; }

export interface PrismaWorkspaceMailSettingsRow {
  createdAt: Date;
  enabled: boolean;
  encryption: string;
  fromAddress: string;
  fromName: string | null;
  host: string;
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
  tenantId: string;
  timeoutMs: number;
  tlsRejectUnauthorized: boolean;
  updatedAt: Date;
  username: string | null;
}

export interface PrismaWorkspaceMailSettingsWriteInput {
  createdAt: Date;
  enabled: boolean;
  encryption: string;
  fromAddress: string;
  fromName: string | null;
  host: string;
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
  tenantId: string;
  timeoutMs: number;
  tlsRejectUnauthorized: boolean;
  updatedAt: Date;
  username: string | null;
}

export interface WorkspaceMailSettingsPrismaClient {
  workspaceMailSettings: {
    findUnique(input: { where: { tenantId: string } }): MaybePromise<PrismaWorkspaceMailSettingsRow | null>;
    upsert(input: {
      create: PrismaWorkspaceMailSettingsWriteInput;
      update: Omit<PrismaWorkspaceMailSettingsWriteInput, "createdAt" | "tenantId">;
      where: { tenantId: string };
    }): MaybePromise<PrismaWorkspaceMailSettingsRow>;
  };
}

let defaultRepository: MailSettingsRepository | null = null;

export class MailSettingsRepository {
  constructor(
    private readonly store: DurableStore<WorkspaceMailSettingsState>,
    private readonly prismaClient?: WorkspaceMailSettingsPrismaClient
  ) {}

  static default(): MailSettingsRepository {
    if (!defaultRepository) {
      // Prisma-only рантайм: дефолтный репозиторий всегда персистится в Postgres.
      defaultRepository = MailSettingsRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as WorkspaceMailSettingsPrismaClient });
    }
    return defaultRepository;
  }

  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: WorkspaceMailSettingsState = { settings: [] }): MailSettingsRepository {
    return new MailSettingsRepository(new InMemoryStore(normalizeState(seed)));
  }
  static prisma({ client }: { client: WorkspaceMailSettingsPrismaClient }): MailSettingsRepository {
    return new MailSettingsRepository(new InMemoryStore({ settings: [] }), client);
  }
  static useDefault(repository: MailSettingsRepository): void { defaultRepository = repository; }

  find(tenantId: string): MaybePromise<WorkspaceMailSettingsRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.workspaceMailSettings.findUnique({ where: { tenantId } }))
        .then((row) => row ? toRecord(row) : undefined);
    }
    const record = this.store.read().settings.find((item) => item.tenantId === tenantId);
    return record ? clone(record) : undefined;
  }

  save(record: WorkspaceMailSettingsRecord): MaybePromise<WorkspaceMailSettingsRecord> {
    const normalized = normalizeRecord(record);
    if (this.prismaClient) {
      const create = toWriteInput(normalized);
      const { createdAt: _createdAt, tenantId: _tenantId, ...update } = create;
      return Promise.resolve(this.prismaClient.workspaceMailSettings.upsert({
        create,
        update,
        where: { tenantId: normalized.tenantId }
      })).then(toRecord);
    }
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.settings.some((item) => item.tenantId === normalized.tenantId);
      return {
        settings: exists
          ? current.settings.map((item) => item.tenantId === normalized.tenantId ? normalized : item)
          : [...current.settings, normalized]
      };
    });
    return clone(normalized);
  }
}

function toWriteInput(record: WorkspaceMailSettingsRecord): PrismaWorkspaceMailSettingsWriteInput {
  return {
    createdAt: new Date(record.createdAt),
    enabled: record.enabled,
    encryption: record.encryption,
    fromAddress: record.fromAddress,
    fromName: record.fromName,
    host: record.host,
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
    tenantId: record.tenantId,
    timeoutMs: record.timeoutMs,
    tlsRejectUnauthorized: record.tlsRejectUnauthorized,
    updatedAt: new Date(record.updatedAt),
    username: record.username
  };
}

function toRecord(row: PrismaWorkspaceMailSettingsRow): WorkspaceMailSettingsRecord {
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
    tenantId: row.tenantId,
    timeoutMs: row.timeoutMs,
    tlsRejectUnauthorized: row.tlsRejectUnauthorized,
    updatedAt: row.updatedAt.toISOString(),
    username: row.username
  });
}

function toEncryption(value: string): MailEncryption {
  return value === "none" || value === "ssl" || value === "starttls" ? value : "starttls";
}

function normalizeState(input: Partial<WorkspaceMailSettingsState>): WorkspaceMailSettingsState {
  return { settings: (input.settings ?? []).map(normalizeRecord) };
}

function normalizeRecord(record: WorkspaceMailSettingsRecord): WorkspaceMailSettingsRecord {
  if (!String(record.tenantId ?? "").trim()) throw new Error("workspace_mail_settings_tenant_required");
  if (record.secret && (!record.secret.ciphertext || !record.secret.iv || !record.secret.authTag)) {
    throw new Error("workspace_mail_settings_secret_invalid");
  }
  return {
    ...clone(record),
    encryption: toEncryption(record.encryption),
    fromAddress: String(record.fromAddress).trim(),
    host: String(record.host).trim(),
    keyVersion: record.secret ? String(record.keyVersion ?? record.secret.keyVersion).trim() || null : null,
    tenantId: String(record.tenantId).trim(),
    username: String(record.username ?? "").trim() || null
  };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
