import { redactSensitiveText } from "@support-communication/redaction";
import type { OutboxEvent } from "@support-communication/events";
import type { ConversationLifecycleEvent, ConversationOutboundDescriptor, ConversationRepository, RealtimeEvent } from "../conversation/conversation.repository.js";
import type { AutomationBotRuntimeSideEffect, AutomationRepository } from "./automation.repository.js";

export interface BotRuntimeReconciliationWorkerInput {
  automationRepository: AutomationRepository;
  conversationRepository: Pick<ConversationRepository, "findConversation" | "findOutboundDescriptorByIdempotencyKey" | "listLifecycleEvents" | "recordOutboundDescriptor" | "saveConversationMutation">;
  leaseMs?: number;
  limit?: number;
  maxAttempts?: number;
  now?: string;
  retryBackoffMs?: number;
}

export interface BotRuntimeReconciliationResult { claimed: number; deadLettered: number; delivered: number; failed: number; scanned: number; skipped: number; }

export async function runBotRuntimeReconciliationOnce(input: BotRuntimeReconciliationWorkerInput): Promise<BotRuntimeReconciliationResult> {
  const now = normalizeNow(input.now);
  const due = await input.automationRepository.listDueBotRuntimeSideEffectsAsync(now, input.limit ?? 50);
  const result: BotRuntimeReconciliationResult = { claimed: 0, deadLettered: 0, delivered: 0, failed: 0, scanned: due.length, skipped: 0 };
  for (const candidate of due) {
    const leaseUntil = new Date(new Date(now).getTime() + (input.leaseMs ?? 30_000)).toISOString();
    const effect = await input.automationRepository.claimBotRuntimeSideEffectAsync(candidate.id, now, leaseUntil);
    if (!effect) { result.skipped += 1; continue; }
    result.claimed += 1;
    try {
      await reconcileEffect(effect, input.conversationRepository, now);
      await input.automationRepository.updateBotRuntimeSideEffectAsync({ ...effect, deliveredAt: now, lastError: null, leaseUntil: null, nextAttemptAt: null, status: "delivered", updatedAt: now });
      result.delivered += 1;
    } catch (error) {
      const dead = effect.attempts >= (input.maxAttempts ?? 5);
      const nextAttemptAt = dead ? null : new Date(new Date(now).getTime() + (input.retryBackoffMs ?? 5_000) * 2 ** Math.max(0, effect.attempts - 1)).toISOString();
      await input.automationRepository.updateBotRuntimeSideEffectAsync({
        ...effect, deadLetteredAt: dead ? now : null, lastError: redactSensitiveText(error instanceof Error ? error.message : String(error)),
        leaseUntil: null, nextAttemptAt, status: dead ? "dead_lettered" : "retry_scheduled", updatedAt: now
      });
      result.failed += 1;
      if (dead) result.deadLettered += 1;
    }
  }
  return result;
}

async function reconcileEffect(effect: AutomationBotRuntimeSideEffect, repository: BotRuntimeReconciliationWorkerInput["conversationRepository"], now: string): Promise<void> {
  if (effect.kind === "message_delivery") {
    const descriptor = effect.payload.descriptor as ConversationOutboundDescriptor | undefined;
    if (!descriptor || descriptor.tenantId !== effect.tenantId || descriptor.conversationId !== effect.conversationId || !descriptor.idempotencyKey) throw new Error("bot_runtime_outbound_descriptor_invalid");
    if (await repository.findOutboundDescriptorByIdempotencyKey(descriptor.idempotencyKey)) return;
    const conversation = await repository.findConversation(effect.conversationId);
    if (!conversation || conversation.tenantId !== effect.tenantId) throw new Error("bot_runtime_delivery_conversation_not_found");
    const enriched = { ...descriptor, payload: { ...descriptor.payload, providerConversationId: conversation.phone || conversation.id } };
    const outbox = botRuntimeOutbox(effect, enriched, now);
    await repository.recordOutboundDescriptor({ descriptor: { ...enriched, outboxEventId: outbox.id }, outbox });
    return;
  }
  if (effect.kind === "bot_handoff") {
    const descriptor = effect.payload.descriptor as Record<string, any> | undefined;
    if (!descriptor || descriptor.tenantId !== effect.tenantId || descriptor.resourceId !== effect.conversationId) throw new Error("bot_runtime_handoff_descriptor_invalid");
    const sourceEventId = `bot-runtime-handoff:${effect.id}`;
    const prior = await repository.listLifecycleEvents({ conversationId: effect.conversationId, eventTypes: ["bot.handoff.created"], limit: 1_000, tenantId: effect.tenantId });
    if (prior.some((event) => event.source === "bot-runtime-reconciliation" && event.sourceEventId === sourceEventId)) return;
    const conversation = await repository.findConversation(effect.conversationId);
    if (!conversation || conversation.tenantId !== effect.tenantId) throw new Error("bot_runtime_handoff_conversation_not_found");
    const traceId = String(descriptor.traceId ?? `bot-runtime-${effect.id}`);
    const summary = (descriptor.summary ?? {}) as Record<string, unknown>;
    const queueId = String(summary.queue ?? "").trim() || conversation.queueId;
    if (!queueId) throw new Error("bot_runtime_handoff_canonical_queue_required");
    const updated = { ...conversation, operatorId: undefined, operatorName: undefined, queueId, status: "queued", updatedAt: now };
    const lifecycleEvent: ConversationLifecycleEvent = { actorId: null, actorName: "Bot runtime", actorType: "worker", conversationId: conversation.id, data: { ...summary, sideEffectId: effect.id }, eventType: "bot.handoff.created", id: `lifecycle_${effect.id}`, ingestedAt: now, occurredAt: now, reason: "bot_handoff", schemaVersion: "conversation-lifecycle/v1", source: "bot-runtime-reconciliation", sourceEventId, tenantId: effect.tenantId, traceId };
    const realtimeEvent: RealtimeEvent = { data: { ...summary, sideEffectId: effect.id }, eventId: `evt_${effect.id}`, eventName: "bot.handoff.created", occurredAt: now, resourceId: conversation.id, resourceType: "conversation", schemaVersion: "bot-handoff/v1", tenantId: effect.tenantId, traceId };
    await repository.saveConversationMutation({ conversation: updated, lifecycleEvent, realtimeEvent });
    return;
  }
  throw new Error("bot_runtime_side_effect_kind_unsupported");
}

function botRuntimeOutbox(effect: AutomationBotRuntimeSideEffect, descriptor: ConversationOutboundDescriptor, now: string): OutboxEvent {
  return { aggregateId: descriptor.id, aggregateType: "conversation_message", id: `outbox_${effect.id}`, occurredAt: now, payload: { channel: descriptor.channel, conversationId: effect.conversationId, descriptorId: descriptor.id, idempotencyKey: descriptor.idempotencyKey, providerConversationId: descriptor.payload.providerConversationId, sideEffectId: effect.id }, queue: "message-delivery", status: "pending", traceId: descriptor.traceId, type: "message.delivery.requested" };
}

function normalizeNow(value?: string): string { const date = value ? new Date(value) : new Date(); if (Number.isNaN(date.getTime())) throw new Error("bot_runtime_reconciliation_now_invalid"); return date.toISOString(); }
