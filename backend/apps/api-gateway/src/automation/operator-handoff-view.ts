export interface OperatorHandoffCitation {
  sourceId: string;
  title: string;
  version?: number;
}

export interface OperatorHandoffViewInput {
  aiOutcome?: string | null;
  citations?: OperatorHandoffCitation[] | null;
  collectedFields?: Record<string, unknown> | null;
  goal?: string | null;
  phone?: string | null;
  queue?: string | null;
  reason?: string | null;
  scenarioName?: string | null;
  sessionState?: string | null;
  topic?: string | null;
}

export interface OperatorHandoffView {
  aiOutcome: string;
  citations: OperatorHandoffCitation[];
  collectedFields: Array<{ key: string; value: string }>;
  goal: string;
  phone: string;
  queue: string;
  reason: string;
  scenarioName: string;
  sessionState: string;
  title: string;
  topic: string;
}

/** Compact operator-facing handoff card: goal, state, AI outcome, citations, transfer reason. */
export function buildOperatorHandoffView(input: OperatorHandoffViewInput = {}): OperatorHandoffView {
  const citations = Array.isArray(input.citations)
    ? input.citations
      .map((item) => ({
        sourceId: String(item?.sourceId ?? "").trim(),
        title: String(item?.title ?? "").trim(),
        ...(Number.isFinite(Number(item?.version)) ? { version: Number(item.version) } : {})
      }))
      .filter((item) => item.sourceId && item.title)
    : [];

  const collectedFields = Object.entries(input.collectedFields ?? {})
    .map(([key, value]) => ({
      key,
      value: typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value)
    }))
    .filter((item) => item.key && item.value && item.value !== "{}" && item.value !== "null");

  return {
    aiOutcome: String(input.aiOutcome ?? "").trim() || "Передача без AI-ответа",
    citations,
    collectedFields,
    goal: String(input.goal ?? "").trim() || String(input.scenarioName ?? "").trim() || "Сценарий бота",
    phone: String(input.phone ?? "").trim(),
    queue: String(input.queue ?? "").trim() || "default",
    reason: String(input.reason ?? "").trim() || "handoff_requested",
    scenarioName: String(input.scenarioName ?? "").trim() || "Бот",
    sessionState: String(input.sessionState ?? "").trim() || "Контекст диалога передан оператору",
    title: "Handoff summary",
    topic: String(input.topic ?? "").trim()
  };
}
