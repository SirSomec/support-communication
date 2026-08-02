import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { IdentityRepository, type IdentityState, type PrismaIdentityClient } from "./identity.repository.js";
export interface IdentityRepositoryBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    SERVICE_NAME?: string;
}
export interface IdentityRepositoryBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaIdentityClient;
    seed?: IdentityState;
}
export declare function configureIdentityRepository(source?: IdentityRepositoryBootstrapSource, options?: IdentityRepositoryBootstrapOptions): IdentityRepository;
