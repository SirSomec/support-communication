import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { BotFlowEdge, BotFlowNode, BotScenario, ProactiveRule } from "./automation.types.js";
import {
  AutomationRepository,
  type AutomationBotTestRun,
  type AutomationPublishIdempotencyRecord
} from "./automation.repository.js";
import { BotRuntimeService, type BotRuntimeInboundEvent, type BotRuntimeOptions } from "./bot-runtime.service.js";
import { DEFAULT_PROACTIVE_ATTRIBUTION_WINDOW_MS, ProactiveExposureRepository } from "./proactive-exposure.repository.js";

const AUTOMATION_SERVICE = "automationService";
const VALID_NODE_TYPES = new Set(["message", "quick_replies", "condition", "contact_request", "webhook", "handoff", "fallback"]);

interface BotFlowImportPayload {
  flowEdges?: Array<{ from?: string; label?: string; to?: string }>;
  flowNodes?: BotFlowNode[];
  name?: string;
  schemaVersion?: string;
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
  testCases?: Array<Record<string, unknown>>;
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
  tenantId?: string;
}

export interface VisitorMetricsRange { from?: string; to?: string; }

export class AutomationService {
  private readonly scenarios: BotScenario[];
  private readonly rules: ProactiveRule[];
  private readonly publishIdempotency = new Map<string, { fingerprint: string; result: Record<string, unknown> }>();

  constructor(private readonly automationRepository: AutomationRepository = AutomationRepository.default(),
    private readonly exposureRepository: ProactiveExposureRepository = ProactiveExposureRepository.default()) {
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

  async createBotScenario(payload: Partial<BotScenario> | null | undefined, context: AutomationRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
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
      schemaVersion: "bot-flow/v1",
      status: normalizeBotScenarioStatus(request.status, "draft"),
      tenantId,
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

  async updateBotScenario(scenarioId: string, payload: Partial<BotScenario> | null | undefined, context: AutomationRequestContext = {}): Promise<BackendEnvelope<Record<string, unknown>>> {
    const tenantId = resolveAutomationTenantId(context);
    if (!tenantId) {
      return tenantRequiredEnvelope("updateBotScenario");
    }
    const request = payload ?? {};
    const existing = this.scenarios.find((item) => item.id === scenarioId) ?? await this.automationRepository.findBotScenario(scenarioId);

    if (!existing || scenarioTenantId(existing) !== tenantId) {
      return invalidEnvelope("updateBotScenario", "bot_scenario_not_found", `Bot scenario ${scenarioId} was not found.`, { scenarioId });
    }

    const scenario: BotScenario = {
      ...existing,
      ...request,
      channels: clone(request.channels ?? existing.channels),
      flowEdges: clone(request.flowEdges ?? existing.flowEdges),
      flowNodes: clone(request.flowNodes ?? existing.flowNodes),
      id: scenarioId,
      name: String(request.name ?? existing.name),
      schemaVersion: "bot-flow/v1",
      status: normalizeBotScenarioStatus(request.status, existing.status),
      tenantId,
      updatedAt: new Date().toISOString()
    };
    this.upsertScenario(scenario);
    await this.automationRepository.saveBotScenario(scenario);

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "updateBotScenario",
      traceId: automationTraceId("updateBotScenario"),
      meta: apiMeta({ tenantId }),
      data: { scenario: clone(scenario) }
    });
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
    if (existing && scenarioTenantId(existing) !== tenantId) {
      return invalidEnvelope("publishBotScenario", "bot_scenario_not_found", `Bot scenario ${scenarioId} was not found.`, { scenarioId });
    }

    if (validation.errors.length) {
      return invalidEnvelope("publishBotScenario", "bot_flow_invalid", validation.errors.join("; "), {
        scenarioId
      });
    }

    const idempotencyKey = request.idempotencyKey?.trim();
    const fingerprint = stableStringify({
      channels: request.channels ?? [],
      flowEdges: validation.payload?.flowEdges ?? [],
      flowNodes: validation.payload?.flowNodes ?? [],
      id: scenarioId,
      name: validation.payload?.name,
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
      channels: clone(request.channels ?? []),
      flowEdges: clone(validation.payload?.flowEdges ?? []),
      flowNodes: clone(validation.payload?.flowNodes ?? []),
      id: scenarioId,
      name: String(validation.payload?.name ?? scenarioId),
      schemaVersion: "bot-flow/v1",
      status: "published",
      tenantId
    };
    this.upsertScenario(scenario);
    await this.automationRepository.saveBotScenario(scenario);
    await this.automationRepository.saveBotScenarioVersion({
      createdAt: new Date().toISOString(),
      flowEdges: clone(scenario.flowEdges),
      flowNodes: clone(scenario.flowNodes),
      scenarioId,
      status: "published",
      tenantId,
      versionId: String(result.runtimeVersion)
    });
    await this.automationRepository.saveBotPublishAuditEvent({
      action: "bot.publish",
      actor: "automation-admin",
      auditId: result.auditId,
      createdAt: new Date().toISOString(),
      idempotencyKey: idempotencyKey ? `bot-publish:${tenantId}:${idempotencyKey}` : result.auditId,
      immutable: true,
      runtimeVersion: String(result.runtimeVersion),
      scenarioId,
      tenantId,
      versionId: String(result.runtimeVersion)
    });

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
    if (existing && scenarioTenantId(existing) !== tenantId) {
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

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "testBotScenario",
      traceId: automationTraceId("testBotScenario"),
      meta: apiMeta({ scenarioId, tenantId }),
      data: { ...testRun }
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
