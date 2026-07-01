import { createHash } from "node:crypto";
import { createOutboxEvent, type OutboxEvent } from "@support-communication/events";
import type {
  ConversationOutboundDescriptor,
  ConversationOutboundDescriptorRecord,
  ConversationRepository
} from "../conversation/conversation.repository.js";
import type { ProactiveRule } from "./automation.fixtures.js";
import type { AutomationRepository } from "./automation.repository.js";
import {
  evaluateProactiveExperimentAssignmentEligibility,
  evaluateProactiveExecutionWindowEligibility,
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
    idempotencyKey,
    tenantId: input.tenantId,
    ...descriptorPayload
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

export function persistProactiveDeliveryPlan(
  input: ProactiveDeliveryPersistenceInput
): Promise<ConversationOutboundDescriptorRecord> {
  return Promise.resolve(input.conversationRepository.recordOutboundDescriptor({
    descriptor: input.plan.descriptor,
    outbox: input.plan.outbox
  }));
}

function makeProactiveDeliveryId(ruleId: string, tenantId: string, subjectId: string): string {
  return `proactive_${sanitizeIdentifierSegment(ruleId)}_${sanitizeIdentifierSegment(tenantId)}_${sanitizeIdentifierSegment(subjectId)}`;
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
