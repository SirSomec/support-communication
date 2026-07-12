import { randomUUID } from "node:crypto";
import {
  ConversationRepository,
  type ConversationAssignmentRecord,
  type ConversationLifecycleEvent,
  type ConversationMutationRecord,
  type RealtimeEvent
} from "../conversation/conversation.repository.js";
import type { ConversationRecord } from "../conversation/conversation.types.js";
import type { RoutingConversation } from "./routing.types.js";

export type CanonicalRoutingMutationAction = "assign" | "transfer" | "return_queue";

export interface CanonicalRoutingConversation extends RoutingConversation {
  /** Canonical support queue id. Routing's legacy `channel` field carries this same value. */
  queueId: string;
  persistedStatus: string;
  /** Transport channel from ConversationRecord (for example telegram or sdk). */
  sourceChannel: string;
  updatedAt?: string;
}

export interface CanonicalRoutingMutationInput {
  action: CanonicalRoutingMutationAction;
  actorId?: string;
  actorName?: string;
  actorType?: ConversationLifecycleEvent["actorType"];
  conversationId: string;
  mutationId?: string;
  occurredAt?: string;
  operatorId?: string;
  operatorName?: string;
  queueId?: string;
  reason?: string;
  tenantId: string;
  traceId?: string;
}

export interface CanonicalRoutingMutationResult {
  conversation: CanonicalRoutingConversation;
  lifecycleEvent: ConversationLifecycleEvent;
  realtimeEvent: RealtimeEvent;
  record: ConversationRecord;
}

type PersistedRoutingMutation = ConversationMutationRecord | ConversationAssignmentRecord;

/**
 * Bridges assignment mutations to the canonical conversation store.
 *
 * SLA and rescue are intentionally deferred: ConversationRecord has no rescue
 * snapshot, and those transitions must also coordinate timer/job ownership.
 */
export class CanonicalRoutingConversationRepository {
  constructor(private readonly conversationRepository = ConversationRepository.default()) {}

  async listConversations(tenantId: string): Promise<CanonicalRoutingConversation[]> {
    const requiredTenantId = requireTenantId(tenantId);
    const records = await this.conversationRepository.listConversations();
    return records
      .filter((record) => record.tenantId === requiredTenantId)
      .map(mapConversationRecordToRoutingConversation);
  }

  async findConversation(conversationId: string, tenantId: string): Promise<CanonicalRoutingConversation | undefined> {
    const requiredTenantId = requireTenantId(tenantId);
    const record = await this.conversationRepository.findConversation(conversationId);
    return record?.tenantId === requiredTenantId ? mapConversationRecordToRoutingConversation(record) : undefined;
  }

  async saveRoutingMutation(input: CanonicalRoutingMutationInput): Promise<CanonicalRoutingMutationResult> {
    const tenantId = requireTenantId(input.tenantId);
    const current = await this.conversationRepository.findConversation(input.conversationId);
    if (!current || current.tenantId !== tenantId) {
      throw new CanonicalRoutingConversationNotFoundError(input.conversationId, tenantId);
    }

    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const mutationId = input.mutationId ?? `routing_${randomUUID()}`;
    const traceId = input.traceId ?? `routing:${mutationId}`;
    const previousOperatorId = current.operatorId ?? null;
    const previousStatus = toRoutingStatus(current.status, previousOperatorId);
    const next = clone(current);
    const eventData = applyRoutingMutation(next, input, previousStatus);
    next.updatedAt = occurredAt;

    const lifecycleEvent = createLifecycleEvent(input, next, mutationId, traceId, occurredAt, eventData);
    const realtimeEvent = createRealtimeEvent(next, mutationId, traceId, occurredAt, eventData);
    let persisted: PersistedRoutingMutation;

    if (input.action === "assign" || input.action === "transfer") {
      const operatorId = requireOperatorId(input.operatorId, input.action);
      persisted = await this.conversationRepository.assignConversation({
        analyticsRow: {
          channel: current.channel,
          conversationId: current.id,
          eventKind: input.action === "transfer" ? "transfer" : "assignment",
          fromOperatorId: previousOperatorId,
          id: `analytics_${mutationId}`,
          occurredAt,
          source: "dialog-interface",
          tenantId,
          toOperatorId: operatorId
        },
        conversation: next,
        lifecycleEvent,
        realtimeEvent
      });
    } else {
      persisted = await this.conversationRepository.saveConversationMutation({
        conversation: next,
        lifecycleEvent,
        realtimeEvent
      });
    }

    return {
      conversation: mapConversationRecordToRoutingConversation(persisted.conversation),
      lifecycleEvent: persisted.lifecycleEvent,
      realtimeEvent: persisted.realtimeEvent,
      record: persisted.conversation
    };
  }

  applyMutation(input: CanonicalRoutingMutationInput): Promise<CanonicalRoutingMutationResult> {
    return this.saveRoutingMutation(input);
  }
}

export class CanonicalRoutingConversationNotFoundError extends Error {
  readonly code = "canonical_routing_conversation_not_found";

  constructor(conversationId: string, tenantId: string) {
    super(`Conversation ${conversationId} was not found in tenant ${tenantId}.`);
    this.name = "CanonicalRoutingConversationNotFoundError";
  }
}

export function mapConversationRecordToRoutingConversation(record: ConversationRecord): CanonicalRoutingConversation {
  const queueId = normalizeOptionalString(record.queueId) ?? record.channel;
  const operatorId = normalizeOptionalString(record.operatorId);
  return {
    channel: queueId,
    client: record.name,
    id: record.id,
    ...(operatorId ? { operatorId } : {}),
    persistedStatus: record.status,
    queueId,
    ...(routingRescueState(record.rescueState) ? { rescue: routingRescueState(record.rescueState) } : {}),
    slaTone: toRoutingSlaTone(record.slaTone, record.status),
    sourceChannel: record.channel,
    status: toRoutingStatus(record.status, operatorId ?? null),
    ...(record.teamId ? { teamId: record.teamId } : {}),
    tenantId: record.tenantId,
    ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    ...(record.topic ? { topic: record.topic } : {})
  };
}

function routingRescueState(value: Record<string, unknown> | undefined): RoutingConversation["rescue"] | undefined {
  if (!value || typeof value.state !== "string") return undefined;
  const durationSeconds = Number(value.durationSeconds);
  const startedAt = Number(value.startedAt);
  const deadlineAt = Number(value.deadlineAt);
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(startedAt) || !Number.isFinite(deadlineAt)) return undefined;
  const state = value.state;
  if (state !== "active" && state !== "saved" && state !== "returned_to_queue" && state !== "missed") return undefined;
  return {
    state,
    durationSeconds,
    startedAt,
    deadlineAt,
    reason: String(value.reason ?? ""),
    nextAction: String(value.nextAction ?? ""),
    source: String(value.source ?? "unknown")
  };
}

function applyRoutingMutation(
  record: ConversationRecord,
  input: CanonicalRoutingMutationInput,
  previousStatus: RoutingConversation["status"]
): Record<string, unknown> {
  const fromOperatorId = record.operatorId ?? null;
  const queueId = normalizeOptionalString(input.queueId) ?? normalizeOptionalString(record.queueId) ?? record.channel;

  if (input.action === "assign" || input.action === "transfer") {
    const operatorId = requireOperatorId(input.operatorId, input.action);
    record.operatorId = operatorId;
    if (input.operatorName) record.operatorName = input.operatorName;
    record.status = input.action === "transfer" ? "transferred" : "assigned";
    if (record.slaTone === "closed") record.slaTone = "ok";
    return { action: input.action, fromOperatorId, fromStatus: previousStatus, queueId, toOperatorId: operatorId, toStatus: record.status };
  }

  record.queueId = queueId;
  delete record.operatorId;
  delete record.operatorName;
  record.status = "queued";
  record.slaTone = record.slaTone === "danger" ? "danger" : "hold";
  return { action: "return_queue", fromOperatorId, fromStatus: previousStatus, queueId, toOperatorId: null, toStatus: "queued" };
}

function createLifecycleEvent(
  input: CanonicalRoutingMutationInput,
  record: ConversationRecord,
  mutationId: string,
  traceId: string,
  occurredAt: string,
  data: Record<string, unknown>
): ConversationLifecycleEvent {
  return {
    actorId: input.actorId ?? null,
    actorName: input.actorName ?? null,
    actorType: input.actorType ?? "system",
    conversationId: record.id,
    data,
    eventType: input.action === "return_queue" ? "queue.entered" : "assignment.changed",
    id: `lifecycle_${mutationId}`,
    ingestedAt: occurredAt,
    occurredAt,
    reason: normalizeOptionalString(input.reason) ?? null,
    schemaVersion: "conversation-lifecycle/v1",
    source: "canonical-routing-bridge",
    sourceEventId: mutationId,
    tenantId: record.tenantId,
    traceId
  };
}

function createRealtimeEvent(
  record: ConversationRecord,
  mutationId: string,
  traceId: string,
  occurredAt: string,
  data: Record<string, unknown>
): RealtimeEvent {
  return {
    data,
    eventId: `realtime_${mutationId}`,
    eventName: "routing.assignment.updated",
    occurredAt,
    resourceId: record.id,
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId: record.tenantId,
    traceId
  };
}

function toRoutingStatus(status: string, operatorId: string | null): RoutingConversation["status"] {
  if (status === "active" || status === "assigned" || status === "closed" || status === "paused" || status === "queued" || status === "transferred") {
    return status;
  }
  return operatorId ? "assigned" : "queued";
}

function toRoutingSlaTone(slaTone: string, status: string): RoutingConversation["slaTone"] {
  if (slaTone === "closed" || slaTone === "danger" || slaTone === "hold" || slaTone === "ok" || slaTone === "warn") return slaTone;
  return status === "closed" ? "closed" : "ok";
}

function requireTenantId(value: string): string {
  const tenantId = normalizeOptionalString(value);
  if (!tenantId) throw new TypeError("tenantId is required for canonical routing conversation access.");
  return tenantId;
}

function requireOperatorId(value: string | undefined, action: "assign" | "transfer"): string {
  const operatorId = normalizeOptionalString(value);
  if (!operatorId) throw new TypeError(`operatorId is required for routing ${action}.`);
  return operatorId;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
