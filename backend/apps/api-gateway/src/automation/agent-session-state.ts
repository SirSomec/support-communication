import type {
  AgentSessionFact,
  AgentSessionPolicy,
  AgentSessionState,
  AgentSessionTurn,
  AgentSessionUpdateInput,
  AgentSessionUpdateResult
} from "./agent-session-state.types.js";

export const DEFAULT_AGENT_SESSION_POLICY: AgentSessionPolicy = {
  compactionTokenThreshold: 1_200,
  compactionTurnThreshold: 8,
  maxFactChars: 120,
  maxFacts: 12,
  maxRecentTurns: 4,
  maxSummaryChars: 480,
  maxTurnChars: 280,
  ttlMs: 24 * 60 * 60 * 1_000
};

export function estimateSessionTokens(text: string): number {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

export function isSessionExpired(state: AgentSessionState, now = new Date()): boolean {
  return Date.parse(state.expiresAt) <= now.getTime();
}

export function mergeFacts(
  existing: AgentSessionFact[],
  incoming: AgentSessionFact[] | Record<string, string> | undefined,
  policy: AgentSessionPolicy = DEFAULT_AGENT_SESSION_POLICY
): AgentSessionFact[] {
  const map = new Map<string, string>();
  for (const fact of existing) {
    map.set(fact.key, fact.value);
  }
  const pairs = Array.isArray(incoming)
    ? incoming.map((fact) => [fact.key, fact.value] as const)
    : Object.entries(incoming ?? {});
  for (const [key, value] of pairs) {
    const normalizedKey = key.trim().slice(0, 64);
    const normalizedValue = String(value).trim().slice(0, policy.maxFactChars);
    if (!normalizedKey || !normalizedValue) continue;
    map.set(normalizedKey, normalizedValue);
  }
  return Array.from(map.entries())
    .slice(0, policy.maxFacts)
    .map(([key, value]) => ({ key, value }));
}

export function applySessionUpdate(
  current: AgentSessionState | null,
  input: AgentSessionUpdateInput,
  policy: AgentSessionPolicy = DEFAULT_AGENT_SESSION_POLICY
): AgentSessionUpdateResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const userText = clip(input.userText, policy.maxTurnChars);
  const assistantText = input.assistantText ? clip(input.assistantText, policy.maxTurnChars) : null;
  const base = current && !isSessionExpired(current, now) && sameScope(current, input)
    ? current
    : emptySession(input, nowIso, policy);

  const recentTurns = [
    ...base.recentTurns,
    { at: nowIso, role: "user" as const, text: userText },
    ...(assistantText ? [{ at: nowIso, role: "assistant" as const, text: assistantText }] : [])
  ].slice(-(policy.maxRecentTurns * 2));

  const continuing = Boolean(current && sameScope(current, input) && !isSessionExpired(current, now));
  const next: AgentSessionState = {
    ...base,
    createdAt: continuing ? base.createdAt : nowIso,
    expiresAt: new Date(now.getTime() + policy.ttlMs).toISOString(),
    facts: mergeFacts(base.facts, input.facts, policy),
    intent: normalizeNullable(input.intent, base.intent, 120),
    openQuestion: normalizeNullable(input.openQuestion, base.openQuestion, 240),
    recentTurns,
    scenarioRevisionId: input.scenarioRevisionId ?? base.scenarioRevisionId,
    summary: clip(input.summary?.trim() || base.summary || deriveSummary(userText, input.intent ?? base.intent), policy.maxSummaryChars),
    tokenEstimate: base.tokenEstimate + Math.max(0, Math.floor(input.tokensUsed ?? estimateSessionTokens(`${userText}${assistantText ?? ""}`))),
    turnCount: base.turnCount + 1,
    updatedAt: nowIso,
    version: continuing ? base.version + 1 : 1
  };

  const shouldCompact =
    next.turnCount >= policy.compactionTurnThreshold ||
    next.tokenEstimate >= policy.compactionTokenThreshold ||
    next.recentTurns.length > policy.maxRecentTurns;

  if (!shouldCompact) {
    return { compacted: false, state: next };
  }

  return { compacted: true, state: compactSession(next, policy) };
}

export function compactSession(state: AgentSessionState, policy: AgentSessionPolicy = DEFAULT_AGENT_SESSION_POLICY): AgentSessionState {
  const retained = state.recentTurns.slice(-Math.max(1, policy.maxRecentTurns));
  const dropped = state.recentTurns.slice(0, Math.max(0, state.recentTurns.length - retained.length));
  const compactionNote = dropped.length
    ? `Ранее: ${dropped.map((turn) => `${turn.role}=${clip(turn.text, 80)}`).join("; ")}.`
    : "";
  const summary = clip([state.summary, compactionNote].filter(Boolean).join(" ").trim(), policy.maxSummaryChars);
  const facts = mergeFacts(state.facts, extractPreservedFacts(state), policy);
  const tokenEstimate = estimateSessionTokens([
    summary,
    state.intent ?? "",
    state.openQuestion ?? "",
    ...facts.map((fact) => `${fact.key}=${fact.value}`),
    ...retained.map((turn) => turn.text)
  ].join("\n"));

  return {
    ...state,
    facts,
    recentTurns: retained,
    summary,
    tokenEstimate
  };
}

export function formatSessionForPrompt(state: AgentSessionState): string {
  const facts = state.facts.length
    ? state.facts.map((fact) => `${fact.key}=${fact.value}`).join("; ")
    : "none";
  const turns = state.recentTurns.length
    ? state.recentTurns.map((turn) => `${turn.role}: ${turn.text}`).join("\n")
    : "none";
  return [
    "Compact session state:",
    `Intent: ${state.intent ?? "unknown"}`,
    `Open question: ${state.openQuestion ?? "none"}`,
    `Facts: ${facts}`,
    `Summary: ${state.summary || "none"}`,
    `Recent turns:\n${turns}`
  ].join("\n");
}

function emptySession(input: AgentSessionUpdateInput, nowIso: string, policy: AgentSessionPolicy): AgentSessionState {
  return {
    conversationId: input.conversationId,
    createdAt: nowIso,
    expiresAt: new Date(Date.parse(nowIso) + policy.ttlMs).toISOString(),
    facts: [],
    intent: null,
    openQuestion: null,
    recentTurns: [],
    scenarioRevisionId: input.scenarioRevisionId ?? null,
    schemaVersion: 1,
    summary: "",
    tenantId: input.tenantId,
    tokenEstimate: 0,
    turnCount: 0,
    updatedAt: nowIso,
    version: 0
  };
}

function sameScope(state: AgentSessionState, input: Pick<AgentSessionUpdateInput, "conversationId" | "tenantId">): boolean {
  return state.tenantId === input.tenantId && state.conversationId === input.conversationId;
}

function normalizeNullable(incoming: string | null | undefined, fallback: string | null, max: number): string | null {
  if (incoming === undefined) return fallback;
  if (incoming === null) return null;
  const value = incoming.trim().slice(0, max);
  return value || null;
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, Math.max(0, max - 1))}…`;
}

function deriveSummary(userText: string, intent: string | null): string {
  return intent ? `Клиент продолжает сценарий ${intent}: ${clip(userText, 160)}` : clip(userText, 200);
}

function extractPreservedFacts(state: AgentSessionState): AgentSessionFact[] {
  const preserved: AgentSessionFact[] = [];
  if (state.intent) preserved.push({ key: "lastIntent", value: state.intent });
  if (state.openQuestion) preserved.push({ key: "openQuestion", value: state.openQuestion });
  return preserved;
}

export type { AgentSessionState, AgentSessionTurn, AgentSessionUpdateInput, AgentSessionUpdateResult };
