import {
  configureRepositoryBootstrap,
  createPrismaClient,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import {
  QualityScoringRepository,
  type PrismaQualityScoringClient,
  type QualityScoringRepositoryPort
} from "./quality-scoring.repository.js";

export interface QualityScoringRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface QualityScoringRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaQualityScoringClient;
}

/**
 * Selects the quality-scoring telemetry sink with the house repository pattern: `QUALITY_SCORING_REPOSITORY`
 * (json|prisma, default json) resolved by `configureRepositoryBootstrap`, matching every other domain.
 * Under `production-like` the compose stack sets it to `prisma` so telemetry lands in Postgres.
 */
export function configureQualityScoringRepository(
  source: QualityScoringRepositoryBootstrapSource = process.env,
  options: QualityScoringRepositoryBootstrapOptions = {}
): QualityScoringRepositoryPort {
  return configureRepositoryBootstrap<QualityScoringRepositoryPort, PrismaQualityScoringClient>({
    createPrismaRepository: (client) => QualityScoringRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => QualityScoringRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaQualityScoringClient {
  return createPrismaClient(options) as PrismaQualityScoringClient;
}
