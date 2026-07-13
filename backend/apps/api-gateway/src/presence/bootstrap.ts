import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { OperatorPresenceRepository, type OperatorPresenceState, type PrismaOperatorPresenceClient } from "./operator-presence.repository.js";

export interface OperatorPresenceBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  PRESENCE_REPOSITORY?: string;
  PRESENCE_STORE_FILE?: string;
  SERVICE_NAME?: string;
}

export interface OperatorPresenceBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaOperatorPresenceClient;
  seed?: Partial<OperatorPresenceState>;
}

export function configureOperatorPresenceRepository(
  source: OperatorPresenceBootstrapSource = process.env,
  options: OperatorPresenceBootstrapOptions = {}
): OperatorPresenceRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => OperatorPresenceRepository.open({ filePath, seed: options.seed }),
    createPrismaRepository: (client) => OperatorPresenceRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "PRESENCE_REPOSITORY",
    source,
    storeFileEnv: "PRESENCE_STORE_FILE",
    suffix: "presence",
    useDefault: (repository) => OperatorPresenceRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaOperatorPresenceClient {
  return createPrismaClient(options) as PrismaOperatorPresenceClient;
}

export function resolveOperatorPresenceStoreFile(source: OperatorPresenceBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "PRESENCE_STORE_FILE",
    suffix: "presence"
  });
}
