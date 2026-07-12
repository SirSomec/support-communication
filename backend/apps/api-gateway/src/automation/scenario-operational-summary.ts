import type {
  AutomationBotPublishAuditEvent,
  AutomationBotRuntimeInstance,
  AutomationBotRuntimeStep,
  AutomationState
} from "./automation.repository.js";
import type { BotScenario } from "./automation.types.js";

const RECENT_LIMIT = 5;
const ESTIMATED_USD_PER_1K_TOKENS = 0.002;

export type AiUsageCostBucket = "none" | "low" | "medium" | "high";

export interface ScenarioOperationalViewer {
  isServiceAdmin?: boolean;
  permissions?: string[];
}

export interface ScenarioOperationalAiUsage {
  estimatedCostBucket: AiUsageCostBucket;
  estimatedCostUsd: number;
  month: string;
  monthlyTokenBudget: number | null;
  usedTokens: number;
}

export interface ScenarioOperationalFailure {
  at: string;
  conversationId: string;
  error: string | null;
  outcome: string;
}

export interface ScenarioOperationalHandoff {
  at: string;
  conversationId: string;
  queue: string | null;
  reason: string | null;
}

export interface ScenarioOperationalPublish {
  action: string;
  actor: string;
  at: string;
  versionId: string;
}

export interface ScenarioOperationalCitation {
  sourceId: string;
  title: string;
  version: number;
}

export interface ScenarioOperationalSummary {
  aiUsage: ScenarioOperationalAiUsage | null;
  lastCitations: ScenarioOperationalCitation[];
  lastFallbackReason: string | null;
  recentFailures: ScenarioOperationalFailure[];
  recentHandoffs: ScenarioOperationalHandoff[];
  recentPublishes: ScenarioOperationalPublish[];
  scenarioId: string;
  status: string;
}

export function canViewAiUsage(viewer: ScenarioOperationalViewer = {}): boolean {
  if (viewer.isServiceAdmin) return true;
  const permissions = viewer.permissions ?? [];
  if (permissions.includes("*")) return true;
  return permissions.some((permission) =>
    ["ai.connections.manage", "settings.manage", "settings.write", "automation.write"].includes(permission)
  );
}

export function estimateAiCostBucket(usedTokens: number): AiUsageCostBucket {
  if (usedTokens <= 0) return "none";
  if (usedTokens < 10_000) return "low";
  if (usedTokens < 100_000) return "medium";
  return "high";
}

export function estimateAiCostUsd(usedTokens: number): number {
  return Math.round((Math.max(0, usedTokens) / 1_000) * ESTIMATED_USD_PER_1K_TOKENS * 10_000) / 10_000;
}

export function buildTenantAiUsageSummary(input: {
  monthlyTokenBudget?: number | null;
  month?: string;
  usedTokens?: number;
  viewer?: ScenarioOperationalViewer;
}): ScenarioOperationalAiUsage | null {
  if (!canViewAiUsage(input.viewer)) return null;
  const usedTokens = Math.max(0, Math.floor(Number(input.usedTokens ?? 0) || 0));
  return {
    estimatedCostBucket: estimateAiCostBucket(usedTokens),
    estimatedCostUsd: estimateAiCostUsd(usedTokens),
    month: String(input.month ?? new Date().toISOString().slice(0, 7)),
    monthlyTokenBudget: Number.isInteger(input.monthlyTokenBudget) ? Number(input.monthlyTokenBudget) : null,
    usedTokens
  };
}

export function buildScenarioOperationalSummaries(input: {
  aiUsage?: ScenarioOperationalAiUsage | null;
  publishEvents?: AutomationBotPublishAuditEvent[];
  runtimeInstances?: AutomationBotRuntimeInstance[];
  runtimeSteps?: AutomationBotRuntimeStep[];
  scenarios: BotScenario[];
  tenantId: string;
}): ScenarioOperationalSummary[] {
  const instances = (input.runtimeInstances ?? []).filter((item) => item.tenantId === input.tenantId);
  const steps = (input.runtimeSteps ?? []).filter((item) => item.tenantId === input.tenantId);
  const publishes = (input.publishEvents ?? []).filter((item) => item.tenantId === input.tenantId);
  const instanceById = new Map(instances.map((item) => [item.id, item]));

  return input.scenarios
    .filter((scenario) => scenario.tenantId === input.tenantId)
    .map((scenario) => {
      const scenarioSteps = steps
        .filter((step) => resolveStepScenarioId(step, instanceById) === scenario.id)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
      const scenarioInstances = instances
        .filter((item) => item.scenarioId === scenario.id)
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
      const scenarioPublishes = publishes
        .filter((event) => event.scenarioId === scenario.id)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
        .slice(0, RECENT_LIMIT)
        .map((event) => ({
          action: event.action,
          actor: event.actor,
          at: event.createdAt,
          versionId: event.versionId
        }));

      const recentFailures = collectFailures(scenarioSteps, scenarioInstances).slice(0, RECENT_LIMIT);
      const recentHandoffs = collectHandoffs(scenarioSteps, scenarioInstances).slice(0, RECENT_LIMIT);
      const lastCitations = collectLatestCitations(scenarioSteps);
      const lastFallbackReason = collectLatestFallbackReason(scenarioSteps, scenarioInstances);

      return {
        aiUsage: input.aiUsage ?? null,
        lastCitations,
        lastFallbackReason,
        recentFailures,
        recentHandoffs,
        recentPublishes: scenarioPublishes,
        scenarioId: scenario.id,
        status: scenario.status
      };
    });
}

export function buildScenarioOperationalSummariesFromState(
  state: Pick<AutomationState, "botPublishAuditEvents" | "botRuntimeInstances" | "botRuntimeSteps" | "botScenarios">,
  tenantId: string,
  aiUsage: ScenarioOperationalAiUsage | null = null
): ScenarioOperationalSummary[] {
  return buildScenarioOperationalSummaries({
    aiUsage,
    publishEvents: state.botPublishAuditEvents,
    runtimeInstances: state.botRuntimeInstances,
    runtimeSteps: state.botRuntimeSteps,
    scenarios: state.botScenarios,
    tenantId
  });
}

function resolveStepScenarioId(
  step: AutomationBotRuntimeStep,
  instanceById: Map<string, AutomationBotRuntimeInstance>
): string | null {
  const fromEvent = step.inputEvent?.scenarioId;
  if (typeof fromEvent === "string" && fromEvent.trim()) return fromEvent.trim();
  return instanceById.get(step.runtimeId)?.scenarioId ?? null;
}

function collectFailures(
  steps: AutomationBotRuntimeStep[],
  instances: AutomationBotRuntimeInstance[]
): ScenarioOperationalFailure[] {
  const fromSteps = steps
    .filter((step) => step.error || ["dead_lettered", "retry_scheduled", "ai_handoff_requested"].includes(step.outcome))
    .map((step) => ({
      at: step.createdAt,
      conversationId: step.conversationId,
      error: step.error,
      outcome: step.outcome
    }));
  const fromInstances = instances
    .filter((item) => item.lastError || item.status === "dead_lettered" || item.status === "retry_scheduled")
    .map((item) => ({
      at: item.updatedAt,
      conversationId: item.conversationId,
      error: item.lastError,
      outcome: item.status
    }));
  return [...fromSteps, ...fromInstances].sort((left, right) => String(right.at).localeCompare(String(left.at)));
}

function collectHandoffs(
  steps: AutomationBotRuntimeStep[],
  instances: AutomationBotRuntimeInstance[]
): ScenarioOperationalHandoff[] {
  const fromSteps = steps
    .filter((step) => step.handoffSummary || step.outcome === "handed_off" || step.outcome === "ai_handoff_requested")
    .map((step) => ({
      at: step.createdAt,
      conversationId: step.conversationId,
      queue: stringOrNull(step.handoffSummary?.queue),
      reason: stringOrNull(step.handoffSummary?.reason) ?? fallbackReasonFromContext(step)
    }));
  const fromInstances = instances
    .filter((item) => item.status === "handoff")
    .map((item) => ({
      at: item.updatedAt,
      conversationId: item.conversationId,
      queue: stringOrNull(item.context?.handoffQueue),
      reason: stringOrNull(item.context?.lastAiFailure) ?? stringOrNull(item.context?.handoffReason) ?? "handoff"
    }));
  return [...fromSteps, ...fromInstances].sort((left, right) => String(right.at).localeCompare(String(left.at)));
}

function collectLatestCitations(steps: AutomationBotRuntimeStep[]): ScenarioOperationalCitation[] {
  for (const step of steps) {
    for (const effect of step.sideEffects ?? []) {
      const citations = extractCitations(effect);
      if (citations.length) return citations;
    }
    const fromResponse = step.handoffSummary == null
      ? extractCitationsFromUnknown((step as { aiResponse?: unknown }).aiResponse)
      : [];
    if (fromResponse.length) return fromResponse;
  }
  return [];
}

function collectLatestFallbackReason(
  steps: AutomationBotRuntimeStep[],
  instances: AutomationBotRuntimeInstance[]
): string | null {
  for (const step of steps) {
    const reason = stringOrNull(step.handoffSummary?.reason) ?? fallbackReasonFromContext(step) ?? stringOrNull(step.error);
    if (reason) return reason;
  }
  for (const instance of instances) {
    const reason = stringOrNull(instance.context?.lastAiFailure) ?? stringOrNull(instance.lastError);
    if (reason) return reason;
  }
  return null;
}

function fallbackReasonFromContext(step: AutomationBotRuntimeStep): string | null {
  const input = step.inputEvent ?? {};
  return stringOrNull(input.lastAiFailure) ?? stringOrNull(input.fallbackReason);
}

function extractCitations(effect: Record<string, unknown>): ScenarioOperationalCitation[] {
  const descriptor = asRecord(effect.descriptor);
  const payload = asRecord(descriptor?.payload) ?? asRecord(effect.payload);
  return extractCitationsFromUnknown(payload?.citations);
}

function extractCitationsFromUnknown(value: unknown): ScenarioOperationalCitation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const sourceId = stringOrNull(record.sourceId);
      const title = stringOrNull(record.title);
      const version = Number(record.version ?? record.sourceVersion);
      if (!sourceId || !title || !Number.isFinite(version)) return null;
      return { sourceId, title, version };
    })
    .filter((item): item is ScenarioOperationalCitation => item != null);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringOrNull(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
