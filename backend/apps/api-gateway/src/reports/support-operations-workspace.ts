import type { ConversationReportSourceRow } from "./report.repository.js";

export const SUPPORT_OPERATIONS_WORKSPACE_VERSION = "support-ops/v2" as const;

export type SupportOperationsPeriod = "today" | "yesterday" | "7days" | "30days" | "custom";
export type SupportOperationsMetricKey = keyof SupportOperationsMetrics;

type SourceMessage = ConversationReportSourceRow["messages"][number];
type SourceLifecycleEvent = NonNullable<ConversationReportSourceRow["lifecycleEvents"]>[number];

export interface SupportOperationsMessage extends SourceMessage {
  actorType?: string;
  author?: string;
  authorId?: string;
  authorType?: string;
  isBot?: boolean;
  operatorId?: string;
  senderType?: string;
}

export interface SupportOperationsRating {
  createdAt?: string;
  id?: string;
  scale?: string;
  score: number | null;
}

/**
 * Optional fields reflect data which exists in adjacent conversation/quality
 * domains but is not guaranteed on ConversationReportSourceRow yet. The
 * aggregator never invents a value when an optional source is absent.
 */
export type SupportOperationsConversationRow = Omit<ConversationReportSourceRow, "messages"> & {
  closedAt?: string;
  messages: SupportOperationsMessage[];
  metadata?: { closedAt?: string };
  qualityAssessment?: SupportOperationsRating;
  rating?: SupportOperationsRating;
  ratings?: SupportOperationsRating[];
};

export interface SupportOperationsWorkspaceOptions {
  channel?: string;
  dateFrom?: string;
  dateTo?: string;
  now?: Date | number | string;
  period?: SupportOperationsPeriod | "7_days" | "30_days" | "Сегодня" | "Вчера" | "7 дней" | "30 дней" | "Свой период";
  timezoneOffsetMinutes?: number;
  topic?: string;
}

export interface SupportOperationsWindow {
  from: string;
  to: string;
}

export interface SupportOperationsMetrics {
  agentTouches: number;
  backlog: number;
  csatAverage: number | null;
  csatCoveragePercent: number | null;
  csatPositiveRatePercent: number | null;
  csatSamples: number;
  csatScaleMaximum: number | null;
  firstResolutionMedianSeconds: number | null;
  firstResolutionP90Seconds: number | null;
  firstResolutionSamples: number;
  firstResponseAverageSeconds: number | null;
  firstResponseCoveragePercent: number | null;
  firstResponseMedianSeconds: number | null;
  firstResponseP90Seconds: number | null;
  firstResponseSamples: number;
  fullResolutionMedianSeconds: number | null;
  fullResolutionP90Seconds: number | null;
  fullResolutionSamples: number;
  incoming: number;
  internalComments: number;
  nextResponseMedianSeconds: number | null;
  nextResponseP90Seconds: number | null;
  nextResponseSamples: number;
  oneTouchResolutionCount: number;
  oneTouchResolutionPercent: number | null;
  oneTouchResolutionSamples: number;
  reopenRatePercent: number | null;
  reopenedConversations: number;
  resolved: number;
  slaAttainmentPercent: number | null;
  slaBreaches: number;
  slaRecordedSamples: number;
  waiting: number;
}

export interface SupportOperationsMetricComparison {
  absolute: number | null;
  comparable: boolean;
  percent: number | null;
}

export interface SupportOperationsTimeSeriesPoint {
  agentTouches: number;
  backlog: number;
  firstResponseMedianSeconds: number | null;
  from: string;
  incoming: number;
  resolved: number;
  slaBreaches: number;
  to: string;
  waiting: number;
}

export type SupportOperationsKpiTimeSeriesGrain = "day" | "week" | "month";

export interface SupportOperationsKpiTimeSeriesMetric {
  /**
   * Evidence behind the value: measured observations for durations and scores,
   * the denominator for rates, and the value itself for counts and snapshots.
   */
  samples: number;
  /** Common CSAT scale maximum; present only for csatAverage. */
  scaleMaximum?: number | null;
  value: number | null;
}

export interface SupportOperationsKpiTimeSeriesPoint {
  from: string;
  metrics: {
    agentTouches: SupportOperationsKpiTimeSeriesMetric;
    backlog: SupportOperationsKpiTimeSeriesMetric;
    csatAverage: SupportOperationsKpiTimeSeriesMetric;
    csatCoveragePercent: SupportOperationsKpiTimeSeriesMetric;
    csatPositiveRatePercent: SupportOperationsKpiTimeSeriesMetric;
    firstResolutionP50Seconds: SupportOperationsKpiTimeSeriesMetric;
    firstResolutionP90Seconds: SupportOperationsKpiTimeSeriesMetric;
    firstResponseCoveragePercent: SupportOperationsKpiTimeSeriesMetric;
    firstResponseP50Seconds: SupportOperationsKpiTimeSeriesMetric;
    firstResponseP90Seconds: SupportOperationsKpiTimeSeriesMetric;
    fullResolutionP50Seconds: SupportOperationsKpiTimeSeriesMetric;
    fullResolutionP90Seconds: SupportOperationsKpiTimeSeriesMetric;
    incoming: SupportOperationsKpiTimeSeriesMetric;
    internalComments: SupportOperationsKpiTimeSeriesMetric;
    nextResponseP50Seconds: SupportOperationsKpiTimeSeriesMetric;
    nextResponseP90Seconds: SupportOperationsKpiTimeSeriesMetric;
    oneTouchResolutionPercent: SupportOperationsKpiTimeSeriesMetric;
    reopenRatePercent: SupportOperationsKpiTimeSeriesMetric;
    resolved: SupportOperationsKpiTimeSeriesMetric;
    responseCoveragePercent: SupportOperationsKpiTimeSeriesMetric;
    slaAttainmentPercent: SupportOperationsKpiTimeSeriesMetric;
    slaBreaches: SupportOperationsKpiTimeSeriesMetric;
    waiting: SupportOperationsKpiTimeSeriesMetric;
  };
  to: string;
}

export interface SupportOperationsKpiTimeSeriesWindow {
  current: SupportOperationsKpiTimeSeriesPoint[];
  previous: SupportOperationsKpiTimeSeriesPoint[];
}

/**
 * Calendar buckets in the report timezone. Weeks start on Monday; the first
 * and last bucket are clipped to the selected comparison window. Every bucket
 * is calculated from source conversation/message facts, never rolled up from
 * another grain's percentile or rate.
 */
export interface SupportOperationsKpiTimeSeries {
  availableGrains: SupportOperationsKpiTimeSeriesGrain[];
  byGrain: Record<SupportOperationsKpiTimeSeriesGrain, SupportOperationsKpiTimeSeriesWindow>;
}

export interface SupportOperationsTimeSeries {
  aggregated: boolean;
  aggregationReason: "custom_range_exceeds_93_days" | null;
  current: SupportOperationsTimeSeriesPoint[];
  granularity: "hour" | "day" | "week";
  kpi: SupportOperationsKpiTimeSeries;
  previous: SupportOperationsTimeSeriesPoint[];
}

export interface SupportOperationsBacklogAgeBucket {
  count: number;
  fromSeconds: number;
  key: "under_4h" | "4h_24h" | "1d_3d" | "3d_7d" | "7d_30d" | "over_30d";
  sharePercent: number | null;
  toSeconds: number | null;
}

export interface SupportOperationsBreakdownItem {
  agentTouches: number;
  backlog: number;
  incoming: number;
  key: string;
  label: string;
  resolved: number;
  sharePercent: number | null;
  waiting: number;
}

export interface SupportOperationsOperatorWorkload {
  agentTouches: number;
  assignedBacklog: number;
  firstResponseMedianSeconds: number | null;
  internalComments: number;
  key: string;
  label: string;
  resolved: number;
  workloadSharePercent: number | null;
}

export interface SupportOperationsInsight {
  changePercent: number | null;
  code: "backlog_growth" | "csat_risk" | "first_response_degradation" | "first_response_low_coverage" | "sla_breaches" | "workload_imbalance";
  current: number;
  metric: SupportOperationsMetricKey | "operatorWorkload";
  previous: number | null;
  sampleSize: number;
  severity: "critical" | "info" | "warning";
  threshold: number;
}

export interface SupportOperationsMetricDefinition {
  caveats: string[];
  formula: string;
  key: SupportOperationsMetricKey;
  source: string[];
  unit: "count" | "percent" | "score" | "seconds";
}

export interface SupportOperationsWorkspace {
  backlogAge: SupportOperationsBacklogAgeBucket[];
  breakdowns: {
    channels: SupportOperationsBreakdownItem[];
    operators: SupportOperationsOperatorWorkload[];
    topics: SupportOperationsBreakdownItem[];
  };
  comparisons: Record<SupportOperationsMetricKey, SupportOperationsMetricComparison>;
  generatedAt: string;
  insights: SupportOperationsInsight[];
  metricDefinitions: SupportOperationsMetricDefinition[];
  metrics: {
    current: SupportOperationsMetrics;
    previous: SupportOperationsMetrics;
  };
  period: {
    current: SupportOperationsWindow;
    isCurrentWindowPartial: boolean;
    kind: SupportOperationsPeriod;
    previous: SupportOperationsWindow;
    timezoneOffsetMinutes: number;
  };
  source: {
    conversationsWithKnownStart: number;
    invalidRatings: number;
    rowCount: number;
    rowsWithLifecycleEvents: number;
    type: "conversation-report-source-row";
  };
  timeSeries: SupportOperationsTimeSeries;
  version: typeof SUPPORT_OPERATIONS_WORKSPACE_VERSION;
}

interface TimestampWindow {
  from: number;
  to: number;
}

interface ReportWindows {
  current: TimestampWindow;
  currentLogicalTo: number;
  isCurrentWindowPartial: boolean;
  previous: TimestampWindow;
}

interface NormalizedMessage {
  isBot: boolean;
  operatorId?: string;
  operatorName?: string;
  side: "agent" | "client" | "other";
  timestamp: number;
  type: "csat_feedback" | "event" | "internal" | "public";
}

interface ResponseSample {
  durationSeconds: number;
  first: boolean;
  requestedAt: number;
  respondedAt: number;
}

interface RatingFact {
  maximum: number | null;
  positive: boolean | null;
  score: number;
  timestamp: number;
}

interface ConversationFact {
  channel: string;
  closeEvents: number[];
  id: string;
  messages: NormalizedMessage[];
  operatorId?: string;
  operatorName?: string;
  ratings: RatingFact[];
  reopenEvents: number[];
  responses: ResponseSample[];
  slaBreached: boolean;
  slaRecorded: boolean;
  startedAt?: number;
  statusBaseline?: { closed: boolean; timestamp: number };
  topic: string;
}

interface SourceDiagnostics {
  invalidRatings: number;
}

const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * HOUR_MS;
const MAX_CUSTOM_DAYS = 366;
const LONG_CUSTOM_DAYS = 93;
const CLOSED_STATUSES = new Set([
  "closed", "completed", "done", "resolved", "закрыт", "закрыта", "закрыто", "завершен", "завершена", "завершено"
]);
const BREACHED_SLA_TONES = new Set(["breach", "breached", "critical", "danger", "overdue", "violated"]);
const ATTAINED_SLA_TONES = new Set(["healthy", "met", "normal", "ok", "success", "within"]);

const BACKLOG_AGE_RANGES: ReadonlyArray<Omit<SupportOperationsBacklogAgeBucket, "count" | "sharePercent">> = [
  { fromSeconds: 0, key: "under_4h", toSeconds: 4 * 3_600 },
  { fromSeconds: 4 * 3_600, key: "4h_24h", toSeconds: 24 * 3_600 },
  { fromSeconds: 24 * 3_600, key: "1d_3d", toSeconds: 3 * 24 * 3_600 },
  { fromSeconds: 3 * 24 * 3_600, key: "3d_7d", toSeconds: 7 * 24 * 3_600 },
  { fromSeconds: 7 * 24 * 3_600, key: "7d_30d", toSeconds: 30 * 24 * 3_600 },
  { fromSeconds: 30 * 24 * 3_600, key: "over_30d", toSeconds: null }
];

export function buildSupportOperationsWorkspace(
  rows: readonly (ConversationReportSourceRow | SupportOperationsConversationRow)[],
  options: SupportOperationsWorkspaceOptions = {}
): SupportOperationsWorkspace {
  const now = requiredTimestamp(options.now ?? Date.now(), "now");
  const timezoneOffsetMinutes = normalizeTimezoneOffset(options.timezoneOffsetMinutes);
  const period = normalizePeriod(options.period);
  const windows = buildWindows(period, now, timezoneOffsetMinutes, options.dateFrom, options.dateTo);
  const diagnostics: SourceDiagnostics = { invalidRatings: 0 };
  const selectedRows = rows.filter((row) => matchesFilters(row, options));
  const facts = selectedRows.map((row) => toConversationFact(row as SupportOperationsConversationRow, diagnostics));
  const current = metricsForWindow(facts, windows.current);
  const previous = metricsForWindow(facts, windows.previous);
  const breakdowns = buildBreakdowns(facts, windows.current);
  const timeSeries = buildTimeSeries(facts, period, windows, timezoneOffsetMinutes);

  return {
    backlogAge: buildBacklogAge(facts, windows.current.to),
    breakdowns,
    comparisons: compareMetrics(current, previous),
    generatedAt: new Date(now).toISOString(),
    insights: buildInsights(current, previous, breakdowns.operators),
    metricDefinitions: METRIC_DEFINITIONS.map((definition) => ({
      ...definition,
      caveats: [...definition.caveats],
      source: [...definition.source]
    })),
    metrics: { current, previous },
    period: {
      current: serializeWindow(windows.current),
      isCurrentWindowPartial: windows.isCurrentWindowPartial,
      kind: period,
      previous: serializeWindow(windows.previous),
      timezoneOffsetMinutes
    },
    source: {
      conversationsWithKnownStart: facts.filter((fact) => fact.startedAt !== undefined).length,
      invalidRatings: diagnostics.invalidRatings,
      rowCount: selectedRows.length,
      rowsWithLifecycleEvents: selectedRows.filter((row) => (row.lifecycleEvents?.length ?? 0) > 0).length,
      type: "conversation-report-source-row"
    },
    timeSeries,
    version: SUPPORT_OPERATIONS_WORKSPACE_VERSION
  };
}

function matchesFilters(row: ConversationReportSourceRow, options: SupportOperationsWorkspaceOptions): boolean {
  return matchesText(row.channel, options.channel)
    && matchesText(row.topic, options.topic);
}

function matchesText(value: string, filter: string | undefined): boolean {
  if (filter === undefined || filter.trim() === "" || normalizeText(filter) === "all" || normalizeText(filter) === "все каналы") return true;
  return normalizeText(value) === normalizeText(filter);
}

function toConversationFact(row: SupportOperationsConversationRow, diagnostics: SourceDiagnostics): ConversationFact {
  const lifecycle = normalizedLifecycle(row.lifecycleEvents ?? []);
  const directMessages = normalizeDirectMessages(row.messages);
  const lifecycleMessages = normalizeLifecycleMessages(lifecycle);
  const publicDirectMessages = directMessages.some((message) => message.type === "public");
  const messages = publicDirectMessages
    ? directMessages
    : [...directMessages.filter((message) => message.type === "internal"), ...lifecycleMessages].sort(byTimestamp);
  const startedAt = lifecycle.find(({ event }) => normalizedEventType(event.eventType) === "conversation.created")?.timestamp
    ?? optionalTimestamp(row.createdAt)
    ?? messages.find((message) => message.side === "client" && message.type === "public")?.timestamp
    ?? messages.find((message) => message.type === "public")?.timestamp;
  const closeEvents = lifecycle
    .filter(({ event }) => isCloseEvent(event))
    .map(({ timestamp }) => timestamp);
  const reopenEvents = lifecycle
    .filter(({ event }) => isReopenEvent(event))
    .map(({ timestamp }) => timestamp);
  if (closeEvents.length === 0 && isClosedStatus(row.status)) {
    const fallbackClosedAt = optionalTimestamp(row.closedAt)
      ?? optionalTimestamp(row.metadata?.closedAt)
      ?? optionalTimestamp(row.updatedAt);
    if (fallbackClosedAt !== undefined) closeEvents.push(fallbackClosedAt);
  }
  const ratingResult = extractRatings(row, lifecycle);
  diagnostics.invalidRatings += ratingResult.invalid;
  const sla = extractSla(row, lifecycle);
  const statusBaselineAt = optionalTimestamp(row.statusBaseline?.at);

  return {
    channel: row.channel.trim() || "unknown",
    closeEvents: uniqueSorted(closeEvents),
    id: row.id,
    messages,
    ...(row.operatorId ? { operatorId: row.operatorId } : {}),
    ...(row.operatorName ? { operatorName: row.operatorName } : {}),
    ratings: ratingResult.ratings,
    reopenEvents: uniqueSorted(reopenEvents),
    responses: responseSamples(messages),
    ...sla,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(statusBaselineAt === undefined || row.statusBaseline === undefined
      ? {}
      : { statusBaseline: { closed: row.statusBaseline.closed, timestamp: statusBaselineAt } }),
    topic: row.topic.trim() || "unknown"
  };
}

function normalizedLifecycle(events: readonly SourceLifecycleEvent[]): Array<{ event: SourceLifecycleEvent; timestamp: number }> {
  return events
    .map((event) => ({ event, timestamp: optionalTimestamp(event.occurredAt) }))
    .filter((item): item is { event: SourceLifecycleEvent; timestamp: number } => item.timestamp !== undefined)
    .sort(byTimestamp);
}

function normalizeDirectMessages(messages: readonly SupportOperationsMessage[]): NormalizedMessage[] {
  return messages
    .map((message): NormalizedMessage | undefined => {
      const timestamp = optionalTimestamp(message.createdAt);
      if (timestamp === undefined) return undefined;
      const type = message.type === "internal"
        ? "internal"
        : message.type === "event"
          ? "event"
          : message.type === "csat_feedback"
            ? "csat_feedback"
            : "public";
      return {
        isBot: explicitBotMarker(message as unknown as Record<string, unknown>),
        ...(message.operatorId ?? message.authorId ? { operatorId: message.operatorId ?? message.authorId } : {}),
        ...(message.author ? { operatorName: message.author } : {}),
        side: message.side === "agent" || message.side === "client" ? message.side : "other",
        timestamp,
        type
      };
    })
    .filter((message): message is NormalizedMessage => message !== undefined)
    .sort(byTimestamp);
}

function normalizeLifecycleMessages(
  lifecycle: readonly { event: SourceLifecycleEvent; timestamp: number }[]
): NormalizedMessage[] {
  return lifecycle.flatMap(({ event, timestamp }): NormalizedMessage[] => {
    const eventType = normalizedEventType(event.eventType);
    const data = event.data ?? {};
    if (eventType === "message.received") {
      return [{ isBot: false, side: "client", timestamp, type: "public" }];
    }
    if (eventType === "message.sent") {
      const internal = booleanValue(data.internal) || normalizeText(data.type) === "internal";
      return [{
        isBot: explicitBotMarker({ ...data, source: event.source }),
        ...(stringValue(data.operatorId) ? { operatorId: stringValue(data.operatorId) } : {}),
        ...(stringValue(data.operatorName) ? { operatorName: stringValue(data.operatorName) } : {}),
        side: "agent",
        timestamp,
        type: internal ? "internal" : "public"
      }];
    }
    if (eventType === "comment.internal" || eventType === "message.internal") {
      return [{
        isBot: explicitBotMarker({ ...data, source: event.source }),
        ...(stringValue(data.operatorId) ? { operatorId: stringValue(data.operatorId) } : {}),
        ...(stringValue(data.operatorName) ? { operatorName: stringValue(data.operatorName) } : {}),
        side: "agent",
        timestamp,
        type: "internal"
      }];
    }
    return [];
  }).sort(byTimestamp);
}

function responseSamples(messages: readonly NormalizedMessage[]): ResponseSample[] {
  const samples: ResponseSample[] = [];
  let pendingAt: number | undefined;
  let completedTurns = 0;
  for (const message of messages) {
    if (message.type !== "public") continue;
    if (message.side === "client") {
      pendingAt ??= message.timestamp;
      continue;
    }
    if (message.side !== "agent" || message.isBot || pendingAt === undefined) continue;
    samples.push({
      durationSeconds: Math.max(0, (message.timestamp - pendingAt) / 1_000),
      first: completedTurns === 0,
      requestedAt: pendingAt,
      respondedAt: message.timestamp
    });
    pendingAt = undefined;
    completedTurns += 1;
  }
  return samples;
}

function extractSla(
  row: SupportOperationsConversationRow,
  lifecycle: readonly { event: SourceLifecycleEvent; timestamp: number }[]
): Pick<ConversationFact, "slaBreached" | "slaRecorded"> {
  const breach = lifecycle.some(({ event }) => isSlaBreachEvent(event));
  const attained = lifecycle.some(({ event }) => isSlaAttainedEvent(event));
  if (breach || attained) return { slaBreached: breach, slaRecorded: true };
  const tone = normalizeText(row.slaTone);
  if (BREACHED_SLA_TONES.has(tone)) return { slaBreached: true, slaRecorded: true };
  if (ATTAINED_SLA_TONES.has(tone)) return { slaBreached: false, slaRecorded: true };
  return { slaBreached: false, slaRecorded: false };
}

function extractRatings(
  row: SupportOperationsConversationRow,
  lifecycle: readonly { event: SourceLifecycleEvent; timestamp: number }[]
): { invalid: number; ratings: RatingFact[] } {
  const persistedRatings = row.ratings?.length ? row.ratings : row.rating ? [row.rating] : [];
  const candidates: SupportOperationsRating[] = [
    ...persistedRatings,
    ...(row.qualityAssessment ? [row.qualityAssessment] : []),
    ...lifecycle.flatMap(({ event }): SupportOperationsRating[] => {
      const type = normalizedEventType(event.eventType);
      if (type !== "csat.rating.submitted" && type !== "rating.submitted" && type !== "csat.submitted") return [];
      return [{
        createdAt: event.occurredAt,
        scale: stringValue(event.data?.scale),
        score: numberValue(event.data?.score) ?? null
      }];
    })
  ];
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [
    `${candidate.createdAt ?? ""}\u0000${candidate.scale ?? ""}\u0000${String(candidate.score)}`,
    candidate
  ])).values()];
  let invalid = 0;
  const valid = uniqueCandidates.flatMap((candidate): RatingFact[] => {
    const timestamp = optionalTimestamp(candidate.createdAt);
    const score = candidate.score;
    if (timestamp === undefined || score === null || !Number.isFinite(score)) {
      invalid += 1;
      return [];
    }
    const maximum = scaleMaximum(candidate.scale, score);
    if (maximum !== null && (score < 0 || score > maximum)) {
      invalid += 1;
      return [];
    }
    return [{ maximum, positive: positiveRating(score, maximum), score, timestamp }];
  }).sort((left, right) => left.timestamp - right.timestamp);
  return { invalid, ratings: valid };
}

function scaleMaximum(scale: string | undefined, score: number): number | null {
  const normalized = normalizeText(scale);
  const numbers = normalized.match(/\d+(?:[.,]\d+)?/g)?.map((value) => Number(value.replace(",", "."))) ?? [];
  const maximum = numbers.length > 0 ? Math.max(...numbers) : undefined;
  if (maximum !== undefined && maximum > 0) return maximum;
  if (normalized.includes("five") || normalized.includes("star")) return 5;
  if (normalized.includes("ten")) return 10;
  if (normalized.includes("hundred") || normalized.includes("percent")) return 100;
  if (normalized.includes("thumb") || normalized.includes("binary")) return 1;
  if (normalized === "" && score >= 0 && score <= 5) return 5;
  return null;
}

function positiveRating(score: number, maximum: number | null): boolean | null {
  if (maximum === null) return null;
  if (maximum <= 1) return score >= 1;
  if (maximum <= 5) return score >= 4;
  if (maximum <= 10) return score >= 9;
  return score / maximum >= 0.8;
}

function metricsForWindow(facts: readonly ConversationFact[], window: TimestampWindow): SupportOperationsMetrics {
  const incomingFacts = facts.filter((fact) => inWindow(fact.startedAt, window));
  const resolvedFacts = facts.filter((fact) => fact.closeEvents.some((timestamp) => inWindow(timestamp, window)));
  const backlogFacts = facts.filter((fact) => isBacklogAt(fact, window.to));
  return metricsFromEvidence({
    agentTouches: facts.reduce((count, fact) => count + humanAgentTouches(fact.messages, window).length, 0),
    asOf: window.to,
    backlog: backlogFacts.length,
    from: window.from,
    incomingFacts,
    internalComments: facts.reduce((count, fact) => count + fact.messages.filter((message) =>
      message.type === "internal" && !message.isBot && inWindow(message.timestamp, window)
    ).length, 0),
    nextResponses: facts.flatMap((fact) => fact.responses
      .filter((response) => !response.first && inWindow(response.requestedAt, window))
      .map((response) => response.durationSeconds)),
    resolvedFacts,
    waiting: backlogFacts.filter((fact) => isWaitingAt(fact, window.to)).length
  }).metrics;
}

interface WindowMetricEvidence {
  agentTouches: number;
  asOf: number;
  backlog: number;
  from: number;
  incomingFacts: readonly ConversationFact[];
  internalComments: number;
  nextResponses: readonly number[];
  resolvedFacts: readonly ConversationFact[];
  waiting: number;
}

interface WindowMetricComputation {
  metrics: SupportOperationsMetrics;
  samples: {
    csatPositive: number;
  };
}

function metricsFromEvidence(evidence: WindowMetricEvidence): WindowMetricComputation {
  const { asOf, from, incomingFacts, nextResponses, resolvedFacts } = evidence;
  const firstResponses = incomingFacts.flatMap((fact) => {
    const sample = fact.responses.find((response) => response.first);
    return sample ? [sample.durationSeconds] : [];
  });
  const firstResolutionDurations = resolvedFacts.flatMap((fact) => {
    const startedAt = fact.startedAt;
    if (startedAt === undefined) return [];
    const firstClose = fact.closeEvents.find((timestamp) => timestamp >= startedAt);
    return firstClose === undefined || firstClose < from || firstClose >= asOf
      ? []
      : [Math.max(0, (firstClose - startedAt) / 1_000)];
  });
  const fullResolutionDurations = resolvedFacts.flatMap((fact) => {
    if (fact.startedAt === undefined || !isClosedAt(fact, asOf)) return [];
    const lastClose = fact.closeEvents.filter((timestamp) => timestamp < asOf).at(-1);
    return lastClose === undefined ? [] : [Math.max(0, (lastClose - fact.startedAt) / 1_000)];
  });
  const reopenedConversations = resolvedFacts.filter((fact) => reopenedAfterResolution(fact, asOf)).length;
  const oneTouchResolved = resolvedFacts.filter((fact) => {
    const resolutionAt = fact.closeEvents.filter((timestamp) => timestamp < asOf).at(-1);
    if (resolutionAt === undefined || reopenedAfterResolution(fact, asOf)) return false;
    return humanAgentTouches(fact.messages, { from: fact.startedAt ?? 0, to: resolutionAt + 1 }).length === 1;
  }).length;
  const csatRatings = resolvedFacts.flatMap((fact) => {
    const rating = fact.ratings.filter((candidate) => candidate.timestamp < asOf).at(-1);
    return rating ? [rating] : [];
  });
  const knownScaleMaximums = uniqueNumbers(csatRatings.flatMap((rating) => rating.maximum === null ? [] : [rating.maximum]));
  const csatScaleMaximum = knownScaleMaximums.length === 1
    && csatRatings.every((rating) => rating.maximum === knownScaleMaximums[0])
    ? knownScaleMaximums[0]!
    : null;
  const csatAverage = csatRatings.length > 0 && csatScaleMaximum !== null && csatRatings.every((rating) => rating.maximum === csatScaleMaximum)
    ? average(csatRatings.map((rating) => rating.score))
    : null;
  const positiveRatings = csatRatings.flatMap((rating) => rating.positive === null ? [] : [rating.positive]);
  const slaRecorded = incomingFacts.filter((fact) => fact.slaRecorded);
  const slaBreaches = slaRecorded.filter((fact) => fact.slaBreached).length;

  return {
    metrics: {
      agentTouches: evidence.agentTouches,
      backlog: evidence.backlog,
      csatAverage,
      csatCoveragePercent: resolvedFacts.length === 0 ? null : percentage(csatRatings.length, resolvedFacts.length),
      csatPositiveRatePercent: positiveRatings.length === 0 ? null : percentage(positiveRatings.filter(Boolean).length, positiveRatings.length),
      csatSamples: csatRatings.length,
      csatScaleMaximum,
      firstResolutionMedianSeconds: percentile(firstResolutionDurations, 0.5),
      firstResolutionP90Seconds: percentile(firstResolutionDurations, 0.9),
      firstResolutionSamples: firstResolutionDurations.length,
      firstResponseAverageSeconds: firstResponses.length === 0 ? null : average(firstResponses),
      firstResponseCoveragePercent: incomingFacts.length === 0 ? null : percentage(firstResponses.length, incomingFacts.length),
      firstResponseMedianSeconds: percentile(firstResponses, 0.5),
      firstResponseP90Seconds: percentile(firstResponses, 0.9),
      firstResponseSamples: firstResponses.length,
      fullResolutionMedianSeconds: percentile(fullResolutionDurations, 0.5),
      fullResolutionP90Seconds: percentile(fullResolutionDurations, 0.9),
      fullResolutionSamples: fullResolutionDurations.length,
      incoming: incomingFacts.length,
      internalComments: evidence.internalComments,
      nextResponseMedianSeconds: percentile(nextResponses, 0.5),
      nextResponseP90Seconds: percentile(nextResponses, 0.9),
      nextResponseSamples: nextResponses.length,
      oneTouchResolutionCount: oneTouchResolved,
      oneTouchResolutionPercent: resolvedFacts.length === 0 ? null : percentage(oneTouchResolved, resolvedFacts.length),
      oneTouchResolutionSamples: resolvedFacts.length,
      reopenRatePercent: resolvedFacts.length === 0 ? null : percentage(reopenedConversations, resolvedFacts.length),
      reopenedConversations,
      resolved: resolvedFacts.length,
      slaAttainmentPercent: slaRecorded.length === 0 ? null : percentage(slaRecorded.length - slaBreaches, slaRecorded.length),
      slaBreaches,
      slaRecordedSamples: slaRecorded.length,
      waiting: evidence.waiting
    },
    samples: {
      csatPositive: positiveRatings.length
    }
  };
}

function humanAgentTouches(messages: readonly NormalizedMessage[], window: TimestampWindow): NormalizedMessage[] {
  return messages.filter((message) => message.type === "public"
    && message.side === "agent"
    && !message.isBot
    && inWindow(message.timestamp, window));
}

function isBacklogAt(fact: ConversationFact, timestamp: number): boolean {
  return fact.startedAt !== undefined && fact.startedAt < timestamp && !isClosedAt(fact, timestamp);
}

function isClosedAt(fact: ConversationFact, timestamp: number): boolean {
  const transitions = [
    ...fact.closeEvents.map((occurredAt) => ({ closed: true, occurredAt })),
    ...fact.reopenEvents.map((occurredAt) => ({ closed: false, occurredAt }))
  ].filter((transition) => transition.occurredAt < timestamp)
    .sort((left, right) => left.occurredAt - right.occurredAt || Number(left.closed) - Number(right.closed));
  const latestTransition = transitions.at(-1);
  if (latestTransition) return latestTransition.closed;
  return fact.statusBaseline && fact.statusBaseline.timestamp <= timestamp
    ? fact.statusBaseline.closed
    : false;
}

function isWaitingAt(fact: ConversationFact, timestamp: number): boolean {
  let waiting = false;
  for (const message of fact.messages) {
    if (message.timestamp >= timestamp || message.type !== "public") continue;
    if (message.side === "client") waiting = true;
    if (message.side === "agent" && !message.isBot) waiting = false;
  }
  return waiting;
}

function reopenedAfterResolution(fact: ConversationFact, asOf: number): boolean {
  const firstClose = fact.closeEvents.find((timestamp) => timestamp < asOf);
  return firstClose !== undefined && fact.reopenEvents.some((timestamp) => timestamp > firstClose && timestamp < asOf);
}

function buildBacklogAge(facts: readonly ConversationFact[], asOf: number): SupportOperationsBacklogAgeBucket[] {
  const ages = facts.flatMap((fact) => isBacklogAt(fact, asOf) && fact.startedAt !== undefined
    ? [Math.max(0, (asOf - fact.startedAt) / 1_000)]
    : []);
  return BACKLOG_AGE_RANGES.map((range) => {
    const count = ages.filter((age) => age >= range.fromSeconds && (range.toSeconds === null || age < range.toSeconds)).length;
    return {
      ...range,
      count,
      sharePercent: ages.length === 0 ? null : percentage(count, ages.length)
    };
  });
}

function buildBreakdowns(facts: readonly ConversationFact[], window: TimestampWindow): SupportOperationsWorkspace["breakdowns"] {
  return {
    channels: categoricalBreakdown(facts, window, (fact) => ({ key: normalizeText(fact.channel), label: fact.channel })),
    operators: operatorBreakdown(facts, window),
    topics: categoricalBreakdown(facts, window, (fact) => ({ key: normalizeText(fact.topic), label: fact.topic }))
  };
}

function categoricalBreakdown(
  facts: readonly ConversationFact[],
  window: TimestampWindow,
  category: (fact: ConversationFact) => { key: string; label: string }
): SupportOperationsBreakdownItem[] {
  const grouped = new Map<string, { facts: ConversationFact[]; label: string }>();
  for (const fact of facts) {
    const item = category(fact);
    const current = grouped.get(item.key) ?? { facts: [], label: item.label };
    current.facts.push(fact);
    grouped.set(item.key, current);
  }
  const items = [...grouped.entries()].map(([key, group]) => {
    const metrics = metricsForWindow(group.facts, window);
    return {
      agentTouches: metrics.agentTouches,
      backlog: metrics.backlog,
      incoming: metrics.incoming,
      key,
      label: group.label,
      resolved: metrics.resolved,
      sharePercent: null,
      waiting: metrics.waiting
    };
  }).filter((item) => item.incoming + item.resolved + item.backlog + item.agentTouches > 0);
  const totalIncoming = items.reduce((sum, item) => sum + item.incoming, 0);
  return items.map((item) => ({
    ...item,
    sharePercent: totalIncoming === 0 ? null : percentage(item.incoming, totalIncoming)
  })).sort((left, right) => right.incoming - left.incoming || right.backlog - left.backlog || compareStrings(left.label, right.label));
}

function operatorBreakdown(facts: readonly ConversationFact[], window: TimestampWindow): SupportOperationsOperatorWorkload[] {
  const operators = new Map<string, { label: string; operatorId?: string }>();
  for (const fact of facts) {
    if (fact.operatorId || fact.operatorName) {
      const key = fact.operatorId ?? `name:${normalizeText(fact.operatorName)}`;
      operators.set(key, { label: fact.operatorName ?? fact.operatorId ?? "unassigned", ...(fact.operatorId ? { operatorId: fact.operatorId } : {}) });
    }
    for (const message of fact.messages) {
      if ((message.side === "agent" || message.type === "internal") && !message.isBot && (message.operatorId || message.operatorName)) {
        const key = message.operatorId ?? `name:${normalizeText(message.operatorName)}`;
        operators.set(key, { label: message.operatorName ?? message.operatorId ?? "unassigned", ...(message.operatorId ? { operatorId: message.operatorId } : {}) });
      }
    }
  }
  const items = [...operators.entries()].map(([key, operator]) => {
    const assignedFacts = facts.filter((fact) => operator.operatorId ? fact.operatorId === operator.operatorId : fact.operatorName === operator.label);
    const touches = facts.flatMap((fact) => humanAgentTouches(fact.messages, window).filter((message) =>
      operator.operatorId ? (message.operatorId ?? fact.operatorId) === operator.operatorId : (message.operatorName ?? fact.operatorName) === operator.label
    ));
    const internalComments = facts.reduce((count, fact) => count + fact.messages.filter((message) =>
      message.type === "internal" && !message.isBot && inWindow(message.timestamp, window)
      && (operator.operatorId ? (message.operatorId ?? fact.operatorId) === operator.operatorId : (message.operatorName ?? fact.operatorName) === operator.label)
    ).length, 0);
    const responseDurations = assignedFacts.flatMap((fact) => fact.responses
      .filter((response) => response.first && inWindow(fact.startedAt, window))
      .map((response) => response.durationSeconds));
    return {
      agentTouches: touches.length,
      assignedBacklog: assignedFacts.filter((fact) => isBacklogAt(fact, window.to)).length,
      firstResponseMedianSeconds: percentile(responseDurations, 0.5),
      internalComments,
      key,
      label: operator.label,
      resolved: assignedFacts.filter((fact) => fact.closeEvents.some((timestamp) => inWindow(timestamp, window))).length,
      workloadSharePercent: null
    };
  }).filter((item) => item.agentTouches + item.assignedBacklog + item.resolved + item.internalComments > 0);
  const totalTouches = items.reduce((sum, item) => sum + item.agentTouches, 0);
  return items.map((item) => ({
    ...item,
    workloadSharePercent: totalTouches === 0 ? null : percentage(item.agentTouches, totalTouches)
  })).sort((left, right) => right.agentTouches - left.agentTouches || right.assignedBacklog - left.assignedBacklog || compareStrings(left.label, right.label));
}

function buildTimeSeries(
  facts: readonly ConversationFact[],
  period: SupportOperationsPeriod,
  windows: ReportWindows,
  timezoneOffsetMinutes: number
): SupportOperationsTimeSeries {
  const logicalDurationDays = (windows.currentLogicalTo - windows.current.from) / DAY_MS;
  const longCustom = period === "custom" && logicalDurationDays > LONG_CUSTOM_DAYS;
  const granularity: SupportOperationsTimeSeries["granularity"] = period === "today" || period === "yesterday"
    ? "hour"
    : longCustom ? "week" : "day";
  const step = granularity === "hour" ? HOUR_MS : granularity === "week" ? 7 * DAY_MS : DAY_MS;
  return {
    aggregated: longCustom,
    aggregationReason: longCustom ? "custom_range_exceeds_93_days" : null,
    current: seriesForWindow(facts, windows.current, step),
    granularity,
    kpi: buildKpiTimeSeries(facts, windows, timezoneOffsetMinutes),
    previous: seriesForWindow(facts, windows.previous, step)
  };
}

const KPI_TIME_SERIES_GRAINS: readonly SupportOperationsKpiTimeSeriesGrain[] = ["day", "week", "month"];

function buildKpiTimeSeries(
  facts: readonly ConversationFact[],
  windows: ReportWindows,
  timezoneOffsetMinutes: number
): SupportOperationsKpiTimeSeries {
  return {
    availableGrains: [...KPI_TIME_SERIES_GRAINS],
    byGrain: Object.fromEntries(KPI_TIME_SERIES_GRAINS.map((grain) => [grain, {
      current: kpiSeriesForWindow(facts, windows.current, grain, timezoneOffsetMinutes),
      previous: kpiSeriesForWindow(facts, windows.previous, grain, timezoneOffsetMinutes)
    }])) as Record<SupportOperationsKpiTimeSeriesGrain, SupportOperationsKpiTimeSeriesWindow>
  };
}

function kpiSeriesForWindow(
  facts: readonly ConversationFact[],
  window: TimestampWindow,
  grain: SupportOperationsKpiTimeSeriesGrain,
  timezoneOffsetMinutes: number
): SupportOperationsKpiTimeSeriesPoint[] {
  const buckets: KpiBucketAccumulator[] = [];
  for (let from = window.from; from < window.to;) {
    const nextBoundary = nextCalendarBoundary(from, grain, timezoneOffsetMinutes);
    const to = Math.min(window.to, nextBoundary);
    if (to <= from) throw new RangeError(`Unable to advance ${grain} KPI time-series boundary.`);
    buckets.push(emptyKpiBucket(from, to));
    from = to;
  }
  for (const fact of facts) addFactToKpiBuckets(fact, buckets);
  return buckets.map((bucket) => {
    const computation = metricsFromEvidence({
      agentTouches: bucket.agentTouches,
      asOf: bucket.to,
      backlog: bucket.backlog,
      from: bucket.from,
      incomingFacts: [...bucket.incomingFacts],
      internalComments: bucket.internalComments,
      nextResponses: bucket.nextResponses,
      resolvedFacts: [...bucket.resolvedFacts],
      waiting: bucket.waiting
    });
    return {
      from: new Date(bucket.from).toISOString(),
      metrics: kpiPointMetrics(computation),
      to: new Date(bucket.to).toISOString()
    };
  });
}

interface KpiBucketAccumulator extends TimestampWindow {
  agentTouches: number;
  backlog: number;
  incomingFacts: Set<ConversationFact>;
  internalComments: number;
  nextResponses: number[];
  resolvedFacts: Set<ConversationFact>;
  waiting: number;
}

function emptyKpiBucket(from: number, to: number): KpiBucketAccumulator {
  return {
    agentTouches: 0,
    backlog: 0,
    from,
    incomingFacts: new Set(),
    internalComments: 0,
    nextResponses: [],
    resolvedFacts: new Set(),
    to,
    waiting: 0
  };
}

function addFactToKpiBuckets(fact: ConversationFact, buckets: KpiBucketAccumulator[]): void {
  const incomingIndex = bucketIndexForTimestamp(buckets, fact.startedAt);
  if (incomingIndex !== -1) buckets[incomingIndex]!.incomingFacts.add(fact);
  for (const closedAt of fact.closeEvents) {
    const index = bucketIndexForTimestamp(buckets, closedAt);
    if (index !== -1) buckets[index]!.resolvedFacts.add(fact);
  }
  for (const response of fact.responses) {
    if (response.first) continue;
    const index = bucketIndexForTimestamp(buckets, response.requestedAt);
    if (index !== -1) buckets[index]!.nextResponses.push(response.durationSeconds);
  }
  for (const message of fact.messages) {
    const index = bucketIndexForTimestamp(buckets, message.timestamp);
    if (index === -1 || message.isBot) continue;
    if (message.type === "public" && message.side === "agent") buckets[index]!.agentTouches += 1;
    if (message.type === "internal") buckets[index]!.internalComments += 1;
  }
  addFactSnapshotsToKpiBuckets(fact, buckets);
}

function addFactSnapshotsToKpiBuckets(fact: ConversationFact, buckets: KpiBucketAccumulator[]): void {
  if (buckets.length === 0 || fact.startedAt === undefined) return;
  const transitions = [
    ...fact.closeEvents.map((timestamp) => ({ closed: true, timestamp })),
    ...fact.reopenEvents.map((timestamp) => ({ closed: false, timestamp }))
  ].sort((left, right) => left.timestamp - right.timestamp || Number(left.closed) - Number(right.closed));
  let closed = false;
  let hasTransition = false;
  let transitionIndex = 0;
  let messageIndex = 0;
  let waiting = false;
  for (const bucket of buckets) {
    while (transitionIndex < transitions.length && transitions[transitionIndex]!.timestamp < bucket.to) {
      closed = transitions[transitionIndex]!.closed;
      hasTransition = true;
      transitionIndex += 1;
    }
    while (messageIndex < fact.messages.length && fact.messages[messageIndex]!.timestamp < bucket.to) {
      const message = fact.messages[messageIndex]!;
      if (message.type === "public" && message.side === "client") waiting = true;
      if (message.type === "public" && message.side === "agent" && !message.isBot) waiting = false;
      messageIndex += 1;
    }
    const baselineClosed = !hasTransition
      && fact.statusBaseline !== undefined
      && fact.statusBaseline.timestamp <= bucket.to
      && fact.statusBaseline.closed;
    if (fact.startedAt < bucket.to && !(hasTransition ? closed : baselineClosed)) {
      bucket.backlog += 1;
      if (waiting) bucket.waiting += 1;
    }
  }
}

function bucketIndexForTimestamp(
  buckets: readonly TimestampWindow[],
  timestamp: number | undefined
): number {
  if (timestamp === undefined || buckets.length === 0
    || timestamp < buckets[0]!.from || timestamp >= buckets.at(-1)!.to) return -1;
  let low = 0;
  let high = buckets.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const bucket = buckets[middle]!;
    if (timestamp < bucket.from) high = middle - 1;
    else if (timestamp >= bucket.to) low = middle + 1;
    else return middle;
  }
  return -1;
}

function nextCalendarBoundary(
  timestamp: number,
  grain: SupportOperationsKpiTimeSeriesGrain,
  timezoneOffsetMinutes: number
): number {
  const offsetMs = timezoneOffsetMinutes * 60_000;
  const local = new Date(timestamp + offsetMs);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  if (grain === "day") return Date.UTC(year, month, day + 1) - offsetMs;
  if (grain === "month") return Date.UTC(year, month + 1, 1) - offsetMs;
  const weekday = local.getUTCDay();
  const daysUntilMonday = weekday === 0 ? 1 : 8 - weekday;
  return Date.UTC(year, month, day + daysUntilMonday) - offsetMs;
}

function kpiPointMetrics(computation: WindowMetricComputation): SupportOperationsKpiTimeSeriesPoint["metrics"] {
  const { metrics } = computation;
  return {
    agentTouches: timeSeriesMetric(metrics.agentTouches, metrics.agentTouches),
    backlog: timeSeriesMetric(metrics.backlog, metrics.backlog),
    csatAverage: timeSeriesMetric(metrics.csatAverage, metrics.csatSamples, metrics.csatScaleMaximum),
    csatCoveragePercent: timeSeriesMetric(metrics.csatCoveragePercent, metrics.resolved),
    csatPositiveRatePercent: timeSeriesMetric(metrics.csatPositiveRatePercent, computation.samples.csatPositive),
    firstResolutionP50Seconds: timeSeriesMetric(metrics.firstResolutionMedianSeconds, metrics.firstResolutionSamples),
    firstResolutionP90Seconds: timeSeriesMetric(metrics.firstResolutionP90Seconds, metrics.firstResolutionSamples),
    firstResponseCoveragePercent: timeSeriesMetric(metrics.firstResponseCoveragePercent, metrics.incoming),
    firstResponseP50Seconds: timeSeriesMetric(metrics.firstResponseMedianSeconds, metrics.firstResponseSamples),
    firstResponseP90Seconds: timeSeriesMetric(metrics.firstResponseP90Seconds, metrics.firstResponseSamples),
    fullResolutionP50Seconds: timeSeriesMetric(metrics.fullResolutionMedianSeconds, metrics.fullResolutionSamples),
    fullResolutionP90Seconds: timeSeriesMetric(metrics.fullResolutionP90Seconds, metrics.fullResolutionSamples),
    incoming: timeSeriesMetric(metrics.incoming, metrics.incoming),
    internalComments: timeSeriesMetric(metrics.internalComments, metrics.internalComments),
    nextResponseP50Seconds: timeSeriesMetric(metrics.nextResponseMedianSeconds, metrics.nextResponseSamples),
    nextResponseP90Seconds: timeSeriesMetric(metrics.nextResponseP90Seconds, metrics.nextResponseSamples),
    oneTouchResolutionPercent: timeSeriesMetric(metrics.oneTouchResolutionPercent, metrics.oneTouchResolutionSamples),
    reopenRatePercent: timeSeriesMetric(metrics.reopenRatePercent, metrics.resolved),
    resolved: timeSeriesMetric(metrics.resolved, metrics.resolved),
    responseCoveragePercent: timeSeriesMetric(metrics.firstResponseCoveragePercent, metrics.incoming),
    slaAttainmentPercent: timeSeriesMetric(metrics.slaAttainmentPercent, metrics.slaRecordedSamples),
    slaBreaches: timeSeriesMetric(metrics.slaBreaches, metrics.slaBreaches),
    waiting: timeSeriesMetric(metrics.waiting, metrics.waiting)
  };
}

function timeSeriesMetric(
  value: number | null,
  samples: number,
  scaleMaximum?: number | null
): SupportOperationsKpiTimeSeriesMetric {
  return { samples, ...(scaleMaximum === undefined ? {} : { scaleMaximum }), value };
}

function seriesForWindow(facts: readonly ConversationFact[], window: TimestampWindow, step: number): SupportOperationsTimeSeriesPoint[] {
  const points: SupportOperationsTimeSeriesPoint[] = [];
  for (let from = window.from; from < window.to; from += step) {
    const bucket = { from, to: Math.min(window.to, from + step) };
    const metrics = metricsForWindow(facts, bucket);
    points.push({
      agentTouches: metrics.agentTouches,
      backlog: metrics.backlog,
      firstResponseMedianSeconds: metrics.firstResponseMedianSeconds,
      from: new Date(bucket.from).toISOString(),
      incoming: metrics.incoming,
      resolved: metrics.resolved,
      slaBreaches: metrics.slaBreaches,
      to: new Date(bucket.to).toISOString(),
      waiting: metrics.waiting
    });
  }
  return points;
}

function compareMetrics(
  current: SupportOperationsMetrics,
  previous: SupportOperationsMetrics
): Record<SupportOperationsMetricKey, SupportOperationsMetricComparison> {
  return Object.fromEntries((Object.keys(current) as SupportOperationsMetricKey[]).map((key) => {
    const currentValue = current[key];
    const previousValue = previous[key];
    const comparable = currentValue !== null && previousValue !== null;
    const absolute = comparable ? round(currentValue - previousValue, 1) : null;
    const percent = !comparable || previousValue === 0 ? null : round((currentValue - previousValue) / Math.abs(previousValue) * 100, 1);
    return [key, { absolute, comparable, percent }];
  })) as Record<SupportOperationsMetricKey, SupportOperationsMetricComparison>;
}

function buildInsights(
  current: SupportOperationsMetrics,
  previous: SupportOperationsMetrics,
  operators: readonly SupportOperationsOperatorWorkload[]
): SupportOperationsInsight[] {
  const insights: SupportOperationsInsight[] = [];
  const backlogChange = changePercent(current.backlog, previous.backlog);
  if (current.backlog > previous.backlog && (backlogChange === null || backlogChange >= 10)) {
    insights.push({
      changePercent: backlogChange,
      code: "backlog_growth",
      current: current.backlog,
      metric: "backlog",
      previous: previous.backlog,
      sampleSize: current.backlog,
      severity: backlogChange !== null && backlogChange >= 25 ? "critical" : "warning",
      threshold: 10
    });
  }
  if (current.slaBreaches > 0) {
    insights.push({
      changePercent: changePercent(current.slaBreaches, previous.slaBreaches),
      code: "sla_breaches",
      current: current.slaBreaches,
      metric: "slaBreaches",
      previous: previous.slaBreaches,
      sampleSize: current.slaRecordedSamples,
      severity: current.slaAttainmentPercent !== null && current.slaAttainmentPercent < 90 ? "critical" : "warning",
      threshold: 0
    });
  }
  if (current.firstResponseP90Seconds !== null && previous.firstResponseP90Seconds !== null
    && current.firstResponseP90Seconds > previous.firstResponseP90Seconds * 1.2) {
    insights.push({
      changePercent: changePercent(current.firstResponseP90Seconds, previous.firstResponseP90Seconds),
      code: "first_response_degradation",
      current: current.firstResponseP90Seconds,
      metric: "firstResponseP90Seconds",
      previous: previous.firstResponseP90Seconds,
      sampleSize: current.firstResponseSamples,
      severity: "warning",
      threshold: 20
    });
  }
  if (current.incoming > 0 && (current.firstResponseCoveragePercent ?? 0) < 80) {
    insights.push({
      changePercent: changePercent(current.firstResponseCoveragePercent ?? 0, previous.firstResponseCoveragePercent ?? 0),
      code: "first_response_low_coverage",
      current: current.firstResponseCoveragePercent ?? 0,
      metric: "firstResponseCoveragePercent",
      previous: previous.firstResponseCoveragePercent,
      sampleSize: current.incoming,
      severity: "info",
      threshold: 80
    });
  }
  if (current.csatSamples >= 5 && current.csatPositiveRatePercent !== null && current.csatPositiveRatePercent < 80) {
    insights.push({
      changePercent: changePercent(current.csatPositiveRatePercent, previous.csatPositiveRatePercent ?? 0),
      code: "csat_risk",
      current: current.csatPositiveRatePercent,
      metric: "csatPositiveRatePercent",
      previous: previous.csatPositiveRatePercent,
      sampleSize: current.csatSamples,
      severity: current.csatPositiveRatePercent < 60 ? "critical" : "warning",
      threshold: 80
    });
  }
  const totalTouches = operators.reduce((sum, operator) => sum + operator.agentTouches, 0);
  if (operators.length >= 2 && totalTouches >= 5) {
    const maximum = Math.max(...operators.map((operator) => operator.agentTouches));
    const averageTouches = totalTouches / operators.length;
    const imbalancePercent = averageTouches === 0 ? 0 : round((maximum / averageTouches - 1) * 100, 1);
    if (imbalancePercent >= 100) {
      insights.push({
        changePercent: null,
        code: "workload_imbalance",
        current: maximum,
        metric: "operatorWorkload",
        previous: null,
        sampleSize: totalTouches,
        severity: "warning",
        threshold: 100
      });
    }
  }
  const priority: Record<SupportOperationsInsight["severity"], number> = { critical: 0, warning: 1, info: 2 };
  return insights.sort((left, right) => priority[left.severity] - priority[right.severity] || compareStrings(left.code, right.code));
}

function buildWindows(
  period: SupportOperationsPeriod,
  now: number,
  offsetMinutes: number,
  dateFrom?: string,
  dateTo?: string
): ReportWindows {
  const today = startOfDay(now, offsetMinutes);
  let from: number;
  let logicalTo: number;
  if (period === "custom") {
    const customFrom = parseDateStart(dateFrom, offsetMinutes);
    const customTo = parseDateStart(dateTo, offsetMinutes);
    if (customFrom === undefined || customTo === undefined || customTo < customFrom) {
      throw new RangeError("Custom support operations date range is invalid.");
    }
    from = customFrom;
    logicalTo = customTo + DAY_MS;
    if ((logicalTo - from) / DAY_MS > MAX_CUSTOM_DAYS) {
      throw new RangeError(`Custom support operations date range cannot exceed ${MAX_CUSTOM_DAYS} days.`);
    }
  } else if (period === "today") {
    from = today;
    logicalTo = today + DAY_MS;
  } else if (period === "yesterday") {
    from = today - DAY_MS;
    logicalTo = today;
  } else if (period === "7days") {
    from = today - 6 * DAY_MS;
    logicalTo = today + DAY_MS;
  } else {
    from = today - 29 * DAY_MS;
    logicalTo = today + DAY_MS;
  }
  if (from > now) throw new RangeError("Support operations date range cannot start in the future.");
  const currentTo = Math.min(logicalTo, now);
  if (currentTo <= from) throw new RangeError("Support operations date range has no elapsed time.");
  const logicalDuration = logicalTo - from;
  const elapsedDuration = currentTo - from;
  const previousFrom = from - logicalDuration;
  return {
    current: { from, to: currentTo },
    currentLogicalTo: logicalTo,
    isCurrentWindowPartial: currentTo < logicalTo,
    previous: { from: previousFrom, to: previousFrom + elapsedDuration }
  };
}

function normalizePeriod(period: SupportOperationsWorkspaceOptions["period"]): SupportOperationsPeriod {
  const normalized = normalizeText(period ?? "today").replaceAll("_", "");
  if (normalized === "today" || normalized === "сегодня") return "today";
  if (normalized === "yesterday" || normalized === "вчера") return "yesterday";
  if (normalized === "7days" || normalized === "7 дней") return "7days";
  if (normalized === "30days" || normalized === "30 дней") return "30days";
  if (normalized === "custom" || normalized === "свой период") return "custom";
  throw new RangeError(`Unsupported support operations period: ${String(period)}`);
}

function normalizeTimezoneOffset(value: number | undefined): number {
  const offset = value ?? 0;
  if (!Number.isFinite(offset) || !Number.isInteger(offset) || Math.abs(offset) > 14 * 60) {
    throw new RangeError("timezoneOffsetMinutes must be an integer between -840 and 840.");
  }
  return offset;
}

function parseDateStart(value: string | undefined, offsetMinutes: number): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return undefined;
  return utc - offsetMinutes * 60_000;
}

function startOfDay(timestamp: number, offsetMinutes: number): number {
  const shifted = new Date(timestamp + offsetMinutes * 60_000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - offsetMinutes * 60_000;
}

function isCloseEvent(event: SourceLifecycleEvent): boolean {
  const type = normalizedEventType(event.eventType);
  return type === "conversation.closed" || type === "conversation.resolved" || type === "resolution.recorded"
    || (type === "status.changed" && isClosedStatus(event.data?.toStatus));
}

function isReopenEvent(event: SourceLifecycleEvent): boolean {
  const type = normalizedEventType(event.eventType);
  if (type === "conversation.reopened" || type === "resolution.reopened") return true;
  return type === "status.changed"
    && isClosedStatus(event.data?.fromStatus)
    && typeof event.data?.toStatus === "string"
    && !isClosedStatus(event.data.toStatus);
}

function isSlaBreachEvent(event: SourceLifecycleEvent): boolean {
  const type = normalizedEventType(event.eventType);
  return type === "sla.overdue" || type === "sla.breached" || type === "sla.violated"
    || booleanValue(event.data?.breached)
    || BREACHED_SLA_TONES.has(normalizeText(event.data?.status));
}

function isSlaAttainedEvent(event: SourceLifecycleEvent): boolean {
  const type = normalizedEventType(event.eventType);
  return type === "sla.met" || type === "sla.achieved" || type === "sla.attained"
    || ATTAINED_SLA_TONES.has(normalizeText(event.data?.status));
}

function isClosedStatus(value: unknown): boolean {
  return CLOSED_STATUSES.has(normalizeText(value));
}

function explicitBotMarker(value: Record<string, unknown>): boolean {
  if (value.isBot === true || value.bot === true) return true;
  if ([value.actorType, value.authorType, value.senderType, value.source]
    .some((marker) => ["ai", "automation", "bot", "robot"].includes(normalizeText(marker)))) return true;
  const author = normalizeText(value.author);
  // Persisted bot replies currently carry only ConversationMessage.author;
  // use the exact emitted forms and avoid classifying human names such as
  // "Боткин" as automation.
  return author === "бот" || /^бот\s+«[^»]+»$/.test(author);
}

function normalizedEventType(value: string): string {
  return normalizeText(value).replaceAll("_", ".");
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("ru-RU") : "";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean {
  return value === true || normalizeText(value) === "true";
}

function optionalTimestamp(value: Date | number | string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function requiredTimestamp(value: Date | number | string, name: string): number {
  const timestamp = optionalTimestamp(value);
  if (timestamp === undefined) throw new RangeError(`${name} must be a valid date.`);
  return timestamp;
}

function inWindow(timestamp: number | undefined, window: TimestampWindow): boolean {
  return timestamp !== undefined && timestamp >= window.from && timestamp < window.to;
}

function percentile(values: readonly number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) return round(sorted[0]!, 1);
  const position = (sorted.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const interpolated = sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
  return round(interpolated, 1);
}

function average(values: readonly number[]): number {
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
}

function percentage(numerator: number, denominator: number): number {
  return round(numerator / denominator * 100, 1);
}

function changePercent(current: number, previous: number): number | null {
  return previous === 0 ? null : round((current - previous) / Math.abs(previous) * 100, 1);
}

function round(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function byTimestamp<T extends { timestamp: number }>(left: T, right: T): number {
  return left.timestamp - right.timestamp;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function serializeWindow(window: TimestampWindow): SupportOperationsWindow {
  return { from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString() };
}

const METRIC_DEFINITIONS: readonly SupportOperationsMetricDefinition[] = [
  definition("incoming", "count", "Distinct conversations whose known creation timestamp is inside the window.", ["createdAt", "conversation.created"], ["Rows with no valid creation timestamp are excluded."]),
  definition("resolved", "count", "Distinct conversations with at least one recorded close or resolution transition inside the window.", ["status.changed", "conversation.closed", "conversation.resolved", "closedAt", "updatedAt"], ["updatedAt is used only as a fallback for rows currently marked closed."]),
  definition("backlog", "count", "Conversations created before the snapshot and not in a recorded closed state at the snapshot.", ["createdAt", "status lifecycle", "closedAt"], ["Historical backlog is exact only when lifecycle transitions are available."]),
  definition("waiting", "count", "Open backlog conversations whose latest public human-visible turn at the snapshot is from the client.", ["messages.side", "messages.type", "message lifecycle"], ["Bot replies do not clear the human-support waiting state."]),
  definition("slaAttainmentPercent", "percent", "100 × (recorded SLA samples − breached samples) / recorded SLA samples.", ["sla lifecycle", "slaTone"], ["Returns null without recorded SLA evidence; slaTone is a current-state fallback."]),
  definition("slaBreaches", "count", "Incoming conversations with an explicit SLA breach record or breached SLA tone.", ["sla.overdue", "sla.breached", "slaTone"], ["Deduplicated by conversation, not breach event count."]),
  definition("slaRecordedSamples", "count", "Incoming conversations with explicit attained or breached SLA evidence.", ["sla lifecycle", "slaTone"], ["At-risk or unknown tones are excluded."]),
  definition("firstResponseAverageSeconds", "seconds", "Arithmetic mean from first client message to first subsequent public human-agent reply for incoming conversations.", ["messages", "message.received", "message.sent"], ["Internal, event, CSAT and explicitly bot-authored messages are excluded."]),
  definition("firstResponseMedianSeconds", "seconds", "P50 using linear interpolation over recorded first-response durations.", ["messages", "message lifecycle"], ["Returns null without a recorded human response."]),
  definition("firstResponseP90Seconds", "seconds", "P90 using linear interpolation over recorded first-response durations.", ["messages", "message lifecycle"], ["Small samples can make the percentile volatile."]),
  definition("firstResponseSamples", "count", "Incoming conversations with a measurable first human response.", ["messages", "message lifecycle"], []),
  definition("firstResponseCoveragePercent", "percent", "100 × measurable first responses / incoming conversations.", ["createdAt", "messages"], ["A low value signals incomplete response instrumentation or still-unanswered conversations."]),
  definition("nextResponseMedianSeconds", "seconds", "P50 from each non-first client turn begun in the window to the next public human-agent reply.", ["messages", "message lifecycle"], ["Consecutive client messages before a reply form one client turn."]),
  definition("nextResponseP90Seconds", "seconds", "P90 from each non-first client turn begun in the window to the next public human-agent reply.", ["messages", "message lifecycle"], ["Unanswered turns are not durations and remain visible through waiting/backlog metrics."]),
  definition("nextResponseSamples", "count", "Measured non-first client turns begun inside the window.", ["messages", "message lifecycle"], []),
  definition("firstResolutionMedianSeconds", "seconds", "P50 from known conversation creation to its first recorded resolution for conversations resolved in the window.", ["createdAt", "resolution lifecycle"], ["Returns null when creation or resolution timestamps are unavailable."]),
  definition("firstResolutionP90Seconds", "seconds", "P90 from known creation to first recorded resolution for conversations resolved in the window.", ["createdAt", "resolution lifecycle"], []),
  definition("firstResolutionSamples", "count", "Resolved conversations with measurable creation and first-resolution timestamps.", ["createdAt", "resolution lifecycle"], []),
  definition("fullResolutionMedianSeconds", "seconds", "P50 from creation to the latest resolution before the snapshot, for resolved conversations still closed at the snapshot.", ["createdAt", "resolution and reopen lifecycle"], ["Reopened conversations still open at the snapshot are excluded."]),
  definition("fullResolutionP90Seconds", "seconds", "P90 from creation to latest durable resolution before the snapshot.", ["createdAt", "resolution and reopen lifecycle"], []),
  definition("fullResolutionSamples", "count", "Resolved conversations with a measurable durable resolution at the snapshot.", ["resolution and reopen lifecycle"], []),
  definition("reopenedConversations", "count", "Resolved-window conversations with a later recorded reopen transition before the snapshot.", ["conversation.reopened", "status.changed"], ["Requires reopen lifecycle evidence."]),
  definition("reopenRatePercent", "percent", "100 × reopened conversations / distinct conversations resolved in the window.", ["resolution and reopen lifecycle"], ["Returns null when no conversations were resolved."]),
  definition("oneTouchResolutionCount", "count", "Resolved-window conversations with exactly one public human-agent message before resolution and no recorded reopen.", ["messages", "resolution lifecycle"], ["This is an operational proxy, not proof that the issue required only one interaction."]),
  definition("oneTouchResolutionPercent", "percent", "100 × one-touch resolution proxy count / distinct conversations resolved in the window.", ["messages", "resolution lifecycle"], ["Returns null when no conversations were resolved."]),
  definition("oneTouchResolutionSamples", "count", "Distinct conversations resolved in the window used as the one-touch denominator.", ["resolution lifecycle"], []),
  definition("csatAverage", "score", "Arithmetic mean of latest valid ratings attached to resolved-window conversations when all samples use one scale.", ["qualityAssessment", "rating", "ratings", "csat lifecycle"], ["Returns null for missing or mixed rating scales."]),
  definition("csatPositiveRatePercent", "percent", "100 × positive valid ratings / valid ratings with a known scale.", ["qualityAssessment", "rating", "ratings"], ["Positive means ≥4/5, ≥9/10, positive binary, or ≥80% for larger scales."]),
  definition("csatSamples", "count", "Resolved-window conversations with a latest valid rating recorded before the snapshot.", ["qualityAssessment", "rating", "ratings"], ["At most one latest rating per conversation is used."]),
  definition("csatCoveragePercent", "percent", "100 × rated resolved-window conversations / distinct conversations resolved in the window.", ["ratings", "resolution lifecycle"], ["This is a cohort coverage proxy because survey-offer records are not guaranteed in the source row."]),
  definition("csatScaleMaximum", "score", "Common maximum of the rating scale when every CSAT sample uses the same known scale.", ["rating.scale"], ["Returns null for unknown or mixed scales."]),
  definition("internalComments", "count", "Non-bot internal messages created inside the window.", ["messages.type=internal", "message.internal"], ["Depends on author bot markers when automation can write internal messages."]),
  definition("agentTouches", "count", "Public, non-bot human-agent messages created inside the window.", ["messages.side=agent", "message.sent"], ["Counts messages, not distinct conversations or work sessions."])
];

function definition(
  key: SupportOperationsMetricKey,
  unit: SupportOperationsMetricDefinition["unit"],
  formula: string,
  source: string[],
  caveats: string[]
): SupportOperationsMetricDefinition {
  return { caveats, formula, key, source, unit };
}
