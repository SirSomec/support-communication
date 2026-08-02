import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { ConversationRepository, type ConversationState, type PrismaConversationClient } from "./conversation.repository.js";
import { type RealtimeFanoutAdapter, type RealtimeRedisClient, type RealtimeRedisConnectionSettings } from "./realtime.fanout.js";
export interface ConversationRepositoryBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    REALTIME_REDIS_CHANNEL?: string;
    REALTIME_REDIS_FANOUT_ENABLED?: string;
    REDIS_URL?: string;
    SERVICE_NAME?: string;
}
export interface ConversationRepositoryBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaConversationClient;
    seed?: ConversationState;
}
export interface ConversationRealtimeFanoutBootstrapOptions {
    redisFactory?: (settings: RealtimeRedisConnectionSettings) => RealtimeRedisClient;
}
export declare function configureConversationRepository(source?: ConversationRepositoryBootstrapSource, options?: ConversationRepositoryBootstrapOptions): ConversationRepository;
export declare function configureConversationRealtimeFanout(source?: ConversationRepositoryBootstrapSource, options?: ConversationRealtimeFanoutBootstrapOptions): RealtimeFanoutAdapter;
