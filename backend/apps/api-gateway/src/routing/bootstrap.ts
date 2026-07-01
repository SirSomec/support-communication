import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryKind, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { RoutingRepository, type PrismaRoutingClient } from "./routing.repository.js";

export interface RoutingRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  ROUTING_REPOSITORY?: string;
  ROUTING_STORE_FILE?: string;
  SERVICE_NAME?: string;
}

export interface RoutingRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaRoutingClient;
}

export function configureRoutingRepository(
  source: RoutingRepositoryBootstrapSource = process.env,
  options: RoutingRepositoryBootstrapOptions = {}
): RoutingRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => RoutingRepository.open({ filePath }),
    createPrismaRepository: (client, createFallback) => RoutingRepository.prisma({ client, fallback: createFallback() }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "ROUTING_REPOSITORY",
    source,
    storeFileEnv: "ROUTING_STORE_FILE",
    suffix: "routing",
    useDefault: (repository) => RoutingRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaRoutingClient {
  return createPrismaClient(options) as PrismaRoutingClient;
}

export function resolveRoutingStoreFile(source: RoutingRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "ROUTING_STORE_FILE",
    suffix: "routing"
  });
}
