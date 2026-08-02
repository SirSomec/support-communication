import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { QualityScoringRepository } from "./quality-scoring.repository.js";
/**
 * Selects the quality-scoring telemetry sink with the house repository pattern: `QUALITY_SCORING_REPOSITORY`
 * (json|prisma, default json) resolved by `configureRepositoryBootstrap`, matching every other domain.
 * Under `production-like` the compose stack sets it to `prisma` so telemetry lands in Postgres.
 */
export function configureQualityScoringRepository(source = process.env, options = {}) {
    return configureRepositoryBootstrap({
        createPrismaRepository: (client) => QualityScoringRepository.prisma({ client }),
        prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
        source,
        useDefault: (repository) => QualityScoringRepository.useDefault(repository)
    });
}
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=quality-scoring.bootstrap.js.map