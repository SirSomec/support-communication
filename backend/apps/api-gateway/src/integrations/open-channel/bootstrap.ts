import {
  configureRepositoryBootstrap,
  createPrismaClient,
  resolveRepositoryStoreFile,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import { OpenChannelRepository, type PrismaOpenChannelClient } from "./open-channel.repository.js";

export interface OpenChannelRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  OPEN_CHANNEL_REPOSITORY?: string;
  OPEN_CHANNEL_STORE_FILE?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface OpenChannelRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaOpenChannelClient;
}

export function configureOpenChannelRepository(
  source: OpenChannelRepositoryBootstrapSource = process.env,
  options: OpenChannelRepositoryBootstrapOptions = {}
): OpenChannelRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => OpenChannelRepository.open(filePath),
    createPrismaRepository: (client) => OpenChannelRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "OPEN_CHANNEL_REPOSITORY",
    source,
    storeFileEnv: "OPEN_CHANNEL_STORE_FILE",
    suffix: "open-channel",
    useDefault: (repository) => OpenChannelRepository.useDefault(repository)
  });
}

export function resolveOpenChannelStoreFile(source: OpenChannelRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "OPEN_CHANNEL_STORE_FILE",
    suffix: "open-channel"
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaOpenChannelClient {
  return createPrismaClient(options) as PrismaOpenChannelClient;
}
