import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { ReportRepository } from "./report.repository.js";
export function configureReportRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => ReportRepository.prisma({ client }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => ReportRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map