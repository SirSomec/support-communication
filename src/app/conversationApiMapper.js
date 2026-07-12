import { getStatusMeta } from "./dialogModel.js";

const NOW_LABEL = "сейчас";
const DEFAULT_LANGUAGE = "Русский";
const DEFAULT_DEVICE = "Unknown";
const DEFAULT_CLIENT_SINCE = "Новый контакт";

export function mapApiConversationCollection(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((item) => mapApiConversation(item));
}

export function mapApiConversation(input) {
  const channel = nonEmptyString(input?.channel, "SDK");
  const status = nonEmptyString(input?.status, "active");
  const statusMeta = getStatusMeta(status);
  const messages = mapConversationTimeline(input?.messages, input?.lifecycleEvents);
  const previewFallback = messages.at(-1)?.text ?? "";

  return {
    id: nonEmptyString(input?.id, `conversation-${Date.now()}`),
    name: nonEmptyString(input?.name, "Новый клиент"),
    initials: nonEmptyString(input?.initials, buildInitials(input?.name)),
    avatar: nonEmptyString(input?.avatar),
    channel,
    phone: nonEmptyString(input?.phone, ""),
    time: mapTime(input?.time),
    preview: nonEmptyString(input?.preview, previewFallback),
    status,
    sla: nonEmptyString(input?.sla, statusMeta.sla),
    slaTone: nonEmptyString(input?.slaTone, statusMeta.tone),
    topic: nonEmptyString(input?.topic),
    unread: Boolean(input?.unread),
    device: nonEmptyString(input?.device, DEFAULT_DEVICE),
    entry: nonEmptyString(input?.entry, channel),
    language: nonEmptyString(input?.language, DEFAULT_LANGUAGE),
    clientSince: nonEmptyString(input?.clientSince, DEFAULT_CLIENT_SINCE),
    tags: Array.isArray(input?.tags) ? input.tags.map((tag) => String(tag)) : [],
    previous: Array.isArray(input?.previous) ? input.previous : [],
    ...(nonEmptyString(input?.queueId) ? { queueId: nonEmptyString(input.queueId) } : {}),
    ...(isRecord(input?.rescueState) ? { rescue: { ...input.rescueState } } : {}),
    ...(nonEmptyString(input?.resolutionOutcome) ? { resolutionOutcome: nonEmptyString(input.resolutionOutcome) } : {}),
    messages,
    ...(nonEmptyString(input?.operatorId) ? { operatorId: nonEmptyString(input.operatorId) } : {}),
    ...(nonEmptyString(input?.operatorName) ? { operatorName: nonEmptyString(input.operatorName) } : {}),
    ...(nonEmptyString(input?.teamId) ? { teamId: nonEmptyString(input.teamId) } : {}),
    ...(isRecord(input?.botHandoff) ? { botHandoff: mapBotHandoff(input.botHandoff) } : {})
  };
}

function mapBotHandoff(input) {
  return {
    aiOutcome: nonEmptyString(input.aiOutcome),
    citations: Array.isArray(input.citations)
      ? input.citations
        .map((item) => ({
          sourceId: nonEmptyString(item?.sourceId),
          title: nonEmptyString(item?.title),
          ...(Number.isFinite(Number(item?.version)) ? { version: Number(item.version) } : {})
        }))
        .filter((item) => item.sourceId && item.title)
      : [],
    collectedFields: isRecord(input.collectedFields) ? { ...input.collectedFields } : {},
    goal: nonEmptyString(input.goal),
    phone: nonEmptyString(input.phone),
    queue: nonEmptyString(input.queue, "default"),
    reason: nonEmptyString(input.reason, "handoff_requested"),
    scenarioName: nonEmptyString(input.scenarioName, "Бот"),
    sessionState: nonEmptyString(input.sessionState),
    topic: nonEmptyString(input.topic)
  };
}

export function mapLifecycleEvent(input) {
  const data = input?.data && typeof input.data === "object" ? input.data : {};
  const detail = lifecycleEventDetail(input?.eventType, { ...data, reason: input?.reason });
  return {
    actor: nonEmptyString(input?.actorName, nonEmptyString(input?.actorId, "Система")),
    createdAt: nonEmptyString(input?.occurredAt),
    detail,
    eventKind: nonEmptyString(input?.eventType, "event"),
    fromStatus: nonEmptyString(data.fromStatus),
    fromTopic: nonEmptyString(data.fromTopic),
    id: nonEmptyString(input?.id, `lifecycle-${Date.now()}`),
    text: detail,
    time: mapTime(input?.occurredAt),
    toStatus: nonEmptyString(data.toStatus),
    toTopic: nonEmptyString(data.toTopic),
    type: "event"
  };
}

export function mapApiMessage(input) {
  const mapped = {
    id: input?.id ?? `msg-${Date.now()}`,
    text: nonEmptyString(input?.text),
    time: mapTime(input?.time)
  };

  const createdAt = nonEmptyString(input?.createdAt);
  if (createdAt) {
    mapped.createdAt = createdAt;
  }

  if (input?.side === "agent" || input?.side === "client") {
    mapped.side = input.side;
  }

  if (input?.type === "event" || input?.type === "internal") {
    mapped.type = input.type;
  }

  if (mapped.type === "internal") {
    mapped.author = nonEmptyString(input?.author, "Иван П.");
  }

  if (Array.isArray(input?.attachments)) {
    mapped.attachments = input.attachments;
  }

  return mapped;
}

function mapMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.map((message) => mapApiMessage(message));
}

function mapConversationTimeline(messages, lifecycleEvents) {
  const mappedMessages = mapMessages(messages);
  if (!Array.isArray(lifecycleEvents) || lifecycleEvents.length === 0) {
    return mappedMessages;
  }
  return [
    ...mappedMessages.filter((message) => message.type !== "event"),
    ...lifecycleEvents.map(mapLifecycleEvent)
  ].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt ?? "");
    const rightTime = Date.parse(right.createdAt ?? "");
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return 0;
    return leftTime - rightTime;
  });
}

function lifecycleEventDetail(eventType, data) {
  const labels = {
    "assignment.changed": "Изменен ответственный оператор",
    "conversation.created": "Создан диалог",
    "internal_comment.created": "Добавлен внутренний комментарий",
    "message.received": "Получено сообщение клиента",
    "message.sent": "Отправлен ответ оператором",
    "queue.entered": "Диалог возвращен в очередь",
    "quality.assessment.appealed": "Оценка качества обжалована",
    "quality.assessment.changed": "Оценка качества изменена",
    "quality.assessment.completed": "Проверка качества завершена",
    "quality.assessment.set": "Получена оценка качества",
    "quality.ai-suggestion.decided": aiSuggestionDecisionDetail(data.action),
    "rescue.auto_returned": "Диалог автоматически возвращен из спасения",
    "rescue.resolved": "Спасение диалога завершено",
    "rescue.started": "Запущено спасение диалога",
    "sla.overdue": "Нарушен срок ответа",
    "sla.paused": "Срок ответа приостановлен",
    "sla.resumed": "Отсчет срока ответа возобновлен",
    "status.changed": "Изменен статус диалога",
    "topic.changed": "Изменена тема диалога"
  };
  const base = labels[eventType] ?? nonEmptyString(eventType, "Событие диалога");
  return data.reason ? `${base}: ${data.reason}` : base;
}

function aiSuggestionDecisionDetail(action) {
  const labels = {
    accept: "AI-подсказка принята оператором",
    edit: "AI-подсказка открыта на редактирование",
    reject: "AI-подсказка отклонена оператором"
  };
  return labels[action] ?? "Оператор принял решение по AI-подсказке";
}

function mapTime(value) {
  if (!value) {
    return NOW_LABEL;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === "now" || normalized === NOW_LABEL) {
    return NOW_LABEL;
  }

  return String(value);
}

function buildInitials(name) {
  const value = nonEmptyString(name);
  if (!value) {
    return "НК";
  }

  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function nonEmptyString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim();
  return normalized || fallback;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
