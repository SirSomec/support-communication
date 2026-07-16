import { configureRepositoryBootstrap, createPrismaClient, type PrismaClientFactoryOptions } from "@support-communication/database";
import { NotificationRepository, type PrismaNotificationClient } from "./notification.repository.js";

export interface NotificationRepositoryBootstrapSource {
  DATABASE_URL?: string;
  NODE_ENV?: string;
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
    createPrismaRepository: (client) => NotificationRepository.prisma({ client }),
    prismaClientFactory: options.prismaClientFactory ?? defaultPrismaClientFactory,
    source,
    useDefault: (repository) => NotificationRepository.useDefault(repository)
  });
}

function defaultPrismaClientFactory(options: PrismaClientFactoryOptions): PrismaNotificationClient {
  return createPrismaClient(options) as PrismaNotificationClient;
}
