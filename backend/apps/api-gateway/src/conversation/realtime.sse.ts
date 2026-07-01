import { from, map, mergeMap, type Observable } from "rxjs";
import type { RealtimeEvent } from "./conversation.repository.js";
import type { ConversationService } from "./conversation.service.js";

export interface RealtimeSseMessage {
  data: RealtimeEvent;
  id: string;
  type: string;
}

export function createRealtimeSseStream(
  conversationService: ConversationService,
  filters: { since?: string },
  lastEventId?: string
): Observable<RealtimeSseMessage> {
  return from(conversationService.fetchRealtimeEvents({
    ...filters,
    since: lastEventId ?? filters.since
  })).pipe(
    mergeMap((envelope) => from(envelope.data.events)),
    map((event) => ({
      data: event,
      id: event.eventId,
      type: event.eventName
    }))
  );
}
