import {
  configureRepositoryBootstrap,
  createPrismaClient,
  resolveRepositoryStoreFile,
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
  QUALITY_SCORING_REPOSITORY?: string;
  QUALITY_SCORING_STORE_FILE?: string;
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
    createJsonRepository: (filePath) => QualityScoringRepository.open({ filePath }),
    createPrismaRepository: (client) => QualityScoringRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "QUALITY_SCORING_REPOSITORY",
    source,
    storeFileEnv: "QUALITY_SCORING_STORE_FILE",
    suffix: "quality-scoring",
    useDefault: (repository) => QualityScoringRepository.useDefault(repository)
  });
}

export function resolveQualityScoringStoreFile(
  source: QualityScoringRepositoryBootstrapSource = process.env
): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "QUALITY_SCORING_STORE_FILE",
    suffix: "quality-scoring"
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaQualityScoringClient {
  return createPrismaClient(options) as PrismaQualityScoringClient;
}
