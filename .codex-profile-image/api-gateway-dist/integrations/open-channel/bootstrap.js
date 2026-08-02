import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { OpenChannelRepository } from "./open-channel.repository.js";
export function configureOpenChannelRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => OpenChannelRepository.prisma({ client }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => OpenChannelRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map