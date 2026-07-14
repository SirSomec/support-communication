import { randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
import type { BotFlowNode, BotScenario, BotTriggerRule } from "./automation.types.js";
import {
  AutomationRepository,
  type AutomationBotRuntimeCommitResult,
  type AutomationBotRuntimeInstance,
  type AutomationBotRuntimeStep,
  type AutomationBotScenarioVersion
} from "./automation.repository.js";
import { planBotRuntimeConsultationStay, planBotRuntimeLabeledTransition, resolveBotRuntimeDeadLetterState, resolveBotRuntimeRetryState } from "./bot-runtime.worker.js";
import type { BotRuntimeSideEffect, BotRuntimeStateTransition } from "./bot-runtime.worker.js";
import { matchesBotAlwaysExceptTrigger, matchesBotTriggerPhrase } from "./bot-trigger-matcher.js";
import { AiBotResponseService, type AiBotResponse } from "./ai-bot-response.service.js";
import { evaluatePostPolicy, evaluatePrePolicy, normalizeAgentPolicy } from "./agent-policy.js";
import { evaluateAiAgentsPilot } from "./ai-agents-pilot.js";
import { recordBotHandoff, recordBotTriggerMatch } from "./bot-observability.js";
import type { FeatureFlag } from "../platform/platform.types.js";

export interface BotRuntimeInboundEvent {
  channel: string;
  conversationId: string;
  eventId: string;
  payload?: Record<string, unknown>;
  scenarioId?: string;
  tenantId: string;
  traceId: string;
}

export interface BotRuntimeOptions {
  aiResponder?: Pick<AiBotResponseService, "respond">;
  featureFlags?: FeatureFlag[];
  fetch?: typeof fetch;
  maxAttempts?: number;
  now?: () => Date;
  webhookAllowlist?: string[];
  webhookTimeoutMs?: number;
}

export class BotRuntimeService {
  constructor(private readonly repository: AutomationRepository, private readonly options: BotRuntimeOptions = {}) {}

  async handleInboundEvent(event: BotRuntimeInboundEvent): Promise<AutomationBotRuntimeCommitResult> {
    validateEvent(event);
    const replay = await this.repository.findBotRuntimeStepAsync(event.tenantId, event.conversationId, event.eventId);
    if (replay) {
      const instance = await this.repository.findBotRuntimeInstanceAsync(event.tenantId, event.conversationId);
      if (!instance) throw new Error("bot_runtime_instance_not_found");
      return { instance, outcome: "duplicate", step: replay };
    }

    const existing = await this.repository.findBotRuntimeInstanceAsync(event.tenantId, event.conversationId);
    if (existing && (existing.status === "handoff" || existing.status === "completed")) throw new Error("bot_runtime_conversation_inactive");
    const resolved = await this.resolveScenario(event, existing);
    const now = (this.options.now?.() ?? new Date()).toISOString();
    const initialNodeId = resolved.scenario.flowNodes.find((node) => node.id === "start")?.id ?? resolved.scenario.flowNodes[0]?.id;
    if (!initialNodeId) throw new Error("bot_runtime_scenario_empty");
    const currentNodeId = existing?.currentNodeId ?? initialNodeId;
    const currentNode = resolved.scenario.flowNodes.find((item) => item.id === currentNodeId);
    const consultationStay = Boolean(existing)
      && currentNode?.type === "ai_reply"
      && isConsultationNode(currentNode)
      && isPlainTextEvent(event.payload ?? {});
    const edgeLabel = consultationStay ? undefined : selectEdgeLabel(resolved.scenario, currentNodeId, event.payload ?? {});
    let transition: BotRuntimeStateTransition;
    try {
      transition = consultationStay
        ? planBotRuntimeConsultationStay({
          channel: event.channel,
          conversationId: event.conversationId,
          currentNodeId,
          eventId: event.eventId,
          scenario: resolved.scenario,
          tenantId: event.tenantId,
          traceId: event.traceId
        })
        : planBotRuntimeLabeledTransition({
          channel: event.channel,
          conversationId: event.conversationId,
          currentNodeId,
          edgeLabel,
          eventId: event.eventId,
          scenario: resolved.scenario,
          tenantId: event.tenantId,
          traceId: event.traceId
        });
      const node = resolved.scenario.flowNodes.find((item) => item.id === transition.nextNodeId)!;
      const executed = await this.executeNode(
        node,
        event,
        existing?.context ?? {},
        resolved.scenario.sourceBindings ?? [],
        resolved.version.versionId,
        resolved.scenario.id,
        resolved.scenario.basePrompt
      );
      applyGeneratedMessage(transition.sideEffects, executed.aiResponse);
      if (executed.outcome === "ai_handoff_requested" && executed.handoffSummary) transition.sideEffects.push(createAiFailureHandoff(event, node, executed.handoffSummary));
      if (executed.outcome === "handed_off" || executed.outcome === "ai_handoff_requested") {
        const context = executed.context as Record<string, unknown>;
        recordBotHandoff({
          reason: String(executed.handoffSummary?.reason ?? context.lastAiFailure ?? executed.outcome),
          scenarioId: resolved.scenario.id,
          tenantId: event.tenantId
        });
      }
      const instance = makeInstance(existing, event, resolved.version, transition.nextNodeId, executed.status, executed.context, now);
      const step = makeStep(instance, event, node, executed, transition.sideEffects, now);
      return this.repository.commitBotRuntimeTransitionAsync({ expectedCurrentNodeId: existing?.currentNodeId, instance, step });
    } catch (error) {
      return this.commitFailure(existing, event, resolved.version, currentNodeId, error, now);
    }
  }

  async retryInboundEvent(event: BotRuntimeInboundEvent): Promise<AutomationBotRuntimeCommitResult> {
    const instance = await this.repository.findBotRuntimeInstanceAsync(event.tenantId, event.conversationId);
    if (!instance || instance.status !== "retry_scheduled") throw new Error("bot_runtime_retry_not_scheduled");
    const now = this.options.now?.() ?? new Date();
    if (instance.nextAttemptAt && new Date(instance.nextAttemptAt).getTime() > now.getTime()) throw new Error("bot_runtime_retry_not_due");
    return this.handleInboundEvent({ ...event, eventId: `${event.eventId}:retry:${instance.attempts}` });
  }

  async rollbackToPublishedVersion(tenantId: string, scenarioId: string, versionId: string): Promise<BotScenario> {
    const scenario = await this.repository.findBotScenario(scenarioId);
    const version = await this.repository.findBotScenarioVersion(versionId);
    if (!scenario || scenario.tenantId !== tenantId || !version || version.tenantId !== tenantId || version.scenarioId !== scenarioId || version.status !== "published") {
      throw new Error("bot_runtime_rollback_version_not_found");
    }
    return this.repository.saveBotScenario({
      ...scenario,
      activeVersionId: version.versionId,
      basePrompt: version.basePrompt ?? scenario.basePrompt,
      flowEdges: version.flowEdges,
      flowNodes: version.flowNodes,
      priority: version.priority ?? scenario.priority,
      status: "published",
      sourceBindings: version.sourceBindings ?? scenario.sourceBindings,
      triggerRules: version.triggerRules ?? scenario.triggerRules
    });
  }

  private async resolveScenario(event: BotRuntimeInboundEvent, existing?: AutomationBotRuntimeInstance): Promise<{ scenario: BotScenario; version: AutomationBotScenarioVersion }> {
    const state = await this.repository.readStateAsync();
    const scenarioId = existing?.scenarioId ?? event.scenarioId;
    const evaluatingTrigger = !scenarioId;
    const candidates = state.botScenarios.filter((item) => item.tenantId === event.tenantId
      && (!scenarioId || item.id === scenarioId)
      && item.channels.includes(event.channel)
      && (existing ? true : item.enabled !== false && item.status === "published"))
      .map((item) => withEffectiveTriggerRules(item, state.botScenarioVersions));
    const scenario = scenarioId
      ? candidates[0]
      : candidates
        .flatMap((item) => matchingTrigger(item, event.payload ?? {})?.map((rule) => ({ rule, scenario: item })) ?? [])
        .sort((left, right) => scenarioTriggerPriority(right.scenario, right.rule) - scenarioTriggerPriority(left.scenario, left.rule)
          || left.scenario.id.localeCompare(right.scenario.id)
          || left.rule.id.localeCompare(right.rule.id))[0]?.scenario;
    if (evaluatingTrigger) {
      recordBotTriggerMatch({
        channel: event.channel,
        result: scenario ? "matched" : "no_match",
        scenarioId: scenario?.id,
        tenantId: event.tenantId
      });
    }
    if (!scenario) throw new Error("bot_runtime_published_scenario_not_found");
    const versions = state.botScenarioVersions.filter((item) => item.tenantId === event.tenantId && item.scenarioId === scenario.id && item.status === "published");
    const version = existing
      ? versions.find((item) => item.versionId === existing.versionId)
      : versions.find((item) => item.versionId === scenario.activeVersionId) ?? versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!version) throw new Error(existing ? "bot_runtime_pinned_version_not_found" : "bot_runtime_published_version_not_found");
    return {
      scenario: {
        ...scenario,
        basePrompt: version.basePrompt ?? scenario.basePrompt,
        flowEdges: version.flowEdges,
        flowNodes: version.flowNodes,
        priority: version.priority ?? scenario.priority,
        sourceBindings: version.sourceBindings ?? scenario.sourceBindings,
        triggerRules: effectiveTriggerRules({
          ...scenario,
          triggerRules: version.triggerRules ?? scenario.triggerRules,
          flowNodes: version.flowNodes?.length ? version.flowNodes : scenario.flowNodes
        })
      },
      version
    };
  }

  private async executeNode(
    node: BotFlowNode,
    event: BotRuntimeInboundEvent,
    previous: Record<string, unknown>,
    sourceBindings: import("./automation.types.js").KnowledgeSourceBinding[],
    scenarioRevisionId?: string,
    scenarioId?: string,
    basePrompt?: string
  ) {
    const context = { ...previous, ...(event.payload?.context as Record<string, unknown> | undefined ?? {}) };
    if (node.type === "contact_request") {
      const field = String(node.config?.field ?? "contact");
      const value = event.payload?.value;
      if (value !== undefined) context[field] = value;
      return { context, outcome: value === undefined ? "contact_requested" : "contact_collected", status: "active" as const };
    }
    if (node.type === "webhook") {
      const webhookResponse = await this.callWebhook(node, event, context);
      return { context: { ...context, webhook: webhookResponse }, outcome: "webhook_succeeded", status: "active" as const, webhookResponse };
    }
    if (node.type === "handoff") {
      return {
        context,
        handoffSummary: {
          botId: scenarioId ?? event.scenarioId,
          collectedFields: redactObject(context),
          nodeId: node.id,
          queue: node.title ?? "default",
          reason: "handoff_requested"
        },
        outcome: "handed_off",
        status: "handoff" as const
      };
    }
    if (node.type === "ai_reply") {
      const message = inboundText(event.payload ?? {});
      if (!message) throw new Error("bot_ai_message_required");
      const policy = normalizeAgentPolicy(node.config);
      if (isConsultationNode(node)) {
        const consultationTurns = Number(context.consultationTurns ?? 0);
        if (wantsHumanOperator(message, node)) {
          return consultationHandoffResult(node, event, context, scenarioId, "client_requested_operator",
            String(node.config?.handoffAcknowledgement ?? "Хорошо, передаю диалог оператору — он продолжит с этого места."));
        }
        if (consultationTurns >= consultationMaxTurns(node)) {
          return consultationHandoffResult(node, event, context, scenarioId, "bot_ai_consultation_turn_limit",
            String(node.config?.turnLimitMessage ?? node.config?.fallbackMessage ?? "Чтобы вам точно помогли, передаю диалог оператору."));
        }
      }
      // BAI-842: pre-policy — запрещённые темы (вежливый отказ) и «только оператор» (handoff) до вызова модели.
      const preDecision = evaluatePrePolicy(message, policy);
      if (preDecision.action === "handoff") {
        return consultationHandoffResult(node, event, context, scenarioId, preDecision.reason,
          String(node.config?.operatorOnlyMessage ?? "Этот вопрос лучше решит оператор — передаю диалог ему."));
      }
      if (preDecision.action === "refuse") {
        return {
          aiResponse: { citations: [], model: "policy", text: preDecision.message },
          context: { ...context, lastPolicyDecision: preDecision.reason },
          outcome: "policy_refused",
          policyDecision: preDecision.reason,
          status: "active" as const
        };
      }
      if (this.options.featureFlags) {
        const pilot = evaluateAiAgentsPilot({ flags: this.options.featureFlags, tenantId: event.tenantId });
        if (!pilot.eligible) {
          const handoffSummary = {
            botId: scenarioId ?? event.scenarioId ?? "",
            collectedFields: redactObject(context),
            nodeId: node.id,
            queue: String(node.config?.handoffQueue ?? "default"),
            reason: "bot_ai_pilot_disabled"
          };
          return {
            aiResponse: {
              citations: [],
              model: "unavailable",
              text: String(node.config?.fallbackMessage ?? "AI-агент временно отключён для этого tenant. Передаю вопрос специалисту.")
            },
            context: { ...context, lastAiFailure: "bot_ai_pilot_disabled", pilotReason: pilot.reason },
            handoffSummary,
            outcome: "ai_handoff_requested",
            status: "handoff" as const
          };
        }
      }
      try {
        const aiResponse = await (this.options.aiResponder ?? new AiBotResponseService()).respond({
          basePrompt,
          behaviorRules: policy.behaviorRules || undefined,
          conversationId: event.conversationId,
          instructions: typeof node.config?.instructions === "string" ? node.config.instructions : node.title,
          message,
          retrievalScoreThreshold: policy.retrievalScoreThreshold,
          scenarioId: scenarioId ?? event.scenarioId,
          scenarioRevisionId,
          sourceBindings,
          tenantId: event.tenantId
        });
        // BAI-842: post-policy — фактический ответ без источника (при наличии знаний) передаём оператору.
        const postDecision = evaluatePostPolicy(aiResponse.citations.length, aiResponse.materialsAvailable ?? 0, policy);
        if (postDecision.action === "handoff") {
          return consultationHandoffResult(node, event, context, scenarioId, postDecision.reason,
            String(node.config?.fallbackMessage ?? "Не нашёл это в проверенных материалах — передаю вопрос оператору, чтобы не ошибиться."));
        }
        return {
          aiResponse,
          context: {
            ...context,
            ...(isConsultationNode(node) ? { consultationTurns: Number(context.consultationTurns ?? 0) + 1 } : {}),
            lastAiResponse: { citations: aiResponse.citations, model: aiResponse.model }
          },
          outcome: "ai_reply_queued",
          status: "active" as const
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "bot_ai_unavailable";
        const handoffSummary = {
          botId: scenarioId ?? event.scenarioId ?? "",
          collectedFields: redactObject(context),
          nodeId: node.id,
          queue: String(node.config?.handoffQueue ?? "default"),
          reason: reason.startsWith("bot_ai_") ? reason : "ai_unavailable"
        };
        return {
          aiResponse: {
            citations: [],
            model: "unavailable",
            text: String(node.config?.fallbackMessage ?? "Сейчас я не могу надёжно ответить по материалам. Передам вопрос специалисту.")
          },
          context: { ...context, lastAiFailure: reason },
          handoffSummary,
          outcome: "ai_handoff_requested",
          status: "handoff" as const
        };
      }
    }
    if (node.type === "fallback") return { context, outcome: "fallback", status: "active" as const };
    if (node.type === "quick_replies") return { context, outcome: "quick_replies_sent", status: "active" as const };
    if (node.type === "condition") return { context, outcome: "condition_evaluated", status: "active" as const };
    return { context, outcome: "message_queued", status: "active" as const };
  }

  private async callWebhook(node: BotFlowNode, event: BotRuntimeInboundEvent, context: Record<string, unknown>): Promise<Record<string, unknown>> {
    const url = new URL(String(node.config?.url ?? ""));
    if (url.protocol !== "https:") throw new Error("bot_runtime_webhook_https_required");
    const allowlist = this.options.webhookAllowlist ?? splitAllowlist(process.env.BOT_RUNTIME_WEBHOOK_ALLOWLIST);
    if (!allowlist.includes(url.hostname.toLowerCase())) throw new Error("bot_runtime_webhook_host_not_allowed");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.webhookTimeoutMs ?? 3000);
    try {
      const response = await (this.options.fetch ?? fetch)(url, {
        body: JSON.stringify({ context, event: event.payload ?? {}, eventId: event.eventId }),
        headers: { "content-type": "application/json" }, method: "POST", redirect: "error", signal: controller.signal
      });
      const text = (await response.text()).slice(0, 8192);
      if (!response.ok) throw new Error(`bot_runtime_webhook_http_${response.status}: ${redactSensitiveText(text)}`);
      return { body: scrubSensitiveText(text), status: response.status };
    } finally { clearTimeout(timeout); }
  }

  private async commitFailure(existing: AutomationBotRuntimeInstance | undefined, event: BotRuntimeInboundEvent, version: AutomationBotScenarioVersion, currentNodeId: string, error: unknown, now: string) {
    const attempts = (existing?.attempts ?? 0) + 1;
    const max = this.options.maxAttempts ?? 3;
    const state = attempts >= max
      ? resolveBotRuntimeDeadLetterState({ currentAttempts: attempts - 1, error: error instanceof Error ? error : String(error), failedAt: now })
      : resolveBotRuntimeRetryState({ currentAttempts: attempts - 1, error: error instanceof Error ? error : String(error), failedAt: now, retryBackoffMs: Math.min(60_000, 1000 * 2 ** (attempts - 1)) });
    const instance = makeInstance(existing, event, version, currentNodeId, state.status, existing?.context ?? {}, now, state.attempts, state.lastError, state.nextAttemptAt);
    const node = version.flowNodes.find((item) => item.id === currentNodeId) ?? { id: currentNodeId, type: "fallback" };
    const step = makeStep(instance, event, node, { context: instance.context, error: state.lastError, outcome: state.status, status: state.status }, [], now);
    return this.repository.commitBotRuntimeTransitionAsync({ expectedCurrentNodeId: existing?.currentNodeId, instance, step });
  }
}

function applyGeneratedMessage(sideEffects: unknown[], response: AiBotResponse | undefined): void {
  if (!response) return;
  for (const effect of sideEffects as Array<{ kind?: string; descriptor?: { payload?: Record<string, unknown> } }>) {
    if (effect.kind !== "message_delivery" || !effect.descriptor?.payload) continue;
    effect.descriptor.payload.text = response.text;
    effect.descriptor.payload.citations = response.citations.map((citation) => ({ sourceId: citation.sourceId, title: citation.title, version: citation.version }));
    if (response.usage) effect.descriptor.payload.usageTokens = response.usage.totalTokens;
    effect.descriptor.payload.model = response.model;
  }
}

const DEFAULT_CONSULTATION_MAX_TURNS = 10;
const CONSULTATION_MAX_TURNS_LIMIT = 30;
/** Token-mode phrases; each multi-word phrase requires all of its words. Node config `handoffPhrases` replaces the defaults. */
const DEFAULT_HUMAN_HANDOFF_PHRASES = [
  "оператор", "оператора", "оператору", "оператором", "операторы",
  "живой человек", "живым человеком", "реальный человек",
  "operator", "live agent", "real person", "human agent", "talk to a human"
];

/** Consultation mode keeps the dialog on the ai_reply node across client messages. Opt-in per node. */
export function isConsultationNode(node: Pick<BotFlowNode, "config" | "type">): boolean {
  return node.type === "ai_reply" && node.config?.consultationMode === true;
}

export function consultationMaxTurns(node: Pick<BotFlowNode, "config">): number {
  const value = Number(node.config?.maxTurns);
  return Number.isInteger(value) && value >= 1 && value <= CONSULTATION_MAX_TURNS_LIMIT ? value : DEFAULT_CONSULTATION_MAX_TURNS;
}

export function wantsHumanOperator(message: string, node?: Pick<BotFlowNode, "config">): boolean {
  const configured = Array.isArray(node?.config?.handoffPhrases)
    ? (node.config.handoffPhrases as unknown[]).filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const phrases = configured.length ? configured : DEFAULT_HUMAN_HANDOFF_PHRASES;
  return phrases.some((phrase) => matchesBotTriggerPhrase(message, phrase, "tokens"));
}

function isPlainTextEvent(payload: Record<string, unknown>): boolean {
  return Boolean(inboundText(payload)) && payload.quickReply === undefined && payload.condition === undefined && payload.value === undefined;
}

function consultationHandoffResult(
  node: BotFlowNode,
  event: BotRuntimeInboundEvent,
  context: Record<string, unknown>,
  scenarioId: string | undefined,
  reason: string,
  text: string
) {
  return {
    aiResponse: { citations: [], model: "none", text },
    context: { ...context, lastAiFailure: reason },
    handoffSummary: {
      botId: scenarioId ?? event.scenarioId ?? "",
      collectedFields: redactObject(context),
      nodeId: node.id,
      queue: String(node.config?.handoffQueue ?? "default"),
      reason
    },
    outcome: "ai_handoff_requested",
    status: "handoff" as const
  };
}

function createAiFailureHandoff(event: BotRuntimeInboundEvent, node: BotFlowNode, summary: { botId?: string; collectedFields: Record<string, unknown>; nodeId: string; queue: string; reason?: string }): BotRuntimeSideEffect {
  return {
    descriptor: {
      eventId: `evt_bot_handoff_${sanitizeIdentifierSegment(event.eventId)}_${sanitizeIdentifierSegment(node.id)}`,
      eventName: "bot.handoff.created",
      resourceId: event.conversationId,
      resourceType: "conversation",
      schemaVersion: "bot-handoff/v1",
      summary: { botId: summary.botId ?? event.scenarioId ?? "", nodeId: summary.nodeId, queue: summary.queue, reason: summary.reason ?? "handoff_requested" },
      tenantId: event.tenantId,
      traceId: event.traceId
    },
    kind: "bot_handoff"
  };
}

function sanitizeIdentifierSegment(value: string): string { return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "event"; }

function withEffectiveTriggerRules(scenario: BotScenario, versions: AutomationBotScenarioVersion[]): BotScenario {
  const published = versions
    .filter((item) => item.tenantId === scenario.tenantId && item.scenarioId === scenario.id && item.status === "published")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const version = published.find((item) => item.versionId === scenario.activeVersionId) ?? published[0];
  return {
    ...scenario,
    flowNodes: version?.flowNodes?.length ? version.flowNodes : scenario.flowNodes,
    triggerRules: effectiveTriggerRules({
      ...scenario,
      flowNodes: version?.flowNodes?.length ? version.flowNodes : scenario.flowNodes,
      triggerRules: version?.triggerRules ?? scenario.triggerRules
    })
  };
}

/**
 * Wizard stores the selected trigger as the first flow-node title. Older publishes
 * sometimes persisted an empty triggerRules array; recover the intended rule so
 * runtime still matches instead of failing with bot_runtime_published_scenario_not_found.
 */
export function effectiveTriggerRules(scenario: Pick<BotScenario, "flowNodes" | "triggerRules">): BotTriggerRule[] {
  const rules = Array.isArray(scenario.triggerRules) ? scenario.triggerRules : [];
  if (rules.length) return rules;
  const title = String(scenario.flowNodes?.[0]?.title ?? "").trim();
  if (title === "Всегда, кроме") {
    return [{ id: "always-except-recovered", matchMode: "contains", phrases: [], priority: 0, type: "always_except" }];
  }
  if (title === "Первое сообщение клиента") {
    return [{ id: "new-conversation-recovered", priority: 0, type: "new_conversation" }];
  }
  return rules;
}

function matchingTrigger(scenario: BotScenario, payload: Record<string, unknown>): BotTriggerRule[] | null {
  const rules = effectiveTriggerRules(scenario);
  const text = inboundText(payload);
  return rules.filter((rule) => {
    if (rule.type === "manual") return false;
    if (rule.type === "new_conversation") return payload.isNewConversation === true;
    if (rule.type === "always_except") {
      return matchesBotAlwaysExceptTrigger(text, rule.phrases, rule.matchMode ?? "contains", rule.locale);
    }
    return Boolean(text) && (rule.phrases ?? []).some((phrase) => matchesBotTriggerPhrase(text!, phrase, rule.matchMode ?? "contains", rule.locale));
  });
}

function inboundText(payload: Record<string, unknown>): string | null {
  for (const value of [payload.text, payload.message, payload.content]) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function scenarioTriggerPriority(scenario: BotScenario, rule: BotTriggerRule): number {
  return Number(scenario.priority ?? 0) + Number(rule.priority ?? 0);
}

function selectEdgeLabel(scenario: BotScenario, nodeId: string, payload: Record<string, unknown>): string | undefined {
  const edges = scenario.flowEdges.filter((edge) => edge.from === nodeId);
  if (edges.length <= 1) return edges[0]?.label;
  const requested = String(payload.quickReply ?? payload.condition ?? payload.value ?? "");
  if (edges.some((edge) => edge.label === requested)) return requested;
  if (edges.some((edge) => edge.label === "default")) return "default";
  throw new Error("bot_runtime_transition_ambiguous");
}

function makeInstance(existing: AutomationBotRuntimeInstance | undefined, event: BotRuntimeInboundEvent, version: AutomationBotScenarioVersion, currentNodeId: string, status: AutomationBotRuntimeInstance["status"], context: Record<string, unknown>, now: string, attempts = 0, lastError: string | null = null, nextAttemptAt: string | null = null): AutomationBotRuntimeInstance {
  return { attempts, context: redactObject(context), conversationId: event.conversationId, createdAt: existing?.createdAt ?? now, currentNodeId, id: existing?.id ?? `bot_runtime_${randomUUID()}`, lastError, nextAttemptAt, scenarioId: version.scenarioId, status, tenantId: event.tenantId, updatedAt: now, versionId: version.versionId };
}

function makeStep(instance: AutomationBotRuntimeInstance, event: BotRuntimeInboundEvent, node: BotFlowNode, result: Record<string, unknown>, sideEffects: unknown[], now: string): AutomationBotRuntimeStep {
  return { conversationId: event.conversationId, createdAt: now, error: result.error ? redactSensitiveText(String(result.error)) : null, handoffSummary: (result.handoffSummary as Record<string, unknown>) ?? null, id: `bot_step_${randomUUID()}`, inputEvent: redactObject({ channel: event.channel, payload: event.payload ?? {}, scenarioId: event.scenarioId, traceId: event.traceId }), inputEventId: event.eventId, lifecycleEvent: { eventName: `bot.runtime.${String(result.outcome)}`, traceId: event.traceId }, nodeId: node.id, nodeType: node.type, outcome: String(result.outcome), runtimeId: instance.id, sideEffects: redactObject(sideEffects) as Array<Record<string, unknown>>, tenantId: event.tenantId, webhookResponse: (result.webhookResponse as Record<string, unknown>) ?? null };
}

function redactObject<T>(value: T): T { return JSON.parse(scrubSensitiveText(JSON.stringify(value))) as T; }
function scrubSensitiveText(value: string): string {
  return redactSensitiveText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\+?\d[\s().-]*){10,15}/g, "[REDACTED_PHONE]");
}
function splitAllowlist(value?: string): string[] { return (value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean); }
function validateEvent(event: BotRuntimeInboundEvent): void { if (!event.tenantId || !event.conversationId || !event.eventId || !event.traceId || !event.channel) throw new Error("bot_runtime_event_context_required"); }
