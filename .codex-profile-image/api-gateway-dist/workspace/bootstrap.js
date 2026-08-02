import { configureRepositoryBootstrap, createPrismaClient } from "@support-communication/database";
import { WorkspaceRepository } from "./workspace.repository.js";
import { TopicDirectoryRepository } from "./topic-directory.repository.js";
export function configureWorkspaceRepository(source = process.env, options = {}) {
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
function defaultPrismaClientFactory(options) {
    return createPrismaClient(options);
}
function defaultTopicPrismaClientFactory(options) {
    return createPrismaClient(options);
}
//# sourceMappingURL=bootstrap.js.map