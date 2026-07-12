import {
  configureRepositoryBootstrap,
  createPrismaClient,
  resolveRepositoryStoreFile,
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
  QUALITY_REPOSITORY?: string;
  QUALITY_STORE_FILE?: string;
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
    createJsonRepository: (filePath) => QualityRepository.open({ filePath, seed: options.seed }),
    createPrismaRepository: (client) => QualityRepository.prisma({
      client,
      fallback: QualityRepository.inMemory(options.seed)
    }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "QUALITY_REPOSITORY",
    source,
    storeFileEnv: "QUALITY_STORE_FILE",
    suffix: "quality",
    useDefault: (repository) => QualityRepository.useDefault(repository)
  });
}

export function resolveQualityStoreFile(source: QualityRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "QUALITY_STORE_FILE",
    suffix: "quality"
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaQualityClient {
  return createPrismaClient(options) as PrismaQualityClient;
}
