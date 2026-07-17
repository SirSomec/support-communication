import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { OperatorPresenceRepository, type PrismaOperatorPresenceClient } from "./operator-presence.repository.js";

export interface OperatorPresenceBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface OperatorPresenceBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaOperatorPresenceClient;
}

export function configureOperatorPresenceRepository(
  source: OperatorPresenceBootstrapSource = process.env,
  options: OperatorPresenceBootstrapOptions = {}
): OperatorPresenceRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => OperatorPresenceRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => OperatorPresenceRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaOperatorPresenceClient {
  return createPrismaClient(options) as PrismaOperatorPresenceClient;
}
