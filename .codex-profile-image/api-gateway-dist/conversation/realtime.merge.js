export function mergeRealtimeEvents(sources, since) {
    return applyRealtimeCursor(dedupeRealtimeEvents(sources.flat()).sort(compareRealtimeEvents), since);
}
export function applyRealtimeCursor(events, since) {
    const cursor = String(since ?? "").trim();
    if (!cursor) {
        return events;
    }
    const eventIndex = events.findIndex((event) => event.eventId === cursor);
    if (eventIndex >= 0) {
        return events.slice(eventIndex + 1);
    }
    const cursorDate = parseRealtimeCursorDate(cursor);
    if (!cursorDate) {
        return events;
    }
    const cursorTime = cursorDate.getTime();
    return events.filter((event) => new Date(event.occurredAt).getTime() > cursorTime);
}
export function compareRealtimeEvents(left, right) {
    const occurredAtComparison = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
    if (occurredAtComparison !== 0) {
        return occurredAtComparison;
    }
    return left.eventId.localeCompare(right.eventId);
}
function dedupeRealtimeEvents(events) {
    const byEventId = new Map();
    for (const event of events) {
        if (!byEventId.has(event.eventId)) {
            byEventId.set(event.eventId, event);
        }
    }
    return [...byEventId.values()];
}
function parseRealtimeCursorDate(cursor) {
    const relative = /^now-(\d+)([smhd])$/.exec(cursor);
    if (relative) {
        const amount = Number(relative[1]);
        const unit = relative[2];
        const unitMs = unit === "s"
            ? 1_000
            : unit === "m"
                ? 60_000
                : unit === "h"
                    ? 3_600_000
                    : 86_400_000;
        return new Date(Date.now() - amount * unitMs);
    }
    const parsed = new Date(cursor);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
//# sourceMappingURL=realtime.merge.js.map