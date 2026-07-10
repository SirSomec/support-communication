import {
  configureRepositoryBootstrap,
  createPrismaClient,
  resolveRepositoryStoreFile,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import { IntegrationRepository, type PrismaIntegrationClient } from "./integration.repository.js";
import { bootstrapIntegrationState } from "./seed.js";

export interface IntegrationRepositoryBootstrapSource {
  DATABASE_URL?: string;
  INTEGRATION_REPOSITORY?: string;
  INTEGRATION_STORE_FILE?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface IntegrationRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaIntegrationClient;
}

export function configureIntegrationRepository(
  source: IntegrationRepositoryBootstrapSource = process.env,
  options: IntegrationRepositoryBootstrapOptions = {}
): IntegrationRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => {
      const seed = bootstrapIntegrationState();
      const repository = IntegrationRepository.open({ filePath, seed });
      ensureMissingSeedChannelConnections(repository, seed.channelConnections);
      return repository;
    },
    createPrismaRepository: (client) => IntegrationRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "INTEGRATION_REPOSITORY",
    source,
    storeFileEnv: "INTEGRATION_STORE_FILE",
    suffix: "integrations",
    useDefault: (repository) => IntegrationRepository.useDefault(repository)
  });
}

export function resolveIntegrationStoreFile(source: IntegrationRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "INTEGRATION_STORE_FILE",
    suffix: "integrations"
  });
}

function ensureMissingSeedChannelConnections(
  repository: IntegrationRepository,
  seedConnections: ReturnType<typeof bootstrapIntegrationState>["channelConnections"]
): void {
  for (const connection of seedConnections) {
    if (!repository.findChannelConnection(connection.tenantId, connection.id)) {
      repository.saveChannelConnection(connection);
    }
  }
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaIntegrationClient {
  return createPrismaClient(options) as PrismaIntegrationClient;
}
