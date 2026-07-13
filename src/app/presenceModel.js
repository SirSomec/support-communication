export const PRESENCE_STATUS_NOT_SET_LABEL = "Статус не задан";

export const PRESENCE_STATUSES = [
  { key: "online", label: "Онлайн", shortLabel: "Онлайн" },
  { key: "busy", label: "Занят", shortLabel: "Занят" },
  { key: "wrapping_up", label: "Завершает диалоги", shortLabel: "Заверш." },
  { key: "break", label: "В перерыве", shortLabel: "Перерыв" },
  { key: "unavailable", label: "Недоступен", shortLabel: "Недост." },
  { key: "offline", label: "Офлайн", shortLabel: "Офлайн" }
];

const labelsByKey = Object.fromEntries(PRESENCE_STATUSES.map((status) => [status.key, status.label]));

export function isPresenceStatus(status) {
  return Boolean(status) && Object.hasOwn(labelsByKey, status);
}

export function presenceStatusLabel(status) {
  return labelsByKey[status] ?? PRESENCE_STATUS_NOT_SET_LABEL;
}

export function presenceStatusClass(status) {
  return isPresenceStatus(status) ? status : "unset";
}

export function formatPresenceDuration(sinceIso, nowMs = Date.now()) {
  if (!sinceIso) {
    return "—";
  }

  const sinceMs = new Date(sinceIso).getTime();
  if (Number.isNaN(sinceMs)) {
    return "—";
  }

  return formatPresenceSeconds(Math.max(0, Math.floor((nowMs - sinceMs) / 1000)));
}

export function formatPresenceSeconds(totalSeconds) {
  const seconds = Number(totalSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }

  if (seconds < 60) {
    return "< 1 мин";
  }

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} мин`;
  }

  return `${hours} ч ${String(minutes).padStart(2, "0")} мин`;
}

export function presenceRangeStartOfToday(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}
