import { type Observable } from "rxjs";
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
export declare function createRealtimeSseStream(conversationService: ConversationService, filters: {
    limit?: number | string;
    since?: string;
    tenantId?: string;
}, lastEventId?: string, options?: RealtimeSseStreamOptions): Observable<RealtimeSseMessage>;
