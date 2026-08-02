import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { PlatformRepository, type PlatformState, type PrismaPlatformClient } from "./platform.repository.js";
export interface PlatformRepositoryBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    SERVICE_NAME?: string;
}
export interface PlatformRepositoryBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaPlatformClient;
    seed?: PlatformState;
}
export declare function configurePlatformRepository(source?: PlatformRepositoryBootstrapSource, options?: PlatformRepositoryBootstrapOptions): PlatformRepository;
