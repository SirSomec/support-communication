import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { IntegrationRepository, type IntegrationState, type PrismaIntegrationClient } from "./integration.repository.js";
export interface IntegrationRepositoryBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    SERVICE_NAME?: string;
}
export interface IntegrationRepositoryBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaIntegrationClient;
    seed?: IntegrationState;
}
export declare function configureIntegrationRepository(source?: IntegrationRepositoryBootstrapSource, options?: IntegrationRepositoryBootstrapOptions): IntegrationRepository;
