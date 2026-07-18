/**
 * Live sandbox chat: an isolated multi-turn conversation between an admin and a
 * bot scenario. Runtime steps run against an ephemeral in-memory repository, so
 * nothing reaches production dialogs, queues or channel delivery. AI calls are
 * real (BAI-802 decision: sandbox is always live) and are budgeted separately.
 */

export interface BotSandboxCitation {
  sourceId: string;
  title: string;
  version?: number;
}

export interface BotSandboxRetrievalPassage {
  preview: string;
  score: number;
  sourceId: string;
  title: string;
}

export interface BotSandboxTriggerTrace {
  evaluated: boolean;
  matchMode?: string;
  matched: boolean | null;
  phrases?: string[];
  type?: string;
  /** True when the scenario would not start on its own and the sandbox forced it. */
  forcedStart?: boolean;
}

export interface BotSandboxTurnTrace {
  aiCalled: boolean;
  consultationTurns: number;
  latencyMs: number;
  model: string | null;
  nodeId: string;
  nodeType: string;
  outcome: string;
  retrievalCache: "hit" | "miss" | "skipped";
  /** BAI-878: сколько токенов корпуса пришло из кеша провайдера (llm-поиск). */
  retrievalCachedTokens?: number;
  /** BAI-878: причина отката llm/semantic-поиска в лексику (видна админу в trace). */
  retrievalFallbackReason?: string;
  /** BAI-878: каким способом искали знания; отсутствует = лексика. */
  retrievalMode?: "llm" | "llm_fallback" | "semantic" | "semantic_fallback";
  retrievalPassages: BotSandboxRetrievalPassage[];
  retrievalTokensUsed: number;
  trigger: BotSandboxTriggerTrace;
  usageTokens: number | null;
  webhook: { executed: boolean; note: string } | null;
}

export interface BotSandboxBotMessage {
  citations: BotSandboxCitation[];
  id: string;
  text: string;
}

export interface BotSandboxEvent {
  /** Machine-readable kind: handoff, contact_request, bot_inactive, flow_completed, error. */
  kind: string;
  /** Safe human-readable explanation shown inside the chat transcript. */
  note: string;
  queue?: string;
  reason?: string;
}

export interface BotSandboxTurn {
  at: string;
  clientMessageId: string;
  clientText: string;
  events: BotSandboxEvent[];
  messages: BotSandboxBotMessage[];
  trace: BotSandboxTurnTrace | null;
}

export type BotSandboxSessionMode = "draft" | "published";
export type BotSandboxSessionStatus = "active" | "handoff";

export interface BotSandboxSession {
  channel: string;
  context: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
  currentNodeId: string | null;
  expiresAt: string;
  id: string;
  locale: string;
  mode: BotSandboxSessionMode;
  scenarioId: string;
  scenarioName: string;
  status: BotSandboxSessionStatus;
  tenantId: string;
  turns: BotSandboxTurn[];
  updatedAt: string;
  usage: { totalTokens: number };
  versionId: string;
  webhooksEnabled: boolean;
}

export interface BotSandboxUsageRecord {
  month: string;
  tenantId: string;
  usedTokens: number;
}
