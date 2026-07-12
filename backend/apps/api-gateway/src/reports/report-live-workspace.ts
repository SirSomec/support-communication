import type { ConversationMessage, ConversationRecord } from "../conversation/conversation.types.js";

export type LiveReportPeriod = "today" | "yesterday" | "7days" | "30days";
export type LiveReportTone = "danger" | "ok" | "warn";

export type LiveReportMessage = ConversationMessage;

export interface LiveReportLifecycleEvent {
  data?: Record<string, unknown>;
  eventType: string;
  occurredAt: string;
}

export interface LiveReportConversation extends Pick<ConversationRecord, "channel" | "messages" | "slaTone" | "status" | "updatedAt"> {
  closedAt?: string;
  createdAt?: string;
  lifecycleEvents?: LiveReportLifecycleEvent[];
}

export interface LiveReportWorkspaceOptions {
  channel?: string;
  now?: Date | number | string;
  period?: LiveReportPeriod | "7_days" | "30_days" | "Сегодня" | "Вчера" | "7 дней" | "30 дней";
  timezoneOffsetMinutes?: number;
}

export interface LiveReportWorkspaceInput extends LiveReportWorkspaceOptions {
  conversations: readonly LiveReportConversation[];
}

export interface LiveReportMetrics {
  closedConversations: number;
  firstResponseSeconds: number;
  firstResponseSamples: number;
  newConversations: number;
  slaPercent: number;
  slaSamples: number;
  slaViolations: number;
}

export interface LiveReportWindow {
  from: string;
  to: string;
}

export interface LiveReportMetricRow {
  current: string;
  delta: string;
  key: "closedConversations" | "firstResponseSeconds" | "newConversations" | "slaPercent";
  metric: string;
  previous: string;
  status: string;
  tone: LiveReportTone;
}

export type LiveReportChannelBar = [channel: string, percent: number];

export interface LiveReportChartSeries {
  name: string;
  points: number[];
}

export interface LiveReportChartBlock {
  delta: string;
  id: "first-response" | "new-closed" | "sla";
  labels: string[];
  legend: string[];
  points: number[];
  series: LiveReportChartSeries[];
  title: string;
  tone: LiveReportTone;
  value: string;
}

export interface LiveReportWorkspace {
  bars: LiveReportChannelBar[];
  channel: string;
  chartBlocks: LiveReportChartBlock[];
  current: LiveReportMetrics;
  period: LiveReportPeriod;
  periodLabel: string;
  previous: LiveReportMetrics;
  rows: LiveReportMetricRow[];
  windows: {
    current: LiveReportWindow;
    previous: LiveReportWindow;
  };
}

interface DateWindow {
  from: number;
  to: number;
}

interface ConversationFacts {
  channel: string;
  closedAt?: number;
  firstResponseSeconds?: number;
  slaViolated: boolean;
  startedAt?: number;
}

interface BucketMetrics {
  closed: number;
  firstResponseSeconds: number[];
  new: number;
  slaSamples: number;
  slaViolations: number;
}

const DAY_MS = 24 * 60 * 60 * 1_000;
const SLA_VIOLATION_TONES = new Set(["critical", "danger", "overdue"]);
const CLOSED_STATUSES = new Set(["closed", "done", "resolved", "completed", "закрыт", "закрыто", "завершен", "завершено"]);

const PERIOD_LABELS: Record<LiveReportPeriod, string> = {
  "30days": "30 дней",
  "7days": "7 дней",
  today: "Сегодня",
  yesterday: "Вчера"
};

export function buildLiveReportWorkspace(
  conversations: readonly LiveReportConversation[],
  options?: LiveReportWorkspaceOptions
): LiveReportWorkspace;
export function buildLiveReportWorkspace(input: LiveReportWorkspaceInput): LiveReportWorkspace;
export function buildLiveReportWorkspace(
  conversationsOrInput: readonly LiveReportConversation[] | LiveReportWorkspaceInput,
  options: LiveReportWorkspaceOptions = {}
): LiveReportWorkspace {
  const input = Array.isArray(conversationsOrInput)
    ? { ...options, conversations: conversationsOrInput }
    : conversationsOrInput as LiveReportWorkspaceInput;
  const period = normalizePeriod(input.period);
  const now = validTimestamp(input.now ?? Date.now(), "now");
  const timezoneOffsetMinutes = finiteOffset(input.timezoneOffsetMinutes);
  const windows = reportWindows(period, now, timezoneOffsetMinutes);
  const selectedChannel = normalizeChannel(input.channel);
  const facts = input.conversations
    .filter((conversation) => selectedChannel === "all" || sameChannel(conversation.channel, selectedChannel))
    .map(toConversationFacts);
  const current = aggregateWindow(facts, windows.current);
  const previous = aggregateWindow(facts, windows.previous);
  const buckets = buildBuckets(facts, windows.current, timezoneOffsetMinutes);
  const bars = channelBars(facts, windows.current);

  return {
    bars,
    channel: selectedChannel,
    chartBlocks: chartBlocks(current, previous, buckets),
    current,
    period,
    periodLabel: PERIOD_LABELS[period],
    previous,
    rows: metricRows(current, previous),
    windows: {
      current: serializeWindow(windows.current),
      previous: serializeWindow(windows.previous)
    }
  };
}

function normalizePeriod(period: LiveReportWorkspaceOptions["period"]): LiveReportPeriod {
  const normalized = String(period ?? "today").trim().toLocaleLowerCase("ru-RU").replaceAll("_", "");
  if (normalized === "today" || normalized === "сегодня") return "today";
  if (normalized === "yesterday" || normalized === "вчера") return "yesterday";
  if (normalized === "7days" || normalized === "7 дней") return "7days";
  if (normalized === "30days" || normalized === "30 дней") return "30days";
  throw new RangeError(`Unsupported report period: ${String(period)}`);
}

function finiteOffset(value: number | undefined): number {
  const offset = value ?? 0;
  if (!Number.isFinite(offset) || Math.abs(offset) > 14 * 60) {
    throw new RangeError("timezoneOffsetMinutes must be between -840 and 840.");
  }
  return offset;
}

function normalizeChannel(channel: string | undefined): string {
  const value = channel?.trim() || "all";
  return value.toLocaleLowerCase("ru-RU") === "все каналы" ? "all" : value;
}

function sameChannel(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("ru-RU") === right.toLocaleLowerCase("ru-RU");
}

function reportWindows(period: LiveReportPeriod, now: number, offsetMinutes: number): { current: DateWindow; previous: DateWindow } {
  const today = startOfDay(now, offsetMinutes);
  const current = period === "today"
    ? { from: today, to: today + DAY_MS }
    : period === "yesterday"
      ? { from: today - DAY_MS, to: today }
      : period === "7days"
        ? { from: today - 6 * DAY_MS, to: today + DAY_MS }
        : { from: today - 29 * DAY_MS, to: today + DAY_MS };
  const duration = current.to - current.from;
  return { current, previous: { from: current.from - duration, to: current.from } };
}

function startOfDay(timestamp: number, offsetMinutes: number): number {
  const shifted = new Date(timestamp + offsetMinutes * 60_000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - offsetMinutes * 60_000;
}

function toConversationFacts(conversation: LiveReportConversation): ConversationFacts {
  if (conversation.lifecycleEvents?.length) {
    return lifecycleConversationFacts(conversation);
  }
  const messages = conversation.messages
    .filter(isReportMessage)
    .map((message) => ({ message, timestamp: optionalTimestamp(message.createdAt) }))
    .filter((item): item is typeof item & { timestamp: number } => item.timestamp !== undefined)
    .sort((left, right) => left.timestamp - right.timestamp);
  const firstClient = messages.find(({ message }) => message.side === "client");
  const firstAgent = firstClient === undefined
    ? undefined
    : messages.find(({ message, timestamp }) => message.side === "agent" && timestamp >= firstClient.timestamp);
  const explicitCreatedAt = optionalTimestamp(conversation.createdAt);
  const startedAt = explicitCreatedAt ?? firstClient?.timestamp ?? messages[0]?.timestamp;
  const closed = CLOSED_STATUSES.has(conversation.status.trim().toLocaleLowerCase("ru-RU"));
  const closedAt = optionalTimestamp(conversation.closedAt) ?? (closed ? optionalTimestamp(conversation.updatedAt) : undefined);

  return {
    channel: conversation.channel.trim() || "Неизвестный канал",
    ...(closedAt === undefined ? {} : { closedAt }),
    ...(firstClient && firstAgent ? { firstResponseSeconds: Math.max(0, (firstAgent.timestamp - firstClient.timestamp) / 1_000) } : {}),
    slaViolated: SLA_VIOLATION_TONES.has(conversation.slaTone.trim().toLocaleLowerCase("en-US")),
    ...(startedAt === undefined ? {} : { startedAt })
  };
}

function lifecycleConversationFacts(conversation: LiveReportConversation): ConversationFacts {
  const events = [...(conversation.lifecycleEvents ?? [])]
    .map((event) => ({ event, timestamp: optionalTimestamp(event.occurredAt) }))
    .filter((item): item is typeof item & { timestamp: number } => item.timestamp !== undefined)
    .sort((left, right) => left.timestamp - right.timestamp);
  const created = events.find(({ event }) => event.eventType === "conversation.created");
  const firstClient = events.find(({ event }) => event.eventType === "message.received");
  const firstAgent = firstClient === undefined
    ? undefined
    : events.find(({ event, timestamp }) => event.eventType === "message.sent" && timestamp >= firstClient.timestamp);
  const closed = events.find(({ event }) => event.eventType === "status.changed" && isClosedStatus(event.data?.toStatus));

  return {
    channel: conversation.channel.trim() || "Unknown channel",
    ...(closed ? { closedAt: closed.timestamp } : {}),
    ...(firstClient && firstAgent ? { firstResponseSeconds: Math.max(0, (firstAgent.timestamp - firstClient.timestamp) / 1_000) } : {}),
    slaViolated: events.some(({ event }) => event.eventType === "sla.overdue"),
    ...(created ? { startedAt: created.timestamp } : {})
  };
}

function isClosedStatus(value: unknown): boolean {
  return typeof value === "string" && CLOSED_STATUSES.has(value.trim().toLocaleLowerCase("ru-RU"));
}

function isReportMessage(message: ConversationMessage): message is ConversationMessage & { side: "agent" | "client" } {
  return message.type !== "event" && message.type !== "internal" && (message.side === "client" || message.side === "agent");
}

function aggregateWindow(facts: readonly ConversationFacts[], window: DateWindow): LiveReportMetrics {
  const started = facts.filter((fact) => inWindow(fact.startedAt, window));
  const responseTimes = started.flatMap((fact) => fact.firstResponseSeconds === undefined ? [] : [fact.firstResponseSeconds]);
  const slaViolations = started.filter((fact) => fact.slaViolated).length;
  return {
    closedConversations: facts.filter((fact) => inWindow(fact.closedAt, window)).length,
    firstResponseSeconds: roundedAverage(responseTimes),
    firstResponseSamples: responseTimes.length,
    newConversations: started.length,
    slaPercent: started.length === 0 ? 0 : round((started.length - slaViolations) / started.length * 100, 1),
    slaSamples: started.length,
    slaViolations
  };
}

function channelBars(facts: readonly ConversationFacts[], window: DateWindow): LiveReportChannelBar[] {
  const channels = new Map<string, { count: number; label: string }>();
  for (const fact of facts) {
    if (!inWindow(fact.startedAt, window)) continue;
    const key = fact.channel.toLocaleLowerCase("ru-RU");
    const current = channels.get(key);
    channels.set(key, { count: (current?.count ?? 0) + 1, label: current?.label ?? fact.channel });
  }
  const total = [...channels.values()].reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return [];
  return [...channels.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru"))
    .map((item) => [item.label, round(item.count / total * 100, 1)]);
}

function buildBuckets(facts: readonly ConversationFacts[], window: DateWindow, offsetMinutes: number): { labels: string[]; metrics: BucketMetrics[] } {
  const count = Math.max(1, Math.round((window.to - window.from) / DAY_MS));
  const metrics = Array.from({ length: count }, (): BucketMetrics => ({
    closed: 0,
    firstResponseSeconds: [],
    new: 0,
    slaSamples: 0,
    slaViolations: 0
  }));
  for (const fact of facts) {
    const startedIndex = bucketIndex(fact.startedAt, window, count);
    if (startedIndex !== undefined) {
      metrics[startedIndex].new += 1;
      metrics[startedIndex].slaSamples += 1;
      if (fact.slaViolated) metrics[startedIndex].slaViolations += 1;
      if (fact.firstResponseSeconds !== undefined) metrics[startedIndex].firstResponseSeconds.push(fact.firstResponseSeconds);
    }
    const closedIndex = bucketIndex(fact.closedAt, window, count);
    if (closedIndex !== undefined) metrics[closedIndex].closed += 1;
  }
  const labels = metrics.map((_, index) => dayLabel(window.from + index * DAY_MS, offsetMinutes));
  return { labels, metrics };
}

function metricRows(current: LiveReportMetrics, previous: LiveReportMetrics): LiveReportMetricRow[] {
  return [
    newConversationsRow(current.newConversations, previous.newConversations),
    countRow("closedConversations", "Закрытые диалоги", current.closedConversations, previous.closedConversations),
    durationRow(current.firstResponseSeconds, previous.firstResponseSeconds, current.firstResponseSamples, previous.firstResponseSamples),
    slaRow(current.slaPercent, previous.slaPercent, current.slaSamples, previous.slaSamples)
  ];
}

function newConversationsRow(current: number, previous: number): LiveReportMetricRow {
  const comparison = current === previous
    ? { status: "Без изменений", tone: "ok" as const }
    : current > previous
      ? { status: "Рост нагрузки", tone: "warn" as const }
      : { status: "Нагрузка снизилась", tone: "ok" as const };
  return {
    current: String(current),
    delta: percentDelta(current, previous),
    key: "newConversations",
    metric: "Новые диалоги",
    previous: String(previous),
    ...comparison
  };
}

function countRow(key: "closedConversations", metric: string, current: number, previous: number): LiveReportMetricRow {
  const comparison = compare(current, previous, false);
  return { current: String(current), delta: percentDelta(current, previous), key, metric, previous: String(previous), ...comparison };
}

function durationRow(current: number, previous: number, currentSamples: number, previousSamples: number): LiveReportMetricRow {
  const comparable = currentSamples > 0 && previousSamples > 0;
  return {
    current: formatDuration(current),
    delta: comparable ? percentDelta(current, previous) : "—",
    key: "firstResponseSeconds",
    metric: "Среднее время первого ответа",
    previous: formatDuration(previous),
    ...(comparable ? compare(current, previous, true) : noComparison())
  };
}

function slaRow(current: number, previous: number, currentSamples: number, previousSamples: number): LiveReportMetricRow {
  const comparable = currentSamples > 0 && previousSamples > 0;
  return {
    current: `${formatNumber(current)}%`,
    delta: comparable ? `${signed(round(current - previous, 1))} п.п.` : "—",
    key: "slaPercent",
    metric: "SLA выполнен",
    previous: `${formatNumber(previous)}%`,
    ...(comparable ? compare(current, previous, false) : noComparison())
  };
}

function chartBlocks(
  current: LiveReportMetrics,
  previous: LiveReportMetrics,
  buckets: ReturnType<typeof buildBuckets>
): LiveReportChartBlock[] {
  const newPoints = buckets.metrics.map((metric) => metric.new);
  const closedPoints = buckets.metrics.map((metric) => metric.closed);
  const responsePoints = buckets.metrics.map((metric) => roundedAverage(metric.firstResponseSeconds));
  const slaPoints = buckets.metrics.map((metric) => metric.slaSamples === 0
    ? 0
    : round((metric.slaSamples - metric.slaViolations) / metric.slaSamples * 100, 1));
  return [
    makeChart("new-closed", "Новые и закрытые", `${current.newConversations} / ${current.closedConversations}`, percentDelta(current.newConversations, previous.newConversations), buckets.labels, [
      { name: "Новые", points: newPoints },
      { name: "Закрытые", points: closedPoints }
    ], compare(current.newConversations, previous.newConversations, false).tone),
    makeChart("first-response", "Первый ответ", formatDuration(current.firstResponseSeconds),
      current.firstResponseSamples > 0 && previous.firstResponseSamples > 0 ? percentDelta(current.firstResponseSeconds, previous.firstResponseSeconds) : "—",
      buckets.labels, [{ name: "Секунды", points: responsePoints }],
      current.firstResponseSamples > 0 && previous.firstResponseSamples > 0 ? compare(current.firstResponseSeconds, previous.firstResponseSeconds, true).tone : "warn"),
    makeChart("sla", "SLA", `${formatNumber(current.slaPercent)}%`,
      current.slaSamples > 0 && previous.slaSamples > 0 ? `${signed(round(current.slaPercent - previous.slaPercent, 1))} п.п.` : "—",
      buckets.labels, [{ name: "Выполнено, %", points: slaPoints }],
      current.slaSamples > 0 && previous.slaSamples > 0 ? compare(current.slaPercent, previous.slaPercent, false).tone : "warn")
  ];
}

function makeChart(
  id: LiveReportChartBlock["id"],
  title: string,
  value: string,
  delta: string,
  labels: string[],
  series: LiveReportChartSeries[],
  tone: LiveReportTone
): LiveReportChartBlock {
  return { delta, id, labels, legend: series.map((item) => item.name), points: series[0]?.points ?? [], series, title, tone, value };
}

function compare(current: number, previous: number, lowerIsBetter: boolean): Pick<LiveReportMetricRow, "status" | "tone"> {
  if (current === previous) return { status: "Без изменений", tone: "ok" };
  const improved = lowerIsBetter ? current < previous : current > previous;
  return improved ? { status: "Лучше", tone: "ok" } : { status: "Требует внимания", tone: "danger" };
}

function noComparison(): Pick<LiveReportMetricRow, "status" | "tone"> {
  return { status: "Нет данных для сравнения", tone: "warn" };
}

function percentDelta(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "0%" : "—";
  return `${signed(round((current - previous) / previous * 100, 1))}%`;
}

function signed(value: number): string {
  return value > 0 ? `+${formatNumber(value)}` : formatNumber(value);
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor(rounded % 3_600 / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? [hours, minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":")
    : [minutes, remainder].map((part) => String(part).padStart(2, "0")).join(":");
}

function dayLabel(timestamp: number, offsetMinutes: number): string {
  const date = new Date(timestamp + offsetMinutes * 60_000);
  return `${String(date.getUTCDate()).padStart(2, "0")}.${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bucketIndex(timestamp: number | undefined, window: DateWindow, count: number): number | undefined {
  if (!inWindow(timestamp, window)) return undefined;
  return Math.min(count - 1, Math.floor((timestamp! - window.from) / DAY_MS));
}

function inWindow(timestamp: number | undefined, window: DateWindow): boolean {
  return timestamp !== undefined && timestamp >= window.from && timestamp < window.to;
}

function roundedAverage(values: readonly number[]): number {
  return values.length === 0 ? 0 : round(values.reduce((sum, value) => sum + value, 0) / values.length, 1);
}

function round(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function optionalTimestamp(value: Date | number | string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const timestamp = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function validTimestamp(value: Date | number | string, field: string): number {
  const timestamp = optionalTimestamp(value);
  if (timestamp === undefined) throw new RangeError(`${field} must be a valid date.`);
  return timestamp;
}

function serializeWindow(window: DateWindow): LiveReportWindow {
  return { from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString() };
}
