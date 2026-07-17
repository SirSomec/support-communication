import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { IdentityRepository, type IdentityState, type PrismaIdentityClient } from "./identity.repository.js";
import { TeamDirectoryRepository } from "./team-directory.repository.js";
import { SettingsRulesRepository } from "./settings-rules.repository.js";

export interface IdentityRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface IdentityRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaIdentityClient;
  seed?: IdentityState;
}

export function configureIdentityRepository(
  source: IdentityRepositoryBootstrapSource = process.env,
  options: IdentityRepositoryBootstrapOptions = {}
): IdentityRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => {
      TeamDirectoryRepository.useDefault(TeamDirectoryRepository.prisma(client as never));
      SettingsRulesRepository.useDefault(SettingsRulesRepository.prisma(client as never));
      return IdentityRepository.prisma({ client });
    },
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => IdentityRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaIdentityClient {
  return createPrismaClient(options) as PrismaIdentityClient;
}
