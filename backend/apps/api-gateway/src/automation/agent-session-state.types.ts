export interface AgentSessionFact {
  key: string;
  value: string;
}

export interface AgentSessionTurn {
  at: string;
  role: "assistant" | "user";
  text: string;
}

export interface AgentSessionState {
  conversationId: string;
  createdAt: string;
  expiresAt: string;
  facts: AgentSessionFact[];
  intent: string | null;
  openQuestion: string | null;
  recentTurns: AgentSessionTurn[];
  scenarioRevisionId: string | null;
  schemaVersion: 1;
  summary: string;
  tenantId: string;
  tokenEstimate: number;
  turnCount: number;
  updatedAt: string;
  version: number;
}

export interface AgentSessionPolicy {
  compactionTokenThreshold: number;
  compactionTurnThreshold: number;
  maxFactChars: number;
  maxFacts: number;
  maxRecentTurns: number;
  maxSummaryChars: number;
  maxTurnChars: number;
  ttlMs: number;
}

export interface AgentSessionUpdateInput {
  assistantText?: string;
  conversationId: string;
  facts?: AgentSessionFact[] | Record<string, string>;
  intent?: string | null;
  now?: Date;
  openQuestion?: string | null;
  scenarioRevisionId?: string | null;
  summary?: string;
  tenantId: string;
  tokensUsed?: number;
  userText: string;
}

export interface AgentSessionUpdateResult {
  compacted: boolean;
  state: AgentSessionState;
}
