import {
  configureRepositoryBootstrap,
  createPrismaClient,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import {
  QualityRepository,
  type PrismaQualityClient,
  type QualityRepositoryPort,
  type QualityState
} from "./quality.repository.js";

export interface QualityRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface QualityRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaQualityClient;
  seed?: Partial<QualityState>;
}

export function configureQualityRepository(
  source: QualityRepositoryBootstrapSource = process.env,
  options: QualityRepositoryBootstrapOptions = {}
): QualityRepositoryPort {
  return configureRepositoryBootstrap<QualityRepositoryPort, PrismaQualityClient>({
    createPrismaRepository: (client) => QualityRepository.prisma({
      client,
      fallback: QualityRepository.inMemory(options.seed)
    }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => QualityRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaQualityClient {
  return createPrismaClient(options) as PrismaQualityClient;
}
