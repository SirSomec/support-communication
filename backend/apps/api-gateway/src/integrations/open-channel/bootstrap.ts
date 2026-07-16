import {
  configureRepositoryBootstrap,
  createPrismaClient,
  type PrismaClientFactoryOptions
} from "@support-communication/database";
import { OpenChannelRepository, type PrismaOpenChannelClient } from "./open-channel.repository.js";

export interface OpenChannelRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
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
    createPrismaRepository: (client) => OpenChannelRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => OpenChannelRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaOpenChannelClient {
  return createPrismaClient(options) as PrismaOpenChannelClient;
}
