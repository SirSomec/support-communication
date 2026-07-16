import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { WorkspaceRepository, type PrismaWorkspaceClient, type WorkspaceState } from "./workspace.repository.js";

export interface WorkspaceRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface WorkspaceRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaWorkspaceClient;
  seed?: WorkspaceState;
}

export function configureWorkspaceRepository(
  source: WorkspaceRepositoryBootstrapSource = process.env,
  options: WorkspaceRepositoryBootstrapOptions = {}
): WorkspaceRepository {
  return configureRepositoryBootstrap({
    createPrismaRepository: (client) => WorkspaceRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => WorkspaceRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaWorkspaceClient {
  return createPrismaClient(options) as PrismaWorkspaceClient;
}
