import { randomUUID } from "node:crypto";
import { redactSensitiveText } from "@support-communication/redaction";
import { planBotRuntimeConsultationStay, planBotRuntimeLabeledTransition, resolveBotRuntimeDeadLetterState, resolveBotRuntimeRetryState } from "./bot-runtime.worker.js";
import { matchesBotAlwaysExceptTrigger, matchesBotTriggerPhrase } from "./bot-trigger-matcher.js";
import { AiBotResponseService, extractAiDirectives } from "./ai-bot-response.service.js";
import { evaluatePostPolicy, evaluatePrePolicy, normalizeAgentPolicy } from "./agent-policy.js";
import { evaluateAiAgentsRollout, evaluateLlmRetrievalRollout, evaluateSemanticRetrievalRollout } from "./ai-agents-rollout.js";
import { recordBotHandoff, recordBotTriggerMatch } from "./bot-observability.js";
export class BotRuntimeService {
    repository;
    options;
    constructor(repository, options = {}) {
        this.repository = repository;
        this.options = options;
    }
    async handleInboundEvent(event) {
        validateEvent(event);
        const replay = await this.repository.findBotRuntimeStepAsync(event.tenantId, event.conversationId, event.eventId);
        if (replay) {
            const instance = await this.repository.findBotRuntimeInstanceAsync(event.tenantId, event.conversationId);
            if (!instance)
                throw new Error("bot_runtime_instance_not_found");
            return { instance, outcome: "duplicate", step: replay };
        }
        const existing = await this.repository.findBotRuntimeInstanceAsync(event.tenantId, event.conversationId);
        if (existing && (existing.status === "handoff" || existing.status === "completed"))
            throw new Error("bot_runtime_conversation_inactive");
        const resolved = await this.resolveScenario(event, existing);
        const now = (this.options.now?.() ?? new Date()).toISOString();
        const initialNodeId = resolved.scenario.flowNodes.find((node) => node.id === "start")?.id ?? resolved.scenario.flowNodes[0]?.id;
        if (!initialNodeId)
            throw new Error("bot_runtime_scenario_empty");
        const currentNodeId = existing?.currentNodeId ?? initialNodeId;
        const currentNode = resolved.scenario.flowNodes.find((item) => item.id === currentNodeId);
        const consultationStay = Boolean(existing)
            && currentNode?.type === "ai_reply"
            && isConsultationNode(currentNode)
            && isPlainTextEvent(event.payload ?? {});
        const edgeLabel = consultationStay ? undefined : selectEdgeLabel(resolved.scenario, currentNodeId, event.payload ?? {});
        let transition;
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
            const node = resolved.scenario.flowNodes.find((item) => item.id === transition.nextNodeId);
            const executed = await this.executeNode(node, event, existing?.context ?? {}, resolved.scenario.sourceBindings ?? [], resolved.version.versionId, resolved.scenario.id, resolved.scenario.basePrompt);
            applyGeneratedMessage(transition.sideEffects, executed.aiResponse);
            if (executed.outcome === "ai_handoff_requested" && executed.handoffSummary)
                transition.sideEffects.push(createAiFailureHandoff(event, node, executed.handoffSummary));
            const closeSummary = executed.closeSummary;
            if (executed.outcome === "ai_resolved" && closeSummary)
                transition.sideEffects.push(createAiResolutionClose(event, node, closeSummary));
            if (executed.outcome === "handed_off" || executed.outcome === "ai_handoff_requested") {
                const context = executed.context;
                recordBotHandoff({
                    reason: String(executed.handoffSummary?.reason ?? context.lastAiFailure ?? executed.outcome),
                    scenarioId: resolved.scenario.id,
                    tenantId: event.tenantId
                });
            }
            const instance = makeInstance(existing, event, resolved.version, transition.nextNodeId, executed.status, executed.context, now);
            const step = makeStep(instance, event, node, executed, transition.sideEffects, now);
            return this.repository.commitBotRuntimeTransitionAsync({ expectedCurrentNodeId: existing?.currentNodeId, instance, step });
        }
        catch (error) {
            return this.commitFailure(existing, event, resolved.version, currentNodeId, error, now);
        }
    }
    async retryInboundEvent(event) {
        const instance = await this.repository.findBotRuntimeInstanceAsync(event.tenantId, event.conversationId);
        if (!instance || instance.status !== "retry_scheduled")
            throw new Error("bot_runtime_retry_not_scheduled");
        const now = this.options.now?.() ?? new Date();
        if (instance.nextAttemptAt && new Date(instance.nextAttemptAt).getTime() > now.getTime())
            throw new Error("bot_runtime_retry_not_due");
        return this.handleInboundEvent({ ...event, eventId: `${event.eventId}:retry:${instance.attempts}` });
    }
    async rollbackToPublishedVersion(tenantId, scenarioId, versionId) {
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
            triggerRules: version.triggerRules?.length ? version.triggerRules : scenario.triggerRules
        });
    }
    async resolveScenario(event, existing) {
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
        if (!scenario)
            throw new Error("bot_runtime_published_scenario_not_found");
        const versions = state.botScenarioVersions.filter((item) => item.tenantId === event.tenantId && item.scenarioId === scenario.id && item.status === "published");
        const version = existing
            ? versions.find((item) => item.versionId === existing.versionId)
            : versions.find((item) => item.versionId === scenario.activeVersionId) ?? versions.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (!version)
            throw new Error(existing ? "bot_runtime_pinned_version_not_found" : "bot_runtime_published_version_not_found");
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
                    triggerRules: version.triggerRules?.length ? version.triggerRules : scenario.triggerRules,
                    flowNodes: version.flowNodes?.length ? version.flowNodes : scenario.flowNodes
                })
            },
            version
        };
    }
    async executeNode(node, event, previous, sourceBindings, scenarioRevisionId, scenarioId, basePrompt) {
        const context = { ...previous, ...(event.payload?.context ?? {}) };
        if (node.type === "contact_request") {
            const field = String(node.config?.field ?? "contact");
            const value = event.payload?.value;
            if (value !== undefined)
                context[field] = value;
            return { context, outcome: value === undefined ? "contact_requested" : "contact_collected", status: "active" };
        }
        if (node.type === "webhook") {
            const webhookResponse = await this.callWebhook(node, event, context);
            return { context: { ...context, webhook: webhookResponse }, outcome: "webhook_succeeded", status: "active", webhookResponse };
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
                status: "handoff"
            };
        }
        if (node.type === "ai_reply") {
            const message = inboundText(event.payload ?? {});
            if (!message)
                throw new Error("bot_ai_message_required");
            const policy = normalizeAgentPolicy(node.config);
            if (isConsultationNode(node)) {
                const consultationTurns = Number(context.consultationTurns ?? 0);
                if (wantsHumanOperator(message, node)) {
                    return consultationHandoffResult(node, event, context, scenarioId, "client_requested_operator", String(node.config?.handoffAcknowledgement ?? "Хорошо, передаю диалог оператору — он продолжит с этого места."));
                }
                if (consultationTurns >= consultationMaxTurns(node)) {
                    return consultationHandoffResult(node, event, context, scenarioId, "bot_ai_consultation_turn_limit", String(node.config?.turnLimitMessage ?? node.config?.fallbackMessage ?? "Чтобы вам точно помогли, передаю диалог оператору."));
                }
            }
            // BAI-842: pre-policy — запрещённые темы (вежливый отказ) и «только оператор» (handoff) до вызова модели.
            const preDecision = evaluatePrePolicy(message, policy);
            if (preDecision.action === "handoff") {
                return consultationHandoffResult(node, event, context, scenarioId, preDecision.reason, String(node.config?.operatorOnlyMessage ?? "Этот вопрос лучше решит оператор — передаю диалог ему."));
            }
            if (preDecision.action === "refuse") {
                return {
                    aiResponse: { citations: [], model: "policy", text: preDecision.message },
                    context: { ...context, lastPolicyDecision: preDecision.reason },
                    outcome: "policy_refused",
                    policyDecision: preDecision.reason,
                    status: "active"
                };
            }
            if (this.options.featureFlags) {
                const rollout = evaluateAiAgentsRollout({ flags: this.options.featureFlags, tenantId: event.tenantId });
                if (!rollout.eligible) {
                    const handoffSummary = {
                        botId: scenarioId ?? event.scenarioId ?? "",
                        collectedFields: redactObject(context),
                        nodeId: node.id,
                        queue: String(node.config?.handoffQueue ?? "default"),
                        reason: "bot_ai_flag_disabled"
                    };
                    return {
                        aiResponse: {
                            citations: [],
                            model: "unavailable",
                            text: String(node.config?.fallbackMessage ?? "AI-агент временно отключён для этого tenant. Передаю вопрос специалисту.")
                        },
                        context: { ...context, lastAiFailure: "bot_ai_flag_disabled", rolloutReason: rollout.reason },
                        handoffSummary,
                        outcome: "ai_handoff_requested",
                        status: "handoff"
                    };
                }
            }
            try {
                // BAI-877: «умный» поиск включается политикой сценария И тенант-флагом;
                // без featureFlags (тесты/песочница) доверяем политике. Неэлигибельность
                // тихо оставляет лексику — выключение флага мгновенно возвращает старое поведение.
                const llmRetrievalAllowed = !this.options.featureFlags
                    || evaluateLlmRetrievalRollout({ flags: this.options.featureFlags, tenantId: event.tenantId }).eligible;
                const semanticRetrievalAllowed = !this.options.featureFlags
                    || evaluateSemanticRetrievalRollout({ flags: this.options.featureFlags, tenantId: event.tenantId }).eligible;
                const rawResponse = await (this.options.aiResponder ?? new AiBotResponseService()).respond({
                    basePrompt,
                    behaviorRules: policy.behaviorRules || undefined,
                    conversationId: event.conversationId,
                    instructions: typeof node.config?.instructions === "string" ? node.config.instructions : node.title,
                    maxResponseTokens: policy.maxResponseTokens,
                    message,
                    retrievalMode: policy.retrievalMode === "llm" && llmRetrievalAllowed
                        ? "llm"
                        : policy.retrievalMode === "semantic" && semanticRetrievalAllowed ? "semantic" : "lexical",
                    retrievalScoreThreshold: policy.retrievalScoreThreshold,
                    scenarioId: scenarioId ?? event.scenarioId,
                    scenarioRevisionId,
                    sourceBindings,
                    tenantId: event.tenantId
                });
                // Директивы модели: флаги уже выставлены сервисом, но маркеры
                // зачищаются и здесь — кастомный aiResponder мог вернуть сырой текст.
                // Клиент сервисные маркеры не видит ни при каком ответчике.
                const directive = extractAiDirectives(rawResponse.text);
                const aiResponse = { ...rawResponse, text: directive.text };
                // При обоих маркерах приоритет у передачи оператору: закрытие
                // необратимее, пусть спорный случай посмотрит человек.
                if (rawResponse.handoffRequested === true || directive.handoffRequested) {
                    return {
                        aiResponse: aiResponse.text.trim()
                            ? aiResponse
                            : { ...aiResponse, text: String(node.config?.handoffAcknowledgement ?? "Передаю диалог оператору — он продолжит с этого места.") },
                        context: { ...context, lastAiFailure: "ai_requested_handoff" },
                        handoffSummary: {
                            botId: scenarioId ?? event.scenarioId ?? "",
                            collectedFields: redactObject(context),
                            nodeId: node.id,
                            queue: String(node.config?.handoffQueue ?? "default"),
                            reason: "ai_requested_handoff"
                        },
                        outcome: "ai_handoff_requested",
                        status: "handoff"
                    };
                }
                // Клиент явно подтвердил решение — обращение закрывается штатным
                // переходом (история, resolutionOutcome, CSAT) через side effect;
                // проверка до post-policy: прощальная реплика не обязана цитировать.
                if (rawResponse.resolveRequested === true || directive.resolveRequested) {
                    return {
                        aiResponse: aiResponse.text.trim()
                            ? aiResponse
                            : { ...aiResponse, text: String(node.config?.resolveAcknowledgement ?? "Рад был помочь! Если появятся вопросы — напишите нам.") },
                        closeSummary: {
                            botId: scenarioId ?? event.scenarioId ?? "",
                            nodeId: node.id,
                            reason: "ai_resolved",
                            resolutionOutcome: "resolved"
                        },
                        context: { ...context, lastAiOutcome: "ai_resolved" },
                        outcome: "ai_resolved",
                        status: "completed"
                    };
                }
                // BAI-842: post-policy — фактический ответ без источника (при наличии знаний) передаём оператору.
                const postDecision = evaluatePostPolicy(aiResponse.citations.length, aiResponse.materialsAvailable ?? 0, policy);
                if (postDecision.action === "handoff") {
                    return consultationHandoffResult(node, event, context, scenarioId, postDecision.reason, String(node.config?.fallbackMessage ?? "Не нашёл это в проверенных материалах — передаю вопрос оператору, чтобы не ошибиться."));
                }
                return {
                    aiResponse,
                    context: {
                        ...context,
                        ...(isConsultationNode(node) ? { consultationTurns: Number(context.consultationTurns ?? 0) + 1 } : {}),
                        lastAiResponse: { citations: aiResponse.citations, model: aiResponse.model }
                    },
                    outcome: "ai_reply_queued",
                    status: "active"
                };
            }
            catch (error) {
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
                    status: "handoff"
                };
            }
        }
        if (node.type === "fallback")
            return { context, outcome: "fallback", status: "active" };
        if (node.type === "quick_replies")
            return { context, outcome: "quick_replies_sent", status: "active" };
        if (node.type === "condition")
            return { context, outcome: "condition_evaluated", status: "active" };
        return { context, outcome: "message_queued", status: "active" };
    }
    async callWebhook(node, event, context) {
        const url = new URL(String(node.config?.url ?? ""));
        if (url.protocol !== "https:")
            throw new Error("bot_runtime_webhook_https_required");
        const allowlist = this.options.webhookAllowlist ?? splitAllowlist(process.env.BOT_RUNTIME_WEBHOOK_ALLOWLIST);
        if (!allowlist.includes(url.hostname.toLowerCase()))
            throw new Error("bot_runtime_webhook_host_not_allowed");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.options.webhookTimeoutMs ?? 3000);
        try {
            const response = await (this.options.fetch ?? fetch)(url, {
                body: JSON.stringify({ context, event: event.payload ?? {}, eventId: event.eventId }),
                headers: { "content-type": "application/json" }, method: "POST", redirect: "error", signal: controller.signal
            });
            const text = (await response.text()).slice(0, 8192);
            if (!response.ok)
                throw new Error(`bot_runtime_webhook_http_${response.status}: ${redactSensitiveText(text)}`);
            return { body: scrubSensitiveText(text), status: response.status };
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async commitFailure(existing, event, version, currentNodeId, error, now) {
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
function applyGeneratedMessage(sideEffects, response) {
    if (!response)
        return;
    for (const effect of sideEffects) {
        if (effect.kind !== "message_delivery" || !effect.descriptor?.payload)
            continue;
        effect.descriptor.payload.text = response.text;
        effect.descriptor.payload.citations = response.citations.map((citation) => ({ sourceId: citation.sourceId, title: citation.title, version: citation.version }));
        if (response.usage)
            effect.descriptor.payload.usageTokens = response.usage.totalTokens;
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
export function isConsultationNode(node) {
    return node.type === "ai_reply" && node.config?.consultationMode === true;
}
export function consultationMaxTurns(node) {
    const value = Number(node.config?.maxTurns);
    return Number.isInteger(value) && value >= 1 && value <= CONSULTATION_MAX_TURNS_LIMIT ? value : DEFAULT_CONSULTATION_MAX_TURNS;
}
export function wantsHumanOperator(message, node) {
    const configured = Array.isArray(node?.config?.handoffPhrases)
        ? node.config.handoffPhrases.filter((item) => typeof item === "string" && item.trim().length > 0)
        : [];
    const phrases = configured.length ? configured : DEFAULT_HUMAN_HANDOFF_PHRASES;
    return phrases.some((phrase) => matchesBotTriggerPhrase(message, phrase, "tokens"));
}
function isPlainTextEvent(payload) {
    return Boolean(inboundText(payload)) && payload.quickReply === undefined && payload.condition === undefined && payload.value === undefined;
}
function consultationHandoffResult(node, event, context, scenarioId, reason, text) {
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
        status: "handoff"
    };
}
function createAiResolutionClose(event, node, summary) {
    return {
        descriptor: {
            eventId: `evt_bot_resolution_${sanitizeIdentifierSegment(event.eventId)}_${sanitizeIdentifierSegment(node.id)}`,
            eventName: "bot.resolution.completed",
            resourceId: event.conversationId,
            resourceType: "conversation",
            schemaVersion: "bot-resolution/v1",
            summary: {
                botId: summary.botId ?? event.scenarioId ?? "",
                nodeId: summary.nodeId,
                reason: summary.reason ?? "ai_resolved",
                resolutionOutcome: summary.resolutionOutcome ?? "resolved"
            },
            tenantId: event.tenantId,
            traceId: event.traceId
        },
        kind: "conversation_close"
    };
}
function createAiFailureHandoff(event, node, summary) {
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
function sanitizeIdentifierSegment(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "event"; }
function withEffectiveTriggerRules(scenario, versions) {
    const published = versions
        .filter((item) => item.tenantId === scenario.tenantId && item.scenarioId === scenario.id && item.status === "published")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const version = published.find((item) => item.versionId === scenario.activeVersionId) ?? published[0];
    // Repository normalization stores "no version-level rules" as an empty array
    // (a null Prisma column also reads back as []), so an empty array must fall
    // back to the scenario rules instead of shadowing them.
    return {
        ...scenario,
        flowNodes: version?.flowNodes?.length ? version.flowNodes : scenario.flowNodes,
        triggerRules: effectiveTriggerRules({
            ...scenario,
            flowNodes: version?.flowNodes?.length ? version.flowNodes : scenario.flowNodes,
            triggerRules: version?.triggerRules?.length ? version.triggerRules : scenario.triggerRules
        })
    };
}
/**
 * Wizard stores the selected trigger as the first flow-node title. Older publishes
 * sometimes persisted an empty triggerRules array; recover the intended rule so
 * runtime still matches instead of failing with bot_runtime_published_scenario_not_found.
 */
export function effectiveTriggerRules(scenario) {
    const rules = Array.isArray(scenario.triggerRules) ? scenario.triggerRules : [];
    if (rules.length)
        return rules;
    const title = String(scenario.flowNodes?.[0]?.title ?? "").trim();
    if (title === "Всегда, кроме") {
        return [{ id: "always-except-recovered", matchMode: "contains", phrases: [], priority: 0, type: "always_except" }];
    }
    if (title === "Первое сообщение клиента") {
        return [{ id: "new-conversation-recovered", priority: 0, type: "new_conversation" }];
    }
    return rules;
}
function matchingTrigger(scenario, payload) {
    const rules = effectiveTriggerRules(scenario);
    const text = inboundText(payload);
    return rules.filter((rule) => {
        if (rule.type === "manual")
            return false;
        if (rule.type === "new_conversation")
            return payload.isNewConversation === true;
        if (rule.type === "always_except") {
            return matchesBotAlwaysExceptTrigger(text, rule.phrases, rule.matchMode ?? "contains", rule.locale);
        }
        return Boolean(text) && (rule.phrases ?? []).some((phrase) => matchesBotTriggerPhrase(text, phrase, rule.matchMode ?? "contains", rule.locale));
    });
}
function inboundText(payload) {
    for (const value of [payload.text, payload.message, payload.content]) {
        if (typeof value === "string" && value.trim())
            return value;
    }
    return null;
}
function scenarioTriggerPriority(scenario, rule) {
    return Number(scenario.priority ?? 0) + Number(rule.priority ?? 0);
}
function selectEdgeLabel(scenario, nodeId, payload) {
    const edges = scenario.flowEdges.filter((edge) => edge.from === nodeId);
    if (edges.length <= 1)
        return edges[0]?.label;
    const requested = String(payload.quickReply ?? payload.condition ?? payload.value ?? "");
    if (edges.some((edge) => edge.label === requested))
        return requested;
    if (edges.some((edge) => edge.label === "default"))
        return "default";
    throw new Error("bot_runtime_transition_ambiguous");
}
function makeInstance(existing, event, version, currentNodeId, status, context, now, attempts = 0, lastError = null, nextAttemptAt = null) {
    return { attempts, context: redactObject(context), conversationId: event.conversationId, createdAt: existing?.createdAt ?? now, currentNodeId, id: existing?.id ?? `bot_runtime_${randomUUID()}`, lastError, nextAttemptAt, scenarioId: version.scenarioId, status, tenantId: event.tenantId, updatedAt: now, versionId: version.versionId };
}
function makeStep(instance, event, node, result, sideEffects, now) {
    return { conversationId: event.conversationId, createdAt: now, error: result.error ? redactSensitiveText(String(result.error)) : null, handoffSummary: result.handoffSummary ?? null, id: `bot_step_${randomUUID()}`, inputEvent: redactObject({ channel: event.channel, payload: event.payload ?? {}, scenarioId: event.scenarioId, traceId: event.traceId }), inputEventId: event.eventId, lifecycleEvent: { eventName: `bot.runtime.${String(result.outcome)}`, traceId: event.traceId }, nodeId: node.id, nodeType: node.type, outcome: String(result.outcome), runtimeId: instance.id, sideEffects: redactObject(sideEffects), tenantId: event.tenantId, webhookResponse: result.webhookResponse ?? null };
}
function redactObject(value) { return JSON.parse(scrubSensitiveText(JSON.stringify(value))); }
function scrubSensitiveText(value) {
    return redactSensitiveText(value)
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
        .replace(/(?:\+?\d[\s().-]*){10,15}/g, "[REDACTED_PHONE]");
}
function splitAllowlist(value) { return (value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean); }
function validateEvent(event) { if (!event.tenantId || !event.conversationId || !event.eventId || !event.traceId || !event.channel)
    throw new Error("bot_runtime_event_context_required"); }
//# sourceMappingURL=bot-runtime.service.js.map