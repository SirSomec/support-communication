import type { RealtimeEvent } from "./conversation.repository.js";
export type RealtimeFanoutEvent = RealtimeEvent;
export interface RealtimeFanoutPublishResult {
    channel: string | null;
    reason?: string;
    status: "published" | "skipped";
    subscribers: number;
}
export interface RealtimeFanoutSubscription {
    close(): Promise<void>;
    status: "active" | "disabled";
}
export interface RealtimeFanoutAdapter {
    publish(event: RealtimeFanoutEvent): Promise<RealtimeFanoutPublishResult>;
    subscribe(handler: (event: RealtimeFanoutEvent) => void | Promise<void>): Promise<RealtimeFanoutSubscription>;
}
export interface RealtimeRedisClient {
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string, handler: (message: string, channel: string) => void): Promise<() => Promise<void>>;
}
export interface RedisRealtimeFanoutAdapterOptions {
    channel: string;
    redis: Pick<RealtimeRedisClient, "publish">;
    subscriberFactory: () => RealtimeRedisClient;
}
export interface RealtimeRedisConnectionSettings {
    db?: number;
    host: string;
    password?: string;
    port: number;
    username?: string;
}
export interface RealtimeFanoutEnvSource {
    REALTIME_REDIS_CHANNEL?: string;
    REALTIME_REDIS_FANOUT_ENABLED?: string;
    REDIS_URL?: string;
}
export interface RealtimeFanoutFactoryOptions {
    redisFactory: (settings: RealtimeRedisConnectionSettings) => RealtimeRedisClient;
}
export declare function createRedisRealtimeFanoutAdapter(options: RedisRealtimeFanoutAdapterOptions): RealtimeFanoutAdapter;
export declare function createRealtimeFanoutAdapterFromEnv(source: RealtimeFanoutEnvSource, options?: RealtimeFanoutFactoryOptions): RealtimeFanoutAdapter;
export declare function createDefaultRealtimeRedisClient(settings: RealtimeRedisConnectionSettings): RealtimeRedisClient;
export declare function createDisabledRealtimeFanoutAdapter(reason: string): RealtimeFanoutAdapter;
