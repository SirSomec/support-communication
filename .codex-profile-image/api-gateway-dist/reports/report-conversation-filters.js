export function buildConversationReportEventWatermark(rows, snapshotAt) {
    const snapshotTime = snapshotAt.getTime();
    let watermark = null;
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
const conversationReportFilterKeys = [
    "operatorId",
    "outcome",
    "queueId",
    "resolutionOutcome",
    "status",
    "teamId",
    "topic"
];
export function filterReportConversations(rows, filters) {
    const normalized = normalizedFilters(filters);
    return rows.filter((row) => {
        const facets = conversationReportFacets(row);
        return Object.entries(normalized).every(([key, value]) => !value || facets[key].has(value));
    });
}
export function buildConversationReportFilterOptions(rows) {
    const collected = emptyFacetRecord();
    for (const row of rows) {
        const facets = conversationReportFacets(row);
        for (const key of Object.keys(collected)) {
            for (const value of facets[key])
                collected[key].add(value);
        }
    }
    return Object.fromEntries(Object.entries(collected).map(([key, values]) => [key, [...values].sort((left, right) => left.localeCompare(right, "ru"))]));
}
export function buildConversationReportDataQuality(rows, snapshotAt) {
    const events = rows.flatMap((row) => row.lifecycleEvents ?? []);
    const latestOccurredAt = maxIso(events.map((event) => event.occurredAt));
    const latestIngestedAt = maxIso(events.map((event) => event.ingestedAt).filter(Boolean));
    const backfillBoundary = minIso(events
        .filter((event) => event.source === "migration.backfill")
        .map((event) => event.ingestedAt)
        .filter(Boolean));
    const freshnessLagSeconds = latestIngestedAt
        ? Math.max(0, Math.round((snapshotAt.getTime() - new Date(latestIngestedAt).getTime()) / 1_000))
        : null;
    const dimensionCoverage = Object.fromEntries(["queueId", "teamId", "resolutionOutcome"].map((dimension) => {
        const known = rows.filter((row) => conversationReportFacets(row)[dimension].size > 0).length;
        return [dimension, { known, unknown: rows.length - known }];
    }));
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
function conversationReportFacets(row) {
    const facets = emptyFacetRecord();
    add(facets.operatorId, row.operatorId);
    add(facets.queueId, row.queueId);
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
function emptyFacetRecord() {
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
function normalizedFilters(filters) {
    return Object.fromEntries(conversationReportFilterKeys.map((key) => [key, normalize(filters[key])]));
}
function normalize(value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    return !normalized || normalized === "all" || normalized.startsWith("Все ") ? undefined : normalized.toLocaleLowerCase("ru-RU");
}
function add(target, value) {
    const normalized = normalize(value);
    if (normalized)
        target.add(normalized);
}
function maxIso(values) {
    return values.length ? values.reduce((left, right) => Date.parse(left) >= Date.parse(right) ? left : right) : null;
}
function minIso(values) {
    return values.length ? values.reduce((left, right) => Date.parse(left) <= Date.parse(right) ? left : right) : null;
}
//# sourceMappingURL=report-conversation-filters.js.map