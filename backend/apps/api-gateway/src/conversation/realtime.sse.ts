import { concat, from, map, mergeMap, NEVER, of, type Observable } from "rxjs";
import type { RealtimeEvent } from "./conversation.repository.js";
import type { ConversationService } from "./conversation.service.js";

export interface RealtimeSseReadyPayload {
  ready: true;
  transport: "sse";
}

export interface RealtimeSseMessage {
  data: RealtimeEvent | RealtimeSseReadyPayload;
  id?: string;
  type: string;
}

export interface RealtimeSseStreamOptions {
  keepOpen?: boolean;
  includeHandshake?: boolean;
}

export function createRealtimeSseStream(
  conversationService: ConversationService,
  filters: { since?: string; tenantId?: string },
  lastEventId?: string,
  options: RealtimeSseStreamOptions = {}
): Observable<RealtimeSseMessage> {
  const eventStream: Observable<RealtimeSseMessage> = from(conversationService.fetchRealtimeEvents({
    since: lastEventId ?? filters.since
  }, {
    tenantId: filters.tenantId
  })).pipe(
    mergeMap((envelope) => from(envelope.data.events)),
    map((event) => ({
      data: event,
      id: event.eventId,
      type: event.eventName
    }))
  );

  if (!options.includeHandshake) {
    return eventStream;
  }

  const handshakeMessage: RealtimeSseMessage = {
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
