import type { BackendEnvelope } from "@support-communication/envelope";
import type { ConversationRepository } from "../conversation/conversation.repository.js";
import type { ConversationService } from "../conversation/conversation.service.js";
import type { ChannelConnectionStoredRecord, TelegramConnectionStoredRecord } from "./integration.repository.js";
import type { TelegramHttpFetch } from "./telegram-channel-connection.js";
export interface TelegramPollingInput {
    apiBaseUrl?: string;
    autoAssignConversation?: (conversationId: string, tenantId: string) => Promise<unknown>;
    backoffBaseMs?: number;
    backoffMaxMs?: number;
    connectionBackoff?: Map<string, TelegramConnectionBackoffState>;
    conversationRepository: Pick<ConversationRepository, "findConversation" | "listConversations" | "listLifecycleEvents" | "saveConversationMutation">;
    conversationService: Pick<ConversationService, "normalizeInboundEvent">;
    fetcher?: TelegramHttpFetch;
    integrationRepository: TelegramConnectionReader;
    limit?: number;
    recordQualityRating?: (payload: {
        channel?: string;
        clientId?: string;
        conversationId?: string;
        idempotencyKey?: string;
        operator?: string;
        scale?: "CSAT" | "CSI" | "QA";
        score?: number;
        topic?: string;
    }, context: {
        actorId?: string;
        actorType?: "client";
        tenantId?: string;
    }) => Promise<BackendEnvelope<Record<string, unknown>>>;
    runBotRuntime?: (event: {
        channel: string;
        conversationId: string;
        eventId: string;
        payload?: Record<string, unknown>;
        tenantId: string;
        traceId: string;
    }) => Promise<{
        instance?: {
            status?: string;
        };
        outcome?: string;
    }>;
    offsets?: Map<string, number>;
    now?: () => Date;
    timeoutMs?: number;
}
export interface TelegramConnectionBackoffState {
    attempts: number;
    nextAttemptAt: number;
}
export interface TelegramConnectionReader {
    listChannelConnectionsAsync?(filters: {
        tenantId: string;
        type?: string;
    }): Promise<ChannelConnectionStoredRecord[]>;
    listTelegramConnections(): TelegramConnectionStoredRecord[];
    listTelegramConnectionsAsync?(): Promise<TelegramConnectionStoredRecord[]>;
    saveTelegramConnectionAsync?(connection: TelegramConnectionStoredRecord): Promise<TelegramConnectionStoredRecord>;
}
export interface TelegramPollingResult {
    accepted: number;
    duplicates: number;
    failed: number;
    polled: number;
}
export interface TelegramPollingWorkerHandle {
    stop(): void;
}
export interface TelegramPollingWorkerInput {
    intervalMs?: number;
    onError?: (error: unknown) => void;
    pollOnce: () => Promise<TelegramPollingResult>;
}
export declare function startTelegramPollingWorker(input: TelegramPollingWorkerInput): TelegramPollingWorkerHandle;
export declare function pollTelegramUpdatesOnce(input: TelegramPollingInput): Promise<TelegramPollingResult>;
