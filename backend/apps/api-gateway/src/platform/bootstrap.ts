import {
  configureRepositoryBootstrap,
  createPrismaClient,
  resolveRepositoryStoreFile,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import { bootstrapPlatformState } from "./seed.js";
import { PlatformRepository, type PrismaPlatformClient } from "./platform.repository.js";

export interface PlatformRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PLATFORM_REPOSITORY?: string;
  PLATFORM_STORE_FILE?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface PlatformRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaPlatformClient;
}

export function configurePlatformRepository(
  source: PlatformRepositoryBootstrapSource = process.env,
  options: PlatformRepositoryBootstrapOptions = {}
): PlatformRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => PlatformRepository.open({ filePath, seed: bootstrapPlatformState() }),
    createPrismaRepository: (client) => PlatformRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "PLATFORM_REPOSITORY",
    source,
    storeFileEnv: "PLATFORM_STORE_FILE",
    suffix: "platform",
    useDefault: (configuredRepository) => PlatformRepository.useDefault(configuredRepository)
  });
}

export function resolvePlatformStoreFile(source: PlatformRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "PLATFORM_STORE_FILE",
    suffix: "platform"
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaPlatformClient {
  return createPrismaClient(options) as PrismaPlatformClient;
}
