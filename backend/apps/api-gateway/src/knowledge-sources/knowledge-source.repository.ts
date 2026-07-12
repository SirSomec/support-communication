import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import {
  deriveKnowledgeSourceReadiness,
  knowledgeSourceApprovalStatuses,
  knowledgeSourceKinds,
  knowledgeSourceStatuses,
  type KnowledgeSourceRecord
} from "./knowledge-source.types.js";

export interface KnowledgeSourcesState {
  ingestionJobs: KnowledgeDocumentIngestionJob[];
  sources: KnowledgeSourceRecord[];
}

export interface KnowledgeDocumentIngestionJob {
  attempts: number;
  createdAt: string;
  errorCode: string | null;
  fileId: string;
  fingerprint: string;
  idempotencyKey: string;
  jobId: string;
  sourceId: string;
  status: "completed" | "failed" | "pending" | "processing";
  tenantId: string;
  updatedAt: string;
}

let defaultRepository: KnowledgeSourceRepository | null = null;

/**
 * Tenant-scoped persistence for the source catalogue.  Transport, ingestion
 * and retrieval deliberately remain outside this repository.
 */
export class KnowledgeSourceRepository {
  constructor(private readonly store: DurableStore<KnowledgeSourcesState>) {}

  static default(): KnowledgeSourceRepository {
    if (!defaultRepository) {
      defaultRepository = KnowledgeSourceRepository.open(
        process.env.KNOWLEDGE_SOURCES_STORE_FILE ?? ".runtime/knowledge-sources.json"
      );
    }
    return defaultRepository;
  }

  static clearDefault(): void { defaultRepository = null; }

  static inMemory(seed: KnowledgeSourcesState = { ingestionJobs: [], sources: [] }): KnowledgeSourceRepository {
    return new KnowledgeSourceRepository(new InMemoryStore(normalizeState(seed)));
  }

  static open(filePath: string): KnowledgeSourceRepository {
    return new KnowledgeSourceRepository(new JsonFileStore({ filePath, seed: { ingestionJobs: [], sources: [] } }));
  }

  static useDefault(repository: KnowledgeSourceRepository): void { defaultRepository = repository; }

  list(tenantId: string): KnowledgeSourceRecord[] {
    const tenant = requiredIdentifier(tenantId, "knowledge_source_tenant_required");
    return clone(this.store.read().sources.filter((source) => source.tenantId === tenant));
  }

  /** Internal worker read model. Callers must keep each subsequent mutation tenant-scoped. */
  listAll(): KnowledgeSourceRecord[] { return clone(this.store.read().sources); }

  find(tenantId: string, id: string): KnowledgeSourceRecord | undefined {
    const tenant = requiredIdentifier(tenantId, "knowledge_source_tenant_required");
    const sourceId = requiredIdentifier(id, "knowledge_source_identity_required");
    const source = this.store.read().sources.find((item) => item.tenantId === tenant && item.id === sourceId);
    return source ? clone(source) : undefined;
  }

  save(record: KnowledgeSourceRecord): KnowledgeSourceRecord {
    const normalized = normalizeRecord(record);
    this.store.update((state) => {
      const current = normalizeState(state);
      const exists = current.sources.some((item) => item.tenantId === normalized.tenantId && item.id === normalized.id);
      return { ...current,
        sources: exists
          ? current.sources.map((item) => item.tenantId === normalized.tenantId && item.id === normalized.id ? normalized : item)
          : [...current.sources, normalized]
      };
    });
    return clone(normalized);
  }

  findIngestionJob(tenantId: string, idempotencyKey: string): KnowledgeDocumentIngestionJob | undefined {
    const job = this.store.read().ingestionJobs.find((item) => item.tenantId === requiredIdentifier(tenantId, "knowledge_source_tenant_required") && item.idempotencyKey === requiredIdentifier(idempotencyKey, "knowledge_ingestion_key_required"));
    return job ? clone(job) : undefined;
  }

  claimNextIngestionJob(): KnowledgeDocumentIngestionJob | undefined {
    let claimed: KnowledgeDocumentIngestionJob | undefined;
    this.store.update((state) => {
      const current = normalizeState(state); const job = current.ingestionJobs.find((item) => item.status === "pending");
      if (!job) return current;
      claimed = { ...job, attempts: job.attempts + 1, status: "processing", updatedAt: new Date().toISOString() };
      return { ...current, ingestionJobs: current.ingestionJobs.map((item) => item.jobId === job.jobId ? claimed! : item) };
    });
    return claimed ? clone(claimed) : undefined;
  }

  saveIngestionJob(job: KnowledgeDocumentIngestionJob): KnowledgeDocumentIngestionJob {
    const normalized = normalizeJob(job); let saved = normalized;
    this.store.update((state) => {
      const current = normalizeState(state); const existing = current.ingestionJobs.find((item) => item.tenantId === normalized.tenantId && item.idempotencyKey === normalized.idempotencyKey);
      if (existing) { saved = existing; return current; }
      return { ...current, ingestionJobs: [...current.ingestionJobs, normalized] };
    });
    return clone(saved);
  }

  completeIngestionJob(jobId: string, status: "completed" | "failed", errorCode: string | null = null): KnowledgeDocumentIngestionJob | undefined {
    let saved: KnowledgeDocumentIngestionJob | undefined;
    this.store.update((state) => {
      const current = normalizeState(state);
      return { ...current, ingestionJobs: current.ingestionJobs.map((item) => {
        if (item.jobId !== jobId) return item;
        saved = { ...item, errorCode, status, updatedAt: new Date().toISOString() }; return saved;
      }) };
    });
    return saved ? clone(saved) : undefined;
  }
}

function normalizeState(input: Partial<KnowledgeSourcesState>): KnowledgeSourcesState {
  return { ingestionJobs: (input.ingestionJobs ?? []).map(normalizeJob), sources: (input.sources ?? []).map(normalizeRecord) };
}

function normalizeJob(job: KnowledgeDocumentIngestionJob): KnowledgeDocumentIngestionJob {
  const status = ["completed", "failed", "pending", "processing"].includes(job.status) ? job.status : "failed";
  return { ...clone(job), attempts: Math.max(0, Number(job.attempts) || 0), errorCode: nullableTrim(job.errorCode), fileId: requiredIdentifier(job.fileId, "knowledge_ingestion_file_required"), fingerprint: requiredIdentifier(job.fingerprint, "knowledge_ingestion_fingerprint_required"), idempotencyKey: requiredIdentifier(job.idempotencyKey, "knowledge_ingestion_key_required"), jobId: requiredIdentifier(job.jobId, "knowledge_ingestion_job_required"), sourceId: requiredIdentifier(job.sourceId, "knowledge_source_identity_required"), status, tenantId: requiredIdentifier(job.tenantId, "knowledge_source_tenant_required") };
}

function normalizeRecord(record: KnowledgeSourceRecord): KnowledgeSourceRecord {
  const tenantId = requiredIdentifier(record.tenantId, "knowledge_source_tenant_required");
  const id = requiredIdentifier(record.id, "knowledge_source_identity_required");
  const kind = validValue(record.kind, knowledgeSourceKinds, "knowledge_source_kind_invalid");
  const status = validValue(record.status, knowledgeSourceStatuses, "knowledge_source_status_invalid");
  const approvalStatus = validValue(record.approvalStatus, knowledgeSourceApprovalStatuses, "knowledge_source_approval_status_invalid");

  return {
    ...clone(record),
    approvalStatus,
    id,
    kind,
    metadata: toRecord(record.metadata),
    owner: String(record.owner ?? "").trim(),
    readiness: deriveKnowledgeSourceReadiness(status, approvalStatus),
    sourceConfig: toRecord(record.sourceConfig),
    sourceRef: nullableTrim(record.sourceRef),
    status,
    tenantId,
    title: String(record.title ?? "").trim(),
    version: positiveInteger(record.version)
  };
}

function requiredIdentifier(value: unknown, message: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

function validValue<T extends readonly string[]>(value: unknown, allowed: T, message: string): T[number] {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T[number];
  throw new Error(message);
}

function nullableTrim(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? clone(value as Record<string, unknown>) : {};
}

function positiveInteger(value: unknown): number {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : 1;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
