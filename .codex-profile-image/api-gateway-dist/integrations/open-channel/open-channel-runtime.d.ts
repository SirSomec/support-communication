/**
 * Background loops of the external integration layer: the delivery queue
 * (event webhooks / Open Channel chat / bot events with retries) and the
 * realtime-event pump that converts platform events into outbound
 * notifications. Disabled with OPEN_CHANNEL_DISABLED=true.
 */
export declare function startOpenChannelRuntime(env?: Record<string, string | undefined>): {
    stop(): void;
} | null;
