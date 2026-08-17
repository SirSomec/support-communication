import type { ConversationReportSourceRow } from "./report.repository.js";

export interface ConversationReportFilters {
  operatorId?: string;
  outcome?: string;
  queueId?: string;
  resolutionOutcome?: string;
  status?: string;
  teamId?: string;
  topic?: string;
}

export interface ConversationReportEventWatermark {
  id: string;
  ingestedAt: string | null;
  occurredAt: string;
}

export function buildConversationReportEventWatermark(
  rows: ConversationReportSourceRow[],
  snapshotAt: Date
): ConversationReportEventWatermark | null {
  const snapshotTime = snapshotAt.getTime();
  let watermark: ConversationReportEventWatermark | null = null;

  for (const row of rows) {
    for (const event of row.lifecycleEvents ?? []) {
      const occurredAt = new Date(event.occurredAt).getTime();
      if (!event.id || !Number.isFinite(occurredAt) || occurredAt > snapshotTime) {
        continue;
      }

      if (!watermark
        || occurredAt > new Date(watermark.occurredAt).getTime()
        || (occurredAt === new Date(watermark.occurredAt).getTime() && event.id > watermark.id)) {
        watermark = {
          id: event.id,
          ingestedAt: event.ingestedAt ?? null,
          occurredAt: event.occurredAt
        };
      }
    }
  }

  return watermark;
}

export type ConversationReportFilterOptions = Record<keyof ConversationReportFilters, string[]>;

const conversationReportFilterKeys: Array<keyof ConversationReportFilters> = [
  "operatorId",
  "outcome",
  "queueId",
  "resolutionOutcome",
  "status",
  "teamId",
  "topic"
];

export function filterReportConversations(
  rows: readonly ConversationReportSourceRow[],
  filters: ConversationReportFilters
): ConversationReportSourceRow[] {
  const normalized = normalizedFilters(filters);
  return rows.filter((row) => {
    const facets = conversationReportFacets(row);
    return Object.entries(normalized).every(([key, value]) => !value || facets[key as keyof ConversationReportFilters].has(value));
  });
}

/**
 * Routing analytics does not denormalize conversation dimensions. Resolve the
 * value recorded by lifecycle at (or before) the routing event when available,
 * then fall back to the persisted conversation facet. Resolution outcome is a
 * cohort/final-outcome filter because it normally becomes known after routing.
 */
export function matchesRoutingConversationFiltersAt(
  row: ConversationReportSourceRow,
  filters: Pick<ConversationReportFilters, "queueId" | "resolutionOutcome" | "status" | "teamId" | "topic">,
  occurredAt: string,
  facetHistory: NonNullable<ConversationReportSourceRow["lifecycleEvents"]> = row.lifecycleEvents ?? []
): boolean {
  const normalized = normalizedFilters(filters);
  const eventTime = Date.parse(occurredAt);
  if (!Number.isFinite(eventTime)) return false;

  for (const dimension of ["queueId", "status", "teamId", "topic"] as const) {
    const requested = normalized[dimension];
    if (!requested) continue;
    if (routingFacetAt(row, dimension, eventTime, facetHistory) !== requested) return false;
  }

  const resolutionOutcome = normalized.resolutionOutcome;
  return !resolutionOutcome || conversationReportFacets(row).resolutionOutcome.has(resolutionOutcome);
}

export function buildConversationReportFilterOptions(
  rows: readonly ConversationReportSourceRow[]
): ConversationReportFilterOptions {
  const collected = emptyFacetRecord();
  for (const row of rows) {
    const facets = conversationReportFacets(row);
    for (const key of Object.keys(collected) as Array<keyof ConversationReportFilters>) {
      for (const value of facets[key]) collected[key].add(value);
    }
  }
  return Object.fromEntries(
    Object.entries(collected).map(([key, values]) => [key, [...values].sort((left, right) => left.localeCompare(right, "ru"))])
  ) as ConversationReportFilterOptions;
}

export function buildConversationReportDataQuality(
  rows: readonly ConversationReportSourceRow[],
  snapshotAt: Date
): Record<string, unknown> {
  const events = rows.flatMap((row) => row.lifecycleEvents ?? []);
  const latestOccurredAt = maxIso(events.map((event) => event.occurredAt));
  const latestIngestedAt = maxIso(events.map((event) => event.ingestedAt).filter(Boolean) as string[]);
  const backfillBoundary = minIso(events
    .filter((event) => event.source === "migration.backfill")
    .map((event) => event.ingestedAt)
    .filter(Boolean) as string[]);
  const freshnessLagSeconds = latestIngestedAt
    ? Math.max(0, Math.round((snapshotAt.getTime() - new Date(latestIngestedAt).getTime()) / 1_000))
    : null;
  const dimensionCoverage = Object.fromEntries(
    (["queueId", "teamId", "resolutionOutcome"] as const).map((dimension) => {
      const known = rows.filter((row) => conversationReportFacets(row)[dimension].size > 0).length;
      return [dimension, { known, unknown: rows.length - known }];
    })
  );

  return {
    backfillBoundary,
    complete: !backfillBoundary,
    conversationCount: rows.length,
    dimensionCoverage,
    eventCount: events.length,
    freshnessLagSeconds,
    latestEventAt: latestOccurredAt,
    latestIngestedAt
  };
}

function conversationReportFacets(row: ConversationReportSourceRow): Record<keyof ConversationReportFilters, Set<string>> {
  const facets = emptyFacetRecord();
  add(facets.operatorId, row.operatorId);
  add(facets.queueId, row.queueId);
  add(facets.resolutionOutcome, row.resolutionOutcome);
  add(facets.status, row.status);
  add(facets.teamId, row.teamId);
  add(facets.topic, row.topic);

  for (const event of row.lifecycleEvents ?? []) {
    add(facets.operatorId, event.data?.toOperatorId);
    add(facets.operatorId, event.data?.operatorId);
    add(facets.outcome, event.data?.outcome);
    add(facets.queueId, event.data?.queueId);
    add(facets.resolutionOutcome, event.data?.resolutionOutcome);
    add(facets.status, event.data?.toStatus);
    add(facets.teamId, event.data?.teamId);
    add(facets.topic, event.data?.toTopic);
  }
  return facets;
}

function routingFacetAt(
  row: ConversationReportSourceRow,
  dimension: "queueId" | "status" | "teamId" | "topic",
  eventTime: number,
  facetHistory: NonNullable<ConversationReportSourceRow["lifecycleEvents"]>
): string | undefined {
  const events = facetHistory
    .map((event) => ({ event, timestamp: Date.parse(event.occurredAt) }))
    .filter((item) => Number.isFinite(item.timestamp));
  const lifecycleValue = events
    .filter((item) => item.timestamp <= eventTime)
    .sort((left, right) => right.timestamp - left.timestamp)
    .map(({ event }) => routingFacetObservedValue(event.data, dimension))
    .find((value): value is string => typeof value === "string" && value.trim() !== "");
  if (lifecycleValue) return normalize(lifecycleValue);

  // If the first recorded change happened after the routing event, its `from*`
  // value is the state at the event. Do not fall back to the current persisted
  // value across a post-event observation that lacks provenance: that would
  // silently attribute the later queue/team/status/topic to historical work.
  for (const { event } of events
    .filter((item) => item.timestamp > eventTime)
    .sort((left, right) => left.timestamp - right.timestamp)) {
    const previousValue = routingFacetPreviousValue(event.data, dimension);
    if (previousValue) return normalize(previousValue);
    if (routingFacetObservedValue(event.data, dimension)) return undefined;
  }

  const persistedValue = dimension === "queueId"
    ? row.queueId
    : dimension === "status"
      ? row.status
      : dimension === "teamId"
        ? row.teamId
        : row.topic;
  return normalize(persistedValue);
}

function routingFacetObservedValue(
  data: Record<string, unknown> | undefined,
  dimension: "queueId" | "status" | "teamId" | "topic"
): string | undefined {
  if (!data) return undefined;
  const candidates = dimension === "queueId"
    ? [data.toQueueId, data.queueId]
    : dimension === "status"
      ? [data.toStatus]
      : dimension === "teamId"
        ? [data.toTeamId, data.teamId]
        : [data.toTopic, data.topic];
  return candidates.find((value): value is string => typeof value === "string" && value.trim() !== "");
}

function routingFacetPreviousValue(
  data: Record<string, unknown> | undefined,
  dimension: "queueId" | "status" | "teamId" | "topic"
): string | undefined {
  if (!data) return undefined;
  const candidates = dimension === "queueId"
    ? [data.fromQueueId, data.previousQueueId]
    : dimension === "status"
      ? [data.fromStatus, data.previousStatus]
      : dimension === "teamId"
        ? [data.fromTeamId, data.previousTeamId]
        : [data.fromTopic, data.previousTopic];
  return candidates.find((value): value is string => typeof value === "string" && value.trim() !== "");
}

function emptyFacetRecord(): Record<keyof ConversationReportFilters, Set<string>> {
  return {
    operatorId: new Set(),
    outcome: new Set(),
    queueId: new Set(),
    resolutionOutcome: new Set(),
    status: new Set(),
    teamId: new Set(),
    topic: new Set()
  };
}

function normalizedFilters(filters: ConversationReportFilters): ConversationReportFilters {
  return Object.fromEntries(
    conversationReportFilterKeys.map((key) => [key, normalize(filters[key])])
  ) as ConversationReportFilters;
}

function normalize(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return !normalized || normalized === "all" || normalized.startsWith("Все ") ? undefined : normalized.toLocaleLowerCase("ru-RU");
}

function add(target: Set<string>, value: unknown): void {
  const normalized = normalize(value);
  if (normalized) target.add(normalized);
}

function maxIso(values: string[]): string | null {
  return values.length ? values.reduce((left, right) => Date.parse(left) >= Date.parse(right) ? left : right) : null;
}

function minIso(values: string[]): string | null {
  return values.length ? values.reduce((left, right) => Date.parse(left) <= Date.parse(right) ? left : right) : null;
}
