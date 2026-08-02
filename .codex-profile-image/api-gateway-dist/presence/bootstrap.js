import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { OperatorPresenceRepository } from "./operator-presence.repository.js";
export function configureOperatorPresenceRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => OperatorPresenceRepository.prisma({ client }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => OperatorPresenceRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map