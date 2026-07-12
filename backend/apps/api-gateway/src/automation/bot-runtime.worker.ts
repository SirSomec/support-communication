import { redactSensitiveText } from "@support-communication/redaction";
import type { BotScenario } from "./automation.types.js";
import type {
  ConversationOutboundDescriptor,
  ConversationOutboundDescriptorRecord,
  ConversationRepository,
  RealtimeEvent
} from "../conversation/conversation.repository.js";

const BOT_RUNTIME_ALLOWED_NODE_TYPES = new Set(["message", "ai_reply", "quick_replies", "condition", "contact_request", "webhook", "handoff", "fallback"]);

export interface BotRuntimeStateTransitionInput {
  channel?: string;
  conversationId: string;
  currentNodeId: string;
  eventId: string;
  scenario: BotScenario;
  tenantId: string;
  traceId: string;
}

export interface BotRuntimeNodeSelectionInput extends BotRuntimeStateTransitionInput {
  edgeLabel?: string;
}

export function planBotRuntimeLabeledTransition(input: BotRuntimeNodeSelectionInput): BotRuntimeStateTransition {
  const edges = input.scenario.flowEdges.filter((edge) => edge.from === input.currentNodeId && (input.edgeLabel === undefined || edge.label === input.edgeLabel));
  if (edges.length !== 1) throw new Error(edges.length ? "bot_runtime_transition_ambiguous" : "bot_runtime_transition_edge_not_found");
  return planBotRuntimeStateTransition({ ...input, scenario: { ...input.scenario, flowEdges: edges } });
}

export interface BotRuntimeStateTransition {
  conversationId: string;
  eventId: string;
  nextNodeId: string;
  nodeType: string;
  previousNodeId: string;
  scenarioId: string;
  sideEffects: BotRuntimeSideEffect[];
  status: "transitioned";
  tenantId: string;
  traceId: string;
}

export interface BotRuntimeConversationState {
  conversationId: string;
  currentNodeId: string;
  lastEventId: string;
  previousNodeId?: string;
  scenarioId: string;
  tenantId: string;
  traceId?: string;
  updatedAt: string;
}

export interface BotRuntimeOutboundMessageSideEffect {
  descriptor: ConversationOutboundDescriptor;
  kind: "message_delivery";
}

export interface BotRuntimeHandoffDescriptor {
  eventId: string;
  eventName: "bot.handoff.created";
  resourceId: string;
  resourceType: "conversation";
  schemaVersion: "bot-handoff/v1";
  summary: {
    botId: string;
    nodeId: string;
    queue: string;
    reason: string;
  };
  tenantId: string;
  traceId: string;
}

export interface BotRuntimeHandoffSideEffect {
  descriptor: BotRuntimeHandoffDescriptor;
  kind: "bot_handoff";
}

export type BotRuntimeSideEffect = BotRuntimeOutboundMessageSideEffect | BotRuntimeHandoffSideEffect;

export interface BotRuntimeOutboundPersistenceInput {
  conversationRepository: Pick<ConversationRepository, "recordOutboundDescriptor">;
  transition: BotRuntimeStateTransition;
}

export interface BotRuntimeHandoffPersistenceInput {
  conversationRepository: Pick<ConversationRepository, "appendRealtimeEvent" | "listRealtimeEvents">;
  occurredAt?: string;
  transition: BotRuntimeStateTransition;
}

export interface BotRuntimeHandoffPersistenceRecord {
  descriptor: BotRuntimeHandoffDescriptor;
  realtimeEvent: RealtimeEvent;
}

export interface BotRuntimeRetryStateInput {
  currentAttempts?: number;
  error: Error | string;
  failedAt: string;
  retryBackoffMs?: number;
}

export interface BotRuntimeRetryState {
  attempts: number;
  deadLetteredAt: null;
  failedAt: string;
  lastError: string;
  nextAttemptAt: string;
  status: "retry_scheduled";
}

export interface BotRuntimeDeadLetterStateInput {
  currentAttempts?: number;
  error: Error | string;
  failedAt: string;
}

export interface BotRuntimeDeadLetterState {
  attempts: number;
  deadLetteredAt: string;
  failedAt: string;
  lastError: string;
  nextAttemptAt: null;
  status: "dead_lettered";
}

export function planBotRuntimeStateTransition(input: BotRuntimeStateTransitionInput): BotRuntimeStateTransition {
  validateBotRuntimeScenario(input);

  const matchingEdges = input.scenario.flowEdges.filter((item) => item.from === input.currentNodeId);
  const [edge] = matchingEdges;
  if (!edge) {
    throw new Error("bot_runtime_transition_edge_not_found");
  }
  if (matchingEdges.length > 1) {
    throw new Error("bot_runtime_transition_ambiguous");
  }

  const nextNode = input.scenario.flowNodes.find((node) => node.id === edge.to);
  if (!nextNode) {
    throw new Error("bot_runtime_transition_node_not_found");
  }
  if (!BOT_RUNTIME_ALLOWED_NODE_TYPES.has(nextNode.type)) {
    throw new Error("bot_runtime_transition_node_type_unsupported");
  }

  return {
    conversationId: input.conversationId,
    eventId: input.eventId,
    nextNodeId: nextNode.id,
    nodeType: nextNode.type,
    previousNodeId: input.currentNodeId,
    scenarioId: input.scenario.id,
    sideEffects: createStateTransitionSideEffects(input, nextNode),
    status: "transitioned",
    tenantId: input.tenantId,
    traceId: input.traceId
  };
}

function validateBotRuntimeScenario(input: BotRuntimeStateTransitionInput): void {
  if (input.scenario.schemaVersion !== "bot-flow/v1") {
    throw new Error("bot_runtime_scenario_schema_unsupported");
  }

  if (!["published", "enabled"].includes(input.scenario.status)) {
    throw new Error("bot_runtime_scenario_not_published");
  }

  if (input.scenario.tenantId && input.scenario.tenantId !== input.tenantId) {
    throw new Error("bot_runtime_scenario_tenant_mismatch");
  }

  const channel = input.channel ?? input.scenario.channels[0];
  if (!channel || !input.scenario.channels.includes(channel)) {
    throw new Error("bot_runtime_scenario_channel_unsupported");
  }
}

export function applyBotRuntimeStateTransition(
  state: BotRuntimeConversationState,
  transition: BotRuntimeStateTransition,
  updatedAt: string = new Date().toISOString()
): BotRuntimeConversationState {
  return {
    ...state,
    conversationId: transition.conversationId,
    currentNodeId: transition.nextNodeId,
    lastEventId: transition.eventId,
    previousNodeId: transition.previousNodeId,
    scenarioId: transition.scenarioId,
    tenantId: transition.tenantId,
    traceId: transition.traceId,
    updatedAt
  };
}

export async function persistBotRuntimeOutboundDescriptors(
  input: BotRuntimeOutboundPersistenceInput
): Promise<ConversationOutboundDescriptorRecord[]> {
  const records: ConversationOutboundDescriptorRecord[] = [];

  for (const sideEffect of input.transition.sideEffects) {
    if (sideEffect.kind !== "message_delivery") {
      continue;
    }

    const record = await input.conversationRepository.recordOutboundDescriptor({
      descriptor: sideEffect.descriptor
    });
    records.push(record);
  }

  return records;
}

export async function persistBotRuntimeHandoffDescriptors(
  input: BotRuntimeHandoffPersistenceInput
): Promise<BotRuntimeHandoffPersistenceRecord[]> {
  const records: BotRuntimeHandoffPersistenceRecord[] = [];

  for (const sideEffect of input.transition.sideEffects) {
    if (sideEffect.kind !== "bot_handoff") {
      continue;
    }

    const existing = (await input.conversationRepository.listRealtimeEvents({
      tenantId: sideEffect.descriptor.tenantId
    })).find((event) => event.eventId === sideEffect.descriptor.eventId);
    const realtimeEvent = existing ?? await input.conversationRepository.appendRealtimeEvent(
      toBotRuntimeHandoffRealtimeEvent(sideEffect.descriptor, input.occurredAt ?? new Date().toISOString())
    );

    records.push({
      descriptor: sideEffect.descriptor,
      realtimeEvent
    });
  }

  return records;
}

export function resolveBotRuntimeRetryState(input: BotRuntimeRetryStateInput): BotRuntimeRetryState {
  const failedAt = parseStrictIsoInstant(input.failedAt, "bot_runtime_retry_failed_at_invalid");

  const retryBackoffMs = positiveInteger(input.retryBackoffMs);
  if (retryBackoffMs === undefined) {
    throw new Error("bot_runtime_retry_backoff_invalid");
  }
  const nextAttemptMs = failedAt.getTime() + retryBackoffMs;
  if (!Number.isFinite(nextAttemptMs)) {
    throw new Error("bot_runtime_retry_backoff_invalid");
  }
  const nextAttemptAt = new Date(nextAttemptMs);
  if (Number.isNaN(nextAttemptAt.getTime())) {
    throw new Error("bot_runtime_retry_backoff_invalid");
  }

  return {
    attempts: Math.max(0, Math.trunc(input.currentAttempts ?? 0)) + 1,
    deadLetteredAt: null,
    failedAt: failedAt.toISOString(),
    lastError: redactSensitiveText(typeof input.error === "string" ? input.error : input.error.message),
    nextAttemptAt: nextAttemptAt.toISOString(),
    status: "retry_scheduled"
  };
}

export function resolveBotRuntimeDeadLetterState(input: BotRuntimeDeadLetterStateInput): BotRuntimeDeadLetterState {
  const failedAt = parseStrictIsoInstant(input.failedAt, "bot_runtime_dead_letter_failed_at_invalid");

  return {
    attempts: Math.max(0, Math.trunc(input.currentAttempts ?? 0)) + 1,
    deadLetteredAt: failedAt.toISOString(),
    failedAt: failedAt.toISOString(),
    lastError: redactSensitiveText(typeof input.error === "string" ? input.error : input.error.message),
    nextAttemptAt: null,
    status: "dead_lettered"
  };
}

function createStateTransitionSideEffects(
  input: BotRuntimeStateTransitionInput,
  node: BotScenario["flowNodes"][number]
): BotRuntimeSideEffect[] {
  if (!["message", "ai_reply", "quick_replies", "contact_request", "fallback"].includes(node.type)) {
    if (node.type === "handoff") {
      return [createBotRuntimeHandoffSideEffect(input, node)];
    }

    return [];
  }

  const messageId = makeBotRuntimeMessageId(input.eventId, node.id);
  const idempotencyKey = `bot-runtime:${input.eventId}:${node.id}`;

  return [{
    descriptor: {
      auditId: null,
      channel: input.channel ?? input.scenario.channels[0] ?? "SDK",
      conversationId: input.conversationId,
      createdAt: new Date().toISOString(),
      deliveryState: "queued",
      id: `delivery_${messageId}`,
      idempotencyKey,
      kind: "message_delivery",
      messageId,
      outboxEventId: null,
      payload: {
        messageId,
        nodeId: node.id,
        ...(node.type === "quick_replies" ? { quickReplies: node.config?.quickReplies ?? [] } : {}),
        ...(node.type === "contact_request" ? { contactField: node.config?.field ?? "contact" } : {}),
        scenarioId: input.scenario.id,
        text: node.title ?? ""
      },
      requestFingerprint: stableRuntimeFingerprint({
        conversationId: input.conversationId,
        eventId: input.eventId,
        nodeId: node.id,
        scenarioId: input.scenario.id,
        tenantId: input.tenantId
      }),
      retryable: true,
      status: "queued",
      tenantId: input.tenantId,
      traceId: input.traceId
    },
    kind: "message_delivery"
  }];
}

function createBotRuntimeHandoffSideEffect(
  input: BotRuntimeStateTransitionInput,
  node: BotScenario["flowNodes"][number]
): BotRuntimeHandoffSideEffect {
  return {
    descriptor: {
      eventId: `evt_bot_handoff_${sanitizeIdentifierSegment(input.eventId)}_${sanitizeIdentifierSegment(node.id)}`,
      eventName: "bot.handoff.created",
      resourceId: input.conversationId,
      resourceType: "conversation",
      schemaVersion: "bot-handoff/v1",
      summary: {
        botId: input.scenario.id,
        nodeId: node.id,
        queue: String(node.config?.queueId ?? ""),
        reason: "handoff_requested"
      },
      tenantId: input.tenantId,
      traceId: input.traceId
    },
    kind: "bot_handoff"
  };
}

function makeBotRuntimeMessageId(eventId: string, nodeId: string): string {
  return `bot_msg_${sanitizeIdentifierSegment(eventId)}_${sanitizeIdentifierSegment(nodeId)}`;
}

function toBotRuntimeHandoffRealtimeEvent(descriptor: BotRuntimeHandoffDescriptor, occurredAt: string): RealtimeEvent {
  return {
    data: descriptor.summary,
    eventId: descriptor.eventId,
    eventName: descriptor.eventName,
    occurredAt,
    resourceId: descriptor.resourceId,
    resourceType: descriptor.resourceType,
    schemaVersion: descriptor.schemaVersion,
    tenantId: descriptor.tenantId,
    traceId: descriptor.traceId
  };
}

function sanitizeIdentifierSegment(value: string): string {
  return value.replace(/[^a-z0-9_]+/gi, "_");
}

function stableRuntimeFingerprint(value: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    result[key] = value[key];
    return result;
  }, {}));
}

function parseStrictIsoInstant(value: string, errorCode: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(errorCode);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(errorCode);
  }

  return parsed;
}

function positiveInteger(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
