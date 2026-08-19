export const PANEL_AUTO_REFRESH_MS = 30_000;

export const PANEL_WORKLOAD_PERIODS = Object.freeze([
  { label: "Сейчас", value: "live" },
  { label: "Последний час", value: "hour" },
  { label: "Сегодня", value: "today" },
  { label: "7 дней", value: "7days" },
  { label: "30 дней", value: "30days" }
]);

const LINE_STATUSES = new Set(["online", "busy", "wrapping_up"]);

export function currentLocalDateValue(now = new Date()) {
  return dateValue(now);
}

export function presenceRangeForDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) {
    return null;
  }

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);

  const from = new Date(year, month - 1, day);
  const to = new Date(year, month - 1, day + 1);
  if (
    Number.isNaN(from.getTime())
    || Number.isNaN(to.getTime())
    || from.getFullYear() !== year
    || from.getMonth() !== month - 1
    || from.getDate() !== day
  ) {
    return null;
  }

  return { from: from.toISOString(), to: to.toISOString() };
}

export function formatPanelDate(value, options = {}) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: options.withYear === false ? undefined : "numeric",
    ...options
  }).format(date);
}

export function formatPanelTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatPanelDateTime(value) {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  }).format(date);
}

export function formatRefreshTime(value, nowMs = Date.now()) {
  const date = toDate(value);
  if (!date) return "ещё не обновлялось";
  const seconds = Math.max(0, Math.floor((nowMs - date.getTime()) / 1_000));
  if (seconds < 10) return "только что";
  if (seconds < 60) return `${seconds} сек назад`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  return formatPanelDateTime(date);
}

export function workloadPeriodLabel(period, descriptor) {
  if (descriptor?.label) return String(descriptor.label);
  return PANEL_WORKLOAD_PERIODS.find((option) => option.value === period)?.label ?? "Сейчас";
}

export function operatorIsOnLine(status) {
  return LINE_STATUSES.has(String(status ?? ""));
}

export function resolveShiftSummary(shift, operators = []) {
  const memberIds = new Set(Array.isArray(shift?.operatorIds) ? shift.operatorIds.map(String) : []);
  const members = operators.filter((operator) => memberIds.has(String(operator.id ?? operator.operatorId ?? "")));
  return {
    breakCount: members.filter((operator) => operator.status === "break").length,
    configured: Boolean(shift && memberIds.size),
    memberCount: memberIds.size,
    members,
    onLineCount: members.filter((operator) => operatorIsOnLine(operator.status)).length
  };
}

export function toDateTimeLocalInput(value) {
  const date = toDate(value);
  if (!date) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dateTimeLocalToIso(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function createShiftDraft(shift, now = new Date()) {
  if (shift) {
    return {
      endsAt: toDateTimeLocalInput(shift.endsAt),
      name: String(shift.name ?? ""),
      operatorIds: Array.isArray(shift.operatorIds) ? shift.operatorIds.map(String) : [],
      startsAt: toDateTimeLocalInput(shift.startsAt)
    };
  }

  const start = new Date(now);
  start.setSeconds(0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 8);
  return {
    endsAt: toDateTimeLocalInput(end),
    name: "Текущая смена",
    operatorIds: [],
    startsAt: toDateTimeLocalInput(start)
  };
}

export function shiftTimeLabel(shift) {
  if (!shift?.startsAt || !shift?.endsAt) return "Состав не задан";
  return `${formatPanelTime(shift.startsAt)}–${formatPanelTime(shift.endsAt)}`;
}

export function dateValue(date) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
