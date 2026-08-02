import type { OutboundMessageDispatcher } from "../conversation/conversation.service.js";
import { type TelegramConnectionStoredRecord } from "./integration.repository.js";
interface TelegramOutboundDispatcherOptions {
    apiBaseUrl?: string;
    fetcher?: TelegramOutboundFetch;
    integrationRepository?: TelegramConnectionReader;
    timeoutMs?: number;
}
interface TelegramConnectionReader {
    listTelegramConnections(): TelegramConnectionStoredRecord[];
    listTelegramConnectionsAsync?(): Promise<TelegramConnectionStoredRecord[]>;
}
interface TelegramOutboundFetch {
    (input: string, init: {
        body: string;
        headers: Record<string, string>;
        method: "POST";
        signal?: AbortSignal;
    }): Promise<{
        json(): Promise<unknown>;
        ok: boolean;
        status: number;
    }> | {
        json(): Promise<unknown>;
        ok: boolean;
        status: number;
    };
}
export declare function createTelegramOutboundMessageDispatcher(options?: TelegramOutboundDispatcherOptions): OutboundMessageDispatcher;
export {};
