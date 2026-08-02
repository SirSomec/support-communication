import { concat, from, map, mergeMap, NEVER, of } from "rxjs";
export function createRealtimeSseStream(conversationService, filters, lastEventId, options = {}) {
    const eventStream = from(conversationService.fetchRealtimeEvents({
        limit: filters.limit,
        since: lastEventId ?? filters.since
    }, {
        tenantId: filters.tenantId
    })).pipe(mergeMap((envelope) => from(envelope.data.events)), map((event) => ({
        data: event,
        id: event.eventId,
        type: event.eventName
    })));
    if (!options.includeHandshake) {
        return eventStream;
    }
    const handshakeMessage = {
        data: {
            ready: true,
            transport: "sse"
        },
        id: "",
        type: "stream.ready"
    };
    const handshakeStream = of(handshakeMessage);
    if (options.keepOpen) {
        return concat(handshakeStream, eventStream, NEVER);
    }
    return concat(handshakeStream, eventStream);
}
//# sourceMappingURL=realtime.sse.js.map