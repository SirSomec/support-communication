import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { ConversationRepository, type ConversationState, type PrismaConversationClient } from "./conversation.repository.js";
import { ConversationService } from "./conversation.service.js";
import {
  createRealtimeFanoutAdapterFromEnv,
  type RealtimeFanoutAdapter,
  type RealtimeFanoutFactoryOptions,
  type RealtimeRedisClient,
  type RealtimeRedisConnectionSettings
} from "./realtime.fanout.js";

export interface ConversationRepositoryBootstrapSource {
  DATABASE_URL?: string;
  CONVERSATION_REPOSITORY?: string;
  CONVERSATION_STORE_FILE?: string;
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

export function configureConversationRepository(
  source: ConversationRepositoryBootstrapSource = process.env,
  options: ConversationRepositoryBootstrapOptions = {}
): ConversationRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => ConversationRepository.open({ filePath, seed: options.seed }),
    createPrismaRepository: (client) => ConversationRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "CONVERSATION_REPOSITORY",
    source,
    storeFileEnv: "CONVERSATION_STORE_FILE",
    suffix: "conversation",
    useDefault: (repository) => ConversationRepository.useDefault(repository)
  });
}

export function configureConversationRealtimeFanout(
  source: ConversationRepositoryBootstrapSource = process.env,
  options: ConversationRealtimeFanoutBootstrapOptions = {}
): RealtimeFanoutAdapter {
  const factoryOptions: RealtimeFanoutFactoryOptions | undefined = options.redisFactory
    ? { redisFactory: options.redisFactory }
    : undefined;
  const adapter = createRealtimeFanoutAdapterFromEnv(source, factoryOptions);
  ConversationService.useDefaultRealtimeFanout(adapter);
  return adapter;
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaConversationClient {
  return createPrismaClient(options) as PrismaConversationClient;
}

export function resolveConversationStoreFile(source: ConversationRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "CONVERSATION_STORE_FILE",
    suffix: "conversation"
  });
}
