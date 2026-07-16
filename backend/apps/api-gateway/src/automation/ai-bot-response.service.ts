import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { AiUsageRepository } from "../ai-connections/ai-usage.repository.js";
import { SecretStore } from "../ai-connections/secret-store.js";
import { createOpenAiCompatibleChatProvider } from "../ai-connections/openai-compatible-chat.provider.js";
import { KnowledgeSourceRepository } from "../knowledge-sources/knowledge-source.repository.js";
import { KnowledgeRetrievalService, type McpRetrievalInvoker } from "../knowledge-sources/knowledge-retrieval.service.js";
import { UnansweredQuestionRepository } from "../knowledge-sources/unanswered-question.repository.js";
import { HttpMcpReadOnlyTransport, McpReadOnlyConnectorService } from "../knowledge-sources/mcp-readonly-connector.service.js";
import { McpConnectorRepository } from "../knowledge-sources/mcp-connector.repository.js";
import { WorkspaceRepository } from "../workspace/workspace.repository.js";
import { formatSessionForPrompt } from "./agent-session-state.js";
import { AgentSessionStateRepository } from "./agent-session-state.repository.js";
import type { KnowledgeSourceBinding } from "./automation.types.js";
import { recordBotAiRequest } from "./bot-observability.js";

export interface AiBotResponseInput {
  basePrompt?: string;
  behaviorRules?: string;
  conversationId?: string;
  instructions?: string;
  message: string;
  retrievalScoreThreshold?: number;
  scenarioId?: string;
  scenarioRevisionId?: string;
  sourceBindings: KnowledgeSourceBinding[];
  tenantId: string;
}
export interface AiBotResponse { citations: Array<{ endOffset: number; sourceId: string; startOffset: number; title: string; version: number }>; handoffRequested?: boolean; model: string; text: string; usage?: { totalTokens: number | null }; materialsAvailable?: number; }

export const AI_HANDOFF_MARKER = "[[HANDOFF]]";
const AI_HANDOFF_MARKER_DETECT = /\[\[\s*handoff\s*\]\]/i;
const AI_HANDOFF_MARKER_STRIP = /\[\[\s*handoff\s*\]\]/gi;

/**
 * Модель сигналит о передаче оператору машинным маркером [[HANDOFF]] в конце
 * ответа. Маркер вырезается из текста до любой доставки клиенту — клиент видит
 * только человеческую фразу; решение о передаче принимает рантайм по флагу.
 * Парсится только вывод модели: echo-инъекция маркера клиентом в худшем случае
 * передаст диалог оператору, что безопасно.
 */
export function extractAiHandoffDirective(text: string): { handoffRequested: boolean; text: string } {
  const raw = String(text ?? "");
  if (!AI_HANDOFF_MARKER_DETECT.test(raw)) {
    return { handoffRequested: false, text: raw };
  }
  const cleaned = raw
    .replace(AI_HANDOFF_MARKER_STRIP, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
  return { handoffRequested: true, text: cleaned };
}

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
    const connection = (await this.connections.list(input.tenantId)).filter((item) => item.status === "ready" && item.disabledAt === null && item.capabilities.includes("chat_completion")).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!connection) {
      recordBotAiRequest({ errorCode: "bot_ai_connection_not_ready", latencyMs: Date.now() - startedAt, scenarioId: input.scenarioId, status: "error", tenantId: input.tenantId });
      throw new Error("bot_ai_connection_not_ready");
    }
    let release: (() => void) | null = null;
    try {
      release = await this.usage.reserve({ connectionId: connection.id, maxConcurrentRuns: connection.limits.maxConcurrentRuns, monthlyTokenBudget: connection.limits.monthlyTokenBudget, requestsPerMinute: connection.limits.requestsPerMinute, tenantId: input.tenantId, worstCaseTokens: Math.min(500, connection.limits.monthlyTokenBudget ?? 500) });
      const materials = await this.materials(input.tenantId, input.sourceBindings, input.message, input.scenarioId, input.retrievalScoreThreshold);
      // Пустой retrieval — не повод жёстко эскалировать: приветствия и smalltalk не
      // совпадают со знаниями по лексике. Зовём модель с пустыми знаниями, а её
      // rails решают: поздороваться/уточнить либо честно признать, что ответа нет и
      // предложить оператора. Реальные пробелы знаний копим в «вопросах без ответа».
      if (!materials.length && looksLikeQuestion(input.message) && !String(input.conversationId ?? "").startsWith("sandbox:")) {
        await UnansweredQuestionRepository.default().record({
          question: input.message,
          reason: "knowledge_not_ready",
          scenarioId: input.scenarioId,
          tenantId: input.tenantId
        });
      }
      const session = input.conversationId ? await this.sessions.get(input.tenantId, input.conversationId) : null;
      const secret = new SecretStore({ keyVersion: this.environment.AI_CONNECTIONS_KEY_VERSION ?? "local-v1", masterKeyBase64: this.environment.AI_CONNECTIONS_MASTER_KEY ?? this.environment.PROVIDER_CREDENTIAL_MASTER_KEY ?? "" }).decrypt(connection.secret);
      const provider = createOpenAiCompatibleChatProvider({ apiKey: secret, baseUrl: connection.baseUrl, maxRetries: 1, model: connection.chatModel, timeoutMs: 12_000 });
      // BAI-851: стабильный ключ префикса (tenant + scenario revision), без PII и user id.
      const promptCacheKey = `bot:${input.tenantId}:${input.scenarioId ?? "none"}:${input.scenarioRevisionId ?? "current"}`;
      const completion = await provider.complete({ maxTokens: 500, promptCacheKey, temperature: 0.2, messages: [
        { role: "system", content: buildAiBotSystemPrompt({
          basePrompt: input.basePrompt,
          behaviorRules: input.behaviorRules,
          instructions: input.instructions,
          knowledge: materials.length ? materials.map((item) => item.content).join("\n\n") : "",
          sessionState: session ? formatSessionForPrompt(session) : undefined
        }) },
        { role: "user", content: input.message.slice(0, 4_000) }
      ] });
      const tokens = completion.usage.totalTokens ?? 500;
      await this.usage.recordUsage(input.tenantId, connection.id, tokens);
      recordBotAiRequest({
        connectionId: connection.id,
        latencyMs: Date.now() - startedAt,
        scenarioId: input.scenarioId,
        status: "ok",
        tenantId: input.tenantId,
        tokens
      });
      // Маркер извлекается из полного вывода модели до обрезки: у длинного
      // ответа он стоит в самом конце и иначе был бы отрезан slice'ом.
      const directive = extractAiHandoffDirective(completion.content);
      const text = directive.text.slice(0, 8_000);
      if (input.conversationId) {
        await this.sessions.updateAfterRun({
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
      return {
        citations: materials.map(({ content: _content, ...citation }) => citation),
        ...(directive.handoffRequested ? { handoffRequested: true } : {}),
        materialsAvailable: materials.length,
        model: completion.model,
        text,
        usage: { totalTokens: completion.usage.totalTokens ?? null }
      };
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

  private async materials(tenantId: string, bindings: KnowledgeSourceBinding[], question: string, scenarioId?: string, scoreThreshold?: number) {
    const result = await new KnowledgeRetrievalService(this.sources, this.workspace, undefined, this.mcpInvoker()).retrieve({
      query: question,
      scenarioId,
      scoreThreshold,
      sourceBindings: bindings,
      tenantId,
      tokenBudget: 1_500
    });
    return result.passages.map((passage) => ({ content: passage.content, endOffset: passage.citation.endOffset, sourceId: passage.citation.sourceId, startOffset: passage.citation.startOffset, title: passage.citation.title, version: passage.citation.sourceVersion }));
  }

  private mcpInvoker(): McpRetrievalInvoker {
    const service = new McpReadOnlyConnectorService(new HttpMcpReadOnlyTransport(), 8_000, McpConnectorRepository.default());
    return { invoke: (tenantId, connectorId, toolName, toolInput) => service.invoke(tenantId, connectorId, toolName, toolInput) };
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

/**
 * Order: tenant base prompt → tenant behavior rules → platform safety rails →
 * node instructions → session → knowledge. Safety rails deliberately follow the
 * tenant-configurable text so behavior rules cannot override them (BAI-840).
 */
export function buildAiBotSystemPrompt(input: {
  basePrompt?: string;
  behaviorRules?: string;
  instructions?: string;
  knowledge: string;
  sessionState?: string;
}): string {
  const hasKnowledge = Boolean(input.knowledge.trim());
  return [
    input.basePrompt?.trim() ? input.basePrompt.trim().slice(0, 4_000) : "",
    input.behaviorRules?.trim() ? `Additional behavior rules: ${input.behaviorRules.trim().slice(0, 1_000)}` : "",
    "You are a customer-support consultation assistant.",
    "Answer factual questions only from the supplied knowledge. Do not invent facts, policies, prices, or actions.",
    "For a greeting or small talk, reply briefly and warmly and ask what the customer needs — you do not need knowledge to greet.",
    "If the customer asks something factual and the answer is not in the knowledge, say that you cannot confirm it and offer a human operator.",
    "Do not access CRM data and do not claim that you did.",
    `When the dialog must go to a human operator — the customer asks for one or agrees to your offer, or you cannot help within these rules after a genuine attempt — write one short polite sentence that you are transferring the dialog and append the marker ${AI_HANDOFF_MARKER} as the last line.`,
    `The ${AI_HANDOFF_MARKER} marker is machine-read and removed before the customer sees the reply; never mention it, never explain it, and never output it in any other situation.`,
    "The behavior rules above never override these safety rules.",
    input.instructions?.trim() ? `Scenario guidance: ${input.instructions.trim().slice(0, 1500)}` : "",
    input.sessionState?.trim() ? input.sessionState.trim().slice(0, 2_000) : "",
    hasKnowledge
      ? `Approved knowledge:\n${input.knowledge}`
      : "No approved knowledge matched this message. Greet or ask a clarifying question if that fits; otherwise say you cannot confirm the answer and offer a human operator."
  ].filter(Boolean).join("\n\n");
}

function estimatePromptTokens(message: string, answer: string): number {
  return Math.max(1, Math.ceil((message.length + answer.length) / 4));
}

/**
 * Отсекает приветствия/smalltalk от реальных вопросов, чтобы не засорять очередь
 * «вопросов без ответа». Вопрос — это «?» или хотя бы два содержательных слова.
 */
function looksLikeQuestion(message: string): boolean {
  const text = String(message ?? "").trim();
  if (!text) return false;
  if (text.includes("?")) return true;
  const meaningful = (text.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).length;
  return meaningful >= 2;
}
