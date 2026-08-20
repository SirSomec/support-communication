const FILTER_KEYS = ["channel", "operatorId", "queueId", "status", "teamId", "topic", "resolutionOutcome"];

export const REPORT_PERIOD_OPTIONS = [
  { label: "Сегодня", value: "today" },
  { label: "Вчера", value: "yesterday" },
  { label: "7 дней", value: "7days" },
  { label: "30 дней", value: "30days" },
  { label: "Свой период", value: "custom" }
];

export const REPORT_TREND_GRAIN_OPTIONS = Object.freeze([
  { label: "По дням", value: "day" },
  { label: "По неделям", value: "week" },
  { label: "По месяцам", value: "month" }
]);

export const REPORT_TREND_METRIC_OPTIONS = Object.freeze([
  { label: "Обращения", value: "volume" },
  { label: "Состояние очереди", value: "queueHealth" },
  { label: "Время первого ответа", value: "firstResponse" },
  { label: "Время следующего ответа", value: "nextResponse" },
  { label: "Время решения", value: "resolution" },
  { label: "Полное время решения", value: "fullResolution" },
  { label: "SLA без нарушения", value: "slaAttainment" },
  { label: "CSAT", value: "csatAverage" },
  { label: "Положительный CSAT", value: "csatPositiveRate" },
  { label: "Покрытие CSAT", value: "csatCoverage" },
  { label: "Покрытие первым ответом", value: "responseCoverage" },
  { label: "Переоткрытия", value: "reopenRate" },
  { label: "Решено с одного касания", value: "oneTouchRate" },
  { label: "Нагрузка команды", value: "workload" }
]);

export const REPORT_TREND_DEFAULTS = Object.freeze({ grain: "day", metric: "volume" });

const REPORT_TREND_GRAINS = new Set(REPORT_TREND_GRAIN_OPTIONS.map(({ value }) => value));
const REPORT_TREND_METRICS = new Set(REPORT_TREND_METRIC_OPTIONS.map(({ value }) => value));

export const REPORT_FILTER_DEFAULTS = Object.freeze({
  channel: "all",
  operatorId: "all",
  queueId: "all",
  resolutionOutcome: "all",
  status: "all",
  teamId: "all",
  topic: "all"
});

export function createDefaultReportView(now = new Date()) {
  return {
    compare: true,
    customRange: {
      from: localDateValue(now, -29),
      to: localDateValue(now, 0)
    },
    filters: { ...REPORT_FILTER_DEFAULTS },
    period: "7days",
    trend: { ...REPORT_TREND_DEFAULTS }
  };
}

export function reportViewFromLocation(locationLike = globalThis.location, now = new Date()) {
  const defaults = createDefaultReportView(now);
  if (!locationLike) return defaults;
  const params = new URLSearchParams(locationLike.search ?? "");
  const period = REPORT_PERIOD_OPTIONS.some((option) => option.value === params.get("reportPeriod"))
    ? params.get("reportPeriod")
    : defaults.period;
  const filters = { ...REPORT_FILTER_DEFAULTS };
  for (const key of FILTER_KEYS) {
    const value = params.get(`report_${key}`);
    if (value) filters[key] = value;
  }
  const from = normalizeDateInput(params.get("reportFrom")) ?? defaults.customRange.from;
  const to = normalizeDateInput(params.get("reportTo")) ?? defaults.customRange.to;
  const trend = normalizeReportTrend({
    grain: params.get("reportTrendGrain"),
    metric: params.get("reportTrendMetric")
  });
  return {
    compare: params.get("reportCompare") !== "0",
    customRange: { from, to },
    filters,
    period,
    trend
  };
}

export function persistReportView(view, historyLike = globalThis.history, locationLike = globalThis.location) {
  if (!historyLike || !locationLike) return;
  const url = new URL(locationLike.href);
  url.searchParams.set("reportPeriod", view.period);
  url.searchParams.set("reportCompare", view.compare ? "1" : "0");
  const trend = normalizeReportTrend(view.trend);
  url.searchParams.set("reportTrendMetric", trend.metric);
  url.searchParams.set("reportTrendGrain", trend.grain);
  if (view.period === "custom") {
    url.searchParams.set("reportFrom", view.customRange.from);
    url.searchParams.set("reportTo", view.customRange.to);
  } else {
    url.searchParams.delete("reportFrom");
    url.searchParams.delete("reportTo");
  }
  for (const key of FILTER_KEYS) {
    const value = view.filters?.[key] ?? "all";
    if (value === "all" || value === "") url.searchParams.delete(`report_${key}`);
    else url.searchParams.set(`report_${key}`, value);
  }
  historyLike.replaceState(historyLike.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function validateReportView(view) {
  if (view.period !== "custom") return { valid: true, message: "" };
  const from = Date.parse(`${view.customRange.from}T00:00:00Z`);
  const to = Date.parse(`${view.customRange.to}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { valid: false, message: "Укажите обе даты произвольного периода." };
  }
  if (from > to) {
    return { valid: false, message: "Дата начала должна быть не позже даты окончания." };
  }
  if (to - from > 365 * 24 * 60 * 60 * 1_000) {
    return { valid: false, message: "Произвольный период не может превышать 366 дней." };
  }
  return { valid: true, message: "" };
}

export function reportWorkspaceQuery(view) {
  return {
    ...activeFilterQuery(view.filters),
    ...(view.period === "custom" ? { dateFrom: view.customRange.from, dateTo: view.customRange.to } : {}),
    period: view.period,
    timezoneOffsetMinutes: -new Date().getTimezoneOffset()
  };
}

export function reportRoutingQuery(view, extra = {}) {
  return {
    ...activeFilterQuery(view.filters),
    ...(view.period === "custom" ? { dateFrom: view.customRange.from, dateTo: view.customRange.to } : {}),
    period: view.period,
    timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
    ...extra
  };
}

export function reportPeriodLabel(view, locale = "ru-RU") {
  if (view.period !== "custom") {
    return REPORT_PERIOD_OPTIONS.find((option) => option.value === view.period)?.label ?? "Период";
  }
  const from = formatShortDate(view.customRange.from, locale);
  const to = formatShortDate(view.customRange.to, locale);
  return `${from} — ${to}`;
}

export function comparisonLabel(view) {
  return view.compare ? "Предыдущий равный период" : "Без сравнения";
}

export function activeReportFilters(view) {
  return Object.entries(view.filters ?? {}).filter(([, value]) => value && value !== "all");
}

export function resetReportFilters(view) {
  return { ...view, filters: { ...REPORT_FILTER_DEFAULTS } };
}

export function updateReportFilter(view, key, value) {
  return { ...view, filters: { ...view.filters, [key]: value || "all" } };
}

export function normalizeReportTrend(trend) {
  const grain = REPORT_TREND_GRAINS.has(trend?.grain) ? trend.grain : REPORT_TREND_DEFAULTS.grain;
  const metric = REPORT_TREND_METRICS.has(trend?.metric) ? trend.metric : REPORT_TREND_DEFAULTS.metric;
  return { grain, metric };
}

function localDateValue(date, offsetDays) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  next.setDate(next.getDate() + offsetDays);
  const pad = (value) => String(value).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function normalizeDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) ? String(value) : null;
}

function activeFilterQuery(filters = {}) {
  return Object.fromEntries(FILTER_KEYS.flatMap((key) => {
    const value = filters?.[key];
    return value && value !== "all" ? [[key, value]] : [];
  }));
}

function formatShortDate(value, locale) {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(timestamp)
    : "—";
}

export { FILTER_KEYS as REPORT_FILTER_KEYS };
