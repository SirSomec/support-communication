import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { SecretStore } from "../ai-connections/secret-store.js";
import { createOpenAiCompatibleChatProvider } from "../ai-connections/openai-compatible-chat.provider.js";
import { KnowledgeSourceRepository } from "../knowledge-sources/knowledge-source.repository.js";
import { KnowledgeRetrievalService } from "../knowledge-sources/knowledge-retrieval.service.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { formatSessionForPrompt } from "./agent-session-state.js";
import { AgentSessionStateRepository } from "./agent-session-state.repository.js";
import type { KnowledgeSourceBinding } from "./automation.types.js";
import { recordBotAiRequest } from "./bot-observability.js";

export interface AiBotResponseInput {
  conversationId?: string;
  instructions?: string;
  message: string;
  scenarioId?: string;
  scenarioRevisionId?: string;
  sourceBindings: KnowledgeSourceBinding[];
  tenantId: string;
}
export interface AiBotResponse { citations: Array<{ endOffset: number; sourceId: string; startOffset: number; title: string; version: number }>; model: string; text: string; }

/** Builds a bounded, tenant-scoped grounded prompt; it never sends keys or unrelated tenant data. */
export class AiBotResponseService {
  constructor(
    private readonly connections = AiConnectionRepository.default(),
    private readonly sources = KnowledgeSourceRepository.default(),
    private readonly workspace = WorkspaceRepository.default(),
    private readonly environment: NodeJS.ProcessEnv = process.env,
    private readonly usage = AiUsageRepository.default(),
    private readonly sessions = AgentSessionStateRepository.default()
  ) {}

  async respond(input: AiBotResponseInput): Promise<AiBotResponse> {
    const startedAt = Date.now();
    const connection = this.connections.list(input.tenantId).filter((item) => item.status === "ready" && item.disabledAt === null && item.capabilities.includes("chat_completion")).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!connection) {
      recordBotAiRequest({ errorCode: "bot_ai_connection_not_ready", latencyMs: Date.now() - startedAt, scenarioId: input.scenarioId, status: "error", tenantId: input.tenantId });
      throw new Error("bot_ai_connection_not_ready");
    }
    let release: (() => void) | null = null;
    try {
      release = this.usage.reserve({ connectionId: connection.id, maxConcurrentRuns: connection.limits.maxConcurrentRuns, monthlyTokenBudget: connection.limits.monthlyTokenBudget, requestsPerMinute: connection.limits.requestsPerMinute, tenantId: input.tenantId, worstCaseTokens: Math.min(500, connection.limits.monthlyTokenBudget ?? 500) });
      const materials = await this.materials(input.tenantId, input.sourceBindings, input.message, input.scenarioId);
      if (!materials.length) throw new Error("bot_ai_knowledge_not_ready");
      const session = input.conversationId ? this.sessions.get(input.tenantId, input.conversationId) : null;
      const secret = new SecretStore({ keyVersion: this.environment.AI_CONNECTIONS_KEY_VERSION ?? "local-v1", masterKeyBase64: this.environment.AI_CONNECTIONS_MASTER_KEY ?? this.environment.PROVIDER_CREDENTIAL_MASTER_KEY ?? "" }).decrypt(connection.secret);
      const provider = createOpenAiCompatibleChatProvider({ apiKey: secret, baseUrl: connection.baseUrl, maxRetries: 1, model: connection.chatModel, timeoutMs: 12_000 });
      const completion = await provider.complete({ maxTokens: 500, temperature: 0.2, messages: [
        { role: "system", content: systemPrompt(input.instructions, materials.map((item) => item.content).join("\n\n"), session ? formatSessionForPrompt(session) : undefined) },
        { role: "user", content: input.message.slice(0, 4_000) }
      ] });
      const tokens = completion.usage.totalTokens ?? 500;
      this.usage.recordUsage(input.tenantId, connection.id, tokens);
      recordBotAiRequest({
        connectionId: connection.id,
        latencyMs: Date.now() - startedAt,
        scenarioId: input.scenarioId,
        status: "ok",
        tenantId: input.tenantId,
        tokens
      });
      const text = completion.content.slice(0, 8_000);
      if (input.conversationId) {
        this.sessions.updateAfterRun({
          assistantText: text,
          conversationId: input.conversationId,
          intent: session?.intent ?? null,
          openQuestion: session?.openQuestion ?? null,
          scenarioRevisionId: input.scenarioRevisionId ?? session?.scenarioRevisionId ?? null,
          summary: session?.summary || input.message.slice(0, 200),
          tenantId: input.tenantId,
          tokensUsed: tokens,
          userText: input.message
        });
      }
      return { citations: materials.map(({ content: _content, ...citation }) => citation), model: completion.model, text };
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "bot_ai_unavailable";
      recordBotAiRequest({
        connectionId: connection.id,
        errorCode,
        latencyMs: Date.now() - startedAt,
        scenarioId: input.scenarioId,
        status: "error",
        tenantId: input.tenantId
      });
      throw error;
    } finally {
      release?.();
    }
  }

  private async materials(tenantId: string, bindings: KnowledgeSourceBinding[], question: string, scenarioId?: string) {
    const result = await new KnowledgeRetrievalService(this.sources, this.workspace).retrieve({
      query: question,
      scenarioId,
      sourceBindings: bindings,
      tenantId,
      tokenBudget: 1_500
    });
    return result.passages.map((passage) => ({ content: passage.content, endOffset: passage.citation.endOffset, sourceId: passage.citation.sourceId, startOffset: passage.citation.startOffset, title: passage.citation.title, version: passage.citation.sourceVersion }));
  }
}

/** Selects one compact passage per source. The provider receives the question separately, so the full dialog is never replayed. */
export function extractRelevantKnowledge(document: string, question: string, budget: number): string {
  const text = document.replace(/\s+/g, " ").trim();
  if (!text || budget <= 0) return "";
  const terms = Array.from(new Set(question.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])).slice(0, 12);
  const lower = text.toLocaleLowerCase();
  const index = terms.map((term) => lower.indexOf(term)).filter((value) => value >= 0).sort((a, b) => a - b)[0] ?? 0;
  const max = Math.min(2_000, budget);
  const start = Math.max(0, index - Math.floor(max / 3));
  const end = Math.min(text.length, start + max);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function systemPrompt(instructions: string | undefined, knowledge: string, sessionState?: string): string {
  return [
    "You are a customer-support consultation assistant.",
    "Answer only from the supplied knowledge. Do not invent facts, policies, prices, or actions.",
    "If the answer is not in the knowledge, say that you cannot confirm it and offer a human operator.",
    "Do not access CRM data and do not claim that you did.",
    instructions?.trim() ? `Scenario guidance: ${instructions.trim().slice(0, 1500)}` : "",
    sessionState?.trim() ? sessionState.trim().slice(0, 2_000) : "",
    `Approved knowledge:\n${knowledge}`
  ].filter(Boolean).join("\n\n");
}

function estimatePromptTokens(message: string, answer: string): number {
  return Math.max(1, Math.ceil((message.length + answer.length) / 4));
}
