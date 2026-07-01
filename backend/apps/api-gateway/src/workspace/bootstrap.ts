import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryKind, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { WorkspaceRepository, type PrismaWorkspaceClient } from "./workspace.repository.js";

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
}

export function configureWorkspaceRepository(
  source: WorkspaceRepositoryBootstrapSource = process.env,
  options: WorkspaceRepositoryBootstrapOptions = {}
): WorkspaceRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => WorkspaceRepository.open({ filePath }),
    createPrismaRepository: (client, createFallback) => WorkspaceRepository.prisma({ client, fallback: createFallback() }),
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

function resolveWorkspaceRepositoryKind(source: WorkspaceRepositoryBootstrapSource): "json" | "prisma" {
  return resolveRepositoryKind(source, "WORKSPACE_REPOSITORY");
}

export function resolveWorkspaceStoreFile(source: WorkspaceRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "WORKSPACE_STORE_FILE",
    suffix: "workspace"
  });
}
