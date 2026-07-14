import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import type { SecretEnvelope } from "./secret-store.js";

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

let defaultRepository: AiConnectionRepository | null = null;

export class AiConnectionRepository {
  constructor(private readonly store: DurableStore<AiConnectionsState>) {}

  static default(): AiConnectionRepository {
    if (!defaultRepository) {
      defaultRepository = AiConnectionRepository.open(process.env.AI_CONNECTIONS_STORE_FILE ?? ".runtime/ai-connections.json");
    }
    return defaultRepository;
  }

  static clearDefault(): void { defaultRepository = null; }
  static inMemory(seed: AiConnectionsState = { connections: [] }): AiConnectionRepository {
    return new AiConnectionRepository(new InMemoryStore(normalizeState(seed)));
  }
  static open(filePath: string): AiConnectionRepository {
    return new AiConnectionRepository(new JsonFileStore({ filePath, seed: { connections: [] } }));
  }
  static useDefault(repository: AiConnectionRepository): void { defaultRepository = repository; }

  list(tenantId: string): AiConnectionRecord[] {
    return clone(this.store.read().connections.filter((connection) => connection.tenantId === tenantId));
  }

  find(tenantId: string, id: string): AiConnectionRecord | undefined {
    const connection = this.store.read().connections.find((item) => item.tenantId === tenantId && item.id === id);
    return connection ? clone(connection) : undefined;
  }

  save(record: AiConnectionRecord): AiConnectionRecord {
    const normalized = normalizeRecord(record);
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

  remove(tenantId: string, id: string): boolean {
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
