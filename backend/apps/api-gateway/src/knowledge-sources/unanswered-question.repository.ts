import { randomUUID } from "node:crypto";
import { type DurableStore, InMemoryStore, createPrismaClient } from "@support-communication/database";
import { redactSensitiveText } from "@support-communication/redaction";

type MaybePromise<T> = Promise<T> | T;

export type UnansweredQuestionStatus = "dismissed" | "open" | "resolved";

export interface UnansweredQuestionRecord {
  channel: string | null;
  count: number;
  firstAskedAt: string;
  id: string;
  lastAskedAt: string;
  normalizedKey: string;
  question: string;
  reason: string;
  resolvedArticleId: string | null;
  scenarioId: string | null;
  status: UnansweredQuestionStatus;
  tenantId: string;
}

interface UnansweredQuestionsState {
  questions: UnansweredQuestionRecord[];
}

export interface PrismaUnansweredQuestionRow {
  channel: string | null;
  count: number;
  firstAskedAt: Date;
  id: string;
  lastAskedAt: Date;
  normalizedKey: string;
  question: string;
  reason: string;
  resolvedArticleId: string | null;
  scenarioId: string | null;
  status: string;
  tenantId: string;
}

export interface PrismaUnansweredQuestionCreateInput {
  channel: string | null;
  count: number;
  firstAskedAt: Date;
  id: string;
  lastAskedAt: Date;
  normalizedKey: string;
  question: string;
  reason: string;
  resolvedArticleId: string | null;
  scenarioId: string | null;
  status: string;
  tenantId: string;
}

export interface UnansweredQuestionPrismaClient {
  unansweredQuestion: {
    create(input: { data: PrismaUnansweredQuestionCreateInput }): MaybePromise<PrismaUnansweredQuestionRow>;
    deleteMany(input: { where: { id: { in: string[] } } }): MaybePromise<{ count: number }>;
    findFirst(input: { where: { normalizedKey?: string; status?: string; tenantId?: string } }): MaybePromise<PrismaUnansweredQuestionRow | null>;
    findMany(input: { orderBy?: { lastAskedAt: "asc" | "desc" }; where?: { status?: string; tenantId?: string } }): MaybePromise<PrismaUnansweredQuestionRow[]>;
    update(input: { data: Partial<Omit<PrismaUnansweredQuestionCreateInput, "id">>; where: { id: string } }): MaybePromise<PrismaUnansweredQuestionRow>;
    updateMany(input: { data: { resolvedArticleId: string | null; status: string }; where: { id: string; tenantId: string } }): MaybePromise<{ count: number }>;
  };
}

const MAX_QUESTIONS_PER_TENANT = 300;
const MAX_QUESTION_CHARS = 240;

let defaultRepository: UnansweredQuestionRepository | null = null;

/**
 * BAI-826: очередь «вопросов без ответа» — обращения, на которые бот не смог
 * ответить из-за отсутствия готовых знаний. Текст редактируется от PII и
 * усечён; полная переписка остаётся только в системе диалогов.
 */
export class UnansweredQuestionRepository {
  constructor(
    private readonly store: DurableStore<UnansweredQuestionsState>,
    private readonly prismaClient?: UnansweredQuestionPrismaClient
  ) {}

  static default(): UnansweredQuestionRepository {
    if (!defaultRepository) {
      // Prisma-only рантайм (план 2026-07-15): персистентность всегда в Postgres,
      // json-store выпилен; in-memory остаётся только тестовым бэкендом.
      defaultRepository = UnansweredQuestionRepository.prisma({ client: createPrismaClient({ datasourceUrl: process.env.DATABASE_URL }) as UnansweredQuestionPrismaClient });
    }
    return defaultRepository;
  }

  static clearDefault(): void {
    defaultRepository = null;
  }

  static useDefault(repository: UnansweredQuestionRepository): void {
    defaultRepository = repository;
  }

  static inMemory(seed: UnansweredQuestionsState = { questions: [] }): UnansweredQuestionRepository {
    return new UnansweredQuestionRepository(new InMemoryStore(seed));
  }

  static prisma({ client }: { client: UnansweredQuestionPrismaClient }): UnansweredQuestionRepository {
    return new UnansweredQuestionRepository(new InMemoryStore({ questions: [] }), client);
  }

  list(tenantId: string): MaybePromise<UnansweredQuestionRecord[]> {
    const tenant = String(tenantId ?? "").trim();
    if (this.prismaClient) {
      return Promise.resolve(this.prismaClient.unansweredQuestion.findMany({ orderBy: { lastAskedAt: "desc" }, where: { tenantId: tenant } }))
        .then((rows) => rows.map(fromRow));
    }
    return clone(this.store.read().questions
      .filter((item) => item.tenantId === tenant)
      .sort((left, right) => right.lastAskedAt.localeCompare(left.lastAskedAt)));
  }

  record(input: { channel?: string; question: string; reason: string; scenarioId?: string; tenantId: string }): MaybePromise<UnansweredQuestionRecord | null> {
    const prepared = prepareRecord(input);
    if (!prepared) return null;
    if (this.prismaClient) {
      return this.recordPrisma(prepared, input);
    }
    const now = prepared.now;
    let saved: UnansweredQuestionRecord | null = null;
    this.store.update((state) => {
      const questions = state.questions ?? [];
      const existing = questions.find((item) => item.tenantId === prepared.tenantId && item.normalizedKey === prepared.normalizedKey && item.status === "open");
      if (existing) {
        saved = { ...existing, count: existing.count + 1, lastAskedAt: now, reason: input.reason };
        return { questions: questions.map((item) => item.id === existing.id ? saved! : item) };
      }
      saved = newRecord(prepared, input);
      const tenantQuestions = questions.filter((item) => item.tenantId === prepared.tenantId);
      const overflow = Math.max(0, tenantQuestions.length + 1 - MAX_QUESTIONS_PER_TENANT);
      const dropped = new Set(
        tenantQuestions
          .filter((item) => item.status !== "open")
          .sort((left, right) => left.lastAskedAt.localeCompare(right.lastAskedAt))
          .slice(0, overflow)
          .map((item) => item.id)
      );
      return { questions: [...questions.filter((item) => !dropped.has(item.id)), saved] };
    });
    return saved ? clone(saved) : null;
  }

  setStatus(tenantId: string, questionId: string, status: UnansweredQuestionStatus, resolvedArticleId: string | null = null): MaybePromise<UnansweredQuestionRecord | null> {
    const tenant = String(tenantId ?? "").trim();
    if (this.prismaClient) {
      return this.setStatusPrisma(tenant, questionId, status, resolvedArticleId);
    }
    let saved: UnansweredQuestionRecord | null = null;
    this.store.update((state) => ({
      questions: (state.questions ?? []).map((item) => {
        if (item.tenantId !== tenant || item.id !== questionId) return item;
        saved = { ...item, resolvedArticleId, status };
        return saved;
      })
    }));
    return saved ? clone(saved) : null;
  }

  private async recordPrisma(prepared: PreparedRecord, input: { channel?: string; reason: string; scenarioId?: string }): Promise<UnansweredQuestionRecord | null> {
    const existing = await this.prismaClient!.unansweredQuestion.findFirst({
      where: { normalizedKey: prepared.normalizedKey, status: "open", tenantId: prepared.tenantId }
    });
    if (existing) {
      const updated = await this.prismaClient!.unansweredQuestion.update({
        data: { count: existing.count + 1, lastAskedAt: new Date(prepared.now), reason: input.reason },
        where: { id: existing.id }
      });
      return fromRow(updated);
    }
    const record = newRecord(prepared, input);
    const created = await this.prismaClient!.unansweredQuestion.create({ data: toCreateInput(record) });
    // Вытеснение самых старых НЕ-open вопросов сверх лимита на тенант.
    const tenantRows = await this.prismaClient!.unansweredQuestion.findMany({ orderBy: { lastAskedAt: "asc" }, where: { tenantId: prepared.tenantId } });
    const overflow = Math.max(0, tenantRows.length - MAX_QUESTIONS_PER_TENANT);
    if (overflow > 0) {
      const dropIds = tenantRows.filter((row) => row.status !== "open").slice(0, overflow).map((row) => row.id);
      if (dropIds.length) await this.prismaClient!.unansweredQuestion.deleteMany({ where: { id: { in: dropIds } } });
    }
    return fromRow(created);
  }

  private async setStatusPrisma(tenant: string, questionId: string, status: UnansweredQuestionStatus, resolvedArticleId: string | null): Promise<UnansweredQuestionRecord | null> {
    const result = await this.prismaClient!.unansweredQuestion.updateMany({
      data: { resolvedArticleId, status },
      where: { id: questionId, tenantId: tenant }
    });
    if (!result.count) return null;
    const rows = await this.prismaClient!.unansweredQuestion.findMany({ where: { tenantId: tenant } });
    const row = rows.find((item) => item.id === questionId);
    return row ? fromRow(row) : null;
  }
}

interface PreparedRecord {
  normalizedKey: string;
  now: string;
  question: string;
  tenantId: string;
}

function prepareRecord(input: { question: string; tenantId: string }): PreparedRecord | null {
  const tenantId = String(input.tenantId ?? "").trim();
  const question = redactSensitiveText(String(input.question ?? ""))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/(?:\+?\d[\s().-]*){10,15}/g, "[PHONE]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUESTION_CHARS);
  if (!tenantId || !question) return null;
  const normalizedKey = question.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N} ]/gu, "").trim();
  if (!normalizedKey) return null;
  return { normalizedKey, now: new Date().toISOString(), question, tenantId };
}

function newRecord(prepared: PreparedRecord, input: { channel?: string; reason: string; scenarioId?: string }): UnansweredQuestionRecord {
  return {
    channel: String(input.channel ?? "").trim() || null,
    count: 1,
    firstAskedAt: prepared.now,
    id: `unq_${randomUUID()}`,
    lastAskedAt: prepared.now,
    normalizedKey: prepared.normalizedKey,
    question: prepared.question,
    reason: String(input.reason ?? "knowledge_not_ready"),
    resolvedArticleId: null,
    scenarioId: String(input.scenarioId ?? "").trim() || null,
    status: "open",
    tenantId: prepared.tenantId
  };
}

function toCreateInput(record: UnansweredQuestionRecord): PrismaUnansweredQuestionCreateInput {
  return {
    channel: record.channel,
    count: record.count,
    firstAskedAt: new Date(record.firstAskedAt),
    id: record.id,
    lastAskedAt: new Date(record.lastAskedAt),
    normalizedKey: record.normalizedKey,
    question: record.question,
    reason: record.reason,
    resolvedArticleId: record.resolvedArticleId,
    scenarioId: record.scenarioId,
    status: record.status,
    tenantId: record.tenantId
  };
}

function fromRow(row: PrismaUnansweredQuestionRow): UnansweredQuestionRecord {
  return {
    channel: row.channel,
    count: row.count,
    firstAskedAt: row.firstAskedAt.toISOString(),
    id: row.id,
    lastAskedAt: row.lastAskedAt.toISOString(),
    normalizedKey: row.normalizedKey,
    question: row.question,
    reason: row.reason,
    resolvedArticleId: row.resolvedArticleId,
    scenarioId: row.scenarioId,
    status: (row.status === "dismissed" || row.status === "resolved") ? row.status : "open",
    tenantId: row.tenantId
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
