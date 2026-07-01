import { randomUUID } from "node:crypto";
import { createEnvelope, type BackendEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import {
  automationAuditEvents,
  botScenarios,
  proactiveRules,
  runtimeMetrics,
  type BotFlowEdge,
  type BotFlowNode,
  type BotScenario,
  type ProactiveRule
} from "./automation.fixtures.js";
import { AutomationRepository, type AutomationBotTestRun } from "./automation.repository.js";

const AUTOMATION_SERVICE = "automationService";
const DEFAULT_TENANT_ID = "tenant-demo";
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
}

export class AutomationService {
  private readonly scenarios: BotScenario[];
  private readonly rules: ProactiveRule[];
  private readonly publishIdempotency = new Map<string, { fingerprint: string; result: Record<string, unknown> }>();

  constructor(private readonly automationRepository: AutomationRepository = AutomationRepository.default()) {
    const state = this.automationRepository.readState();
    this.scenarios = overlayById(clone(botScenarios), state.botScenarios);
    this.rules = overlayById(clone(proactiveRules), state.proactiveRules);
    state.publishIdempotencyKeys.forEach((item) => {
      this.publishIdempotency.set(item.key, { fingerprint: item.fingerprint, result: clone(item.result) });
    });
  }

  async fetchAutomationWorkspace(): Promise<BackendEnvelope<Record<string, unknown>>> {
    const state = this.automationRepository.readState();

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "fetchAutomationWorkspace",
      traceId: automationTraceId("fetchAutomationWorkspace"),
      partial: true,
      meta: apiMeta(),
      data: {
        auditEvents: [
          ...clone(automationAuditEvents),
          ...clone(state.botPublishAuditEvents)
        ],
        botScenarios: clone(this.scenarios),
        botScenarioVersions: clone(state.botScenarioVersions),
        proactiveRules: clone(this.rules),
        runtimeMetrics: clone(runtimeMetrics)
      }
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

  async publishBotScenario(payload: PublishBotScenarioPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const scenarioId = request.id?.trim();
    const validation = parseAndValidateBotFlow(request);

    if (!scenarioId) {
      return invalidEnvelope("publishBotScenario", "bot_scenario_id_required", "Bot scenario id is required.", {});
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
      name: validation.payload?.name
    });
    const cached = idempotencyKey ? this.findPublishIdempotency(idempotencyKey) : undefined;

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
      versionState: "published"
    };

    const scenario: BotScenario = {
      channels: clone(request.channels ?? []),
      flowEdges: clone(validation.payload?.flowEdges ?? []),
      flowNodes: clone(validation.payload?.flowNodes ?? []),
      id: scenarioId,
      name: String(validation.payload?.name ?? scenarioId),
      schemaVersion: "bot-flow/v1",
      status: "published"
    };
    this.upsertScenario(scenario);
    await this.automationRepository.saveBotScenario(scenario);
    await this.automationRepository.saveBotScenarioVersion({
      createdAt: new Date().toISOString(),
      flowEdges: clone(scenario.flowEdges),
      flowNodes: clone(scenario.flowNodes),
      scenarioId,
      status: "published",
      versionId: String(result.runtimeVersion)
    });
    await this.automationRepository.saveBotPublishAuditEvent({
      action: "bot.publish",
      actor: "automation-admin",
      auditId: result.auditId,
      createdAt: new Date().toISOString(),
      idempotencyKey: idempotencyKey ?? result.auditId,
      immutable: true,
      runtimeVersion: String(result.runtimeVersion),
      scenarioId,
      versionId: String(result.runtimeVersion)
    });

    if (idempotencyKey) {
      this.publishIdempotency.set(idempotencyKey, { fingerprint, result: clone(result) });
      this.automationRepository.savePublishIdempotencyKey({ key: idempotencyKey, fingerprint, result: clone(result) });
    }

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "publishBotScenario",
      traceId: automationTraceId("publishBotScenario"),
      meta: apiMeta({ idempotencyKey: idempotencyKey ?? null }),
      data: result
    });
  }

  async saveProactiveRule(rule: Partial<ProactiveRule> | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = rule ?? {};

    if (!request.id?.trim()) {
      return invalidEnvelope("saveProactiveRule", "proactive_rule_id_required", "Proactive rule id is required.", {});
    }

    if (!Array.isArray(request.channels) || !request.channels.length) {
      return invalidEnvelope("saveProactiveRule", "proactive_channels_required", "At least one proactive channel is required.", {
        ruleId: request.id
      });
    }

    const savedRule = {
      ...clone(request),
      channels: clone(request.channels),
      id: request.id,
      status: request.status ?? "enabled"
    };
    const index = this.rules.findIndex((item) => item.id === savedRule.id);
    if (index >= 0) {
      this.rules[index] = savedRule;
    } else {
      this.rules.unshift(savedRule);
    }
    this.automationRepository.saveProactiveRule(savedRule);

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "saveProactiveRule",
      traceId: automationTraceId("saveProactiveRule"),
      meta: apiMeta({ ruleId: savedRule.id }),
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

  async testBotScenario(payload: PublishBotScenarioPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};
    const scenarioId = request.id?.trim();

    if (!scenarioId) {
      return invalidEnvelope("testBotScenario", "bot_scenario_id_required", "Bot scenario id is required.", {});
    }

    const testRun: AutomationBotTestRun = {
      auditId: makeAuditId("bot"),
      cases: clone(request.testCases ?? []),
      queue: "bot-runtime",
      scenarioId,
      status: "running",
      testRunId: `bot_test_${randomUUID()}`
    };
    this.automationRepository.saveBotTestRun(testRun);

    return createEnvelope({
      service: AUTOMATION_SERVICE,
      operation: "testBotScenario",
      traceId: automationTraceId("testBotScenario"),
      meta: apiMeta({ scenarioId }),
      data: { ...testRun }
    });
  }

  async createBotHandoffSummary(payload: CreateBotHandoffPayload | null | undefined): Promise<BackendEnvelope<Record<string, unknown>>> {
    const request = payload ?? {};

    if (!request.botId?.trim() || !request.conversationId?.trim()) {
      return invalidEnvelope("createBotHandoffSummary", "bot_handoff_context_required", "botId and conversationId are required.", {
        botId: request.botId ?? null,
        conversationId: request.conversationId ?? null
      });
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

  private findPublishIdempotency(key: string): { fingerprint: string; result: Record<string, unknown> } | undefined {
    const persisted = this.automationRepository.findPublishIdempotencyKey(key);
    if (persisted) {
      return { fingerprint: persisted.fingerprint, result: clone(persisted.result) };
    }

    return this.publishIdempotency.get(key);
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
  traceId
}: {
  data: Record<string, unknown>;
  eventId: string;
  eventName: string;
  resourceId: string;
  resourceType: string;
  schemaVersion: string;
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
    tenantId: DEFAULT_TENANT_ID,
    traceId
  };
}
