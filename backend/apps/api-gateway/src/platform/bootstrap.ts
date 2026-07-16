import {
  configureRepositoryBootstrap,
  createPrismaClient,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import { PlatformRepository, type PlatformState, type PrismaPlatformClient } from "./platform.repository.js";

export interface PlatformRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface PlatformRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaPlatformClient;
  seed?: PlatformState;
}

export function configurePlatformRepository(
  source: PlatformRepositoryBootstrapSource = process.env,
  options: PlatformRepositoryBootstrapOptions = {}
): PlatformRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => PlatformRepository.prisma({ client, seed: options.seed }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (configuredRepository) => PlatformRepository.useDefault(configuredRepository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaPlatformClient {
  return createPrismaClient(options) as PrismaPlatformClient;
}
