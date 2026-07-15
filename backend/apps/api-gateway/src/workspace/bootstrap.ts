import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { WorkspaceRepository, type PrismaWorkspaceClient, type WorkspaceState } from "./workspace.repository.js";

export interface WorkspaceRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
  WORKSPACE_REPOSITORY?: string;
  WORKSPACE_STORE_FILE?: string;
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
    createJsonRepository: (filePath) => WorkspaceRepository.open({ filePath, seed: options.seed }),
    createPrismaRepository: (client) => WorkspaceRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "WORKSPACE_REPOSITORY",
    source,
    storeFileEnv: "WORKSPACE_STORE_FILE",
    suffix: "workspace",
    useDefault: (repository) => WorkspaceRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaWorkspaceClient {
  return createPrismaClient(options) as PrismaWorkspaceClient;
}

export function resolveWorkspaceStoreFile(source: WorkspaceRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "WORKSPACE_STORE_FILE",
    suffix: "workspace"
  });
}
