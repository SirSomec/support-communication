import { createPrismaClient } from "@support-communication/database";

export type BotAiFeedbackOutcome = "helped" | "not_helped" | "wrong_source";

export interface BotAiFeedbackRecord {
  actorId: string;
  citationSourceIds: string[];
  comment: string | null;
  conversationId: string;
  createdAt: string;
  feedbackId: string;
  idempotencyKey: string;
  /** Always false — feedback never mutates knowledge without a separate review. */
  knowledgeMutated: false;
  outcome: BotAiFeedbackOutcome;
  /** BAI-852: how a reviewer resolved the item; null until reviewed. */
  resolvedAction?: string | null;
  resolvedAt?: string | null;
  reviewRequired: boolean;
  scenarioId: string | null;
  tenantId: string;
}

export interface BotAiFeedbackFilter {
  conversationId?: string;
  tenantId?: string;
}

type MaybePromise<T> = T | Promise<T>;

export interface BotFeedbackRepositoryPort {
  listFeedback(filter?: BotAiFeedbackFilter): MaybePromise<BotAiFeedbackRecord[]>;
  saveFeedback(record: BotAiFeedbackRecord): MaybePromise<BotAiFeedbackRecord>;
  resolveFeedback?(tenantId: string, feedbackId: string, action: string): MaybePromise<BotAiFeedbackRecord | undefined>;
}

export interface PrismaBotAiFeedbackRow {
  actorId: string;
  citationSourceIds: unknown;
  comment: string | null;
  conversationId: string;
  createdAt: Date;
  feedbackId: string;
  idempotencyKey: string;
  outcome: string;
  resolvedAction: string | null;
  resolvedAt: Date | null;
  reviewRequired: boolean;
  scenarioId: string | null;
  tenantId: string;
}

export interface PrismaBotAiFeedbackCreateInput {
  actorId: string;
  citationSourceIds: string[];
  comment: string | null;
  conversationId: string;
  createdAt: Date;
  feedbackId: string;
  idempotencyKey: string;
  outcome: string;
  resolvedAction: string | null;
  resolvedAt: Date | null;
  reviewRequired: boolean;
  scenarioId: string | null;
  tenantId: string;
}

export interface BotFeedbackPrismaClient {
  botAiFeedback: {
    create(input: { data: PrismaBotAiFeedbackCreateInput }): MaybePromise<PrismaBotAiFeedbackRow>;
    findFirst(input: { where: { idempotencyKey?: string; tenantId?: string } }): MaybePromise<PrismaBotAiFeedbackRow | null>;
    findMany(input: { orderBy?: { createdAt: "desc" }; where?: { conversationId?: string; tenantId?: string } }): MaybePromise<PrismaBotAiFeedbackRow[]>;
    findUnique(input: { where: { feedbackId: string } }): MaybePromise<PrismaBotAiFeedbackRow | null>;
    updateMany(input: { data: { resolvedAction: string; resolvedAt: Date; reviewRequired: boolean }; where: { feedbackId: string; tenantId: string } }): MaybePromise<{ count: number }>;
  };
}

const OUTCOMES = new Set<BotAiFeedbackOutcome>(["helped", "not_helped", "wrong_source"]);

export function isBotAiFeedbackOutcome(value: unknown): value is BotAiFeedbackOutcome {
  return typeof value === "string" && OUTCOMES.has(value as BotAiFeedbackOutcome);
}

export class BotFeedbackRepository implements BotFeedbackRepositoryPort {
  private static defaultInstance: BotFeedbackRepository | null = null;

  private constructor(
    private records: BotAiFeedbackRecord[],
    private readonly prismaClient?: BotFeedbackPrismaClient
  ) {}

  static default(): BotFeedbackRepository {
    if (!BotFeedbackRepository.defaultInstance) {
      // Prisma-only рантайм (план 2026-07-15): дефолтный репозиторий всегда
      // персистится в Postgres; json-ветка выпилена вместе с JsonFileStore.
      BotFeedbackRepository.defaultInstance = BotFeedbackRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as BotFeedbackPrismaClient });
    }
    return BotFeedbackRepository.defaultInstance;
  }

  static useDefault(repository: BotFeedbackRepository): void {
    BotFeedbackRepository.defaultInstance = repository;
  }

  static clearDefault(): void {
    BotFeedbackRepository.defaultInstance = null;
  }

  static inMemory(seed: BotAiFeedbackRecord[] = []): BotFeedbackRepository {
    return new BotFeedbackRepository(seed.map(normalizeFeedback));
  }

  static prisma({ client }: { client: BotFeedbackPrismaClient }): BotFeedbackRepository {
    return new BotFeedbackRepository([], client);
  }

  listFeedback(filter: BotAiFeedbackFilter = {}): MaybePromise<BotAiFeedbackRecord[]> {
    const tenantId = filter.tenantId?.trim();
    const conversationId = filter.conversationId?.trim();
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.botAiFeedback.findMany({
        orderBy: { createdAt: "desc" },
        where: { ...(tenantId ? { tenantId } : {}), ...(conversationId ? { conversationId } : {}) }
      })).then((rows) => rows.map(fromRow));
    }
    return this.records
      .filter((item) => (!tenantId || item.tenantId === tenantId) && (!conversationId || item.conversationId === conversationId))
      .map(clone);
  }

  saveFeedback(record: BotAiFeedbackRecord): MaybePromise<BotAiFeedbackRecord> {
    const persisted = normalizeFeedback(record);
    if (this.prismaClient) {
      return this.savePrismaFeedback(persisted);
    }
    const existing = this.records.find(
      (item) => item.tenantId === persisted.tenantId && item.idempotencyKey === persisted.idempotencyKey
    );
    if (existing) {
      return clone(existing);
    }
    this.records = [persisted, ...this.records];
    return clone(persisted);
  }

  resolveFeedback(tenantId: string, feedbackId: string, action: string): MaybePromise<BotAiFeedbackRecord | undefined> {
    const tenant = String(tenantId ?? "").trim();
    const id = String(feedbackId ?? "").trim();
    if (this.prismaClient) {
      return this.resolvePrismaFeedback(tenant, id, action);
    }
    let resolved: BotAiFeedbackRecord | undefined;
    this.records = this.records.map((item) => {
      if (item.tenantId !== tenant || item.feedbackId !== id) return item;
      resolved = { ...item, resolvedAction: String(action ?? "reviewed").trim().slice(0, 80) || "reviewed", resolvedAt: new Date().toISOString(), reviewRequired: false };
      return resolved;
    });
    return resolved ? clone(resolved) : undefined;
  }

  private async savePrismaFeedback(persisted: BotAiFeedbackRecord): Promise<BotAiFeedbackRecord> {
    const existing = await this.prismaClient!.botAiFeedback.findFirst({
      where: { idempotencyKey: persisted.idempotencyKey, tenantId: persisted.tenantId }
    });
    if (existing) return fromRow(existing);
    const row = await this.prismaClient!.botAiFeedback.create({ data: toCreateInput(persisted) });
    return fromRow(row);
  }

  private async resolvePrismaFeedback(tenant: string, id: string, action: string): Promise<BotAiFeedbackRecord | undefined> {
    const result = await this.prismaClient!.botAiFeedback.updateMany({
      data: { resolvedAction: String(action ?? "reviewed").trim().slice(0, 80) || "reviewed", resolvedAt: new Date(), reviewRequired: false },
      where: { feedbackId: id, tenantId: tenant }
    });
    if (!result.count) return undefined;
    const row = await this.prismaClient!.botAiFeedback.findUnique({ where: { feedbackId: id } });
    return row ? fromRow(row) : undefined;
  }
}

function toCreateInput(record: BotAiFeedbackRecord): PrismaBotAiFeedbackCreateInput {
  return {
    actorId: record.actorId,
    citationSourceIds: record.citationSourceIds,
    comment: record.comment,
    conversationId: record.conversationId,
    createdAt: new Date(record.createdAt),
    feedbackId: record.feedbackId,
    idempotencyKey: record.idempotencyKey,
    outcome: record.outcome,
    resolvedAction: record.resolvedAction ?? null,
    resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : null,
    reviewRequired: record.reviewRequired,
    scenarioId: record.scenarioId,
    tenantId: record.tenantId
  };
}

function fromRow(row: PrismaBotAiFeedbackRow): BotAiFeedbackRecord {
  return normalizeFeedback({
    actorId: row.actorId,
    citationSourceIds: Array.isArray(row.citationSourceIds) ? row.citationSourceIds as string[] : [],
    comment: row.comment,
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
    feedbackId: row.feedbackId,
    idempotencyKey: row.idempotencyKey,
    knowledgeMutated: false,
    outcome: row.outcome as BotAiFeedbackOutcome,
    resolvedAction: row.resolvedAction,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    reviewRequired: row.reviewRequired,
    scenarioId: row.scenarioId,
    tenantId: row.tenantId
  });
}

function normalizeFeedback(record: BotAiFeedbackRecord): BotAiFeedbackRecord {
  return {
    actorId: String(record.actorId ?? "").trim(),
    citationSourceIds: Array.isArray(record.citationSourceIds)
      ? record.citationSourceIds.map((id) => String(id ?? "").trim()).filter(Boolean)
      : [],
    comment: record.comment == null ? null : String(record.comment).trim() || null,
    conversationId: String(record.conversationId ?? "").trim(),
    createdAt: String(record.createdAt ?? new Date().toISOString()),
    feedbackId: String(record.feedbackId ?? "").trim(),
    idempotencyKey: String(record.idempotencyKey ?? "").trim(),
    knowledgeMutated: false,
    outcome: isBotAiFeedbackOutcome(record.outcome) ? record.outcome : "not_helped",
    resolvedAction: record.resolvedAction == null ? null : String(record.resolvedAction).trim() || null,
    resolvedAt: record.resolvedAt == null ? null : String(record.resolvedAt).trim() || null,
    reviewRequired: record.resolvedAt ? false : (Boolean(record.reviewRequired) || record.outcome === "wrong_source" || record.outcome === "not_helped"),
    scenarioId: record.scenarioId == null ? null : String(record.scenarioId).trim() || null,
    tenantId: String(record.tenantId ?? "").trim()
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
