import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { PlatformRepository } from "./platform.repository.js";
export function configurePlatformRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => PlatformRepository.prisma({ client, seed: options.seed }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (configuredRepository) => PlatformRepository.useDefault(configuredRepository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map