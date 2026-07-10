import { configureRepositoryBootstrap, createPrismaClient, resolveRepositoryStoreFile, type PrismaClientFactoryOptions } from "@support-communication/database";
import { NotificationRepository, type PrismaNotificationClient } from "./notification.repository.js";

export interface NotificationRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
  NOTIFICATION_REPOSITORY?: string;
  NOTIFICATION_STORE_FILE?: string;
  PORT?: number | string;
  SERVICE_NAME?: string;
}

export interface NotificationRepositoryBootstrapOptions {
  prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaNotificationClient;
}

export function configureNotificationRepository(
  source: NotificationRepositoryBootstrapSource = process.env,
  options: NotificationRepositoryBootstrapOptions = {}
): NotificationRepository {
  return configureRepositoryBootstrap({
    createJsonRepository: (filePath) => NotificationRepository.open({ filePath }),
    createPrismaRepository: (client) => NotificationRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    repositoryEnv: "NOTIFICATION_REPOSITORY",
    source,
    storeFileEnv: "NOTIFICATION_STORE_FILE",
    suffix: "notifications",
    useDefault: (repository) => NotificationRepository.useDefault(repository)
  });
}

export function resolveNotificationStoreFile(source: NotificationRepositoryBootstrapSource = process.env): string {
  return resolveRepositoryStoreFile({
    source,
    storeFileEnv: "NOTIFICATION_STORE_FILE",
    suffix: "notifications"
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaNotificationClient {
  return createPrismaClient(options) as PrismaNotificationClient;
}
