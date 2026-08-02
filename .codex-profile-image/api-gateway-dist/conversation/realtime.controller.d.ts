import type { Observable } from "rxjs";
import { type TenantOperatorRequest } from "../identity/tenant-operator-auth.js";
import { ConversationService } from "./conversation.service.js";
import { type RealtimeSseMessage } from "./realtime.sse.js";
export declare class RealtimeController {
    private readonly conversationService;
    constructor(conversationService: ConversationService);
    fetchRealtimeEvents(filters: {
        limit?: string;
        since?: string;
    }, request: TenantOperatorRequest): Promise<import("@support-communication/envelope").BackendEnvelope<{
        events: import("./conversation.repository.js").RealtimeEvent[];
        filters: {
            limit?: number | string;
            since?: string;
        };
    }>>;
    streamRealtimeEvents(filters: {
        limit?: string;
        since?: string;
    }, lastEventId?: string, request?: TenantOperatorRequest): Observable<RealtimeSseMessage>;
}
