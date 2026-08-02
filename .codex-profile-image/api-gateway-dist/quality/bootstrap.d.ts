import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { type PrismaQualityClient, type QualityRepositoryPort, type QualityState } from "./quality.repository.js";
export interface QualityRepositoryBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    SERVICE_NAME?: string;
}
export interface QualityRepositoryBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaQualityClient;
    seed?: Partial<QualityState>;
}
export declare function configureQualityRepository(source?: QualityRepositoryBootstrapSource, options?: QualityRepositoryBootstrapOptions): QualityRepositoryPort;
