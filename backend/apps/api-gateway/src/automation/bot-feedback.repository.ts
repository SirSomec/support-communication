import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const OUTCOMES = new Set<BotAiFeedbackOutcome>(["helped", "not_helped", "wrong_source"]);

export function isBotAiFeedbackOutcome(value: unknown): value is BotAiFeedbackOutcome {
  return typeof value === "string" && OUTCOMES.has(value as BotAiFeedbackOutcome);
}

export class BotFeedbackRepository implements BotFeedbackRepositoryPort {
  private static defaultInstance: BotFeedbackRepository | null = null;

  private constructor(
    private readonly mode: "file" | "memory",
    private readonly filePath: string,
    private records: BotAiFeedbackRecord[]
  ) {}

  static default(): BotFeedbackRepository {
    if (!BotFeedbackRepository.defaultInstance) {
      BotFeedbackRepository.defaultInstance = BotFeedbackRepository.file();
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
    return new BotFeedbackRepository("memory", "", seed.map(normalizeFeedback));
  }

  static file(filePath = defaultFeedbackPath()): BotFeedbackRepository {
    return new BotFeedbackRepository("file", filePath, readFeedbackFile(filePath));
  }

  listFeedback(filter: BotAiFeedbackFilter = {}): BotAiFeedbackRecord[] {
    const tenantId = filter.tenantId?.trim();
    const conversationId = filter.conversationId?.trim();
    return this.records
      .filter((item) => (!tenantId || item.tenantId === tenantId) && (!conversationId || item.conversationId === conversationId))
      .map(clone);
  }

  saveFeedback(record: BotAiFeedbackRecord): BotAiFeedbackRecord {
    const persisted = normalizeFeedback(record);
    const existing = this.records.find(
      (item) => item.tenantId === persisted.tenantId && item.idempotencyKey === persisted.idempotencyKey
    );
    if (existing) {
      return clone(existing);
    }
    this.records = [persisted, ...this.records];
    this.persist();
    return clone(persisted);
  }

  resolveFeedback(tenantId: string, feedbackId: string, action: string): BotAiFeedbackRecord | undefined {
    const tenant = String(tenantId ?? "").trim();
    const id = String(feedbackId ?? "").trim();
    let resolved: BotAiFeedbackRecord | undefined;
    this.records = this.records.map((item) => {
      if (item.tenantId !== tenant || item.feedbackId !== id) return item;
      resolved = { ...item, resolvedAction: String(action ?? "reviewed").trim().slice(0, 80) || "reviewed", resolvedAt: new Date().toISOString(), reviewRequired: false };
      return resolved;
    });
    if (resolved) this.persist();
    return resolved ? clone(resolved) : undefined;
  }

  private persist(): void {
    if (this.mode !== "file") return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, `${JSON.stringify({ feedback: this.records }, null, 2)}\n`, "utf8");
  }
}

function defaultFeedbackPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "..", ".runtime", "bot-ai-feedback.json");
}

function readFeedbackFile(filePath: string): BotAiFeedbackRecord[] {
  if (!existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { feedback?: BotAiFeedbackRecord[] };
    return Array.isArray(parsed.feedback) ? parsed.feedback.map(normalizeFeedback) : [];
  } catch {
    return [];
  }
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
