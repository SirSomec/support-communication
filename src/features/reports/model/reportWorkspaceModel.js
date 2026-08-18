import { REPORT_METRIC_REGISTRY } from "./reportMetricRegistry.js";
import {
  normalizeReportTrend,
  REPORT_TREND_GRAIN_OPTIONS,
  REPORT_TREND_METRIC_OPTIONS
} from "./reportViewState.js";

const METRIC_ALIASES = Object.freeze({
  incomingConversations: "incoming",
  newConversations: "incoming",
  closedConversations: "resolved",
  resolvedConversations: "resolved",
  backlogCount: "backlog",
  openConversations: "backlog",
  waitingConversations: "waiting",
  slaPercent: "slaAttainment",
  recordedSlaAttainment: "slaAttainment",
  slaAttainmentPercent: "slaAttainment",
  slaBreaches: "overdue",
  firstResponseP50Seconds: "firstResponseMedianSeconds",
  medianFirstResponseSeconds: "firstResponseMedianSeconds",
  p90FirstResponseSeconds: "firstResponseP90Seconds",
  firstResponseCoveragePercent: "responseCoverage",
  responseCoveragePercent: "responseCoverage",
  nextResponseP50Seconds: "nextResponseMedianSeconds",
  p50NextResponseSeconds: "nextResponseMedianSeconds",
  p90NextResponseSeconds: "nextResponseP90Seconds",
  medianResolutionSeconds: "resolutionMedianSeconds",
  firstResolutionP50Seconds: "resolutionMedianSeconds",
  firstResolutionMedianSeconds: "resolutionMedianSeconds",
  firstResolutionP90Seconds: "resolutionP90Seconds",
  p90ResolutionSeconds: "resolutionP90Seconds",
  fullResolutionP50Seconds: "fullResolutionMedianSeconds",
  csatScore: "csatAverage",
  csatPositivePercent: "csatPositiveRate",
  csatPositiveRatePercent: "csatPositiveRate",
  csatCoveragePercent: "csatCoverage",
  reopenedRate: "reopenRate",
  reopenRatePercent: "reopenRate",
  oneTouchResolutionRate: "oneTouchRate",
  oneTouchResolutionPercent: "oneTouchRate",
  firstResponseCoverage: "responseCoverage",
  overdueConversations: "overdue"
});

const TREND_PRESET_DETAILS = Object.freeze({
  volume: {
    chartType: "bar",
    description: "Входящие, решённые и бэклог в одном временном масштабе",
    format: "integer",
    series: [
      { color: "#2f6df6", key: "incoming", label: "Входящие" },
      { color: "#12aaa0", key: "resolved", label: "Решено" },
      { chartType: "line", color: "#7b8799", dashed: true, key: "backlog", label: "Бэклог" }
    ],
    title: "Динамика обращений"
  },
  queueHealth: {
    chartType: "area",
    description: "Размер бэклога и обращения, ожидающие ответа, на конец периода",
    format: "integer",
    series: [
      { color: "#6f7f98", key: "backlog", label: "Бэклог" },
      { chartType: "line", color: "#e58a2f", key: "waiting", label: "Ожидают" }
    ],
    title: "Состояние очереди"
  },
  firstResponse: durationTrend("Время первого ответа", "Скорость первого публичного ответа оператора", "firstResponse"),
  nextResponse: durationTrend("Время следующего ответа", "Скорость последующих публичных ответов оператора", "nextResponse"),
  resolution: durationTrend("Время решения", "Время до первого зафиксированного решения", "resolution"),
  fullResolution: durationTrend("Полное время решения", "Время от создания до последнего решения с учётом переоткрытий", "fullResolution"),
  csatAverage: singleTrend("CSAT", "Средняя оценка удовлетворённости по единой шкале", "csatAverage", "rating", "#7a5af8"),
  csatPositiveRate: singleTrend("Положительный CSAT", "Доля положительных оценок среди валидных ответов", "csatPositiveRate", "percent", "#7a5af8"),
  slaAttainment: singleTrend("SLA без нарушения", "Доля обращений с соблюдённым SLA", "slaAttainment", "percent", "#2f6df6"),
  responseCoverage: singleTrend("Покрытие первым ответом", "Доля входящих обращений с измеримым первым ответом", "responseCoverage", "percent", "#0f8f87"),
  csatCoverage: singleTrend("Покрытие CSAT", "Доля решённых обращений с валидной оценкой", "csatCoverage", "percent", "#7a5af8"),
  reopenRate: singleTrend("Переоткрытия", "Доля решённых обращений, открытых повторно", "reopenRate", "percent", "#d66a3a"),
  oneTouchRate: singleTrend("One-touch resolution", "Доля решений за одно касание оператора", "oneTouchRate", "percent", "#12aaa0"),
  workload: {
    chartType: "bar",
    description: "Публичные касания операторов и внутренние комментарии за период",
    format: "integer",
    series: [
      { color: "#2f6df6", key: "agentTouches", label: "Касания операторов" },
      { color: "#8d6e63", key: "internalComments", label: "Внутренние комментарии" }
    ],
    title: "Нагрузка команды"
  }
});

export const HERO_METRIC_KEYS = [
  "incoming",
  "resolved",
  "backlog",
  "slaAttainment",
  "firstResponseMedianSeconds",
  "resolutionMedianSeconds",
  "csatAverage",
  "reopenRate"
];

export function normalizeReportWorkspace(payload = {}) {
  const raw = payload.operations ?? payload.supportOperations ?? payload.supportOps ?? payload.workspaceV2;
  const operations = raw && typeof raw === "object"
    ? normalizeOperations(raw)
    : legacyOperations(payload);
  return {
    dataQuality: payload.dataQuality ?? null,
    columnOptions: Array.isArray(payload.columnOptions) ? payload.columnOptions : [],
    exportJobs: Array.isArray(payload.exportJobs) ? payload.exportJobs : [],
    filterOptions: normalizeFilterOptions(payload.filterOptions),
    hasActivity: Boolean(payload.hasActivity || operations.metrics.incoming?.value || operations.metrics.resolved?.value || operations.metrics.backlog?.value),
    metricDefinitionVersion: payload.metricDefinitionVersion ?? operations.version ?? "unknown",
    operations,
    savedReportTemplates: Array.isArray(payload.savedReportTemplates) ? payload.savedReportTemplates : [],
    snapshotAt: payload.snapshotAt ?? "",
    source: payload.source ?? operations.source ?? "unknown",
    windows: payload.windows ?? operations.windows ?? null
  };
}

function normalizeOperations(raw) {
  const metricShape = normalizeMetrics(
    raw.metrics ?? raw.kpis ?? raw.summary ?? {},
    raw.previousMetrics,
    raw.comparisons
  );
  decorateMetricEvidence(metricShape, raw.metrics?.current ?? raw.metrics ?? {});
  const timeSeries = normalizeTimeSeries(
    raw.timeSeries ?? raw.series ?? raw.trend,
    raw.period?.timezoneOffsetMinutes
  );
  return {
    backlogAge: normalizeBreakdownRows(raw.backlogAge ?? raw.backlogAgeBuckets ?? raw.queueHealth?.ageBuckets),
    breakdowns: {
      channels: normalizeBreakdownRows(raw.breakdowns?.channels ?? raw.channels ?? raw.channelBreakdown),
      operators: normalizeBreakdownRows(raw.breakdowns?.operators ?? raw.operators ?? raw.operatorWorkload),
      queues: normalizeBreakdownRows(raw.breakdowns?.queues ?? raw.queues ?? raw.queueBreakdown),
      teams: normalizeBreakdownRows(raw.breakdowns?.teams ?? raw.teams ?? raw.teamBreakdown),
      topics: normalizeBreakdownRows(raw.breakdowns?.topics ?? raw.topics ?? raw.topicBreakdown)
    },
    caveats: normalizeTextList(raw.caveats ?? raw.limitations),
    definitions: normalizeDefinitions(raw.definitions ?? raw.metricDefinitions),
    insights: normalizeInsights(raw.insights),
    metrics: metricShape,
    serviceLevel: normalizeServiceLevel(raw.serviceLevel ?? raw.serviceLevels, metricShape),
    period: raw.period ?? null,
    source: raw.source ?? "conversation_lifecycle_events",
    timeSeries,
    trendExplorer: normalizeTrendExplorer(
      raw.trendExplorer ?? raw.timeSeries?.kpi ?? raw.kpiTimeSeries,
      timeSeries,
      metricShape,
      raw.period?.timezoneOffsetMinutes
    ),
    version: raw.version ?? "support-ops/v2",
    windows: raw.windows ?? (raw.period ? { current: raw.period.current, previous: raw.period.previous } : null)
  };
}

function normalizeMetrics(metricsRaw, explicitPrevious, comparisons = {}) {
  const currentSource = metricsRaw?.current && typeof metricsRaw.current === "object" ? metricsRaw.current : metricsRaw;
  const previousSource = metricsRaw?.previous && typeof metricsRaw.previous === "object" ? metricsRaw.previous : explicitPrevious ?? {};
  const output = {};
  for (const [inputKey, entry] of Object.entries(currentSource ?? {})) {
    const key = canonicalMetricKey(entry?.key ?? inputKey);
    if (key === "current" || key === "previous") continue;
    const normalized = normalizeMetricEntry(
      key,
      entry,
      previousSource?.[inputKey] ?? previousSource?.[key],
      comparisons?.[inputKey] ?? comparisons?.[key]
    );
    if (normalized) output[key] = normalized;
  }
  if (Array.isArray(metricsRaw)) {
    for (const entry of metricsRaw) {
      const key = canonicalMetricKey(entry?.key ?? entry?.id ?? entry?.label);
      const normalized = normalizeMetricEntry(key, entry, entry?.previous);
      if (normalized) output[key] = normalized;
    }
  }
  return output;
}

function normalizeMetricEntry(key, entry, previousEntry, comparison) {
  if (!key || key === "undefined") return null;
  const objectEntry = entry && typeof entry === "object" ? entry : { value: entry };
  const previousObject = previousEntry && typeof previousEntry === "object" ? previousEntry : { value: previousEntry };
  const value = nullableNumber(objectEntry.value ?? objectEntry.current ?? objectEntry.count);
  const previous = nullableNumber(objectEntry.previous ?? objectEntry.previousValue ?? previousObject.value ?? previousEntry);
  const format = objectEntry.format ?? REPORT_METRIC_REGISTRY[key]?.format;
  const percentagePointComparison = format === "percent" && comparison;
  const delta = nullableNumber(
    objectEntry.delta
    ?? objectEntry.deltaPercent
    ?? (percentagePointComparison ? comparison.absolute : comparison?.percent)
    ?? computePercentDelta(value, previous)
  );
  return {
    ...objectEntry,
    delta,
    deltaUnit: objectEntry.deltaUnit ?? (percentagePointComparison ? "percentage_points" : "percent"),
    denominator: nullableNumber(objectEntry.denominator),
    format,
    key,
    label: objectEntry.label ?? REPORT_METRIC_REGISTRY[key]?.label ?? key,
    numerator: nullableNumber(objectEntry.numerator),
    previous,
    sampleSize: nullableNumber(objectEntry.sampleSize ?? objectEntry.samples ?? objectEntry.n),
    unit: objectEntry.unit ?? null,
    value
  };
}

function normalizeTimeSeries(raw, timezoneOffsetMinutes = 0) {
  if (!raw) return { grain: "day", labels: [], rows: [], series: [] };
  const current = raw.current ?? raw;
  const rows = Array.isArray(current)
    ? current.map((point, index) => normalizeTimePoint(point, index, raw.granularity ?? raw.grain, timezoneOffsetMinutes))
    : Array.isArray(current.rows)
      ? current.rows.map((point, index) => normalizeTimePoint(point, index, raw.granularity ?? raw.grain ?? current.grain, timezoneOffsetMinutes))
      : rowsFromColumnarSeries(current, timezoneOffsetMinutes);
  const definitions = [
    { color: "#2f6df6", key: "incoming", label: "Входящие" },
    { color: "#12aaa0", key: "resolved", label: "Решено" },
    { color: "#8c9bb2", dashed: true, key: "backlog", label: "Бэклог" }
  ];
  return {
    aggregated: Boolean(raw.aggregated),
    aggregationReason: raw.aggregationReason ?? null,
    grain: raw.granularity ?? raw.grain ?? current.grain ?? "day",
    labels: rows.map((row) => row.label),
    rows,
    series: definitions.map((definition) => ({
      ...definition,
      values: rows.map((row) => nullableNumber(row[definition.key]) ?? 0)
    }))
  };
}

function normalizeTimePoint(point, index, grain = "day", timezoneOffsetMinutes = 0) {
  return {
    backlog: nullableNumber(point?.backlog ?? point?.open) ?? 0,
    incoming: nullableNumber(point?.incoming ?? point?.new ?? point?.newConversations) ?? 0,
    label: String(point?.label ?? point?.bucketLabel ?? point?.date ?? formatBucketLabel(point?.from, grain, timezoneOffsetMinutes) ?? index + 1),
    resolved: nullableNumber(point?.resolved ?? point?.closed ?? point?.closedConversations) ?? 0,
    timestamp: point?.timestamp ?? point?.from ?? null
  };
}

function rowsFromColumnarSeries(source, timezoneOffsetMinutes = 0) {
  const labels = Array.isArray(source.labels) ? source.labels : [];
  const incoming = source.incoming ?? source.new ?? source.newConversations ?? [];
  const resolved = source.resolved ?? source.closed ?? source.closedConversations ?? [];
  const backlog = source.backlog ?? source.open ?? [];
  const length = Math.max(labels.length, incoming.length ?? 0, resolved.length ?? 0, backlog.length ?? 0);
  return Array.from({ length }, (_, index) => normalizeTimePoint({
    backlog: backlog[index],
    incoming: incoming[index],
    label: labels[index] ?? index + 1,
    resolved: resolved[index]
  }, index, source.grain ?? "day", timezoneOffsetMinutes));
}

function normalizeTrendExplorer(raw, fallbackTimeSeries, metrics, timezoneOffsetMinutes = 0) {
  const supportedGrains = REPORT_TREND_GRAIN_OPTIONS.map(({ value }) => value);
  const advertisedGrains = Array.isArray(raw?.availableGrains)
    ? raw.availableGrains.filter((grain) => supportedGrains.includes(grain))
    : [];
  const byGrain = {};

  for (const grain of supportedGrains) {
    const source = raw?.byGrain?.[grain] ?? raw?.[grain];
    if (!source) continue;
    byGrain[grain] = {
      current: normalizeKpiTrendPoints(source.current ?? source.rows ?? source, grain, timezoneOffsetMinutes),
      previous: normalizeKpiTrendPoints(source.previous, grain, timezoneOffsetMinutes)
    };
  }

  if (!Object.keys(byGrain).length && fallbackTimeSeries) {
    const fallbackGrain = supportedGrains.includes(fallbackTimeSeries.grain) ? fallbackTimeSeries.grain : "day";
    byGrain[fallbackGrain] = {
      current: fallbackTrendPoints(fallbackTimeSeries.rows, fallbackGrain),
      previous: []
    };
  }

  const availableGrains = [...new Set([
    ...advertisedGrains,
    ...Object.keys(byGrain)
  ])].filter((grain) => supportedGrains.includes(grain));

  return {
    availableGrains: availableGrains.length ? availableGrains : ["day"],
    byGrain,
    metricOptions: trendMetricOptions(metrics)
  };
}

function normalizeKpiTrendPoints(points, grain, timezoneOffsetMinutes) {
  if (!Array.isArray(points)) return [];
  return points.map((point, index) => {
    const sourceMetrics = point?.metrics && typeof point.metrics === "object" ? point.metrics : point?.values ?? {};
    const normalizedMetrics = {};
    for (const [inputKey, entry] of Object.entries(sourceMetrics)) {
      const key = canonicalMetricKey(inputKey);
      if (!key) continue;
      normalizedMetrics[key] = normalizeKpiTrendMetric(entry);
    }
    return {
      from: point?.from ?? point?.timestamp ?? null,
      label: String(point?.label ?? formatTrendBucketLabel(point?.from, point?.to, grain, timezoneOffsetMinutes) ?? index + 1),
      metrics: normalizedMetrics,
      timestamp: point?.timestamp ?? point?.from ?? null,
      to: point?.to ?? null
    };
  });
}

function normalizeKpiTrendMetric(entry) {
  const objectEntry = entry && typeof entry === "object" ? entry : { value: entry };
  return {
    samples: nullableNumber(objectEntry.samples ?? objectEntry.sampleSize ?? objectEntry.n),
    scaleMaximum: nullableNumber(objectEntry.scaleMaximum ?? objectEntry.maximum ?? objectEntry.scale?.maximum),
    value: nullableNumber(objectEntry.value ?? objectEntry.current ?? objectEntry.count)
  };
}

function fallbackTrendPoints(rows, grain) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => ({
    from: row.timestamp ?? null,
    label: String(row.label ?? index + 1),
    metrics: {
      backlog: { samples: nullableNumber(row.backlog), scaleMaximum: null, value: nullableNumber(row.backlog) },
      incoming: { samples: nullableNumber(row.incoming), scaleMaximum: null, value: nullableNumber(row.incoming) },
      resolved: { samples: nullableNumber(row.resolved), scaleMaximum: null, value: nullableNumber(row.resolved) }
    },
    timestamp: row.timestamp ?? null,
    to: null,
    grain
  }));
}

function trendMetricOptions(metrics) {
  return REPORT_TREND_METRIC_OPTIONS.map(({ label, value }) => {
    const details = TREND_PRESET_DETAILS[value];
    const domain = details.format === "percent"
      ? { max: 100, min: 0 }
      : details.format === "rating" && Number.isFinite(Number(metrics.csatAverage?.scaleMaximum))
        ? { max: Number(metrics.csatAverage.scaleMaximum), min: 0 }
        : { min: 0 };
    return {
      ...details,
      domain,
      key: value,
      label,
      series: details.series.map((series) => ({ ...series, format: details.format }))
    };
  });
}

export function selectTrendExplorerView(explorer, selection) {
  const normalizedSelection = normalizeReportTrend(selection);
  const metricOptions = Array.isArray(explorer?.metricOptions) ? explorer.metricOptions : trendMetricOptions({});
  const option = metricOptions.find(({ key }) => key === normalizedSelection.metric)
    ?? metricOptions.find(({ key }) => key === "volume")
    ?? metricOptions[0];
  const availableGrains = Array.isArray(explorer?.availableGrains) && explorer.availableGrains.length
    ? explorer.availableGrains
    : ["day"];
  const grain = availableGrains.includes(normalizedSelection.grain)
    ? normalizedSelection.grain
    : availableGrains[0];
  const window = explorer?.byGrain?.[grain] ?? { current: [], previous: [] };
  const rows = Array.isArray(window.current) ? window.current : [];
  let series = option.series.map((definition) => ({
    ...definition,
    samples: rows.map((row) => row.metrics?.[definition.key]?.samples ?? null),
    scaleMaximums: rows.map((row) => row.metrics?.[definition.key]?.scaleMaximum ?? null),
    values: rows.map((row) => row.metrics?.[definition.key]?.value ?? null)
  }));
  const ratingScaleMaximums = option.format === "rating"
    ? [...new Set(series.flatMap((item) => item.values.flatMap((value, index) => value === null ? [] : [item.scaleMaximums[index]]).filter(Number.isFinite)))]
    : [];
  const incompatibleRatingScales = ratingScaleMaximums.length > 1;
  if (incompatibleRatingScales) {
    series = series.map((item) => ({ ...item, values: item.values.map(() => null) }));
  }
  const chartRows = rows.map((row, index) => ({
    ...row,
    samples: Object.fromEntries(series.map((item) => [item.key, item.samples[index]])),
    scaleMaximums: Object.fromEntries(series.map((item) => [item.key, item.scaleMaximums[index]])),
    values: Object.fromEntries(series.map((item) => [item.key, item.values[index]]))
  }));
  return {
    ...option,
    availableGrains,
    domain: option.format === "rating" && ratingScaleMaximums.length === 1
      ? { max: ratingScaleMaximums[0], min: 0 }
      : option.domain,
    grain,
    incompatibleRatingScales,
    metric: option.key,
    metricOptions,
    previous: Array.isArray(window.previous) ? window.previous : [],
    rows: chartRows,
    series
  };
}

function durationTrend(title, description, prefix) {
  return {
    chartType: "line",
    description,
    format: "duration",
    series: [
      { color: "#2f6df6", key: `${prefix}MedianSeconds`, label: "P50" },
      { color: "#7a5af8", dashed: true, key: `${prefix}P90Seconds`, label: "P90" }
    ],
    title
  };
}

function singleTrend(title, description, key, format, color) {
  return {
    chartType: "line",
    description,
    format,
    series: [{ color, key, label: title }],
    title
  };
}

function formatTrendBucketLabel(from, to, grain, timezoneOffsetMinutes = 0) {
  const start = Date.parse(String(from ?? ""));
  if (!Number.isFinite(start)) return null;
  const offset = Number.isFinite(Number(timezoneOffsetMinutes)) ? Number(timezoneOffsetMinutes) * 60_000 : 0;
  if (grain === "month") {
    return new Intl.DateTimeFormat("ru-RU", { month: "short", timeZone: "UTC", year: "numeric" }).format(start + offset);
  }
  if (grain === "week") {
    const end = Date.parse(String(to ?? ""));
    const inclusiveEnd = Number.isFinite(end) && end > start ? end - 1 : start;
    const startLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(start + offset);
    const endLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).format(inclusiveEnd + offset);
    return `${startLabel} — ${endLabel}`;
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", timeZone: "UTC" }).format(start + offset);
}

function normalizeServiceLevel(raw, metrics) {
  return {
    firstResponse: {
      average: nullableNumber(raw?.firstResponse?.average ?? raw?.firstResponseAverageSeconds ?? metrics.firstResponseAverageSeconds?.value),
      median: nullableNumber(raw?.firstResponse?.median ?? metrics.firstResponseMedianSeconds?.value),
      p90: nullableNumber(raw?.firstResponse?.p90 ?? metrics.firstResponseP90Seconds?.value),
      sampleSize: nullableNumber(raw?.firstResponse?.sampleSize ?? metrics.firstResponseMedianSeconds?.sampleSize),
      coverage: nullableNumber(raw?.firstResponse?.coverage ?? metrics.responseCoverage?.value)
    },
    resolution: {
      average: nullableNumber(raw?.resolution?.average ?? raw?.resolutionAverageSeconds),
      median: nullableNumber(raw?.resolution?.median ?? metrics.resolutionMedianSeconds?.value),
      p90: nullableNumber(raw?.resolution?.p90 ?? metrics.resolutionP90Seconds?.value),
      sampleSize: nullableNumber(raw?.resolution?.sampleSize ?? metrics.resolutionMedianSeconds?.sampleSize)
    },
    sla: {
      breaches: nullableNumber(raw?.sla?.breaches ?? metrics.overdue?.value),
      denominator: nullableNumber(raw?.sla?.denominator ?? metrics.slaAttainment?.denominator),
      numerator: nullableNumber(raw?.sla?.numerator ?? metrics.slaAttainment?.numerator),
      value: nullableNumber(raw?.sla?.value ?? metrics.slaAttainment?.value)
    }
  };
}

function decorateMetricEvidence(metrics, current) {
  const sampleMap = {
    csatAverage: current.csatSamples,
    csatPositiveRate: current.csatSamples,
    csatCoverage: current.csatSamples,
    firstResponseAverageSeconds: current.firstResponseSamples,
    firstResponseMedianSeconds: current.firstResponseSamples,
    firstResponseP90Seconds: current.firstResponseSamples,
    fullResolutionMedianSeconds: current.fullResolutionSamples,
    fullResolutionP90Seconds: current.fullResolutionSamples,
    nextResponseMedianSeconds: current.nextResponseSamples,
    nextResponseP90Seconds: current.nextResponseSamples,
    oneTouchRate: current.oneTouchResolutionSamples,
    resolutionMedianSeconds: current.firstResolutionSamples,
    resolutionP90Seconds: current.firstResolutionSamples,
    responseCoverage: current.firstResponseSamples,
    slaAttainment: current.slaRecordedSamples
  };
  for (const [key, sampleSize] of Object.entries(sampleMap)) {
    if (metrics[key] && Number.isFinite(Number(sampleSize))) metrics[key].sampleSize = Number(sampleSize);
  }
  if (metrics.csatAverage && Number.isFinite(Number(current.csatScaleMaximum)) && Number(current.csatScaleMaximum) > 0) {
    metrics.csatAverage.scaleMaximum = Number(current.csatScaleMaximum);
  }
  if (metrics.slaAttainment && Number.isFinite(Number(current.slaRecordedSamples))) {
    metrics.slaAttainment.denominator = Number(current.slaRecordedSamples);
    metrics.slaAttainment.numerator = Math.max(0, Number(current.slaRecordedSamples) - Number(current.slaBreaches ?? 0));
  }
  if (metrics.responseCoverage && Number.isFinite(Number(current.incoming))) {
    metrics.responseCoverage.denominator = Number(current.incoming);
    metrics.responseCoverage.numerator = Number(current.firstResponseSamples ?? 0);
  }
  decorateRatioEvidence(metrics.reopenRate, current.reopenedConversations, current.resolved);
  decorateRatioEvidence(metrics.oneTouchRate, current.oneTouchResolutionCount, current.oneTouchResolutionSamples);
  decorateRatioEvidence(metrics.csatCoverage, current.csatSamples, current.resolved);
  if (!metrics.flowRatio && Number(current.incoming) > 0) {
    metrics.flowRatio = normalizeMetricEntry("flowRatio", Number(current.resolved) / Number(current.incoming), null, null);
  }
  decorateRatioEvidence(metrics.flowRatio, current.resolved, current.incoming);
}

function decorateRatioEvidence(metric, numerator, denominator) {
  if (!metric || !Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator))) return;
  metric.numerator = Number(numerator);
  metric.denominator = Number(denominator);
}

function formatBucketLabel(value, grain, timezoneOffsetMinutes = 0) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return null;
  const offset = Number.isFinite(Number(timezoneOffsetMinutes)) ? Number(timezoneOffsetMinutes) : 0;
  return new Intl.DateTimeFormat("ru-RU", grain === "hour"
    ? { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }
    : { day: "2-digit", month: "short", timeZone: "UTC" }
  ).format(timestamp + offset * 60_000);
}

function normalizeBreakdownRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    if (Array.isArray(row)) return { id: String(row[0] ?? index), label: String(row[0] ?? "—"), value: nullableNumber(row[1]) ?? 0 };
    return {
      ...row,
      id: String(row.id ?? row.key ?? row.channel ?? row.topic ?? row.operatorId ?? row.label ?? index),
      label: String(row.label ?? row.name ?? row.channel ?? row.topic ?? row.operatorName ?? row.operatorId ?? row.key ?? "—")
    };
  });
}

function normalizeDefinitions(definitions) {
  if (!Array.isArray(definitions)) return [];
  return definitions.map((definition) => {
    const key = canonicalMetricKey(definition.key ?? definition.id);
    return {
      ...definition,
      key,
      label: definition.label ?? definition.name ?? REPORT_METRIC_REGISTRY[key]?.label ?? key
    };
  });
}

function normalizeInsights(insights) {
  if (!Array.isArray(insights)) return [];
  return insights.map((insight, index) => typeof insight === "string"
    ? { id: `insight-${index}`, title: insight, detail: "", tone: "info" }
    : { id: insight.id ?? `insight-${index}`, tone: insight.tone ?? "info", ...insight });
}

function normalizeTextList(values) {
  return Array.isArray(values) ? values.map(String).filter(Boolean) : [];
}

function normalizeFilterOptions(options = {}) {
  const normalize = (values) => Array.isArray(values) ? values : [];
  return {
    channels: normalize(options.channels),
    operatorId: normalize(options.operatorId),
    operators: normalize(options.operators),
    queueId: normalize(options.queueId),
    resolutionOutcome: normalize(options.resolutionOutcome),
    status: normalize(options.status),
    teamId: normalize(options.teamId),
    topic: normalize(options.topic)
  };
}

function legacyOperations(payload) {
  const oldRows = Array.isArray(payload.rows) ? payload.rows : [];
  const byMetric = new Map(oldRows.map((row) => [String(row.metric ?? ""), row]));
  const mapMetric = (key, label, parser, format) => {
    const row = byMetric.get(label);
    const value = row ? parser(row.today) : null;
    const previous = row ? parser(row.previous) : null;
    return { key, label: REPORT_METRIC_REGISTRY[key]?.label ?? label, value, previous, delta: computePercentDelta(value, previous), format };
  };
  const metrics = {
    incoming: mapMetric("incoming", "Новые диалоги", parseNumber, "integer"),
    resolved: mapMetric("resolved", "Закрытые диалоги", parseNumber, "integer"),
    firstResponseMedianSeconds: mapMetric("firstResponseMedianSeconds", "Среднее время первого ответа", parseDuration, "duration"),
    slaAttainment: mapMetric("slaAttainment", "SLA выполнен", parseNumber, "percent")
  };
  const chart = (payload.chartBlocks ?? []).find((item) => item.id === "new-closed");
  const rows = Array.isArray(chart?.labels) ? chart.labels.map((label, index) => ({
    backlog: 0,
    incoming: nullableNumber(chart.series?.[0]?.points?.[index] ?? chart.points?.[index]) ?? 0,
    label,
    resolved: nullableNumber(chart.series?.[1]?.points?.[index]) ?? 0
  })) : [];
  const timeSeries = normalizeTimeSeries(rows);
  return {
    backlogAge: [],
    breakdowns: { channels: normalizeBreakdownRows(payload.bars), operators: [], queues: [], teams: [], topics: [] },
    caveats: ["Расширенная модель support-ops/v2 недоступна для этого снимка."],
    definitions: [],
    insights: [],
    metrics,
    serviceLevel: normalizeServiceLevel(null, metrics),
    source: payload.source ?? "conversation_lifecycle_events",
    timeSeries,
    trendExplorer: normalizeTrendExplorer(null, timeSeries, metrics),
    version: payload.metricDefinitionVersion ?? "legacy",
    windows: payload.windows ?? null
  };
}

function canonicalMetricKey(value) {
  const key = String(value ?? "");
  return METRIC_ALIASES[key] ?? key;
}

function parseNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseDuration(value) {
  const parts = String(value ?? "").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3_600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function computePercentDelta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round((current - previous) / Math.abs(previous) * 1_000) / 10;
}
