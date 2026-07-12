import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { AiConnectionRepository } from "../ai-connections/ai-connection.repository.js";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { BotFlowEdge, BotFlowNode, BotScenario, BotTriggerRule, ProactiveRule } from "./automation.types.js";
import {
  AutomationRepository,
  type AutomationBotTestRun,
  type AutomationPublishIdempotencyRecord
} from "./automation.repository.js";
import { BotRuntimeService, type BotRuntimeInboundEvent, type BotRuntimeOptions } from "./bot-runtime.service.js";
import { matchesBotTriggerPhrase, normalizeBotTriggerText } from "./bot-trigger-matcher.js";
import { DEFAULT_PROACTIVE_ATTRIBUTION_WINDOW_MS, ProactiveExposureRepository } from "./proactive-exposure.repository.js";
import { KnowledgeSourceRepository } from "../knowledge-sources/knowledge-source.repository.js";
import { KnowledgeRetrievalService } from "../knowledge-sources/knowledge-retrieval.service.js";
import { isKnowledgeSourceRetrievalEligible } from "../knowledge-sources/knowledge-source.types.js";

const AUTOMATION_SERVICE = "automationService";
const VALID_NODE_TYPES = new Set(["message", "ai_reply", "quick_replies", "condition", "contact_request", "webhook", "handoff", "fallback"]);
const BOT_SCENARIO_TRANSITIONS: Record<string, readonly string[]> = {
  archived: ["draft", "disabled"],
  disabled: ["published", "archived"],
  draft: ["published", "archived"],
  published: ["disabled", "archived"]
};

interface BotFlowImportPayload {
  flowEdges?: Array<{ from?: string; label?: string; to?: string }>;
  flowNodes?: BotFlowNode[];
  name?: string;
  priority?: number;
  schemaVersion?: string;
  sourceBindings?: BotScenario["sourceBindings"];
  triggerRules?: BotTriggerRule[];
}

interface ValidatedBotFlow {
  flowEdges: BotFlowEdge[];
  flowNodes: BotFlowNode[];
  name: string;
  schemaVersion: "bot-flow/v1";
}

interface PublishBotScenarioPayload extends BotFlowImportPayload {
  channels?: string[];
  id?: string;
  idempotencyKey?: string;
  matchMode?: string;
  testCases?: Array<Record<string, unknown>>;
  triggerPhrases?: string[];
}

interface ScenarioDraftPayload extends Partial<BotScenario> {
  matchMode?: string;
  triggerPhrases?: string[];
}

interface CreateBotHandoffPayload {
  botId?: string;
  collectedFields?: Record<string, unknown>;
  conversationId?: string;
  queue?: string;
  reason?: string;
  tenantId?: string;
}

export interface AutomationRequestContext {
  actor?: string;
  idempotencyKey?: string;
  reason?: string;
  tenantId?: string;
  traceId?: string;
}

export interface VisitorMetricsRange { from?: string; to?: string; }

export class AutomationService {
  private readonly scenarios: BotScenario[];
  private readonly rules: ProactiveRule[];
  private readonly publishIdempotency = new Map<string, { fingerprint: string; result: Record<string, unknown> }>();

  constructor(private readonly automationRepository: AutomationRepository = AutomationRepository.default(),
    private readonly exposureRepository: ProactiveExposureRepository = ProactiveExposureRepository.default(),
    private readonly knowledgeSourceRepository: KnowledgeSourceRepository = KnowledgeSourceRepository.default()) {
    this.scenarios = [];
    this.rules = [];
  }

  async fetchAutomationWorkspace(context: AutomationRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("fetchAutomationWorkspace");
    }
    const state = await this.automationRepository.readStateAsync();
    this.syncLocalCaches(state);

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "fetchAutomationWorkspace",
      traceId: automationTraceId("fetchAutomationWorkspace"),
      partial: true,
      meta: apiMeta({ tenantId }),
      data: {
        aiReadiness: aiReadinessForTenant(tenantId),
        auditEvents: [
          ...clone(state.workspaceAuditEvents.filter((event) => scenarioTenantId(event) === tenantId)),
          ...clone(state.botPublishAuditEvents.filter((event) => scenarioTenantId(event) === tenantId))
        ],
        botScenarios: clone(scopedBotScenarios(state.botScenarios, tenantId)),
        botScenarioVersions: clone(state.botScenarioVersions.filter((version) => scenarioTenantId(version) === tenantId)),
        proactiveRules: clone(state.proactiveRules.filter((rule) => proactiveRuleTenantId(rule) === tenantId)),
        runtimeMetrics: clone(state.workspaceRuntimeMetrics),
        tenantId
      }
    });
  }

  async fetchVisitorWorkspace(context: AutomationRequestContext = {}, range: VisitorMetricsRange = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("fetchVisitorWorkspace");
    }
    const state = await this.automationRepository.readStateAsync();
    this.syncLocalCaches(state);
    const activeVisitors = state.activeVisitors?.length
      ? clone(state.activeVisitors).filter((visitor) => String(visitor.tenantId ?? "").trim() === tenantId)
      : [];
    const rescueChats = state.rescueChats?.length
      ? clone(state.rescueChats).filter((chat) => String(chat.tenantId ?? "").trim() === tenantId)
      : [];
    const metricsRange = resolveVisitorMetricsRange(range);
    const proactiveRules = clone(state.proactiveRules.filter((rule) => proactiveRuleTenantId(rule) === tenantId));
    const proactiveMetrics = await this.exposureRepository.aggregateMetrics({ from: metricsRange.from,
      ruleVariants: proactiveRules.map((rule) => ({ ruleId: rule.id, variant: String(rule.activeVariant ?? "A") })), tenantId, to: metricsRange.to });

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "fetchVisitorWorkspace",
      traceId: automationTraceId("fetchVisitorWorkspace"),
      partial: true,
      meta: apiMeta({ tenantId }),
      data: {
        activeVisitors,
        proactiveMetrics: { attributionWindowHours: DEFAULT_PROACTIVE_ATTRIBUTION_WINDOW_MS / (60 * 60 * 1000),
          byRuleVariant: proactiveMetrics, range: metricsRange },
        proactiveRules,
        rescueChats,
        tenantId
      }
    });
  }

  async createBotScenario(payload: ScenarioDraftPayload | null | undefined, context: AutomationRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("createBotScenario");
    }
    const request = payload ?? {};
    const scenarioId = String(request.id ?? `bot-${randomUUID()}`).trim();
    const scenario: BotScenario = {
      channels: clone(request.channels ?? ["SDK"]),
      flowEdges: clone(request.flowEdges ?? []),
      flowNodes: clone(request.flowNodes ?? [{ id: "start", type: "message", title: "Start" }]),
      id: scenarioId,
      name: String(request.name ?? "Новый сценарий"),
      priority: normalizeScenarioPriority(request.priority),
      schemaVersion: "bot-flow/v1",
      status: "draft",
      tenantId,
      sourceBindings: normalizeScenarioSourceBindings(request.sourceBindings ?? []),
      triggerRules: resolveScenarioTriggerRules(request, defaultScenarioTriggerRules()),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.upsertScenario(scenario);
    await this.automationRepository.saveBotScenario(scenario);
    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "createBotScenario",
      traceId: automationTraceId("createBotScenario"),
      meta: apiMeta({ tenantId }),
      data: { scenario: clone(scenario) }
    });
  }

  async updateBotScenario(scenarioId: string, payload: ScenarioDraftPayload | null | undefined, context: AutomationRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("updateBotScenario");
    }
    const request = payload ?? {};
    const existing = this.scenarios.find((item) => item.id === scenarioId) ?? await this.automationRepository.findBotScenario(scenarioId);

    if (!existing || scenarioTenantId(existing) !== tenantId) {
      return invalidEnvelope("updateBotScenario", "bot_scenario_not_found", `Bot scenario ${scenarioId} was not found.`, { scenarioId });
    }

    if (existing.status === "archived") {
      return conflictEnvelope("updateBotScenario", "bot_scenario_archived", "Restore the archived bot scenario before editing it.", { scenarioId });
    }
    if (existing.status === "published") {
      return conflictEnvelope("updateBotScenario", "bot_scenario_published", "Disable the published scenario before editing it.", { scenarioId });
    }

    const requestedStatus = normalizeBotScenarioStatus(request.status, existing.status);
    if (requestedStatus !== existing.status) {
      return conflictEnvelope("updateBotScenario", "bot_scenario_status_transition_required", "Use the dedicated scenario status action.", { scenarioId, status: requestedStatus });
    }
    const idempotencyKey = actionIdempotencyKey(context);
    const fingerprint = stableStringify({ operation: "updateBotScenario", scenarioId, tenantId, triggerRules: request.triggerRules, triggerPhrases: request.triggerPhrases, sourceBindings: request.sourceBindings, priority: request.priority });
    const cached = idempotencyKey ? await this.findPublishIdempotency(tenantId, idempotencyKey) : undefined;
    if (cached) {
      if (cached.fingerprint !== fingerprint) return conflictEnvelope("updateBotScenario", "idempotency_key_reused", "Idempotency key was already used for a different scenario change.", { idempotencyKey, scenarioId });
      return createEnvelope({ service: AUTOMATION_SERVICE, operation: "updateBotScenario", traceId: actionTraceId(context, "updateBotScenario"), meta: apiMeta({ idempotencyKey, tenantId }), data: { ...clone(cached.result), duplicate: true } });
    }

    const scenario: BotScenario = {
      ...existing,
      ...request,
      channels: clone(request.channels ?? existing.channels),
      enabled: existing.enabled ?? true,
      flowEdges: clone(request.flowEdges ?? existing.flowEdges),
      flowNodes: clone(request.flowNodes ?? existing.flowNodes),
      id: scenarioId,
      name: String(request.name ?? existing.name),
      priority: normalizeScenarioPriority(request.priority ?? existing.priority),
      schemaVersion: "bot-flow/v1",
      status: normalizeBotScenarioStatus(request.status, existing.status),
      tenantId,
      sourceBindings: normalizeScenarioSourceBindings(request.sourceBindings ?? existing.sourceBindings ?? []),
      triggerRules: resolveScenarioTriggerRules(request, existing.triggerRules ?? defaultScenarioTriggerRules()),
      updatedAt: new Date().toISOString()
    };
    this.upsertScenario(scenario);
    await this.automationRepository.saveBotScenario(scenario);
    const result = { auditId: makeAuditId("bot_update"), scenario: clone(scenario) };
    const changed = request.triggerRules !== undefined || request.triggerPhrases !== undefined || request.matchMode !== undefined || request.sourceBindings !== undefined || request.priority !== undefined;
    if (changed) await this.recordScenarioActionAudit({ action: "bot.trigger_policy.update", afterStatus: scenario.status, auditId: result.auditId, beforeStatus: existing.status, context, idempotencyKey, reason: actionReason(context, "trigger_policy_updated"), scenarioId, tenantId });
    if (idempotencyKey) {
      this.publishIdempotency.set(automationTenantIdempotencyKey(tenantId, idempotencyKey), { fingerprint, result: clone(result) });
      await this.automationRepository.savePublishIdempotencyKeyAsync({ fingerprint, key: idempotencyKey, result: clone(result), tenantId });
    }
    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "updateBotScenario",
      traceId: actionTraceId(context, "updateBotScenario"),
      meta: apiMeta({ idempotencyKey: idempotencyKey ?? null, tenantId }),
      data: { duplicate: false, ...result }
    });
  }

  async listBotScenarios(context: AutomationRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) return tenantRequiredEnvelope("listBotScenarios");
    const state = await this.automationRepository.readStateAsync();
    this.syncLocalCaches(state);
    const scenarios = scopedBotScenarios(state.botScenarios, tenantId)
      .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "listBotScenarios",
      traceId: automationTraceId("listBotScenarios"),
      meta: apiMeta({ tenantId }),
      data: { scenarios: clone(scenarios) }
    });
  }

  async fetchBotScenario(scenarioId: string, context: AutomationRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) return tenantRequiredEnvelope("fetchBotScenario");
    const scenario = this.scenarios.find((item) => item.id === scenarioId) ?? await this.automationRepository.findBotScenario(scenarioId);
    if (!scenario || scenarioTenantId(scenario) !== tenantId) {
      return invalidEnvelope("fetchBotScenario", "bot_scenario_not_found", `Bot scenario ${scenarioId} was not found.`, { scenarioId });
    }
    const versions = await this.automationRepository.listBotScenarioVersions(scenarioId);
    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "fetchBotScenario",
      traceId: automationTraceId("fetchBotScenario"),
      meta: apiMeta({ tenantId }),
      data: { scenario: clone(scenario), versions: clone(versions.filter((version) => version.tenantId === tenantId)) }
    });
  }

  async disableBotScenario(scenarioId: string, context: AutomationRequestContext = {}) {
    return this.transitionBotScenario(scenarioId, "disabled", "disableBotScenario", context);
  }

  async archiveBotScenario(scenarioId: string, context: AutomationRequestContext = {}) {
    return this.transitionBotScenario(scenarioId, "archived", "archiveBotScenario", context);
  }

  async restoreBotScenario(scenarioId: string, context: AutomationRequestContext = {}) {
    return this.transitionBotScenario(scenarioId, "disabled", "restoreBotScenario", context);
  }

  async validateBotFlowImport(input: BotFlowImportPayload | string | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const { errors, payload } = parseAndValidateBotFlow(input);

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "validateBotFlowImport",
      traceId: automationTraceId("validateBotFlowImport"),
      status: errors.length ? "invalid" : "ok",
      meta: apiMeta(),
      data: {
        errors,
        payload: errors.length ? null : payload,
        valid: errors.length === 0
      },
      error: errors.length
        ? {
            code: "bot_flow_invalid",
            message: errors.join("; ")
          }
        : null
    });
  }

  async publishBotScenario(
    payload: PublishBotScenarioPayload | null | undefined,
    context: AutomationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("publishBotScenario");
    }
    const request = payload ?? {};
    const scenarioId = request.id?.trim();
    const validation = parseAndValidateBotFlow(request);

    if (!scenarioId) {
      return invalidEnvelope("publishBotScenario", "bot_scenario_id_required", "Bot scenario id is required.", {});
    }

    const existing = this.scenarios.find((item) => item.id === scenarioId) ?? await this.automationRepository.findBotScenario(scenarioId);
    if (!existing || scenarioTenantId(existing) !== tenantId) {
      return invalidEnvelope("publishBotScenario", "bot_scenario_not_found", `Bot scenario ${scenarioId} was not found.`, { scenarioId });
    }
    if (validation.errors.length) {
      return invalidEnvelope("publishBotScenario", "bot_flow_invalid", validation.errors.join("; "), {
        scenarioId
      });
    }

    const triggerRules = resolveScenarioTriggerRules(request, existing.triggerRules ?? defaultScenarioTriggerRules());
    const triggerErrors = validateScenarioTriggerRules(triggerRules);
    if (triggerErrors.length) {
      return invalidEnvelope("publishBotScenario", "bot_trigger_invalid", triggerErrors.join("; "), { scenarioId, violations: triggerErrors });
    }
    const state = await this.automationRepository.readStateAsync();
    const triggerConflict = findScenarioTriggerConflict(state.botScenarios, scenarioId, tenantId, triggerRules, normalizeScenarioPriority(request.priority ?? existing.priority));
    if (triggerConflict) {
      return conflictEnvelope("publishBotScenario", "trigger_conflict", "Another published scenario already owns this keyword phrase and priority.", triggerConflict);
    }
    const sourceBindings = normalizeScenarioSourceBindings(request.sourceBindings ?? existing.sourceBindings ?? []);
    const unavailableSourceId = sourceBindings.find((binding) => {
      const source = this.knowledgeSourceRepository.find(tenantId, binding.sourceId);
      return !source || !isKnowledgeSourceRetrievalEligible(source);
    })?.sourceId;
    if (unavailableSourceId) {
      return invalidEnvelope("publishBotScenario", "knowledge_source_not_ready", "Every selected knowledge source must be ready and approved before publication.", { scenarioId, sourceId: unavailableSourceId });
    }
    const prerequisiteViolations: string[] = [];
    const nodes = validation.payload?.flowNodes ?? [];
    if (nodes.some((node) => node.type === "ai_reply")) {
      if (!sourceBindings.length) prerequisiteViolations.push("AI-ответу нужен хотя бы один готовый источник знаний.");
      if (aiReadinessForTenant(tenantId).status !== "ready") prerequisiteViolations.push("AI-подключение организации не настроено или не прошло проверку.");
      if (!nodes.some((node) => node.type === "handoff" || node.type === "fallback")) prerequisiteViolations.push("Добавьте передачу оператору или запасной ответ.");
    }
    if (prerequisiteViolations.length) {
      return invalidEnvelope("publishBotScenario", "bot_publish_prerequisites_invalid", prerequisiteViolations.join(" "), { scenarioId, violations: prerequisiteViolations });
    }

    const idempotencyKey = request.idempotencyKey?.trim() || actionIdempotencyKey(context);
    const fingerprint = stableStringify({
      channels: request.channels ?? [],
      flowEdges: validation.payload?.flowEdges ?? [],
      flowNodes: validation.payload?.flowNodes ?? [],
      id: scenarioId,
      name: validation.payload?.name,
      priority: normalizeScenarioPriority(request.priority ?? existing.priority),
      sourceBindings,
      triggerRules,
      tenantId
    });
    const cached = idempotencyKey ? await this.findPublishIdempotency(tenantId, idempotencyKey) : undefined;

    if (cached) {
      if (cached.fingerprint !== fingerprint) {
        return conflictEnvelope("publishBotScenario", "idempotency_key_reused", "Idempotency key was already used for a different bot publish request.", {
          idempotencyKey,
          scenarioId
        });
      }

      return createEnvelope({
        service: AUTOMATION_SERVICE,
        operation: "publishBotScenario",
        traceId: automationTraceId("publishBotScenario"),
        meta: apiMeta({ idempotencyKey }),
        data: {
          ...clone(cached.result),
          duplicate: true
        }
      });
    }

    if (!canTransitionBotScenario(existing.status, "published")) {
      return conflictEnvelope("publishBotScenario", "bot_scenario_transition_invalid", `Bot scenario cannot be published from ${existing.status}.`, { scenarioId, status: existing.status });
    }

    const result = {
      auditId: makeAuditId("bot"),
      channels: clone(request.channels ?? []),
      duplicate: false,
      handoffEvent: {
        eventName: "bot.handoff.created",
        schemaVersion: "bot-handoff/v1",
        source: "publish"
      },
      queue: "bot-runtime",
      runtimeJobId: makeQueueId("bot_runtime"),
      runtimeVersion: `runtime-${scenarioId}-${Date.now().toString(36)}`,
      scenarioId,
      tenantId,
      versionState: "published"
    };

    const scenario: BotScenario = {
      activeVersionId: String(result.runtimeVersion),
      channels: clone(request.channels ?? existing.channels),
      enabled: true,
      flowEdges: clone(validation.payload?.flowEdges ?? existing.flowEdges),
      flowNodes: clone(validation.payload?.flowNodes ?? existing.flowNodes),
      id: scenarioId,
      name: String(validation.payload?.name ?? existing.name),
      priority: normalizeScenarioPriority(request.priority ?? existing.priority),
      schemaVersion: "bot-flow/v1",
      status: "published",
      tenantId,
      sourceBindings,
      triggerRules
    };
    this.upsertScenario(scenario);
    await this.automationRepository.saveBotScenario(scenario);
    await this.automationRepository.saveBotScenarioVersion({
      createdAt: new Date().toISOString(),
      flowEdges: clone(scenario.flowEdges),
      flowNodes: clone(scenario.flowNodes),
      priority: scenario.priority ?? 0,
      scenarioId,
      sourceBindings: clone(scenario.sourceBindings ?? []),
      status: "published",
      tenantId,
      triggerRules: clone(scenario.triggerRules ?? []),
      versionId: String(result.runtimeVersion)
    });
    await this.automationRepository.saveBotPublishAuditEvent({
      action: "bot.publish",
      actor: actionActor(context),
      auditId: result.auditId,
      createdAt: new Date().toISOString(),
      idempotencyKey: idempotencyKey ? `bot-publish:${tenantId}:${idempotencyKey}` : result.auditId,
      immutable: true,
      runtimeVersion: String(result.runtimeVersion),
      scenarioId,
      tenantId,
      versionId: String(result.runtimeVersion)
    });
    await this.recordScenarioActionAudit({ action: "bot.publish", afterStatus: "published", auditId: result.auditId, beforeStatus: existing.status, context, idempotencyKey, scenarioId, tenantId });

    if (idempotencyKey) {
      this.publishIdempotency.set(automationTenantIdempotencyKey(tenantId, idempotencyKey), {
        fingerprint,
        result: clone(result)
      });
      await this.automationRepository.savePublishIdempotencyKeyAsync({
        key: idempotencyKey,
        fingerprint,
        result: clone(result),
        tenantId
      });
    }

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "publishBotScenario",
      traceId: automationTraceId("publishBotScenario"),
      meta: apiMeta({ idempotencyKey: idempotencyKey ?? null }),
      data: result
    });
  }

  async saveProactiveRule(
    rule: Partial<ProactiveRule> | null | undefined,
    context: AutomationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = rule ?? {};

    if (!request.id?.trim()) {
      return invalidEnvelope("saveProactiveRule", "proactive_rule_id_required", "Proactive rule id is required.", {});
    }

    if (!Array.isArray(request.channels) || !request.channels.length) {
      return invalidEnvelope("saveProactiveRule", "proactive_channels_required", "At least one proactive channel is required.", {
        ruleId: request.id
      });
    }

    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("saveProactiveRule");
    }
    const state = await this.automationRepository.readStateAsync();
    const foreignRule = state.proactiveRules.find((item) =>
      item.id === request.id && proactiveRuleTenantId(item) !== tenantId
    );
    if (foreignRule) {
      return invalidEnvelope(
        "saveProactiveRule",
        "proactive_rule_tenant_conflict",
        "Proactive rule id is already owned by another tenant.",
        { ruleId: request.id }
      );
    }

    const savedRule = {
      ...clone(request),
      channels: clone(request.channels),
      id: request.id,
      status: request.status ?? "enabled",
      tenantId
    };
    const index = this.rules.findIndex((item) =>
      item.id === savedRule.id && proactiveRuleTenantId(item) === tenantId
    );
    if (index >= 0) {
      this.rules[index] = savedRule;
    } else {
      this.rules.unshift(savedRule);
    }
    await this.automationRepository.saveProactiveRuleAsync(savedRule);

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "saveProactiveRule",
      traceId: automationTraceId("saveProactiveRule"),
      meta: apiMeta({ ruleId: savedRule.id, tenantId }),
      data: {
        auditId: makeAuditId("proactive"),
        experiment: {
          activeVariant: savedRule.activeVariant ?? "A",
          id: `exp_${savedRule.id}_${Date.now().toString(36)}`,
          persisted: true
        },
        frequencyCap: {
          cooldown: savedRule.cooldown ?? "24h",
          id: `cap_${savedRule.id}_${Date.now().toString(36)}`,
          perChannel: true,
          perUser: true
        },
        queue: "proactive-delivery",
        rule: savedRule,
        targeting: {
          channels: clone(savedRule.channels),
          privacyChecked: true,
          segment: savedRule.segment ?? "manual"
        }
      }
    });
  }

  async testBotScenario(
    payload: PublishBotScenarioPayload | null | undefined,
    context: AutomationRequestContext = {}
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("testBotScenario");
    }
    const request = payload ?? {};
    const scenarioId = request.id?.trim();

    if (!scenarioId) {
      return invalidEnvelope("testBotScenario", "bot_scenario_id_required", "Bot scenario id is required.", {});
    }

    const existing = this.scenarios.find((item) => item.id === scenarioId) ?? await this.automationRepository.findBotScenario(scenarioId);
    if (!existing || scenarioTenantId(existing) !== tenantId) {
      return invalidEnvelope("testBotScenario", "bot_scenario_not_found", `Bot scenario ${scenarioId} was not found.`, { scenarioId });
    }

    const testRun: AutomationBotTestRun = {
      auditId: makeAuditId("bot"),
      cases: clone(request.testCases ?? []),
      queue: "bot-runtime",
      scenarioId,
      status: "running",
      tenantId,
      testRunId: `bot_test_${randomUUID()}`
    };
    await this.automationRepository.saveBotTestRunAsync(testRun);
    const preview = await buildScenarioTestPreview(existing, tenantId, String((request as { testMessage?: unknown }).testMessage ?? "").trim());

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "testBotScenario",
      traceId: automationTraceId("testBotScenario"),
      meta: apiMeta({ scenarioId, tenantId }),
      data: { ...testRun, preview }
    });
  }

  async createBotHandoffSummary(payload: CreateBotHandoffPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const tenantId = String(request.tenantId ?? "").trim();

    if (!request.botId?.trim() || !request.conversationId?.trim()) {
      return invalidEnvelope("createBotHandoffSummary", "bot_handoff_context_required", "botId and conversationId are required.", {
        botId: request.botId ?? null,
        conversationId: request.conversationId ?? null
      });
    }
    if (!tenantId) {
      return tenantRequiredEnvelope("createBotHandoffSummary");
    }

    const eventId = makeEventId("bot_handoff");
    const traceId = automationTraceId("createBotHandoffSummary");
    const summary = {
      botId: request.botId,
      collectedFields: maskCollectedFields(request.collectedFields ?? {}),
      queue: request.queue ?? "default",
      reason: request.reason ?? "handoff_requested"
    };

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "createBotHandoffSummary",
      traceId,
      meta: apiMeta({ conversationId: request.conversationId }),
      data: {
        auditId: makeAuditId("bot"),
        eventId,
        eventName: "bot.handoff.created",
        resourceId: request.conversationId,
        resourceType: "conversation",
        realtimeEvent: realtimeEvent({
          data: summary,
          eventId,
          eventName: "bot.handoff.created",
          resourceId: request.conversationId,
          resourceType: "conversation",
          schemaVersion: "bot-handoff/v1",
          tenantId,
          traceId
        }),
        summary
      }
    });
  }

  private upsertScenario(scenario: BotScenario): void {
    const index = this.scenarios.findIndex((item) => item.id === scenario.id);
    if (index >= 0) {
      this.scenarios[index] = scenario;
    } else {
      this.scenarios.unshift(scenario);
    }
  }

  private async transitionBotScenario(
    scenarioId: string,
    targetStatus: "archived" | "disabled",
    operation: string,
    context: AutomationRequestContext
  ): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) return tenantRequiredEnvelope(operation);
    const existing = this.scenarios.find((item) => item.id === scenarioId) ?? await this.automationRepository.findBotScenario(scenarioId);
    if (!existing || scenarioTenantId(existing) !== tenantId) {
      return invalidEnvelope(operation, "bot_scenario_not_found", `Bot scenario ${scenarioId} was not found.`, { scenarioId });
    }
    const idempotencyKey = actionIdempotencyKey(context);
    const reason = actionReason(context, targetStatus === "archived" ? "user_deleted" : "user_disabled");
    const fingerprint = stableStringify({ operation, reason, scenarioId, targetStatus, tenantId });
    const cached = idempotencyKey ? await this.findPublishIdempotency(tenantId, idempotencyKey) : undefined;
    if (cached) {
      if (cached.fingerprint !== fingerprint) return conflictEnvelope(operation, "idempotency_key_reused", "Idempotency key was already used for a different scenario action.", { idempotencyKey, scenarioId });
      return createEnvelope({ service: AUTOMATION_SERVICE, operation, traceId: actionTraceId(context, operation), meta: apiMeta({ idempotencyKey, tenantId }), data: { ...clone(cached.result), duplicate: true } });
    }
    if (existing.status === targetStatus) {
      return createEnvelope({
        service: AUTOMATION_SERVICE,
        operation,
        traceId: actionTraceId(context, operation),
        meta: apiMeta({ idempotencyKey: idempotencyKey ?? null, tenantId }),
        data: { duplicate: true, scenario: clone(existing) }
      });
    }
    if (!canTransitionBotScenario(existing.status, targetStatus)) {
      return conflictEnvelope(operation, "bot_scenario_transition_invalid", `Bot scenario cannot transition from ${existing.status} to ${targetStatus}.`, { scenarioId, status: existing.status, targetStatus });
    }
    const now = new Date().toISOString();
    const scenario: BotScenario = {
      ...existing,
      ...(targetStatus === "archived"
        ? { archiveReason: reason, archivedAt: now, archivedBy: actionActor(context) }
        : { archiveReason: undefined, archivedAt: undefined, archivedBy: undefined }),
      disabledAt: now,
      disabledBy: actionActor(context),
      disableReason: targetStatus === "archived" ? "archived" : reason,
      enabled: false,
      status: targetStatus,
      updatedAt: now
    };
    this.upsertScenario(scenario);
    await this.automationRepository.saveBotScenario(scenario);
    const auditId = makeAuditId("bot_action");
    const result = { auditId, scenario: clone(scenario) };
    await this.recordScenarioActionAudit({ action: lifecycleAuditAction(operation), afterStatus: targetStatus, auditId, beforeStatus: existing.status, context, idempotencyKey, reason, scenarioId, tenantId });
    if (idempotencyKey) {
      this.publishIdempotency.set(automationTenantIdempotencyKey(tenantId, idempotencyKey), { fingerprint, result: clone(result) });
      await this.automationRepository.savePublishIdempotencyKeyAsync({ fingerprint, key: idempotencyKey, result: clone(result), tenantId });
    }
    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation,
      traceId: actionTraceId(context, operation),
      meta: apiMeta({ idempotencyKey: idempotencyKey ?? null, tenantId }),
      data: { duplicate: false, ...result }
    });
  }

  private async recordScenarioActionAudit(input: { action: string; afterStatus: string; auditId: string; beforeStatus: string; context: AutomationRequestContext; idempotencyKey?: string; reason?: string; scenarioId: string; tenantId: string }): Promise<void> {
    await this.automationRepository.saveScenarioAuditEvent({ action: input.action, actor: actionActor(input.context), actorType: "user", auditId: input.auditId,
      createdAt: new Date().toISOString(), fingerprint: input.idempotencyKey ? stableStringify({ action: input.action, reason: input.reason, scenarioId: input.scenarioId, tenantId: input.tenantId }) : undefined,
      idempotencyKey: input.idempotencyKey, immutable: true, payload: { afterStatus: input.afterStatus, beforeStatus: input.beforeStatus }, reason: input.reason ?? "unspecified",
      scenarioId: input.scenarioId, tenantId: input.tenantId, traceId: actionTraceId(input.context, input.action) });
    this.automationRepository.saveWorkspaceAuditEvent({
      action: input.action, actor: actionActor(input.context), afterStatus: input.afterStatus, auditId: input.auditId,
      beforeStatus: input.beforeStatus, createdAt: new Date().toISOString(),
      idempotencyKey: input.idempotencyKey ? `bot-action:${input.tenantId}:${input.idempotencyKey}` : input.auditId,
      immutable: true, reason: input.reason ?? actionReason(input.context, "published"), scenarioId: input.scenarioId,
      tenantId: input.tenantId, traceId: actionTraceId(input.context, input.action)
    });
  }

  private async findPublishIdempotency(tenantId: string, key: string): Promise<{ fingerprint: string; result: Record<string, unknown> } | undefined> {
    const persisted = await this.automationRepository.findPublishIdempotencyKeyAsync(tenantId, key);
    if (persisted) {
      return { fingerprint: persisted.fingerprint, result: clone(persisted.result) };
    }

    return this.publishIdempotency.get(automationTenantIdempotencyKey(tenantId, key));
  }

  async handleBotRuntimeInboundEvent(event: BotRuntimeInboundEvent, options: BotRuntimeOptions = {}) {
    return new BotRuntimeService(this.automationRepository, options).handleInboundEvent(event);
  }

  async rollbackBotRuntimeVersion(tenantId: string, scenarioId: string, versionId: string) {
    return new BotRuntimeService(this.automationRepository).rollbackToPublishedVersion(tenantId, scenarioId, versionId);
  }

  async retryBotRuntimeInboundEvent(event: BotRuntimeInboundEvent, options: BotRuntimeOptions = {}) {
    return new BotRuntimeService(this.automationRepository, options).retryInboundEvent(event);
  }

  private syncLocalCaches(state: { botScenarios: BotScenario[]; proactiveRules: ProactiveRule[]; publishIdempotencyKeys: AutomationPublishIdempotencyRecord[] }): void {
    this.scenarios.splice(0, this.scenarios.length, ...clone(state.botScenarios));
    this.rules.splice(0, this.rules.length, ...clone(state.proactiveRules));
    state.publishIdempotencyKeys.forEach((item) => {
      this.publishIdempotency.set(automationTenantIdempotencyKey(item.tenantId, item.key), {
        fingerprint: item.fingerprint,
        result: clone(item.result)
      });
    });
  }
}

function apiMeta(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "api",
    apiVersion: "v1",
    ...extra
  };
}

function automationTraceId(operation: string): string {
  return getCurrentTraceId() ?? createRequestTraceId(AUTOMATION_SERVICE, operation);
}

function actionTraceId(context: AutomationRequestContext, operation: string): string {
  return String(context.traceId ?? "").trim() || automationTraceId(operation);
}
function actionActor(context: AutomationRequestContext): string {
  return String(context.actor ?? "").trim() || "automation-admin";
}
function actionReason(context: AutomationRequestContext, fallback: string): string {
  return String(context.reason ?? "").trim().slice(0, 500) || fallback;
}
function actionIdempotencyKey(context: AutomationRequestContext): string | undefined {
  const value = String(context.idempotencyKey ?? "").trim();
  return value ? value.slice(0, 200) : undefined;
}
function lifecycleAuditAction(operation: string): string {
  return operation === "disableBotScenario" ? "bot.disable" : operation === "archiveBotScenario" ? "bot.archive" : "bot.restore";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function overlayById<T extends { id: string }>(base: T[], persisted: T[]): T[] {
  if (!persisted.length) {
    return base;
  }

  const persistedById = new Map(persisted.map((item) => [item.id, item]));
  const baseIds = new Set(base.map((item) => item.id));

  return [
    ...base.map((item) => clone(persistedById.get(item.id) ?? item)),
    ...persisted.filter((item) => !baseIds.has(item.id)).map((item) => clone(item))
  ];
}

function conflictEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: AUTOMATION_SERVICE,
    operation,
    traceId: automationTraceId(operation),
    status: "conflict",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function invalidEnvelope(operation: string, code: string, message: string, data: Record<string, unknown>): BackendEnvelope<Record<string, unknown>> {
  return createEnvelope({
    service: AUTOMATION_SERVICE,
    operation,
    traceId: automationTraceId(operation),
    status: "invalid",
    meta: apiMeta(),
    data,
    error: { code, message }
  });
}

function makeAuditId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeEventId(scope: string): string {
  return `evt_${scope}_${randomUUID()}`;
}

function makeQueueId(scope: string): string {
  return `${scope}_${randomUUID()}`;
}

function parseAndValidateBotFlow(input: BotFlowImportPayload | string | null | undefined): { errors: string[]; payload: null | ValidatedBotFlow } {
  const errors: string[] = [];
  let payload: BotFlowImportPayload | null | undefined;

  try {
    payload = typeof input === "string" ? (JSON.parse(input) as BotFlowImportPayload) : input;
  } catch (error) {
    errors.push(error instanceof Error ? `JSON parse failed: ${error.message}` : "JSON parse failed");
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    errors.push("payload is required");
    return { errors, payload: null };
  }

  const name = payload.name?.trim();
  const flowNodes = payload.flowNodes ?? [];
  const rawFlowEdges = payload.flowEdges ?? [];

  if (!name) {
    errors.push("name is required");
  }

  if (!Array.isArray(payload.flowNodes) || !flowNodes.length) {
    errors.push("flowNodes are required");
  } else {
    for (const node of flowNodes) {
      if (!node.id?.trim() || !VALID_NODE_TYPES.has(node.type)) {
        errors.push(`node ${node.id ?? "unknown"} has invalid type`);
      }
    }
  }

  if (payload.flowEdges !== undefined && (!Array.isArray(payload.flowEdges) || rawFlowEdges.some((edge) => !edge.from || !edge.to))) {
    errors.push("flowEdges must contain from and to");
  }

  if (errors.length || !payload) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: {
      flowEdges: rawFlowEdges.map((edge) => ({
        from: String(edge.from),
        ...(edge.label ? { label: edge.label } : {}),
        to: String(edge.to)
      })),
      flowNodes,
      name: name ?? "",
      schemaVersion: "bot-flow/v1"
    }
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function maskCollectedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return [key, maskCollectedFields(value as Record<string, unknown>)];
      }

      if (/phone|tel|mobile/i.test(key)) {
        return [key, maskPhone(String(value ?? ""))];
      }

      if (/card|payment|pan|token|secret|otp|code/i.test(key)) {
        return [key, "****"];
      }

      return [key, value];
    })
  );
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const tail = digits.slice(-2);

  return tail ? `+* *** ***-**-${tail}` : "***";
}

function realtimeEvent({
  data,
  eventId,
  eventName,
  resourceId,
  resourceType,
  schemaVersion,
  tenantId,
  traceId
}: {
  data: Record<string, unknown>;
  eventId: string;
  eventName: string;
  resourceId: string;
  resourceType: string;
  schemaVersion: string;
  tenantId: string;
  traceId: string;
}): Record<string, unknown> {
  return {
    data,
    eventId,
    eventName,
    occurredAt: new Date().toISOString(),
    resourceId,
    resourceType,
    schemaVersion,
    tenantId,
    traceId
  };
}

function resolveAutomationTenantId(context: AutomationRequestContext = {}): string | null {
  return String(context.tenantId ?? "").trim() || null;
}

function scenarioTenantId(item: { tenantId?: string }): string | null {
  return String(item.tenantId ?? "").trim() || null;
}

function canTransitionBotScenario(from: string, to: string): boolean {
  return from === to || (BOT_SCENARIO_TRANSITIONS[from] ?? []).includes(to);
}

function aiReadinessForTenant(tenantId: string): { connectionCount: number; readyConnectionCount: number; status: "not_configured" | "ready" | "unavailable" } {
  const connections = AiConnectionRepository.default().list(tenantId);
  const readyConnectionCount = connections.filter((connection) => connection.status === "ready" && connection.disabledAt === null && connection.capabilities.includes("chat_completion")).length;
  return { connectionCount: connections.length, readyConnectionCount, status: readyConnectionCount ? "ready" : connections.length ? "unavailable" : "not_configured" };
}

async function buildScenarioTestPreview(scenario: BotScenario, tenantId: string, testMessage: string): Promise<Record<string, unknown>> {
  const sourceBindings = scenario.sourceBindings ?? [];
  const sources = sourceBindings.flatMap((binding) => {
    const source = KnowledgeSourceRepository.default().find(tenantId, binding.sourceId);
    return source && isKnowledgeSourceRetrievalEligible(source) ? [source] : [];
  });
  const phraseRule = (scenario.triggerRules ?? []).find((rule) => rule.type === "phrase");
  const phraseMatched = phraseRule ? Boolean(testMessage) && (phraseRule.phrases ?? []).some((phrase) => matchesBotTriggerPhrase(testMessage, phrase, phraseRule.matchMode ?? "contains", phraseRule.locale)) : null;
  if (phraseRule && !phraseMatched) {
    return {
      answerPreview: testMessage ? "Сценарий не запустится: сообщение не совпало ни с одной ключевой фразой." : "Введите сообщение клиента, чтобы проверить ключевую фразу.",
      citations: [],
      input: testMessage || "Введите сообщение клиента для проверки.",
      outcome: "no_match",
      reason: testMessage ? "phrase_not_matched" : "test_message_required",
      steps: [],
      trace: {
        aiWouldCall: false,
        dryRun: true,
        isolation: "no_runtime_steps_no_outbound",
        knowledgeSourceCount: sources.length,
        readiness: aiReadinessForTenant(tenantId).status,
        retrievalCache: "skipped",
        retrievalTokenBudget: 0,
        retrievalTokensUsed: 0
      },
      trigger: { matched: false, matchMode: phraseRule.matchMode ?? "contains", phrases: phraseRule.phrases ?? [], type: "phrase" }
    };
  }

  const aiNode = scenario.flowNodes.find((node) => node.type === "ai_reply");
  const readiness = aiReadinessForTenant(tenantId);
  let retrieval: { cache: "hit" | "miss"; passages: Array<{ citation: { sourceId: string; sourceVersion: number; title: string }; content: string; score: number }>; tokenBudget: number; tokensUsed: number } = {
    cache: "miss",
    passages: [],
    tokenBudget: 0,
    tokensUsed: 0
  };
  if (aiNode && sources.length && testMessage) {
    retrieval = await new KnowledgeRetrievalService().retrieve({
      query: testMessage,
      sourceBindings,
      tenantId,
      tokenBudget: 800
    });
  }

  const wouldCallAi = Boolean(aiNode) && readiness.status === "ready" && sources.length > 0 && retrieval.passages.length > 0;
  const needsHandoff = Boolean(aiNode) && !wouldCallAi;
  const citations = retrieval.passages.length
    ? retrieval.passages.map((passage) => ({
      sourceId: passage.citation.sourceId,
      title: passage.citation.title,
      version: passage.citation.sourceVersion
    }))
    : sources.map((source) => ({ sourceId: source.id, title: source.title, version: source.version }));

  return {
    answerPreview: !aiNode
      ? "Сценарий отправит настроенное сообщение."
      : needsHandoff
        ? (aiNode.config?.fallbackMessage
          ? String(aiNode.config.fallbackMessage)
          : "AI не будет отвечать: клиенту будет предложена помощь оператора.")
        : "AI сформирует ответ только по выбранным источникам; при недостатке сведений передаст вопрос оператору.",
    citations,
    input: testMessage || "Введите сообщение клиента для проверки.",
    outcome: needsHandoff ? "handoff" : aiNode ? "ai_response" : "message",
    reason: needsHandoff
      ? (readiness.status !== "ready" ? "ai_not_ready" : sources.length === 0 ? "knowledge_not_ready" : "retrieval_empty")
      : "matched",
    retrievalPassages: retrieval.passages.slice(0, 3).map((passage) => ({
      score: passage.score,
      sourceId: passage.citation.sourceId,
      title: passage.citation.title,
      preview: passage.content.slice(0, 160)
    })),
    steps: scenario.flowNodes.map((node) => ({ id: node.id, title: node.title ?? node.type, type: node.type })),
    trace: {
      aiWouldCall: wouldCallAi,
      dryRun: true,
      isolation: "no_runtime_steps_no_outbound",
      knowledgeSourceCount: sources.length,
      readiness: readiness.status,
      retrievalCache: retrieval.cache,
      retrievalTokenBudget: retrieval.tokenBudget,
      retrievalTokensUsed: retrieval.tokensUsed,
      stepsCount: scenario.flowNodes.length
    },
    trigger: phraseRule
      ? { matched: phraseMatched, matchMode: phraseRule.matchMode ?? "contains", phrases: phraseRule.phrases ?? [], type: "phrase" }
      : { matched: true, type: (scenario.triggerRules ?? [])[0]?.type ?? "manual" }
  };
}

function defaultScenarioTriggerRules(): BotTriggerRule[] {
  return [{ id: "new-conversation", priority: 0, type: "new_conversation" }];
}

function normalizeScenarioPriority(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) ? Math.max(-10_000, Math.min(10_000, parsed)) : 0;
}

function resolveScenarioTriggerRules(
  input: Pick<ScenarioDraftPayload, "matchMode" | "triggerPhrases" | "triggerRules">,
  fallback: BotTriggerRule[]
): BotTriggerRule[] {
  if (Array.isArray(input.triggerRules)) return normalizeScenarioTriggerRules(input.triggerRules);
  if (Array.isArray(input.triggerPhrases)) {
    return normalizeScenarioTriggerRules([{
      id: "phrase-1",
      matchMode: normalizeMatchMode(input.matchMode),
      phrases: input.triggerPhrases,
      priority: 0,
      type: "phrase"
    }]);
  }
  return normalizeScenarioTriggerRules(fallback);
}

function normalizeScenarioTriggerRules(value: BotTriggerRule[]): BotTriggerRule[] {
  return value.flatMap((rule, index) => {
    if (!rule || !["manual", "new_conversation", "phrase"].includes(rule.type)) return [];
    const phrases = Array.isArray(rule.phrases)
      ? rule.phrases.map((phrase) => String(phrase).trim()).filter(Boolean).slice(0, 32)
      : [];
    return [{
      id: String(rule.id ?? `trigger-${index + 1}`).trim() || `trigger-${index + 1}`,
      ...(rule.locale ? { locale: String(rule.locale).trim() } : {}),
      ...(rule.type === "phrase" ? { matchMode: normalizeMatchMode(rule.matchMode), phrases } : {}),
      priority: normalizeScenarioPriority(rule.priority),
      type: rule.type
    }];
  });
}

function normalizeScenarioSourceBindings(value: BotScenario["sourceBindings"]): NonNullable<BotScenario["sourceBindings"]> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((binding) => {
    const sourceId = String(binding?.sourceId ?? "").trim();
    if (!sourceId || seen.has(sourceId)) return [];
    seen.add(sourceId);
    const sourceVersion = String(binding?.sourceVersion ?? "").trim();
    return [{ sourceId, ...(sourceVersion ? { sourceVersion } : {}) }];
  });
}

function normalizeMatchMode(value: unknown): "contains" | "exact" | "tokens" {
  const mode = String(value ?? "contains");
  return mode === "exact" || mode === "tokens" ? mode : "contains";
}

function validateScenarioTriggerRules(rules: BotTriggerRule[]): string[] {
  if (!rules.length) return ["At least one scenario trigger is required."];
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const rule of rules) {
    if (rule.type !== "phrase") continue;
    if (!rule.phrases?.length) {
      errors.push(`Trigger ${rule.id} requires at least one phrase.`);
      continue;
    }
    for (const phrase of rule.phrases) {
      const normalized = normalizeBotTriggerText(phrase, rule.locale);
      if (!normalized || !/[\p{L}\p{N}]/u.test(normalized)) errors.push(`Trigger ${rule.id} contains an empty phrase.`);
      const key = `${rule.locale ?? "ru-RU"}\u0000${rule.matchMode ?? "contains"}\u0000${normalized}`;
      if (seen.has(key)) errors.push(`Trigger ${rule.id} contains a duplicate phrase.`);
      seen.add(key);
    }
  }
  return errors;
}

function findScenarioTriggerConflict(
  scenarios: BotScenario[],
  scenarioId: string,
  tenantId: string,
  rules: BotTriggerRule[],
  priority: number
): Record<string, unknown> | null {
  const phrases = rules.flatMap((rule) => rule.type === "phrase"
    ? (rule.phrases ?? []).map((phrase) => ({ locale: rule.locale ?? "ru-RU", matchMode: rule.matchMode ?? "contains", phrase: normalizeBotTriggerText(phrase, rule.locale), priority: priority + (rule.priority ?? 0) }))
    : []);
  if (!phrases.length) return null;
  for (const candidate of scenarios) {
    if (candidate.id === scenarioId || candidate.tenantId !== tenantId || candidate.status !== "published" || candidate.enabled === false) continue;
    for (const rule of candidate.triggerRules ?? []) {
      if (rule.type !== "phrase") continue;
      for (const phrase of rule.phrases ?? []) {
        const candidatePriority = normalizeScenarioPriority(candidate.priority) + normalizeScenarioPriority(rule.priority);
        const duplicate = phrases.find((item) => item.locale === (rule.locale ?? "ru-RU")
          && item.matchMode === (rule.matchMode ?? "contains")
          && item.priority === candidatePriority
          && item.phrase === normalizeBotTriggerText(phrase, rule.locale));
        if (duplicate) return { conflictingScenarioId: candidate.id, phrase: duplicate.phrase, priority: duplicate.priority };
      }
    }
  }
  return null;
}

function normalizeBotScenarioStatus(value: unknown, fallback: string): string {
  const status = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    archived: "archived",
    draft: "draft",
    published: "published",
    "\u0430\u0440\u0445\u0438\u0432": "archived",
    "\u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a": "draft",
    "\u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d": "published"
  };

  return aliases[status] ?? fallback;
}

function resolveVisitorMetricsRange(input: VisitorMetricsRange): { from: string; to: string } {
  const now = new Date();
  const to = validRangeDate(input.to) ?? now;
  const from = validRangeDate(input.from) ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from.getTime() > to.getTime()) return { from: new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), to: to.toISOString() };
  return { from: from.toISOString(), to: to.toISOString() };
}

function validRangeDate(value: string | undefined): Date | null {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value) : null;
}

function automationTenantIdempotencyKey(tenantId: string, key: string): string {
  return `${tenantId}\u0000${key}`;
}

function proactiveRuleTenantId(rule: ProactiveRule): string | null {
  return String(rule.tenantId ?? "").trim() || null;
}

function scopedBotScenarios(scenarios: BotScenario[], tenantId: string): BotScenario[] {
  return scenarios.filter((scenario) => scenarioTenantId(scenario) === tenantId);
}

function tenantRequiredEnvelope(operation: string): BackendEnvelope<Record<string, unknown>> {
  return invalidEnvelope(operation, "tenant_context_required", "Tenant context is required for automation runtime operations.", {});
}
