import { randomUUID } from "node:crypto";
import type { FeatureFlag } from "../platform/platform.types.js";
import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { KnowledgeRetrievalService } from "../knowledge-sources/knowledge-retrieval.service.js";
import { LlmKnowledgeSearchService } from "../knowledge-sources/llm-knowledge-search.service.js";
import { normalizeAgentPolicy } from "./agent-policy.js";
import {
  AutomationRepository,
  createEmptyAutomationState,
  type AutomationBotRuntimeCommitResult,
  type AutomationBotRuntimeInstance,
  type AutomationBotScenarioVersion,
  type AutomationBotTestRun
} from "./automation.repository.js";
import type { BotScenario } from "./automation.types.js";
import { AiBotResponseService } from "./ai-bot-response.service.js";
import { BotRuntimeService, effectiveTriggerRules, isConsultationNode } from "./bot-runtime.service.js";
import { matchesBotAlwaysExceptTrigger, matchesBotTriggerPhrase } from "./bot-trigger-matcher.js";
import { BotSandboxSessionRepository, BOT_SANDBOX_SESSION_TTL_MS } from "./bot-sandbox-session.repository.js";
import type {
  BotSandboxBotMessage,
  BotSandboxEvent,
  BotSandboxSession,
  BotSandboxSessionMode,
  BotSandboxTriggerTrace,
  BotSandboxTurn,
  BotSandboxTurnTrace
} from "./bot-sandbox.types.js";

const SANDBOX_WORST_CASE_TOKENS = 500;
const DEFAULT_SANDBOX_MONTHLY_TOKEN_BUDGET = 100_000;
const MAX_TURNS_KEPT = 60;

export interface BotSandboxServiceOptions {
  aiResponder?: Pick<AiBotResponseService, "respond">;
  connections?: AiConnectionRepository;
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => Date;
  retrieval?: KnowledgeRetrievalService;
  sessions?: BotSandboxSessionRepository;
}

export interface BotSandboxCreateInput {
  actor: string;
  channel?: string;
  locale?: string;
  mode?: string;
  scenarioId: string;
  tenantId: string;
}

export interface BotSandboxMessageInput {
  featureFlags?: FeatureFlag[];
  messageId?: string;
  quickReply?: string;
  scenarioId: string;
  sessionId: string;
  tenantId: string;
  text: string;
  traceId?: string;
  value?: unknown;
  webhooksEnabled?: boolean;
}

/**
 * Live sandbox chat (BAI-801/802). Every message runs the real runtime and the
 * real AI provider against an ephemeral in-memory repository: production
 * dialogs, queues, workers and channel delivery are never touched.
 */
export class BotSandboxService {
  private readonly sessions: BotSandboxSessionRepository;
  private readonly connections: AiConnectionRepository;
  private readonly environment: NodeJS.ProcessEnv;

  constructor(private readonly automationRepository: AutomationRepository, private readonly options: BotSandboxServiceOptions = {}) {
    this.sessions = options.sessions ?? BotSandboxSessionRepository.default();
    this.connections = options.connections ?? AiConnectionRepository.default();
    this.environment = options.environment ?? process.env;
  }

  async createSession(input: BotSandboxCreateInput): Promise<BotSandboxSession> {
    const resolved = await this.resolveScenarioConfig(input.tenantId, input.scenarioId, normalizeMode(input.mode));
    const channel = String(input.channel ?? "").trim() || resolved.config.channels[0] || "SDK";
    if (!resolved.config.channels.includes(channel)) throw new Error("bot_sandbox_channel_unsupported");
    const now = this.now();
    const session: BotSandboxSession = {
      channel,
      context: {},
      createdAt: now.toISOString(),
      createdBy: input.actor,
      currentNodeId: null,
      expiresAt: new Date(now.getTime() + BOT_SANDBOX_SESSION_TTL_MS).toISOString(),
      id: `sbx_${randomUUID()}`,
      locale: String(input.locale ?? "").trim() || "ru-RU",
      mode: resolved.mode,
      scenarioId: input.scenarioId,
      scenarioName: resolved.config.name,
      status: "active",
      tenantId: input.tenantId,
      turns: [],
      updatedAt: now.toISOString(),
      usage: { totalTokens: 0 },
      versionId: resolved.versionId,
      webhooksEnabled: false
    };
    return this.sessions.save(session);
  }

  async getSession(tenantId: string, scenarioId: string, sessionId: string): Promise<BotSandboxSession> {
    const session = await this.sessions.find(tenantId, sessionId, this.now());
    if (!session || session.scenarioId !== scenarioId) throw new Error("bot_sandbox_session_not_found");
    return session;
  }

  async deleteSession(tenantId: string, scenarioId: string, sessionId: string): Promise<void> {
    await this.getSession(tenantId, scenarioId, sessionId);
    await this.sessions.delete(tenantId, sessionId);
  }

  async postMessage(input: BotSandboxMessageInput): Promise<{ session: BotSandboxSession; turn: BotSandboxTurn }> {
    const text = String(input.text ?? "").trim();
    if (!text && input.quickReply === undefined) throw new Error("bot_sandbox_message_required");
    const session = await this.getSession(input.tenantId, input.scenarioId, input.sessionId);
    const messageId = String(input.messageId ?? "").trim() || `sbxmsg_${randomUUID()}`;
    const replay = session.turns.find((turn) => turn.clientMessageId === messageId);
    if (replay) return { session, turn: replay };

    const now = this.now();
    if (session.status === "handoff") {
      const turn = this.appendTurn(session, {
        at: now.toISOString(),
        clientMessageId: messageId,
        clientText: text,
        events: [{ kind: "bot_inactive", note: "Бот уже передал этот диалог оператору и больше не отвечает. Начните тест заново, чтобы проверить сценарий ещё раз." }],
        messages: [],
        trace: null
      }, now);
      return { session: await this.sessions.save(session), turn };
    }

    const resolved = await this.resolveScenarioConfig(input.tenantId, input.scenarioId, session.mode, session.versionId);
    const hasAiNode = resolved.config.flowNodes.some((node) => node.type === "ai_reply");
    if (hasAiNode) await this.assertSandboxBudget(input.tenantId, now);

    const isFirstTurn = session.turns.length === 0;
    const trigger = isFirstTurn ? evaluateTriggerTrace(resolved.config, text) : { evaluated: false, matched: null };
    const runtime = new BotRuntimeService(this.buildEphemeralRepository(session, resolved), {
      aiResponder: this.options.aiResponder,
      featureFlags: input.featureFlags,
      fetch: session.webhooksEnabled || input.webhooksEnabled ? this.options.fetch : sandboxWebhookStub,
      now: () => now
    });
    const startedAt = Date.now();
    let result: AutomationBotRuntimeCommitResult | null = null;
    let runtimeErrorCode: string | null = null;
    try {
      result = await runtime.handleInboundEvent({
        channel: session.channel,
        conversationId: sandboxConversationId(session.id),
        eventId: `sbx_evt_${sanitizeSegment(messageId)}`,
        payload: {
          ...(text ? { text } : {}),
          isNewConversation: isFirstTurn,
          ...(input.quickReply !== undefined ? { quickReply: input.quickReply } : {}),
          ...(input.value !== undefined ? { value: input.value } : {})
        },
        scenarioId: input.scenarioId,
        tenantId: input.tenantId,
        traceId: input.traceId ?? `sbx_trace_${randomUUID()}`
      });
    } catch (error) {
      runtimeErrorCode = error instanceof Error ? error.message : "bot_sandbox_runtime_failed";
    }
    const latencyMs = Date.now() - startedAt;

    const committedError = result?.step.error ? String(result.step.error) : null;
    const failureCode = runtimeErrorCode ?? committedError;
    const executedNode = result ? resolved.config.flowNodes.find((node) => node.id === result!.step.nodeId) : undefined;
    const messages = result && !failureCode ? extractBotMessages(result) : [];
    const usageTokens = messages.reduce<number | null>(
      (sum, message) => typeof message.usageTokens === "number" ? (sum ?? 0) + message.usageTokens : sum,
      null
    );

    const events: BotSandboxEvent[] = [];
    if (failureCode) events.push(sandboxFailureEvent(failureCode));
    if (result?.step.handoffSummary) {
      const reason = String(result.step.handoffSummary.reason ?? "handoff_requested");
      events.push({
        kind: "handoff",
        note: sandboxHandoffNote(reason),
        queue: String(result.step.handoffSummary.queue ?? "default"),
        reason
      });
    }
    if (result && !failureCode && executedNode?.type === "contact_request" && result.step.outcome === "contact_requested") {
      events.push({ kind: "contact_request", note: `Бот запросил поле «${String(executedNode.config?.field ?? "contact")}».` });
    }
    if (result && !failureCode && result.step.outcome === "policy_refused") {
      events.push({ kind: "policy", note: "Ответ ограничен правилом «Рамки ответов»: тема в списке запрещённых.", reason: "policy_blocked_topic" });
    }

    const aiCalled = Boolean(result && !failureCode && executedNode?.type === "ai_reply" && result.step.outcome === "ai_reply_queued");
    const retrieval = aiCalled || (executedNode?.type === "ai_reply" && result?.step.outcome === "ai_handoff_requested" && text)
      ? await this.traceRetrieval(input.tenantId, resolved.config, text, input.scenarioId)
      : { cache: "skipped" as const, passages: [], tokensUsed: 0 };

    const trace: BotSandboxTurnTrace = {
      aiCalled,
      consultationTurns: Number((result?.instance.context as Record<string, unknown> | undefined)?.consultationTurns ?? session.context.consultationTurns ?? 0),
      latencyMs,
      model: firstDefined(messages.map((message) => message.model)) ?? null,
      nodeId: result?.step.nodeId ?? session.currentNodeId ?? "",
      nodeType: result?.step.nodeType ?? executedNode?.type ?? "",
      outcome: failureCode ?? result?.step.outcome ?? "error",
      retrievalCache: retrieval.cache,
      ...(retrieval.cachedTokens === undefined ? {} : { retrievalCachedTokens: retrieval.cachedTokens }),
      ...(retrieval.fallbackReason === undefined ? {} : { retrievalFallbackReason: retrieval.fallbackReason }),
      ...(retrieval.retrievalMode === undefined ? {} : { retrievalMode: retrieval.retrievalMode }),
      retrievalPassages: retrieval.passages,
      retrievalTokensUsed: retrieval.tokensUsed,
      trigger: { ...trigger, forcedStart: trigger.evaluated ? trigger.matched === false : undefined },
      usageTokens,
      webhook: executedNode?.type === "webhook"
        ? { executed: Boolean(session.webhooksEnabled || input.webhooksEnabled), note: session.webhooksEnabled || input.webhooksEnabled ? "Webhook вызван по-настоящему." : "Webhook в песочнице не вызывался: показан безопасный ответ-заглушка." }
        : null
    };

    const turn: BotSandboxTurn = {
      at: now.toISOString(),
      clientMessageId: messageId,
      clientText: text,
      events,
      messages: messages.map(toPublicBotMessage),
      trace
    };

    if (result && !failureCode) {
      session.context = result.instance.context;
      session.currentNodeId = result.instance.currentNodeId;
      if (result.instance.status === "handoff") session.status = "handoff";
    }
    if (typeof usageTokens === "number" && usageTokens > 0) {
      session.usage.totalTokens += usageTokens;
      await this.sessions.recordSandboxUsage(input.tenantId, usageTokens, now);
    }
    if (input.webhooksEnabled !== undefined) session.webhooksEnabled = Boolean(input.webhooksEnabled);
    this.appendTurn(session, turn, now);
    return { session: await this.sessions.save(session), turn };
  }

  async saveRegression(input: { actor: string; name?: string; scenarioId: string; sessionId: string; tenantId: string }): Promise<AutomationBotTestRun> {
    const session = await this.getSession(input.tenantId, input.scenarioId, input.sessionId);
    if (!session.turns.length) throw new Error("bot_sandbox_session_empty");
    const run: AutomationBotTestRun = {
      auditId: `evt_bot_sandbox_regression_${randomUUID()}`,
      cases: session.turns.map((turn) => ({
        expected: {
          botText: turn.messages[0]?.text ?? null,
          events: turn.events.map((event) => event.kind),
          outcome: turn.trace?.outcome ?? null
        },
        message: turn.clientText
      })),
      queue: "bot-sandbox-regression",
      scenarioId: input.scenarioId,
      status: "saved",
      tenantId: input.tenantId,
      testRunId: `sbxrun_${randomUUID()}`
    };
    return this.automationRepository.saveBotTestRunAsync(run);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private async assertSandboxBudget(tenantId: string, now: Date): Promise<void> {
    const connection = (await this.connections.list(tenantId))
      .filter((item) => item.status === "ready" && item.disabledAt === null && item.capabilities.includes("chat_completion"))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    const envBudget = Number(this.environment.BOT_SANDBOX_MONTHLY_TOKEN_BUDGET);
    const budget = connection?.limits.sandboxMonthlyTokenBudget
      ?? (Number.isInteger(envBudget) && envBudget > 0 ? envBudget : DEFAULT_SANDBOX_MONTHLY_TOKEN_BUDGET);
    if ((await this.sessions.sandboxUsage(tenantId, now)) + SANDBOX_WORST_CASE_TOKENS > budget) throw new Error("bot_sandbox_budget_exhausted");
  }

  private appendTurn(session: BotSandboxSession, turn: BotSandboxTurn, now: Date): BotSandboxTurn {
    session.turns = [...session.turns, turn].slice(-MAX_TURNS_KEPT);
    session.updatedAt = now.toISOString();
    session.expiresAt = new Date(now.getTime() + BOT_SANDBOX_SESSION_TTL_MS).toISOString();
    return turn;
  }

  private async traceRetrieval(tenantId: string, scenario: SandboxScenarioConfig, query: string, scenarioId: string): Promise<SandboxRetrievalTrace> {
    try {
      // BAI-878: trace повторяет поиск ТЕМ ЖЕ режимом, что и рантайм (песочница
      // доверяет policy, как runtime без featureFlags) — тогда trace попадает в
      // 5-минутный кэш реального вызова и не жжёт второй запрос к дорогой модели.
      const aiNode = scenario.flowNodes.find((node) => node.type === "ai_reply");
      const policy = normalizeAgentPolicy(aiNode?.config);
      const result = await (this.options.retrieval ?? new KnowledgeRetrievalService(undefined, undefined, undefined, undefined, new LlmKnowledgeSearchService())).retrieve({
        mode: policy.retrievalMode,
        query,
        scenarioId,
        sourceBindings: scenario.sourceBindings ?? [],
        tenantId,
        tokenBudget: 1_500
      });
      return {
        cache: result.cache,
        ...(result.mode === "lexical" ? {} : { retrievalMode: result.mode, ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}) }),
        ...(result.cachedTokens === undefined ? {} : { cachedTokens: result.cachedTokens }),
        passages: result.passages.slice(0, 5).map((passage) => ({
          preview: passage.content.slice(0, 200),
          score: passage.score,
          sourceId: passage.citation.sourceId,
          title: passage.citation.title
        })),
        tokensUsed: result.tokensUsed
      };
    } catch {
      return { cache: "skipped", passages: [], tokensUsed: 0 };
    }
  }

  private buildEphemeralRepository(session: BotSandboxSession, resolved: ResolvedSandboxScenario): AutomationRepository {
    const scenario: BotScenario = {
      ...resolved.config,
      activeVersionId: resolved.versionId,
      enabled: true,
      id: session.scenarioId,
      schemaVersion: "bot-flow/v1",
      status: "published",
      tenantId: session.tenantId
    };
    const version: AutomationBotScenarioVersion = {
      basePrompt: resolved.config.basePrompt,
      createdAt: session.createdAt,
      flowEdges: resolved.config.flowEdges,
      flowNodes: resolved.config.flowNodes,
      priority: resolved.config.priority,
      scenarioId: session.scenarioId,
      sourceBindings: resolved.config.sourceBindings,
      status: "published",
      tenantId: session.tenantId,
      triggerRules: resolved.config.triggerRules,
      versionId: resolved.versionId
    };
    const instance: AutomationBotRuntimeInstance | null = session.currentNodeId
      ? {
        attempts: 0,
        context: session.context,
        conversationId: sandboxConversationId(session.id),
        createdAt: session.createdAt,
        currentNodeId: session.currentNodeId,
        id: `bot_runtime_${session.id}`,
        lastError: null,
        nextAttemptAt: null,
        scenarioId: session.scenarioId,
        status: "active",
        tenantId: session.tenantId,
        updatedAt: session.updatedAt,
        versionId: resolved.versionId
      }
      : null;
    return AutomationRepository.inMemory({
      ...createEmptyAutomationState(),
      botRuntimeInstances: instance ? [instance] : [],
      botScenarioVersions: [version],
      botScenarios: [scenario]
    });
  }

  private async resolveScenarioConfig(
    tenantId: string,
    scenarioId: string,
    mode: BotSandboxSessionMode | "auto",
    pinnedVersionId?: string
  ): Promise<ResolvedSandboxScenario> {
    const state = await this.automationRepository.readStateAsync();
    const scenario = state.botScenarios.find((item) => item.id === scenarioId && item.tenantId === tenantId);
    if (!scenario) throw new Error("bot_sandbox_scenario_not_found");
    const published = state.botScenarioVersions
      .filter((item) => item.tenantId === tenantId && item.scenarioId === scenarioId && item.status === "published")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const resolvedMode: BotSandboxSessionMode = mode === "auto"
      ? (scenario.status === "draft" || !published.length ? "draft" : "published")
      : mode;
    if (resolvedMode === "published") {
      const version = (pinnedVersionId ? published.find((item) => item.versionId === pinnedVersionId) : undefined)
        ?? published.find((item) => item.versionId === scenario.activeVersionId)
        ?? published[0];
      if (!version) throw new Error("bot_sandbox_published_version_not_found");
      return {
        config: withEffectiveRules({
          ...scenario,
          basePrompt: version.basePrompt ?? scenario.basePrompt,
          flowEdges: version.flowEdges,
          flowNodes: version.flowNodes,
          priority: version.priority ?? scenario.priority,
          sourceBindings: version.sourceBindings ?? scenario.sourceBindings,
          triggerRules: version.triggerRules ?? scenario.triggerRules
        }),
        mode: resolvedMode,
        versionId: version.versionId
      };
    }
    // Draft-режим тестирует черновик следующей версии, если он есть (BAI-812).
    const overlay = scenario.draft;
    const effective: BotScenario = overlay
      ? {
        ...scenario,
        ...(overlay.basePrompt !== undefined ? { basePrompt: overlay.basePrompt } : {}),
        ...(overlay.channels ? { channels: overlay.channels } : {}),
        ...(overlay.flowEdges ? { flowEdges: overlay.flowEdges } : {}),
        ...(overlay.flowNodes ? { flowNodes: overlay.flowNodes } : {}),
        ...(overlay.name ? { name: overlay.name } : {}),
        ...(overlay.priority !== undefined ? { priority: overlay.priority } : {}),
        ...(overlay.sourceBindings ? { sourceBindings: overlay.sourceBindings } : {}),
        ...(overlay.triggerRules ? { triggerRules: overlay.triggerRules } : {})
      }
      : scenario;
    return {
      config: withEffectiveRules(effective),
      mode: resolvedMode,
      versionId: pinnedVersionId ?? `sandbox-draft-${scenarioId}`
    };
  }
}

interface SandboxScenarioConfig extends BotScenario {}

/** BAI-878: retrieval-фрагмент trace песочницы; llm-поля отсутствуют у лексики. */
interface SandboxRetrievalTrace {
  cache: "hit" | "miss" | "skipped";
  cachedTokens?: number;
  fallbackReason?: string;
  passages: Array<{ preview: string; score: number; sourceId: string; title: string }>;
  retrievalMode?: "llm" | "llm_fallback";
  tokensUsed: number;
}

interface ResolvedSandboxScenario {
  config: SandboxScenarioConfig;
  mode: BotSandboxSessionMode;
  versionId: string;
}

function withEffectiveRules(scenario: BotScenario): SandboxScenarioConfig {
  return { ...scenario, triggerRules: effectiveTriggerRules(scenario) };
}

function normalizeMode(value: string | undefined): BotSandboxSessionMode | "auto" {
  return value === "draft" || value === "published" ? value : "auto";
}

function sandboxConversationId(sessionId: string): string {
  return `sandbox:${sessionId}`;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "message";
}

function evaluateTriggerTrace(scenario: SandboxScenarioConfig, text: string): BotSandboxTriggerTrace {
  const rules = scenario.triggerRules ?? [];
  const automatic = rules.filter((rule) => rule.type !== "manual");
  for (const rule of automatic) {
    const matched = rule.type === "new_conversation"
      ? true
      : rule.type === "always_except"
        ? matchesBotAlwaysExceptTrigger(text, rule.phrases, rule.matchMode ?? "contains", rule.locale)
        : Boolean(text) && (rule.phrases ?? []).some((phrase) => matchesBotTriggerPhrase(text, phrase, rule.matchMode ?? "contains", rule.locale));
    if (matched) {
      return { evaluated: true, matchMode: rule.matchMode ?? "contains", matched: true, phrases: rule.phrases ?? [], type: rule.type };
    }
  }
  const first = automatic[0] ?? rules[0];
  return first
    ? { evaluated: true, matchMode: first.matchMode ?? "contains", matched: first.type === "manual" ? null : false, phrases: first.phrases ?? [], type: first.type }
    : { evaluated: true, matched: null };
}

function extractBotMessages(result: AutomationBotRuntimeCommitResult): Array<BotSandboxBotMessage & { model?: string; usageTokens?: number }> {
  return result.step.sideEffects
    .filter((effect) => effect.kind === "message_delivery")
    .map((effect) => {
      const payload = (effect.descriptor as Record<string, unknown> | undefined)?.payload as Record<string, unknown> | undefined ?? {};
      return {
        citations: Array.isArray(payload.citations)
          ? (payload.citations as Array<Record<string, unknown>>).map((citation) => ({
            sourceId: String(citation.sourceId ?? ""),
            title: String(citation.title ?? ""),
            version: typeof citation.version === "number" ? citation.version : undefined
          }))
          : [],
        id: String(payload.messageId ?? `sbxbot_${randomUUID()}`),
        model: typeof payload.model === "string" ? payload.model : undefined,
        text: String(payload.text ?? ""),
        usageTokens: typeof payload.usageTokens === "number" ? payload.usageTokens : undefined
      };
    })
    .filter((message) => message.text.trim().length > 0);
}

function toPublicBotMessage(message: BotSandboxBotMessage & { model?: string; usageTokens?: number }): BotSandboxBotMessage {
  return { citations: message.citations, id: message.id, text: message.text };
}

function firstDefined<T>(values: Array<T | undefined>): T | undefined {
  return values.find((value) => value !== undefined);
}

function sandboxFailureEvent(code: string): BotSandboxEvent {
  const notes: Record<string, string> = {
    bot_runtime_conversation_inactive: "Бот уже завершил работу в этом диалоге. Начните тест заново.",
    bot_runtime_published_scenario_not_found: "Сценарий не запустился: нет опубликованной версии для выбранного канала.",
    bot_runtime_scenario_empty: "В сценарии нет шагов — добавьте хотя бы один шаг.",
    bot_runtime_transition_ambiguous: "Из текущего шага ведёт несколько переходов без выбранного варианта. Ответьте кнопкой или настройте переход «default».",
    bot_runtime_transition_edge_not_found: "Сценарий дошёл до конца ветки: из текущего шага нет перехода. Добавьте следующий шаг или включите консультационный режим AI-узла.",
    bot_runtime_webhook_host_not_allowed: "Webhook отклонён: адрес не входит в разрешённый список.",
    bot_runtime_webhook_https_required: "Webhook отклонён: разрешены только HTTPS-адреса."
  };
  return { kind: notes[code] ? "flow" : "error", note: notes[code] ?? `Шаг завершился ошибкой (${code}).`, reason: code };
}

function sandboxHandoffNote(reason: string): string {
  const notes: Record<string, string> = {
    ai_unavailable: "AI недоступен — диалог передан оператору с безопасным сообщением клиенту.",
    bot_ai_concurrency_limit_reached: "Достигнут лимит одновременных AI-ответов — диалог передан оператору.",
    bot_ai_connection_not_ready: "AI-подключение не настроено или не готово — диалог передан оператору.",
    bot_ai_consultation_turn_limit: "Достигнут лимит реплик консультации — диалог передан оператору.",
    bot_ai_knowledge_not_ready: "Нет готовых источников знаний — диалог передан оператору.",
    bot_ai_flag_disabled: "AI-агент выключен для этой организации (флаг раскатки) — диалог передан оператору.",
    bot_ai_quota_exhausted: "Исчерпан месячный бюджет токенов — диалог передан оператору.",
    bot_ai_rate_limit_reached: "Превышен лимит запросов в минуту — диалог передан оператору.",
    client_requested_operator: "Клиент попросил живого оператора — диалог передан.",
    handoff_requested: "Сценарий передал диалог оператору по настроенному шагу.",
    policy_operator_only: "Тема из списка «только оператор» — диалог сразу передан человеку.",
    policy_source_required: "Ответ не подтверждён источником — по правилу «Рамки ответов» диалог передан оператору."
  };
  return notes[reason] ?? `Диалог передан оператору (${reason}).`;
}

/** Sandbox default: webhook nodes get a deterministic stub instead of real network calls. */
const sandboxWebhookStub: typeof fetch = async () =>
  new Response(JSON.stringify({ note: "sandbox webhook stub: real call skipped", sandbox: true }), {
    headers: { "content-type": "application/json" },
    status: 200
  });
