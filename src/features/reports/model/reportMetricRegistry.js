export const REPORT_METRIC_REGISTRY = Object.freeze({
  incoming: { label: "Входящие обращения", direction: "neutral", format: "integer" },
  resolved: { label: "Решено", direction: "up", format: "integer" },
  backlog: { label: "Бэклог", direction: "down", format: "integer" },
  waiting: { label: "Ожидают", direction: "down", format: "integer" },
  slaAttainment: { label: "SLA без нарушения", direction: "up", format: "percent" },
  slaRecordedSamples: { label: "Обращения с измеренным SLA", direction: "neutral", format: "integer" },
  firstResponseMedianSeconds: { label: "Первый ответ · P50", direction: "down", format: "duration" },
  firstResponseP90Seconds: { label: "Первый ответ · P90", direction: "down", format: "duration" },
  firstResponseAverageSeconds: { label: "Первый ответ · среднее", direction: "down", format: "duration" },
  firstResponseSamples: { label: "Измеренные первые ответы", direction: "neutral", format: "integer" },
  nextResponseMedianSeconds: { label: "Следующий ответ · P50", direction: "down", format: "duration" },
  nextResponseP90Seconds: { label: "Следующий ответ · P90", direction: "down", format: "duration" },
  nextResponseSamples: { label: "Измеренные следующие ответы", direction: "neutral", format: "integer" },
  resolutionMedianSeconds: { label: "Время решения · P50", direction: "down", format: "duration" },
  resolutionP90Seconds: { label: "Время решения · P90", direction: "down", format: "duration" },
  firstResolutionSamples: { label: "Измеренные первые решения", direction: "neutral", format: "integer" },
  fullResolutionMedianSeconds: { label: "Полное решение · P50", direction: "down", format: "duration" },
  fullResolutionP90Seconds: { label: "Полное решение · P90", direction: "down", format: "duration" },
  fullResolutionSamples: { label: "Измеренные полные решения", direction: "neutral", format: "integer" },
  csatAverage: { label: "CSAT", direction: "up", format: "rating" },
  csatPositiveRate: { label: "Положительный CSAT", direction: "up", format: "percent" },
  csatCoverage: { label: "Покрытие CSAT", direction: "up", format: "percent" },
  csatSamples: { label: "Ответы CSAT", direction: "neutral", format: "integer" },
  csatScaleMaximum: { label: "Максимум шкалы CSAT", direction: "neutral", format: "integer" },
  reopenRate: { label: "Переоткрытия", direction: "down", format: "percent" },
  reopenedConversations: { label: "Повторно открытые обращения", direction: "down", format: "integer" },
  oneTouchRate: { label: "Решено с одного касания", direction: "up", format: "percent" },
  oneTouchResolutionCount: { label: "Решения за одно касание", direction: "up", format: "integer" },
  oneTouchResolutionSamples: { label: "Выборка решений за одно касание", direction: "neutral", format: "integer" },
  responseCoverage: { label: "Покрытие первым ответом", direction: "up", format: "percent" },
  flowRatio: { label: "Решено / входящие", direction: "up", format: "ratio" },
  overdue: { label: "Нарушения SLA", direction: "down", format: "integer" },
  internalComments: { label: "Внутренние комментарии", direction: "neutral", format: "integer" },
  agentTouches: { label: "Касания операторов", direction: "neutral", format: "integer" }
});

export function formatReportMetric(metric, fallbackKey) {
  const key = metric?.key ?? fallbackKey;
  const registry = REPORT_METRIC_REGISTRY[key] ?? {};
  const format = metric?.format ?? registry.format ?? inferFormat(metric?.unit);
  const value = metric?.value;
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  if (format === "duration") return formatDurationSeconds(Number(value));
  if (format === "percent") return `${formatNumber(Number(value), 1)}%`;
  if (format === "rating") {
    const scaleMaximum = Number(metric?.scaleMaximum);
    return Number.isFinite(scaleMaximum) && scaleMaximum > 0
      ? `${formatNumber(Number(value), 2)} / ${formatNumber(scaleMaximum, 2)}`
      : formatNumber(Number(value), 2);
  }
  if (format === "ratio") return formatNumber(Number(value), 2);
  return formatCompactNumber(Number(value));
}

export function formatMetricDelta(metric) {
  if (metric?.delta === null || metric?.delta === undefined || !Number.isFinite(Number(metric.delta))) return "Нет сравнения";
  const value = Number(metric.delta);
  const format = metric.deltaUnit === "percentage_points"
    ? `${signed(formatNumber(value, 1))} п.п.`
    : metric.deltaUnit === "seconds"
      ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatDurationSeconds(Math.abs(value))}`
      : `${signed(formatNumber(value, 1))}%`;
  return format;
}

export function metricTone(metric) {
  if (metric?.tone) return metric.tone;
  if (metric?.delta === null || metric?.delta === undefined || !Number.isFinite(Number(metric.delta))) return "neutral";
  const registry = REPORT_METRIC_REGISTRY[metric.key] ?? {};
  const delta = Number(metric.delta);
  if (delta === 0 || registry.direction === "neutral") return "neutral";
  const improved = registry.direction === "down" ? delta < 0 : delta > 0;
  return improved ? "positive" : "negative";
}

export function metricLabel(metric, fallbackKey) {
  const key = metric?.key ?? fallbackKey;
  return metric?.label ?? REPORT_METRIC_REGISTRY[key]?.label ?? key;
}

export function formatDurationSeconds(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor(total % 86_400 / 3_600);
  const minutes = Math.floor(total % 3_600 / 60);
  const remainder = total % 60;
  if (days > 0) return `${days}д ${hours}ч`;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  if (minutes > 0) return `${minutes}м ${remainder}с`;
  return `${remainder}с`;
}

export function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: value < 10 && !Number.isInteger(value) ? 1 : 0,
    notation: Math.abs(value) >= 10_000 ? "compact" : "standard"
  }).format(value);
}

export function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(value);
}

function inferFormat(unit) {
  if (unit === "seconds") return "duration";
  if (unit === "percent") return "percent";
  if (unit === "rating") return "rating";
  return "integer";
}

function signed(value) {
  const text = String(value);
  if (text.startsWith("-")) return `−${text.slice(1)}`;
  return Number(text.replace(",", ".")) > 0 ? `+${text}` : text;
}
