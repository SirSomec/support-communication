import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { QualityRepository } from "./quality.repository.js";
export function configureQualityRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => QualityRepository.prisma({
            client,
            fallback: QualityRepository.inMemory(options.seed)
        }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => QualityRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map