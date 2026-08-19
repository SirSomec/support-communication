import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { CurrentShiftRepository, type PrismaCurrentShiftClient } from "./current-shift.repository.js";

export interface CurrentShiftBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface CurrentShiftBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaCurrentShiftClient;
}

export function configureCurrentShiftRepository(
  source: CurrentShiftBootstrapSource = process.env,
  options: CurrentShiftBootstrapOptions = {}
): CurrentShiftRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => CurrentShiftRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => CurrentShiftRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaCurrentShiftClient {
  return createPrismaClient(options) as PrismaCurrentShiftClient;
}
