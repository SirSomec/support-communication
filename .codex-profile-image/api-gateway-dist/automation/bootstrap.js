import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { AutomationRepository } from "./automation.repository.js";
import { ProactiveExposureRepository } from "./proactive-exposure.repository.js";
export function configureAutomationRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => {
            ProactiveExposureRepository.useDefault(ProactiveExposureRepository.prisma(client));
            return AutomationRepository.prisma({ client });
        },
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => AutomationRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map