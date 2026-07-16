import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { RoutingRepository, type PrismaRoutingClient, type RoutingState } from "./routing.repository.js";

export interface RoutingRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface RoutingRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaRoutingClient;
  seed?: Partial<RoutingState>;
}

export function configureRoutingRepository(
  source: RoutingRepositoryBootstrapSource = process.env,
  options: RoutingRepositoryBootstrapOptions = {}
): RoutingRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => RoutingRepository.prisma({
      client,
      fallback: RoutingRepository.inMemory(options.seed)
    }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => RoutingRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaRoutingClient {
  return createPrismaClient(options) as PrismaRoutingClient;
}
