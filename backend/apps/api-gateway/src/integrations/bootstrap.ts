import {
  configureRepositoryBootstrap,
  createPrismaClient,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import { IntegrationRepository, type IntegrationState, type PrismaIntegrationClient } from "./integration.repository.js";

export interface IntegrationRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface IntegrationRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaIntegrationClient;
  seed?: IntegrationState;
}

export function configureIntegrationRepository(
  source: IntegrationRepositoryBootstrapSource = process.env,
  options: IntegrationRepositoryBootstrapOptions = {}
): IntegrationRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => IntegrationRepository.prisma({ client, ...(options.seed ? { seed: options.seed } : {}) }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => IntegrationRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaIntegrationClient {
  return createPrismaClient(options) as PrismaIntegrationClient;
}
