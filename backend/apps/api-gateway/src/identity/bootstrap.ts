import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryKind, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { IdentityRepository, type PrismaIdentityClient } from "./identity.repository.js";

export interface IdentityRepositoryBootstrapSource {
  DATABASE_URL?: string;
  IDENTITY_REPOSITORY?: string;
  IDENTITY_STORE_FILE?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface IdentityRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaIdentityClient;
}

export function configureIdentityRepository(
  source: IdentityRepositoryBootstrapSource = process.env,
  options: IdentityRepositoryBootstrapOptions = {}
): IdentityRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => IdentityRepository.open({ filePath }),
    createPrismaRepository: (client) => IdentityRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "IDENTITY_REPOSITORY",
    source,
    storeFileEnv: "IDENTITY_STORE_FILE",
    suffix: "identity",
    useDefault: (repository) => IdentityRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaIdentityClient {
  return createPrismaClient(options) as PrismaIdentityClient;
}

function resolveIdentityRepositoryKind(source: IdentityRepositoryBootstrapSource): "json" | "prisma" {
  return resolveRepositoryKind(source, "IDENTITY_REPOSITORY");
}

export function resolveIdentityStoreFile(source: IdentityRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "IDENTITY_STORE_FILE",
    suffix: "identity"
  });
}
