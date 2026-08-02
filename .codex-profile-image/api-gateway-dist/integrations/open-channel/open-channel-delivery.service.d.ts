import type { ConversationRepository } from "../../conversation/conversation.repository.js";
import { OpenChannelRepository, type OpenChannelDeliveryKind, type OpenChannelDeliveryRecord } from "./open-channel.repository.js";
import { type OpenChannelHostnameResolver } from "./outbound-url-policy.js";
/**
 * Delivers queued external-integration events (event webhooks, Open Channel
 * chat events, bot events) with per-kind retry budgets that match consumer
 * expectations: chat events — up to 3 attempts spaced 3–60 s, bot events —
 * 3 s timeout with 2 retries, webhooks — best effort with retries.
 */
type MaybePromise<T> = T | Promise<T>;
export interface OpenChannelDeliveryFetch {
    (url: string, init: {
        body: string;
        headers: Record<string, string>;
        method: "POST";
        redirect: "manual";
        signal?: AbortSignal;
    }): Promise<{
        ok: boolean;
        status: number;
        text(): Promise<string>;
    }>;
}
export interface OpenChannelDeliveryServiceOptions {
    conversationRepository?: Pick<ConversationRepository, "findConversation" | "saveConversationMutation" | "listConversations">;
    fetcher?: OpenChannelDeliveryFetch;
    repository?: OpenChannelRepository;
    resolveHostname?: OpenChannelHostnameResolver;
    timeoutMsByKind?: Partial<Record<OpenChannelDeliveryKind, number>>;
}
export interface OpenChannelDeliveryRunResult {
    claimed: number;
    deadLettered: number;
    delivered: number;
    retryScheduled: number;
}
export declare const OPEN_CHANNEL_DELIVERY_DEFAULTS: Record<OpenChannelDeliveryKind, {
    maxAttempts: number;
    retryBackoffMs: number;
    timeoutMs: number;
}>;
export declare class OpenChannelDeliveryService {
    private readonly conversationRepository?;
    private readonly fetcher;
    private readonly repository;
    private readonly resolveHostname?;
    private readonly timeoutMsByKind;
    private timer;
    constructor(options?: OpenChannelDeliveryServiceOptions);
    enqueue(input: {
        body: Record<string, unknown>;
        conversationId?: string;
        eventName: string;
        kind: OpenChannelDeliveryKind;
        tenantId: string;
        url: string;
    }): MaybePromise<OpenChannelDeliveryRecord>;
    start(intervalMs?: number): void;
    stop(): void;
    runOnce(now?: string): Promise<OpenChannelDeliveryRunResult>;
    private attempt;
    /**
     * The webhook consumer may enrich the dialog in the HTTP response:
     * `chat_accepted`/`chat_updated` may return contact_info, custom_data and
     * crm_link that are shown to the agent as if the visitor entered them.
     */
    private applyDeliveryResponse;
}
export {};
