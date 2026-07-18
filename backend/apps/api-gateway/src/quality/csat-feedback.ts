import { randomUUID } from "node:crypto";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";
import type { AppealConversationMutation } from "../conversation/appeal-lifecycle.js";
import type {
  ConversationCsatFeedbackState,
  ConversationRecord
} from "../conversation/conversation.types.js";

// Клиент пишет комментарий сразу после оценки; спустя это окно его сообщение
// снова означает новое обращение, а не отзыв к закрытому диалогу.
export const CSAT_FEEDBACK_WINDOW_MS = 30 * 60 * 1000;

export const CSAT_FEEDBACK_MESSAGE_TYPE = "csat_feedback";
export const CSAT_FEEDBACK_NEW_APPEAL_CALLBACK = "quality:feedback:new_appeal";
export const CSAT_FEEDBACK_NEW_APPEAL_BUTTON_TEXT = "Новое обращение";

export const CSAT_FEEDBACK_PROMPT_TEXT =
  "Спасибо за оценку! Хотите оставить комментарий — напишите его следующим сообщением, мы передадим его команде. Чтобы задать новый вопрос, нажмите «Новое обращение».";
export const CSAT_FEEDBACK_ACK_TEXT = "Спасибо за отзыв! Мы передали его команде.";
export const CSAT_FEEDBACK_NEW_APPEAL_TEXT = "Напишите сообщение — и мы откроем новое обращение.";

export function conversationCsatFeedback(conversation: ConversationRecord): ConversationCsatFeedbackState | null {
  const feedback = conversation.metadata?.csatFeedback;
  if (!feedback || typeof feedback !== "object") {
    return null;
  }
  const state = String(feedback.state ?? "").trim();
  if (state !== "awaiting" && state !== "received" && state !== "declined") {
    return null;
  }
  return {
    offeredAt: String(feedback.offeredAt ?? "").trim(),
    ratingId: String(feedback.ratingId ?? "").trim(),
    state
  };
}

// Отзыв ждем только у закрытого обращения и только внутри окна: протухшая
// метка не должна перехватывать новые вопросы клиента.
export function isAwaitingCsatFeedback(conversation: ConversationRecord, nowMs: number = Date.now()): boolean {
  if (conversation.status !== "closed") {
    return false;
  }
  const feedback = conversationCsatFeedback(conversation);
  if (!feedback || feedback.state !== "awaiting") {
    return false;
  }
  const offeredAt = Date.parse(feedback.offeredAt);
  return Number.isFinite(offeredAt) && nowMs - offeredAt < CSAT_FEEDBACK_WINDOW_MS;
}

export function withCsatFeedback(
  conversation: ConversationRecord,
  feedback: ConversationCsatFeedbackState
): ConversationRecord {
  return {
    ...conversation,
    metadata: {
      ...(conversation.metadata ?? {}),
      csatFeedback: { ...feedback }
    }
  };
}

// Смена состояния отзыва — обычная мутация диалога: lifecycle-событие для
// аудита и realtime conversation.updated для обновления инбокса оператора.
export function csatFeedbackConversationMutation(
  conversation: ConversationRecord,
  eventType: "quality.feedback.offered" | "quality.feedback.declined" | "quality.feedback.received",
  data: Record<string, unknown> = {}
): AppealConversationMutation {
  const occurredAt = new Date().toISOString();
  const traceId = getCurrentTraceId() ?? createRequestTraceId("qualityService", eventType);
  const eventData = { csatFeedback: conversation.metadata?.csatFeedback?.state ?? null, ...data };
  const realtimeEvent = {
    data: eventData,
    eventId: `rt_${randomUUID()}`,
    eventName: "conversation.updated",
    occurredAt,
    resourceId: conversation.id,
    resourceType: "conversation",
    schemaVersion: "v1",
    tenantId: conversation.tenantId,
    traceId
  };

  return {
    conversation,
    lifecycleEvent: {
      actorId: null,
      actorName: null,
      actorType: "client",
      conversationId: conversation.id,
      data: eventData,
      eventType,
      id: `lifecycle_${randomUUID()}`,
      ingestedAt: occurredAt,
      occurredAt,
      reason: null,
      schemaVersion: "conversation-lifecycle/v1",
      source: "quality.csat-feedback",
      sourceEventId: realtimeEvent.eventId,
      tenantId: conversation.tenantId,
      traceId
    },
    realtimeEvent
  };
}
