import { randomUUID } from "node:crypto";
import { type DurableStore, InMemoryStore, JsonFileStore } from "@support-communication/database";
import { redactSensitiveText } from "@support-communication/redaction";

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

const MAX_QUESTIONS_PER_TENANT = 300;
const MAX_QUESTION_CHARS = 240;

let defaultRepository: UnansweredQuestionRepository | null = null;

/**
 * BAI-826: очередь «вопросов без ответа» — обращения, на которые бот не смог
 * ответить из-за отсутствия готовых знаний. Текст редактируется от PII и
 * усечён; полная переписка остаётся только в системе диалогов.
 */
export class UnansweredQuestionRepository {
  constructor(private readonly store: DurableStore<UnansweredQuestionsState>) {}

  static default(): UnansweredQuestionRepository {
    if (!defaultRepository) {
      defaultRepository = new UnansweredQuestionRepository(new JsonFileStore({
        filePath: process.env.UNANSWERED_QUESTIONS_STORE_FILE ?? ".runtime/unanswered-questions.json",
        seed: { questions: [] }
      }));
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

  list(tenantId: string): UnansweredQuestionRecord[] {
    return clone(this.store.read().questions
      .filter((item) => item.tenantId === tenantId)
      .sort((left, right) => right.lastAskedAt.localeCompare(left.lastAskedAt)));
  }

  record(input: { channel?: string; question: string; reason: string; scenarioId?: string; tenantId: string }): UnansweredQuestionRecord | null {
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
    const now = new Date().toISOString();
    let saved: UnansweredQuestionRecord | null = null;
    this.store.update((state) => {
      const questions = state.questions ?? [];
      const existing = questions.find((item) => item.tenantId === tenantId && item.normalizedKey === normalizedKey && item.status === "open");
      if (existing) {
        saved = { ...existing, count: existing.count + 1, lastAskedAt: now, reason: input.reason };
        return { questions: questions.map((item) => item.id === existing.id ? saved! : item) };
      }
      saved = {
        channel: String(input.channel ?? "").trim() || null,
        count: 1,
        firstAskedAt: now,
        id: `unq_${randomUUID()}`,
        lastAskedAt: now,
        normalizedKey,
        question,
        reason: String(input.reason ?? "knowledge_not_ready"),
        resolvedArticleId: null,
        scenarioId: String(input.scenarioId ?? "").trim() || null,
        status: "open",
        tenantId
      };
      const tenantQuestions = questions.filter((item) => item.tenantId === tenantId);
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

  setStatus(tenantId: string, questionId: string, status: UnansweredQuestionStatus, resolvedArticleId: string | null = null): UnansweredQuestionRecord | null {
    let saved: UnansweredQuestionRecord | null = null;
    this.store.update((state) => ({
      questions: (state.questions ?? []).map((item) => {
        if (item.tenantId !== tenantId || item.id !== questionId) return item;
        saved = { ...item, resolvedArticleId, status };
        return saved;
      })
    }));
    return saved ? clone(saved) : null;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
