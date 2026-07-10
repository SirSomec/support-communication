import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import { isLocalRuntime } from "../runtime/local-runtime.js";
import { bootstrapQualityState } from "./seed.js";

export type QualityRatingScale = "CSAT" | "CSI" | "QA";

export interface QualityRatingRecord {
  auditId: string;
  channel: string;
  clientId: string | null;
  conversationId: string;
  createdAt: string;
  operator: string;
  ratingId: string;
  realtimeEventId: string;
  scale: QualityRatingScale;
  score: number | null;
  tenantId: string;
  topic: string | null;
}

export interface QualityRatingFilter {
  conversationId?: string;
  tenantId?: string;
}

export interface ManualQaReviewRecord {
  auditId: string;
  conversationId: string;
  createdAt: string;
  criteria: Record<string, number>;
  overrideReason: string | null;
  reviewId: string;
  reviewer: string;
  score: number | null;
  tenantId: string;
}

export interface ManualQaReviewFilter {
  conversationId?: string;
  tenantId?: string;
}

export type AiScoringAuditStatus = "failed" | "ok";

export interface AiScoringAuditRecord {
  auditId: string;
  conversationId: string;
  createdAt: string;
  providerId: string;
  providerResultId: string | null;
  queue: string;
  score: number | null;
  status: AiScoringAuditStatus;
  tenantId: string;
  traceId: string;
}

export interface AiScoringAuditFilter {
  conversationId?: string;
  tenantId?: string;
}

export interface QualityWorkspaceSnapshot {
  aiCoachingQueue: Array<Record<string, unknown>>;
  aiEffectivenessMetrics: Array<Record<string, unknown>>;
  aiRealtimeChecks: Array<Record<string, unknown>>;
  aiSuggestions: Array<Record<string, unknown>>;
  knowledgeArticles: Array<Record<string, unknown>>;
  qualityMetrics: Array<Record<string, unknown>>;
}

export interface QualityState {
  aiScoringAudits: AiScoringAuditRecord[];
  manualQaReviews: ManualQaReviewRecord[];
  ratings: QualityRatingRecord[];
  workspace: QualityWorkspaceSnapshot;
}

export interface QualityRepositoryOptions {
  filePath: string;
}

export interface PrismaQualityRepositoryOptions {
  client: PrismaQualityClient;
  fallback?: QualityRepository;
}

export interface PrismaQualityClient {
  aiScoringAudit: {
    create(input: { data: PrismaAiScoringAuditCreateInput }): Promise<PrismaAiScoringAuditRow>;
    findMany(input: PrismaAiScoringAuditFindManyInput): Promise<PrismaAiScoringAuditRow[]>;
    findUnique(input: PrismaAiScoringAuditFindUniqueInput): Promise<PrismaAiScoringAuditRow | null>;
  };
  manualQaReview: {
    create(input: { data: PrismaManualQaReviewCreateInput }): Promise<PrismaManualQaReviewRow>;
    findMany(input: PrismaManualQaReviewFindManyInput): Promise<PrismaManualQaReviewRow[]>;
    findUnique(input: PrismaManualQaReviewFindUniqueInput): Promise<PrismaManualQaReviewRow | null>;
  };
  qualityRating: {
    create(input: { data: PrismaQualityRatingCreateInput }): Promise<PrismaQualityRatingRow>;
    findMany(input: PrismaQualityRatingFindManyInput): Promise<PrismaQualityRatingRow[]>;
    findUnique(input: PrismaQualityRatingFindUniqueInput): Promise<PrismaQualityRatingRow | null>;
  };
}

interface PrismaAiScoringAuditCreateInput {
  auditId: string;
  conversationId: string;
  createdAt: Date;
  providerId: string;
  providerResultId: string | null;
  queue: string;
  score: number | null;
  status: AiScoringAuditStatus;
  tenantId: string;
  traceId: string;
}

interface PrismaAiScoringAuditFindManyInput {
  orderBy: { createdAt: "desc" };
  where: {
    conversationId?: string;
    tenantId: string;
  };
}

interface PrismaAiScoringAuditFindUniqueInput {
  where: {
    tenantId_auditId: {
      auditId: string;
      tenantId: string;
    };
  };
}

interface PrismaAiScoringAuditRow extends PrismaAiScoringAuditCreateInput {}

interface PrismaManualQaReviewCreateInput {
  auditId: string;
  conversationId: string;
  createdAt: Date;
  criteria: Record<string, number>;
  overrideReason: string | null;
  reviewId: string;
  reviewer: string;
  score: number | null;
  tenantId: string;
}

interface PrismaManualQaReviewFindManyInput {
  orderBy: { createdAt: "desc" };
  where: {
    conversationId?: string;
    tenantId: string;
  };
}

interface PrismaManualQaReviewFindUniqueInput {
  where: {
    tenantId_reviewId: {
      reviewId: string;
      tenantId: string;
    };
  };
}

interface PrismaManualQaReviewRow extends PrismaManualQaReviewCreateInput {}

interface PrismaQualityRatingCreateInput {
  auditId: string;
  channel: string;
  clientId: string | null;
  conversationId: string;
  createdAt: Date;
  operator: string;
  ratingId: string;
  realtimeEventId: string;
  scale: QualityRatingScale;
  score: number | null;
  tenantId: string;
  topic: string | null;
}

interface PrismaQualityRatingFindManyInput {
  orderBy: { createdAt: "desc" };
  where: {
    conversationId?: string;
    tenantId: string;
  };
}

interface PrismaQualityRatingFindUniqueInput {
  where: {
    tenantId_ratingId: {
      ratingId: string;
      tenantId: string;
    };
  };
}

interface PrismaQualityRatingRow extends PrismaQualityRatingCreateInput {}

let defaultQualityRepository: QualityRepository | null = null;

export class QualityRepository {
  private constructor(private readonly store: DurableStore<QualityState>) {}

  static default(): QualityRepository {
    if (defaultQualityRepository) {
      return defaultQualityRepository;
    }

    if (isLocalRuntime()) {
      return QualityRepository.inMemory(bootstrapQualityState());
    }

    return QualityRepository.inMemory();
  }

  static useDefault(repository: QualityRepository): void {
    defaultQualityRepository = repository;
  }

  static clearDefault(): void {
    defaultQualityRepository = null;
  }

  static inMemory(seed: QualityState = seedQualityState()): QualityRepository {
    return new QualityRepository(new InMemoryStore(normalizeState(seed)));
  }

  static open({ filePath }: QualityRepositoryOptions): QualityRepository {
    return new QualityRepository(new JsonFileStore({ filePath, seed: seedQualityState() }));
  }

  static prisma({ client, fallback }: PrismaQualityRepositoryOptions): PrismaQualityRepository {
    return new PrismaQualityRepository(client, fallback ?? QualityRepository.inMemory());
  }

  readState(): QualityState {
    return clone(normalizeState(this.store.read()));
  }

  readWorkspace(): QualityWorkspaceSnapshot {
    return clone(this.readState().workspace);
  }

  listQualityRatings(filter: QualityRatingFilter = {}): QualityRatingRecord[] {
    if (!hasTenantScope(filter)) {
      return [];
    }

    return clone(this.readState().ratings.filter((rating) =>
      rating.tenantId === filter.tenantId
        && (!filter.conversationId || rating.conversationId === filter.conversationId)
    ));
  }

  listManualQaReviews(filter: ManualQaReviewFilter = {}): ManualQaReviewRecord[] {
    if (!hasTenantScope(filter)) {
      return [];
    }

    return clone(this.readState().manualQaReviews.filter((review) =>
      review.tenantId === filter.tenantId
        && (!filter.conversationId || review.conversationId === filter.conversationId)
    ));
  }

  listAiScoringAudits(filter: AiScoringAuditFilter = {}): AiScoringAuditRecord[] {
    if (!hasTenantScope(filter)) {
      return [];
    }

    return clone(this.readState().aiScoringAudits.filter((audit) =>
      audit.tenantId === filter.tenantId
        && (!filter.conversationId || audit.conversationId === filter.conversationId)
    ));
  }

  saveQualityRating(record: QualityRatingRecord): QualityRatingRecord {
    const persisted = normalizeQualityRating(record);
    let saved = persisted;

    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.ratings.find((rating) =>
        rating.tenantId === persisted.tenantId && rating.ratingId === persisted.ratingId
      );

      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        ratings: [...current.ratings, persisted]
      };
    });

    return clone(saved);
  }

  saveManualQaReview(record: ManualQaReviewRecord): ManualQaReviewRecord {
    const persisted = normalizeManualQaReview(record);
    let saved = persisted;

    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.manualQaReviews.find((review) =>
        review.tenantId === persisted.tenantId && review.reviewId === persisted.reviewId
      );

      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        manualQaReviews: [...current.manualQaReviews, persisted]
      };
    });

    return clone(saved);
  }

  saveAiScoringAudit(record: AiScoringAuditRecord): AiScoringAuditRecord {
    const persisted = normalizeAiScoringAudit(record);
    let saved = persisted;

    this.store.update((state) => {
      const current = normalizeState(state);
      const existing = current.aiScoringAudits.find((audit) =>
        audit.tenantId === persisted.tenantId && audit.auditId === persisted.auditId
      );

      if (existing) {
        saved = existing;
        return current;
      }

      return {
        ...current,
        aiScoringAudits: [...current.aiScoringAudits, persisted]
      };
    });

    return clone(saved);
  }
}

export class PrismaQualityRepository {
  constructor(private readonly client: PrismaQualityClient, private readonly fallback: QualityRepository) {}

  readState(): QualityState {
    return this.fallback.readState();
  }

  async listQualityRatings(filter: QualityRatingFilter = {}): Promise<QualityRatingRecord[]> {
    if (!hasTenantScope(filter)) {
      return [];
    }

    const rows = await this.client.qualityRating.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
        tenantId: filter.tenantId
      }
    });

    return rows.map(toQualityRatingRecord);
  }

  async listManualQaReviews(filter: ManualQaReviewFilter = {}): Promise<ManualQaReviewRecord[]> {
    if (!hasTenantScope(filter)) {
      return [];
    }

    const rows = await this.client.manualQaReview.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
        tenantId: filter.tenantId
      }
    });

    return rows.map(toManualQaReviewRecord);
  }

  async listAiScoringAudits(filter: AiScoringAuditFilter = {}): Promise<AiScoringAuditRecord[]> {
    if (!hasTenantScope(filter)) {
      return [];
    }

    const rows = await this.client.aiScoringAudit.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        ...(filter.conversationId ? { conversationId: filter.conversationId } : {}),
        tenantId: filter.tenantId
      }
    });

    return rows.map(toAiScoringAuditRecord);
  }

  async saveQualityRating(record: QualityRatingRecord): Promise<QualityRatingRecord> {
    const persisted = normalizeQualityRating(record);
    const existing = await this.client.qualityRating.findUnique({
      where: {
        tenantId_ratingId: {
          ratingId: persisted.ratingId,
          tenantId: persisted.tenantId
        }
      }
    });

    if (existing) {
      const saved = toQualityRatingRecord(existing);
      this.fallback.saveQualityRating(saved);
      return clone(saved);
    }

    const row = await this.client.qualityRating.create({
      data: toPrismaQualityRatingCreateInput(persisted)
    });
    const saved = toQualityRatingRecord(row);
    this.fallback.saveQualityRating(saved);

    return clone(saved);
  }

  async saveManualQaReview(record: ManualQaReviewRecord): Promise<ManualQaReviewRecord> {
    const persisted = normalizeManualQaReview(record);
    const existing = await this.client.manualQaReview.findUnique({
      where: {
        tenantId_reviewId: {
          reviewId: persisted.reviewId,
          tenantId: persisted.tenantId
        }
      }
    });

    if (existing) {
      const saved = toManualQaReviewRecord(existing);
      this.fallback.saveManualQaReview(saved);
      return clone(saved);
    }

    const row = await this.client.manualQaReview.create({
      data: toPrismaManualQaReviewCreateInput(persisted)
    });
    const saved = toManualQaReviewRecord(row);
    this.fallback.saveManualQaReview(saved);

    return clone(saved);
  }

  async saveAiScoringAudit(record: AiScoringAuditRecord): Promise<AiScoringAuditRecord> {
    const persisted = normalizeAiScoringAudit(record);
    const existing = await this.client.aiScoringAudit.findUnique({
      where: {
        tenantId_auditId: {
          auditId: persisted.auditId,
          tenantId: persisted.tenantId
        }
      }
    });

    if (existing) {
      const saved = toAiScoringAuditRecord(existing);
      this.fallback.saveAiScoringAudit(saved);
      return clone(saved);
    }

    const row = await this.client.aiScoringAudit.create({
      data: toPrismaAiScoringAuditCreateInput(persisted)
    });
    const saved = toAiScoringAuditRecord(row);
    this.fallback.saveAiScoringAudit(saved);

    return clone(saved);
  }
}

function emptyQualityWorkspace(): QualityWorkspaceSnapshot {
  return {
    aiCoachingQueue: [],
    aiEffectivenessMetrics: [],
    aiRealtimeChecks: [],
    aiSuggestions: [],
    knowledgeArticles: [],
    qualityMetrics: []
  };
}

function seedQualityState(): QualityState {
  return {
    aiScoringAudits: [],
    manualQaReviews: [],
    ratings: [],
    workspace: emptyQualityWorkspace()
  };
}

function normalizeState(state: Partial<QualityState>): QualityState {
  return {
    aiScoringAudits: (state.aiScoringAudits ?? []).map(normalizeAiScoringAudit),
    manualQaReviews: (state.manualQaReviews ?? []).map(normalizeManualQaReview),
    ratings: (state.ratings ?? []).map(normalizeQualityRating),
    workspace: state.workspace ?? emptyQualityWorkspace()
  };
}

function toPrismaQualityRatingCreateInput(record: QualityRatingRecord): PrismaQualityRatingCreateInput {
  const persisted = normalizeQualityRating(record);

  return {
    auditId: persisted.auditId,
    channel: persisted.channel,
    clientId: persisted.clientId,
    conversationId: persisted.conversationId,
    createdAt: new Date(persisted.createdAt),
    operator: persisted.operator,
    ratingId: persisted.ratingId,
    realtimeEventId: persisted.realtimeEventId,
    scale: persisted.scale,
    score: persisted.score,
    tenantId: persisted.tenantId,
    topic: persisted.topic
  };
}

function toPrismaManualQaReviewCreateInput(record: ManualQaReviewRecord): PrismaManualQaReviewCreateInput {
  const persisted = normalizeManualQaReview(record);

  return {
    auditId: persisted.auditId,
    conversationId: persisted.conversationId,
    createdAt: new Date(persisted.createdAt),
    criteria: clone(persisted.criteria),
    overrideReason: persisted.overrideReason,
    reviewId: persisted.reviewId,
    reviewer: persisted.reviewer,
    score: persisted.score,
    tenantId: persisted.tenantId
  };
}

function toPrismaAiScoringAuditCreateInput(record: AiScoringAuditRecord): PrismaAiScoringAuditCreateInput {
  const persisted = normalizeAiScoringAudit(record);

  return {
    auditId: persisted.auditId,
    conversationId: persisted.conversationId,
    createdAt: new Date(persisted.createdAt),
    providerId: persisted.providerId,
    providerResultId: persisted.providerResultId,
    queue: persisted.queue,
    score: persisted.score,
    status: persisted.status,
    tenantId: persisted.tenantId,
    traceId: persisted.traceId
  };
}

function toQualityRatingRecord(row: PrismaQualityRatingRow): QualityRatingRecord {
  return normalizeQualityRating({
    auditId: row.auditId,
    channel: row.channel,
    clientId: row.clientId,
    conversationId: row.conversationId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    operator: row.operator,
    ratingId: row.ratingId,
    realtimeEventId: row.realtimeEventId,
    scale: row.scale,
    score: row.score,
    tenantId: row.tenantId,
    topic: row.topic
  });
}

function toAiScoringAuditRecord(row: PrismaAiScoringAuditRow): AiScoringAuditRecord {
  return normalizeAiScoringAudit({
    auditId: row.auditId,
    conversationId: row.conversationId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    providerId: row.providerId,
    providerResultId: row.providerResultId,
    queue: row.queue,
    score: row.score,
    status: row.status,
    tenantId: row.tenantId,
    traceId: row.traceId
  });
}

function toManualQaReviewRecord(row: PrismaManualQaReviewRow): ManualQaReviewRecord {
  return normalizeManualQaReview({
    auditId: row.auditId,
    conversationId: row.conversationId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    criteria: row.criteria,
    overrideReason: row.overrideReason,
    reviewId: row.reviewId,
    reviewer: row.reviewer,
    score: row.score,
    tenantId: row.tenantId
  });
}

function normalizeQualityRating(record: QualityRatingRecord): QualityRatingRecord {
  return {
    auditId: requireString(record.auditId),
    channel: requireString(record.channel),
    clientId: nullableString(record.clientId),
    conversationId: requireString(record.conversationId),
    createdAt: requireString(record.createdAt),
    operator: requireString(record.operator),
    ratingId: requireString(record.ratingId),
    realtimeEventId: requireString(record.realtimeEventId),
    scale: normalizeRatingScale(record.scale),
    score: normalizeNullableScore(record.score),
    tenantId: requireString(record.tenantId),
    topic: nullableString(record.topic)
  };
}

function normalizeManualQaReview(record: ManualQaReviewRecord): ManualQaReviewRecord {
  return {
    auditId: requireString(record.auditId),
    conversationId: requireString(record.conversationId),
    createdAt: requireString(record.createdAt),
    criteria: normalizeCriteria(record.criteria),
    overrideReason: nullableString(record.overrideReason),
    reviewId: requireString(record.reviewId),
    reviewer: requireString(record.reviewer),
    score: normalizeNullableScore(record.score),
    tenantId: requireString(record.tenantId)
  };
}

function normalizeAiScoringAudit(record: AiScoringAuditRecord): AiScoringAuditRecord {
  return {
    auditId: requireString(record.auditId),
    conversationId: requireString(record.conversationId),
    createdAt: requireString(record.createdAt),
    providerId: requireString(record.providerId),
    providerResultId: nullableString(record.providerResultId),
    queue: requireString(record.queue),
    score: normalizeNullableScore(record.score),
    status: record.status === "failed" ? "failed" : "ok",
    tenantId: requireString(record.tenantId),
    traceId: requireString(record.traceId)
  };
}

function hasTenantScope<T extends { tenantId?: string }>(filter: T): filter is T & { tenantId: string } {
  return typeof filter.tenantId === "string" && filter.tenantId.trim().length > 0;
}

function normalizeCriteria(criteria: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(criteria)
      .filter(([key, value]) => key.trim() && typeof value === "number" && Number.isFinite(value))
      .map(([key, value]) => [key.trim(), value])
  );
}

function normalizeRatingScale(scale: string): QualityRatingScale {
  return scale === "CSI" || scale === "QA" ? scale : "CSAT";
}

function normalizeNullableScore(score: number | null): number | null {
  return typeof score === "number" && Number.isFinite(score) ? score : null;
}

function requireString(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("quality_rating_required_string");
  }

  return trimmed;
}

function nullableString(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
