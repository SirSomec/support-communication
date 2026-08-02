import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { ConversationRepository } from "./conversation.repository.js";
import { ConversationService } from "./conversation.service.js";
import { createRealtimeFanoutAdapterFromEnv } from "./realtime.fanout.js";
export function configureConversationRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => ConversationRepository.prisma({ client }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => ConversationRepository.useDefault(repository)
    });
}
export function configureConversationRealtimeFanout(source = process.env, options = {}) {
    const factoryOptions = options.redisFactory
        ? { redisFactory: options.redisFactory }
        : undefined;
    const adapter = createRealtimeFanoutAdapterFromEnv(source, factoryOptions);
    ConversationService.useDefaultRealtimeFanout(adapter);
    return adapter;
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map