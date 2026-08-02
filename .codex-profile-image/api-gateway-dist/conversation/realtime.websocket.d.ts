import type { IncomingHttpHeaders, Server } from "node:http";
import type { BackendConfig } from "@support-communication/config";
import { ConversationService } from "./conversation.service.js";
export interface RealtimeWebSocketReplayOptions {
    apiVersion: string;
    config: BackendConfig;
    conversationService: ConversationService;
}
export interface RealtimeWebSocketReplaySocket {
    destroyed: boolean;
    end(): void;
    write(value: Buffer | string): unknown;
}
export declare function installRealtimeWebSocketReplay(server: Server, options: RealtimeWebSocketReplayOptions): void;
export declare function writeRealtimeWebSocketReplay(conversationService: ConversationService, socket: RealtimeWebSocketReplaySocket, since?: string, scope?: {
    tenantId?: string;
}, limit?: number | string): Promise<void>;
export declare function authorizeRealtimeSocket(headers: IncomingHttpHeaders, config: BackendConfig): Promise<{
    allowed: true;
    tenantId?: string;
} | {
    allowed: false;
    reason: string;
    statusCode: number;
}>;
