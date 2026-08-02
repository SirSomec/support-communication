import type { AgentSessionFact, AgentSessionPolicy, AgentSessionState, AgentSessionTurn, AgentSessionUpdateInput, AgentSessionUpdateResult } from "./agent-session-state.types.js";
export declare const DEFAULT_AGENT_SESSION_POLICY: AgentSessionPolicy;
export declare function estimateSessionTokens(text: string): number;
export declare function isSessionExpired(state: AgentSessionState, now?: Date): boolean;
export declare function mergeFacts(existing: AgentSessionFact[], incoming: AgentSessionFact[] | Record<string, string> | undefined, policy?: AgentSessionPolicy): AgentSessionFact[];
export declare function applySessionUpdate(current: AgentSessionState | null, input: AgentSessionUpdateInput, policy?: AgentSessionPolicy): AgentSessionUpdateResult;
export declare function compactSession(state: AgentSessionState, policy?: AgentSessionPolicy): AgentSessionState;
export declare function formatSessionForPrompt(state: AgentSessionState): string;
export type { AgentSessionState, AgentSessionTurn, AgentSessionUpdateInput, AgentSessionUpdateResult };
