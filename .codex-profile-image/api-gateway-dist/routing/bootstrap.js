import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { RoutingRepository } from "./routing.repository.js";
export function configureRoutingRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => RoutingRepository.prisma({
            client,
            fallback: RoutingRepository.inMemory(options.seed)
        }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => RoutingRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map