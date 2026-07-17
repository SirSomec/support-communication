import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { WorkspaceRepository, type PrismaWorkspaceClient, type WorkspaceState } from "./workspace.repository.js";
import { TopicDirectoryRepository, type PrismaTopicDirectoryClient } from "./topic-directory.repository.js";

export interface WorkspaceRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface WorkspaceRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaWorkspaceClient;
  seed?: WorkspaceState;
  topicPrismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaTopicDirectoryClient;
}

export function configureWorkspaceRepository(
  source: WorkspaceRepositoryBootstrapSource = process.env,
  options: WorkspaceRepositoryBootstrapOptions = {}
): WorkspaceRepository {
  const repository = configureRepositoryBootstrap({
    createPrismaRepository: (client) => WorkspaceRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => WorkspaceRepository.useDefault(repository)
  });
  const topicClientFactory = options.topicPrismaClientFactory ?? defaultTopicPrismaClientFactory;
  TopicDirectoryRepository.useDefault(TopicDirectoryRepository.prisma(topicClientFactory({
    datasourceUrl: source.DATABASE_URL
  })));
  return repository;
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaWorkspaceClient {
  return createPrismaClient(options) as PrismaWorkspaceClient;
}

function defaultTopicPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaTopicDirectoryClient {
  return createPrismaClient(options) as PrismaTopicDirectoryClient;
}
