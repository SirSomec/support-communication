import { type PrismaClientFactoryOptions } from "@support-communication/database";
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
export declare function configureNotificationRepository(source?: NotificationRepositoryBootstrapSource, options?: NotificationRepositoryBootstrapOptions): NotificationRepository;
