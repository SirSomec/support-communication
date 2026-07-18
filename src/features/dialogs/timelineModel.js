const DEFAULT_BOTTOM_THRESHOLD_PX = 4;
const CURRENT_MESSAGE_THRESHOLD_MS = 60 * 1000;
const CURRENT_MESSAGE_LABEL = "Сейчас";

export function getVisibleMessages(messages = [], transcriptMode = "all") {
  const items = Array.isArray(messages) ? messages : [];

  if (transcriptMode === "internal") {
    return items.filter((message) => message?.type === "internal");
  }

  if (transcriptMode === "events") {
    return items.filter((message) => message?.type === "event");
  }

  // Внутренние комментарии остаются в общей ленте (отделяются визуально),
  // audit-события — только во вкладке Audit.
  return items.filter((message) => message?.type !== "event");
}

export function isTranscriptPinnedToBottom(element, thresholdPx = DEFAULT_BOTTOM_THRESHOLD_PX) {
  if (!element) {
    return true;
  }

  return element.scrollHeight - element.scrollTop - element.clientHeight <= thresholdPx;
}

export function scrollTranscriptToBottom(element) {
  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

export function shouldUpdatePinnedStateFromScroll(hasUserScrollIntent) {
  return Boolean(hasUserScrollIntent);
}

export function formatMessageTime(message = {}, { now = new Date() } = {}) {
  const timestamp = parseMessageTimestamp(message);
  if (!timestamp) {
    return message?.time ?? CURRENT_MESSAGE_LABEL;
  }

  const current = now instanceof Date ? now : new Date(now);
  const ageMs = current.getTime() - timestamp.getTime();
  if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < CURRENT_MESSAGE_THRESHOLD_MS) {
    return CURRENT_MESSAGE_LABEL;
  }

  const time = `${pad(timestamp.getHours())}:${pad(timestamp.getMinutes())}`;
  if (isSameLocalDate(timestamp, current)) {
    return time;
  }

  return `${pad(timestamp.getDate())}.${pad(timestamp.getMonth() + 1)}.${timestamp.getFullYear()} ${time}`;
}

function parseMessageTimestamp(message) {
  const value = message?.createdAt ?? message?.timestamp ?? "";
  if (!value) {
    return null;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function isSameLocalDate(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function pad(value) {
  return String(value).padStart(2, "0");
}
