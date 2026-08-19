const CURRENT_ACTIVITY_LABEL = "Сейчас";
const CURRENT_ACTIVITY_THRESHOLD_MS = 60 * 1000;

// В списке тредов «время» — это последняя фактическая активность клиента или
// оператора. Поле `time` осталось в API для обратной совместимости, но не
// является источником истины: оно часто содержит устаревший placeholder now.
export function getConversationActivityTimeValue(conversation) {
  let latest = NaN;

  for (const appeal of conversationAppeals(conversation)) {
    latest = latestTimestamp(latest, appeal?.createdAt);
    latest = latestTimestamp(latest, appeal?.updatedAt);
    latest = latestTimestamp(latest, appeal?.lastMessageAt);
    latest = latestTimestamp(latest, appeal?.metadata?.closedAt);

    for (const message of Array.isArray(appeal?.messages) ? appeal.messages : []) {
      latest = latestTimestamp(latest, message?.createdAt ?? message?.timestamp);
    }

    for (const event of Array.isArray(appeal?.lifecycleEvents) ? appeal.lifecycleEvents : []) {
      latest = latestTimestamp(latest, event?.occurredAt ?? event?.createdAt);
    }
  }

  return latest;
}

export function formatConversationActivityTime(conversation, { now = new Date() } = {}) {
  const timestamp = getConversationActivityTimeValue(conversation);
  if (!Number.isFinite(timestamp)) {
    return formatLegacyTime(conversation?.time);
  }

  const current = now instanceof Date ? now : new Date(now);
  const currentTime = current.getTime();
  const ageMs = currentTime - timestamp;
  if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < CURRENT_ACTIVITY_THRESHOLD_MS) {
    return CURRENT_ACTIVITY_LABEL;
  }

  const activityAt = new Date(timestamp);
  const time = `${pad(activityAt.getHours())}:${pad(activityAt.getMinutes())}`;
  if (sameLocalDate(activityAt, current)) {
    return time;
  }

  return `${pad(activityAt.getDate())}.${pad(activityAt.getMonth() + 1)}.${activityAt.getFullYear()} ${time}`;
}

function conversationAppeals(conversation) {
  return Array.isArray(conversation?.appeals) && conversation.appeals.length
    ? conversation.appeals
    : conversation ? [conversation] : [];
}

function latestTimestamp(current, value) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) {
    return current;
  }

  return Number.isFinite(current) ? Math.max(current, timestamp) : timestamp;
}

function formatLegacyTime(value) {
  const legacyTime = String(value ?? "").trim();
  return /^(now|сейчас)$/i.test(legacyTime) ? CURRENT_ACTIVITY_LABEL : legacyTime || CURRENT_ACTIVITY_LABEL;
}

function sameLocalDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function pad(value) {
  return String(value).padStart(2, "0");
}
