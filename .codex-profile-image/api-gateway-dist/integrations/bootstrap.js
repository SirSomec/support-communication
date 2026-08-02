import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { IntegrationRepository } from "./integration.repository.js";
export function configureIntegrationRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => IntegrationRepository.prisma({ client, ...(options.seed ? { seed: options.seed } : {}) }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => IntegrationRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map