import { type DurableStore, InMemoryStore, createPrismaClient } from "@support-communication/database";
import type { SecretEnvelope } from "./secret-store.js";

type MaybePromise<T> = Promise<T> | T;

export type AiConnectionCapability = "chat_completion" | "embeddings" | "retrieval";
export type AiConnectionStatus = "disabled" | "error" | "limited" | "ready";

export interface AiConnectionRecord {
  baseUrl: string;
  capabilities: AiConnectionCapability[];
  chatModel: string;
  createdAt: string;
  disabledAt: string | null;
  embeddingModel: string | null;
  id: string;
  keyVersion: string;
  lastTestMessage: string | null;
  lastTestStatus: "failed" | "passed" | null;
  lastTestedAt: string | null;
  limits: { maxConcurrentRuns?: number; monthlyTokenBudget?: number; requestsPerMinute?: number; sandboxMonthlyTokenBudget?: number };
  providerType: "openai_compatible";
  secret: SecretEnvelope;
  status: AiConnectionStatus;
  tenantId: string;
  updatedAt: string;
}

interface AiConnectionsState { connections: AiConnectionRecord[]; }

export interface PrismaAiConnectionRow {
  baseUrl: string;
  capabilities: unknown;
  chatModel: string;
  createdAt: Date;
  disabledAt: Date | null;
  embeddingModel: string | null;
  id: string;
  keyVersion: string | null;
  lastTestMessage: string | null;
  lastTestStatus: string | null;
  lastTestedAt: Date | null;
  limits: unknown;
  providerType: string;
  secretAlgorithm: string | null;
  secretAuthTag: string | null;
  secretCiphertext: string | null;
  secretEnvelopeVersion: number | null;
  secretIv: string | null;
  status: string;
  tenantId: string;
  updatedAt: Date;
}

export interface PrismaAiConnectionCreateInput {
  baseUrl: string;
  capabilities: AiConnectionCapability[];
  chatModel: string;
  createdAt: Date;
  disabledAt: Date | null;
  embeddingModel: string | null;
  id: string;
  keyVersion: string;
  lastTestMessage: string | null;
  lastTestStatus: string | null;
  lastTestedAt: Date | null;
  limits: AiConnectionRecord["limits"];
  providerType: string;
  secretAlgorithm: string;
  secretAuthTag: string;
  secretCiphertext: string;
  secretEnvelopeVersion: number;
  secretIv: string;
  status: string;
  tenantId: string;
  updatedAt: Date;
}

export interface AiConnectionPrismaClient {
  aiConnection: {
    delete(input: { where: { tenantId_id: { id: string; tenantId: string } } }): MaybePromise<PrismaAiConnectionRow>;
    findMany(input: { orderBy?: { createdAt: "asc" }; where?: { tenantId: string } }): MaybePromise<PrismaAiConnectionRow[]>;
    upsert(input: {
      create: PrismaAiConnectionCreateInput;
      update: Omit<PrismaAiConnectionCreateInput, "createdAt" | "id" | "tenantId">;
      where: { tenantId_id: { id: string; tenantId: string } };
    }): MaybePromise<PrismaAiConnectionRow>;
  };
}

let defaultRepository: AiConnectionRepository | null = null;

export class AiConnectionRepository {
  constructor(
    private readonly store: DurableStore<AiConnectionsState>,
    private readonly prismaClient?: AiConnectionPrismaClient
  ) {}

  static default(): AiConnectionRepository {
    if (!defaultRepository) {
      // Prisma-only рантайм (план 2026-07-15): дефолтный репозиторий всегда
      // персистится в Postgres; json-ветка выпилена, файловых сторов больше нет.
      defaultRepository = AiConnectionRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as AiConnectionPrismaClient });
    }
    return defaultRepository;
  }

  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: AiConnectionsState = { connections: [] }): AiConnectionRepository {
    return new AiConnectionRepository(new InMemoryStore(normalizeState(seed)));
  }
  static prisma({ client }: { client: AiConnectionPrismaClient }): AiConnectionRepository {
    return new AiConnectionRepository(new InMemoryStore({ connections: [] }), client);
  }
  static useDefault(repository: AiConnectionRepository): void { defaultRepository = repository; }

  list(tenantId: string): MaybePromise<AiConnectionRecord[]> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.aiConnection.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId } }))
        .then((rows) => rows.map(toRecord));
    }
    return clone(this.store.read().connections.filter((connection) => connection.tenantId === tenantId));
  }

  find(tenantId: string, id: string): MaybePromise<AiConnectionRecord | undefined> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.aiConnection.findMany({ orderBy: { createdAt: "asc" }, where: { tenantId } }))
        .then((rows) => {
          const row = rows.find((item) => item.id === id);
          return row ? toRecord(row) : undefined;
        });
    }
    const connection = this.store.read().connections.find((item) => item.tenantId === tenantId && item.id === id);
    return connection ? clone(connection) : undefined;
  }

  save(record: AiConnectionRecord): MaybePromise<AiConnectionRecord> {
    const normalized = normalizeRecord(record);
    if (this.prismaClient) {
      const create = toCreateInput(normalized);
      const { createdAt: _createdAt, id: _id, tenantId: _tenantId, ...update } = create;
      return Promise.resolve(this.prismaClient.aiConnection.upsert({
        create,
        update,
        where: { tenantId_id: { id: normalized.id, tenantId: normalized.tenantId } }
      })).then(toRecord);
    }
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.connections.some((item) => item.tenantId === normalized.tenantId && item.id === normalized.id);
      return {
        connections: exists
          ? current.connections.map((item) => item.tenantId === normalized.tenantId && item.id === normalized.id ? normalized : item)
          : [...current.connections, normalized]
      };
    });
    return clone(normalized);
  }

  remove(tenantId: string, id: string): MaybePromise<boolean> {
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.aiConnection.delete({ where: { tenantId_id: { id, tenantId } } }))
        .then(() => true)
        .catch((error) => {
          if (isPrismaRecordNotFoundError(error)) return false;
          throw error;
        });
    }
    let removed = false;
    this.store.update((state) => {
      const current = normalizeState(state);
      const connections = current.connections.filter((item) => {
        const matches = item.tenantId === tenantId && item.id === id;
        removed ||= matches;
        return !matches;
      });
      return { connections };
    });
    return removed;
  }
}

function isPrismaRecordNotFoundError(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2025";
}

function toCreateInput(record: AiConnectionRecord): PrismaAiConnectionCreateInput {
  return {
    baseUrl: record.baseUrl,
    capabilities: record.capabilities,
    chatModel: record.chatModel,
    createdAt: new Date(record.createdAt),
    disabledAt: record.disabledAt ? new Date(record.disabledAt) : null,
    embeddingModel: record.embeddingModel,
    id: record.id,
    keyVersion: record.keyVersion,
    lastTestMessage: record.lastTestMessage,
    lastTestStatus: record.lastTestStatus,
    lastTestedAt: record.lastTestedAt ? new Date(record.lastTestedAt) : null,
    limits: record.limits,
    providerType: record.providerType,
    secretAlgorithm: record.secret.algorithm,
    secretAuthTag: record.secret.authTag,
    secretCiphertext: record.secret.ciphertext,
    secretEnvelopeVersion: record.secret.envelopeVersion,
    secretIv: record.secret.iv,
    status: record.status,
    tenantId: record.tenantId,
    updatedAt: new Date(record.updatedAt)
  };
}

function toRecord(row: PrismaAiConnectionRow): AiConnectionRecord {
  if (!row.secretCiphertext || !row.secretIv || !row.secretAuthTag) throw new Error("ai_connection_secret_required");
  return normalizeRecord({
    baseUrl: row.baseUrl,
    capabilities: toCapabilities(row.capabilities),
    chatModel: row.chatModel,
    createdAt: row.createdAt.toISOString(),
    disabledAt: row.disabledAt ? row.disabledAt.toISOString() : null,
    embeddingModel: row.embeddingModel,
    id: row.id,
    keyVersion: String(row.keyVersion ?? ""),
    lastTestMessage: row.lastTestMessage,
    lastTestStatus: row.lastTestStatus === "passed" || row.lastTestStatus === "failed" ? row.lastTestStatus : null,
    lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
    limits: toLimits(row.limits),
    providerType: "openai_compatible",
    secret: {
      algorithm: (row.secretAlgorithm ?? "aes-256-gcm") as SecretEnvelope["algorithm"],
      authTag: row.secretAuthTag,
      ciphertext: row.secretCiphertext,
      envelopeVersion: (row.secretEnvelopeVersion ?? 1) as SecretEnvelope["envelopeVersion"],
      iv: row.secretIv,
      keyVersion: String(row.keyVersion ?? "")
    },
    status: toStatus(row.status),
    tenantId: row.tenantId,
    updatedAt: row.updatedAt.toISOString()
  });
}

function toCapabilities(value: unknown): AiConnectionCapability[] {
  return Array.isArray(value)
    ? value.filter((item): item is AiConnectionCapability => ["chat_completion", "embeddings", "retrieval"].includes(String(item)))
    : [];
}

function toLimits(value: unknown): AiConnectionRecord["limits"] {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? { ...(value as AiConnectionRecord["limits"]) } : {};
}

function toStatus(value: string): AiConnectionStatus {
  return value === "ready" || value === "limited" || value === "error" || value === "disabled" ? value : "disabled";
}

function normalizeState(input: Partial<AiConnectionsState>): AiConnectionsState {
  return { connections: (input.connections ?? []).map(normalizeRecord) };
}

function normalizeRecord(record: AiConnectionRecord): AiConnectionRecord {
  if (!String(record.tenantId ?? "").trim() || !String(record.id ?? "").trim()) throw new Error("ai_connection_identity_required");
  if (!record.secret?.ciphertext || !record.secret?.iv || !record.secret?.authTag) throw new Error("ai_connection_secret_required");
  return {
    ...clone(record),
    baseUrl: String(record.baseUrl).replace(/\/+$/, ""),
    capabilities: Array.from(new Set(record.capabilities)).filter((item): item is AiConnectionCapability => ["chat_completion", "embeddings", "retrieval"].includes(item)),
    chatModel: String(record.chatModel).trim(),
    keyVersion: String(record.keyVersion).trim(),
    limits: { ...record.limits },
    tenantId: String(record.tenantId).trim()
  };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
