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
  const calendarDate = parseCalendarDate(value);
  if (!calendarDate) return null;

  const from = new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day);
  const to = new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day + 1);

  return { from: from.toISOString(), to: to.toISOString() };
}

export function isSelectablePresenceDate(value, now = new Date()) {
  const calendarDate = parseCalendarDate(value);
  if (!calendarDate) return false;

  const candidate = new Date(calendarDate.year, calendarDate.month - 1, calendarDate.day);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return candidate.getTime() <= today.getTime();
}

export function formatPanelDate(value, options = {}) {
  const calendarDate = parseCalendarDate(value);
  const date = calendarDate
    ? new Date(Date.UTC(calendarDate.year, calendarDate.month - 1, calendarDate.day))
    : toDate(value);
  if (!date) return "—";
  const { withYear = true, ...formatterOptions } = options;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: withYear === false ? undefined : "numeric",
    ...formatterOptions,
    // A YYYY-MM-DD value is a calendar date, not a UTC instant. Pin its
    // formatter to UTC so a west-of-UTC browser never renders the previous day.
    ...(calendarDate ? { timeZone: "UTC" } : {})
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

function parseCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;

  const [, rawYear, rawMonth, rawDay] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  if (year < 1) return null;

  const verificationDate = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(verificationDate.getTime())
    || verificationDate.getUTCFullYear() !== year
    || verificationDate.getUTCMonth() !== month - 1
    || verificationDate.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}

function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
