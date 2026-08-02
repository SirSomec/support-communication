import { type PrismaClientFactoryOptions } from "@support-communication/database";
import { RoutingRepository, type PrismaRoutingClient, type RoutingState } from "./routing.repository.js";
export interface RoutingRepositoryBootstrapSource {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    PORT?: number | string;
    SERVICE_NAME?: string;
}
export interface RoutingRepositoryBootstrapOptions {
    prismaClientFactory?: (options: PrismaClientFactoryOptions) => PrismaRoutingClient;
    seed?: Partial<RoutingState>;
}
export declare function configureRoutingRepository(source?: RoutingRepositoryBootstrapSource, options?: RoutingRepositoryBootstrapOptions): RoutingRepository;
