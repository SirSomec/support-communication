import { createHash } from "node:crypto";
import { createOutboxEvent, type OutboxEvent } from "@support-communication/events";
import type {
  ConversationOutboundDescriptor,
  ConversationOutboundDescriptorRecord,
  ConversationRepository
} from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { ProactiveRule } from "./automation.types.js";
import type { AutomationRepository } from "./automation.repository.js";
import {
  evaluateProactiveExperimentAssignmentEligibilityAsync,
  evaluateProactiveExperimentAssignmentEligibility,
  evaluateProactiveExecutionWindowEligibilityAsync,
  evaluateProactiveExecutionWindowEligibility,
  evaluateProactiveFrequencyCapEligibilityAsync,
  evaluateProactiveFrequencyCapEligibility
} from "./proactive-eligibility.js";

export interface ProactiveDeliveryDescriptorInput {
  channel: string;
  evaluatedAt: string;
  message: string;
  phone: string;
  rule: ProactiveRule;
  subjectId: string;
  tenantId: string;
  topic: string;
  traceId: string;
}

export interface ProactiveDeliveryDescriptorPlan {
  descriptor: ConversationOutboundDescriptor;
  outbox: OutboxEvent;
  requestFingerprint: string;
  ruleId: string;
  status: "planned";
}

export interface EligibleProactiveRuleDeliveryInput {
  activeVariants: string[];
  channel: string;
  evaluatedAt: string;
  message: string;
  phone: string;
  repository: AutomationRepository;
  rules: ProactiveRule[];
  subjectId: string;
  tenantId: string;
  topic: string;
  traceId: string;
}

export interface ProactiveDeliveryPersistenceInput {
  conversationRepository: Pick<ConversationRepository, "recordOutboundDescriptor">;
  plan: ProactiveDeliveryDescriptorPlan;
}

export interface ProactiveDeliveryWorkerRunInput {
  activeVariants?: string[];
  automationRepository: AutomationRepository;
  conversationRepository: Pick<ConversationRepository, "listConversations" | "recordOutboundDescriptor">;
  evaluatedAt?: string;
  limit?: number;
  traceId?: string;
  visitorTtlMs?: number;
}

export interface ProactiveDeliveryWorkerRunResult {
  conflicted: number;
  duplicate: number;
  failed: number;
  queued: number;
  scanned: number;
  skipped: number;
}

interface ActiveProactiveVisitor {
  channel: string;
  message: string;
  phone: string;
  segment?: string;
  subjectId: string;
  tenantId: string;
  topic: string;
}

export function planProactiveDeliveryDescriptor(input: ProactiveDeliveryDescriptorInput): ProactiveDeliveryDescriptorPlan {
  const descriptorId = makeProactiveDeliveryId(input.rule.id, input.tenantId, input.subjectId);
  const idempotencyKey = `proactive-delivery:${input.tenantId}:${input.rule.id}:${input.subjectId}`;
  const descriptorPayload = {
    channel: input.channel,
    evaluatedAt: input.evaluatedAt,
    message: input.message,
    phone: input.phone,
    proactiveRuleId: input.rule.id,
    queue: "message-delivery",
    segment: input.rule.segment ?? "manual",
    subjectId: input.subjectId,
    topic: input.topic,
    variant: input.rule.activeVariant ?? "A"
  };
  const requestFingerprint = createRequestFingerprint("proactive_delivery", {
    channel: input.channel,
    idempotencyKey,
    message: input.message,
    phone: input.phone,
    proactiveRuleId: input.rule.id,
    queue: "message-delivery",
    segment: input.rule.segment ?? "manual",
    subjectId: input.subjectId,
    tenantId: input.tenantId,
    topic: input.topic,
    variant: input.rule.activeVariant ?? "A"
  });
  const outbox = createOutboxEvent({
    aggregateId: descriptorId,
    aggregateType: "conversation_outbound",
    payload: {
      channel: input.channel,
      descriptorId,
      idempotencyKey,
      phone: input.phone,
      proactiveRuleId: input.rule.id,
      subjectId: input.subjectId,
      topic: input.topic
    },
    queue: "message-delivery",
    traceId: input.traceId,
    type: "conversation.outbound.requested"
  });
  const descriptor: ConversationOutboundDescriptor = {
    auditId: null,
    channel: input.channel,
    conversationId: null,
    createdAt: input.evaluatedAt,
    deliveryState: "queued",
    id: descriptorId,
    idempotencyKey,
    kind: "outbound_conversation",
    messageId: null,
    outboxEventId: outbox.id,
    payload: descriptorPayload,
    requestFingerprint,
    retryable: true,
    status: "queued",
    tenantId: input.tenantId,
    traceId: input.traceId
  };

  return {
    descriptor,
    outbox,
    requestFingerprint,
    ruleId: input.rule.id,
    status: "planned"
  };
}

export function planEligibleProactiveRuleDelivery(input: EligibleProactiveRuleDeliveryInput): ProactiveDeliveryDescriptorPlan | null {
  for (const rule of input.rules) {
    if (rule.status !== "enabled") {
      continue;
    }

    if (!rule.channels.includes(input.channel)) {
      continue;
    }

    const windowEligibility = evaluateProactiveExecutionWindowEligibility({
      evaluatedAt: input.evaluatedAt,
      repository: input.repository,
      ruleId: rule.id,
      tenantId: input.tenantId
    });
    if (!windowEligibility.eligible) {
      continue;
    }

    const capEligibility = evaluateProactiveFrequencyCapEligibility({
      evaluatedAt: input.evaluatedAt,
      repository: input.repository,
      ruleId: rule.id,
      tenantId: input.tenantId
    });
    if (!capEligibility.eligible) {
      continue;
    }

    const experimentEligibility = evaluateProactiveExperimentAssignmentEligibility({
      assignedAt: input.evaluatedAt,
      experimentId: `exp-${rule.id}`,
      repository: input.repository,
      ruleId: rule.id,
      subjectId: input.subjectId,
      tenantId: input.tenantId,
      variants: input.activeVariants
    });
    if (!experimentEligibility.eligible) {
      continue;
    }

    return planProactiveDeliveryDescriptor({
      channel: input.channel,
      evaluatedAt: input.evaluatedAt,
      message: input.message,
      phone: input.phone,
      rule: {
        ...rule,
        activeVariant: experimentEligibility.assignment?.variant ?? rule.activeVariant
      },
      subjectId: input.subjectId,
      tenantId: input.tenantId,
      topic: input.topic,
      traceId: input.traceId
    });
  }

  return null;
}

export async function planEligibleProactiveRuleDeliveryAsync(input: EligibleProactiveRuleDeliveryInput): Promise<ProactiveDeliveryDescriptorPlan | null> {
  for (const rule of input.rules) {
    if (rule.status !== "enabled") {
      continue;
    }

    if (!rule.channels.includes(input.channel)) {
      continue;
    }

    const windowEligibility = await evaluateProactiveExecutionWindowEligibilityAsync({
      evaluatedAt: input.evaluatedAt,
      repository: input.repository,
      ruleId: rule.id,
      tenantId: input.tenantId
    });
    if (!windowEligibility.eligible) {
      continue;
    }

    const capEligibility = await evaluateProactiveFrequencyCapEligibilityAsync({
      evaluatedAt: input.evaluatedAt,
      repository: input.repository,
      ruleId: rule.id,
      tenantId: input.tenantId
    });
    if (!capEligibility.eligible) {
      continue;
    }

    const experimentEligibility = await evaluateProactiveExperimentAssignmentEligibilityAsync({
      assignedAt: input.evaluatedAt,
      experimentId: `exp-${rule.id}`,
      repository: input.repository,
      ruleId: rule.id,
      subjectId: input.subjectId,
      tenantId: input.tenantId,
      variants: input.activeVariants
    });
    if (!experimentEligibility.eligible) {
      continue;
    }

    return planProactiveDeliveryDescriptor({
      channel: input.channel,
      evaluatedAt: input.evaluatedAt,
      message: input.message,
      phone: input.phone,
      rule: {
        ...rule,
        activeVariant: experimentEligibility.assignment?.variant ?? rule.activeVariant
      },
      subjectId: input.subjectId,
      tenantId: input.tenantId,
      topic: input.topic,
      traceId: input.traceId
    });
  }

  return null;
}

export function persistProactiveDeliveryPlan(
  input: ProactiveDeliveryPersistenceInput
): Promise<ConversationOutboundDescriptorRecord> {
  return Promise.resolve(input.conversationRepository.recordOutboundDescriptor({
    descriptor: input.plan.descriptor,
    outbox: input.plan.outbox
  }));
}

export async function runProactiveDeliveryWorkerOnce(
  input: ProactiveDeliveryWorkerRunInput
): Promise<ProactiveDeliveryWorkerRunResult> {
  const evaluatedAt = input.evaluatedAt ?? new Date().toISOString();
  const limit = normalizeLimit(input.limit);
  const visitorTtlMs = normalizeVisitorTtlMs(input.visitorTtlMs);
  const activeVariants = normalizeVariants(input.activeVariants);
  const state = await input.automationRepository.readStateAsync();
  const rules = await input.automationRepository.listProactiveRulesAsync();
  const visitors = state.activeVisitors?.length
    ? state.activeVisitors.slice(0, limit)
    : (await input.conversationRepository.listConversations())
      .filter((conversation) => isActiveConversation(conversation, evaluatedAt, visitorTtlMs))
      .slice(0, limit)
      .map(activeVisitorFromConversation);
  const result: ProactiveDeliveryWorkerRunResult = {
    conflicted: 0,
    duplicate: 0,
    failed: 0,
    queued: 0,
    scanned: visitors.length,
    skipped: 0
  };

  for (let index = 0; index < visitors.length; index += 1) {
    const visitor = normalizeActiveVisitor(visitors[index]);
    if (!visitor) {
      result.skipped += 1;
      continue;
    }

    const eligibleRules = rules.filter((rule) =>
      rule.tenantId === visitor.tenantId
      && (!rule.segment || rule.segment === visitor.segment)
    );

    try {
      const plan = await planEligibleProactiveRuleDeliveryAsync({
        activeVariants,
        channel: visitor.channel,
        evaluatedAt,
        message: visitor.message,
        phone: visitor.phone,
        repository: input.automationRepository,
        rules: eligibleRules,
        subjectId: visitor.subjectId,
        tenantId: visitor.tenantId,
        topic: visitor.topic,
        traceId: input.traceId ?? makeWorkerTraceId(evaluatedAt, index)
      });
      if (!plan) {
        result.skipped += 1;
        continue;
      }

      const idempotencyKey = plan.descriptor.idempotencyKey;
      if (!idempotencyKey) {
        result.failed += 1;
        continue;
      }
      const descriptorId = plan.descriptor.id;
      const outboxEventId = plan.outbox.id;
      const variant = String(plan.descriptor.payload.variant ?? "A");
      const commit = await input.automationRepository.commitProactiveDeliveryAsync({
        attemptedAt: evaluatedAt,
        attribution: {
          assignedAt: evaluatedAt,
          attributionId: `attribution_${descriptorId}`,
          descriptorId,
          experimentId: `exp-${plan.ruleId}`,
          ruleId: plan.ruleId,
          subjectId: visitor.subjectId,
          tenantId: visitor.tenantId,
          variant
        },
        attempt: {
          attemptedAt: evaluatedAt,
          attemptId: `attempt_${descriptorId}`,
          channel: visitor.channel,
          descriptorId,
          ruleId: plan.ruleId,
          status: "queued",
          subjectId: visitor.subjectId,
          tenantId: visitor.tenantId,
          traceId: plan.descriptor.traceId
        },
        conversationRepository: input.conversationRepository,
        descriptor: plan.descriptor,
        evaluatedAt,
        idempotencyRecord: {
          fingerprint: plan.requestFingerprint,
          key: idempotencyKey,
          result: {
            descriptorId,
            outboxEventId
          },
          ruleId: plan.ruleId,
          subjectId: visitor.subjectId,
          tenantId: visitor.tenantId
        },
        outbox: plan.outbox,
        ruleId: plan.ruleId,
        tenantId: visitor.tenantId
      });
      if (commit.outcome === "queued") {
        result.queued += 1;
      } else if (commit.outcome === "duplicate") {
        result.duplicate += 1;
      } else if (commit.outcome === "conflicted") {
        result.conflicted += 1;
      } else {
        result.skipped += 1;
      }
    } catch {
      result.failed += 1;
    }
  }

  return result;
}

function makeProactiveDeliveryId(ruleId: string, tenantId: string, subjectId: string): string {
  return `proactive_${sanitizeIdentifierSegment(ruleId)}_${sanitizeIdentifierSegment(tenantId)}_${sanitizeIdentifierSegment(subjectId)}`;
}

function normalizeActiveVisitor(value: Record<string, unknown>): ActiveProactiveVisitor | null {
  const tenantId = firstNonEmptyString(value.tenantId);
  const subjectId = firstNonEmptyString(value.subjectId, value.clientId, value.userId, value.id);
  const channel = firstNonEmptyString(value.channel);
  if (!tenantId || !subjectId || !channel) {
    return null;
  }

  const segment = firstNonEmptyString(value.segment);
  return {
    channel,
    message: firstNonEmptyString(value.message, value.proactiveMessage)
      ?? "Hello! We are available to help with this session.",
    phone: firstNonEmptyString(value.phone) ?? "",
    ...(segment ? { segment } : {}),
    subjectId,
    tenantId,
    topic: firstNonEmptyString(value.topic, value.page, segment) ?? "Proactive visitor"
  };
}

function activeVisitorFromConversation(conversation: ConversationRecord): Record<string, unknown> {
  const segment = conversation.tags
    .find((tag) => tag.toLowerCase().startsWith("segment:"))
    ?.slice("segment:".length)
    .trim();
  const page = conversation.tags
    .find((tag) => tag.toLowerCase().startsWith("page:"))
    ?.slice("page:".length)
    .trim();

  return {
    channel: conversation.channel,
    id: conversation.id,
    ...(page ? { page } : {}),
    phone: conversation.phone,
    ...(segment ? { segment } : {}),
    tenantId: conversation.tenantId,
    topic: conversation.topic
  };
}

function isActiveConversation(conversation: ConversationRecord, evaluatedAt: string, visitorTtlMs: number): boolean {
  if (String(conversation.channel).trim().toLowerCase() !== "sdk") {
    return false;
  }
  if (!["active", "new", "open", "unassigned"].includes(String(conversation.status).trim().toLowerCase())) {
    return false;
  }

  const evaluatedTime = Date.parse(evaluatedAt);
  const updatedTime = Date.parse(conversation.updatedAt ?? "");
  return Number.isFinite(evaluatedTime)
    && Number.isFinite(updatedTime)
    && updatedTime <= evaluatedTime
    && evaluatedTime - updatedTime <= visitorTtlMs;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeLimit(value: number | undefined): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 50;
}

function normalizeVisitorTtlMs(value: number | undefined): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : 15 * 60 * 1000;
}

function normalizeVariants(values: string[] | undefined): string[] {
  const normalized = (values ?? ["A", "B"])
    .map((value) => value.trim())
    .filter(Boolean);
  return normalized.length ? [...new Set(normalized)] : ["A", "B"];
}

function makeWorkerTraceId(evaluatedAt: string, index: number): string {
  return `trc_proactive_delivery_${sanitizeIdentifierSegment(evaluatedAt)}_${index + 1}`;
}

function createRequestFingerprint(scope: string, payload: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify({ payload, scope }))
    .digest("hex");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function sanitizeIdentifierSegment(value: string): string {
  return value.replace(/[^a-z0-9_]+/gi, "_");
}
