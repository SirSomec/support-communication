import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { WorkspaceRepository, type PrismaWorkspaceClient, type WorkspaceState } from "./workspace.repository.js";
import { type PrismaTopicDirectoryClient } from "./topic-directory.repository.js";
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
export declare function configureWorkspaceRepository(source?: WorkspaceRepositoryBootstrapSource, options?: WorkspaceRepositoryBootstrapOptions): WorkspaceRepository;
